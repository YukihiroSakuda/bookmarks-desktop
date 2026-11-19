/**
 * How several selected tags combine in the tag filter: `any` shows bookmarks
 * carrying at least one of them (widening), `all` only those carrying every
 * one (narrowing). One tag is the same either way.
 *
 * A per-machine display preference like the theme, so it lives in
 * localStorage rather than the database and never enters a backup.
 */
export type TagMatchMode = "any" | "all";

const STORAGE_KEY = "tag_match_mode";

export const DEFAULT_TAG_MATCH_MODE: TagMatchMode = "any";

/** Read the stored choice. Call from an effect — localStorage is client-only. */
export function readStoredTagMatchMode(): TagMatchMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved === "any" || saved === "all" ? saved : DEFAULT_TAG_MATCH_MODE;
  } catch {
    // Storage can throw outright, not just return null, when site data is blocked.
    return DEFAULT_TAG_MATCH_MODE;
  }
}

export function storeTagMatchMode(mode: TagMatchMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // A preference that cannot be remembered is still fine for this session.
  }
}

/** Whether a bookmark's tags pass the filter. No selection lets everything through. */
export function matchesSelectedTags(
  bookmarkTags: string[],
  selectedTags: string[],
  mode: TagMatchMode
): boolean {
  if (selectedTags.length === 0) return true;
  return mode === "all"
    ? selectedTags.every((tag) => bookmarkTags.includes(tag))
    : selectedTags.some((tag) => bookmarkTags.includes(tag));
}
