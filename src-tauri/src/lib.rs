//! 英雄联盟海克斯大乱斗出装助手 —— Tauri 后端入口。
//!
//! 后端只做三件事：连 LCU、读选人会话、查随包数据。
//! 业务/交互逻辑全部留在前端 TypeScript。

mod data;
mod live;
mod lcu;
mod vision;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};
use tauri_plugin_updater::UpdaterExt;

/// 后台检查到新版本后推给前端的事件名。
const UPDATE_EVENT: &str = "update-available";
/// 启动后稍等再查：让窗口首帧和 LCU 连接先跑起来，不抢网络。
const UPDATE_CHECK_DELAY: Duration = Duration::from_secs(2);

/// 后台线程发现的待安装版本；前端启动时用 `get_pending_update` 补取，
/// 避免「检查比 WebView 加载更早完成」导致提示丢失。
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingUpdate {
    pub version: String,
    pub notes: String,
    pub current_version: String,
}

pub struct AppState {
    runtime: Arc<Mutex<lcu::Runtime>>,
    pending_update: Arc<Mutex<Option<PendingUpdate>>>,
    live: Arc<Mutex<live::LiveState>>,
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

/// 选人强度榜：传当前英雄 + 备战席英雄 id，返回按 OP.GG 强度排序的列表。
#[tauri::command]
fn get_champion_board(ids: Vec<i32>) -> Vec<data::ChampionRank> {
    data::champion_board(&ids)
}

#[tauri::command]
fn get_pending_update(state: tauri::State<'_, AppState>) -> Option<PendingUpdate> {
    state.pending_update.lock().unwrap().clone()
}

/// 静默问一次 GitHub Releases 有没有比当前版本更新的 release。
/// 没发过 Release、断网、代理异常都按「没有更新」处理，绝不打扰用户。
async fn probe_update(app: &tauri::AppHandle) -> Option<PendingUpdate> {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(err) => {
            eprintln!("[update] 初始化更新器失败: {err}");
            return None;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => Some(PendingUpdate {
            version: update.version,
            notes: update.body.unwrap_or_default(),
            current_version: update.current_version,
        }),
        Ok(None) => None,
        Err(err) => {
            eprintln!("[update] 后台检查更新失败: {err}");
            None
        }
    }
}

/// 每次启动单开一条线程做更新检查：不阻塞 UI，也不影响 LCU 轮询。
fn spawn_update_check(app: tauri::AppHandle, slot: Arc<Mutex<Option<PendingUpdate>>>) {    let spawned = std::thread::Builder::new()
        .name("update-check".into())
        .spawn(move || {
            std::thread::sleep(UPDATE_CHECK_DELAY);

            let Some(found) = tauri::async_runtime::block_on(probe_update(&app)) else {
                return;
            };

            *slot.lock().unwrap() = Some(found.clone());

            // 前端可能还没挂载监听，所以它也会主动取一次；这里只是让「已打开」的情况即时弹窗
            if let Err(err) = app.emit(UPDATE_EVENT, &found) {
                eprintln!("[update] 推送更新事件失败: {err}");
            }
        });

    if let Err(err) = spawned {
        eprintln!("[update] 启动更新检查线程失败: {err}");
    }
}

/// F1 排查用的轻量日志，落在应用数据目录（`%LOCALAPPDATA%\com.chenhang.aramhelper\hotkey.log`）。
fn hotkey_log(app: &tauri::AppHandle, message: &str) {
    use std::io::Write;

    let Ok(dir) = app.path().app_local_data_dir() else {
        return;
    };
    let _ = std::fs::create_dir_all(&dir);
    let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("hotkey.log"))
    else {
        return;
    };

    let seconds = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or_default();
    let _ = writeln!(file, "{seconds} {message}");
}

