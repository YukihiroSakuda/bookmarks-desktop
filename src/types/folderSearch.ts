/**
 * Results of searching inside the folders the user has bookmarked.
 *
 * Unlike the bookmark types, these have no database representation — the Rust
 * side walks the filesystem and builds them per query — so there is no
 * snake_case/camelCase conversion step. The command emits camelCase directly.
 */

export interface FolderSearchMatch {
  name: string;
  /** Path relative to the bookmarked folder, e.g. `2026\08\quote.xlsx`. */
  relPath: string;
  fullPath: string;
  isDir: boolean;
  modifiedAt: string | null;
}

export interface FolderSearchGroup {
  bookmarkId: string;
  /** Title of the bookmark this folder came from. */
  title: string;
  root: string;
  matches: FolderSearchMatch[];
  /**
   * Total matches found, which can exceed `matches.length` — the walk keeps
   * only the first few per folder but still counts them all.
   */
  matchCount: number;
  /** The folder held more entries than the walk was willing to visit. */
  truncated: boolean;
}

export interface FolderSearchSkip {
  title: string;
  /** `network` or `removable` — volumes that are not walked by default. */
  reason: string;
}

export interface FolderSearchResult {
  query: string;
  groups: FolderSearchGroup[];
  totalMatches: number;
  skipped: FolderSearchSkip[];
  /** A newer query overtook this one; the results are incomplete on purpose. */
  superseded: boolean;
}

export const EMPTY_FOLDER_SEARCH_RESULT: FolderSearchResult = {
  query: "",
  groups: [],
  totalMatches: 0,
  skipped: [],
  superseded: false,
};
