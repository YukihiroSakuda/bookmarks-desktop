import { BookmarkUI, SortOption, SortOrder } from "@/types/bookmark";

/**
 * Days after which a bookmark's score halves. A month is roughly how long it
 * takes for work you have stopped touching to stop being what you mean by
 * "what I use".
 */
const HALF_LIFE_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * How much a bookmark is in use *lately*: its lifetime access count, decayed by
 * how long ago it was last opened.
 *
 * `accessCount` alone never decays, so a bookmark opened two hundred times for
 * a project half a year ago outranks one opened five times this week — forever.
 * Decaying it by `lastAccessedAt` (already stored, and already what the .lnk
 * folder writes as each shortcut's modified time) fixes that without storing
 * anything new.
 *
 * The `+ 1` gives every bookmark a base of 1 that decays from its creation
 * date, so one added today but not yet opened still outranks one that went
 * quiet six months ago. Without it the multiplication would pin every unopened
 * bookmark to exactly zero.
 *
 * Elapsed time multiplies every score by the same factor, so scores age
 * uniformly and the order they produce never changes on its own. Nothing needs
 * recomputing on a timer — only an actual access reorders the list, and that
 * already updates state.
 */
export function recencyScore(bookmark: BookmarkUI, now: number = Date.now()): number {
  const stamp = bookmark.lastAccessedAt ?? bookmark.createdAt;
  const time = stamp ? new Date(stamp).getTime() : Number.NaN;
  const elapsedDays = Number.isNaN(time) ? 0 : Math.max(0, (now - time) / MS_PER_DAY);
  return ((bookmark.accessCount || 0) + 1) * Math.pow(0.5, elapsedDays / HALF_LIFE_DAYS);
}

/**
 * The one comparator behind every sort. Filtering and manual reordering sort
 * the same list by the same keys, so they share this rather than keeping a copy
 * of the switch each — a new sort option cannot be added to one and forgotten
 * in the other.
 *
 * `now` is captured once per sort instead of per comparison: a clock tick
 * partway through would otherwise make the comparison non-transitive.
 */
export function createBookmarkComparator(
  sortOption: SortOption,
  sortOrder: SortOrder
): (a: BookmarkUI, b: BookmarkUI) => number {
  const now = Date.now();

  return (a, b) => {
    let comparison = 0;
    switch (sortOption) {
      case "recency":
        comparison = recencyScore(a, now) - recencyScore(b, now);
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
    // Custom is the arrangement the user made by hand: it has one direction,
    // not two.
    return sortOption === "custom"
      ? comparison
      : sortOrder === "asc"
      ? comparison
      : -comparison;
  };
}
