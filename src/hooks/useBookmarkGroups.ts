import { useState, useCallback } from "react";
import { toast } from "sonner";
import { GroupUI, Group, OpenGroupResult, convertGroupToUI } from "@/types/group";
import { tauriFetch as fetch } from "@/lib/tauriFetch";

export function useBookmarkGroups() {
  const [groups, setGroups] = useState<GroupUI[]>([]);
  /** Id of the group currently being opened, so it cannot be launched twice. */
  const [openingGroupId, setOpeningGroupId] = useState<string | null>(null);

  const fetchGroups = useCallback(async (): Promise<GroupUI[]> => {
    try {
      const res = await fetch("/api/groups");
      if (!res.ok) throw new Error("Failed to fetch groups");
      const data: Group[] = await res.json();
      const ui = data.map(convertGroupToUI);
      setGroups(ui);
      return ui;
    } catch (error) {
      console.error("Error fetching groups:", error);
      return [];
    }
  }, []);

  const createGroup = useCallback(
    async (name: string, color?: string, shortcut?: string): Promise<boolean> => {
      try {
        const res = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, color, shortcut }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to create group");
        await fetchGroups();
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [fetchGroups]
  );

  const updateGroup = useCallback(
    async (
      id: string,
      data: { name: string; color?: string; shortcut?: string }
    ): Promise<boolean> => {
      try {
        const res = await fetch(`/api/groups/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to update group");
        await fetchGroups();
        return true;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        return false;
      }
    },
    [fetchGroups]
  );

  const deleteGroup = useCallback(
    async (id: string) => {
      try {
        const res = await fetch(`/api/groups/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Failed to delete group");
        await fetchGroups();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      }
    },
    [fetchGroups]
  );

  const addToGroup = useCallback(
    async (id: string, bookmarkIds: string[]) => {
      // Optimistic: the search field is meant to be typed through without
      // waiting, so the member has to appear in the list immediately.
      setGroups((prev) =>
        prev.map((g) =>
          g.id === id
            ? { ...g, bookmarkIds: [...g.bookmarkIds, ...bookmarkIds.filter((b) => !g.bookmarkIds.includes(b))] }
            : g
        )
      );
      try {
        const res = await fetch(`/api/groups/${id}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookmarkIds }),
        });
        if (!res.ok) throw new Error("Failed to add to group");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        await fetchGroups();
      }
    },
    [fetchGroups]
  );

  const removeFromGroup = useCallback(
    async (id: string, bookmarkId: string) => {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === id ? { ...g, bookmarkIds: g.bookmarkIds.filter((b) => b !== bookmarkId) } : g
        )
      );
      try {
        const res = await fetch(`/api/groups/${id}/members`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookmarkId }),
        });
        if (!res.ok) throw new Error("Failed to remove from group");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        await fetchGroups();
      }
    },
    [fetchGroups]
  );

  const setGroupMembers = useCallback(
    async (id: string, bookmarkIds: string[]) => {
      setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, bookmarkIds } : g)));
      try {
        const res = await fetch(`/api/groups/${id}/members`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookmarkIds }),
        });
        if (!res.ok) throw new Error("Failed to reorder members");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        await fetchGroups();
      }
    },
    [fetchGroups]
  );

  const reorderGroups = useCallback(
    async (ordered: GroupUI[]) => {
      setGroups(ordered);
      try {
        const res = await fetch("/api/groups/reorder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            order: ordered.map((g, index) => ({ id: g.id, sort_order: index + 1 })),
          }),
        });
        if (!res.ok) throw new Error("Failed to save group order");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        await fetchGroups();
      }
    },
    [fetchGroups]
  );

  /**
   * Open every member of a group. The Rust side does the sequencing and never
   * aborts on one failure, so the result reports partial success rather than
   * throwing.
   */
  const openGroup = useCallback(
    async (id: string) => {
      if (openingGroupId) return;
      setOpeningGroupId(id);
      try {
        const res = await fetch(`/api/groups/${id}/open`, { method: "POST" });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Failed to open group");

        const result = body as OpenGroupResult;
        // Deliberately not "opened in tabs": Windows gives no way to confirm a
        // tab was created, so claiming it would be asserting more than is known.
        if (result.failures.length === 0) {
          toast.success(`Opened ${result.opened} bookmarks`);
        } else {
          toast.warning(
            `Opened ${result.opened}, ${result.failures.length} failed: ` +
              result.failures.map((f) => f.title).join(", ")
          );
        }
        return result;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
      } finally {
        setOpeningGroupId(null);
      }
    },
    [openingGroupId]
  );

  return {
    groups,
    setGroups,
    openingGroupId,
    fetchGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addToGroup,
    removeFromGroup,
    setGroupMembers,
    reorderGroups,
    openGroup,
  };
}