/// Windows：把窗口强行提到最前。
///
/// 光调 `set_focus()` 在「英雄联盟以管理员运行」时会被 UIPI 拦下，
/// 这里用 AttachThreadInput + SetWindowPos(TOPMOST) 的经典组合补上。
#[cfg(windows)]
fn force_foreground(window: &tauri::WebviewWindow) {
    use std::ffi::c_void;

    type Hwnd = *mut c_void;

    const SWP_NOSIZE: u32 = 0x0001;
    const SWP_NOMOVE: u32 = 0x0002;
    const SWP_SHOWWINDOW: u32 = 0x0040;
    const SW_RESTORE: i32 = 9;

    unsafe extern "system" {
        fn GetForegroundWindow() -> Hwnd;
        fn GetWindowThreadProcessId(hwnd: Hwnd, process_id: *mut u32) -> u32;
        fn GetCurrentThreadId() -> u32;
        fn AttachThreadInput(attach: u32, attach_to: u32, do_attach: i32) -> i32;
        fn SetForegroundWindow(hwnd: Hwnd) -> i32;
        fn SetWindowPos(
            hwnd: Hwnd,
            insert_after: Hwnd,
            x: i32,
            y: i32,
            cx: i32,
            cy: i32,
            flags: u32,
        ) -> i32;
        fn BringWindowToTop(hwnd: Hwnd) -> i32;
        fn ShowWindow(hwnd: Hwnd, cmd: i32) -> i32;
        fn IsIconic(hwnd: Hwnd) -> i32;
    }

    let Ok(hwnd) = window.hwnd() else {
        return;
    };
    let hwnd: Hwnd = hwnd.0;

    unsafe {
        let topmost = usize::MAX as Hwnd;
        let foreground = GetForegroundWindow();
        let foreground_thread = GetWindowThreadProcessId(foreground, std::ptr::null_mut());
        let current_thread = GetCurrentThreadId();

        let attached = foreground_thread != 0
            && foreground_thread != current_thread
            && AttachThreadInput(current_thread, foreground_thread, 1) != 0;

        if IsIconic(hwnd) != 0 {
            ShowWindow(hwnd, SW_RESTORE);
        }
        // 先无条件显示再提权：无边框全屏的游戏也能盖上去
        SetWindowPos(
            hwnd,
            topmost,
            0,
            0,
            0,
            0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
        );
        BringWindowToTop(hwnd);
        SetForegroundWindow(hwnd);

        if attached {
            AttachThreadInput(current_thread, foreground_thread, 0);
        }
    }
}

#[cfg(not(windows))]
fn force_foreground(window: &tauri::WebviewWindow) {
    let _ = window.set_focus();
}

/// 收起主窗口，只留桌面悬浮球
fn hide_to_ball(app: &tauri::AppHandle) {
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.hide();
    }
    if let Some(ball) = app.get_webview_window("ball") {
        let _ = ball.show();
    }
    hotkey_log(app, "窗口：已收起为悬浮球");
}

/// 展开主窗口，收起悬浮球
fn show_main(app: &tauri::AppHandle) {
    if let Some(ball) = app.get_webview_window("ball") {
        let _ = ball.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        force_foreground(&main);
    }
}

/// 选人阶段自动展开：显示主窗、收起球，但不抢焦点，避免打断选人操作
pub(crate) fn expand_main(app: &tauri::AppHandle) {
    if let Some(ball) = app.get_webview_window("ball") {
        let _ = ball.hide();
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_always_on_top(true);
    }
}

/// 手动刷新开局三张英雄牌：收起助手 → 截屏 OCR → 展开并返回牌面排名
#[tauri::command]
fn refresh_champ_cards(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Vec<data::ChampionRank> {
    let can_detect = state
        .runtime
        .lock()
        .map(|rt| rt.state.phase == "ChampSelect" && rt.state.mode == "mayhem")
        .unwrap_or(false);
    if !can_detect {
        return Vec::new();
    }

    // 助手会挡住牌面，先收起再截图
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.hide();
    }
    if let Some(ball) = app.get_webview_window("ball") {
        let _ = ball.hide();
    }
    std::thread::sleep(std::time::Duration::from_millis(300));

    let ids = vision::ocr_screen()
        .map(|text| data::find_champions_in_text(&text))
        .unwrap_or_default();
    let ids: Vec<i32> = ids.into_iter().take(3).map(|id| id as i32).collect();
    let board = data::champion_board(&ids);

    show_main(&app);
    board
}

/// 悬浮球点击：如果刚好是符文等级且满血，截屏 OCR 出三张卡再展开
#[tauri::command]
fn expand_from_ball(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Option<Vec<data::AugmentView>> {
    let ready = state.live.lock().map(|s| s.ready).unwrap_or(false);

    let mut picks = Vec::new();
    if ready {
        if let Some(text) = vision::ocr_screen() {
            let ids = data::find_augments_in_text(&text);
            if ids.len() >= 3 {
                let (champion_id, mode) = {
                    let rt = state.runtime.lock().unwrap();
                    (rt.state.champion_id, rt.state.mode.clone())
                };
                if let Some(champion_id) = champion_id {
                    let mode = if mode.is_empty() {
                        "mayhem".to_string()
                    } else {
                        mode
                    };
                    picks = data::augment_picks(champion_id, &ids[..3], &mode);
                    picks.truncate(3);
                }
            }
        }
    }

    if picks.len() >= 3 {
        if let Ok(mut guard) = state.live.lock() {
            guard.consume();
        }
        let _ = app.emit("augment-options", &picks);
    }

    show_main(&app);
    if picks.is_empty() {
        None
    } else {
        Some(picks)
    }
}

/// 托盘图标兜底：临时画一个金色圆点，避免默认图标缺失时托盘不可见
fn fallback_tray_icon() -> tauri::image::Image<'static> {
    const SIZE: u32 = 32;
    let mut rgba = vec![0u8; (SIZE * SIZE * 4) as usize];
    for y in 0..SIZE {
        for x in 0..SIZE {
            let dx = x as f32 - 15.5;
            let dy = y as f32 - 15.5;
            let dist = (dx * dx + dy * dy).sqrt();
            let i = ((y * SIZE + x) * 4) as usize;
            if dist <= 14.0 {
                rgba[i] = 200;
                rgba[i + 1] = 170;
                rgba[i + 2] = 110;
                rgba[i + 3] = ((14.0 - dist).min(1.0) * 255.0) as u8;
            }
        }
    }
    tauri::image::Image::new_owned(rgba, SIZE, SIZE)
}

