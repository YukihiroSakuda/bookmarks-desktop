/**
 * Language of the two long-form dialogs (Help and Settings).
 *
 * The rest of the app stays English by convention — this covers the screens
 * that are mostly prose, where reading in your own language actually matters.
 * Stored like the theme is: a per-machine display preference, not app data, so
 * it lives in localStorage rather than the database and never enters a backup.
 */
export type UiLang = "ja" | "en";

const STORAGE_KEY = "ui_lang";

export const DEFAULT_UI_LANG: UiLang = "en";

/**
 * The switch, as both dialogs draw it. Two-letter codes rather than the full
 * names: they read the same in either language, so the control does not change
 * width or meaning when you use it.
 */
export const UI_LANG_TABS: { key: UiLang; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "ja", label: "JA" },
];

/** Read the stored choice. Call from an effect — localStorage is client-only. */
export function readStoredUiLang(): UiLang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "en" || saved === "ja" ? saved : DEFAULT_UI_LANG;
  } catch {
    // Storage can throw outright, not just return null, when site data is blocked.
    return DEFAULT_UI_LANG;
  }
}

export function storeUiLang(lang: UiLang) {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // A preference that cannot be remembered is still fine for this session.
  }
}
