import { useEffect, useRef, type RefObject } from "react";
import { eventToAccelerator } from "@/lib/shortcut";

interface UseTypeToSearchOptions {
  /** Disabled while a modal/form is open. */
  /** Off outside the view that owns the search box. */
  enabled?: boolean;
  isModalOpen: boolean;
  /** The search input to focus when typing begins. */
  searchInputRef: RefObject<HTMLInputElement | null>;
  /** Append a typed character to the search query. */
  onTypeCharacter: (char: string) => void;
}

/**
 * Type-to-search: pressing any plain printable character focuses the search box
 * and starts typing there, so the user never has to reach for a dedicated focus
 * key first.
 *
 * Any key combo that forms a per-bookmark accelerator (i.e. carries a modifier,
 * including a lone Shift) is skipped, so a shortcut that opens a bookmark never
 * also leaks its character into the search box — useBookmarkHotkeys owns those.
 *
 * Refs keep the listener stable while reading fresh state.
 */
export function useTypeToSearch({
  enabled = true,
  isModalOpen,
  searchInputRef,
  onTypeCharacter,
}: UseTypeToSearchOptions) {
  const isModalOpenRef = useRef(isModalOpen);
  isModalOpenRef.current = isModalOpen;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onTypeCharacterRef = useRef(onTypeCharacter);
  onTypeCharacterRef.current = onTypeCharacter;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabledRef.current || isModalOpenRef.current) return;
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
