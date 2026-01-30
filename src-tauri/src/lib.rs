use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent, PhysicalPosition, Position, Size,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // Create tray menu items
            let quit_item = MenuItem::with_id(app, "quit", "Quit Moodverter", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&quit_item])?;

            // Build the tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .tooltip("Moodverter")
                .on_menu_event(|app, event| {
                    if event.id.as_ref() == "quit" {
                        app.exit(0);
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    // Toggle window on left click, position below tray icon
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        rect,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                // Extract position values
                                let (tray_x, tray_y) = match rect.position {
                                    Position::Physical(pos) => (pos.x as f64, pos.y as f64),
                                    Position::Logical(pos) => (pos.x, pos.y),
                                };
                                let tray_height = match rect.size {
                                    Size::Physical(size) => size.height as f64,
                                    Size::Logical(size) => size.height,
                                };

                                // Position window below tray icon (centered)
                                let window_width: f64 = 400.0;
                                let x = tray_x - (window_width / 2.0);
                                let y = tray_y + tray_height + 5.0;

                                let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Hide window when it loses focus (click outside)
                WindowEvent::Focused(false) => {
                    let _ = window.hide();
                }
                // Prevent close, just hide
                WindowEvent::CloseRequested { api, .. } => {
                    let _ = window.hide();
                    api.prevent_close();
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
