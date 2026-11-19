import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Tag } from "@/types/tag";
import { MatchType, TagRule, TagRuleFormData, TargetField, convertTagRuleToUI } from "@/types/tagRule";
import { matchesPattern } from "@/shared/bookmarks/form";
import * as backend from "@/lib/backend";

interface RuleMatcher {
  matchType: MatchType;
  pattern: string;
  targetField: TargetField;
}

/**
 * Add/remove the tag `tagId` on every bookmark whose title/url matches the
 * rule. Shared by tag-rule create (add) and delete (remove).
 *
 * Only the bookmark-tag links are touched, in one transaction. Rewriting each
 * matching bookmark through the update endpoint would reset every field not
 * resent with it — that is how applying a rule used to wipe the bookmarks'
 * keyboard shortcuts.
 */
async function applyTagToMatchingBookmarks(
  rule: RuleMatcher,
  tagId: string,
  mode: "add" | "remove"
) {
  const bookmarks = await backend.listBookmarks();
  const bookmarkIds = bookmarks
    .filter((bm) =>
      matchesPattern(rule.matchType, rule.targetField === "title" ? bm.title : bm.url, rule.pattern)
    )
    .map((bm) => bm.id);
  if (bookmarkIds.length === 0) return;

  await backend.setTagOnBookmarks(tagId, bookmarkIds, mode === "add");
}

export function useTagManagement() {
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagRules, setTagRules] = useState<TagRule[]>([]);

  const fetchTags = useCallback(async (): Promise<Tag[]> => {
    try {
      const tags = await backend.listTags();
      setAvailableTags(tags);
      return tags;
    } catch (error) {
      console.error("Error fetching tags:", error);
      return [];
    }
  }, []);

  const fetchTagRules = useCallback(async (): Promise<TagRule[]> => {
    try {
      const converted = (await backend.listTagRules()).map(convertTagRuleToUI);
      setTagRules(converted);
      return converted;
    } catch (error) {
      console.error("Error fetching tag rules:", error);
      return [];
    }
  }, []);

  const addTag = useCallback(async (name: string) => {
    await backend.createTag(name);
    await fetchTags();
    toast.success("Tag saved");
  }, [fetchTags]);

  const removeTag = useCallback(
    async (name: string, currentTagRules: TagRule[]) => {
      const tagObj = availableTags.find((t) => t.name === name);
      if (tagObj) {
        const relatedRuleIds = currentTagRules
          .filter((r) => r.tagId === tagObj.id)
          .map((r) => r.id);
        for (const ruleId of relatedRuleIds) {
          await backend.deleteTagRule(ruleId);
        }
        if (relatedRuleIds.length > 0) await fetchTagRules();

        await backend.deleteTag(tagObj.id);
        toast.success("Tag removed");
      }
      await fetchTags();
    },
    [availableTags, fetchTags, fetchTagRules]
  );

  const setTagColor = useCallback(
    async (tagId: string, color: string | null) => {
      await backend.setTagColor(tagId, color);
      await fetchTags();
    },
    [fetchTags]
  );

  /** Persist the order produced by dragging rows in Tag Manager. */
  const reorderTags = useCallback(
    async (orderedIds: string[]) => {
      await backend.reorderTags(orderedIds.map((id, index) => ({ id, sort_order: index + 1 })));
      await fetchTags();
    },
    [fetchTags]
  );

  const updateTagName = useCallback(async (oldName: string, newName: string) => {
    const tagObj = availableTags.find((t) => t.name === oldName);
    if (!tagObj) return;
    await backend.renameTag(tagObj.id, newName);
    await fetchTags();
    toast.success("Tag renamed");
  }, [availableTags, fetchTags]);

  const handleUpdateTags = useCallback(
    async (tags: string[]) => {
      try {
        const normalizedTags = tags.map((t) => t.trim()).filter((t) => t.length > 0);

        const removedTags = availableTags.filter((tag) => !normalizedTags.includes(tag.name));
        const newTagNames = normalizedTags.filter(
          (tag) => !availableTags.some((et) => et.name.toLowerCase() === tag.toLowerCase())
        );

        for (const tag of newTagNames) {
          await backend.createTag(tag);
        }

        for (const tag of removedTags) {
          await backend.deleteTag(tag.id);
        }

        await fetchTags();
      } catch (error) {
        console.error("Error updating tags:", error);
        toast.error(error instanceof Error ? error.message : "Failed to update tags");
      }
    },
    [availableTags, fetchTags]
  );

  const saveTagRule = useCallback(async (data: TagRuleFormData) => {
    await backend.createTagRule({
      match_type: data.matchType,
      pattern: data.pattern,
      tag_id: data.tagId,
      target_field: data.targetField,
    });
    await fetchTagRules();

    // Apply rule to existing bookmarks
    await applyTagToMatchingBookmarks(data, data.tagId, "add");
  }, [fetchTagRules]);

  const deleteTagRule = useCallback(
    async (ruleId: string, removeTags: boolean, currentTagRules: TagRule[]) => {
      const rule = currentTagRules.find((r) => r.id === ruleId);
      if (!rule) throw new Error("Rule not found");

      await backend.deleteTagRule(ruleId);

      if (removeTags) {
        await applyTagToMatchingBookmarks(rule, rule.tagId, "remove");
      }

      await fetchTagRules();
    },
    [fetchTagRules]
  );

  const deleteAllBookmarksAndTags = useCallback(async () => {
    // The backend refuses to delete when it cannot save a safety backup first;
    // that rejection stops this before the tags are erased on their own.
    await backend.deleteAllBookmarks();
    await backend.deleteAllTags();
    await fetchTags();
    await fetchTagRules();
  }, [fetchTags, fetchTagRules]);

  return {
    availableTags,
    setAvailableTags,
    tagRules,
    setTagRules,
    fetchTags,
    fetchTagRules,
    addTag,
    removeTag,
    updateTagName,
    setTagColor,
    reorderTags,
    handleUpdateTags,
    saveTagRule,
    deleteTagRule,
    deleteAllBookmarksAndTags,
  };
}
