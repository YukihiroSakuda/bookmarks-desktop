import { useEffect, useRef, type RefObject } from "react";

interface UseBookmarkArrowNavigationOptions {
  /** Disable while a modal/form is open or the list is in ordering mode. */
  enabled: boolean;
  /**
   * The search box. Pressing ArrowDown while it's focused jumps straight to
   * the first bookmark card, unlike other inputs which keep native behavior.
   */
  searchInputRef?: RefObject<HTMLInputElement | null>;
}

const NAV_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

/**
 * Makes the arrow keys move focus between bookmark cards.
 *
 * Left/Right step through cards in document order (same order as Tab).
 * Up/Down jump to the card below/above that's closest overall (combined
 * row + column distance), matched from actual layout so it stays correct
 * across responsive column counts, incomplete rows, and the pinned/unpinned
 * sections. Home/End jump straight to the first/last card overall.
 *
 * Each focusable card link is identified by the `data-bookmark-card-link`
 * attribute set in BookmarkCard.
 */
export function useBookmarkArrowNavigation({
  enabled,
  searchInputRef,
}: UseBookmarkArrowNavigationOptions) {
  const searchInputRefHolder = useRef(searchInputRef);
  searchInputRefHolder.current = searchInputRef;

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!NAV_KEYS.has(e.key) || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;

      const target = e.target as HTMLElement;

      // From the search box, ArrowDown jumps to the first card instead of
      // moving the text cursor.
      if (
        e.key === "ArrowDown" &&
        !!searchInputRefHolder.current?.current &&
        target === searchInputRefHolder.current.current
      ) {
        const firstCard = document.querySelector<HTMLElement>("[data-bookmark-card-link]");
        if (firstCard) {
          e.preventDefault();
          firstCard.focus();
        }
        return;
      }

      // Let native behavior work inside dialogs and while typing/interacting
      // with form fields, so those keep their own arrow-key handling.
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

      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        const edgeCard = e.key === "Home" ? cards[0] : cards[cards.length - 1];
        edgeCard?.focus();
        return;
      }

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

      // ArrowUp / ArrowDown: focus the closest matching card above/below.
      e.preventDefault();
      if (currentIndex === -1) {
        cards[0]?.focus();
        return;
      }

      // Measure the outer card (the actual CSS grid cell) rather than the
      // inner link. The link's own box is vertically centered inside the
      // card, so it drifts up/down depending on that specific card's content
      // (e.g. a missing domain line makes the link one line shorter) even
      // when the card itself sits in the same grid row as its neighbors.
      const cardRect = (el: HTMLElement) =>
        (el.closest<HTMLElement>("[data-bookmark-id]") ?? el).getBoundingClientRect();

      const current = cardRect(cards[currentIndex]);
      const direction = e.key === "ArrowDown" ? 1 : -1;

      // Score every card strictly ahead in the target direction by combined
      // row + column distance, rather than picking the nearest row first.
      // Otherwise a short row (e.g. the last row of the pinned section, or
      // the final row of the grid) would win purely for being one row
      // closer, even when its only card sits in a completely different
      // column — visually "sliding" the focus down-and-sideways instead of
      // landing on the well-aligned card a row or two further on.
      let best: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const card of cards) {
        if (card === cards[currentIndex]) continue;
        const rect = cardRect(card);
        const rowDelta = (rect.top - current.top) * direction;
        if (rowDelta <= 0.5) continue; // must be strictly in the target direction

        const xDelta = Math.abs(rect.left - current.left);
        const score = rowDelta + xDelta;
        if (score < bestScore) {
          bestScore = score;
          best = card;
        }
      }

      best?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}
