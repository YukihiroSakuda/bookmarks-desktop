# Bookmarks

A bookmark manager built as a Tauri v2 desktop app + browser extension (Windows).
Data is stored in SQLite, so it works fully offline with no external server required.

## Download

- App: [Microsoft Store](https://apps.microsoft.com/detail/9MT8VDHDB2Z9?hl=ja-jp&gl=JP&ocid=pdpshare)
- App: [GitHub Releases](https://github.com/YukihiroSakuda/bookmarks-desktop/releases) (`.exe` / `.msi`)
- Extension: [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/bookmarks/jppmhgioeccjkicfjkddfofellogpjoa)

> The GitHub Releases installer isn't code-signed, so Windows SmartScreen may show a warning during installation. Click "More info" → "Run anyway" to continue. The Microsoft Store version doesn't have this issue.

## Where data is stored

All data lives on your own PC — nothing is sent to a server operated by the developer or any third party. The only outbound requests are to the sites you bookmark, to read their title and icon when you add them (see [Privacy Policy](docs/privacy-policy.md)). The database is a single SQLite file (`bookmarks.db`):

| What | Location |
| ---- | -------- |
| Database (bookmarks, tags, tag rules, settings) | `%APPDATA%\com.yukihirosakuda.bookmarks\bookmarks.db`<br>(= `C:\Users\<user>\AppData\Roaming\com.yukihirosakuda.bookmarks\`) |
| WebView2 profile — theme, search history, list cache (localStorage) | `%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\EBWebView\` |
| Logs | `%LOCALAPPDATA%\com.yukihirosakuda.bookmarks\logs\` |
| File shortcuts (only when switched on) | `%USERPROFILE%\Bookmarks\` — changeable in Settings |

**The Microsoft Store build and the GitHub Releases build share these same folders**, so your bookmarks carry over when you switch between them. (The Store build is a plain MSIX package with only the `runFullTrust` capability and no Package Support Framework, so Windows does not redirect its `%APPDATA%` writes into the package container.) Only the executable differs:

| Installed from | Executable |
| -------------- | ---------- |
| GitHub Releases (`.exe` / `.msi`) | `%LOCALAPPDATA%\bookmarks\app.exe` |
| Microsoft Store (MSIX) | `C:\Program Files\WindowsApps\YukihiroSakuda.BookmarksTags_<version>_neutral__qvmk1q0kegjem\app.exe` (managed by Windows) |

Because the data folders sit outside the package, **uninstalling either build leaves your data in place**. Delete the two folders above manually if you want to erase everything. To move to another PC, use **Settings → Data → Backup** to write a JSON file and **Restore** it there.

## Features

### Bookmark management

- Add, edit, and delete bookmarks
- Automatic title fetching when entering a URL. Pages behind a login (SharePoint, Box, intranet portals) answer with a sign-in page, so the title is built from the URL instead — usually the file name and the site it lives in
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

### File shortcuts (use your bookmarks inside other apps' file dialogs)

Off by default; switch it on in **Settings → File shortcuts**.

Every app's Open/Attach dialog is Explorer, and Windows Quick Access can only pin *folders* — never a set of files scattered across the disk. So when you are attaching a file in Outlook, uploading one in Chrome, or placing one in Photoshop, a bookmark manager is no help at all: clicking a bookmark opens the file in its own app instead of handing the path to the dialog.

Turning this on keeps one Windows folder (`%USERPROFILE%\Bookmarks` by default, changeable) filled with `.lnk` shortcuts to every bookmarked file and folder. Pin it to Quick Access — there is a button for it — and your bookmarks are one click away in the left pane of every file dialog.

- Flat: one bookmark, one shortcut. Shortcuts are named after the **real file name**, extension included, so dialog filters still match them
- Two bookmarks with the same file name are told apart by their folder: `見積書 (案件A).xlsx`
- Each shortcut's modified time is the time you last opened that bookmark, so sorting a dialog by "Date modified" puts what you actually use on top
- **URLs are not included** — a `.url` file cannot be picked in a file dialog, and it would only crowd out the files that can
- The folder follows the app: add, rename, or delete a bookmark and the shortcuts follow. Deleting a shortcut by hand just brings it back on the next sync
- Switching the feature off removes the shortcuts it created, the folder (if you left nothing else in it), and the Quick Access pin

Only files this app created are ever deleted — they are tracked in a manifest inside the folder. Point the setting at a folder full of your own documents and it can add shortcuts there, but it can never take anything away.

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
- Per-tag color (8 presets, blue by default) — applied in the filter bar and on bookmark cards
- Manual tag order via drag and drop in Tag Manager (the filter bar follows it)
- Tag rules: automatic tagging based on URL/title patterns

### Search

- Real-time search across title, URL, and memo
- Search history (up to 10 entries, stored in localStorage)
- Just start typing to focus the search bar and begin typing (no need to press `/`; disabled while an input is focused or when modifier-key combos are used), `Esc` closes the modal
- Search reaches **inside the folders you have bookmarked** — matching file and folder names appear under "In your folders", grouped by the bookmark they came from. Click to open, or open the containing folder
  - Nothing is indexed or stored: each search walks the bookmarked folders and keeps only the matches, so results are never stale and no file names are written to disk, to a backup, or to a sync folder
  - Bounded by design: 3 levels deep, 20,000 entries per folder, and build/dependency directories (`node_modules`, `.git`, `target`, …) are skipped. Folders too large to search fully say so instead of silently dropping results
  - Network shares and removable drives are not searched by default, since walking them can block for seconds

### Import / export

- Export to an HTML file
- Import an HTML file exported from a browser (with duplicate detection)

### Browser extension

- Works with Chrome / Edge (Manifest V3)
- Published on [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/bookmarks/jppmhgioeccjkicfjkddfofellogpjoa) (also installable unpacked from the app's Help dialog)
- Talks to the app's built-in HTTP server (localhost:37373) — no external service required
- Bookmark the current page in one click
- Automatic duplicate URL detection
- Bookmarks added from the extension appear in the app in real time

### UI / UX

- Modern design based on shadcn/ui (monochrome + a single blue accent)
- Dark mode support (Light / System / Dark)
- Responsive layout
- Site icons fetched once from the site itself when a bookmark is added, then stored locally (no third-party icon service, and no network access to display them). Icons for imported bookmarks can be collected from **Settings → Data → Fetch missing icons**

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

For everyday use, install it from [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/bookmarks/jppmhgioeccjkicfjkddfofellogpjoa).

To run a local build, download `extension.zip` from the app's Help dialog, unzip it, and load it as an unpacked extension.

- Chrome: `chrome://extensions` → "Load unpacked" → select the unzipped folder
- Edge: `edge://extensions` → "Load unpacked" → select the unzipped folder

The extension connects to the HTTP server (localhost:37373) that starts automatically while the app is running. **Keep the app running** while using the browser extension.

To build the extension manually:

```bash
cd extension
npm install
npm run build
```

### 6. Microsoft Store package (MSIX)

```powershell
powershell -File scripts/build-msix.ps1
```

Produces the unsigned `src-tauri/msix/output/bookmarks.msix` for Partner Center. See [docs/msix-release.md](docs/msix-release.md) for the full release procedure — version rules, local test signing, WACK validation, and submission.

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