/// 任务栏右下角托盘图标：左键显示主界面，右键菜单显示 / 退出
fn setup_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    // default_window_icon 借用自 App，托盘需要 'static，拷一份 RGBA 出来
    let icon = app
        .default_window_icon()
        .map(|img| {
            tauri::image::Image::new_owned(img.rgba().to_vec(), img.width(), img.height())
        })
        .unwrap_or_else(fallback_tray_icon);

    let tray = TrayIconBuilder::with_id("aram-helper-tray")
        .icon(icon)
        .tooltip("海克斯大乱斗出装助手")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(app)?;

    // TrayIcon 是引用计数的，交给 App 持有，否则图标会立刻消失
    app.manage(tray);
    Ok(())
}

/// 从设置面板退出程序（托盘不可用时也能退出）
#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

/// F1：游戏里把窗口呼出来并置顶；再按一次收起为悬浮球。
fn toggle_floating_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        hotkey_log(app, "F1：找不到 main 窗口");
        return;
    };

    let visible = window.is_visible().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    hotkey_log(app, &format!("F1 按下 visible={visible} focused={focused}"));

    if visible && focused {
        let _ = window.hide();
        if let Some(ball) = app.get_webview_window("ball") {
            let _ = ball.show();
        }
        hotkey_log(app, "F1：已收起为悬浮球");
        return;
    }

    if let Some(ball) = app.get_webview_window("ball") {
        let _ = ball.hide();
    }
    if let Err(err) = window.show() {
        hotkey_log(app, &format!("F1：show 失败 {err}"));
    }
    let _ = window.unminimize();
    let _ = window.set_always_on_top(true);
    force_foreground(&window);

    hotkey_log(
        app,
        &format!(
            "F1：已唤起 visible={}",
            window.is_visible().unwrap_or(false)
        ),
    );
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let runtime = Arc::new(Mutex::new(lcu::Runtime::new()));
    let pending_update: Arc<Mutex<Option<PendingUpdate>>> = Arc::new(Mutex::new(None));
    let live_state: Arc<Mutex<live::LiveState>> = Arc::new(Mutex::new(live::LiveState::default()));

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
            pending_update: pending_update.clone(),
            live: live_state.clone(),
        })
        .setup(move |app| {
            // F1 全局热键：选人/对局中都能把工具呼到最前
            match app.global_shortcut().register("F1") {
                Ok(()) => hotkey_log(app.handle(), "启动：F1 注册成功"),
                Err(err) => {
                    eprintln!("[aram-mayhem-helper] 注册 F1 快捷键失败: {err}");
                    hotkey_log(app.handle(), &format!("启动：F1 注册失败 {err}"));
                }
            }

            // 每次打开软件都开一条后台线程静默查更新，有结果再提示用户
            spawn_update_check(app.handle().clone(), pending_update.clone());

            // 对局中轮询 Live Client Data：记录等级/满血，供悬浮球点击时判断符文窗口
            live::spawn(live_state.clone(), runtime.clone());

            // 托盘图标：关掉主窗口后程序仍驻留在任务栏右下角
            if let Err(err) = setup_tray(app) {
                eprintln!("[aram-mayhem-helper] 创建托盘图标失败: {err}");
            }

            // 悬浮球默认放在主屏右侧中部：球的右边缘距屏幕 100px，垂直居中。
            // 注意窗口本身可能比球宽（系统最小宽度），所以按“球”而不是窗口来算。
            if let Some(ball) = app.get_webview_window("ball") {
                if let Ok(Some(monitor)) = app.primary_monitor() {
                    const BALL: f64 = 58.0;

                    let scale = monitor.scale_factor();
                    let screen = monitor.size().to_logical::<f64>(scale);
                    let origin = monitor.position().to_logical::<f64>(scale);
                    let win = ball
                        .outer_size()
                        .map(|s| s.to_logical::<f64>(scale))
                        .unwrap_or(tauri::LogicalSize::new(68.0, 68.0));

                    let x = origin.x + screen.width - 100.0 - (win.width + BALL) / 2.0;
                    let y = origin.y + (screen.height - win.height) / 2.0;
                    let _ = ball.set_position(tauri::LogicalPosition::new(x, y));
                }
                // 启动默认只显示悬浮球；主窗口在配置里初始隐藏
                let _ = ball.show();
            }

            // 关闭主窗口 = 收进悬浮球，不退出程序
            if let Some(main) = app.get_webview_window("main") {
                let app_handle = app.handle().clone();
                main.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        hide_to_ball(&app_handle);
                    }
                });
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
            get_meta,
            get_champion_board,
            get_pending_update,
            expand_from_ball,
            refresh_champ_cards,
            quit_app
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
