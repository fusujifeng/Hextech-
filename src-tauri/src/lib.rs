//! 英雄联盟海克斯大乱斗出装助手 —— Tauri 后端入口。
//!
//! 后端只做三件事：连 LCU、读选人会话、查随包数据。
//! 业务/交互逻辑全部留在前端 TypeScript。

mod data;
mod lcu;

use std::sync::{Arc, Mutex};

use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub struct AppState {
    runtime: Arc<Mutex<lcu::Runtime>>,
}

#[tauri::command]
fn get_lcu_state(state: tauri::State<'_, AppState>) -> lcu::State {
    state.runtime.lock().unwrap().snapshot()
}

#[tauri::command]
fn get_recommendation(champion_id: i32, mode: String) -> Result<data::Recommendation, String> {
    data::recommendation(champion_id, &mode)
}

#[tauri::command]
fn list_champions() -> Vec<data::ChampionBrief> {
    data::champions()
}

#[tauri::command]
fn get_meta() -> data::Meta {
    data::meta()
}

/// F1：游戏里把窗口呼出来并置顶；再按一次收起。
fn toggle_floating_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };

    if window.is_focused().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_always_on_top(true);
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = Arc::new(Mutex::new(lcu::Runtime::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        toggle_floating_window(app);
                    }
                })
                .build(),
        )
        .manage(AppState {
            runtime: runtime.clone(),
        })
        .setup(move |app| {
            // F1 全局热键：选人/对局中都能把工具呼到最前
            if let Err(err) = app.global_shortcut().register("F1") {
                eprintln!("[aram-mayhem-helper] 注册 F1 快捷键失败: {err}");
            }

            let handle = app.handle().clone();
            let rt = runtime.clone();
            tauri::async_runtime::spawn(async move {
                lcu::run(handle, rt).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_lcu_state,
            get_recommendation,
            list_champions,
            get_meta
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
