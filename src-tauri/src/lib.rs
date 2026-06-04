mod commands;
mod db;
mod server;

use db::AppState;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            app.manage(AppState { conn: conn.clone() });

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
