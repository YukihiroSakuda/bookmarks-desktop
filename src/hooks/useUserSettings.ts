import { useState, useCallback, useRef } from "react";
import { SortOption, SortOrder } from "@/types/bookmark";
import { UserSettingsUI } from "@/types/userSettings";
import { tauriFetch as fetch } from "@/lib/tauriFetch";

export const DEFAULT_SUMMON_SHORTCUT = "CmdOrCtrl+Alt+Space";

/**
 * `accessCount` was the old name for what is now `recency` — the same intent
 * ("what I use"), different maths. The stored value can still be the old string
 * in two places: the settings row in SQLite, and the localStorage app cache,
 * which `page.tsx` applies *before* the database is even read. `syncSettingsState`
 * is the one point both paths pass through, so normalising there is the only
 * place that catches both. The corrected value is written back on the next save.
 */
const normalizeSortOption = (value: SortOption | string): SortOption =>
  value === "accessCount" ? "recency" : (value as SortOption);

const DEFAULT_SETTINGS: UserSettingsUI = {
  listColumns: 4,
  sortOption: "title",
  sortOrder: "asc",
  summonShortcut: DEFAULT_SUMMON_SHORTCUT,
  shortcutDirEnabled: false,
  shortcutDirPath: "",
  folderSearchEnabled: true,
};

export function useUserSettings() {
  const [userSettings, setUserSettings] = useState<UserSettingsUI | null>(null);
  const [listColumns, setListColumns] = useState<1 | 2 | 3 | 4>(4);
  const [currentSort, setCurrentSort] = useState<SortOption>("title");
  const [currentOrder, setCurrentOrder] = useState<SortOrder>("asc");
  const latestSettingsRef = useRef<UserSettingsUI>(DEFAULT_SETTINGS);

  const syncSettingsState = useCallback((settings: UserSettingsUI): UserSettingsUI => {
    const normalized: UserSettingsUI = {
      ...settings,
      sortOption: normalizeSortOption(settings.sortOption),
    };
    latestSettingsRef.current = normalized;
    setUserSettings(normalized);
    setListColumns(normalized.listColumns);
    setCurrentSort(normalized.sortOption);
    setCurrentOrder(normalized.sortOrder);
    return normalized;
  }, []);

  const saveUserSettings = useCallback(async (settings: UserSettingsUI) => {
    try {
      // Persist what was actually applied, so a legacy sort value is corrected
      // in the database rather than being written straight back.
      const applied = syncSettingsState(settings);
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list_columns: applied.listColumns,
          sort_option: applied.sortOption,
          sort_order: applied.sortOrder,
          summon_shortcut: applied.summonShortcut,
          shortcut_dir_enabled: applied.shortcutDirEnabled,
          shortcut_dir_path: applied.shortcutDirPath,
          folder_search_enabled: applied.folderSearchEnabled,
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      // The backend re-registers the summon hotkey and reports any combo it
      // could not claim in `failed`.
      return (await res.json()) as { ok: boolean; failed?: string[] };
    } catch (error) {
      console.error("Error saving user settings:", error);
      return undefined;
    }
  }, [syncSettingsState]);

  const updateUserSettings = useCallback(async (patch: Partial<UserSettingsUI>) => {
    const nextSettings = {
      ...latestSettingsRef.current,
      ...patch,
    };

    return saveUserSettings(nextSettings);
  }, [saveUserSettings]);

  const applySettings = useCallback((uiSettings: UserSettingsUI) => {
    syncSettingsState(uiSettings);
  }, [syncSettingsState]);

  const fetchUserSettings = useCallback(async (): Promise<UserSettingsUI | null> => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error("Failed to fetch settings");
      const data = await res.json();

      const uiSettings: UserSettingsUI = {
        listColumns: data.list_columns,
        sortOption: data.sort_option,
        sortOrder: data.sort_order,
        summonShortcut: data.summon_shortcut || DEFAULT_SUMMON_SHORTCUT,
        shortcutDirEnabled: Boolean(data.shortcut_dir_enabled),
        shortcutDirPath: data.shortcut_dir_path ?? "",
        folderSearchEnabled:
          data.folder_search_enabled === undefined
            ? true
            : Boolean(data.folder_search_enabled),
      };

      applySettings(uiSettings);
      return uiSettings;
    } catch (error) {
      console.error("Error fetching user settings:", error);
      applySettings(DEFAULT_SETTINGS);
      return null;
    }
  }, [applySettings]);

  return {
    userSettings,
    listColumns,
    setListColumns,
    currentSort,
    setCurrentSort,
    currentOrder,
    setCurrentOrder,
    applySettings,
    fetchUserSettings,
    saveUserSettings,
    updateUserSettings,
  };
}
