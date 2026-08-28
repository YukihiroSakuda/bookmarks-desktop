import { useState } from "react";
import { GroupUI } from "@/types/group";
import { Button } from "./Button";
import { TAG_COLORS, getTagColorStyles, resolveTagColor } from "@/lib/tagColors";
import { cn } from "@/lib/utils";

interface GroupFormProps {
  /** Present when editing; absent when creating. */
  group?: GroupUI;
  onClose: () => void;
  /** Resolves false when the name was rejected, keeping the dialog open. */
  onSave: (name: string, color?: string) => Promise<boolean>;
}

export function GroupForm({ group, onClose, onSave }: GroupFormProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState<string>(resolveTagColor(group?.color));
  const [isSaving, setIsSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      await onSave(name.trim(), color);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-md"
      >
        <h2 className="text-sm font-medium mb-4">
          {group ? "Edit group" : "Create group"}
        </h2>

        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onClose();
            }
          }}
          placeholder="e.g. Project A morning"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        <label className="block text-sm font-medium mt-4 mb-2">Color</label>
        <div className="flex flex-wrap gap-2">
          {TAG_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-label={c}
              className={cn(
                "size-6 rounded-full transition-transform",
                getTagColorStyles(c).swatch,
                color === c ? "ring-2 ring-ring ring-offset-2 ring-offset-background" : "hover:scale-110"
              )}
            />
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="sm" isLoading={isSaving} disabled={!name.trim()}>
            {group ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}
