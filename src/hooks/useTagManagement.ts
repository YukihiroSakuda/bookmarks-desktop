import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Tag } from "@/types/tag";
import { TagRule, TagRuleDB, TagRuleFormData, convertTagRuleToUI } from "@/types/tagRule";
import { tauriFetch as fetch } from "@/lib/tauriFetch";

export function useTagManagement() {
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [tagRules, setTagRules] = useState<TagRule[]>([]);

  const fetchTags = useCallback(async (): Promise<Tag[]> => {
    try {
      const res = await fetch("/api/tags");
      if (!res.ok) throw new Error("Failed to fetch tags");
      const tags = await res.json();
      setAvailableTags(tags);
      return tags;
    } catch (error) {
      console.error("Error fetching tags:", error);
      return [];
    }
  }, []);

  const fetchTagRules = useCallback(async (): Promise<TagRule[]> => {
    try {
      const res = await fetch("/api/tag-rules");
      if (!res.ok) throw new Error("Failed to fetch tag rules");
      const rules: TagRuleDB[] = await res.json();
      const converted = rules.map(convertTagRuleToUI);
      setTagRules(converted);
      return converted;
    } catch (error) {
      console.error("Error fetching tag rules:", error);
      return [];
    }
  }, []);

  const addTag = useCallback(async (name: string) => {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error("Failed to add tag");
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
          await fetch(`/api/tag-rules/${ruleId}`, { method: "DELETE" });
        }
        if (relatedRuleIds.length > 0) await fetchTagRules();

        await fetch(`/api/tags/${tagObj.id}`, { method: "DELETE" });
        toast.success("Tag removed");
      }
      await fetchTags();
    },
    [availableTags, fetchTags, fetchTagRules]
  );

  const updateTagName = useCallback(async (oldName: string, newName: string) => {
    const tagObj = availableTags.find((t) => t.name === oldName);
    if (!tagObj) return;
    const res = await fetch(`/api/tags/${tagObj.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    if (!res.ok) throw new Error("Failed to update tag name");
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
          await fetch("/api/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: tag }),
          });
        }

        for (const tag of removedTags) {
          await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
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
    const res = await fetch("/api/tag-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        match_type: data.matchType,
        pattern: data.pattern,
        tag_id: data.tagId,
        target_field: data.targetField,
      }),
    });
    if (!res.ok) throw new Error("Failed to save tag rule");
    await fetchTagRules();

    // Apply rule to existing bookmarks
    const bmRes = await fetch("/api/bookmarks");
    const bookmarks = await bmRes.json();
    const pattern = data.pattern.toLowerCase();
    const matchFn = (value: string) => {
      if (data.matchType === "starts_with") return value.startsWith(pattern);
      if (data.matchType === "contains") return value.includes(pattern);
      if (data.matchType === "ends_with") return value.endsWith(pattern);
      return false;
    };
    const tagObj = availableTags.find((t) => t.id === data.tagId);
    if (!tagObj) return;

    for (const bm of bookmarks) {
      const target = (data.targetField === "title" ? bm.title : bm.url).toLowerCase();
      if (matchFn(target)) {
        const currentTags = bm.bookmarks_tags.map((bt: { tags: { name: string } }) => bt.tags.name);
        if (!currentTags.includes(tagObj.name)) {
          await fetch(`/api/bookmarks/${bm.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: bm.title,
              url: bm.url,
              kind: bm.kind,
              favicon: bm.favicon,
              is_pinned: bm.is_pinned,
              memo: bm.memo,
              tags: [...currentTags, tagObj.name],
            }),
          });
        }
      }
    }
  }, [fetchTagRules, availableTags]);

  const deleteTagRule = useCallback(
    async (ruleId: string, removeTags: boolean, currentTagRules: TagRule[]) => {
      const rule = currentTagRules.find((r) => r.id === ruleId);
      if (!rule) throw new Error("Rule not found");

      await fetch(`/api/tag-rules/${ruleId}`, { method: "DELETE" });

      if (removeTags) {
        const bmRes = await fetch("/api/bookmarks");
        const bookmarks = await bmRes.json();
        const pattern = rule.pattern.toLowerCase();
        const matchFn = (value: string) => {
          if (rule.matchType === "starts_with") return value.startsWith(pattern);
          if (rule.matchType === "contains") return value.includes(pattern);
          if (rule.matchType === "ends_with") return value.endsWith(pattern);
          return false;
        };
        const tagObj = availableTags.find((t) => t.id === rule.tagId);
        if (tagObj) {
          for (const bm of bookmarks) {
            const target = (rule.targetField === "title" ? bm.title : bm.url).toLowerCase();
            if (matchFn(target)) {
              const currentTags = bm.bookmarks_tags
                .map((bt: { tags: { name: string } }) => bt.tags.name)
                .filter((n: string) => n !== tagObj.name);
              await fetch(`/api/bookmarks/${bm.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  title: bm.title,
                  url: bm.url,
                  kind: bm.kind,
                  favicon: bm.favicon,
                  is_pinned: bm.is_pinned,
                  memo: bm.memo,
                  tags: currentTags,
                }),
              });
            }
          }
        }
      }

      await fetchTagRules();
    },
    [fetchTagRules, availableTags]
  );

  const deleteAllBookmarksAndTags = useCallback(async () => {
    await fetch("/api/bookmarks", { method: "DELETE" });
    await fetch("/api/tags", { method: "DELETE" });
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
    handleUpdateTags,
    saveTagRule,
    deleteTagRule,
    deleteAllBookmarksAndTags,
  };
}
