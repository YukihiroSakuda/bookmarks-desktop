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

**Do not run `npm run build` while `npm run tauri:dev` is running.** Both write to
`.next`, so a build overwrites the chunks the live dev server is serving and the
app window dies with `Cannot find module './<n>.js'`. Touching a source file does
not recover it — the dev server has to be stopped, `.next` deleted, and
`tauri:dev` restarted. Use `npx tsc --noEmit` and `npm run lint` to check a change
while the app is up, and save `npm run build` for when it is not.

The app cannot be opened in a plain browser, even though `next dev` serves it on
1420: `useExplorerImport` calls `getCurrentWebviewWindow()` at mount, which throws
outside the Tauri webview and takes the whole page down. Driving the real window
programmatically needs `tauri-driver` + `msedgedriver`, which is not set up here.

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
- `useBookmarkFiltering` — search (title + URL + memo), tag filter, sort (comparator from `src/lib/bookmarkScore.ts`)
- `useBookmarkOrdering` — drag-and-drop reorder
- `useTagManagement` — tags/rules CRUD
- `useKeyboardShortcuts` — Escape (close/deselect). Focus-the-search-box-and-start-typing is handled separately, inline in `page.tsx`, on the first plain keystroke
- `useSearchHistory` — localStorage-persisted search history (max 10 entries)
- `useExplorerImport` — Windows Explorer drag-drop, right-click context menu (`--path` CLI arg), single-instance `open-path-bookmark` event
- `useBookmarkTabNavigation` — Tab/Shift+Tab cycles focus through bookmark cards only, skipping other focusable elements
- `useBookmarkArrowNavigation` — arrow keys move focus between cards: Left/Right by Tab order, Up/Down to the closest card in the row above/below whose column best lines up

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
- `src/shortcutdir.rs` — mirrors `kind = 'path'` bookmarks into a flat Windows folder of `.lnk` shortcuts (off by default), so they can be picked from other apps' file dialogs. Deletes **only** files recorded in its own manifest (`.bookmarks-shortcuts.json`), never anything else in the directory. Also pins/unpins that folder to Quick Access via the `pintohome`/`unpinfromhome` shell verbs — note the shell's collections index on **VT_I4**, so a `VARIANT` built from `i64` silently matches nothing

**SQLite schema** (5 tables): `bookmarks` (includes `kind`, `memo`), `tags`, `bookmarks_tags`, `user_settings`, `tag_rules`. Schema defined in `src-tauri/src/db.rs`.

**Windows features**: On startup, **release + unpackaged builds only** automatically register a Windows right-click context menu entry and register the app (idempotently) in the per-user `Run` registry key so it launches on login via `<exe> --hidden`. Two cases are excluded (see `src-tauri/src/winpkg.rs`):
- **Dev builds** (`debug_assertions`): otherwise a `tauri dev` run would repoint those registry entries at `target/debug/app.exe`, which then launches at login and fails with `ERR_CONNECTION_REFUSED` because it loads `devUrl` (localhost:1420) with no dev server running.
- **MSIX (Store) builds** (`winpkg::is_packaged()`): inside the MSIX container HKCU writes are virtualized into the package's private hive (`%LOCALAPPDATA%\Packages\<PFN>\SystemAppData\Helium\User.dat`) and never reach Windows, so both features are declared in `src-tauri/msix/AppxManifest.xml` instead — see "MSIX / Store build" below.

The app accepts a `--path <filepath>` CLI arg to pre-fill the bookmark form from Explorer. Single-instance plugin ensures a second launch focuses the existing window and forwards the path. Closing the main window hides it to a system tray icon instead of quitting (`CloseRequested` is intercepted); the tray's "Open Bookmarks"/left-click restores the window and "Quit" is the only way to actually exit. A `--hidden` launch (from autostart) starts with the window hidden in the tray.

### MSIX / Store build

The Microsoft Store version ships as an MSIX package built by `scripts/build-msix.ps1` from `src-tauri/msix/AppxManifest.xml`. Because the MSIX container virtualizes registry writes, the two Windows integrations are declared in the manifest rather than self-registered:

| Feature | Unpackaged (NSIS/MSI) | MSIX (Store) |
|---------|----------------------|--------------|
| Launch at login | `Run` registry key → `<exe> --hidden` | `uap5:StartupTask` extension; the app detects `ActivationKind::StartupTask` (`winpkg::launched_by_startup_task()`) to start hidden |
| Explorer right-click | `HKCU\Software\Classes\*\shell\AddToBookmarks` verb | `com:Extension` (surrogate COM server) + `desktop4:FileExplorerContextMenus` verbs for `*` and `Directory`, implemented by `src-tauri/context-menu` |
| Launch path | the installed `app.exe` | `uap3:AppExecutionAlias` → `bookmarks-tags.exe` (version-independent, keeps package identity) |

`src-tauri/context-menu/` is a standalone `cdylib` crate (own `[workspace]`, own `target/`) implementing `IExplorerCommand`. Its CLSID is duplicated in `src/lib.rs` and `AppxManifest.xml` — **keep the two in sync**. `Invoke` launches `bookmarks-tags.exe --path <selected item>`, so the existing single-instance path forwarding handles the rest. Store data (`bookmarks.db`) is *not* redirected: packaged and unpackaged builds share `%APPDATA%\com.yukihirosakuda.bookmarks\`.

Release procedure: `docs/msix-release.md`.

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
- `src/lib/uiLanguage.ts` — the en/ja choice for the Help and Settings dialogs (localStorage `ui_lang`, like the theme; `en` by default). Owned by `BookmarkHeader`, which renders both dialogs and passes it down. Both dialogs carry the same `LanguageToggle` (EN/JA) in their header — one control on one stored value, so a reader who opened either in the wrong language fixes it where they are. The rest of the app stays English per the conventions below
- `src/lib/settingsText.ts` — every string the Settings dialog shows, in both languages. Sentences needing mid-sentence emphasis are split into before/strong/after keys, since the emphasis does not fall in the same place in both languages
- `src/lib/bookmarkScore.ts` — the single sort comparator, shared by `useBookmarkFiltering` and `useBookmarkOrdering` so a sort key cannot be added to one and forgotten in the other. Also holds `recencyScore`: `(access_count + 1) × 0.5^(days since last access / 30)`, computed at read time from columns that already exist — no schema, no stored score. Elapsed time scales every score by the same factor, so the order never drifts on its own and needs no timer
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
- UI messages: English, **except** the Help and Settings dialogs, which follow `src/lib/uiLanguage.ts` (en default). Anything user-visible added to Settings needs an entry in both halves of `src/lib/settingsText.ts` — the table is `satisfies Record<UiLang, unknown>`, so a missing one is a type error
- Commit prefixes: `feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `test:`, `chore:`
