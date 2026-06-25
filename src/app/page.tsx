"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { BookmarkList } from "@/components/BookmarkList";
import { BookmarkHeader } from "@/components/BookmarkHeader";
import { BookmarkForm } from "@/components/BookmarkForm";
import { SavingOrderOverlay } from "@/components/SavingOrderOverlay";
import { DropOverlay } from "@/components/DropOverlay";
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
  useSearchHistory,
  useExplorerImport,
  useBookmarkHotkeys,
  useNewBookmarkFromUrl,
} from "@/hooks";
import { toast } from "sonner";
import { readAppCache, writeAppCache } from "@/lib/appCache";
import { formatAcceleratorForDisplay } from "@/lib/shortcut";
import { BookmarkUI } from "@/types/bookmark";

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

  const [isOrderingMode, setIsOrderingMode] = useState(false);
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [newBookmarkInitialValues, setNewBookmarkInitialValues] = useState<
    Partial<Pick<BookmarkUI, "title" | "url">> | undefined
  >(undefined);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Tab key cycles focus through bookmark cards only (disabled while a modal
  // is open or the list is in drag-to-reorder mode).
  useBookmarkTabNavigation({ enabled: !isModalOpen && !isOrderingMode });

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
    onFocusSearch: () => searchInputRef.current?.focus(),
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

  const refreshData = useCallback(async () => {
    try {
      const [fetchedSettings, fetchedTags, fetchedTagRules, fetchedBookmarks] = await Promise.all([
        fetchUserSettings(),
        fetchTags(),
        fetchTagRules(),
        fetchBookmarks(),
      ]);
      if (fetchedSettings && fetchedTags && fetchedTagRules && fetchedBookmarks) {
        writeAppCache({
          bookmarks: fetchedBookmarks,
          tags: fetchedTags,
          tagRules: fetchedTagRules,
          settings: fetchedSettings,
        });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
    }
  }, [fetchUserSettings, fetchTags, fetchTagRules, fetchBookmarks]);

  // Initial data fetch: show cache immediately, then fetch fresh
  useEffect(() => {
    const cache = readAppCache();
    if (cache) {
      setBookmarks(cache.bookmarks);
      setAvailableTags(cache.tags);
      setTagRules(cache.tagRules);
      applySettings(cache.settings);
    }
    refreshData();
  }, [refreshData, setBookmarks, setAvailableTags, setTagRules, applySettings]);

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

  useBookmarkHotkeys({
    bookmarks,
    isModalOpen,
    onActivate: handleBookmarkClick,
  });

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

          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
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
            />
          </div>

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
