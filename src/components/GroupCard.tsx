import { useMemo, useRef, useState } from "react";
import { Folder, Globe, GripVertical, Layers, Loader2, Play, SquarePen, Trash2, X } from "lucide-react";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookmarkUI } from "@/types/bookmark";
import { GroupUI } from "@/types/group";
import { Button } from "./Button";
import { getTagColorStyles } from "@/lib/tagColors";
import { formatAcceleratorForDisplay } from "@/lib/shortcut";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface GroupCardProps {
  group: GroupUI;
  /** Every bookmark, for resolving members and for the add-member search. */
  bookmarks: BookmarkUI[];
  isOpening: boolean;
  /** Any group is opening — the others disable to prevent a double launch. */
  isAnyOpening: boolean;
  onOpen: (id: string) => void;
  onEdit: (group: GroupUI) => void;
  onDelete: (id: string) => void;
  onAddMembers: (id: string, bookmarkIds: string[]) => void;
  onRemoveMember: (id: string, bookmarkId: string) => void;
  /** New member order after a drag, as the full id list. */
  onReorderMembers: (id: string, bookmarkIds: string[]) => void;
  /** Grip rendered in the header, letting the card itself be reordered. */
  dragHandle?: React.ReactNode;
}

interface SortableMemberProps {
  bookmark: BookmarkUI;
  index: number;
  onRemove: () => void;
}

/**
 * One member row. The grip is the only drag handle: the row is otherwise
 * hoverable and carries a remove button, and making the whole row draggable
 * would swallow those clicks.
 */
function SortableMember({ bookmark, index, onRemove }: SortableMemberProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: bookmark.id,
  });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 text-sm rounded-md px-2 py-1 hover:bg-accent group/member"
    >
      <button
        type="button"
        title="Drag to reorder"
        className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0 opacity-0 group-hover/member:opacity-100 transition-opacity"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <span className="text-xs text-muted-foreground w-4 shrink-0">{index + 1}</span>
      {bookmark.kind === "path" ? (
        <Folder className="size-3.5 text-muted-foreground shrink-0" />
      ) : (
        <Globe className="size-3.5 text-muted-foreground shrink-0" />
      )}
      <span className="truncate flex-1">{bookmark.title}</span>
      <button
        type="button"
        onClick={onRemove}
        className="opacity-0 group-hover/member:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
        title="Remove from group"
      >
        <X size={14} />
      </button>
    </li>
  );
}

const MAX_SUGGESTIONS = 6;

