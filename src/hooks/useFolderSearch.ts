import { useEffect, useRef, useState } from "react";
import { tauriFetch as fetch } from "@/lib/tauriFetch";
import {
  EMPTY_FOLDER_SEARCH_RESULT,
  FolderSearchResult,
} from "@/types/folderSearch";

/** Shorter queries match too much to be worth walking the disk for. */
const MIN_QUERY_LENGTH = 2;
/** Wait for a pause in typing before walking the disk. */
const DEBOUNCE_MS = 150;
/**
 * Nothing is cached, so the first search of the day into a cold folder can take
 * a second or more. Announce that — but only once it is slow enough to notice,
 * otherwise the indicator flashes on every fast query and reads as noise.
 */
const PROGRESS_AFTER_MS = 300;

interface UseFolderSearchOptions {
  searchQuery: string;
  /** Lets the caller switch the whole feature off (settings, ordering mode…). */
  enabled?: boolean;
}

/**
 * The second, asynchronous half of search: file names inside bookmarked
 * folders. The synchronous bookmark filter in `useBookmarkFiltering` is
 * deliberately left untouched so cards keep filtering with zero delay while
 * these results arrive a beat later.
 */
export function useFolderSearch({
  searchQuery,
  enabled = true,
}: UseFolderSearchOptions) {
  const [result, setResult] = useState<FolderSearchResult>(
    EMPTY_FOLDER_SEARCH_RESULT
  );
  const [isSearching, setIsSearching] = useState(false);
  const [showProgress, setShowProgress] = useState(false);

  // Monotonic ticket per request. A response whose ticket is no longer the
  // latest is dropped, so a slow early query can never overwrite a fast later
  // one that has already painted.
  const latestRequest = useRef(0);

  const query = searchQuery.trim();
  const active = enabled && query.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!active) {
      latestRequest.current += 1; // orphan anything still in flight
      setResult(EMPTY_FOLDER_SEARCH_RESULT);
      setIsSearching(false);
      setShowProgress(false);
      return;
    }

    const ticket = ++latestRequest.current;
    let progressTimer: ReturnType<typeof setTimeout> | undefined;

    const debounce = setTimeout(async () => {
      setIsSearching(true);
      progressTimer = setTimeout(() => {
        if (latestRequest.current === ticket) setShowProgress(true);
      }, PROGRESS_AFTER_MS);

      try {
        const response = await fetch(
          `/api/folder-search?q=${encodeURIComponent(query)}`
        );
        if (latestRequest.current !== ticket) return;

        if (!response.ok) {
          setResult(EMPTY_FOLDER_SEARCH_RESULT);
          return;
        }
        const data = (await response.json()) as FolderSearchResult;
        if (latestRequest.current !== ticket) return;
        // A superseded walk returns early with nothing; keeping the previous
        // results on screen beats blanking the section for one frame.
        if (!data.superseded) setResult(data);
      } catch {
        if (latestRequest.current === ticket) {
          setResult(EMPTY_FOLDER_SEARCH_RESULT);
        }
      } finally {
        if (latestRequest.current === ticket) {
          setIsSearching(false);
          setShowProgress(false);
        }
        clearTimeout(progressTimer);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(debounce);
      clearTimeout(progressTimer);
    };
  }, [query, active]);

  return {
    /**
     * Results stay on screen while the next query is in flight — clearing them
     * first makes the section blink on every keystroke.
     */
    folderSearch: result,
    isSearching,
    showProgress,
    /** Whether the section should be on screen at all. */
    isActive: active,
  };
}
