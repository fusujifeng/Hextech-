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

/// 四路兜底：进程命令行 → 注册表/常见目录 → lockfile → 客户端日志。
///
/// 国服 WeGame 的典型情况：`LeagueClientUx.exe` 的命令行读不到、`lockfile` 是 0 字节，
/// 但 `LeagueClient\*_LeagueClientUx.log` 里完整记录了 `--app-port` / `--remoting-auth-token`。
fn discover() -> Option<(Credentials, &'static str)> {
    // 1. 进程命令行（国际服最可靠）
    if let Some(creds) = league_link::try_find_lcu() {
        if port_alive(creds.port) {
            return Some((creds, "进程扫描"));
        }
    }

    let dirs = install_dirs();

    // 2. lockfile（国际服常见；国服多半是 0 字节）
    for dir in &dirs {
        for lock in [dir.join("lockfile"), dir.join("LeagueClient").join("lockfile")] {
            if !lock.is_file() {
                continue;
            }
            if let Ok(creds) = league_link::try_find_lcu_via_lockfile(&lock) {
                if !creds.password.is_empty() && port_alive(creds.port) {
                    return Some((creds, "lockfile"));
                }
            }
        }
    }

    // 3. 客户端日志（国服 WeGame 的主要路径）
    for dir in &dirs {
        for logs in log_dirs(dir) {
            if !logs.is_dir() {
                continue;
            }
            if let Ok(creds) = league_link::try_find_lcu_via_logs(&logs) {
                if port_alive(creds.port) {
                    return Some((creds, "日志解析"));
                }
            }
        }
    }

    None
}

/// 端口是否还在监听——用来淘汰上一次会话留下的过期日志凭证。
fn port_alive(port: u16) -> bool {
    use std::net::{SocketAddr, TcpStream};
    let addr: SocketAddr = ([127, 0, 0, 1], port).into();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// 依次从进程路径、注册表卸载项、常见安装根目录推断安装位置。
fn install_dirs() -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();

    // 1. 运行中的客户端进程路径
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

    // 2. 注册表：WeGame 安装的「英雄联盟」会写 InstallLocation / InstallSource
    for path in registry_install_dirs() {
        push_unique(&mut dirs, path);
    }

    // 3. 常见安装位置，以及 WeGame 根目录下扫一层
    let mut roots: Vec<PathBuf> = vec![
        PathBuf::from(r"C:\Riot Games\League of Legends"),
        PathBuf::from(r"D:\Riot Games\League of Legends"),
        PathBuf::from(r"E:\Riot Games\League of Legends"),
    ];
    for drive in ["C:", "D:", "E:", "F:"] {
        for rel in [
            r"WeGameApps",
            r"Game\Wegame\WeGameApps",
            r"Program Files\Tencent",
            r"Program Files\WeGameApps",
            r"Tencent",
        ] {
            roots.push(PathBuf::from(format!(r"{drive}\{rel}")));
        }
    }

    for root in roots {
        if !root.is_dir() {
            continue;
        }
        push_unique(&mut dirs, root.clone());
        if let Ok(entries) = std::fs::read_dir(&root) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    push_unique(&mut dirs, path);
                }
            }
        }
    }

    dirs
}

/// 从注册表卸载项里找英雄联盟安装目录（支持中文名与英文名）。
fn registry_install_dirs() -> Vec<PathBuf> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    let mut out = Vec::new();
    let targets = [
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (HKEY_CURRENT_USER, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall"),
    ];

    for (hive, path) in targets {
        let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(path, KEY_READ) else {
            continue;
        };
        for name in key.enum_keys().flatten() {
            let Ok(sub) = key.open_subkey_with_flags(&name, KEY_READ) else {
                continue;
            };
            let display: String = sub.get_value("DisplayName").unwrap_or_default();
            let lower = display.to_lowercase();
            if !(display.contains("英雄联盟") || lower.contains("league of legends")) {
                continue;
            }
            for value in ["InstallLocation", "InstallSource"] {
                if let Ok(location) = sub.get_value::<String, _>(value) {
                    let trimmed = location.trim().trim_end_matches('\\');
                    if !trimmed.is_empty() {
                        push_unique(&mut out, PathBuf::from(trimmed));
                    }
                }
            }
        }
    }
    out
}

fn push_unique(list: &mut Vec<PathBuf>, p: PathBuf) {
    if !list.iter().any(|x| x == &p) {
        list.push(p);
    }
}

fn log_dirs(install: &std::path::Path) -> Vec<PathBuf> {
    vec![
        // 国服 WeGame：Ux 日志直接放在 LeagueClient 目录下
        install.join("LeagueClient"),
        install.join("Game").join("Logs").join("LeagueClient Logs"),
        install.join("Logs").join("LeagueClient Logs"),
        install.join("Logs").join("LeagueClientUx Logs"),
        install.join("LeagueClient").join("Logs"),
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
        // 国服海克斯大乱斗的 queue.type 是 KIWI，必须靠 queue_id 判定
        assert_eq!(classify(Some(2400), "KIWI"), "mayhem");
    }

    #[test]
    fn log_dirs_cover_wegame_layout() {
        let dirs = log_dirs(std::path::Path::new(r"C:\LoL"));
        assert!(dirs.iter().any(|d| d.ends_with("LeagueClient")));
        assert!(dirs
            .iter()
            .any(|d| d.ends_with("LeagueClient Logs")));
    }

    #[test]
    fn offline_state_is_idle() {
        let s = offline("x");
        assert!(!s.connected);
        assert_eq!(s.mode, "idle");
    }
}
