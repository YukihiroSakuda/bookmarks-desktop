import { useState, useCallback, useRef } from "react";
import { BookmarkUI, SortOption, SortOrder, convertToUI } from "@/types/bookmark";
import { tauriFetch as fetch } from "@/lib/tauriFetch";

interface UseBookmarkOrderingOptions {
  bookmarks: BookmarkUI[];
  setBookmarks: React.Dispatch<React.SetStateAction<BookmarkUI[]>>;
  searchQuery: string;
  selectedTags: string[];
  currentSort: SortOption;
  currentOrder: SortOrder;
  listColumns: 1 | 2 | 3 | 4;
  fetchTags: () => Promise<unknown>;
  isOrderingMode: boolean;
  setIsOrderingMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useBookmarkOrdering(options: UseBookmarkOrderingOptions) {
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [originalBookmarkOrder, setOriginalBookmarkOrder] = useState<BookmarkUI[]>([]);

  const optionsRef = useRef(options);
  optionsRef.current = options;

  const saveCustomOrder = useCallback(async () => {
    setIsSavingOrder(true);
    try {
      const { bookmarks } = optionsRef.current;
      const currentPinned = bookmarks.filter((b) => b.isPinned);
      const currentUnpinned = bookmarks.filter((b) => !b.isPinned);

      const pinnedUpdates = currentPinned.map((bookmark, index) => ({
        id: bookmark.id,
        custom_order: index,
      }));
      const unpinnedUpdates = currentUnpinned.map((bookmark, index) => ({
        id: bookmark.id,
        custom_order: index + 1000,
      }));
      const allUpdates = [...pinnedUpdates, ...unpinnedUpdates];

      optionsRef.current.setBookmarks((prevBookmarks) =>
        prevBookmarks.map((bookmark) => {
          const update = allUpdates.find((u) => u.id === bookmark.id);
          return update ? { ...bookmark, customOrder: update.custom_order } : bookmark;
        })
      );

      const res = await fetch("/api/bookmarks/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: allUpdates }),
      });
      if (!res.ok) throw new Error("Failed to save order");
    } catch (error) {
      console.error("Error saving custom order:", error);
      try {
        const bmRes = await fetch("/api/bookmarks");
        if (bmRes.ok) {
          const data = await bmRes.json();
          optionsRef.current.setBookmarks(data.map(convertToUI));
          await optionsRef.current.fetchTags();
        }
      } catch (retryError) {
        console.error("Error retrying fetch:", retryError);
      }
    } finally {
      setIsSavingOrder(false);
    }
  }, []);

  const handleOrderingModeToggle = useCallback(
    async (enabled: boolean) => {
      const {
        bookmarks,
        setBookmarks,
        searchQuery,
        selectedTags,
        currentSort,
        currentOrder,
        setIsOrderingMode,
      } = optionsRef.current;

      if (enabled) {
        const currentFiltered = bookmarks.filter((bookmark) => {
          const matchesSearch = bookmark.title.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => bookmark.tags.includes(tag));
          return matchesSearch && matchesTags;
        });

        const currentSorted = [...currentFiltered].sort((a, b) => {
          let comparison = 0;
          switch (currentSort) {
            case "accessCount":
              comparison = (a.accessCount || 0) - (b.accessCount || 0);
              break;
            case "title":
              comparison = a.title.localeCompare(b.title);
              break;
            case "createdAt":
              comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
              break;
            case "custom":
              comparison = (a.customOrder || 0) - (b.customOrder || 0);
              break;
          }
          return currentSort === "custom" ? comparison : currentOrder === "asc" ? comparison : -comparison;
        });

        const nonFiltered = bookmarks.filter((bookmark) => {
          const matchesSearch = bookmark.title.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => bookmark.tags.includes(tag));
          return !(matchesSearch && matchesTags);
        });

        setBookmarks([...currentSorted, ...nonFiltered]);
        setOriginalBookmarkOrder([...bookmarks]);
        setIsOrderingMode(true);
      } else {
        const hasOrderChanged = !bookmarks.every(
          (bookmark, index) => originalBookmarkOrder[index]?.id === bookmark.id
        );

        if (hasOrderChanged) {
          await saveCustomOrder();
        }

        setIsOrderingMode(false);
        setOriginalBookmarkOrder([]);
      }
    },
    [originalBookmarkOrder, saveCustomOrder]
  );

  const handleReorder = useCallback(
    (oldIndex: number, newIndex: number, isPinned: boolean) => {
      optionsRef.current.setBookmarks((prevBookmarks) => {
        const { searchQuery, selectedTags } = optionsRef.current;

        const filtered = prevBookmarks.filter((bookmark) => {
          const matchesSearch = bookmark.title.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => bookmark.tags.includes(tag));
          return matchesSearch && matchesTags;
        });

        const pinnedFiltered = filtered.filter((b) => b.isPinned);
        const unpinnedFiltered = filtered.filter((b) => !b.isPinned);

        const sourceArray = isPinned ? pinnedFiltered : unpinnedFiltered;
        const reorderedArray = [...sourceArray];
        const [removed] = reorderedArray.splice(oldIndex, 1);
        reorderedArray.splice(newIndex, 0, removed);

        const reorderedFiltered = isPinned
          ? [...reorderedArray, ...unpinnedFiltered]
          : [...pinnedFiltered, ...reorderedArray];

        const nonFilteredBookmarks = prevBookmarks.filter((bookmark) => {
          const matchesSearch = bookmark.title.toLowerCase().includes(searchQuery.toLowerCase());
          const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => bookmark.tags.includes(tag));
          return !(matchesSearch && matchesTags);
        });

        return [...reorderedFiltered, ...nonFilteredBookmarks];
      });
    },
    []
  );

  return {
    isSavingOrder,
    handleOrderingModeToggle,
    handleReorder,
  };
}
