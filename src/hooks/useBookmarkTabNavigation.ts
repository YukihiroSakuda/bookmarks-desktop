import { useEffect } from "react";

interface UseBookmarkTabNavigationOptions {
  /** Disable while a modal/form is open or the list is in ordering mode. */
  enabled: boolean;
}

/**
 * Makes the Tab key cycle focus through bookmark cards only.
 *
 * Other focusable elements (header buttons, the search box, per-card action
 * buttons) are still reachable by mouse/click, but Tab/Shift+Tab moves the
 * focus solely between bookmark card links, in document order.
 *
 * Each focusable card link is identified by the `data-bookmark-card-link`
 * attribute set in BookmarkCard.
 */
export function useBookmarkTabNavigation({
  enabled,
}: UseBookmarkTabNavigationOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;

      // Let native focus handling work inside dialogs (e.g. AlertDialog) and
      // while typing in form fields, so those keep their own tab order.
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        return;
      }

      const cards = Array.from(
        document.querySelectorAll<HTMLElement>("[data-bookmark-card-link]")
      );
      if (cards.length === 0) return;

      e.preventDefault();

      const currentIndex = cards.indexOf(document.activeElement as HTMLElement);
      const delta = e.shiftKey ? -1 : 1;
      let nextIndex: number;
      if (currentIndex === -1) {
        // Focus isn't on a card yet — start from the appropriate end.
        nextIndex = e.shiftKey ? cards.length - 1 : 0;
      } else {
        nextIndex = (currentIndex + delta + cards.length) % cards.length;
      }

      cards[nextIndex]?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
