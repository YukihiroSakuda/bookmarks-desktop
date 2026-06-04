import { useEffect, useCallback } from "react";

interface UseKeyboardShortcutsOptions {
  onEscape: () => void;
  onFocusSearch?: () => void;
}

export function useKeyboardShortcuts({
  onEscape,
  onFocusSearch,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape → Close / Deselect
      if (e.key === "Escape") {
        onEscape();
        return;
      }

      // / → Focus search (only when not typing in an input/textarea)
      if (e.key === "/" && onFocusSearch) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          onFocusSearch();
        }
      }
    },
    [onEscape, onFocusSearch]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
