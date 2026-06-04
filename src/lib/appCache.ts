import { BookmarkUI } from "@/types/bookmark";
import { Tag } from "@/types/tag";
import { TagRule } from "@/types/tagRule";
import { UserSettingsUI } from "@/types/userSettings";

interface AppCache {
  bookmarks: BookmarkUI[];
  tags: Tag[];
  tagRules: TagRule[];
  settings: UserSettingsUI;
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
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {}
}
