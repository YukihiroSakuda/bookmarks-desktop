import { useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  Loader2,
  TriangleAlert,
  X,
  PowerOff,
  RefreshCw,
} from "lucide-react";
import {
  findDuplicateBookmark,
  getAutoTagNames,
  mergeBookmarkTags,
} from "../../src/shared/bookmarks/form";

const APP_URL = import.meta.env.VITE_APP_URL || "http://localhost:37373";

// ---------- Types ----------

type TagApiItem = { id: string; name: string };
type TagRuleRaw = {
  id: string;
  match_type: "starts_with" | "contains" | "ends_with";
  pattern: string;
  tag_id: string;
  target_field: "title" | "url";
};
type TagRuleItem = {
  id: string;
  matchType: "starts_with" | "contains" | "ends_with";
  pattern: string;
  tagId: string;
  targetField: "title" | "url";
};
type BookmarkItem = { id: string; title: string; url: string };
type Status = "loading" | "idle" | "saving" | "error";

// ---------- Helpers ----------

function isNetworkError(error: unknown): boolean {
  return error instanceof TypeError;
}

// ---------- API helpers ----------

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

async function fetchTags(baseUrl: string): Promise<TagApiItem[]> {
  return apiFetch<TagApiItem[]>(`${baseUrl}/api/tags`);
}

async function fetchTagRules(baseUrl: string): Promise<TagRuleItem[]> {
  const raw = await apiFetch<TagRuleRaw[]>(`${baseUrl}/api/tag-rules`);
  return raw.map((r) => ({
    id: r.id,
    matchType: r.match_type,
    pattern: r.pattern,
    tagId: r.tag_id,
    targetField: r.target_field,
  }));
}

async function fetchBookmarks(baseUrl: string): Promise<BookmarkItem[]> {
  const data = await apiFetch<{ id: string; title: string; url: string }[]>(
    `${baseUrl}/api/bookmarks`
  );
  return data.map((b) => ({ id: b.id, title: b.title, url: b.url }));
}

