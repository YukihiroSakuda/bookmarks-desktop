import { useState, useCallback, useMemo } from "react";
import { BookmarkUI, SortOption, SortOrder } from "@/types/bookmark";
import { createBookmarkComparator } from "@/lib/bookmarkScore";
import { buildQueryForms, matchesAnyForm, normalizeForSearch } from "@/lib/searchNormalize";

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

  // A bookmark's text is unchanged between keystrokes — only the query moves.
  // Normalizing here, keyed on the list alone, keeps a keystroke down to the
  // substring comparisons instead of re-normalizing every field of every
  // bookmark to the same result it had a moment ago.
  const searchableBookmarks = useMemo(
    () =>
      bookmarks.map((bookmark) => ({
        bookmark,
        title: normalizeForSearch(bookmark.title),
        url: normalizeForSearch(bookmark.url),
        memo: normalizeForSearch(bookmark.memo ?? ""),
      })),
    [bookmarks]
  );

  const filteredAndSortedBookmarks = useMemo(() => {
    const queryForms = buildQueryForms(searchQuery);
    const filtered = searchableBookmarks
      .filter(({ bookmark, title, url, memo }) => {
        const matchesSearch =
          matchesAnyForm(title, queryForms) ||
          matchesAnyForm(url, queryForms) ||
          matchesAnyForm(memo, queryForms);
        const matchesTags =
          selectedTags.length === 0 ||
          selectedTags.some((tag) => bookmark.tags.includes(tag));
        return matchesSearch && matchesTags;
      })
      .map(({ bookmark }) => bookmark);

    let sorted;
    if (isOrderingMode && currentSort === "custom") {
      sorted = filtered;
    } else {
      sorted = [...filtered].sort(
        createBookmarkComparator(currentSort, currentOrder)
      );
    }

    return {
      pinned: sorted.filter((b) => b.isPinned),
      unpinned: sorted.filter((b) => !b.isPinned),
    };
  }, [searchableBookmarks, searchQuery, selectedTags, currentSort, currentOrder, isOrderingMode]);

  return {
    searchQuery,
    setSearchQuery,
    selectedTags,
    setSelectedTags,
    handleTagClick,
    filteredAndSortedBookmarks,
  };
}
