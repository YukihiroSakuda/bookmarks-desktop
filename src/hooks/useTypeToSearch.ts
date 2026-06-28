import { useEffect, useRef, type RefObject } from "react";

interface UseTypeToSearchOptions {
  /** Disabled while a modal/form is open. */
  isModalOpen: boolean;
  /** The search input to focus when typing begins. */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Append a typed character to the search query. */
  onTypeCharacter: (char: string) => void;
}

/**
 * Type-to-search: pressing any plain printable character (no Ctrl/Cmd/Alt —
 * those are reserved for shortcuts) focuses the search box and starts typing
 * there, so the user never has to reach for a dedicated focus key first. Bare
 * keys can never collide with per-bookmark shortcuts, which always carry a
 * modifier (see useBookmarkHotkeys / eventToAccelerator).
 *
 * Refs keep the listener stable while reading fresh state.
 */
export function useTypeToSearch({
  isModalOpen,
  searchInputRef,
  onTypeCharacter,
}: UseTypeToSearchOptions) {
  const isModalOpenRef = useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;
  const onTypeCharacterRef = useRef(onTypeCharacter);
  onTypeCharacterRef.current = onTypeCharacter;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isModalOpenRef.current) return;
      // Don't hijack typing while a field already has focus.
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }
      // Modifier combos are reserved for shortcuts; only bare keys start a search.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // A single printable character (ignores Tab, Enter, arrows, etc.).
      if (e.key.length !== 1) return;
      e.preventDefault();
      searchInputRef.current?.focus();
      onTypeCharacterRef.current(e.key);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [searchInputRef]);
}
