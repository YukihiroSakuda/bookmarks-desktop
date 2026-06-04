import { useState, useCallback, useRef } from "react";
import { SortOption, SortOrder } from "@/types/bookmark";
import { UserSettingsUI } from "@/types/userSettings";
import { tauriFetch as fetch } from "@/lib/tauriFetch";

const DEFAULT_SETTINGS: UserSettingsUI = {
  listColumns: 4,
  sortOption: "accessCount",
  sortOrder: "desc",
};

export function useUserSettings() {
  const [userSettings, setUserSettings] = useState<UserSettingsUI | null>(null);
  const [listColumns, setListColumns] = useState<1 | 2 | 3 | 4>(4);
  const [currentSort, setCurrentSort] = useState<SortOption>("accessCount");
  const [currentOrder, setCurrentOrder] = useState<SortOrder>("desc");
  const latestSettingsRef = useRef<UserSettingsUI>(DEFAULT_SETTINGS);

  const syncSettingsState = useCallback((settings: UserSettingsUI) => {
    latestSettingsRef.current = settings;
    setUserSettings(settings);
    setListColumns(settings.listColumns);
    setCurrentSort(settings.sortOption);
    setCurrentOrder(settings.sortOrder);
  }, []);

  const saveUserSettings = useCallback(async (settings: UserSettingsUI) => {
    try {
      syncSettingsState(settings);
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          list_columns: settings.listColumns,
          sort_option: settings.sortOption,
          sort_order: settings.sortOrder,
        }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
    } catch (error) {
      console.error("Error saving user settings:", error);
    }
  }, [syncSettingsState]);

  const updateUserSettings = useCallback(async (patch: Partial<UserSettingsUI>) => {
    const nextSettings = {
      ...latestSettingsRef.current,
      ...patch,
    };

    await saveUserSettings(nextSettings);
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
