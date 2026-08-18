import { BookmarkUI, BookmarkKind } from "@/types/bookmark";
import { Tag } from "@/types/tag";
import { X, Clock, TrendingUp, Loader2, TriangleAlert, FolderOpen, Keyboard, Minus } from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "./Button";
import { Tag as TagComponent } from "./Tag";
import { Input } from "./Input";
import { fetchBookmarkPageTitle } from "@/shared/bookmarks/api";
import { findDuplicateBookmark, detectKind, pathBasename } from "@/shared/bookmarks/form";
import { eventToAccelerator, formatAcceleratorForDisplay } from "@/lib/shortcut";
import { minimizeAppWindow } from "@/lib/appWindow";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface BookmarkFormProps {
  bookmark?: BookmarkUI;
  initialValues?: Partial<Pick<BookmarkUI, "title" | "url" | "tags" | "memo">>;
  onClose: () => void;
  onSave: (bookmarkData: Omit<BookmarkUI, "id">) => void | Promise<void>;
  availableTags: Tag[];
  onUpdateTags: (tags: string[]) => void;
  existingBookmarks?: BookmarkUI[];
}

export function BookmarkForm({
  bookmark,
  initialValues,
  onClose,
  onSave,
  availableTags,
  onUpdateTags,
  existingBookmarks,
}: BookmarkFormProps) {
  const initialUrl = bookmark?.url || initialValues?.url || "";
  const [title, setTitle] = useState(bookmark?.title || initialValues?.title || "");
  const [url, setUrl] = useState(initialUrl);
  const [kind, setKind] = useState<BookmarkKind>(bookmark?.kind ?? detectKind(initialUrl));
  const [tags, setTags] = useState<string[]>(bookmark?.tags || initialValues?.tags || []);
  const [newTag, setNewTag] = useState("");
  const [memo, setMemo] = useState(bookmark?.memo || initialValues?.memo || "");
  const [shortcut, setShortcut] = useState<string | null>(bookmark?.shortcut ?? null);
  const [isCapturingShortcut, setIsCapturingShortcut] = useState(false);
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [duplicateBookmark, setDuplicateBookmark] = useState<BookmarkUI | undefined>(undefined);
  const titleFetchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const titleManuallyEdited = useRef(Boolean(bookmark?.title || initialValues?.title));

  const handleBrowseFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      setKind("path");
      setUrl(selected);
      if (!titleManuallyEdited.current) setTitle(pathBasename(selected));
    }
  };

  // For path bookmarks, default the title to the folder/file name (new bookmark only).
  useEffect(() => {
    if (bookmark || kind !== "path" || titleManuallyEdited.current) return;
    setTitle(url ? pathBasename(url) : "");
  }, [url, kind, bookmark]);

  // Fetch page title when URL changes (new web bookmark only)
  useEffect(() => {
    clearTimeout(titleFetchTimer.current);
    if (bookmark || kind !== "url" || titleManuallyEdited.current) return;

    let isValid = false;
    try {
      const parsed = new URL(url);
      isValid = parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch { /* invalid URL */ }

    if (!isValid) return;

    setIsFetchingTitle(true);
    titleFetchTimer.current = setTimeout(async () => {
      try {
        const nextTitle = await fetchBookmarkPageTitle(url);
        if (nextTitle && !titleManuallyEdited.current) {
          setTitle(nextTitle);
        }
      } catch { /* ignore */ }
      setIsFetchingTitle(false);
    }, 500);

    return () => clearTimeout(titleFetchTimer.current);
  }, [url, kind, bookmark]);

  // Duplicate URL check (new bookmarks only)
  useEffect(() => {
    if (bookmark || !existingBookmarks || !url.trim()) {
      setDuplicateBookmark(undefined);
      return;
    }
    setDuplicateBookmark(findDuplicateBookmark(existingBookmarks, url));
  }, [url, bookmark, existingBookmarks]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isCapturingShortcut) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isCapturingShortcut, onClose]);

  // Another bookmark already bound to the captured combo (uniqueness is enforced
  // in-app; `existingBookmarks` excludes the one being edited).
  const shortcutConflict = useMemo(() => {
    if (!shortcut || !existingBookmarks) return undefined;
    return existingBookmarks.find((b) => b.shortcut === shortcut);
  }, [shortcut, existingBookmarks]);

  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === "Escape") {
      setIsCapturingShortcut(false);
      e.currentTarget.blur();
      return;
    }
    const accelerator = eventToAccelerator(e.nativeEvent);
    if (accelerator) {
      setShortcut(accelerator);
      setIsCapturingShortcut(false);
      e.currentTarget.blur();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shortcutConflict) return;
    setIsSaving(true);
    try {
    await onSave({
      title,
      url,
      kind,
      tags,
      isPinned: bookmark?.isPinned || false,
      createdAt: bookmark?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      accessCount: bookmark?.accessCount || 0,
      lastAccessedAt: bookmark?.lastAccessedAt,
      memo: memo || undefined,
      shortcut: shortcut ?? undefined,
    });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTagClick = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleAddTag = (tag: string) => {
    if (!tag.trim()) return;
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
      if (!availableTags.some((t) => t.name === tag)) {
        onUpdateTags([...availableTags.map((t) => t.name), tag]);
      }
    }
    setNewTag("");
  };

  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">
            <span className="text-blue-500">#</span>
            {bookmark ? "Edit Your Bookmark" : "Add New Bookmark"}
          </h2>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={minimizeAppWindow}
              variant="ghost"
              size="sm"
              icon={Minus}
              title="Minimize window"
              aria-label="Minimize window"
            />
            <Button type="button" onClick={onClose} variant="secondary" size="sm">
              Cancel
            </Button>
            <Button type="submit" form="bookmark-form" variant="primary" size="sm" isLoading={isSaving} disabled={Boolean(shortcutConflict)}>
              {bookmark ? "Save Changes" : "Add Bookmark"}
            </Button>
          </div>
        </div>

        <form id="bookmark-form" onSubmit={handleSubmit} className="space-y-3">
          <div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <Input
                  id="url"
                  label={kind === "path" ? "Folder / File Path" : "URL"}
                  type="text"
                  value={url}
                  onChange={(e) => {
                    // Strip surrounding quotes added by "Copy as path" in Explorer
                    const next = e.target.value.replace(/^"(.*)"$/, "$1");
                    setUrl(next);
                    setKind(detectKind(next));
                  }}
                  placeholder="Enter a URL or folder / file path"
                  required
                />
              </div>
              <Button
                type="button"
                onClick={handleBrowseFolder}
                variant="secondary"
                size="md"
                icon={FolderOpen}
                title="Browse folder"
              />
            </div>
            {duplicateBookmark && (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-amber-500">
                <TriangleAlert size={14} className="shrink-0" />
                <span>
                  Already saved as &ldquo;<strong>{duplicateBookmark.title}</strong>&rdquo;
                </span>
              </div>
            )}
          </div>

          <div className="relative">
            <Input
              id="title"
              label="Title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                titleManuallyEdited.current = true;
              }}
              placeholder={isFetchingTitle ? "タイトルを取得中..." : ""}
              required
            />
            {isFetchingTitle && (
              <Loader2 className="absolute right-3 top-8 size-4 animate-spin text-muted-foreground" />
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Shortcut</label>
              {(() => {
                const assigned = (existingBookmarks ?? []).filter((b) => b.shortcut);
                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                        {assigned.length > 0 ? `${assigned.length} assigned` : "None assigned"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 p-3">
                      <p className="text-xs font-medium mb-2">Assigned Shortcuts</p>
                      {assigned.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No shortcuts assigned yet.</p>
                      ) : (
                        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                          {assigned.map((b) => (
                            <div key={b.id} className="flex items-center justify-between gap-2">
                              <span className="text-xs truncate text-muted-foreground min-w-0">{b.title || b.url}</span>
                              <kbd className="shrink-0 inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                                {formatAcceleratorForDisplay(b.shortcut!)}
                              </kbd>
                            </div>
                          ))}
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                );
              })()}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  readOnly
                  value={
                    isCapturingShortcut
                      ? "Press a key combination…"
                      : shortcut
                      ? formatAcceleratorForDisplay(shortcut)
                      : ""
                  }
                  placeholder="Click to set a shortcut"
                  onFocus={() => setIsCapturingShortcut(true)}
                  onBlur={() => setIsCapturingShortcut(false)}
                  onKeyDown={handleShortcutKeyDown}
                  className="w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer caret-transparent"
                />
              </div>
              {shortcut && (
                <Button
                  type="button"
                  onClick={() => setShortcut(null)}
                  variant="secondary"
                  size="md"
                  icon={X}
                  title="Clear shortcut"
                />
              )}
            </div>
            {shortcutConflict ? (
              <div className="flex items-center gap-1.5 mt-1 text-sm text-amber-500">
                <TriangleAlert size={14} className="shrink-0" />
                <span>
                  Already used by &ldquo;<strong>{shortcutConflict.title}</strong>&rdquo;
                </span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Requires at least one modifier (Ctrl / Alt / Shift). Opens this
                bookmark while the app is open.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Tags</label>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add new tag"
                className="flex-1"
              />
              <Button
                type="button"
                onClick={() => handleAddTag(newTag)}
                variant="primary"
                size="md"
              >
                Add
              </Button>
            </div>
            <div className="mt-2 max-h-20 overflow-y-auto">
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((tag) => (
                  <TagComponent
                    key={tag.id}
                    tag={tag.name}
                    isSelected={tags.includes(tag.name)}
                    onClick={() => handleTagClick(tag.name)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="memo"
              className="flex items-center gap-1.5 text-sm font-medium mb-1"
            >
              Memo
            </label>
            <textarea
              id="memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={10000}
              rows={2}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {memo.length}/10,000
            </p>
          </div>

          {bookmark && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 border-t text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <TrendingUp size={13} />
                {bookmark.accessCount || 0} accesses
              </span>
              <span className="flex items-center gap-1">
                <Clock size={13} />
                Created {formatDate(bookmark.createdAt)}
              </span>
              {bookmark.lastAccessedAt && (
                <span className="flex items-center gap-1">
                  <Clock size={13} />
                  Last {formatDate(bookmark.lastAccessedAt)}
                </span>
              )}
            </div>
          )}

        </form>
      </div>
    </div>
  );
}
