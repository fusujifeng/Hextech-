fn main() {
    // 自定义清单：要求管理员权限，才能把窗口提到同样以管理员运行的英雄联盟前面
    let windows =
        tauri_build::WindowsAttributes::new().app_manifest(include_str!("windows-app-manifest.xml"));

    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
}
