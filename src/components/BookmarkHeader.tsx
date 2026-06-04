import {
  Plus,
  Search,
  Tag,
  X,
  BookOpenCheck,
  History,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo, RefObject } from "react";
import { TagManager } from "./TagManager";
import { Tag as TagComponent } from "./Tag";
import { Button } from "./Button";
import { BookmarkUI, SortOption, SortOrder } from "@/types/bookmark";
import { TagRule as TagRuleType, TagRuleFormData } from "../types/tagRule";
import { Tag as TagType } from "@/types/tag";
import { TagRule as TagRuleComponent } from "./TagRule";
import { SortControls } from "./SortControls";
import { SettingsDialog } from "./SettingsDialog";
import { HelpDialog } from "./HelpDialog";

interface BookmarkHeaderProps {
  listColumns: 1 | 2 | 3 | 4;
  onListColumnsChange: (columns: 1 | 2 | 3 | 4) => void;
  selectedTags: string[];
  onAddBookmark: () => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  availableTags: TagType[];
  onTagClick: (tag: string, ctrlKey?: boolean) => void;
  onClearAll: () => void;
  onBookmarksUpdate: (bookmarks: BookmarkUI[]) => void;
  bookmarks: BookmarkUI[];
  tagRules: TagRuleType[];
  isOrderingMode?: boolean;
  onUpdateTagName: (oldName: string, newName: string) => Promise<void>;
  onAddTag: (name: string) => Promise<void>;
  onRemoveTag: (name: string) => Promise<void>;
  onSaveTagRule: (data: TagRuleFormData) => Promise<void>;
  onDeleteTagRule: (ruleId: string, removeTags: boolean) => Promise<void>;
  onDeleteAll: () => void;
  searchHistory: string[];
  onRemoveHistory: (query: string) => void;
  onClearHistory: () => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  currentSort: SortOption;
  currentOrder: SortOrder;
  onSortChange: (option: SortOption) => void;
  onOrderChange: (order: SortOrder) => void;
  onOrderingModeChange?: (enabled: boolean) => void;
  isSavingOrder?: boolean;
}

