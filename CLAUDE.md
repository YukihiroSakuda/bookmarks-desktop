# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `npm run dev` (http://localhost:3000)
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Start production**: `npm start`
- **Add shadcn component**: `npx shadcn@latest add <component>`
- **Build extension**: `cd extension && npm run build`

No test framework is configured.

## Environment Variables

Requires `.env.local` with:
- `DATABASE_URL` — PostgreSQL connection string
- `MEMO_ENCRYPTION_KEY` — AES-256 key for encrypted memo feature

## Tech Stack

Next.js 15 (App Router) / React 19 / TypeScript / Tailwind CSS 3 / shadcn/ui (New York style, neutral base) / PostgreSQL via pg / dnd-kit (drag-and-drop) / Lucide React

## Architecture

### Custom Hooks + Thin Page Component

State is managed via custom hooks in `src/hooks/` (barrel-exported from `src/hooks/index.ts`):
- `useAuth` — stub (always returns `{ isLoading: false, isVisible: true }`); no real auth
- `useUserSettings` — sort, columns (persisted via `/api/settings`)
- `useBookmarks` — CRUD, fetch, pin toggle, bulk operations, memo encrypt/decrypt
- `useBookmarkFiltering` — search (title + URL), tag filter, sort
- `useBookmarkOrdering` — drag-and-drop reorder
- `useTagManagement` — tags/rules CRUD
- `useKeyboardShortcuts` — Ctrl+N (new bookmark), Escape
- `useSearchHistory` — localStorage-persisted search history (max 10 entries)

`src/app/page.tsx` composes hooks and passes handlers to child components. No external state management library.

### Route Structure

- `/` — Bookmark list with search, filters, sort (list view only)
- `/api/bookmarks` — GET all, POST create, DELETE all
- `/api/bookmarks/[id]` — GET, PATCH, DELETE
- `/api/bookmarks/[id]/access` — POST (increment access count)
- `/api/bookmarks/[id]/pin` — POST (toggle pin)
- `/api/bookmarks/[id]/memo` — GET, PUT, DELETE (encrypted memo)
- `/api/bookmarks/reorder` — POST (drag-drop reorder)
- `/api/bookmarks/title` — GET (fetch page title with hostname fallback)
- `/api/memo/encrypt`, `/api/memo/decrypt` — Server-side AES-256-CBC memo encryption
- `/api/settings` — GET, PUT (user settings)
- `/api/tags` — GET, POST
- `/api/tags/[id]` — PATCH, DELETE
- `/api/tag-rules` — GET, POST
- `/api/tag-rules/[id]` — PATCH, DELETE

### shadcn/ui Components

shadcn/ui components live in `src/components/ui/`. Custom wrapper components (`Button.tsx`, `Input.tsx`) extend shadcn with app-specific props (e.g., `icon` prop on Button). CSS variables in `globals.css` define the color theme for both light and dark modes. shadcn config is in `components.json` (New York style, neutral base, aliases point to `@/components/ui`).

### Type Conversion Pattern (DB ↔ UI)

Database types use snake_case (`is_pinned`, `access_count`), UI types use camelCase (`isPinned`, `accessCount`). Conversion functions exist in two type files:
- `src/types/bookmark.ts`: `convertToUI(BookmarkWithTags)` → `BookmarkUI`, `convertToDB(BookmarkUI)` → `Bookmark`
- `src/types/userSettings.ts`: `convertUserSettingsToUI(UserSettings)` → `UserSettingsUI`, `convertUserSettingsToDB(UserSettingsUI)` → DB format

Note: `src/types/tagRule.ts` uses mixed conventions — `matchType`, `targetField` (camelCase) alongside `created_at` (snake_case) in the same interface.

### Database

`src/lib/db.ts` initializes a PostgreSQL pool using `pg` with a global singleton for Next.js hot-reload compatibility. Schema is defined inline and auto-created on first query using `DATABASE_URL`.

Five tables: `bookmarks` (includes `encrypted_memo`, `memo_iv`, `custom_order`), `tags`, `bookmarks_tags` (junction), `user_settings` (single row, id=1), `tag_rules`.

### Key Library Files

- `src/lib/db.ts` — PostgreSQL pool, schema creation, query helpers
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `src/utils/export.ts` — Bookmark HTML export utility

### Encrypted Memo

Bookmarks can have an encrypted memo (AES-256-CBC). Encryption/decryption happens server-side via `/api/memo/encrypt` and `/api/memo/decrypt`. The key is derived from `MEMO_ENCRYPTION_KEY` env var. Memos are excluded from search and export by design. 10,000 character limit.

### Browser Extension

`extension/` is a Chrome/Edge Manifest V3 extension (separate Vite + React project). Build output goes to `extension/dist/` for unpacked loading. The extension still uses Supabase (`extension/lib/supabase.ts`) and requires its own `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_URL`. Excluded from main app's TypeScript compilation.

### Config Note

Two Next.js config files coexist: `next.config.ts` (empty, TypeScript) and `next.config.js` (empty, JavaScript). The JS file is the one actually used at runtime.

### Path Alias

`@/*` maps to `./src/*` (configured in `tsconfig.json`).

### Dark Mode

Class-based (`darkMode: 'class'` in `tailwind.config.ts`). Theme options: light / system / dark, persisted in localStorage via `ThemeSwitcher` component.

### Fonts

Outfit (primary) and Noto Sans JP (Japanese fallback), loaded via CSS variables.

### Documentation

- `docs/specs/` — Product requirements documents (PRDs)
- `docs/testing/manual-test-checklist.md` — Manual test checklist

## UI Design

UIデザインのコンセプトとルールは `.claude/skills/ui-design-guidelines.md` に定義。新規コンポーネントや画面変更時に参照すること。要点: モノクロベース + 青アクセントのみ、メモは常時表示、フィードバックは青色統一。

## Conventions

- Components: PascalCase filenames
- Functions/variables: camelCase
- Constants: UPPER_SNAKE_CASE
- UI messages: English
- Commit prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
