/**
 * Which of the two top-level views is showing.
 *
 * Persisted like `ui_lang` and the theme — in localStorage, not the database.
 * It is the state of this window, not a user setting worth a schema column, and
 * remembering it is what keeps launching a group a one-click action: someone
 * who left off in Groups lands back there next time they open the app.
 */
export type AppView = "bookmarks" | "groups";

const STORAGE_KEY = "active_view";

export function readAppView(): AppView {
  if (typeof window === "undefined") return "bookmarks";
  try {
    return localStorage.getItem(STORAGE_KEY) === "groups" ? "groups" : "bookmarks";
  } catch {
    return "bookmarks";
  }
}

export function writeAppView(view: AppView): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, view);
  } catch {}
}
