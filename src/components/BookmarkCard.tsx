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

function getFaviconUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const h = urlObj.hostname;
    if (!h || h === 'localhost' || !h.includes('.') ||
        h.includes('.kmt.') || h.includes('.komatsu.') ||
        h.includes('.local') || h.includes('.internal') ||
        h.match(/^\d+\.\d+\.\d+\.\d+$/)) {
      return '';
    }
    return `https://www.google.com/s2/favicons?domain=${h}&sz=32`;
  } catch {
    return '';
  }
}

const FaviconDisplay = memo(function FaviconDisplay({ url }: { url: string }) {
  const [showFallback, setShowFallback] = useState(false);
  const handleError = useCallback(() => setShowFallback(true), []);

  if (!url || showFallback) {
    return <Globe className="size-4 text-foreground" />;
  }

  return (
    <Image
      src={url}
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
}

const BookmarkCard = memo(function BookmarkCard({
  bookmark,
  onTogglePin,
  onEdit,
  onDelete,
  onClick,
  isOrderingMode = false,
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
    bookmark.tags.sort((a, b) => a.localeCompare(b)),
    [bookmark.tags]
  );

  const isPath = bookmark.kind === 'path';
  const faviconUrl = useMemo(() => getFaviconUrl(bookmark.url), [bookmark.url]);
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
      className={`backdrop-blur-sm rounded-lg bg-card border-y border-r ${
        bookmark.isPinned ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-blue-500'
      } ${
        isOrderingMode ? 'cursor-grab active:cursor-grabbing' : 'hover:bg-accent'
      } flex items-center justify-between p-2 group`}
    >
      <div className="flex items-center flex-1 min-w-0 gap-2">
        {isOrderingMode && (
          <GripVertical className="size-4 text-muted-foreground" />
        )}
        {isPath ? (
          <Folder className="size-4 text-foreground shrink-0" />
        ) : (
          <FaviconDisplay url={faviconUrl} />
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
            data-bookmark-card-link
            className="flex-1 min-w-0 overflow-hidden cursor-pointer"
            onClick={(e) => {
              e.preventDefault();
              onClick();
            }}
          >
            <h3 className="font-medium text-sm truncate">{bookmark.title}</h3>
            {domain && <p className="text-xs text-muted-foreground truncate">{domain}</p>}
          </a>
        )}
        {showTags && sortedTags.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 overflow-hidden max-w-[50%] md:max-w-[60%]">
            {sortedTags.slice(0, Math.min(sortedTags.length, 3)).map((tag) => (
              <Tag key={tag} tag={tag} isSelected={true} />
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
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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