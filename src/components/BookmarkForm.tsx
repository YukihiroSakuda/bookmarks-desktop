import { BookmarkUI, BookmarkKind } from "@/types/bookmark";
import { Tag } from "@/types/tag";
import { X, Clock, TrendingUp, Loader2, TriangleAlert, FolderOpen } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "./Button";
import { Tag as TagComponent } from "./Tag";
import { Input } from "./Input";
import { fetchBookmarkPageTitle } from "@/shared/bookmarks/api";
import { findDuplicateBookmark, detectKind, pathBasename } from "@/shared/bookmarks/form";

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            <span className="text-blue-500">#</span>
            {bookmark ? "Edit Your Bookmark" : "Add New Bookmark"}
          </h2>
          <Button onClick={onClose} variant="ghost" size="sm" icon={X} />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="mt-2">
              <label className="block text-sm font-medium mb-1">
                Available Tags
              </label>
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
              rows={3}
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {memo.length}/10,000
            </p>
          </div>

          {bookmark && (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center gap-2 text-sm">
                <TrendingUp size={16} />
                <span>Access Count: {bookmark.accessCount || 0}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock size={16} />
                <span>Created: {formatDate(bookmark.createdAt)}</span>
              </div>
              {bookmark.lastAccessedAt && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock size={16} />
                  <span>
                    Last Accessed: {formatDate(bookmark.lastAccessedAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-6">
            <Button
              type="button"
              onClick={onClose}
              variant="secondary"
              size="md"
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="md" isLoading={isSaving}>
              {bookmark ? "Save Changes" : "Add Bookmark"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
