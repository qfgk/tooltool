// lib.rs：入口分发（shell 面板 / --tool=<id> 工具窗）+ 托盘 + 热键 + 单实例聚焦
mod data;
mod quicklaunch;
mod registry;
mod tray;

use tauri::webview::WebviewWindowBuilder;
use tauri::{Emitter, Manager, Runtime, WebviewUrl};
use tauri_plugin_global_shortcut::GlobalShortcutExt;

/// 内置工具窗：已存在则聚焦，否则创建（可见性由前端渲染完成后再 show）
pub fn create_or_focus_tool<R: Runtime>(app: &tauri::AppHandle<R>, id: &str) -> Result<(), String> {
    let Some(entry) = registry::hosted_tool(id) else { return Err(format!("未知内置工具：{id}")) };
    let label = format!("tool-{id}");
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let label2 = label.clone();
    WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::App("index.html".into()),
    )
    .title(format!("{} · tool-tool不绝", entry.name))
    .inner_size(entry.window.w, entry.window.h)
    .min_inner_size(320.0, 280.0)
    .decorations(false)
    .transparent(true)
    .shadow(false)
    .visible(false)
    .resizable(true)
    .additional_browser_args(
        "--disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-features=CalculateNativeWinOcclusion",
    )
    .build()
    .map_err(|e| {
        eprintln!("[tooltool] 创建工具窗失败 {label2}: {e}");
        format!("创建工具窗失败：{e}")
    })?;
    Ok(())
}

pub fn focus_shell<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(w) = app.get_webview_window("shell") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn toggle_shell<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(w) = app.get_webview_window("shell") {
        let visible = w.is_visible().unwrap_or(false);
        if visible && w.is_focused().unwrap_or(false) {
            let _ = w.hide();
        } else {
            let _ = w.unminimize();
            let _ = w.show();
            let _ = w.set_focus();
        }
    }
}

/// 从 argv 中解析 --tool=<id>（单实例转发回调里也用它）
fn parse_tool_arg(args: &[String]) -> Option<String> {
    args.iter()
        .find_map(|a| a.strip_prefix("--tool=").map(|s| s.to_string()))
        .filter(|id| registry::hosted_tool(id).is_some())
}

pub fn run() {
    // panic 钩子：release 下 windows_subsystem 无 stderr，把 panic 写入日志文件
    std::panic::set_hook(Box::new(|info| {
        let msg = format!(
            "[{}] PANIC: {} @ {}\n",
            data::now_ms(),
            info,
            info.location().map(|l| format!("{}:{}", l.file(), l.line())).unwrap_or_default()
        );
        let log = std::env::temp_dir().join("tooltool-panic.log");
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(&log) {
            use std::io::Write;
            let _ = f.write_all(msg.as_bytes());
        }
        eprintln!("{}", msg);
    }));

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // 二次启动：带 --tool 则聚焦对应工具窗，否则聚焦面板
            match parse_tool_arg(&argv) {
                Some(id) => { let _ = create_or_focus_tool(app, &id); }
                None => focus_shell(app),
            }
            let _ = app.emit("second-instance", ());
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(registry::load_shared())
        .setup(|app| {
            data::backup_on_boot();
            quicklaunch::migrate_from_tools();

            // 托盘
            tray::setup_tray(app.handle())?;

            // 全局热键：Ctrl+Alt+T 呼出/隐藏面板
            app.global_shortcut().on_shortcut("CommandOrControl+Alt+T", |app, _sc, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    toggle_shell(app);
                }
            })?;

            // 主窗默认隐藏，前端渲染完成后 show
            if let Some(w) = app.get_webview_window("shell") {
                let _ = w.hide();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            registry::list_tools,
            registry::save_tool,
            registry::remove_tool,
            registry::get_state,
            registry::launch_tool,
            registry::save_settings,
            registry::quit_app,
            quicklaunch::ql_list,
            quicklaunch::ql_save,
            quicklaunch::ql_delete,
            quicklaunch::ql_run,
            quicklaunch::scan_folder,
            quicklaunch::ql_add_batch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tooltool");
}
