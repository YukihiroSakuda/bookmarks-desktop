export interface BookmarkUrlLike {
  url: string;
}

export interface TagLike {
  id: string;
  name: string;
}

export interface TagRuleLike {
  pattern: string;
  tagId: string;
  targetField: "title" | "url";
  matchType: "starts_with" | "contains" | "ends_with";
}

export interface BookmarkDraftLike {
  title: string;
  url: string;
  tags: string[];
}

export function normalizeBookmarkUrl(url: string): string {
  return url.trim().toLowerCase().replace(/\/$/, "");
}

/**
 * Detect whether a string looks like a local/network file-system path
 * (Windows drive `C:\`, UNC `\\server\share`, or a `file://` URL) versus a web URL.
 */
export function detectKind(value: string): "url" | "path" {
  const v = value.trim();
  if (/^[a-zA-Z]:[\\/]/.test(v)) return "path"; // C:\ or C:/
  if (/^\\\\/.test(v)) return "path"; // \\server\share (UNC)
  if (/^file:\/\//i.test(v)) return "path"; // file:// URL
  return "url";
}

/** Last path segment (folder or file name) of a Windows/UNC path. */
export function pathBasename(p: string): string {
  const cleaned = p.replace(/^file:\/\//i, "").replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : cleaned;
}

export function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function findDuplicateBookmark<T extends BookmarkUrlLike>(
  bookmarks: T[],
  url: string
): T | undefined {
  if (!isHttpUrl(url)) return undefined;

  const normalizedUrl = normalizeBookmarkUrl(url);
  return bookmarks.find((bookmark) => normalizeBookmarkUrl(bookmark.url) === normalizedUrl);
}

/**
 * Whether `value` satisfies the rule's match strategy against `pattern`.
 * Comparison is case-insensitive. Shared by auto-tagging and tag-rule application.
 */
export function matchesPattern(
  matchType: TagRuleLike["matchType"],
  value: string,
  pattern: string
): boolean {
  const v = value.toLowerCase();
  const p = pattern.toLowerCase();

  if (matchType === "starts_with") return v.startsWith(p);
  if (matchType === "contains") return v.includes(p);
  if (matchType === "ends_with") return v.endsWith(p);
  return false;
}

export function getAutoTagNames(
  rules: TagRuleLike[],
  availableTags: TagLike[],
  bookmark: Pick<BookmarkDraftLike, "title" | "url">
): string[] {
  const autoTagIds = rules
    .filter((rule) => {
      const target = rule.targetField === "title" ? bookmark.title : bookmark.url;
      return matchesPattern(rule.matchType, target, rule.pattern);
    })
    .map((rule) => rule.tagId);

  return availableTags
    .filter((tag) => autoTagIds.includes(tag.id))
    .map((tag) => tag.name);
}

export function mergeBookmarkTags(manualTags: string[], autoTags: string[]): string[] {
  return Array.from(new Set([...manualTags, ...autoTags]));
}