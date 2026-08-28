import { SortOption, SortOrder } from './bookmark';

export type GroupFolderOpenMode = 'tabs' | 'windows';

export interface UserSettings {
  id: number;
  display_mode: string;
  list_columns: 1 | 2 | 3 | 4;
  sort_option: SortOption;
  sort_order: SortOrder;
  summon_shortcut: string;
  shortcut_dir_enabled: boolean;
  shortcut_dir_path: string | null;
  group_folder_open_mode: GroupFolderOpenMode;
  group_open_confirm_threshold: number;
}

export interface UserSettingsUI {
  listColumns: 1 | 2 | 3 | 4;
  sortOption: SortOption;
  sortOrder: SortOrder;
  /** Tauri accelerator string for the global summon hotkey, e.g. "CmdOrCtrl+Alt+Space". */
  summonShortcut: string;
  /** Mirror bookmarked files/folders into a Windows folder as `.lnk` shortcuts. */
  shortcutDirEnabled: boolean;
  /** Where those shortcuts go. Empty means the default (`%USERPROFILE%\Bookmarks`). */
  shortcutDirPath: string;
  /**
   * Whether opening a group tries to put its folders in one Explorer
   * window's tabs. Windows has no API for creating a tab, so `tabs` means
   * "attempt the automation, fall back to windows" — never a guarantee.
   */
  groupFolderOpenMode: GroupFolderOpenMode;
  /** Opening more than this many bookmarks at once asks for confirmation. */
  groupOpenConfirmThreshold: number;
}
