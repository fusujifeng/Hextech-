//! LCU（League Client Update）连接管理：凭证发现、阶段轮询、选人会话解析。
//!
//! 设计要点：
//! - 凭证发现三路兜底：进程命令行 → lockfile → 客户端日志（国服 WeGame 常态）。
//! - 端口 / token 每次客户端重启都会轮换，因此连接失败时丢弃凭证并重新发现。
//! - 每 500ms 拉一次 gameflow-phase，只在选人阶段才去读 champ-select 会话。

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use league_link::{build_lcu_client, lcu_get, Credentials};
use serde::Serialize;
use serde_json::Value;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter};

use crate::data;

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const RESCAN_INTERVAL: Duration = Duration::from_secs(2);
const EVENT_NAME: &str = "lcu-state";

/// 暴露给前端的完整状态快照。
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct State {
    pub connected: bool,
    /// 凭证来源，便于状态栏展示（进程扫描 / lockfile / 日志解析）
    pub source: String,
    pub phase: String,
    pub queue_id: Option<i64>,
    pub queue_type: String,
    /// "mayhem" | "aram" | "other" | "idle"
    pub mode: String,
    pub champion_id: Option<i32>,
    pub champion_name: Option<String>,
    pub champion_alias: Option<String>,
    pub bench_enabled: bool,
    pub bench_count: usize,
    pub updated_at: u64,
    pub error: Option<String>,
}

impl State {
    fn fingerprint(&self) -> String {
        format!(
            "{}|{}|{:?}|{}|{}|{:?}|{:?}|{}|{}|{:?}",
            self.connected,
            self.phase,
            self.queue_id,
            self.queue_type,
            self.mode,
            self.champion_id,
            self.champion_name,
            self.bench_enabled,
            self.bench_count,
            self.error,
        )
    }
}

pub struct Runtime {
    client: Option<reqwest::Client>,
    creds: Option<Credentials>,
    source: String,
    pub state: State,
    last_scan: Instant,
}

impl Runtime {
    pub fn new() -> Self {
        Self {
            client: None,
            creds: None,
            source: String::new(),
            state: offline("正在查找英雄联盟客户端…"),
            last_scan: Instant::now() - RESCAN_INTERVAL * 2,
        }
    }

    pub fn snapshot(&self) -> State {
        self.state.clone()
    }
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn offline(msg: &str) -> State {
    State {
        connected: false,
        mode: "idle".into(),
        phase: "None".into(),
        error: Some(msg.to_string()),
        updated_at: now_ms(),
        ..State::default()
    }
}

// ── 凭证发现 ─────────────────────────────────────────────────────────

/// 三路兜底：进程扫描 → lockfile → 客户端日志。
fn discover() -> Option<(Credentials, &'static str)> {
    // 1. 进程命令行（最可靠）
    if let Some(creds) = league_link::try_find_lcu() {
        return Some((creds, "进程扫描"));
    }

    // 2/3. 进程还在、但命令行读不到（提权 / 受保护），用安装目录兜底
    let dirs = install_dirs();
    for dir in &dirs {
        let lockfile = dir.join("lockfile");
        if lockfile.is_file() {
            if let Ok(creds) = league_link::try_find_lcu_via_lockfile(&lockfile) {
                if !creds.password.is_empty() {
                    return Some((creds, "lockfile"));
                }
            }
        }
    }
    for dir in &dirs {
        for logs in log_dirs(dir) {
            if logs.is_dir() {
                if let Ok(creds) = league_link::try_find_lcu_via_logs(&logs) {
                    return Some((creds, "日志解析"));
                }
            }
        }
    }
    None
}

/// 从运行中的 LeagueClientUx 进程路径推断安装目录，另外补几个常见安装位置。
fn install_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::everything());
    for process in sys.processes().values() {
        let name = process.name().to_string_lossy();
        if !name.contains("LeagueClient") {
            continue;
        }
        if let Some(exe) = process.exe().and_then(|p| p.parent()) {
            push_unique(&mut dirs, exe.to_path_buf());
            // 国服：<install>\Game\LeagueClient\...
            if let Some(grand) = exe.parent() {
                push_unique(&mut dirs, grand.to_path_buf());
            }
        }
    }

    for root in [
        r"C:\Riot Games\League of Legends",
        r"D:\Riot Games\League of Legends",
        r"E:\Riot Games\League of Legends",
        r"C:\Program Files\Tencent\League of Legends",
        r"D:\Program Files\Tencent\League of Legends",
        r"C:\WeGameApps\英雄联盟",
        r"D:\WeGameApps\英雄联盟",
    ] {
        let p = PathBuf::from(root);
        if p.is_dir() {
            push_unique(&mut dirs, p.clone());
            // 国服安装目录通常多一层 Game
            let game = p.join("Game");
            if game.is_dir() {
                push_unique(&mut dirs, game);
            }
        }
    }

    dirs
}

fn push_unique(list: &mut Vec<PathBuf>, p: PathBuf) {
    if !list.iter().any(|x| x == &p) {
        list.push(p);
    }
}

fn log_dirs(install: &std::path::Path) -> Vec<PathBuf> {
    vec![
        install.join("Logs").join("LeagueClient Logs"),
        install.join("Game").join("Logs").join("LeagueClient Logs"),
        install.join("LeagueClient Logs"),
    ]
}

