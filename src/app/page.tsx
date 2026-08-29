"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { BookmarkList } from "@/components/BookmarkList";
import { BookmarkHeader } from "@/components/BookmarkHeader";
import { BookmarkForm } from "@/components/BookmarkForm";
import { SavingOrderOverlay } from "@/components/SavingOrderOverlay";
import { DropOverlay } from "@/components/DropOverlay";
import { FolderSearchResults } from "@/components/FolderSearchResults";
import { ViewSwitcher } from "@/components/ViewSwitcher";
import { GroupsView } from "@/components/GroupsView";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TagRuleFormData } from "@/types/tagRule";
import {
  useUserSettings,
  useTagManagement,
  useBookmarks,
  useBookmarkFiltering,
  useBookmarkOrdering,
  useKeyboardShortcuts,
  useBookmarkTabNavigation,
  useBookmarkArrowNavigation,
  useSearchHistory,
  useExplorerImport,
  useBookmarkHotkeys,
  useTypeToSearch,
  useNewBookmarkFromUrl,
  useFolderSearch,
  useBookmarkGroups,
  useGroupHotkeys,
} from "@/hooks";
import { toast } from "sonner";
import { readAppCache, writeAppCache } from "@/lib/appCache";
import { formatAcceleratorForDisplay } from "@/lib/shortcut";
import { BookmarkUI } from "@/types/bookmark";
import { AppView, readAppView, writeAppView } from "@/lib/appView";