export function BookmarkHeader({
  listColumns,
  onListColumnsChange,
  selectedTags,
  onAddBookmark,
  searchQuery,
  onSearchChange,
  availableTags,
  onTagClick,
  onClearAll,
  onBookmarksUpdate,
  bookmarks,
  tagRules,
  isOrderingMode = false,
  onUpdateTagName,
  onAddTag,
  onRemoveTag,
  onSaveTagRule,
  onDeleteTagRule,
  onDeleteAll,
  searchHistory,
  onRemoveHistory,
  onClearHistory,
  searchInputRef,
  currentSort,
  currentOrder,
  onSortChange,
  onOrderChange,
  onOrderingModeChange,
  isSavingOrder = false,
}: BookmarkHeaderProps) {
  const [isTagManagerOpen, setIsTagManagerOpen] = useState(false);
  const [isTagRuleOpen, setIsTagRuleOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return searchHistory;
    const q = searchQuery.trim().toLowerCase();
    return searchHistory.filter(
      (h) => h.toLowerCase().includes(q) && h.toLowerCase() !== q
    );
  }, [searchHistory, searchQuery]);

  const showHistory = isHistoryOpen && filteredHistory.length > 0 && !isOrderingMode;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsHistoryOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <>
      <div className="flex items-center justify-between gap-3 my-2 px-3">
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-bold">
            Book<span className="text-blue-500">marks</span>
          </h1>
        </div>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2 w-full md:w-auto max-w-4xl">
          <div className="relative flex-1" ref={searchContainerRef}>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Find your bookmarks..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              onFocus={() => setIsHistoryOpen(true)}
              className="w-full px-3 py-2 pl-8 rounded-md border border-input bg-transparent text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring text-base disabled:opacity-50 disabled:cursor-not-allowed md:text-sm"
              disabled={isOrderingMode}
            />
            <Search
              className="absolute left-2 top-1/2 transform -translate-y-1/2 text-muted-foreground"
              size={16}
            />
            {searchQuery ? (
              <button
                type="button"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => onSearchChange("")}
                disabled={isOrderingMode}
              >
                <X size={16} />
              </button>
            ) : !isHistoryOpen && (
              <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex items-center px-1.5 py-0.5 text-xs font-medium bg-muted border border-border rounded text-muted-foreground">
                /
              </kbd>
            )}
            {showHistory && (
              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b">
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                    <History size={12} />
                    Recent searches
                  </span>
                  <button
                    type="button"
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onClearHistory();
                    }}
                  >
                    Clear all
                  </button>
                </div>
                <ul>
                  {filteredHistory.map((query) => (
                    <li
                      key={query}
                      className="flex items-center gap-2 px-3 py-2 hover:bg-accent cursor-pointer group transition-colors"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onSearchChange(query);
                        setIsHistoryOpen(false);
                      }}
                    >
                      <Search size={14} className="text-muted-foreground shrink-0" />
                      <span className="text-sm truncate flex-1">{query}</span>
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onRemoveHistory(query);
                        }}
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <HelpDialog />
            <SettingsDialog
              listColumns={listColumns}
              onListColumnsChange={onListColumnsChange}
              bookmarks={bookmarks}
              onBookmarksUpdate={onBookmarksUpdate}
              onDeleteAll={onDeleteAll}
              isOrderingMode={isOrderingMode}
            />
            <Button
              onClick={onAddBookmark}
              variant="primary"
              size="sm"
              icon={Plus}
              disabled={isOrderingMode}
            >
              Add Bookmark
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-xl border p-2 mb-3">
        <div className="border-b pb-2 mb-2">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-medium tracking-tight">
                <span className="text-blue-500">#</span> Filter by Tags
              </h2>
              <span className="text-xs text-muted-foreground hidden sm:inline">Ctrl+click: multi-select</span>
              {selectedTags.length > 0 && (
                <Button
                  onClick={onClearAll}
                  variant="ghost"
                  size="sm"
                  icon={X}
                  disabled={isOrderingMode}
                >
                  Clear all tags
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => setIsTagManagerOpen(true)}
                variant="secondary"
                size="sm"
                icon={Tag}
                disabled={isOrderingMode}
              >
                Tag Manager
              </Button>
              <Button
                onClick={() => setIsTagRuleOpen(true)}
                variant="secondary"
                size="sm"
                icon={BookOpenCheck}
                disabled={isOrderingMode}
              >
                Tag Rule
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {availableTags
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((tag) => (
                <TagComponent
                  key={tag.id}
                  tag={tag.name}
                  onClick={(ctrlKey) => onTagClick(tag.name, ctrlKey)}
                  isSelected={selectedTags.includes(tag.name)}
                  isDisabled={isOrderingMode}
                />
              ))}
          </div>
        </div>
        <SortControls
          currentSort={currentSort}
          currentOrder={currentOrder}
          onSortChange={onSortChange}
          onOrderChange={onOrderChange}
          isOrderingMode={isOrderingMode}
          onOrderingModeChange={onOrderingModeChange}
          isSavingOrder={isSavingOrder}
        />
      </div>

      {isTagManagerOpen && (
        <TagManager
          availableTags={availableTags}
          onClose={() => setIsTagManagerOpen(false)}
          onUpdateTagName={async (oldName, newName) => {
            await onUpdateTagName(oldName, newName);
          }}
          onAddTag={async (tag) => {
            await onAddTag(tag);
          }}
          onRemoveTag={async (tag) => {
            await onRemoveTag(tag);
          }}
        />
      )}

      {isTagRuleOpen && (
        <TagRuleComponent
          onClose={() => setIsTagRuleOpen(false)}
          rules={tagRules}
          availableTags={availableTags}
          onSave={async (data: TagRuleFormData) => {
            try {
              await onSaveTagRule(data);
            } catch (error) {
              console.error("Error saving tag rule:", error);
              alert("Error saving tag rule");
            }
          }}
          onDelete={async (ruleId: string, removeTags: boolean) => {
            try {
              await onDeleteTagRule(ruleId, removeTags);
            } catch (error) {
              console.error("Error deleting tag rule:", error);
              alert("Error deleting tag rule");
            }
          }}
        />
      )}
    </>
  );
}
