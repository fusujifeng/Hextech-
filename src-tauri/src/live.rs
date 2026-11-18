//! 对局中读取 Live Client Data（2999），判断「第一次到达 1/7/11/15 级且满血」的符文窗口。
//!
//! 位置/回城读不到，所以用「等级到点 + 满血」作为近似条件：
//! 只有满足条件后点击悬浮球才会触发一次 OCR。
//!
//! 同时用对局内数据补认当前英雄：软件在选人之后才启动时，LCU 没有选人会话，
//! 前端拿不到 championId，这里从 allPlayers 里按自己的 riotId/summonerName 找。

use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use reqwest::Client;
use serde_json::Value;

/// 海克斯大乱斗符文发放等级
pub const THRESHOLDS: [i32; 4] = [1, 7, 11, 15];
const ENDPOINT: &str = "https://127.0.0.1:2999/liveclientdata/allgamedata";

#[derive(Default)]
pub struct LiveState {
    pub level: i32,
    pub ready: bool,
    next: usize,
    last_ok: Option<Instant>,
    last_level: i32,
}

impl LiveState {
    /// OCR 成功后消耗掉当前档位，等待下一次升级
    pub fn consume(&mut self) {
        while self.next < THRESHOLDS.len() && THRESHOLDS[self.next] <= self.level {
            self.next += 1;
        }
        self.ready = false;
    }

    fn reset(&mut self) {
        self.level = 0;
        self.ready = false;
        self.next = 0;
        self.last_level = 0;
    }

    fn observe(&mut self, level: i32, full: bool) {
        if level > 0 && level < self.last_level {
            // 等级回落只可能是新的一局
            self.reset();
        }
        if level > 0 {
            self.last_level = level;
            self.level = level;
            self.last_ok = Some(Instant::now());
        }

        if let Some(threshold) = THRESHOLDS.get(self.next).copied() {
            if level >= threshold && full {
                self.ready = true;
            }
        }
    }
}

pub fn spawn(state: Arc<Mutex<LiveState>>, runtime: Arc<Mutex<crate::lcu::Runtime>>) {
    tauri::async_runtime::spawn(async move {
        let client = match Client::builder()
            .danger_accept_invalid_certs(true)
            .danger_accept_invalid_hostnames(true)
            .no_proxy()
            .timeout(Duration::from_secs(2))
            .build()
        {
            Ok(client) => client,
            Err(_) => return,
        };

        loop {
            match client.get(ENDPOINT).send().await {
                Ok(resp) if resp.status().is_success() => {
                    if let Ok(json) = resp.json::<Value>().await {
                        let active = json.get("activePlayer");
                        let level = active
                            .and_then(|a| a.get("level"))
                            .and_then(Value::as_i64)
                            .unwrap_or(0) as i32;
                        let stats = active.and_then(|a| a.get("championStats"));
                        let hp = stats
                            .and_then(|s| s.get("currentHealth"))
                            .and_then(Value::as_f64)
                            .unwrap_or(0.0);
                        let max = stats
                            .and_then(|s| s.get("maxHealth"))
                            .and_then(Value::as_f64)
                            .unwrap_or(0.0);
                        let full = max > 0.0 && hp >= max - 1.0;

                        // 软件在选人之后才启动：用对局内玩家列表补认当前英雄
                        let my_key = active
                            .and_then(|a| a.get("riotId"))
                            .and_then(Value::as_str)
                            .filter(|s| !s.is_empty())
                            .or_else(|| {
                                active
                                    .and_then(|a| a.get("summonerName"))
                                    .and_then(Value::as_str)
                                    .filter(|s| !s.is_empty())
                            });
                        if let (Some(my_key), Some(players)) =
                            (my_key, json.get("allPlayers").and_then(Value::as_array))
                        {
                            for p in players {
                                let p_key = p
                                    .get("riotId")
                                    .and_then(Value::as_str)
                                    .filter(|s| !s.is_empty())
                                    .or_else(|| {
                                        p.get("summonerName")
                                            .and_then(Value::as_str)
                                            .filter(|s| !s.is_empty())
                                    });
                                if p_key != Some(my_key) {
                                    continue;
                                }
                                if let Some(name) =
                                    p.get("championName").and_then(Value::as_str)
                                {
                                    if let Some(id) = crate::data::champion_id_by_alias_or_name(name)
                                    {
                                        if let Ok(mut rt) = runtime.lock() {
                                            rt.set_live_champion(id);
                                        }
                                    }
                                }
                                break;
                            }
                        }

                        if let Ok(mut guard) = state.lock() {
                            guard.observe(level, full);
                        }
                    }
                }
                _ => {
                    // 对局结束 / 还没进游戏：5 秒没数据就回到初始状态
                    if let Ok(mut guard) = state.lock() {
                        let stale = guard
                            .last_ok
                            .map(|t| t.elapsed() > Duration::from_secs(5))
                            .unwrap_or(true);
                        if stale {
                            guard.reset();
                        }
                    }
                }
            }

            tokio::time::sleep(Duration::from_millis(700)).await;
        }
    });
}
