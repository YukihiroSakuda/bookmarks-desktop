import { useEffect, useState } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { File, Folder, FolderOpen, Loader2 } from "lucide-react";
import { FolderSearchResult } from "@/types/folderSearch";
import { getListColumnClasses, ListColumns } from "@/lib/listLayout";

interface FolderSearchResultsProps {
  result: FolderSearchResult;
  showProgress: boolean;
  /** Kept in step with the bookmark list so both halves share one grid. */
  listColumns: ListColumns;
  /** Opens a file with its default app, or a folder in Explorer. */
  onOpen: (fullPath: string) => void;
  /** Reveals the containing folder rather than opening the item itself. */
  onOpenContaining: (fullPath: string) => void;
}

/**
 * Rows drawn per folder before the group has to be expanded. The backend hands
 * over far more than this; showing them all at once would push the bookmark
 * cards off screen for a result nobody asked to see in full.
 */
const INITIAL_VISIBLE = 20;

/**
 * "3 days ago", not "Aug 17, 2026" and not "Modified 3 days ago".
 *
 * Relative, because the question this column answers is "is this the recent
 * one?" and an absolute date makes the reader do that arithmetic. Unlabelled,
 * because the label would be identical on every row: a lone timestamp in a file
 * listing means the modification time in Explorer, Finder and everywhere else,
 * so the word earns nothing while costing width on each line.
 */
function formatModified(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNowStrict(date, { addSuffix: true });
}

/** `2026\08\quote.xlsx` → `2026\08\` — the file's own name is shown separately. */
function parentOf(relPath: string) {
  const cut = Math.max(relPath.lastIndexOf("\\"), relPath.lastIndexOf("/"));
  return cut <= 0 ? "" : relPath.slice(0, cut + 1);
}

/**
 * File hits from inside bookmarked folders, rendered below the bookmark cards.
 * Placing it below matters: results arrive after the cards have painted, and
 * anything above would shove them down just as the eye lands on them.
 */
export function FolderSearchResults({
  result,
  showProgress,
  listColumns,
  onOpen,
  onOpenContaining,
}: FolderSearchResultsProps) {
  const [expandedIds, setExpandedIds] = useState<string[]>([]);

  // A group expanded for one query has no business staying expanded for the
  // next one — the rows underneath it are entirely different files.
  useEffect(() => {
    setExpandedIds([]);
  }, [result.query]);

  const toggleExpanded = (bookmarkId: string) =>
    setExpandedIds((prev) =>
      prev.includes(bookmarkId)
        ? prev.filter((id) => id !== bookmarkId)
        : [...prev, bookmarkId]
    );

  // A folder that matched nothing is not a result, even when the walk stopped
  // early inside it. Rendering those produced a row that appeared on *every*
  // query, said nothing about what was typed, and trained the eye to skip the
  // whole section.
  const groups = result.groups.filter((group) => group.matches.length > 0);

  // Folders that turned out to hold more than the walk was willing to visit.
  //
  // `result.skipped` is deliberately *not* shown. Drive roots, network shares
  // and removable drives are permanent rules a reader can look up in Help, so
  // naming them under every single search is the same constant-on-every-row
  // noise this section keeps having to shed. Being too large, by contrast, is
  // something no one can predict from the rules — it is worth saying once it
  // actually happens.
  const tooLarge = result.groups
    .filter((group) => group.truncated && group.matches.length === 0)
    .map((group) => group.title);

  if (groups.length === 0 && !showProgress) return null;

  return (
    <section className="mt-6 px-1.5" aria-label="Matches inside your folders">
      <h2 className="text-sm font-medium mb-2 flex items-center gap-2">
        <span className="text-blue-500">#</span>
        In your folders
        {result.totalMatches > 0 && (
          <span className="text-muted-foreground font-normal">
            ({result.totalMatches})
          </span>
        )}
        {showProgress && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground font-normal">
            <Loader2 className="size-3 animate-spin" />
            Searching your folders…
          </span>
        )}
      </h2>

      <div className="space-y-3">
        {groups.map((group) => {
          const isExpanded = expandedIds.includes(group.bookmarkId);
          const visible = isExpanded
            ? group.matches
            : group.matches.slice(0, INITIAL_VISIBLE);
          const hidden = group.matches.length - visible.length;
          // More matches exist than were handed over at all, so no amount of
          // expanding will reach them. Say so instead of offering a control
          // that cannot deliver.
          const beyondReach = group.matchCount > group.matches.length;

          return (
            <div key={group.bookmarkId}>
              <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                <span className="truncate">{group.title}</span>
                {beyondReach && (
                  <span className="shrink-0">
                    · showing {group.matches.length} of {group.matchCount} —
                    narrow your search
                  </span>
                )}
                {group.truncated && (
                  // Relevant here, unlike on an empty folder: there are hits,
                  // and the walk stopped before it could find any others.
                  <span className="shrink-0">· more may exist</span>
                )}
              </div>

              <ul className={getListColumnClasses(listColumns)}>
                {visible.map((match) => {
                  const parent = parentOf(match.relPath);
                  const modified = formatModified(match.modifiedAt);
                  return (
                    <li key={match.fullPath}>
                      <div
                        data-bookmark-id={match.fullPath}
                        className="group flex h-full items-center gap-2 rounded-lg border border-l-2 border-l-blue-500 bg-card p-2 hover:bg-accent focus-within:bg-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
                      >
                        <button
                          type="button"
                          data-bookmark-card-link
                          onClick={() => onOpen(match.fullPath)}
                          title={match.fullPath}
                          className="flex flex-1 min-w-0 items-center gap-3 text-left outline-none"
                        >
                          {match.isDir ? (
                            <Folder className="size-4 shrink-0 text-foreground" />
                          ) : (
                            <File className="size-4 shrink-0 text-foreground" />
                          )}
                          <span className="flex-1 min-w-0 overflow-hidden">
                            {/* The name gets the first line to itself — it is
                                what the eye scans for, and nothing should
                                compete with it for width. */}
                            <span className="block truncate text-sm">
                              {match.name}
                            </span>
                            {/* Path and date share the second line but sit at
                                opposite ends of it, so neither crowds the other
                                and the dates still line up down the column. */}
                            <span className="flex items-baseline gap-3 text-xs text-muted-foreground">
                              <span className="flex-1 min-w-0 truncate">
                                {parent}
                              </span>
                              {modified && (
                                <span className="shrink-0">{modified}</span>
                              )}
                            </span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onOpenContaining(match.fullPath)}
                          title="Open containing folder"
                          aria-label="Open containing folder"
                          className="shrink-0 rounded p-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-blue-500 outline-none"
                        >
                          <FolderOpen className="size-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {(hidden > 0 || isExpanded) && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(group.bookmarkId)}
                  aria-expanded={isExpanded}
                  className="mt-1 text-xs text-blue-500 hover:underline outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1"
                >
                  {isExpanded ? "Show fewer" : `Show ${hidden} more`}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {groups.length > 0 && tooLarge.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Too large to search fully: {tooLarge.join(" · ")}
        </p>
      )}
    </section>
  );
}
