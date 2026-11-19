import { BookmarkUI } from "@/types/bookmark";
import { normalizeForSearch } from "./searchNormalize";
import { buildQueryTerms, matchesAllTerms } from "./searchQuery";
import { TagMatchMode, matchesSelectedTags } from "./tagMatchMode";

/**
 * The one test of "is this bookmark shown under the current search and tag
 * filter", used by the list (`useBookmarkFiltering`) and by drag-to-reorder
 * (`useBookmarkOrdering`). Reordering moves cards by their position among the
 * *shown* ones, so if the two disagreed about which cards are shown, a drag
 * would move the wrong card.
 */

/** The fields search looks in — title, URL, memo — normalized for matching. */
export function searchableFields(bookmark: BookmarkUI): string[] {
  return [bookmark.title, bookmark.url, bookmark.memo ?? ""].map(normalizeForSearch);
}

/**
 * Build the test once per query; it is then applied to every bookmark.
 * Takes the fields from `searchableFields`, so a caller filtering on every
 * keystroke can normalize each bookmark once rather than once per keystroke.
 */
export function createBookmarkFilter(
  searchQuery: string,
  selectedTags: string[],
  tagMatchMode: TagMatchMode
): (fields: string[], tags: string[]) => boolean {
  const terms = buildQueryTerms(searchQuery);
  return (fields, tags) =>
    matchesAllTerms(fields, terms) && matchesSelectedTags(tags, selectedTags, tagMatchMode);
}
