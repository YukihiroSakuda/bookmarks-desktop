import { useEffect } from "react";

interface UseBookmarkArrowNavigationOptions {
  /** Disable while a modal/form is open or the list is in ordering mode. */
  enabled: boolean;
}

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

/**
 * Makes the arrow keys move focus between bookmark cards.
 *
 * Left/Right step through cards in document order (same order as Tab).
 * Up/Down jump to the nearest card in the row above/below, matched by
 * horizontal position — computed from actual layout so it stays correct
 * across responsive column counts and the pinned/unpinned sections.
 *
 * Each focusable card link is identified by the `data-bookmark-card-link`
 * attribute set in BookmarkCard.
 */
export function useBookmarkArrowNavigation({
  enabled,
}: UseBookmarkArrowNavigationOptions) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!ARROW_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

      // Let native behavior work inside dialogs and while typing/interacting
      // with form fields, so those keep their own arrow-key handling.
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

      const currentIndex = cards.indexOf(document.activeElement as HTMLElement);

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowRight" ? 1 : -1;
        const nextIndex =
          currentIndex === -1
            ? delta === 1
              ? 0
              : cards.length - 1
            : Math.min(Math.max(currentIndex + delta, 0), cards.length - 1);
        cards[nextIndex]?.focus();
        return;
      }

      // ArrowUp / ArrowDown: focus the nearest card in the row above/below.
      e.preventDefault();
      if (currentIndex === -1) {
        cards[0]?.focus();
        return;
      }

      const current = cards[currentIndex].getBoundingClientRect();
      const direction = e.key === "ArrowDown" ? 1 : -1;

      let best: HTMLElement | null = null;
      let bestRowDelta = Infinity;
      let bestXDelta = Infinity;

      for (const card of cards) {
        if (card === cards[currentIndex]) continue;
        const rect = card.getBoundingClientRect();
        const rowDelta = (rect.top - current.top) * direction;
        if (rowDelta <= 0.5) continue; // must be strictly in the target direction

        if (rowDelta < bestRowDelta - 0.5) {
          bestRowDelta = rowDelta;
          bestXDelta = Math.abs(rect.left - current.left);
          best = card;
        } else if (Math.abs(rowDelta - bestRowDelta) < 0.5) {
          const xDelta = Math.abs(rect.left - current.left);
          if (xDelta < bestXDelta) {
            bestXDelta = xDelta;
            best = card;
          }
        }
      }

      best?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
