mod commands;
mod db;
mod explorertabs;
mod explorerwindows;
mod groups;
mod favicon;
mod page_title;
mod folder_search;
mod server;
mod shortcutdir;
#[cfg(target_os = "windows")]
mod winpkg;

use db::AppState;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, WindowEvent,
};
use tauri_plugin_global_shortcut::ShortcutState;

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
            // Bring the existing window to front (it may be hidden in the tray)
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    // Fire on press only; otherwise each combo would trigger twice.
                    if event.state() == ShortcutState::Pressed {
                        commands::on_shortcut_pressed(app, shortcut);
                    }
                })
                .build(),
        )
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
                summon_shortcut: Mutex::new(None),
                favicon_cancel: std::sync::atomic::AtomicBool::new(false),
            });

            // Register the global "summon" hotkey from settings so it is live
            // from launch.
            if let Err(e) = commands::sync_summon_inner(app.handle()) {
                log::warn!("summon shortcut sync failed: {e}");
            }

            // Bring the shortcut folder in line with the database. Writes that
            // bypass the Tauri commands — the extension's HTTP server, a file
            // edited while the app was closed — are caught here, so a missed
            // sync can never outlive one restart. No-op while the feature is
            // off, and it runs off the setup thread either way.
            shortcutdir::request_sync(app.handle());

            // Auto-register right-click context menu entry and launch-at-login.
            //
            // Release + unpackaged builds only:
            //   - A `tauri dev` run would otherwise point both registry entries at
            //     `target/debug/app.exe`, which launches at login and fails with
            //     ERR_CONNECTION_REFUSED because it loads devUrl (localhost:1420)
            //     with no dev server running.
            //   - In the MSIX (Store) build these HKCU writes are virtualized into
            //     the package hive and never reach the real registry, so both
            //     features are declared in msix/AppxManifest.xml instead.
            #[cfg(all(target_os = "windows", not(debug_assertions)))]
            if !winpkg::is_packaged() {
                if let Err(e) = commands::register_context_menu() {
                    log::warn!("context menu registration failed: {e}");
                }
                if let Err(e) = commands::register_autostart() {
                    log::warn!("autostart registration failed: {e}");
                }
            }

            // Launched at login: stay in the tray instead of popping the window
            // open. Unpackaged builds get `--hidden` from the `Run` entry; the
            // packaged build has no way to pass arguments through a startup task,
            // so the activation kind is checked instead.
            #[cfg(target_os = "windows")]
            let launched_hidden =
                args.iter().any(|a| a == "--hidden") || winpkg::launched_by_startup_task();
            #[cfg(not(target_os = "windows"))]
            let launched_hidden = args.iter().any(|a| a == "--hidden");

            if launched_hidden {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            // System tray icon: closing the window hides it instead of quitting,
            // so the app keeps running in the tray. The tray menu/icon click is
            // the way back in, and "Quit" is the only way to actually exit.
            let show_item = MenuItem::with_id(app, "show", "Open Bookmarks", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Bookmarks")
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "quit" => app.exit(0),
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            if let Some(window) = app.get_webview_window("main") {
                let window_handle = window.clone();
                window.on_window_event(move |event| {
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = window_handle.hide();
                    }
                });
            }

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(server::start(conn, handle));
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
            commands::is_shortcut_available,
            commands::list_tags,
            commands::create_tag,
            commands::update_tag,
            commands::set_tag_color,
            commands::reorder_tags,
            commands::delete_tag,
            commands::delete_all_tags,
            commands::list_tag_rules,
            commands::create_tag_rule,
            commands::delete_tag_rule,
            commands::get_settings,
            commands::update_settings,
            commands::export_data,
            commands::import_data,
            commands::fetch_title,
            commands::fetch_favicon,
            commands::count_missing_favicons,
            commands::fetch_missing_favicons,
            commands::cancel_fetch_favicons,
            commands::open_path,
            groups::list_groups,
            groups::create_group,
            groups::update_group,
            groups::delete_group,
            groups::reorder_groups,
            groups::add_bookmarks_to_group,
            groups::remove_bookmark_from_group,
            groups::set_group_members,
            groups::open_group,
            groups::list_open_folders,
            commands::get_pending_path,
            commands::register_context_menu,
            commands::unregister_context_menu,
            commands::save_extension_zip,
            folder_search::search_in_folders,
            shortcutdir::sync_shortcut_dir,
            shortcutdir::pick_shortcut_dir,
            shortcutdir::open_shortcut_dir,
            shortcutdir::pin_shortcut_dir,
            shortcutdir::unpin_shortcut_dir,
            shortcutdir::shortcut_dir_pinned,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
