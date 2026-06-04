import { useState } from "react";
import { Button } from "./Button";
import { Tag as TagComponent } from "./Tag";
import { TagRule } from "../types/tagRule";
import { Trash2 } from "lucide-react";
import { Tag } from "@/types/tag";

interface TagRuleListProps {
  rules: TagRule[];
  availableTags: Tag[];
  onDelete: (ruleId: string, removeTags: boolean) => void | Promise<void>;
}

const getRuleSentence = (rule: TagRule, availableTags: Tag[]) => {
  const field = rule.targetField === "title" ? "Title" : "URL";
  const match =
    rule.matchType === "starts_with"
      ? "starts with"
      : rule.matchType === "contains"
      ? "contains"
      : "ends with";
  const tag = availableTags.find((t) => t.id === rule.tagId);
  return (
    <div className="text-sm text-muted-foreground flex items-center flex-wrap">
      <span>
        If the {field} {match} &quot;{rule.pattern}&quot;, add tag:
      </span>
      {tag && (
        <span className="ml-1 inline-block">
          <TagComponent tag={tag.name} isSelected={true} />
        </span>
      )}
    </div>
  );
};

export const TagRuleList = ({
  rules,
  availableTags,
  onDelete,
}: TagRuleListProps) => {
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      {rules.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No rules yet. Add your first rule above!
        </p>
      )}
      {rules.map((rule) => (
        <div
          key={rule.id}
          className="p-4 border rounded-lg"
        >
          <div className="flex justify-between items-start mb-2">
            <div>{getRuleSentence(rule, availableTags)}</div>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              isLoading={deletingRuleId === rule.id}
              onClick={async () => {
                const removeTags = window.confirm(
                  "Do you want to remove the tags added by this rule? (Cancel to delete only the rule)"
                );
                setDeletingRuleId(rule.id);
                try {
                  await onDelete(rule.id, removeTags);
                } finally {
                  setDeletingRuleId(null);
                }
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
};
