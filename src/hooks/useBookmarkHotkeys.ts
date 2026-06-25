import { useEffect, useRef } from "react";
import { BookmarkUI } from "@/types/bookmark";
import { eventToAccelerator } from "@/lib/shortcut";

interface UseBookmarkHotkeysOptions {
  bookmarks: BookmarkUI[];
  isModalOpen: boolean;
  onActivate: (bookmark: BookmarkUI) => void;
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
}: UseBookmarkHotkeysOptions) {
  const bookmarksRef = useRef(bookmarks);
  bookmarksRef.current = bookmarks;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const isModalOpenRef = useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Don't hijack combos while the form is capturing a shortcut.
      if (isModalOpenRef.current) return;
      // Don't fire while typing in a field — this keeps editing combos
      // (Ctrl+C/V/A) intact and avoids clashing with the Settings shortcut
      // capture. Per-bookmark keys work when the list, not an input, has focus.
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
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