async function saveBookmark(
  baseUrl: string,
  payload: {
    title: string;
    url: string;
    tags: string[];
    memo: string;
    availableTags: TagApiItem[];
    tagRules: TagRuleItem[];
  }
): Promise<void> {
  const autoTagNames = getAutoTagNames(
    payload.tagRules,
    payload.availableTags,
    { title: payload.title, url: payload.url }
  );
  const finalTags = mergeBookmarkTags(payload.tags, autoTagNames);

  await apiFetch(`${baseUrl}/api/bookmarks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      url: payload.url,
      kind: "url",
      is_pinned: false,
      tags: finalTags,
      memo: payload.memo.trim() || null,
    }),
  });
}

// ---------- ServerDownView ----------

function ServerDownView({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="bg-card p-6 text-center space-y-4">
      <PowerOff className="size-10 mx-auto text-muted-foreground" />
      <div>
        <h2 className="text-base font-semibold mb-1">アプリが起動していません</h2>
        <p className="text-sm text-muted-foreground">
          ブックマークアプリを起動してから再度お試しください。
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow hover:bg-primary/90 transition-colors flex items-center gap-1.5 mx-auto"
      >
        <RefreshCw className="size-3.5" />
        再試行
      </button>
    </div>
  );
}

// ---------- Popup ----------

export function Popup() {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [memo, setMemo] = useState("");
  const [availableTags, setAvailableTags] = useState<TagApiItem[]>([]);
  const [tagRules, setTagRules] = useState<TagRuleItem[]>([]);
  const [existingBookmarks, setExistingBookmarks] = useState<BookmarkItem[]>([]);
  const [duplicateBookmark, setDuplicateBookmark] = useState<
    BookmarkItem | undefined
  >(undefined);

  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [isInvalidPage, setIsInvalidPage] = useState(false);
  const [serverDown, setServerDown] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  const handleRetry = useCallback(() => {
    setServerDown(false);
    setErrorMessage("");
    setLoadKey((k) => k + 1);
  }, []);

  // Get current tab URL/title from service worker
  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "GET_CURRENT_TAB" },
      (response: { url: string; title: string }) => {
        if (!response) return;
        const tabUrl = response.url;
        if (
          tabUrl.startsWith("chrome://") ||
          tabUrl.startsWith("chrome-extension://") ||
          tabUrl.startsWith("edge://") ||
          tabUrl.startsWith("about:") ||
          tabUrl.startsWith("file://")
        ) {
          setIsInvalidPage(true);
          return;
        }
        setUrl(tabUrl);
        setTitle(response.title);
        setStatus("idle");
      }
    );
  }, []);

  // Load tags, tag rules, existing bookmarks from local API
  useEffect(() => {
    const load = async () => {
      try {
        const [nextTags, nextTagRules, nextBookmarks] = await Promise.all([
          fetchTags(APP_URL),
          fetchTagRules(APP_URL),
          fetchBookmarks(APP_URL),
        ]);
        setAvailableTags(nextTags);
        setTagRules(nextTagRules);
        setExistingBookmarks(nextBookmarks);
        setServerDown(false);
      } catch (error) {
        if (isNetworkError(error)) {
          setServerDown(true);
        } else {
          setErrorMessage(
            error instanceof Error ? error.message : "Failed to load data"
          );
        }
      }
    };
    load();
  }, [loadKey]);

  // Duplicate detection
  useEffect(() => {
    setDuplicateBookmark(findDuplicateBookmark(existingBookmarks, url));
  }, [existingBookmarks, url]);

  const handleTagToggle = useCallback((tagName: string) => {
    setTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((t) => t !== tagName)
        : [...prev, tagName]
    );
  }, []);

  const handleAddTag = useCallback(() => {
    const trimmed = newTag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    setTags((prev) => [...prev, trimmed]);
    setNewTag("");
  }, [newTag, tags]);

  const handleSave = useCallback(async () => {
    if (!url || !title) return;
    setStatus("saving");
    setErrorMessage("");
    try {
      await saveBookmark(APP_URL, { title, url, tags, memo, availableTags, tagRules });
      setExistingBookmarks((prev) => [
        ...prev,
        { id: crypto.randomUUID(), title, url },
      ]);
      window.close();
    } catch (error) {
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to save bookmark"
      );
    }
  }, [availableTags, memo, tagRules, tags, title, url]);

  if (serverDown) {
    return <ServerDownView onRetry={handleRetry} />;
  }

  if (isInvalidPage) {
    return (
      <div className="bg-card p-6 text-center">
        <AlertCircle className="size-8 mx-auto mb-3 text-blue-500" />
        <h2 className="text-base font-semibold mb-1">Cannot save this page</h2>
        <p className="text-sm text-muted-foreground">
          Browser internal pages cannot be bookmarked.
        </p>
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="bg-popover p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">
          <span className="text-blue-500">#</span>
          Add New Bookmark
        </h2>
      </div>

      {status === "error" && (
        <div className="mb-4 p-2 bg-muted border border-border rounded-lg flex items-start gap-2">
          <AlertCircle className="size-4 text-blue-500 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">{errorMessage}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* URL */}
        <div>
          <label className="block text-sm font-medium mb-1">URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {duplicateBookmark && (
            <div className="flex items-center gap-1.5 mt-1 text-sm text-amber-500">
              <TriangleAlert className="size-4 shrink-0" />
              <span>
                Already saved as &ldquo;
                <strong>{duplicateBookmark.title}</strong>&rdquo;
              </span>
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
            }}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium mb-1">Tags</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddTag();
                }
              }}
              placeholder="Add new tag"
              className="h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
            />
            <button
              type="button"
              onClick={handleAddTag}
              className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow hover:bg-primary/90 transition-colors"
            >
              Add
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {availableTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => handleTagToggle(tag.name)}
                className={`px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                  tags.includes(tag.name)
                    ? "bg-blue-500 text-white"
                    : "bg-secondary text-secondary-foreground hover:bg-accent"
                }`}
              >
                {tag.name}
              </button>
            ))}
            {tags
              .filter((t) => !availableTags.some((a) => a.name === t))
              .map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs font-medium rounded-full bg-blue-500 text-white flex items-center gap-1"
                >
                  {tag}
                  <button type="button" onClick={() => handleTagToggle(tag)}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
          </div>
        </div>

        {/* Memo */}
        <div>
          <label className="block text-sm font-medium mb-1">Memo</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={10000}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {memo.length}/10,000
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={() => window.close()}
            className="h-9 px-4 bg-secondary text-secondary-foreground text-sm font-medium rounded-md shadow-sm hover:bg-secondary/80 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={status === "saving" || !title || !url}
            className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {status === "saving" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Add Bookmark"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
