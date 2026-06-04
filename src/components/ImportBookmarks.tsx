'use client';

import { useState } from 'react';
import { BookmarkUI, convertToUI } from '@/types/bookmark';

interface UseImportBookmarksProps {
  onImportComplete?: (importedCount: number) => void;
  onBookmarksUpdate?: (bookmarks: BookmarkUI[]) => void;
}

export function useImportBookmarks({
  onImportComplete,
  onBookmarksUpdate
}: UseImportBookmarksProps = {}) {
  const [isImporting, setIsImporting] = useState(false);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(text, 'text/html');
      const links = doc.getElementsByTagName('a');

      const existingRes = await fetch('/api/bookmarks');
      const existingBookmarks: { url: string }[] = await existingRes.json();

      let imported = 0;
      for (const link of Array.from(links)) {
        const url = link.href;
        const title = link.textContent || '';
        if (!url || existingBookmarks.some((b) => b.url === url)) continue;

        let createdAt: string;
        try {
          const addDate = link.getAttribute('add_date');
          createdAt = addDate && !isNaN(parseInt(addDate))
            ? new Date(parseInt(addDate) * 1000).toISOString()
            : new Date().toISOString();
        } catch {
          createdAt = new Date().toISOString();
        }

        await fetch('/api/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, url, is_pinned: false, tags: [], created_at: createdAt }),
        });
        imported++;
      }

      const updatedRes = await fetch('/api/bookmarks');
      const updatedData = await updatedRes.json();
      onBookmarksUpdate?.(updatedData.map(convertToUI));

      onImportComplete?.(imported);
      return imported;
    } catch (error) {
      console.error('インポートエラー:', error);
      throw new Error('インポート中にエラーが発生しました');
    } finally {
      setIsImporting(false);
    }
  };

  return { isImporting, handleFileUpload };
}
