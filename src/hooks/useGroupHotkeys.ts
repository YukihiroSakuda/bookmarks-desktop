import { useEffect, useRef, type RefObject } from "react";
import { BookmarkUI } from "@/types/bookmark";
import { GroupUI } from "@/types/group";
import { eventToAccelerator } from "@/lib/shortcut";

interface UseGroupHotkeysOptions {
  groups: GroupUI[];
  /**
   * Bookmarks are checked too, and win. Groups and bookmarks share one
   * accelerator namespace: the group form refuses a combo a bookmark already
   * holds, but a bookmark saved afterwards is not checked against groups, so a
   * collision can still be created. Deferring here makes the outcome one
   * deterministic action instead of both firing at once.
   */
  bookmarks: BookmarkUI[];
  isModalOpen: boolean;
  onActivate: (groupId: string) => void;
  /** Combos stay live while the search box has focus, as for bookmarks. */
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Per-group shortcuts, handled in-app while the window is focused — the same
 * arrangement as `useBookmarkHotkeys`, so a combo never gets claimed globally
 * from other applications.
 */
export function useGroupHotkeys({
  groups,
  bookmarks,
  isModalOpen,
  onActivate,
  searchInputRef,
}: UseGroupHotkeysOptions) {
  const groupsRef = useRef(groups);
  groupsRef.current = groups;
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const isModalOpenRef = useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;
  const searchInputRefHolder = useRef(searchInputRef);
  searchInputRefHolder.current = searchInputRef;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpenRef.current) return;
      const target = e.target as HTMLElement;
      const isSearchInput =
        !!searchInputRefHolder.current?.current &&
        target === searchInputRefHolder.current.current;
      if (
        !isSearchInput &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const accelerator = eventToAccelerator(e);
      if (!accelerator) return;
      if (bookmarksRef.current.some((b) => b.shortcut === accelerator)) return;
      const group = groupsRef.current.find((g) => g.shortcut === accelerator);
      if (group) {
        e.preventDefault();
        onActivateRef.current(group.id);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
