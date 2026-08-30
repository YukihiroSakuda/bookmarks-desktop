import { useEffect, useState } from "react";
import { Download, GripVertical, Layers, Plus } from "lucide-react";
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
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { BookmarkUI } from "@/types/bookmark";
import { GroupUI, OpenFolder } from "@/types/group";
import { Button } from "./Button";
import { GroupCard } from "./GroupCard";
import { GroupForm } from "./GroupForm";
import { CaptureDialog } from "./CaptureDialog";

interface GroupsViewProps {
  groups: GroupUI[];
  bookmarks: BookmarkUI[];
  openingGroupId: string | null;
  onOpenGroup: (id: string) => void;
  onCreateGroup: (name: string, color?: string, shortcut?: string) => Promise<string | null>;
  onLoadOpenFolders: () => Promise<OpenFolder[]>;
  onCapture: (name: string, paths: string[]) => Promise<boolean>;
  onUpdateGroup: (
    id: string,
    data: { name: string; color?: string; shortcut?: string }
  ) => Promise<boolean>;
  onDeleteGroup: (id: string) => void;
  onAddMembers: (id: string, bookmarkIds: string[]) => void;
  onRemoveMember: (id: string, bookmarkId: string) => void;
  onReorderMembers: (id: string, bookmarkIds: string[]) => void;
  onReorderGroups: (ordered: GroupUI[]) => void;
  /** Told when a dialog here opens or closes, so app-wide keyboard
   *  shortcuts can stand down for it. */
  onDialogOpenChange?: (open: boolean) => void;
}

interface SortableGroupCardProps {
  group: GroupUI;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}

/**
 * Wraps a group card so it can be dragged. The card body is a click target
 * that launches the group, so dragging is restricted to an explicit grip.
 */
function SortableGroupCard({ group, children }: SortableGroupCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: group.id,
  });

  const handle = (
    <button
      type="button"
      title="Drag to reorder"
      className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children(handle)}
    </div>
  );
}

export function GroupsView({
  groups,
  bookmarks,
  openingGroupId,
  onOpenGroup,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onAddMembers,
  onRemoveMember,
  onReorderMembers,
  onReorderGroups,
  onLoadOpenFolders,
  onCapture,
  onDialogOpenChange,
}: GroupsViewProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [captureOpen, setCaptureOpen] = useState(false);
  const [editing, setEditing] = useState<GroupUI | undefined>(undefined);

  useEffect(() => {
    onDialogOpenChange?.(formOpen || captureOpen);
  }, [formOpen, captureOpen, onDialogOpenChange]);

  // Leaving the view with a dialog open would otherwise strand the flag at
  // true and leave every shortcut dead.
  useEffect(() => () => onDialogOpenChange?.(false), [onDialogOpenChange]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onReorderGroups(arrayMove(groups, oldIndex, newIndex));
  };

  const openCreate = () => {
    setEditing(undefined);
    setFormOpen(true);
  };

  const openEdit = (group: GroupUI) => {
    setEditing(group);
    setFormOpen(true);
  };

  return (
    <div className="p-1.5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium tracking-tight">
          <span className="text-blue-500">#</span> Groups
        </h2>
        <div className="flex items-center gap-2">
          <Button onClick={() => setCaptureOpen(true)} variant="secondary" size="sm" icon={Download}>
            Capture open folders
          </Button>
          <Button onClick={openCreate} variant="primary" size="sm" icon={Plus}>
            Create group
          </Button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Layers className="size-8 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">No groups yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              A group opens all of its bookmarks in one click.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setCaptureOpen(true)} variant="secondary" size="sm" icon={Download}>
              Capture open folders
            </Button>
            <Button onClick={openCreate} variant="secondary" size="sm" icon={Plus}>
              Create group
            </Button>
          </div>
        </div>
      ) : (
        <DndContext
          id="groups-reorder"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={groups.map((g) => g.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
              {groups.map((group) => (
                <SortableGroupCard key={group.id} group={group}>
                  {(dragHandle) => (
                    <GroupCard
                      group={group}
                      bookmarks={bookmarks}
                      isOpening={openingGroupId === group.id}
                      isAnyOpening={openingGroupId !== null}
                      onOpen={onOpenGroup}
                      onEdit={openEdit}
                      onDelete={onDeleteGroup}
                      onAddMembers={onAddMembers}
                      onRemoveMember={onRemoveMember}
                      onReorderMembers={onReorderMembers}
                      dragHandle={dragHandle}
                    />
                  )}
                </SortableGroupCard>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {formOpen && (
        <GroupForm
          group={editing}
          otherGroups={groups}
          bookmarks={bookmarks}
          onClose={() => setFormOpen(false)}
          onSave={async (name, color, shortcut) => {
            const ok = editing
              ? await onUpdateGroup(editing.id, { name, color, shortcut })
              : Boolean(await onCreateGroup(name, color, shortcut));
            if (ok) setFormOpen(false);
            return ok;
          }}
        />
      )}

      {captureOpen && (
        <CaptureDialog
          onClose={() => setCaptureOpen(false)}
          onLoad={onLoadOpenFolders}
          onCapture={onCapture}
        />
      )}
    </div>
  );
}
