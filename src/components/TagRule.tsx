import { useState } from "react";
import { Button } from "./Button";
import { X, Plus } from "lucide-react";
import { TagRuleForm } from "./TagRuleForm";
import { TagRuleList } from "./TagRuleList";
import { TagRule as TagRuleType, TagRuleFormData } from "../types/tagRule";
import { Tag } from "@/types/tag";

interface TagRuleProps {
  onClose: () => void;
  rules: TagRuleType[];
  availableTags: Tag[];
  onSave: (data: TagRuleFormData) => Promise<void>;
  onDelete: (ruleId: string, removeTags: boolean) => Promise<void>;
}

export const TagRule = ({
  onClose,
  rules,
  availableTags,
  onSave,
  onDelete,
}: TagRuleProps) => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<TagRuleType | undefined>();

  const handleSubmit = async (data: TagRuleFormData) => {
    await onSave(data);
    setIsFormOpen(false);
    setEditingRule(undefined);
  };

  const handleDelete = async (ruleId: string, removeTags: boolean) => {
    await onDelete(ruleId, removeTags);
  };

  return (
    <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            <span className="text-blue-500">#</span>
            Tag Rule
          </h2>
          <Button onClick={onClose} variant="ghost" size="sm" icon={X} />
        </div>

        <div className="flex-1 overflow-y-auto">
          {isFormOpen ? (
            <TagRuleForm
              initialData={editingRule}
              availableTags={availableTags}
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsFormOpen(false);
                setEditingRule(undefined);
              }}
            />
          ) : (
            <>
              <div className="mb-4">
                <Button onClick={() => setIsFormOpen(true)} icon={Plus}>
                  New Rule
                </Button>
              </div>
              <TagRuleList
                rules={rules}
                availableTags={availableTags}
                onDelete={handleDelete}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
