# Design: Remove `bookmarks_tags` Compatibility Shim

## Background

The `BookmarkWithTags` type and the `bookmarks_tags: [{tags:{name}}]` JSON format were
carried over from the old PostgreSQL/Prisma architecture. The Rust backend deliberately
reproduced this nested shape so TypeScript call sites required no changes during migration.
Now that the migration is complete this shim has no purpose.

## Changes

### `src-tauri/src/commands.rs`
`list_bookmarks` currently builds:
```json
{ "bookmarks_tags": [{ "tags": { "name": "foo" } }] }
```
Change to:
```json
{ "tags": ["foo", "bar"] }
```

### `src/types/bookmark.ts`
- Delete `BookmarkWithTags` interface (only used internally).
- Change `convertToUI` signature from `(bookmark: BookmarkWithTags)` to
  `(bookmark: Bookmark & { tags: string[] })`.
- Simplify tag mapping: `bookmark.bookmarks_tags?.map(bt => bt.tags.name)` → `bookmark.tags`.

### `src/hooks/useTagManagement.ts`
Two call sites that iterate raw API responses:
- `bm.bookmarks_tags.map((bt: …) => bt.tags.name)` → `bm.tags as string[]`
- `.map(…).filter(…)` → `(bm.tags as string[]).filter(…)`

### `docs/types/README.md`
Update `convertToUI` description to reflect new signature.
