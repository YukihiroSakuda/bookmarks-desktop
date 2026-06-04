import { useState, useCallback, useMemo } from "react";
import { BookmarkUI, SortOption, SortOrder } from "@/types/bookmark";

interface UseBookmarkFilteringOptions {
  bookmarks: BookmarkUI[];
  currentSort: SortOption;
  currentOrder: SortOrder;
  isOrderingMode: boolean;
}

export function useBookmarkFiltering({
  bookmarks,
  currentSort,
  currentOrder,
  isOrderingMode,
}: UseBookmarkFilteringOptions) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const handleTagClick = useCallback(
    (tag: string, ctrlKey: boolean = false) => {
      setSelectedTags((prev) => {
        if (ctrlKey) {
          return prev.includes(tag)
            ? prev.filter((t) => t !== tag)
            : [...prev, tag];
        } else {
          if (prev.includes(tag) && prev.length === 1) {
            return [];
          } else {
            return [tag];
          }
        }
      });
    },
    []
  );

  const filteredAndSortedBookmarks = useMemo(() => {
    const filtered = bookmarks.filter((bookmark) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        bookmark.title.toLowerCase().includes(query) ||
        bookmark.url.toLowerCase().includes(query) ||
        (bookmark.memo ?? "").toLowerCase().includes(query);
      const matchesTags =
        selectedTags.length === 0 ||
        selectedTags.some((tag) => bookmark.tags.includes(tag));
      return matchesSearch && matchesTags;
    });

    let sorted;
    if (isOrderingMode && currentSort === "custom") {
      sorted = filtered;
    } else {
      sorted = [...filtered].sort((a, b) => {
        let comparison = 0;
        switch (currentSort) {
          case "accessCount":
            comparison = (a.accessCount || 0) - (b.accessCount || 0);
            break;
          case "title":
            comparison = a.title.localeCompare(b.title);
            break;
          case "createdAt":
            comparison =
              new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime();
            break;
          case "custom":
            comparison = (a.customOrder || 0) - (b.customOrder || 0);
            break;
        }
        return currentSort === "custom"
          ? comparison
          : currentOrder === "asc"
          ? comparison
          : -comparison;
      });
    }

    return {
      pinned: sorted.filter((b) => b.isPinned),
      unpinned: sorted.filter((b) => !b.isPinned),
    };
  }, [bookmarks, searchQuery, selectedTags, currentSort, currentOrder, isOrderingMode]);

  return {
    searchQuery,
    setSearchQuery,
    selectedTags,
    setSelectedTags,
    handleTagClick,
    filteredAndSortedBookmarks,
  };
}
