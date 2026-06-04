import { SquarePen, Trash2, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Tag } from "@/types/tag";

interface TagManagerProps {
  availableTags: Tag[];
  onClose: () => void;
  onUpdateTagName: (oldName: string, newName: string) => Promise<void>;
  onAddTag: (tag: string) => Promise<void>;
  onRemoveTag: (tag: string) => Promise<void>;
}

export function TagManager({
  availableTags,
  onClose,
  onUpdateTagName,
  onAddTag,
  onRemoveTag,
}: TagManagerProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [removingTagId, setRemovingTagId] = useState<string | null>(null);

  useEffect(() => {
    setTags([...availableTags]);
  }, [availableTags]);

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
              {tags
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((tag) => (
                  <div
                    key={tag.id}
                    className="flex items-center justify-between p-2 bg-secondary rounded-lg border"
                  >
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
                        <span className="text-sm">{tag.name}</span>
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
                  </div>
                ))}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
