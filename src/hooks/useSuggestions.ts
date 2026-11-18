import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { Suggestion } from "@/types/suggestion";

/**
 * Bookmarks an AI assistant has proposed through the MCP `suggest_bookmark`
 * tool. They live in the app's memory (never the database) until the user saves
 * one through the ordinary add form or dismisses it, so this hook only mirrors
 * that list and removes entries; it never creates a bookmark itself.
 */
export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  // Ids already shown, so only a genuinely new arrival raises a toast.
  const seen = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    let next: Suggestion[];
    try {
      next = await invoke<Suggestion[]>("list_suggestions");
    } catch {
      return;
    }
    setSuggestions(next);

    const known = seen.current;
    seen.current = new Set(next.map((s) => s.id));
    // First load is the app catching up, not news.
    if (known && next.some((s) => !known.has(s.id))) {
      toast.info("An AI assistant suggested a bookmark.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const promise = listen("suggestions-changed", () => {
      refresh();
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, [refresh]);

  const dismiss = useCallback(async (id: string) => {
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
    seen.current?.delete(id);
    try {
      await invoke("dismiss_suggestion", { id });
    } catch {
      // The list re-syncs on the next event; nothing to undo locally.
    }
  }, []);

  return { suggestions, dismissSuggestion: dismiss };
}
