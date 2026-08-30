import { BookmarkUI } from "@/types/bookmark";
import { Tag } from "@/types/tag";
import { TagRule } from "@/types/tagRule";
import { UserSettingsUI } from "@/types/userSettings";
import { GroupUI } from "@/types/group";

interface AppCache {
  bookmarks: BookmarkUI[];
  tags: Tag[];
  tagRules: TagRule[];
  settings: UserSettingsUI;
  /** Optional: entries written before groups existed do not carry it. */
  groups?: GroupUI[];
}

const CACHE_KEY = "bm_app_cache";

export function readAppCache(): AppCache | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as AppCache) : null;
  } catch {
    return null;
  }
}

export function writeAppCache(data: AppCache): void {
  if (typeof window === "undefined") return;
  try {
    // Favicons are data URIs of a few KB each — thousands of them would blow
    // the localStorage quota and take the whole cache down with them. They are
    // read from SQLite on the first real load instead.
    // (`undefined` values are dropped by JSON.stringify)
    const bookmarks = data.bookmarks.map((bookmark) => ({ ...bookmark, favicon: undefined }));
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, bookmarks }));
  } catch {}
}
