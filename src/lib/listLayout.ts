/**
 * Grid classes for the main list, shared by the bookmark cards and the folder
 * search results below them.
 *
 * Both lists have to agree on the column count or the two halves of one screen
 * end up on different grids, so the mapping lives here rather than being
 * repeated in each component.
 */
export type ListColumns = 1 | 2 | 3 | 4;

const COLUMN_CLASSES: Record<ListColumns, string> = {
  1: "grid grid-cols-1 gap-2",
  2: "grid grid-cols-1 sm:grid-cols-2 gap-2",
  3: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2",
  4: "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2",
};

export function getListColumnClasses(columns: ListColumns): string {
  return COLUMN_CLASSES[columns];
}
