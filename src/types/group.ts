/**
 * A bookmark group: a named work set opened in one click.
 *
 * Distinct from a tag. A tag classifies a bookmark ("AWS", "internal tool"); a
 * group is the ordered set of things you open together to start a piece of
 * work. A bookmark can belong to any number of groups.
 */
export interface Group {
  id: string;
  name: string;
  color?: string;
  sort_order: number;
  shortcut?: string;
  open_count: number;
  last_opened_at?: string;
  created_at: string;
  updated_at: string;
  /** Member bookmark ids, in the order they are opened. */
  bookmark_ids: string[];
}

export interface GroupUI {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
  shortcut?: string;
  openCount: number;
  lastOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
  bookmarkIds: string[];
}

/** What `open_group` reports back once it has attempted every member. */
export interface OpenGroupResult {
  opened: number;
  failures: { title: string; reason: string }[];
  /**
   * How the folders were actually opened, or null when the group had none.
   * Never assume "tabs" — Windows offers no way to confirm a tab was created,
   * so this only reflects which strategy ran.
   */
  folder_mode: 'tabs' | 'windows' | null;
}

export const convertGroupToUI = (group: Group): GroupUI => ({
  id: group.id,
  name: group.name,
  color: group.color || undefined,
  sortOrder: group.sort_order,
  shortcut: group.shortcut || undefined,
  openCount: group.open_count,
  lastOpenedAt: group.last_opened_at || undefined,
  createdAt: group.created_at,
  updatedAt: group.updated_at,
  bookmarkIds: group.bookmark_ids || [],
});

/** A folder currently open in File Explorer, offered as a capture candidate. */
export interface OpenFolder {
  path: string;
  /** Leaf name, for display when the path is long. */
  name: string;
  /** The window it is open in, for a later "close the session". */
  hwnd: number;
}
