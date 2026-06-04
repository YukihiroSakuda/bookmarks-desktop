import { useState } from "react";
import { Button } from "./Button";
import { MatchType } from "../types/tagRule";
import { Input } from "./Input";
import { Tag } from "@/types/tag";

interface TagRuleFormDataSingle {
  matchType: MatchType;
  pattern: string;
  tagId: string;
  targetField: "url" | "title";
}

interface TagRuleFormProps {
  initialData?: TagRuleFormDataSingle;
  availableTags: Tag[];
  onSubmit: (data: TagRuleFormDataSingle) => void | Promise<void>;
  onCancel: () => void;
}

export const TagRuleForm = ({
  initialData,
  availableTags,
  onSubmit,
  onCancel,
}: TagRuleFormProps) => {
  const [formData, setFormData] = useState<TagRuleFormDataSingle>(
    initialData || {
      matchType: "contains",
      pattern: "",
      tagId: availableTags[0]?.id || "",
      targetField: "url",
    }
  );
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSubmit(formData);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-1">
      <div>
        <label className="block text-sm font-medium mb-1">Target Field</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <Input
              type="radio"
              value="url"
              checked={formData.targetField === "url"}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  targetField: e.target.value as "url" | "title",
                })
              }
            />
            URL
          </label>
          <label className="flex items-center gap-2">
            <Input
              type="radio"
              value="title"
              checked={formData.targetField === "title"}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  targetField: e.target.value as "url" | "title",
                })
              }
            />
            Title
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Pattern</label>
        <div className="flex gap-2 w-full">
          <select
            value={formData.matchType}
            onChange={(e) =>
              setFormData({
                ...formData,
                matchType: e.target.value as MatchType,
              })
            }
            className="px-3 py-2 border rounded-lg bg-background text-foreground"
          >
            <option value="starts_with">Starts with</option>
            <option value="contains">Contains</option>
            <option value="ends_with">Ends with</option>
          </select>
          <div className="flex-1">
            <Input
              type="text"
              value={formData.pattern}
              onChange={(e) =>
                setFormData({ ...formData, pattern: e.target.value })
              }
              placeholder="Enter pattern..."
              required
            />
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Tag</label>
        <select
          value={formData.tagId}
          onChange={(e) => setFormData({ ...formData, tagId: e.target.value })}
          className="w-full px-3 py-2 border rounded-lg bg-transparent"
          required
        >
          {availableTags.map((tag) => (
            <option key={tag.id} value={tag.id}>
              {tag.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" isLoading={isSaving}>Save</Button>
      </div>
    </form>
  );
};
