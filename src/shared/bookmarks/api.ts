import { TagRuleLike, getAutoTagNames, mergeBookmarkTags } from "./form";
import * as backend from "@/lib/backend";

/**
 * Bookmark operations that apply the tag rules on the way in. The app's add
 * form, edit form and HTML import all create and update through here, so a
 * rule tags a bookmark the same way whichever of them saved it.
 *
 * App-only: these call the Rust backend through Tauri. The browser extension
 * shares `form.ts`, not this file, and reaches the app over its local HTTP API.
 */

export interface BookmarkApiInput {
  title: string;
  url: string;
  kind?: "url" | "path";
  favicon?: string;
  isPinned: boolean;
  tags: string[];
  memo?: string;
  shortcut?: string;
  /** Create only: when the bookmark was originally added (e.g. from an import). */
  createdAt?: string;
}

export interface TagApiItem {
  id: string;
  name: string;
}

export interface BookmarkListItem {
  id: string;
  title: string;
  url: string;
}

export interface TagRuleApiItem extends TagRuleLike {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RuleContext {
  availableTags?: TagApiItem[];
  tagRules?: TagRuleApiItem[];
}

export async function fetchBookmarkPageTitle(url: string): Promise<string> {
  const { title } = await backend.fetchPageTitle(url);
  return title ?? "";
}

export async function fetchTags(): Promise<TagApiItem[]> {
  return backend.listTags();
}

export async function fetchBookmarks(): Promise<BookmarkListItem[]> {
  return backend.listBookmarks();
}

export async function fetchTagRules(): Promise<TagRuleApiItem[]> {
  const rules = await backend.listTagRules();
  return rules.map((rule) => ({
    id: rule.id,
    matchType: rule.match_type,
    pattern: rule.pattern,
    tagId: rule.tag_id,
    targetField: rule.target_field,
    createdAt: rule.created_at,
    updatedAt: rule.updated_at,
  }));
}

function toPayload(bookmark: BookmarkApiInput, options?: RuleContext): backend.BookmarkPayload {
  const autoTagNames = getAutoTagNames(
    options?.tagRules ?? [],
    options?.availableTags ?? [],
    bookmark
  );
  return {
    title: bookmark.title,
    url: bookmark.url,
    kind: bookmark.kind ?? "url",
    favicon: bookmark.favicon,
    is_pinned: bookmark.isPinned,
    tags: mergeBookmarkTags(bookmark.tags, autoTagNames),
    memo: bookmark.memo ?? null,
    shortcut: bookmark.shortcut ?? null,
  };
}

export async function createBookmark(
  bookmark: BookmarkApiInput,
  options?: RuleContext
): Promise<{ id: string }> {
  return backend.createBookmark({
    ...toPayload(bookmark, options),
    created_at: bookmark.createdAt ?? null,
  });
}

export async function updateBookmark(
  id: string,
  bookmark: BookmarkApiInput,
  options?: RuleContext
): Promise<{ ok: true }> {
  return backend.updateBookmark(id, toPayload(bookmark, options));
}
