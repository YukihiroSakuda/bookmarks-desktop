# UX改善 & コード品質向上 設計ドキュメント

## 概要

ブックマークアプリの UX 改善（A-1〜A-4）とコード品質・パフォーマンス改善（B-5〜B-8）を一括対応する。

---

## A. UX 改善

### A-1: 削除確認を AlertDialog に置き換え

**対象:** `src/components/BookmarkCard.tsx`（個別削除）、`src/app/page.tsx`（全削除）

- `npx shadcn@latest add alert-dialog` で `AlertDialog` を追加
- `BookmarkCard` に `deleteConfirmOpen: boolean` state を追加。削除ボタン押下で AlertDialog を開く
- `page.tsx` に `isDeleteAllOpen: boolean` state を追加。全削除も同様に AlertDialog で確認
- `window.confirm()` の呼び出しをすべて削除

### A-2: Toast 通知（Sonner）

**対象:** `src/app/layout.tsx`、`src/hooks/useBookmarks.ts`、`src/hooks/useTagManagement.ts`

- `npx shadcn@latest add sonner` でインストール
- `layout.tsx` に `<Toaster position="bottom-right" />` を追加
- 通知対象の操作:

| 操作 | Toast |
|------|-------|
| ブックマーク保存（新規/更新） | `toast.success("Bookmark saved")` |
| ブックマーク削除 | `toast.success("Bookmark deleted")` |
| 全削除 | `toast.success("All bookmarks deleted")` |
| タグ追加 | `toast.success("Tag saved")` |
| タグ削除 | `toast.success("Tag removed")` |
| API エラー | `toast.error(errorMessage)` |

- ピン切り替えは楽観的更新（B-7）で即時フィードバックがあるため Toast 不要

### A-3: `/` キーで検索フォーカス

**対象:** `src/hooks/useKeyboardShortcuts.ts`、`src/components/BookmarkHeader.tsx`、`src/app/page.tsx`

- `useKeyboardShortcuts` に `onFocusSearch?: () => void` コールバックを追加
- `/` キー押下時に呼び出す（`input`/`textarea` にフォーカス中は無効）
- `BookmarkHeader` の検索 input に `ref` を付与し、`page.tsx` から `useCallback` で接続

### A-4: `text-energy-green` を修正

**対象:** `src/components/BookmarkCard.tsx`（L203, L226付近）

- グリッドビューのタイトル `h3` から `text-energy-green` クラスを削除
- 前デザインの残骸。削除後は `text-foreground` が自動適用されリストビューと統一される

---

## B. コード品質・パフォーマンス

### B-5: `FaviconDisplay` をコンポーネント外に移動

**対象:** `src/components/BookmarkCard.tsx`

- `FaviconDisplay` を `BookmarkCard` 関数の外（ファイルトップレベル）に定義
- 現状は `BookmarkCard` レンダリングのたびに新しいコンポーネント型が生成されており `memo` が無効
- 移動後は `{ url: string }` を受け取る安定した `memo` コンポーネントとして機能する

### B-6: SQLタグ取得を Map で最適化

**対象:** `src/app/api/bookmarks/route.ts`

- 現状: `tagRows.filter(r => r.bookmark_id === bm.id)` を全ブックマーク × 全タグ行で実行 → O(n×m)
- 変更: タグ行を `Map<bookmarkId, string[]>` に事前変換し O(1) でルックアップ → O(n+m)
- SQL クエリ数は変えない（2クエリ維持）

```ts
const tagMap = new Map<string, string[]>()
for (const r of tagRows) {
  const arr = tagMap.get(r.bookmark_id) ?? []
  arr.push(r.name)
  tagMap.set(r.bookmark_id, arr)
}
```

### B-7: ピン切り替えの楽観的更新

**対象:** `src/hooks/useBookmarks.ts`

- 現状: PATCH → 全ブックマーク再フェッチ → 描画（ちらつき・ネットワーク往復2回）
- 変更後のフロー:
  1. `setBookmarks` で即座にローカル state の `isPinned` を反転（楽観的更新）
  2. バックグラウンドで `PATCH /api/bookmarks/[id]/pin` を実行
  3. 成功時: 何もしない（state は既に正しい）
  4. 失敗時: 元の state に巻き戻し + `toast.error()` 表示
- `fetchBookmarks()` の再呼び出しを削除

### B-8: `tagRule.ts` の型を統一

**対象:** `src/types/tagRule.ts`、`src/hooks/useTagManagement.ts`、`src/app/api/tag-rules/route.ts`

- 現状の `TagRule` interface: `matchType`/`targetField`（camelCase）と `user_id`/`created_at`（snake_case）が混在
- 変更内容:
  - `TagRule`（UI用）: 全フィールドを camelCase に統一（`userId`, `createdAt`）
  - `TagRuleDB` 型を新規定義（DB・API レスポンス用 snake_case）
  - `convertTagRuleToUI(db: TagRuleDB): TagRule` を追加
  - `convertTagRuleToDB(ui: TagRuleFormData): Partial<TagRuleDB>` を追加
  - `useTagManagement` と API ルートでこれらを使うよう更新

---

## 影響範囲まとめ

| ファイル | 変更内容 |
|----------|---------|
| `src/components/BookmarkCard.tsx` | AlertDialog、FaviconDisplay 移動、text-energy-green 修正 |
| `src/components/BookmarkHeader.tsx` | searchInput ref 追加 |
| `src/app/page.tsx` | isDeleteAllOpen state、onFocusSearch 接続 |
| `src/app/layout.tsx` | Toaster 追加 |
| `src/hooks/useBookmarks.ts` | Toast、楽観的更新 |
| `src/hooks/useTagManagement.ts` | Toast |
| `src/hooks/useKeyboardShortcuts.ts` | onFocusSearch コールバック追加 |
| `src/app/api/bookmarks/route.ts` | Map 最適化 |
| `src/types/tagRule.ts` | 型定義統一、変換関数追加 |
| `src/app/api/tag-rules/route.ts` | 変換関数を使うよう更新 |