export function GroupCard({
  group,
  bookmarks,
  isOpening,
  isAnyOpening,
  onOpen,
  onEdit,
  onDelete,
  onAddMembers,
  onRemoveMember,
  onReorderMembers,
  dragHandle,
}: GroupCardProps) {
  const [query, setQuery] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const byId = useMemo(() => new Map(bookmarks.map((b) => [b.id, b])), [bookmarks]);

  // Members in open order. Ids with no bookmark are skipped rather than
  // rendered as blanks — the row is gone from the database by the time the
  // cascade delete lands, and a stale cached id should not show a ghost.
  const members = useMemo(
    () => group.bookmarkIds.map((id) => byId.get(id)).filter((b): b is BookmarkUI => !!b),
    [group.bookmarkIds, byId]
  );

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const already = new Set(group.bookmarkIds);
    return bookmarks
      .filter(
        (b) =>
          !already.has(b.id) &&
          (b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [query, bookmarks, group.bookmarkIds]);

  const add = (bookmarkId: string) => {
    onAddMembers(group.id, [bookmarkId]);
    // Clearing lets the next name be typed straight away, which is what makes
    // building a six-member group quick.
    setQuery("");
    searchRef.current?.focus();
  };

  const requestOpen = () => {
    if (isAnyOpening || members.length === 0) return;
    // Whether this needs confirming is decided by the caller, so that a
    // keyboard shortcut is held to the same threshold as a click.
    onOpen(group.id);
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleMemberDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = members.findIndex((m) => m.id === active.id);
    const newIndex = members.findIndex((m) => m.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    // Only resolvable members have rows to drag, but the reorder replaces the
    // membership wholesale — so ids that did not resolve (a bookmark list that
    // has not finished loading) are carried through rather than deleted.
    const reordered = arrayMove(members, oldIndex, newIndex).map((m) => m.id);
    const shown = new Set(reordered);
    const unresolved = group.bookmarkIds.filter((id) => !shown.has(id));
    onReorderMembers(group.id, [...reordered, ...unresolved]);
  };

  const chip = getTagColorStyles(group.color).chipOn;

  return (
    <div
      className={cn(
        "bg-card border shadow-sm rounded-xl backdrop-blur-sm p-4 group",
        // `backdrop-blur` makes each card its own stacking context, so a z-index
        // on the suggestion list cannot lift it over a later card. Raising the
        // whole card while the list is open is what actually gets it on top.
        suggestions.length > 0 && "relative z-20"
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        {dragHandle}
        <button
          type="button"
          onClick={requestOpen}
          disabled={isAnyOpening || members.length === 0}
          className={cn(
            "flex items-center gap-2 min-w-0 flex-1 text-left rounded-md -m-1 p-1",
            "hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:hover:bg-transparent"
          )}
          title={members.length === 0 ? "このグループにはブックマークがありません" : "Open all"}
        >
          {isOpening ? (
            <Loader2 className="size-4 text-blue-500 animate-spin shrink-0" />
          ) : (
            <Layers className="size-4 text-blue-500 shrink-0" />
          )}
          <span className={cn("rounded-full px-2 py-1 text-xs font-medium truncate", chip)}>
            {group.name}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {members.length} item{members.length === 1 ? "" : "s"}
          </span>
          {!isOpening && members.length > 0 && (
            <Play className="size-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
          )}
        </button>
        {group.shortcut && (
          <kbd className="text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5 bg-muted whitespace-nowrap shrink-0">
            {formatAcceleratorForDisplay(group.shortcut)}
          </kbd>
        )}
        <div className="flex items-center gap-1 shrink-0 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
          <Button
            onClick={(e) => { e.stopPropagation(); onEdit(group); }}
            variant="ghost" size="sm" icon={SquarePen}
          />
          <Button
            onClick={(e) => { e.stopPropagation(); setDeleteConfirmOpen(true); }}
            variant="ghost" size="sm" icon={Trash2}
          />
        </div>
      </div>

      {members.length > 0 && (
        <DndContext
          id={`group-members-${group.id}`}
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleMemberDragEnd}
        >
          <SortableContext
            items={members.map((m) => m.id)}
            strategy={verticalListSortingStrategy}
          >
            <ul className="space-y-1 mb-3">
              {members.map((bookmark, index) => (
                <SortableMember
                  key={bookmark.id}
                  bookmark={bookmark}
                  index={index}
                  onRemove={() => onRemoveMember(group.id, bookmark.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <div className="relative">
        <input
          ref={searchRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && suggestions.length > 0) {
              e.preventDefault();
              add(suggestions[0].id);
            } else if (e.key === "Escape" && query) {
              // Clear the field first; only an already-empty one lets Escape
              // through to the app-wide handler.
              e.stopPropagation();
              setQuery("");
            }
          }}
          placeholder="Add a bookmark by title or URL"
          className="w-full rounded-md border border-input bg-transparent px-3 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        {suggestions.length > 0 && (
          <ul className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((bookmark) => (
              <li key={bookmark.id}>
                <button
                  type="button"
                  onClick={() => add(bookmark.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent"
                >
                  {bookmark.kind === "path" ? (
                    <Folder className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <Globe className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="truncate">{bookmark.title}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              グループ「{group.name}」を削除します。ブックマーク自体は削除されません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete(group.id); setDeleteConfirmOpen(false); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
