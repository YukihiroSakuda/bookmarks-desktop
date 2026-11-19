import { useState, useCallback, useEffect, useMemo } from "react";
import { BookmarkUI, SortOption, SortOrder } from "@/types/bookmark";
import { createBookmarkComparator } from "@/lib/bookmarkScore";
import { createBookmarkFilter, searchableFields } from "@/lib/bookmarkFilter";
import {
  DEFAULT_TAG_MATCH_MODE,
  TagMatchMode,
  readStoredTagMatchMode,
  storeTagMatchMode,
} from "@/lib/tagMatchMode";

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
  // Read after mount: localStorage does not exist in the static prerender.
  const [tagMatchMode, setTagMatchModeState] = useState<TagMatchMode>(DEFAULT_TAG_MATCH_MODE);
  useEffect(() => {
    setTagMatchModeState(readStoredTagMatchMode());
  }, []);
  const setTagMatchMode = useCallback((mode: TagMatchMode) => {
    setTagMatchModeState(mode);
    storeTagMatchMode(mode);
  }, []);

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
      bookmarks.map((bookmark) => ({ bookmark, fields: searchableFields(bookmark) })),
    [bookmarks]
  );

  const filteredAndSortedBookmarks = useMemo(() => {
    // Every term must appear somewhere in title, URL or memo (see searchQuery.ts).
    const isShown = createBookmarkFilter(searchQuery, selectedTags, tagMatchMode);
    const filtered = searchableBookmarks
      .filter(({ bookmark, fields }) => isShown(fields, bookmark.tags))
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
  }, [
    searchableBookmarks,
    searchQuery,
    selectedTags,
    tagMatchMode,
    currentSort,
    currentOrder,
    isOrderingMode,
  ]);

  return {
    searchQuery,
    setSearchQuery,
    selectedTags,
    setSelectedTags,
    tagMatchMode,
    setTagMatchMode,
    handleTagClick,
    filteredAndSortedBookmarks,
  };
}
