# Bookmarks

A bookmark manager built as a Tauri v2 desktop app + browser extension (Windows).
Data is stored in SQLite, so it works fully offline with no external server required.

## Download

Prebuilt installers are available from [Releases](https://github.com/YukihiroSakuda/bookmarks-desktop/releases) (`.exe` / `.msi`).

> The installer isn't code-signed yet, so Windows SmartScreen may show a warning during installation. Click "More info" → "Run anyway" to continue.

## Features

### Bookmark management

- Add, edit, and delete bookmarks
- Automatic title fetching when entering a URL
- Pin bookmarks (shown fixed at the top; pinning/unpinning auto-scrolls to the card's new position)
- Automatic access-count tracking
- Custom reordering via drag and drop
- List view (1–4 columns)
- Bulk delete all bookmarks and tags (with a `delete all` confirmation prompt)

### Desktop path bookmarks

- Bookmark local files and folders by path
- Files open with the default app; folders open in Explorer
- Add files/folders by dragging them from Windows Explorer
- Add directly from Explorer's right-click menu ("Add to Bookmarks")

### Memo

- Attach a memo to any bookmark (up to 10,000 characters)
- Hover the "Memo" badge on a card to preview it, click to copy to clipboard

### Shortcuts

- **Summon shortcut (global)** — the single global hotkey registered system-wide. Pressing it from any app brings the window to the front and focuses the search bar. Defaults to `Ctrl+Alt+Space`, changeable in Settings
- **Per-bookmark shortcuts (in-app)** — a key combo assigned to a bookmark opens its page/folder while the app is focused. Not registered globally, so it never steals shortcuts from other apps (e.g. copy/paste)
- Requires at least one modifier (Ctrl / Alt / Shift). The main key can be a letter, digit, or F1–F12. Assigned combos are always shown as a badge on the card
- Per-bookmark shortcuts can't be duplicated (blocked with a warning in the form). If the summon shortcut conflicts with another app/OS shortcut, registration fails with a warning

### Tag management

- Add, edit, and delete tags
- Filter by tag (single or multiple selection)
- Tag rules: automatic tagging based on URL/title patterns

### Search

- Real-time search across title, URL, and memo
- Search history (up to 10 entries, stored in localStorage)
- Just start typing to focus the search bar and begin typing (no need to press `/`; disabled while an input is focused or when modifier-key combos are used), `Esc` closes the modal

### Import / export

- Export to an HTML file
- Import an HTML file exported from a browser (with duplicate detection)

### Browser extension

- Works with Chrome / Edge (Manifest V3)
- Talks to the app's built-in HTTP server (localhost:37373) — no external service required
- Bookmark the current page in one click
- Automatic duplicate URL detection
- Bookmarks added from the extension appear in the app in real time

### UI / UX

- Modern design based on shadcn/ui (monochrome + a single blue accent)
- Dark mode support (Light / System / Dark)
- Responsive layout
- Automatic favicon fetching and display

## Tech stack

| Category      | Technology                                             |
| ------------- | ------------------------------------------------------- |
| Desktop       | Tauri v2                                               |
| Backend       | Rust / rusqlite (SQLite bundled) / Axum                |
| Framework     | Next.js 15 (App Router)                                |
| Language      | TypeScript / Rust                                      |
| UI            | React 19 / Tailwind CSS 3 / shadcn/ui (New York style) |
| Drag and drop | dnd-kit                                                |
| Icons         | Lucide React                                           |
| Extension     | Vite + React (Manifest V3)                             |

## Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (rustup)
- [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) (Windows: Microsoft Visual Studio C++ Build Tools)

### 1. Clone the repository

```bash
git clone https://github.com/YukihiroSakuda/bookmarks-desktop.git
cd bookmarks-desktop
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the dev server

```bash
npm run tauri:dev
```

The Tauri window launches. The SQLite database is created automatically in the app data folder on first run.

### 4. Production build

```bash
npm run tauri:build
```

The installer is generated under `src-tauri/target/release/bundle/`.

### 5. Browser extension

Download `extension.zip` from the app's Help dialog, unzip it, and load it as an unpacked extension.

- Chrome: `chrome://extensions` → "Load unpacked" → select the unzipped folder
- Edge: `edge://extensions` → "Load unpacked" → select the unzipped folder

The extension connects to the HTTP server (localhost:37373) that starts automatically while the app is running. **Keep the app running** while using the browser extension.

To build the extension manually:

```bash
cd extension
npm install
npm run build
```

## Project structure

```
src/
  ├── app/                # Next.js App Router (page/layout only, no API routes)
  │   └── page.tsx        # Main page (bookmark list)
  ├── components/         # UI components
  │   └── ui/             # shadcn/ui-based components
  ├── hooks/              # Custom hooks (the core of state management)
  ├── lib/                # tauriFetch, utilities
  ├── shared/             # Bookmark API and form logic
  ├── types/              # Type definitions (incl. DB <-> UI conversion functions)
  └── utils/              # Export and other utilities
src-tauri/
  ├── src/
  │   ├── commands.rs     # Tauri IPC commands (CRUD, settings, path operations)
  │   ├── db.rs           # SQLite init and schema
  │   ├── lib.rs          # Tauri app entry point, single-instance handling
  │   └── server.rs       # Built-in HTTP server (Axum, :37373)
  └── Cargo.toml
extension/                # Browser extension (separate project)
docs/                     # Specs and test checklists
public/
  └── extension.zip       # Prebuilt extension (downloadable from Help)
```

## Commands

| Command                         | Description                        |
| -------------------------------- | ----------------------------------- |
| `npm run tauri:dev`              | Start Tauri dev mode                |
| `npm run tauri:build`            | Production Tauri build              |
| `npm run dev`                    | Start the Next.js dev server only   |
| `npm run build`                  | Next.js build                       |
| `npm run lint`                   | Run ESLint                          |
| `cd extension && npm run build`  | Build the browser extension         |

## License

[MIT License](LICENSE)
