mod commands;
mod db;
mod server;

use db::AppState;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // single-instance must be first plugin
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Find --path arg sent by the new instance (context menu click)
            if let Some(pos) = argv.iter().position(|a| a == "--path") {
                if let Some(path) = argv.get(pos + 1) {
                    let _ = app.emit("open-path-bookmark", path.clone());
                }
            }
            // Bring the existing window to front
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let raw_conn = db::init_db(&app.handle()).map_err(|e| {
                Box::<dyn std::error::Error>::from(format!("database init failed: {e}"))
            })?;
            let conn = Arc::new(Mutex::new(raw_conn));

            // Capture --path from command-line args (cold start via context menu)
            let args: Vec<String> = std::env::args().collect();
            let pending = args
                .iter()
                .position(|a| a == "--path")
                .and_then(|pos| args.get(pos + 1))
                .cloned();

            app.manage(AppState {
                conn: conn.clone(),
                pending_path: Mutex::new(pending),
            });

            // Auto-register right-click context menu entry
            #[cfg(target_os = "windows")]
            {
                if let Err(e) = commands::register_context_menu() {
                    log::warn!("context menu registration failed: {e}");
                }
            }

            tauri::async_runtime::spawn(server::start(conn));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_bookmarks,
            commands::create_bookmark,
            commands::update_bookmark,
            commands::delete_bookmark,
            commands::delete_all_bookmarks,
            commands::toggle_pin,
            commands::increment_access,
            commands::reorder_bookmarks,
            commands::list_tags,
            commands::create_tag,
            commands::update_tag,
            commands::delete_tag,
            commands::delete_all_tags,
            commands::list_tag_rules,
            commands::create_tag_rule,
            commands::delete_tag_rule,
            commands::get_settings,
            commands::update_settings,
            commands::fetch_title,
            commands::open_path,
            commands::get_pending_path,
            commands::register_context_menu,
            commands::unregister_context_menu,
            commands::save_extension_zip,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
