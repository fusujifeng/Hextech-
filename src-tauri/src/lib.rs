//! 英雄联盟海克斯大乱斗出装助手 —— Tauri 后端入口。
//!
//! 后端只做三件事：连 LCU、读选人会话、查随包数据。
//! 业务/交互逻辑全部留在前端 TypeScript。

mod data;
mod lcu;

use std::sync::{Arc, Mutex};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = Arc::new(Mutex::new(lcu::Runtime::new()));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(AppState {
            runtime: runtime.clone(),
        })
        .setup(move |app| {
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
