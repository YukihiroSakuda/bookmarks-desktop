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
- **Rebuild the extension zip bundled into the app** (`public/extension.zip`, offered from the Help dialog): `npm run build:extension`. `tauri:build` runs it first (`beforeBuildCommand`), so a release can no longer ship a stale copy
- **Unit tests (frontend)**: `npm test` — Vitest, `src/**/*.test.ts`, pure logic only (nothing that needs the Tauri webview)
- **Unit tests (Rust)**: `cd src-tauri && cargo test --lib`

CI (`.github/workflows/ci.yml`, every push to `main` and every PR) runs tsc, lint, both test suites and the extension build on `windows-latest` — the Rust crate's dependencies are Windows-only.

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

### backend.ts — Calls into Rust

`src/lib/backend.ts` has one typed function per Tauri command (`listBookmarks`, `createTag`, `updateSettings`, …), with the argument names and the shape of each answer written down there. Every function rejects with an `Error` carrying the backend's own message, so callers show the user what actually went wrong. Add a function there for a new command rather than calling `invoke` with a string from a hook.

(It replaced `tauriFetch`, a fake `fetch('/api/...')` router kept from when the app also ran as a web app. It was untyped, and it turned every backend error into `ok: false`, which callers then replaced with a generic message.)

### Custom Hooks + Thin Page Component

State is managed via custom hooks in `src/hooks/` (barrel-exported from `src/hooks/index.ts`):
- `useUserSettings` — sort, columns (persisted via Tauri `get_settings`/`update_settings`)
- `useBookmarks` — CRUD, fetch, pin toggle, bulk operations, memo
- `useBookmarkFiltering` — search (title + URL + memo), tag filter with the Any/All choice, sort (comparator from `src/lib/bookmarkScore.ts`)
- `useBookmarkOrdering` — drag-and-drop reorder. Drags arrive as positions among the *shown* cards, so it decides what is shown with the same `createBookmarkFilter` (`src/lib/bookmarkFilter.ts`) as the list — never a copy of the test
- `useTagManagement` — tags/rules CRUD
- `useKeyboardShortcuts` — Escape (close/deselect). Focus-the-search-box-and-start-typing is handled separately, inline in `page.tsx`, on the first plain keystroke
- `useSearchHistory` — localStorage-persisted search history (max 10 entries)
- `useExplorerImport` — Windows Explorer drag-drop, right-click context menu (`--path` CLI arg), single-instance `open-path-bookmark` event
- `useBookmarkTabNavigation` — Tab/Shift+Tab cycles focus through bookmark cards only, skipping other focusable elements
- `useBookmarkArrowNavigation` — arrow keys move focus between cards: Left/Right by Tab order, Up/Down to the closest card in the row above/below whose column best lines up

`src/app/page.tsx` composes hooks and passes handlers to child components. No external state management library.

### Shared Code (`src/shared/`)

`src/shared/bookmarks/`:
- `form.ts` — imported by both the main app and the browser extension: URL/path detection (`detectKind`), auto-tagging logic (`getAutoTagNames`), duplicate detection, bookmark form utilities
- `api.ts` — **app only** (it calls `backend.ts`): create/update that apply the tag rules on the way in. The add form, edit form and HTML import all save through it, so a rule tags a bookmark the same way whichever saved it

### Tauri Backend (`src-tauri/`)

