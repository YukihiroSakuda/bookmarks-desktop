import { useState, useCallback, useRef } from "react";
import { BookmarkUI, SortOption, SortOrder, convertToUI } from "@/types/bookmark";
import { tauriFetch as fetch } from "@/lib/tauriFetch";

function bookmarkMatchesFilter(
  bookmark: BookmarkUI,
  searchQuery: string,
  selectedTags: string[]
): boolean {
  const matchesSearch = bookmark.title.toLowerCase().includes(searchQuery.toLowerCase());
  const matchesTags = selectedTags.length === 0 || selectedTags.some((tag) => bookmark.tags.includes(tag));
  return matchesSearch && matchesTags;
}

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
        // Sort only the bookmarks currently visible under the active search/tag
        // filter, but keep every item (visible or not) in its original slot
        // (array index). This way entering ordering mode never reshuffles
        // hidden bookmarks relative to visible ones just to display the
        // visible subset in customOrder sequence.
        const visibleSlots: number[] = [];
        bookmarks.forEach((bookmark, index) => {
          if (bookmarkMatchesFilter(bookmark, searchQuery, selectedTags)) {
            visibleSlots.push(index);
          }
        });

        const sortedVisible = visibleSlots
          .map((index) => bookmarks[index])
          .sort((a, b) => {
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

        const newBookmarks = [...bookmarks];
        visibleSlots.forEach((slot, i) => {
          newBookmarks[slot] = sortedVisible[i];
        });

        setBookmarks(newBookmarks);
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

        // The visible group for this pin section, in the order currently shown.
        const visibleGroup = prevBookmarks.filter(
          (bookmark) =>
            bookmark.isPinned === isPinned && bookmarkMatchesFilter(bookmark, searchQuery, selectedTags)
        );

        if (
          oldIndex < 0 ||
          oldIndex >= visibleGroup.length ||
          newIndex < 0 ||
          newIndex >= visibleGroup.length
        ) {
          return prevBookmarks;
        }

        const draggedItem = visibleGroup[oldIndex];

        // Figure out which visible items end up adjacent to the dragged item
        // after the move, so we can re-anchor it in the full list without
        // touching anyone else's relative order.
        const reorderedVisible = [...visibleGroup];
        reorderedVisible.splice(oldIndex, 1);
        reorderedVisible.splice(newIndex, 0, draggedItem);

        const leftNeighbor = reorderedVisible[newIndex - 1];
        const rightNeighbor = reorderedVisible[newIndex + 1];

        // Removing a single item never changes the relative order of the rest,
        // so this is safe to use as the base to re-insert into.
        const withoutDragged = prevBookmarks.filter((b) => b.id !== draggedItem.id);

        let insertAt: number;
        if (leftNeighbor) {
          insertAt = withoutDragged.findIndex((b) => b.id === leftNeighbor.id) + 1;
        } else if (rightNeighbor) {
          insertAt = withoutDragged.findIndex((b) => b.id === rightNeighbor.id);
        } else {
          insertAt = withoutDragged.length;
        }

        const result = [...withoutDragged];
        result.splice(insertAt, 0, draggedItem);
        return result;
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