// ── 轮询主循环 ───────────────────────────────────────────────────────

pub async fn run(app: AppHandle, rt: Arc<Mutex<Runtime>>) {
    loop {
        ensure_credentials(&rt).await;

        let (client, creds) = {
            let g = rt.lock().unwrap();
            (g.client.clone(), g.creds.clone())
        };

        let next = match (client, creds) {
            (Some(client), Some(creds)) => match probe(&client, &creds).await {
                Ok(state) => {
                    let source = {
                        let g = rt.lock().unwrap();
                        g.source.clone()
                    };
                    state.with_source(&source)
                }
                Err(_) => {
                    // 端口 / token 过期或客户端已退出：丢弃凭证，下一轮重新发现
                    let mut g = rt.lock().unwrap();
                    g.creds = None;
                    g.client = None;
                    offline("客户端连接中断，正在重新连接…")
                }
            },
            _ => offline("等待英雄联盟客户端启动…"),
        };

        let changed = {
            let mut g = rt.lock().unwrap();
            let changed = g.state.fingerprint() != next.fingerprint();
            g.state = next.clone();
            changed
        };
        if changed {
            let _ = app.emit(EVENT_NAME, &next);
        }

        tokio::time::sleep(POLL_INTERVAL).await;
    }
}

impl State {
    fn with_source(mut self, source: &str) -> State {
        self.source = source.to_string();
        self
    }
}

async fn ensure_credentials(rt: &Arc<Mutex<Runtime>>) {
    let should_scan = {
        let g = rt.lock().unwrap();
        g.creds.is_none() && g.last_scan.elapsed() >= RESCAN_INTERVAL
    };
    if !should_scan {
        return;
    }

    let found = tokio::task::spawn_blocking(discover).await.ok().flatten();
    let mut g = rt.lock().unwrap();
    g.last_scan = Instant::now();
    if let Some((creds, source)) = found {
        match build_lcu_client() {
            Ok(client) => {
                g.source = source.to_string();
                g.creds = Some(creds);
                g.client = Some(client);
            }
            Err(_) => {
                g.state = offline("无法初始化本地 HTTPS 客户端");
            }
        }
    }
}

// ── 单次探测 ─────────────────────────────────────────────────────────

async fn probe(client: &reqwest::Client, creds: &Credentials) -> Result<State, String> {
    let phase: String = lcu_get(client, creds, "/lol-gameflow/v1/gameflow-phase")
        .await
        .map_err(|e| e.to_string())?;

    let mut state = State {
        connected: true,
        phase: phase.clone(),
        updated_at: now_ms(),
        ..State::default()
    };

    if phase == "ChampSelect" {
        if let Ok(flow) = lcu_get::<Value>(client, creds, "/lol-gameflow/v1/session").await {
            state.queue_id = flow.pointer("/gameData/queue/id").and_then(Value::as_i64);
            state.queue_type = flow
                .pointer("/gameData/queue/type")
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string();
        }

        if let Ok(session) = lcu_get::<Value>(client, creds, "/lol-champ-select/v1/session").await {
            state.bench_enabled = session
                .get("benchEnabled")
                .and_then(Value::as_bool)
                .unwrap_or(false);
            state.bench_count = session
                .get("benchChampionIds")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0);

            if let Some(cell) = session.get("localPlayerCellId").and_then(Value::as_i64) {
                if let Some(team) = session.get("myTeam").and_then(Value::as_array) {
                    if let Some(me) = team
                        .iter()
                        .find(|m| m.get("cellId").and_then(Value::as_i64) == Some(cell))
                    {
                        let champion_id = me.get("championId").and_then(Value::as_i64).unwrap_or(0);
                        if champion_id > 0 {
                            state.champion_id = Some(champion_id as i32);
                            state.champion_name = data::champion_name(champion_id as i32);
                        }
                    }
                }
            }
        }

        state.mode = classify(state.queue_id, &state.queue_type).to_string();
    } else {
        state.mode = "idle".into();
    }

    Ok(state)
}

/// 以 queue_id 为准，queue_type / 本地化名称作为兜底信号。
fn classify(queue_id: Option<i64>, queue_type: &str) -> &'static str {
    match queue_id {
        Some(2400) => return "mayhem",
        Some(450) => return "aram",
        _ => {}
    }

    let t = queue_type.to_ascii_uppercase();
    if t.contains("MAYHEM") || queue_type.contains("海克斯") {
        "mayhem"
    } else if t.contains("ARAM") || queue_type.contains("大乱斗") {
        "aram"
    } else {
        "other"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_mayhem_first() {
        assert_eq!(classify(Some(2400), ""), "mayhem");
        assert_eq!(classify(Some(450), "ARAM_UNRANKED_5x5"), "aram");
        assert_eq!(classify(None, "ARAM_MAYHEM"), "mayhem");
        assert_eq!(classify(Some(420), "RANKED_SOLO_5x5"), "other");
    }

    #[test]
    fn offline_state_is_idle() {
        let s = offline("x");
        assert!(!s.connected);
        assert_eq!(s.mode, "idle");
    }
}
