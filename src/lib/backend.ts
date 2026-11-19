import { invoke, type InvokeArgs } from "@tauri-apps/api/core";
import { Bookmark } from "@/types/bookmark";
import { FolderSearchResult } from "@/types/folderSearch";
import { Tag } from "@/types/tag";
import { MatchType, TagRuleDB, TargetField } from "@/types/tagRule";
import { SortOption, SortOrder } from "@/types/bookmark";

/**
 * Typed calls to the Rust backend's Tauri commands (src-tauri/src/commands.rs
 * and friends) — one function per command, so the argument names and the
 * shape of each answer are written down in one place.
 *
 * Every function rejects with an `Error` carrying the backend's own message
 * (a command's `Err(String)`), so a caller can show the user what actually
 * went wrong instead of a generic "Failed to …".
 *
 * Argument keys are camelCase here; Tauri maps them onto the Rust parameters'
 * snake_case names. The `data` payloads are deserialized into Rust structs, so
 * their fields stay snake_case.
 */
async function call<T>(command: string, args?: InvokeArgs): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

type Ok = { ok: true };

// ---------- Bookmarks ----------

export type BookmarkRecord = Bookmark & { tags: string[] };

/** What create/update take. Update leaves `kind`/`favicon` alone when null. */
export interface BookmarkPayload {
  title: string;
  url: string;
  kind: "url" | "path";
  favicon?: string | null;
  is_pinned: boolean;
  tags: string[];
  memo: string | null;
  shortcut: string | null;
  /** Create only: an original date to keep (RFC 3339), e.g. from an import. */
  created_at?: string | null;
}

export const listBookmarks = () => call<BookmarkRecord[]>("list_bookmarks");

export const createBookmark = (data: BookmarkPayload) =>
  call<{ id: string }>("create_bookmark", { data });

export const updateBookmark = (id: string, data: BookmarkPayload) =>
  call<Ok>("update_bookmark", { id, data });

export const deleteBookmark = (id: string) => call<Ok>("delete_bookmark", { id });

/** Refuses (rejects) when it cannot save a safety backup first. */
export const deleteAllBookmarks = () => call<Ok>("delete_all_bookmarks");

export const togglePin = (id: string) => call<{ is_pinned: boolean }>("toggle_pin", { id });

export const recordAccess = (id: string) => call<Ok>("increment_access", { id });

export const reorderBookmarks = (order: { id: string; custom_order: number }[]) =>
  call<Ok>("reorder_bookmarks", { order });

export const fetchPageTitle = (url: string) => call<{ title: string }>("fetch_title", { url });

// ---------- Site icons ----------

export const fetchFavicon = (id: string, url: string) =>
  call<{ favicon: string | null }>("fetch_favicon", { id, url });

export const countMissingFavicons = () => call<{ count: number }>("count_missing_favicons");

export const fetchMissingFavicons = () =>
  call<{ total: number; updated: number; cancelled: boolean }>("fetch_missing_favicons");

export const cancelFetchFavicons = () => call<Ok>("cancel_fetch_favicons");

// ---------- Folder search ----------

/** `queryTerms`: each search term's forms (`buildQueryTerms`); a name must match them all. */
export const searchInFolders = (query: string, queryTerms: string[][]) =>
  call<FolderSearchResult>("search_in_folders", { query, queryTerms });

// ---------- Tags ----------

export const listTags = () => call<Tag[]>("list_tags");

/** Returns the existing tag's id when one with this name already exists. */
export const createTag = (name: string, color: string | null = null) =>
  call<{ id: string }>("create_tag", { name, color });

export const renameTag = (id: string, name: string) => call<Ok>("update_tag", { id, name });

export const setTagColor = (id: string, color: string | null) =>
  call<Ok>("set_tag_color", { id, color });

export const reorderTags = (order: { id: string; sort_order: number }[]) =>
  call<Ok>("reorder_tags", { order });

export const deleteTag = (id: string) => call<Ok>("delete_tag", { id });

export const deleteAllTags = () => call<Ok>("delete_all_tags");

/** Add or remove one tag on many bookmarks, touching nothing else on them. */
export const setTagOnBookmarks = (tagId: string, bookmarkIds: string[], add: boolean) =>
  call<{ changed: number }>("set_tag_on_bookmarks", { tagId, bookmarkIds, add });

// ---------- Tag rules ----------

export const listTagRules = () => call<TagRuleDB[]>("list_tag_rules");

export const createTagRule = (data: {
  match_type: MatchType;
  pattern: string;
  tag_id: string;
  target_field: TargetField;
}) => call<{ id: string }>("create_tag_rule", { data });

export const deleteTagRule = (id: string) => call<Ok>("delete_tag_rule", { id });

// ---------- Settings ----------

export interface SettingsRecord {
  list_columns: 1 | 2 | 3 | 4;
  sort_option: SortOption;
  sort_order: SortOrder;
  summon_shortcut: string;
  shortcut_dir_enabled: boolean;
  shortcut_dir_path: string | null;
  folder_search_enabled: boolean;
}

export const getSettings = () => call<SettingsRecord>("get_settings");

/**
 * `failed` lists summon-hotkey combos the OS would not register (taken by
 * another app); the settings themselves are saved regardless.
 */
export const updateSettings = (data: SettingsRecord) =>
  call<{ ok: true; failed: string[] }>("update_settings", { data });

// ---------- Shortcut folder ----------

/** `enabled: false` when the feature is off; otherwise what the sync did. */
export const syncShortcutDir = () =>
  call<
    | { enabled: false }
    | { dir: string; created: number; removed: number; skipped: string[] }
  >("sync_shortcut_dir");

export const pickShortcutDir = () =>
  call<{ cancelled: true } | { path: string }>("pick_shortcut_dir");

export const openShortcutDir = () => call<Ok>("open_shortcut_dir");

/** Each reports the pin state the shell shows afterwards, not the one asked for. */
export const pinShortcutDir = () => call<{ pinned: boolean }>("pin_shortcut_dir");
export const unpinShortcutDir = () => call<{ pinned: boolean }>("unpin_shortcut_dir");
export const isShortcutDirPinned = () => call<{ pinned: boolean }>("shortcut_dir_pinned");
