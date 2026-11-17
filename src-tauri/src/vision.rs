//! 屏幕截图 + Windows 自带 OCR（中文）。
//!
//! 只在用户点击悬浮球、且对局状态判定「刚到符文等级且满血」时调用一次，
//! 不做常驻截屏。OCR 脚本见 `scripts/ocr-screen.ps1`。

use std::os::windows::process::CommandExt;
use std::path::PathBuf;
use std::process::Command;

const OCR_SCRIPT: &str = include_str!("../../scripts/ocr-screen.ps1");
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// 截当前屏幕并 OCR，返回识别出的全部文本；失败返回 None。
pub fn ocr_screen() -> Option<String> {
    let dir = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)?
        .join("com.chenhang.aramhelper");
    std::fs::create_dir_all(&dir).ok()?;

    let script = dir.join("ocr-screen.ps1");
    std::fs::write(&script, OCR_SCRIPT).ok()?;

    let output = Command::new("powershell.exe")
        .creation_flags(CREATE_NO_WINDOW)
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
        ])
        .arg(&script)
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8(output.stdout).ok()?;
    let text = text.trim().to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}
