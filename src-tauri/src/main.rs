// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  // `--mcp`: an AI assistant started us to read the bookmarks over stdio (see
  // mcp.rs). Branch before Tauri starts, so no window or tray icon appears and
  // the single-instance plugin never forwards this launch to the running app.
  // Only the first argument counts: Explorer launches carry `--path <item>`,
  // and an item could be named anything.
  if std::env::args().nth(1).as_deref() == Some("--mcp") {
    std::process::exit(app_lib::mcp::run_stdio());
  }
  app_lib::run();
}
