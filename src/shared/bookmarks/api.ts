import { TagRuleLike, getAutoTagNames, mergeBookmarkTags } from "./form";
import { tauriFetch as fetch } from "@/lib/tauriFetch";

export interface BookmarkApiInput {
  title: string;
  url: string;
  kind?: "url" | "path";
  favicon?: string;
  isPinned: boolean;
  tags: string[];
  memo?: string;
  shortcut?: string;
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

interface TagRuleApiResponse {
  id: string;
  match_type: "starts_with" | "contains" | "ends_with";
  pattern: string;
  tag_id: string;
  target_field: "title" | "url";
  created_at?: string;
  updated_at?: string;
}

function buildApiUrl(path: string, baseUrl = ""): string {
  if (!baseUrl) return path;
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  return `${normalizedBaseUrl}${path}`;
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const errorData = await response.json() as { error?: string };
      if (errorData.error) message = errorData.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

export async function fetchBookmarkPageTitle(url: string, baseUrl = ""): Promise<string> {
  const data = await requestJson<{ title?: string }>(
    buildApiUrl(`/api/bookmarks/title?url=${encodeURIComponent(url)}`, baseUrl)
  );
  return data.title ?? "";
}

export async function fetchTags(baseUrl = ""): Promise<TagApiItem[]> {
  return requestJson<TagApiItem[]>(buildApiUrl("/api/tags", baseUrl));
}

export async function fetchBookmarks(baseUrl = ""): Promise<BookmarkListItem[]> {
  return requestJson<BookmarkListItem[]>(buildApiUrl("/api/bookmarks", baseUrl));
}

export async function fetchTagRules(baseUrl = ""): Promise<TagRuleApiItem[]> {
  const rules = await requestJson<TagRuleApiResponse[]>(buildApiUrl("/api/tag-rules", baseUrl));
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

export async function createBookmark(
  bookmark: BookmarkApiInput,
  options?: {
    baseUrl?: string;
    availableTags?: TagApiItem[];
    tagRules?: TagRuleApiItem[];
  }
): Promise<{ id: string }> {
  const autoTagNames = getAutoTagNames(
    options?.tagRules ?? [],
    options?.availableTags ?? [],
    bookmark
  );

  return requestJson<{ id: string }>(buildApiUrl("/api/bookmarks", options?.baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: bookmark.title,
      url: bookmark.url,
      kind: bookmark.kind ?? "url",
      favicon: bookmark.favicon,
      is_pinned: bookmark.isPinned,
      tags: mergeBookmarkTags(bookmark.tags, autoTagNames),
      memo: bookmark.memo ?? null,
      shortcut: bookmark.shortcut ?? null,
    }),
  });
}

export async function updateBookmark(
  id: string,
  bookmark: BookmarkApiInput,
  options?: {
    baseUrl?: string;
    availableTags?: TagApiItem[];
    tagRules?: TagRuleApiItem[];
  }
): Promise<{ ok: true }> {
  const autoTagNames = getAutoTagNames(
    options?.tagRules ?? [],
    options?.availableTags ?? [],
    bookmark
  );

  return requestJson<{ ok: true }>(buildApiUrl(`/api/bookmarks/${id}`, options?.baseUrl), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: bookmark.title,
      url: bookmark.url,
      kind: bookmark.kind ?? "url",
      favicon: bookmark.favicon,
      is_pinned: bookmark.isPinned,
      tags: mergeBookmarkTags(bookmark.tags, autoTagNames),
      memo: bookmark.memo ?? null,
      shortcut: bookmark.shortcut ?? null,
    }),
  });
}