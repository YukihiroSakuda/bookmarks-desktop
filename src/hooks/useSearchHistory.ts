import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "searchHistory";
const MAX_HISTORY = 10;

function loadHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const persist = useCallback((next: string[]) => {
    setHistory(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addToHistory = useCallback(
    (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      const filtered = history.filter((q) => q !== trimmed);
      persist([trimmed, ...filtered].slice(0, MAX_HISTORY));
    },
    [history, persist]
  );

  const removeFromHistory = useCallback(
    (query: string) => {
      persist(history.filter((q) => q !== query));
    },
    [history, persist]
  );

  const clearHistory = useCallback(() => {
    persist([]);
  }, [persist]);

  return { history, addToHistory, removeFromHistory, clearHistory };
}
