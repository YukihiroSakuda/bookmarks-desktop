import { useEffect, useRef, type RefObject } from "react";
import { BookmarkUI } from "@/types/bookmark";
import { eventToAccelerator } from "@/lib/shortcut";

interface UseBookmarkHotkeysOptions {
  bookmarks: BookmarkUI[];
  isModalOpen: boolean;
  onActivate: (bookmark: BookmarkUI) => void;
  /**
   * The search box. Per-bookmark shortcuts stay active while it has focus (so a
   * combo still launches a bookmark mid-search), unlike other inputs.
   */
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * Per-bookmark shortcuts handled in-app (only while the window is focused), so
 * they never steal combos from other apps. A keydown listener matches the
 * pressed combo against each bookmark's stored accelerator and activates it.
 * Refs keep the listener stable while reading fresh state.
 */
export function useBookmarkHotkeys({
  bookmarks,
  isModalOpen,
  onActivate,
  searchInputRef,
}: UseBookmarkHotkeysOptions) {
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
      // Don't hijack combos while the form is capturing a shortcut.
      if (isModalOpenRef.current) return;
      // Don't fire while typing in a field — this keeps editing combos
      // (Ctrl+C/V/A) intact and avoids clashing with the Settings shortcut
      // capture. The search box is the one exception: a combo there should
      // still launch a bookmark (only a *matching* combo is consumed below, so
      // ordinary editing keys still reach the input untouched).
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
      const bm = bookmarksRef.current.find((b) => b.shortcut === accelerator);
      if (bm) {
        e.preventDefault();
        onActivateRef.current(bm);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
