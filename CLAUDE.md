# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server (web only)**: `npm run dev` (http://localhost:3000)
- **Tauri dev** (desktop app): `npm run tauri:dev` (Next.js runs on port 1420)
- **Tauri build** (produces NSIS/MSI installer): `npm run tauri:build`
- **Build**: `npm run build`
- **Lint**: `npm run lint`
- **Add shadcn component**: `npx shadcn@latest add <component>`
- **Build extension**: `cd extension && npm run build`

No test framework is configured.

## Tech Stack

Next.js 15 (App Router, **frontend only — no API routes**) / React 19 / TypeScript / Tailwind CSS 3 / shadcn/ui (New York style, neutral base) / Tauri 2 (Rust backend, SQLite via rusqlite) / dnd-kit / Lucide React

## Architecture

### Two Runtimes

The app runs in two modes that share the same Next.js frontend:

| Mode | Backend | Database | Port |
|------|---------|----------|------|
| Web (dev only) | None — no API routes exist | — | 3000 |
| Tauri (desktop) | Rust (`src-tauri/`) | SQLite (rusqlite) | 1420 |

In practice the app is deployed as a **Tauri desktop app** only. There are no Next.js API routes — the `src/app/` directory contains only the page and layout files.

### tauriFetch — API Call Routing

`src/lib/tauriFetch.ts` is the critical bridge. All custom hooks call `fetch('/api/...')` as if talking to a Next.js backend, but these calls are intercepted by `tauriFetch` and routed to Rust via Tauri's `invoke()` mechanism instead of HTTP. This lets hooks work unchanged between dev (web) and production (Tauri).

### Custom Hooks + Thin Page Component

State is managed via custom hooks in `src/hooks/` (barrel-exported from `src/hooks/index.ts`):
- `useUserSettings` — sort, columns (persisted via Tauri `get_settings`/`update_settings`)
- `useBookmarks` — CRUD, fetch, pin toggle, bulk operations, memo
- `useBookmarkFiltering` — search (title + URL + memo), tag filter, sort
- `useBookmarkOrdering` — drag-and-drop reorder
- `useTagManagement` — tags/rules CRUD
- `useKeyboardShortcuts` — `/` (focus search), Escape (close/deselect)
- `useSearchHistory` — localStorage-persisted search history (max 10 entries)
- `useExplorerImport` — Windows Explorer drag-drop, right-click context menu (`--path` CLI arg), single-instance `open-path-bookmark` event

`src/app/page.tsx` composes hooks and passes handlers to child components. No external state management library.

### Shared Code (`src/shared/`)

`src/shared/bookmarks/` is imported by both the main app and the browser extension:
- `form.ts` — URL/path detection (`detectKind`), auto-tagging logic (`getAutoTagNames`), bookmark form utilities
- `api.ts` — API client functions (`fetchBookmarks`, `createBookmark`, `updateBookmark`, etc.) that work against any base URL

### Tauri Backend (`src-tauri/`)

Written in Rust. Key files:
- `src/lib.rs` — app entry point, plugin registration, SQLite init, single-instance handling, spawns local HTTP server
- `src/db.rs` — SQLite schema (auto-created on first run), `AppState` struct
- `src/commands.rs` — Tauri `invoke()` handlers for all CRUD operations
- `src/server.rs` — axum HTTP server on `127.0.0.1:37373` for the browser extension

**SQLite schema** (5 tables): `bookmarks` (includes `kind`, `memo`), `tags`, `bookmarks_tags`, `user_settings`, `tag_rules`. Schema defined in `src-tauri/src/db.rs`.

**Windows features**: On startup, automatically registers a Windows right-click context menu entry. Accepts `--path <filepath>` CLI arg to pre-fill the bookmark form from Explorer. Single-instance plugin ensures a second launch focuses the existing window and forwards the path.

### Local HTTP Server (port 37373)

Tauri spawns an axum server at `127.0.0.1:37373` alongside the app. This is a subset API for the browser extension (read/write bookmarks, tags, tag-rules, title fetch). It is not the same as the Tauri `invoke()` interface used by the frontend.

### Browser Extension (`extension/`)

Chrome/Edge Manifest V3 extension (separate Vite + React project). Build output goes to `extension/dist/` for unpacked loading.

- Connects to the Tauri local HTTP server at `VITE_APP_URL` (default: `http://localhost:37373`)
- Imports shared logic from `../../src/shared/bookmarks/form` (path is relative, across project boundary)
- Extension `.env` requires only: `VITE_APP_URL` (optional, defaults to localhost:37373)

### Library Files

- `src/lib/tauriFetch.ts` — Fetch-compatible adapter routing `/api/*` calls to Tauri `invoke()` commands
- `src/lib/appCache.ts` — localStorage cache for all app data (`bm_app_cache` key), used for instant startup render
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `src/utils/export.ts` — Bookmark HTML export utility

### shadcn/ui Components

shadcn/ui components live in `src/components/ui/`. Custom wrapper components (`Button.tsx`, `Input.tsx`) extend shadcn with app-specific props (e.g., `icon` prop on Button). CSS variables in `globals.css` define the color theme for both light and dark modes. shadcn config is in `components.json` (New York style, neutral base, aliases point to `@/components/ui`).

### Type Conversion Pattern (DB ↔ UI)

Database types use snake_case (`is_pinned`, `access_count`), UI types use camelCase (`isPinned`, `accessCount`). Conversion functions exist in two type files:
- `src/types/bookmark.ts`: `convertToUI(BookmarkWithTags)` → `BookmarkUI`, `convertToDB(BookmarkUI)` → `Bookmark`
- `src/types/userSettings.ts`: `convertUserSettingsToUI(UserSettings)` → `UserSettingsUI`, `convertUserSettingsToDB(UserSettingsUI)` → DB format

Note: `src/types/tagRule.ts` uses mixed conventions — `matchType`, `targetField` (camelCase) alongside `created_at` (snake_case) in the same interface.

### Config Note

Two Next.js config files coexist: `next.config.ts` (empty, TypeScript) and `next.config.js` (empty, JavaScript). The JS file is the one actually used at runtime.

### Path Alias

`@/*` maps to `./src/*` (configured in `tsconfig.json`).

### Dark Mode

Class-based (`darkMode: 'class'` in `tailwind.config.ts`). Theme options: light / system / dark, persisted in localStorage via the `SettingsDialog` component (gear icon in the header).

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
