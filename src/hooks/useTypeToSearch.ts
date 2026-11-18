import { useEffect, useRef, type RefObject } from "react";
import { eventToAccelerator } from "@/lib/shortcut";

interface UseTypeToSearchOptions {
  /** Disabled while a modal/form is open. */
  isModalOpen: boolean;
  /** The search input to focus when typing begins. */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Append a typed character to the search query. */
  onTypeCharacter: (char: string) => void;
  /** Drop the last character of the search query (Backspace). */
  onBackspace: () => void;
}

/**
 * Type-to-search: pressing any plain printable character focuses the search box
 * and starts typing there, so the user never has to reach for a dedicated focus
 * key first. Backspace is its counterpart — it deletes back through the query
 * from wherever focus is, so correcting a search never means reaching for the
 * box with the mouse.
 *
 * Any key combo that forms a per-bookmark accelerator (i.e. carries a modifier,
 * including a lone Shift) is skipped, so a shortcut that opens a bookmark never
 * also leaks its character into the search box — useBookmarkHotkeys owns those.
 *
 * Refs keep the listener stable while reading fresh state.
 */
export function useTypeToSearch({
  isModalOpen,
  searchInputRef,
  onTypeCharacter,
  onBackspace,
}: UseTypeToSearchOptions) {
  const isModalOpenRef = useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;
  const onTypeCharacterRef = useRef(onTypeCharacter);
  onTypeCharacterRef.current = onTypeCharacter;
  const onBackspaceRef = useRef(onBackspace);
  onBackspaceRef.current = onBackspace;

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
      // Any recognized shortcut combo (carries a modifier, incl. lone Shift) is
      // reserved for useBookmarkHotkeys — don't also type it into the search box.
      if (eventToAccelerator(e)) return;
      // Other modifier combos with an unsupported main key still aren't text.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // Backspace edits the query rather than typing into it. Always swallowed,
      // even on an empty query, so it can never reach a browser-level default.
      if (e.key === "Backspace") {
        e.preventDefault();
        searchInputRef.current?.focus();
        onBackspaceRef.current();
        return;
      }
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
