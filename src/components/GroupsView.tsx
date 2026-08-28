import { useState } from "react";
import { Layers, Plus } from "lucide-react";
import { BookmarkUI } from "@/types/bookmark";
import { GroupUI } from "@/types/group";
import { Button } from "./Button";
import { GroupCard } from "./GroupCard";
import { GroupForm } from "./GroupForm";

interface GroupsViewProps {
  groups: GroupUI[];
  bookmarks: BookmarkUI[];
  openingGroupId: string | null;
  confirmThreshold: number;
  onOpenGroup: (id: string) => void;
  onCreateGroup: (name: string, color?: string) => Promise<boolean>;
  onUpdateGroup: (id: string, data: { name: string; color?: string }) => Promise<boolean>;
  onDeleteGroup: (id: string) => void;
  onAddMembers: (id: string, bookmarkIds: string[]) => void;
  onRemoveMember: (id: string, bookmarkId: string) => void;
}

export function GroupsView({
  groups,
  bookmarks,
  openingGroupId,
  confirmThreshold,
  onOpenGroup,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onAddMembers,
  onRemoveMember,
}: GroupsViewProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<GroupUI | undefined>(undefined);

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
        <Button onClick={openCreate} variant="primary" size="sm" icon={Plus}>
          Create group
        </Button>
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
          <Button onClick={openCreate} variant="secondary" size="sm" icon={Plus}>
            Create group
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              bookmarks={bookmarks}
              isOpening={openingGroupId === group.id}
              isAnyOpening={openingGroupId !== null}
              confirmThreshold={confirmThreshold}
              onOpen={onOpenGroup}
              onEdit={openEdit}
              onDelete={onDeleteGroup}
              onAddMembers={onAddMembers}
              onRemoveMember={onRemoveMember}
            />
          ))}
        </div>
      )}

      {formOpen && (
        <GroupForm
          group={editing}
          onClose={() => setFormOpen(false)}
          onSave={async (name, color) => {
            const ok = editing
              ? await onUpdateGroup(editing.id, { name, color })
              : await onCreateGroup(name, color);
            if (ok) setFormOpen(false);
            return ok;
          }}
        />
      )}
    </div>
  );
}
