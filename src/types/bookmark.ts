export type BookmarkKind = 'url' | 'path';

export interface Bookmark {
  id: string;
  kind: BookmarkKind;
  title: string;
  url: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  favicon?: string;
  access_count: number;
  last_accessed_at?: string;
  custom_order?: number;
  memo?: string;
}

export interface BookmarkUI {
  id: string;
  kind: BookmarkKind;
  title: string;
  url: string;
  tags: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  favicon?: string;
  accessCount: number;
  lastAccessedAt?: string;
  customOrder?: number;
  memo?: string;
}

export type SortOption = 'accessCount' | 'title' | 'createdAt' | 'custom';
export type SortOrder = 'asc' | 'desc';

export const convertToUI = (bookmark: Bookmark & { tags: string[] }): BookmarkUI => ({
  id: bookmark.id,
  kind: bookmark.kind ?? 'url',
  title: bookmark.title,
  url: bookmark.url,
  tags: bookmark.tags || [],
  isPinned: bookmark.is_pinned,
  createdAt: bookmark.created_at,
  updatedAt: bookmark.updated_at,
  accessCount: bookmark.access_count,
  lastAccessedAt: bookmark.last_accessed_at || undefined,
  customOrder: bookmark.custom_order,
  memo: bookmark.memo || undefined,
});
