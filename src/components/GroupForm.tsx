import { useEffect, useMemo, useState } from "react";
import { Keyboard, TriangleAlert, X } from "lucide-react";
import { BookmarkUI } from "@/types/bookmark";
import { GroupUI } from "@/types/group";
import { Button } from "./Button";
import { TAG_COLORS, getTagColorStyles, resolveTagColor } from "@/lib/tagColors";
import { eventToAccelerator, formatAcceleratorForDisplay } from "@/lib/shortcut";
import { cn } from "@/lib/utils";

interface GroupFormProps {
  /** Present when editing; absent when creating. */
  group?: GroupUI;
  onClose: () => void;
  /** Resolves false when the name was rejected, keeping the dialog open. */
  onSave: (name: string, color?: string, shortcut?: string) => Promise<boolean>;
  /**
   * Everything else that can already claim a combo. Groups and bookmarks share
   * one keyboard namespace, so both are checked here — otherwise a group could
   * be given a combo a bookmark already owns, and the bookmark would silently
   * win at press time.
   */
  otherGroups: GroupUI[];
  bookmarks: BookmarkUI[];
}

export function GroupForm({
  group,
  onClose,
  onSave,
  otherGroups,
  bookmarks,
}: GroupFormProps) {
  const [name, setName] = useState(group?.name ?? "");
  const [color, setColor] = useState<string>(resolveTagColor(group?.color));
  const [shortcut, setShortcut] = useState<string | null>(group?.shortcut ?? null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const conflict = useMemo(() => {
    if (!shortcut) return undefined;
    const g = otherGroups.find((o) => o.id !== group?.id && o.shortcut === shortcut);
    if (g) return g.name;
    return bookmarks.find((b) => b.shortcut === shortcut)?.title;
  }, [shortcut, otherGroups, bookmarks, group?.id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // While capturing, Escape cancels the capture rather than the dialog.
      if (e.key === "Escape" && !isCapturing) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isCapturing, onClose]);

  const handleShortcutKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.key === "Escape") {
      setIsCapturing(false);
      e.currentTarget.blur();
      return;
    }
    const accelerator = eventToAccelerator(e.nativeEvent);
    if (accelerator) {
      setShortcut(accelerator);
      setIsCapturing(false);
      e.currentTarget.blur();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isSaving || conflict) return;
    setIsSaving(true);
    try {
      await onSave(name.trim(), color, shortcut ?? undefined);
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

        <label className="block text-sm font-medium mt-4 mb-2">Shortcut</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              readOnly
              value={
                isCapturing
                  ? "Press a key combination…"
                  : shortcut
                  ? formatAcceleratorForDisplay(shortcut)
                  : ""
              }
              placeholder="Click to set a shortcut"
              onFocus={() => setIsCapturing(true)}
              onBlur={() => setIsCapturing(false)}
              onKeyDown={handleShortcutKeyDown}
              className="w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer caret-transparent"
            />
          </div>
          {shortcut && (
            <Button
              type="button"
              onClick={() => setShortcut(null)}
              variant="secondary"
              size="md"
              icon={X}
              title="Clear shortcut"
            />
          )}
        </div>
        {conflict ? (
          <div className="flex items-center gap-1.5 mt-1 text-sm text-amber-500">
            <TriangleAlert size={14} className="shrink-0" />
            <span>
              Already used by &ldquo;<strong>{conflict}</strong>&rdquo;
            </span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground mt-1">
            Requires at least one modifier (Ctrl / Alt / Shift). Opens this group
            while the app is open.
          </p>
        )}

        <div className="flex justify-end gap-2 mt-6">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            disabled={!name.trim() || Boolean(conflict)}
          >
            {group ? "Save" : "Create"}
          </Button>
        </div>
      </form>
    </div>
  );
}
