import { useState, useEffect, useCallback } from "react";
import {
  AlertCircle,
  Loader2,
  Settings,
  ArrowLeft,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  createBookmark,
  fetchBookmarkPageTitle,
  fetchBookmarks,
  fetchTagRules,
  fetchTags,
  type BookmarkListItem,
  type TagApiItem,
  type TagRuleApiItem,
} from "../../src/shared/bookmarks/api";
import { findDuplicateBookmark, isHttpUrl } from "../../src/shared/bookmarks/form";

const DEFAULT_APP_URL = import.meta.env.VITE_APP_URL || "https://bookmarks-local-kltd-20260527.azurewebsites.net";

type Status = "loading" | "idle" | "saving" | "error";

function useAppUrl() {
  const [appUrl, setAppUrl] = useState<string | null>(null);

  useEffect(() => {
    chrome.storage.local.get("appUrl", (result) => {
      setAppUrl(result.appUrl || DEFAULT_APP_URL);
    });
  }, []);

  const saveAppUrl = useCallback((url: string) => {
    const trimmed = url.replace(/\/$/, "");
    chrome.storage.local.set({ appUrl: trimmed }, () => {
      setAppUrl(trimmed);
    });
  }, []);

  return { appUrl, saveAppUrl };
}

function SettingsView({
  appUrl,
  onSave,
  onBack,
}: {
  appUrl: string;
  onSave: (url: string) => void;
  onBack: () => void;
}) {
  const [value, setValue] = useState(appUrl);

  const handleSave = () => {
    if (!value.trim()) return;
    onSave(value.trim());
    onBack();
  };

  return (
    <div className="bg-popover p-6">
      <div className="flex items-center gap-2 mb-6">
        <button onClick={onBack} className="p-1 rounded hover:bg-accent transition-colors">
          <ArrowLeft className="size-4" />
        </button>
        <h2 className="text-base font-semibold">設定</h2>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">アプリのURL</label>
          <input
            type="url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
            placeholder={DEFAULT_APP_URL}
            autoFocus
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">末尾のスラッシュは不要です。</p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onBack}
            className="h-9 px-4 bg-secondary text-secondary-foreground text-sm font-medium rounded-md shadow-sm hover:bg-secondary/80 transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!value.trim()}
            className="h-9 px-4 bg-primary text-primary-foreground text-sm font-medium rounded-md shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

export function Popup() {
  const { appUrl, saveAppUrl } = useAppUrl();
  const [showSettings, setShowSettings] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [memo, setMemo] = useState("");
  const [availableTags, setAvailableTags] = useState<TagApiItem[]>([]);
  const [tagRules, setTagRules] = useState<TagRuleApiItem[]>([]);
  const [existingBookmarks, setExistingBookmarks] = useState<BookmarkListItem[]>([]);
  const [duplicateBookmark, setDuplicateBookmark] = useState<BookmarkListItem | undefined>(undefined);
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [titleEdited, setTitleEdited] = useState(false);
  const [status, setStatus] = useState<Status>("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [isInvalidPage, setIsInvalidPage] = useState(false);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "GET_CURRENT_TAB" },
      (response: { url: string; title: string }) => {
        if (response) {
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
          setTitleEdited(false);
          setStatus("idle");
        }
      }
    );
  }, []);

  useEffect(() => {
    if (!appUrl) return;

    const loadData = async () => {
      try {
        const [nextTags, nextTagRules, nextBookmarks] = await Promise.all([
          fetchTags(appUrl),
          fetchTagRules(appUrl),
          fetchBookmarks(appUrl),
        ]);
        setAvailableTags(nextTags);
        setTagRules(nextTagRules);
        setExistingBookmarks(nextBookmarks);
      } catch (error) {
        console.error("Error loading popup data:", error);
        setErrorMessage(error instanceof Error ? error.message : "Failed to load data");
      }
    };

    loadData();
  }, [appUrl]);

  useEffect(() => {
    setDuplicateBookmark(findDuplicateBookmark(existingBookmarks, url));
  }, [existingBookmarks, url]);

  useEffect(() => {
    if (!appUrl || !isHttpUrl(url) || titleEdited) return;

    const timer = setTimeout(async () => {
      setIsFetchingTitle(true);
      try {
        const nextTitle = await fetchBookmarkPageTitle(url, appUrl);
        if (nextTitle && !titleEdited) {
          setTitle(nextTitle);
        }
      } catch {
        // ignore title fetch failures in popup
      } finally {
        setIsFetchingTitle(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [appUrl, titleEdited, url]);

  const handleTagToggle = useCallback((tagName: string) => {
    setTags((prev) =>
      prev.includes(tagName)
        ? prev.filter((tag) => tag !== tagName)
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
    if (!url || !title || !appUrl) return;

    setStatus("saving");
    setErrorMessage("");

    try {
      await createBookmark(
        {
          title,
          url,
          tags,
          isPinned: false,
          memo: memo.trim() || undefined,
        },
        {
          baseUrl: appUrl,
          availableTags,
          tagRules,
        }
      );

      setExistingBookmarks((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          title,
          url,
        },
      ]);
      window.close();
    } catch (error) {
      console.error("Error saving bookmark:", error);
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to save bookmark");
    }
  }, [appUrl, availableTags, memo, tagRules, tags, title, url]);

  if (showSettings || appUrl === "") {
    return (
      <SettingsView
        appUrl={appUrl ?? ""}
        onSave={saveAppUrl}
        onBack={() => setShowSettings(false)}
      />
    );
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

  if (status === "loading" || appUrl === null) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="size-5 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="bg-popover p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">
          <span className="text-blue-500">#</span>
          Add New Bookmark
        </h2>
        <button
          onClick={() => setShowSettings(true)}
          className="p-1.5 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="設定"
        >
          <Settings className="size-4" />
        </button>
      </div>

      {status === "error" && (
        <div className="mb-4 p-2 bg-muted border border-border rounded-lg flex items-start gap-2">
          <AlertCircle className="size-4 text-blue-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-muted-foreground">{errorMessage}</p>
        </div>
      )}

      <div className="space-y-4">
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
                Already saved as &ldquo;<strong>{duplicateBookmark.title}</strong>&rdquo;
              </span>
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium mb-1">Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setTitleEdited(true);
            }}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          {isFetchingTitle && (
            <Loader2 className="absolute right-3 top-9 size-4 animate-spin text-muted-foreground" />
          )}
        </div>

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
              .filter((tag) => !availableTags.some((item) => item.name === tag))
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

        <div>
          <label className="flex items-center gap-1.5 text-sm font-medium mb-1">Memo</label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={10000}
            rows={3}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">{memo.length}/10,000</p>
        </div>

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
