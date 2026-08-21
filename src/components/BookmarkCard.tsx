import { BookmarkUI } from '@/types/bookmark';
import { Trash2, Pin, SquarePen, Globe, GripVertical, Folder } from 'lucide-react';
import Image from 'next/image';
import { Button } from './Button';
import { Tag } from './Tag';
import { MemoField } from './MemoField';
import { formatAcceleratorForDisplay } from '@/lib/shortcut';
import { useState, memo, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * The icon stored on the bookmark (a `data:` URI fetched once when it was
 * added), or the generic globe. Nothing here touches the network.
 */
const FaviconDisplay = memo(function FaviconDisplay({ favicon }: { favicon?: string }) {
  const [showFallback, setShowFallback] = useState(false);
  const handleError = useCallback(() => setShowFallback(true), []);

  if (!favicon || showFallback) {
    return <Globe className="size-4 text-foreground" />;
  }

  return (
    <Image
      src={favicon}
      alt=""
      width={16}
      height={16}
      className="size-4 rounded-sm"
      onError={handleError}
      unoptimized
    />
  );
});

interface BookmarkCardProps {
  bookmark: BookmarkUI;
  onTogglePin: (id: string) => void | Promise<void>;
  onEdit: (bookmark: BookmarkUI) => void;
  onDelete: (id: string) => void | Promise<void>;
  onClick: () => void;
  isOrderingMode?: boolean;
  /** Tag name -> color palette key, for the colors set in Tag Manager. */
  tagColors?: Record<string, string>;
}

const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  onTogglePin,
  onEdit,
  onDelete,
  onClick,
  isOrderingMode = false,
  tagColors,
}: BookmarkCardProps) {
  const [showTags, setShowTags] = useState(true);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isPinLoading, setIsPinLoading] = useState(false);
  const [isDeleteLoading, setIsDeleteLoading] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = cardRef.current;
    if (!element) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setShowTags(entry.contentRect.width >= 400);
      }
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, []);

  const sortedTags = useMemo(() =>
    [...bookmark.tags].sort((a, b) => a.localeCompare(b)),
    [bookmark.tags]
  );

  const isPath = bookmark.kind === 'path';
  const domain = useMemo(() => {
    if (isPath) return bookmark.url;
    try {
      return new URL(bookmark.url).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  }, [bookmark.url, isPath]);

  return (
    <div
      ref={cardRef}
      data-bookmark-id={bookmark.id}
      className={`backdrop-blur-sm rounded-lg bg-card border-y border-r ${
        bookmark.isPinned ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-blue-500'
      } ${
        isOrderingMode ? 'cursor-grab active:cursor-grabbing' : 'hover:bg-accent focus-within:bg-accent focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background'
      } flex items-center justify-between p-2 group`}
    >
      <div className="flex items-center flex-1 min-w-0 gap-2">
        {isOrderingMode && (
          <GripVertical className="size-4 text-muted-foreground" />
        )}
        {isPath ? (
          <Folder className="size-4 text-foreground shrink-0" />
        ) : (
          <FaviconDisplay favicon={bookmark.favicon} />
        )}
        {isOrderingMode ? (
          <div className="flex-1 min-w-0 overflow-hidden">
            <h3 className="font-medium text-sm truncate">{bookmark.title}</h3>
            {domain && <p className="text-xs text-muted-foreground truncate">{domain}</p>}
          </div>
        ) : (
          <a
            href={isPath ? undefined : bookmark.url}
            target={isPath ? undefined : "_blank"}
            rel={isPath ? undefined : "noopener noreferrer"}
            tabIndex={0}
            data-bookmark-card-link
            className="flex-1 min-w-0 overflow-hidden cursor-pointer outline-none"
            onClick={(e) => {
              e.preventDefault();
              onClick();
            }}
            onKeyDown={(e) => {
              if (isPath && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onClick();
              }
            }}
          >
            <h3 className="font-medium text-sm truncate">{bookmark.title}</h3>
            {domain && <p className="text-xs text-muted-foreground truncate">{domain}</p>}
          </a>
        )}
        {showTags && sortedTags.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 overflow-hidden max-w-[50%] md:max-w-[60%]">
            {sortedTags.slice(0, Math.min(sortedTags.length, 3)).map((tag) => (
              <Tag key={tag} tag={tag} color={tagColors?.[tag]} isSelected={true} />
            ))}
            {sortedTags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{sortedTags.length - 3}</span>
            )}
          </div>
        )}
        {!isOrderingMode && bookmark.memo && (
          <MemoField memo={bookmark.memo} compact />
        )}
      </div>
      {!isOrderingMode && (
        <div className="flex items-center gap-1 shrink-0 ml-3">
          {bookmark.shortcut && (
            <kbd className="text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5 bg-muted whitespace-nowrap">
              {formatAcceleratorForDisplay(bookmark.shortcut)}
            </kbd>
          )}
          <div className="flex items-center gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-opacity">
            <Button
              onClick={async (e) => { e.stopPropagation(); setIsPinLoading(true); try { await onTogglePin(bookmark.id); } finally { setIsPinLoading(false); } }}
              variant="ghost" size="sm" icon={Pin} isActive={bookmark.isPinned} isLoading={isPinLoading}
            />
            <Button
              onClick={(e) => { e.stopPropagation(); onEdit(bookmark); }}
              variant="ghost" size="sm" icon={SquarePen}
            />
            <Button
              onClick={(e) => { e.stopPropagation(); setDeleteConfirmOpen(true); }}
              variant="ghost" size="sm" icon={Trash2}
            />
          </div>
        </div>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete bookmark?</AlertDialogTitle>
            <AlertDialogDescription>
              &ldquo;{bookmark.title}&rdquo; will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { setIsDeleteLoading(true); try { await onDelete(bookmark.id); } finally { setIsDeleteLoading(false); setDeleteConfirmOpen(false); } }}
              disabled={isDeleteLoading}
            >
              {isDeleteLoading ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export { BookmarkCard }; 