Written in Rust. Key files:
- `src/lib.rs` — app entry point, plugin registration, SQLite init, single-instance handling, spawns local HTTP server
- `src/db.rs` — SQLite schema (auto-created on first run), `AppState` struct
- `src/commands.rs` — Tauri `invoke()` handlers for all CRUD operations. A plain `#[tauri::command] fn` runs on the **main thread**; anything slow (big result, disk or network work) is `#[tauri::command(async)]` or `async fn`. `update_bookmark` rewrites every column, so never use it to change one field — add a command that touches only that (as `set_tag_on_bookmarks` does for tag rules; resending a partial bookmark once wiped everyone's keyboard shortcuts)
- `src/repo.rs` — the SQL shared by `commands.rs` and `server.rs` (list/insert bookmarks, tags, tag rules, tag linking). Put queries here, not in either caller: the two used to carry drifting copies
- `src/backup.rs` — automatic JSON snapshots in `%APPDATA%\<identifier>\backups\`: daily (7 kept), and before Restore / Delete all (5 each, and the operation is refused if the snapshot cannot be written). Same format as Settings → Backup, so the normal Restore reads them. Prunes only files matching its own `auto-<reason>-YYYYMMDD-HHMMSS.json` names
- `src/server.rs` — axum HTTP server on `127.0.0.1:37373` for the browser extension
- `src/mcp.rs` — stdio MCP server for AI assistants, started as `app.exe --mcp` (`main.rs` branches on it before Tauri starts, so no window/tray and no single-instance forwarding). Its own process, Tauri-free: opens `bookmarks.db` **read-only**, a fresh connection per tool call, resolving the path with `dirs::data_dir()` + `APP_IDENTIFIER` (a test keeps that constant equal to `tauri.conf.json`'s `identifier`). `--db <path>` overrides it. Tools: `get_overview`, `search_bookmarks`, `get_bookmark`, `search_files` (reuses `folder_search::search_targets`), and `suggest_bookmark`, the only non-read tool: it POSTs a *proposal* to the running app's local API (`server::LOCAL_API_ADDR`, `/api/suggestions`, `X-Bookmarks-Token` read from the DB) and writes nothing itself. The app queues it in memory (`src/suggestions.rs`: http(s) URLs with no embedded credentials, or an existing absolute local-drive path — no UNC/device paths, no `..`, and files of a code-running extension are refused because a path bookmark is opened with its default program; text cleaned and bounded, 20 max, deduped, unknown tags dropped), the header's **Suggestions** menu lists it, and only the ordinary add form's Save creates a bookmark — keep it that way, never add a path from `suggest_bookmark` to the DB. Its recency score is a port of `recencyScore` in `src/lib/bookmarkScore.ts` — **keep the two in step**. Settings → AI assistants gets the launch command from `mcp_launch_command` (the `bookmarks-tags.exe` alias in the Store build). The app's own connection has a 5 s `busy_timeout` so its writes wait out an MCP read instead of failing
- `src/shortcutdir.rs` — mirrors `kind = 'path'` bookmarks into a flat Windows folder of `.lnk` shortcuts (off by default), so they can be picked from other apps' file dialogs. Deletes **only** files recorded in its own manifest (`.bookmarks-shortcuts.json`), never anything else in the directory. Also pins/unpins that folder to Quick Access via the `pintohome`/`unpinfromhome` shell verbs — note the shell's collections index on **VT_I4**, so a `VARIANT` built from `i64` silently matches nothing

**SQLite schema** (5 tables): `bookmarks` (includes `kind`, `memo`), `tags`, `bookmarks_tags`, `user_settings`, `tag_rules`. Schema defined in `src-tauri/src/db.rs`.

**Windows features**: On startup, **release + unpackaged builds only** automatically register a Windows right-click context menu entry and register the app (idempotently) in the per-user `Run` registry key so it launches on login via `<exe> --hidden`. Two cases are excluded (see `src-tauri/src/winpkg.rs`):
- **Dev builds** (`debug_assertions`): otherwise a `tauri dev` run would repoint those registry entries at `target/debug/app.exe`, which then launches at login and fails with `ERR_CONNECTION_REFUSED` because it loads `devUrl` (localhost:1420) with no dev server running.
- **MSIX (Store) builds** (`winpkg::is_packaged()`): inside the MSIX container HKCU writes are virtualized into the package's private hive (`%LOCALAPPDATA%\Packages\<PFN>\SystemAppData\Helium\User.dat`) and never reach Windows, so both features are declared in `src-tauri/msix/AppxManifest.xml` instead — see "MSIX / Store build" below.

The app accepts `--mcp` as its first argument to run as the MCP server instead of the app (see `src/mcp.rs` above), and a `--path <filepath>` CLI arg to pre-fill the bookmark form from Explorer. Single-instance plugin ensures a second launch focuses the existing window and forwards the path. Closing the main window hides it to a system tray icon instead of quitting (`CloseRequested` is intercepted); the tray's "Open Bookmarks"/left-click restores the window and "Quit" is the only way to actually exit. A `--hidden` launch (from autostart) starts with the window hidden in the tray.

### MSIX / Store build

The Microsoft Store version ships as an MSIX package built by `scripts/build-msix.ps1` from `src-tauri/msix/AppxManifest.xml`. Because the MSIX container virtualizes registry writes, the two Windows integrations are declared in the manifest rather than self-registered:

| Feature | Unpackaged (NSIS/MSI) | MSIX (Store) |
|---------|----------------------|--------------|
| Launch at login | `Run` registry key → `<exe> --hidden` | `uap5:StartupTask` extension; the app detects `ActivationKind::StartupTask` (`winpkg::launched_by_startup_task()`) to start hidden |
| Explorer right-click | `HKCU\Software\Classes\*\shell\AddToBookmarks` verb | `com:Extension` (surrogate COM server) + `desktop4:FileExplorerContextMenus` verbs for `*` and `Directory`, implemented by `src-tauri/context-menu` |
| Launch path | the installed `app.exe` | `uap3:AppExecutionAlias` → `bookmarks-tags.exe` (version-independent, keeps package identity) |

`src-tauri/context-menu/` is a standalone `cdylib` crate (own `[workspace]`, own `target/`) implementing `IExplorerCommand`. Its CLSID is duplicated in `src/lib.rs` and `AppxManifest.xml` — **keep the two in sync**. `Invoke` launches `bookmarks-tags.exe --path <selected item>`, so the existing single-instance path forwarding handles the rest. Store data (`bookmarks.db`) is *not* redirected: packaged and unpackaged builds share `%APPDATA%\com.yukihirosakuda.bookmarks\`.

Release procedure: `docs/msix-release.md`.

### Content Security Policy

Set in `tauri.conf.json` (`app.security.csp`). Tauri attaches it only to files it serves from the embedded `out/` — **`tauri dev` on desktop loads the dev server directly and gets no CSP at all**, so a policy that looks fine in dev proves nothing. Check a change against a build with the `tauri/custom-protocol` feature.

- `script-src 'self'` — Next's inline bootstrap scripts and the theme script in `layout.tsx` pass because Tauri hashes every inline `<script>` of the exported HTML at build time. Never `'unsafe-inline'` / `'unsafe-eval'`
- `style-src 'self' 'unsafe-inline'` with `dangerousDisableAssetCspModification: ["style-src"]` — React/Radix set `style` attributes. If Tauri were allowed to add hashes or nonces to `style-src`, browsers would drop `'unsafe-inline'` and those attributes would be blocked
- `img-src 'self' data:` — favicons are stored as data URIs; remote images stay off (no third-party requests)
- `connect-src … ipc: http://ipc.localhost` — Tauri's IPC. A frontend `fetch` to anywhere else needs adding here

### Local HTTP Server (port 37373)

Tauri spawns an axum server at `127.0.0.1:37373` alongside the app. This is a subset API for the browser extension (read/write bookmarks, tags, tag-rules, title fetch). It is not the same as the Tauri `invoke()` interface used by the frontend.

Three checks, each against a different caller: CORS answers only the extension's origins (`EXTENSION_ORIGINS`); every route except `/api/pair` needs the `X-Bookmarks-Token` from the DB; and every route, `/api/pair` included, requires `Host` to be `localhost:37373` or `127.0.0.1:37373` — a page that rebinds its own domain to 127.0.0.1 looks same-origin to the browser, but still sends its own name as `Host`. `GET /api/bookmarks` returns tags nested as `bookmarks_tags: [{ tags: { name } }]`, the shape store-installed extensions read; keep it.

### Browser Extension (`extension/`)

Chrome/Edge Manifest V3 extension (separate Vite + React project). Build output goes to `extension/dist/` for unpacked loading.

- Connects to the Tauri local HTTP server at `VITE_APP_URL` (default: `http://localhost:37373`)
- Imports shared logic from `../../src/shared/bookmarks/form` (path is relative, across project boundary) — so a change to `form.ts` changes the extension too; the CI extension build type-checks it
- Extension `.env` requires only: `VITE_APP_URL` (optional, defaults to localhost:37373)

### Library Files

- `src/lib/backend.ts` — typed calls to the Tauri commands (see above)
- `src/lib/searchQuery.ts` — how the search box is read: whitespace-separated terms that must **all** match (in any field, any order), `"..."` for a phrase, each term expanded by `buildQueryForms`. Used by the bookmark filter and the folder search alike; `split_search_terms` in `src-tauri/src/folder_search.rs` is its Rust port for callers that send only the raw query (MCP `search_files`) — keep them in step
- `src/lib/bookmarkFilter.ts` — `createBookmarkFilter`, the single "is this card shown" test (search terms + selected tags), shared by the list and drag-to-reorder
- `src/lib/tagMatchMode.ts` — the tag filter's Any/All choice (localStorage `tag_match_mode`, like the theme)
- `src/lib/bookmarkImport.ts` — browser-HTML import: reads the links, then plans what to create (skips URLs already saved or repeated in the file, keeps `ADD_DATE`, drops `javascript:`/`place:` links). The plan is pure and unit-tested; creating goes through `shared/bookmarks/api.ts`, so tag rules apply
- `src/lib/appCache.ts` — localStorage cache for all app data (`bm_app_cache` key), used for instant startup render
- `src/lib/uiLanguage.ts` — the en/ja choice for the Help and Settings dialogs (localStorage `ui_lang`, like the theme; `en` by default). Owned by `BookmarkHeader`, which renders both dialogs and passes it down. Both dialogs carry the same `LanguageToggle` (EN/JA) in their header — one control on one stored value, so a reader who opened either in the wrong language fixes it where they are. The rest of the app stays English per the conventions below
- `src/lib/settingsText.ts` — every string the Settings dialog shows, in both languages. Sentences needing mid-sentence emphasis are split into before/strong/after keys, since the emphasis does not fall in the same place in both languages
- `src/lib/bookmarkScore.ts` — the single sort comparator, shared by `useBookmarkFiltering` and `useBookmarkOrdering` so a sort key cannot be added to one and forgotten in the other. Also holds `recencyScore` (ported to Rust in `src-tauri/src/mcp.rs` — change both): `(access_count + 1) × 0.5^(days since last access / 30)`, computed at read time from columns that already exist — no schema, no stored score. Elapsed time scales every score by the same factor, so the order never drifts on its own and needs no timer
- `src/lib/utils.ts` — `cn()` helper (clsx + tailwind-merge)
- `src/utils/export.ts` — Bookmark HTML export utility

### shadcn/ui Components

shadcn/ui components live in `src/components/ui/`. Custom wrapper components (`Button.tsx`, `Input.tsx`) extend shadcn with app-specific props (e.g., `icon` prop on Button). CSS variables in `globals.css` define the color theme for both light and dark modes. shadcn config is in `components.json` (New York style, neutral base, aliases point to `@/components/ui`).

### Type Conversion Pattern (DB ↔ UI)

Database types use snake_case (`is_pinned`, `access_count`), UI types use camelCase (`isPinned`, `accessCount`). Converters:
- `src/types/bookmark.ts`: `convertToUI(Bookmark & { tags })` → `BookmarkUI`
- `src/types/tagRule.ts`: `convertTagRuleToUI(TagRuleDB)` → `TagRule`
- Settings are converted inline in `useUserSettings` (`SettingsRecord` in `backend.ts` ↔ `UserSettingsUI`)

### Config Note

`next.config.js` sets `output: "export"` (static files in `out/`, which Tauri embeds — `cargo` will not compile the crate until `out/` exists) and unoptimized images.

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
