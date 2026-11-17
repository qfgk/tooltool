// tray.rs：系统托盘（各工具直达 + 打开面板 + 退出）
use crate::{create_or_focus_tool, focus_shell};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, Runtime};

pub fn setup_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
    let shell = MenuItemBuilder::with_id("open-shell", "打开面板").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出 tool-tool不绝").build(app)?;

    let mut menu = MenuBuilder::new(app);
    // 内置工具直达
    for (id, name, _, _) in crate::registry::HOSTED_TOOLS {
        let item = MenuItemBuilder::with_id(format!("tool-{id}"), format!("打开 {name}")).build(app)?;
        menu = menu.item(&item);
    }
    // 外部工具直达
    let shared = app.state::<crate::registry::AppShared>();
    let externals: Vec<_> = crate::registry::all_tools(&shared)
        .into_iter()
        .filter(|t| t.kind == "external")
        .collect();
    if !externals.is_empty() {
        menu = menu.separator();
        for t in externals {
            let id = t.id.clone();
            let label = t.name.clone();
            let item = MenuItemBuilder::with_id(format!("ext-{id}"), format!("打开 {label}")).build(app)?;
            menu = menu.item(&item);
        }
    }
    menu = menu.separator().item(&shell).item(&quit);
    let menu = menu.build()?;

    TrayIconBuilder::with_id("tooltool-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open-shell" => crate::focus_shell(app),
            "quit" => {
                let _ = app.exit(0);
            }
            other => {
                let id = other
                    .strip_prefix("tool-")
                    .or_else(|| other.strip_prefix("ext-"))
                    .unwrap_or(other);
                crate::create_or_focus_tool(app, id);
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                crate::focus_shell(tray.app_handle());
            }
        })
        .build(app)?;
    Ok(())
}
