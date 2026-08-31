import { SortOption, SortOrder } from './bookmark';

export interface UserSettings {
  id: number;
  display_mode: string;
  list_columns: 1 | 2 | 3 | 4;
  sort_option: SortOption;
  sort_order: SortOrder;
  summon_shortcut: string;
  shortcut_dir_enabled: boolean;
  shortcut_dir_path: string | null;
  folder_search_enabled: boolean;
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
  /** Search file names inside bookmarked folders while typing a query. On by default. */
  folderSearchEnabled: boolean;
}
