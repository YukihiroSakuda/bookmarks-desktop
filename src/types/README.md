# 型定義

DB (snake_case) と UI (camelCase) の間で型変換関数を用いてデータを変換する。

## bookmark.ts

### DB 型
```typescript
interface Bookmark {
  id: string;
  title: string;
  url: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  access_count: number;
  custom_order?: number;
  encrypted_memo?: string;
  memo_iv?: string;
  favicon?: string;
  last_accessed_at?: string;
}
```

### UI 型
```typescript
interface BookmarkUI {
  id: string;
  title: string;
  url: string;
  tags: string[];
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  accessCount: number;
  customOrder?: number;
  memo?: string;
  hasEncryptedMemo?: boolean;
  lastAccessedAt?: string;
}
```

### 変換関数
- `convertToUI(BookmarkWithTags)` → `BookmarkUI` — API レスポンスを UI 型に変換

## userSettings.ts

```typescript
interface UserSettingsUI {
  listColumns: 1 | 2 | 3 | 4;
  sortOption: SortOption;
  sortOrder: SortOrder;
}
```

変換はフック (`useUserSettings`) 内で手動マッピング。

## tag.ts

```typescript
interface Tag {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}
```

## tagRule.ts

```typescript
interface TagRule {
  id: string;
  matchType: 'starts_with' | 'contains' | 'ends_with';
  pattern: string;
  tagId: string;
  targetField: 'title' | 'url';
  created_at: string;
  updated_at: string;
}
```

注: tagRule は camelCase / snake_case が混在している（変換関数なし）。
