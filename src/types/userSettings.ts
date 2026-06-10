import { SortOption, SortOrder } from './bookmark';

export interface UserSettings {
  id: number;
  display_mode: string;
  list_columns: 1 | 2 | 3 | 4;
  sort_option: SortOption;
  sort_order: SortOrder;
  summon_shortcut: string;
}

export interface UserSettingsUI {
  listColumns: 1 | 2 | 3 | 4;
  sortOption: SortOption;
  sortOrder: SortOrder;
  /** Tauri accelerator string for the global summon hotkey, e.g. "CmdOrCtrl+Alt+Space". */
  summonShortcut: string;
}
