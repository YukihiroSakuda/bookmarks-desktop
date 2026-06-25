import { useEffect, useCallback } from "react";

interface UseKeyboardShortcutsOptions {
  onEscape: () => void;
}

export function useKeyboardShortcuts({
  onEscape,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Escape → Close / Deselect
      if (e.key === "Escape") {
        onEscape();
        return;
      }
      // Focusing the search box from anywhere is handled by the type-to-search
      // listener in page.tsx, which starts typing on the first plain key.
    },
    [onEscape]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
