import { getCurrentWindow } from "@tauri-apps/api/window";

/**
 * Minimize the app window. Used by in-app minimize buttons so the window can be
 * put away without reaching for the native title bar (handy while the bookmark
 * editor is open and its input state should be kept).
 * No-op outside Tauri (web dev), where there is no window to minimize.
 */
export async function minimizeAppWindow(): Promise<void> {
  try {
    await getCurrentWindow().minimize();
  } catch {
    /* not running inside Tauri */
  }
}