export default function BookmarksPage() {
  const { fetchUserSettings, applySettings, ...settings } = useUserSettings();
  const {
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
    handleUpdateTags: handleUpdateTagsBase,
    saveTagRule,
    deleteTagRule,
    deleteAllBookmarksAndTags,
  } = useTagManagement();
  const {
    bookmarks,
    setBookmarks,
    isModalOpen,
    setIsModalOpen,
    selectedBookmark,
    setSelectedBookmark,
    fetchBookmarks,
    handleBookmarksUpdate,
    handleSave,
    handleEdit,
    handleDelete,
    handleTogglePin,
    handleBookmarkClick,
  } = useBookmarks({
    tagRules,
    availableTags,
    fetchTags,
  });

  const { history: searchHistory, addToHistory, removeFromHistory, clearHistory } = useSearchHistory();

  // Bookmark cards only know their tag names, so the colors set in Tag Manager
  // are looked up through this map.
  const tagColors = useMemo(
    () =>
      Object.fromEntries(
        availableTags.filter((tag) => tag.color).map((tag) => [tag.name, tag.color as string])
      ),
    [availableTags]
  );

  const groups = useBookmarkGroups();

  // Which top-level view is showing. Read from localStorage after mount rather
  // than in the initializer: the server render has no localStorage, and
  // seeding state from it directly would make the first client render
  // disagree with the markup React just hydrated.
  const [view, setView] = useState<AppView>("bookmarks");
  useEffect(() => {
    setView(readAppView());
  }, []);
  const handleViewChange = useCallback((next: AppView) => {
    setView(next);
    writeAppView(next);
  }, []);

  const [isOrderingMode, setIsOrderingMode] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [newBookmarkInitialValues, setNewBookmarkInitialValues] = useState<
    Partial<Pick<BookmarkUI, "title" | "url">> | undefined
  >(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tab key cycles focus through bookmark cards only (disabled while a modal
  // is open or the list is in drag-to-reorder mode).
  useBookmarkTabNavigation({ enabled: !isModalOpen && !isOrderingMode });

  // Arrow keys move focus between bookmark cards (Left/Right in document
  // order, Up/Down to the nearest card in the adjacent row).
  useBookmarkArrowNavigation({
    enabled: !isModalOpen && !isOrderingMode,
    searchInputRef,
  });

  const { isDragging } = useExplorerImport({
    isModalOpen,
    onPathDetected: (values) => {
      setSelectedBookmark(undefined);
      setNewBookmarkInitialValues(values);
      setIsModalOpen(true);
    },
  });

  const filtering = useBookmarkFiltering({
    bookmarks,
    currentSort: settings.currentSort,
    currentOrder: settings.currentOrder,
    isOrderingMode,
  });

  useKeyboardShortcuts({
    // Escape clears all active search conditions (query + selected tags).
    // Skipped while a modal is open so it doesn't clear filters underneath
    // a dialog the user is just closing.
    onEscape: () => {
      if (isModalOpen) return;
      filtering.setSearchQuery("");
      filtering.setSelectedTags([]);
    },
  });

  const ordering = useBookmarkOrdering({
    bookmarks,
    setBookmarks,
    searchQuery: filtering.searchQuery,
    selectedTags: filtering.selectedTags,
    currentSort: settings.currentSort,
    currentOrder: settings.currentOrder,
    listColumns: settings.listColumns,
    fetchTags,
    isOrderingMode,
    setIsOrderingMode,
  });

  const { fetchGroups, setGroups } = groups;

  const refreshData = useCallback(async () => {
    try {
      const [fetchedSettings, fetchedTags, fetchedTagRules, fetchedBookmarks, fetchedGroups] =
        await Promise.all([
          fetchUserSettings(),
          fetchTags(),
          fetchTagRules(),
          fetchBookmarks(),
          fetchGroups(),
        ]);
      if (
        fetchedSettings &&
        fetchedTags &&
        fetchedTagRules &&
        fetchedBookmarks &&
        fetchedGroups
      ) {
        writeAppCache({
          bookmarks: fetchedBookmarks,
          tags: fetchedTags,
          tagRules: fetchedTagRules,
          settings: fetchedSettings,
          groups: fetchedGroups,
        });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [fetchUserSettings, fetchTags, fetchTagRules, fetchBookmarks, fetchGroups]);

  // Initial data fetch: show cache immediately, then fetch fresh
  useEffect(() => {
    const cache = readAppCache();
    if (cache) {
      setBookmarks(cache.bookmarks);
      setAvailableTags(cache.tags);
      setTagRules(cache.tagRules);
      applySettings(cache.settings);
      if (cache.groups) setGroups(cache.groups);
    }
    refreshData();
  }, [refreshData, setBookmarks, setAvailableTags, setTagRules, applySettings, setGroups]);

  // Refresh when tab becomes visible (e.g. after using browser extension)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshData();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refreshData]);

  // Refresh immediately when the browser extension adds a bookmark
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("bookmark-added", () => {
      refreshData();
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [refreshData]);

  // Clear the search box whenever the window is summoned via the global
  // shortcut, so it doesn't reopen with a stale query from last time.
  const setSearchQuery = filtering.setSearchQuery;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("summon", () => {
      setSearchQuery("");
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [setSearchQuery]);

  const [confirmGroupId, setConfirmGroupId] = useState<string | null>(null);
  // The Groups view owns its own dialogs (create/edit, capture). They are
  // modals like BookmarkForm, so the keyboard hooks have to stand down for
  // them too — otherwise a shortcut typed into one launches a group behind it.
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const isAnyModalOpen = isModalOpen || isGroupDialogOpen;

  const groupsList = groups.groups;
  const openGroup = groups.openGroup;
  const confirmThreshold = settings.userSettings?.groupOpenConfirmThreshold ?? 10;

  /** Members that still resolve to a bookmark — the count the user will see. */
  const resolvableCount = useCallback(
    (groupId: string) => {
      const group = groupsList.find((g) => g.id === groupId);
      if (!group) return 0;
      const ids = new Set(bookmarks.map((b) => b.id));
      return group.bookmarkIds.filter((id) => ids.has(id)).length;
    },
    [groupsList, bookmarks]
  );

  const requestOpenGroup = useCallback(
    (groupId: string) => {
      const count = resolvableCount(groupId);
      // The card disables itself when empty, but a shortcut has no such state
      // to sit in — without this it reaches the backend and surfaces a raw
      // error string as a toast.
      if (count === 0) {
        toast.info("このグループにはブックマークがありません");
        return;
      }
      if (count > confirmThreshold) {
        setConfirmGroupId(groupId);
        return;
      }
      openGroup(groupId);
    },
    [resolvableCount, confirmThreshold, openGroup]
  );

  useBookmarkHotkeys({
    bookmarks,
    isModalOpen: isAnyModalOpen,
    onActivate: handleBookmarkClick,
    searchInputRef,
  });

  // Group shortcuts run the same launch as clicking the card, and work from
  // either view — the point of a shortcut is not having to navigate first.
  useGroupHotkeys({
    groups: groups.groups,
    bookmarks,
    isModalOpen: isAnyModalOpen,
    onActivate: requestOpenGroup,
    searchInputRef,
  });

  // Type any plain character to focus the search box and start searching.
  // Only in the bookmarks view: the Groups view has no search box, so
  // keystrokes would pile up in a query nobody can see — and each one starts a
  // `search_in_folders` walk of the filesystem.
  useTypeToSearch({
    enabled: view === "bookmarks",
    isModalOpen,
    searchInputRef,
    onTypeCharacter: (char) =>
      filtering.setSearchQuery((prev) => prev + char),
  });

  // The asynchronous half of search: file names inside bookmarked folders.
  // Disabled while reordering, where the list is not a search result.
  const {
    folderSearch,
    showProgress: isFolderSearchSlow,
  } = useFolderSearch({
    searchQuery: filtering.searchQuery,
    enabled: !isOrderingMode,
  });

  const handleOpenFoundPath = useCallback(async (fullPath: string) => {
    try {
      await invoke("open_path", { path: fullPath });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  }, []);

  const handleOpenContainingFolder = useCallback(
    async (fullPath: string) => {
      const cut = Math.max(fullPath.lastIndexOf("\\"), fullPath.lastIndexOf("/"));
      await handleOpenFoundPath(cut > 0 ? fullPath.slice(0, cut) : fullPath);
    },
    [handleOpenFoundPath]
  );

  useNewBookmarkFromUrl((values) => {
    setSelectedBookmark(undefined);
    setNewBookmarkInitialValues(values);
    setIsModalOpen(true);
  });

  // Tag operation handlers (compose tag mutations + bookmark refresh)
  const handleAddTag = useCallback(
    async (name: string) => {
      await addTag(name);
      await fetchBookmarks();
    },
    [addTag, fetchBookmarks]
  );

  const handleRemoveTag = useCallback(
    async (name: string) => {
      await removeTag(name, tagRules);
      await fetchBookmarks();
    },
    [removeTag, tagRules, fetchBookmarks]
  );

  const handleUpdateTagName = useCallback(
    async (oldName: string, newName: string) => {
      await updateTagName(oldName, newName);
      await fetchBookmarks();
    },
    [updateTagName, fetchBookmarks]
  );

  const handleSaveTagRule = useCallback(
    async (data: TagRuleFormData) => {
      await saveTagRule(data);
      await fetchBookmarks();
    },
    [saveTagRule, fetchBookmarks]
  );

  const handleDeleteTagRule = useCallback(
    async (ruleId: string, removeTags: boolean) => {
      await deleteTagRule(ruleId, removeTags, tagRules);
      await fetchBookmarks();
    },
    [deleteTagRule, tagRules, fetchBookmarks]
  );

  const handleDeleteAll = useCallback(() => {
    setIsDeleteAllOpen(true);
  }, []);

  const confirmDeleteAll = useCallback(async () => {
    try {
      await deleteAllBookmarksAndTags();
      setBookmarks([]);
    } catch (error) {
      console.error("Error deleting all:", error);
    }
  }, [deleteAllBookmarksAndTags, setBookmarks]);

  // Tag update handler for BookmarkForm
  const handleUpdateTags = useCallback(
    async (tagNames: string[]) => {
      await handleUpdateTagsBase(tagNames);
      await fetchBookmarks();
    },
    [handleUpdateTagsBase, fetchBookmarks]
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <main className="flex flex-col flex-1 min-h-0 p-2">
        <div className="flex flex-col flex-1 min-h-0">
          <div className="mb-2">
            <ViewSwitcher
              view={view}
              onViewChange={handleViewChange}
              disabled={isOrderingMode}
            />
          </div>

          {view === "groups" ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <GroupsView
                groups={groups.groups}
                bookmarks={bookmarks}
                openingGroupId={groups.openingGroupId}
                onOpenGroup={requestOpenGroup}
                onCreateGroup={groups.createGroup}
                onUpdateGroup={groups.updateGroup}
                onDeleteGroup={groups.deleteGroup}
                onAddMembers={groups.addToGroup}
                onRemoveMember={groups.removeFromGroup}
                onReorderMembers={groups.setGroupMembers}
                onReorderGroups={groups.reorderGroups}
                onDialogOpenChange={setIsGroupDialogOpen}
              />
            </div>
          ) : (
          <>
          <BookmarkHeader
            listColumns={settings.listColumns}
            summonShortcut={settings.userSettings?.summonShortcut ?? "CmdOrCtrl+Alt+Space"}
            onSummonShortcutChange={async (accelerator) => {
              const result = await settings.updateUserSettings({ summonShortcut: accelerator });
              if (result?.failed?.length) {
                toast.warning(
                  `Shortcut couldn't be registered (already in use): ${result.failed
                    .map(formatAcceleratorForDisplay)
                    .join(", ")}`
                );
              }
            }}
            groupFolderOpenMode={settings.userSettings?.groupFolderOpenMode ?? "tabs"}
            groupOpenConfirmThreshold={settings.userSettings?.groupOpenConfirmThreshold ?? 10}
            onGroupSettingsChange={async (patch) => {
              await settings.updateUserSettings(patch);
            }}
            shortcutDirEnabled={settings.userSettings?.shortcutDirEnabled ?? false}
            shortcutDirPath={settings.userSettings?.shortcutDirPath ?? ""}
            onShortcutDirChange={async (patch) => {
              await settings.updateUserSettings(patch);
            }}
            onListColumnsChange={async (columns) => {
              await settings.updateUserSettings({
                listColumns: columns,
              });
            }}
            selectedTags={filtering.selectedTags}
            onAddBookmark={() => {
              setNewBookmarkInitialValues(undefined);
              setSelectedBookmark(undefined);
              setIsModalOpen(true);
            }}
            searchQuery={filtering.searchQuery}
            onSearchChange={filtering.setSearchQuery}
            availableTags={availableTags}
            onTagClick={filtering.handleTagClick}
            onClearAll={() => filtering.setSelectedTags([])}
            onBookmarksUpdate={handleBookmarksUpdate}
            bookmarks={bookmarks}
            tagRules={tagRules}
            isOrderingMode={isOrderingMode}
            onUpdateTagName={handleUpdateTagName}
            onAddTag={handleAddTag}
            onRemoveTag={handleRemoveTag}
            onSetTagColor={setTagColor}
            onReorderTags={reorderTags}
            onSaveTagRule={handleSaveTagRule}
            onDeleteTagRule={handleDeleteTagRule}
            onDeleteAll={handleDeleteAll}
            onRestoreComplete={refreshData}
            searchHistory={searchHistory}
            onRemoveHistory={removeFromHistory}
            onClearHistory={clearHistory}
            searchInputRef={searchInputRef}
            currentSort={settings.currentSort}
            currentOrder={settings.currentOrder}
            onSortChange={async (sortOption) => {
              await settings.updateUserSettings({
                sortOption,
              });
            }}
            onOrderChange={async (sortOrder) => {
              await settings.updateUserSettings({
                sortOrder,
              });
            }}
            onOrderingModeChange={ordering.handleOrderingModeToggle}
            isSavingOrder={ordering.isSavingOrder}
          />

          <div className="flex-1 min-h-0 overflow-y-auto p-1.5">
            <BookmarkList
              pinnedBookmarks={filtering.filteredAndSortedBookmarks.pinned}
              unpinnedBookmarks={filtering.filteredAndSortedBookmarks.unpinned}
              listColumns={isOrderingMode ? 1 : settings.listColumns}
              onTogglePin={handleTogglePin}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onBookmarkClick={(bookmark) => {
                if (filtering.searchQuery) {
                  addToHistory(filtering.searchQuery);
                }
                handleBookmarkClick(bookmark);
              }}
              isOrderingMode={isOrderingMode}
              onReorder={ordering.handleReorder}
              tagColors={tagColors}
            />

            <FolderSearchResults
              result={folderSearch}
              showProgress={isFolderSearchSlow}
              listColumns={settings.listColumns}
              onOpen={handleOpenFoundPath}
              onOpenContaining={handleOpenContainingFolder}
            />
          </div>
          </>
          )}

          {isModalOpen && (
            <BookmarkForm
              bookmark={selectedBookmark}
              initialValues={selectedBookmark ? undefined : newBookmarkInitialValues}
              onClose={() => {
                setNewBookmarkInitialValues(undefined);
                setIsModalOpen(false);
                setSelectedBookmark(undefined);
              }}
              onSave={async (bookmarkData) => {
                await handleSave(bookmarkData);
                setNewBookmarkInitialValues(undefined);
              }}
              availableTags={availableTags}
              onUpdateTags={handleUpdateTags}
              existingBookmarks={
                selectedBookmark
                  ? bookmarks.filter((b) => b.id !== selectedBookmark.id)
                  : bookmarks
              }
            />
          )}
        </div>
      </main>

      <AlertDialog
        open={confirmGroupId !== null}
        onOpenChange={(open) => { if (!open) setConfirmGroupId(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Open {confirmGroupId ? resolvableCount(confirmGroupId) : 0} bookmarks?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmGroupId ? resolvableCount(confirmGroupId) : 0}件を一度に開きます。よろしいですか？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmGroupId) openGroup(confirmGroupId);
                setConfirmGroupId(null);
              }}
            >
              Open
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SavingOrderOverlay isVisible={ordering.isSavingOrder} />
      <DropOverlay visible={isDragging} />

      <AlertDialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all bookmarks?</AlertDialogTitle>
            <AlertDialogDescription>
              All bookmarks and tags will be permanently deleted. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteAll}>
              Delete all
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
