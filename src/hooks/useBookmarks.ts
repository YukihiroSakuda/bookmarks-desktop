import { useState, useCallback, useRef } from "react";
import { toast } from "sonner";
import { BookmarkUI, convertToUI } from "@/types/bookmark";
import { Tag } from "@/types/tag";
import { TagRule } from "@/types/tagRule";
import { createBookmark, updateBookmark } from "@/shared/bookmarks/api";
import { tauriFetch as fetch } from "@/lib/tauriFetch";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Ask the backend to fetch the site's favicon and store it on the bookmark,
 * then refresh so the card picks it up. Failures are silent — the card just
 * keeps the generic globe.
 */
async function fetchFaviconInBackground(
  id: string,
  url: string,
  refresh: () => Promise<void>
): Promise<void> {
  try {
    const res = await fetch(`/api/bookmarks/${id}/favicon`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!res.ok) return;
    const { favicon } = await res.json();
    if (favicon) await refresh();
  } catch {
    /* offline, unreachable site, no icon — nothing to do */
  }
}

interface UseBookmarksOptions {
  tagRules: TagRule[];
  availableTags: Tag[];
  fetchTags: () => Promise<Tag[]>;
}

export function useBookmarks(options: UseBookmarksOptions) {
  const [bookmarks, setBookmarks] = useState<BookmarkUI[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedBookmark, setSelectedBookmark] = useState<BookmarkUI | undefined>(undefined);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const fetchBookmarks = useCallback(async () => {
    const res = await fetch("/api/bookmarks");
    if (!res.ok) throw new Error("Failed to fetch bookmarks");
    const data = await res.json();
    const formatted = data.map(convertToUI);
    setBookmarks(formatted);
    return formatted;
  }, []);

  const refreshAfterMutation = useCallback(async () => {
    const [bookmarksRes] = await Promise.all([
      fetch("/api/bookmarks"),
      optionsRef.current.fetchTags(),
    ]);
    if (!bookmarksRes.ok) throw new Error("Failed to fetch bookmarks");
    const data = await bookmarksRes.json();
    setBookmarks(data.map(convertToUI));
  }, []);

  const handleBookmarksUpdate = useCallback(
    async (updatedBookmarks: BookmarkUI[]) => {
      setBookmarks(updatedBookmarks);
      try {
        await optionsRef.current.fetchTags();
      } catch (error) {
        console.error("Error updating tags:", error);
      }
    },
    []
  );

  const handleSave = useCallback(
    async (bookmarkData: Omit<BookmarkUI, "id">) => {
      try {
        const { tagRules, availableTags } = optionsRef.current;

        if (selectedBookmark) {
          await updateBookmark(selectedBookmark.id, bookmarkData, {
            availableTags,
            tagRules,
          });
        } else {
          const created = await createBookmark(bookmarkData, {
            availableTags,
            tagRules,
          });
          // Fetch the site's icon once, in the background: the card appears
          // right away and gains its icon a moment later.
          if ((bookmarkData.kind ?? "url") === "url") {
            void fetchFaviconInBackground(created.id, bookmarkData.url, refreshAfterMutation);
          }
        }

        setIsModalOpen(false);
        setSelectedBookmark(undefined);
        await refreshAfterMutation();
        toast.success("Bookmark saved");
      } catch (error) {
        console.error("Error saving bookmark:", error);
        toast.error(error instanceof Error ? error.message : "Failed to save bookmark");
      }
    },
    [selectedBookmark, refreshAfterMutation]
  );

  const handleEdit = useCallback((bookmark: BookmarkUI) => {
    setSelectedBookmark(bookmark);
    setIsModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/bookmarks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      toast.success("Bookmark deleted");
    } catch (error) {
      console.error("Error deleting bookmark:", error);
      toast.error(error instanceof Error ? error.message : "Failed to delete bookmark");
    }
  }, []);

  const handleTogglePin = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/bookmarks/${id}/pin`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to toggle pin");
      const { is_pinned } = await res.json();
      let movedTitle = "";
      setBookmarks((prev) =>
        prev.map((b) => {
          if (b.id === id) {
            movedTitle = b.title;
            return { ...b, isPinned: is_pinned };
          }
          return b;
        })
      );
      toast(
        is_pinned
          ? `Pinned "${movedTitle}"`
          : `Unpinned "${movedTitle}"`
      );
      // Pinning/unpinning moves the card between the Pinned and Other
      // sections. Scroll it into view after the list re-renders so the change
      // is visible even when its new position was off-screen, then flash it so
      // the user can spot the moved card. Two rAFs let the moved DOM settle.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-bookmark-id="${id}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          if (el) {
            el.classList.remove("bookmark-flash");
            // Force reflow so re-adding the class restarts the animation.
            void (el as HTMLElement).offsetWidth;
            el.classList.add("bookmark-flash");
            el.addEventListener(
              "animationend",
              () => el.classList.remove("bookmark-flash"),
              { once: true }
            );
          }
        });
      });
    } catch (error) {
      console.error("Error toggling pin:", error);
      toast.error(error instanceof Error ? error.message : "Failed to toggle pin");
    }
  }, []);

  const handleBookmarkClick = useCallback(async (bookmark: BookmarkUI) => {
    try {
      if (bookmark.kind === "path") {
        await invoke("open_path", { path: bookmark.url });
      } else {
        // URL: open in the system default browser. `window.open` does not work
        // inside the Tauri webview, so use the opener plugin.
        await openUrl(bookmark.url);
      }

      const newCount = (bookmark.accessCount || 0) + 1;
      setBookmarks((prev) =>
        prev.map((b) => b.id === bookmark.id ? { ...b, accessCount: newCount } : b)
      );
      await fetch(`/api/bookmarks/${bookmark.id}/access`, { method: "PATCH" });
    } catch (error) {
      console.error("Error opening bookmark:", error);
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, []);

  return {
    bookmarks,
    setBookmarks,
    isModalOpen,
    setIsModalOpen,
    selectedBookmark,
    setSelectedBookmark,
    fetchBookmarks,
    handleBookmarksUpdate,
    handleSave,
    handleEdit,
    handleDelete,
    handleTogglePin,
    handleBookmarkClick,
  };
}
