import { BookmarkUI } from '@/types/bookmark';
import { getListColumnClasses } from '@/lib/listLayout';
import { BookmarkCard } from './BookmarkCard';
import { Pin } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface BookmarkListProps {
  pinnedBookmarks: BookmarkUI[];
  unpinnedBookmarks: BookmarkUI[];
  listColumns: 1 | 2 | 3 | 4;
  onTogglePin: (id: string) => void;
  onEdit: (bookmark: BookmarkUI) => void;
  onDelete: (id: string) => void;
  onBookmarkClick: (bookmark: BookmarkUI) => void;
  isOrderingMode?: boolean;
  onReorder?: (oldIndex: number, newIndex: number, isPinned: boolean) => void;
  /** Tag name -> color palette key, for the colors set in Tag Manager. */
  tagColors?: Record<string, string>;
}

interface SortableBookmarkCardProps {
  bookmark: BookmarkUI;
  onTogglePin: (id: string) => void;
  onEdit: (bookmark: BookmarkUI) => void;
  onDelete: (id: string) => void;
  onClick: () => void;
  isOrderingMode: boolean;
  tagColors?: Record<string, string>;
}

function SortableBookmarkCard({
  bookmark,
  onTogglePin,
  onEdit,
  onDelete,
  onClick,
  isOrderingMode,
  tagColors,
}: SortableBookmarkCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bookmark.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <BookmarkCard
        bookmark={bookmark}
        onTogglePin={onTogglePin}
        onEdit={onEdit}
        onDelete={onDelete}
        onClick={isOrderingMode ? () => {} : onClick}
        isOrderingMode={isOrderingMode}
        tagColors={tagColors}
      />
    </div>
  );
}

export function BookmarkList({
  pinnedBookmarks,
  unpinnedBookmarks,
  listColumns,
  onTogglePin,
  onEdit,
  onDelete,
  onBookmarkClick,
  isOrderingMode = false,
  onReorder,
  tagColors,
}: BookmarkListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // 動的なレイアウトクラスを生成
  const getLayoutClasses = () => {
    if (isOrderingMode) {
      return "grid grid-cols-1 gap-2";
    }
    return getListColumnClasses(listColumns);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || !onReorder) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId !== overId) {
      // Determine if the dragged item is pinned
      const isPinnedActive = pinnedBookmarks.some(b => b.id === activeId);
      const isPinnedOver = pinnedBookmarks.some(b => b.id === overId);
      
      // Only allow reordering within the same section (pinned or unpinned)
      if (isPinnedActive === isPinnedOver) {
        const items = isPinnedActive ? pinnedBookmarks : unpinnedBookmarks;
        const oldIndex = items.findIndex(item => item.id === activeId);
        const newIndex = items.findIndex(item => item.id === overId);
        
        onReorder(oldIndex, newIndex, isPinnedActive);
      }
    }
  };

  const renderBookmarks = (bookmarks: BookmarkUI[]) => {
    if (isOrderingMode) {
      return bookmarks.map((bookmark) => (
        <SortableBookmarkCard
          key={bookmark.id}
          bookmark={bookmark}
          onTogglePin={onTogglePin}
          onEdit={onEdit}
          onDelete={onDelete}
          onClick={() => onBookmarkClick(bookmark)}
          isOrderingMode={isOrderingMode}
          tagColors={tagColors}
        />
      ));
    }

    return bookmarks.map((bookmark) => (
      <BookmarkCard
        key={bookmark.id}
        bookmark={bookmark}
        onTogglePin={onTogglePin}
        onEdit={onEdit}
        onDelete={onDelete}
        onClick={() => onBookmarkClick(bookmark)}
        isOrderingMode={isOrderingMode}
        tagColors={tagColors}
      />
    ));
  };

  if (isOrderingMode) {
    return (
      <div className="flex flex-col gap-2">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          {/* Pinned Bookmarks */}
          {pinnedBookmarks.length > 0 && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Pinned Bookmarks
              </div>
              <SortableContext
                items={pinnedBookmarks.map(b => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className={getLayoutClasses()}>
                  {renderBookmarks(pinnedBookmarks)}
                </div>
              </SortableContext>
            </div>
          )}


          {/* Unpinned Bookmarks */}
          {unpinnedBookmarks.length > 0 && (
            <div>
              <div className="text-sm font-medium text-muted-foreground mb-2">
                Other Bookmarks
              </div>
              <SortableContext
                items={unpinnedBookmarks.map(b => b.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className={getLayoutClasses()}>
                  {renderBookmarks(unpinnedBookmarks)}
                </div>
              </SortableContext>
            </div>
          )}
        </DndContext>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Pinned Bookmarks */}
      {pinnedBookmarks.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
            <Pin size={12} />
            <span>Pinned</span>
          </div>
          <div className={getLayoutClasses()}>
            {renderBookmarks(pinnedBookmarks)}
          </div>
        </div>
      )}

      {pinnedBookmarks.length > 0 && unpinnedBookmarks.length > 0 && (
        <div className="border-t border-border" />
      )}

      {/* Unpinned Bookmarks */}
      {unpinnedBookmarks.length > 0 && (
        <div className={getLayoutClasses()}>
          {renderBookmarks(unpinnedBookmarks)}
        </div>
      )}

      {pinnedBookmarks.length === 0 && unpinnedBookmarks.length === 0 && (
        <div className="text-center py-1">
          <p>No bookmarks found.</p>
        </div>
      )}
    </div>
  );
} 