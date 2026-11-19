'use client';

import { useState } from 'react';
import { BookmarkUI, convertToUI } from '@/types/bookmark';
import * as backend from '@/lib/backend';
import { extractLinksFromHtml, planBookmarkImport } from '@/lib/bookmarkImport';
import {
  createBookmark,
  fetchBookmarks,
  fetchTagRules,
  fetchTags,
} from '@/shared/bookmarks/api';

export interface ImportResult {
  imported: number;
  /** Already saved, or repeated within the file. */
  duplicates: number;
}

/** Thrown when an import stops part-way; `imported` bookmarks were saved before it. */
export class BookmarkImportError extends Error {
  constructor(message: string, readonly imported: number) {
    super(message);
    this.name = 'BookmarkImportError';
  }
}

interface UseImportBookmarksProps {
  onBookmarksUpdate?: (bookmarks: BookmarkUI[]) => void;
}

export function useImportBookmarks({ onBookmarksUpdate }: UseImportBookmarksProps = {}) {
  const [isImporting, setIsImporting] = useState(false);

  const importFile = async (file: File): Promise<ImportResult> => {
    setIsImporting(true);
    let imported = 0;
    try {
      const links = extractLinksFromHtml(await file.text());
      const [existing, availableTags, tagRules] = await Promise.all([
        fetchBookmarks(),
        fetchTags(),
        fetchTagRules(),
      ]);
      const { toCreate, duplicates } = planBookmarkImport(links, existing);

      for (const link of toCreate) {
        // The shared create applies the tag rules, the same as adding by hand.
        await createBookmark(
          {
            title: link.title,
            url: link.url,
            kind: 'url',
            isPinned: false,
            tags: [],
            createdAt: link.createdAt,
          },
          { availableTags, tagRules }
        );
        imported++;
      }

      return { imported, duplicates };
    } catch (error) {
      console.error('Import error:', error);
      throw new BookmarkImportError(
        error instanceof Error ? error.message : String(error),
        imported
      );
    } finally {
      // Refresh even after a failure, so what did get saved is on screen.
      if (imported > 0) {
        try {
          onBookmarksUpdate?.((await backend.listBookmarks()).map(convertToUI));
        } catch {
          /* the next full refresh picks them up */
        }
      }
      setIsImporting(false);
    }
  };

  return { isImporting, importFile };
}
