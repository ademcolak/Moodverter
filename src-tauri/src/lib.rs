use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager, WindowEvent, PhysicalPosition, Position, Size, Emitter,
};

mod ytdlp;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            ytdlp::search_youtube,
            ytdlp::search_youtube_v1,
            ytdlp::search_youtube_public_v1,
            ytdlp::search_youtube_web_v1,
            ytdlp::fetch_youtube_playlist_v1
        ])
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

                                let window_size = window.outer_size().ok();
                                let window_width = window_size.map(|size| size.width as f64).unwrap_or(400.0);
                                let window_height = window_size.map(|size| size.height as f64).unwrap_or(500.0);
                                let margin = 5.0;
                                let mut x = tray_x - (window_width / 2.0);
                                let mut y = tray_y + tray_height + margin;

                                if let Ok(Some(monitor)) = window.current_monitor() {
                                    let monitor_position = monitor.position();
                                    let monitor_size = monitor.size();
                                    let min_x = monitor_position.x as f64;
                                    let min_y = monitor_position.y as f64;
                                    let max_x = min_x + monitor_size.width as f64;
                                    let max_y = min_y + monitor_size.height as f64;

                                    if y + window_height > max_y {
                                        y = tray_y - window_height - margin;
                                    }
                                    x = x.clamp(min_x, (max_x - window_width).max(min_x));
                                    y = y.clamp(min_y, (max_y - window_height).max(min_y));
                                }

                                let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(app)?;

            // Emit ready event to frontend
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.emit("backend-ready", ());
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                // Hide window when it loses focus
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
