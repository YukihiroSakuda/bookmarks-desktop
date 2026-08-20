import { GripVertical, SquarePen, Trash2, X } from "lucide-react";
import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "./Button";
import { Input } from "./Input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TAG_COLORS, TAG_COLOR_STYLES, getTagColorStyles } from "@/lib/tagColors";
import { Tag } from "@/types/tag";

interface TagManagerProps {
  availableTags: Tag[];
  onClose: () => void;
  onUpdateTagName: (oldName: string, newName: string) => Promise<void>;
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
  onSetTagColor: (tagId: string, color: string | null) => Promise<void>;
  onReorderTags: (orderedIds: string[]) => Promise<void>;
}

interface TagColorPickerProps {
  color: string | null;
  onSelect: (color: string | null) => void;
}

function TagColorPicker({ color, onSelect }: TagColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const styles = getTagColorStyles(color);

  const handleSelect = (next: string | null) => {
    setIsOpen(false);
    onSelect(next);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Tag color"
          className={`size-4 rounded-full border shrink-0 ${
            styles ? styles.swatch : "bg-transparent border-dashed border-muted-foreground"
          }`}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-2" align="start">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="No color"
            onClick={() => handleSelect(null)}
            className={`size-5 rounded-full border border-dashed border-muted-foreground ${
              color === null ? "ring-1 ring-ring ring-offset-1 ring-offset-popover" : ""
            }`}
          />
          {TAG_COLORS.map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              onClick={() => handleSelect(name)}
              className={`size-5 rounded-full ${TAG_COLOR_STYLES[name].swatch} ${
                color === name ? "ring-1 ring-ring ring-offset-1 ring-offset-popover" : ""
              }`}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface SortableTagRowProps {
  tag: Tag;
  children: React.ReactNode;
}

function SortableTagRow({ tag, children }: SortableTagRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tag.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-2 p-2 bg-secondary rounded-lg border"
    >
      <button
        type="button"
        title="Drag to reorder"
        className="cursor-grab active:cursor-grabbing text-muted-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </div>
  );
}

export function TagManager({
  availableTags,
  onClose,
  onUpdateTagName,
  onAddTag,
  onRemoveTag,
  onSetTagColor,
  onReorderTags,
}: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    setTags([...availableTags]);
  }, [availableTags]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingTag) {
        handleCancelEdit();
      } else {
        onClose();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editingTag, onClose]);

  const handleAddTag = async () => {
    const normalizedTag = newTag.trim();
    if (!normalizedTag) return;
    const isDuplicate = tags.some(
      (tag) => tag.name.toLowerCase() === normalizedTag.toLowerCase()
    );
    if (!isDuplicate) {
      setIsAdding(true);
      try {
        await onAddTag(normalizedTag);
        setNewTag("");
      } catch (error) {
        console.error("Error adding tag:", error);
        alert("タグの追加中にエラーが発生しました。");
      } finally {
        setIsAdding(false);
      }
    }
  };

  const handleRemoveTag = async (tagToRemove: Tag) => {
    if (window.confirm(`Are you sure you want to delete the tag "${tagToRemove.name}"?`)) {
      setRemovingTagId(tagToRemove.id);
      try {
        await onRemoveTag(tagToRemove.name);
      } catch (error) {
        console.error("Error removing tag:", error);
        alert("タグの削除中にエラーが発生しました。");
      } finally {
        setRemovingTagId(null);
      }
    }
  };

  const handleStartEdit = (tag: Tag) => {
    setEditingTag(tag);
    setEditValue(tag.name);
  };

  const handleSaveEdit = async () => {
    const normalizedEditValue = editValue.trim();
    if (editingTag && normalizedEditValue) {
      const isDuplicate = tags.some(
        (tag) =>
          tag.id !== editingTag.id &&
          tag.name.toLowerCase() === normalizedEditValue.toLowerCase()
      );
      if (!isDuplicate) {
        setIsSavingEdit(true);
        try {
          await onUpdateTagName(editingTag.name, normalizedEditValue);
          setEditingTag(null);
          setEditValue("");
        } catch (error) {
          console.error("Error updating tag:", error);
          alert("タグの更新中にエラーが発生しました。");
        } finally {
          setIsSavingEdit(false);
        }
      }
    }
  };

  const handleCancelEdit = () => {
    setEditingTag(null);
    setEditValue("");
  };

  const handleSelectColor = async (tag: Tag, color: string | null) => {
    // Optimistic: the chip recolors immediately, the reload from `availableTags`
    // confirms it a moment later.
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, color } : t)));
    try {
      await onSetTagColor(tag.id, color);
    } catch (error) {
      console.error("Error updating tag color:", error);
      setTags([...availableTags]);
      alert("タグの色の変更中にエラーが発生しました。");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tags.findIndex((t) => t.id === active.id);
    const newIndex = tags.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tags, oldIndex, newIndex);
    setTags(reordered);
    try {
      await onReorderTags(reordered.map((t) => t.id));
    } catch (error) {
      console.error("Error reordering tags:", error);
      setTags([...availableTags]);
      alert("タグの並び替え中にエラーが発生しました。");
    }
  };

  return (
    <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            <span className="text-blue-500">#</span>
            Tag Manager
          </h2>
          <Button onClick={onClose} variant="ghost" size="sm" icon={X} />
        </div>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          <div>
            <div className="flex gap-2 mb-4 mx-1 mt-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Add new tag"
                className="flex-1"
              />
              <Button
                type="button"
                onClick={handleAddTag}
                variant="primary"
                size="md"
                isLoading={isAdding}
              >
                Add
              </Button>
            </div>

            <label className="block text-sm font-medium mb-1">Your Tags</label>

            <div className="flex flex-col gap-2">
              {tags.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No tags yet. Add your first tag above!
                </p>
              )}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={tags.map((t) => t.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="flex flex-col gap-2">
                    {tags.map((tag) => (
                      <SortableTagRow key={tag.id} tag={tag}>
                        {editingTag && editingTag.id === tag.id ? (
                          <div className="flex-1 flex gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="flex-1"
                            />
                            <Button
                              onClick={handleSaveEdit}
                              variant="secondary"
                              size="sm"
                              isLoading={isSavingEdit}
                            >
                              OK
                            </Button>
                            <Button
                              onClick={handleCancelEdit}
                              variant="secondary"
                              size="sm"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <>
                            <TagColorPicker
                              color={tag.color ?? null}
                              onSelect={(color) => handleSelectColor(tag, color)}
                            />
                            <span className="text-sm flex-1 truncate">{tag.name}</span>
                            <div className="flex items-center gap-1">
                              <Button
                                onClick={() => handleStartEdit(tag)}
                                variant="ghost"
                                size="sm"
                                icon={SquarePen}
                              />
                              <Button
                                onClick={() => handleRemoveTag(tag)}
                                variant="ghost"
                                size="sm"
                                icon={Trash2}
                                isLoading={removingTagId === tag.id}
                              />
                            </div>
                          </>
                        )}
                      </SortableTagRow>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
