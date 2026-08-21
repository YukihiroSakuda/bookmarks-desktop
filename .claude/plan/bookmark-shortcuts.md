# Implementation Plan: Bookmark Global Keyboard Shortcuts

ブックマークごとにキーボードショートカットを割り当て、システム全体のどこからでもそのショートカットでページ/フォルダを開ける機能。

## Task Type
- [x] Frontend (form capture UI, event wiring)
- [x] Backend (Rust: DB migration, global-shortcut plugin, sync command)
- [x] Fullstack (→ both)

## Decisions (confirmed with user)
- **Scope**: System-wide global shortcuts (Tauri `global-shortcut` plugin) — fires even when app is minimized/unfocused.
- **Key format**: Modifier + character (e.g. `Ctrl+Shift+1`, `Alt+G`). At least one modifier required.
- **Settings UI**: Inside the bookmark edit form (`BookmarkForm`).

## Technical Solution

**Storage**: add a nullable `shortcut TEXT` column to `bookmarks`, holding a Tauri accelerator string (e.g. `"CmdOrCtrl+Shift+Digit1"`). Uniqueness enforced in-app (one accelerator → at most one bookmark).

**Registration model**: The plugin is built once with a **single global handler**. When any registered accelerator fires (on key *press*, not release), the handler looks up the bookmark whose `shortcut` matches the pressed accelerator and **emits a `open-bookmark-shortcut` event** carrying the bookmark `id`. The frontend already has all open logic (`handleBookmarkClick` — URL via opener, path via `open_path`, plus access-count increment and cache update); a listener reuses it. This keeps open behavior DRY (one code path) and works while minimized because the Tauri webview JS keeps running.

**Sync lifecycle**: A `sync_global_shortcuts` command does `unregister_all()` then re-registers every bookmark's accelerator from the DB. Called (a) once at startup after DB init, and (b) from the frontend after any create/update/delete. Registration failures (OS/another app owns the combo) are collected and returned so the UI can warn without aborting.

### Conflict detection (two layers, this app is effectively Windows-only)

| Conflict kind | Detected at register time? | How |
|---|---|---|
| **Self duplicate** — two bookmarks share a combo | ✅ Reliable | Validate in the form against the full bookmark list before save; optional `is_registered(acc)` pre-check |
| **Owned by another app (Windows)** | ✅ Reliable | Tauri v2 global-shortcut wraps Win32 `RegisterHotKey`, which **returns an error when the combo is already held**. `register()` → `Err` → collect into `failed`, toast a warning |
| **OS silently pre-empts the combo** (a few reserved keys) | ❌ Not detectable | `RegisterHotKey` "succeeds" but the press never reaches the app. Cannot be caught at register time — only "pressing does nothing" reveals it. Mitigate by documenting in Help |

So the `failed` list returned by `sync_global_shortcuts` captures both self-duplicates (if any slip past form validation) and other-app conflicts on Windows. The only undetectable class is OS-reserved keys, which is a platform limitation, not something the API exposes.

**Why emit-to-frontend over open-in-Rust**: avoids duplicating the URL/path branching + access-increment logic that already lives in `useBookmarks.handleBookmarkClick`. Fallback (open directly in Rust) is noted under Risks if event delivery proves unreliable while hidden.

## Implementation Steps

### Backend (Rust)

1. **Cargo.toml** — add dependency
   `src-tauri/Cargo.toml:20-28`
   ```toml
   tauri-plugin-global-shortcut = "2"
   ```
   Deliverable: plugin available to build.

2. **DB migration for `shortcut` column** — `src-tauri/src/db.rs`
   SQLite has no `ADD COLUMN IF NOT EXISTS`, and there is currently **no migration runner** (only `CREATE TABLE IF NOT EXISTS`). Add a tiny idempotent migrate step after `execute_batch(SCHEMA)`:
   ```rust
   // in init_db, after conn.execute_batch(SCHEMA)
   add_column_if_missing(&conn, "bookmarks", "shortcut", "TEXT")?;
   ```
   ```rust
   fn add_column_if_missing(conn:&Connection, table:&str, col:&str, ty:&str) -> Result<(),String> {
       let exists: bool = conn.prepare(&format!("PRAGMA table_info({table})"))?      // pseudo
           .query_map([], |r| r.get::<_,String>(1))?                                  // col name = index 1
           .filter_map(Result::ok).any(|name| name == col);
       if !exists {
           conn.execute(&format!("ALTER TABLE {table} ADD COLUMN {col} {ty}"), [])
               .map_err(|e| e.to_string())?;
       }
       Ok(())
   }
   ```
   Deliverable: existing user DBs gain the column on next launch; new DBs unaffected.

3. **commands.rs — persist & expose shortcut**
   - `BookmarkInput` (`commands.rs:20-34`): add `#[serde(default)] shortcut: Option<String>`.
   - `create_bookmark` (`commands.rs:163-197`): add `shortcut` to the INSERT column list + params.
   - `update_bookmark` (`commands.rs:199-251`): add `shortcut = ?` to **both** UPDATE branches (kind-some / kind-none).
   - `list_bookmarks` (`commands.rs:125-160`): add `shortcut` to SELECT and to the emitted JSON object.
   Deliverable: shortcut round-trips through the existing `/api/bookmarks` routes unchanged.

4. **commands.rs — global shortcut handler + sync command** (new section)
   ```rust
   use tauri_plugin_global_shortcut::GlobalShortcutExt;

   // Called by the plugin's single handler on key press.
   // Looks up bookmark by accelerator and notifies the frontend.
   pub fn on_shortcut_pressed(app:&AppHandle, accelerator:&str) {
       let state = app.state::<AppState>();
       let conn = state.conn.lock().unwrap();
       let id: Option<String> = conn.query_row(
           "SELECT id FROM bookmarks WHERE shortcut = ?1", [accelerator],
           |r| r.get(0)).optional().ok().flatten();
       if let Some(id) = id { let _ = app.emit("open-bookmark-shortcut", id); }
   }

   #[tauri::command]
   pub fn sync_global_shortcuts(app: AppHandle, state: State<AppState>) -> Result<Value,String> {
       let gs = app.global_shortcut();
       let _ = gs.unregister_all();
       let shortcuts: Vec<String> = { /* SELECT shortcut FROM bookmarks WHERE shortcut IS NOT NULL */ };
       let mut failed = Vec::new();
       for acc in shortcuts {
           // register() returns Err when the OS/another app already holds the
           // combo (Win32 RegisterHotKey fails) -> that combo is reported, the
           // rest keep registering.
           if gs.register(acc.as_str()).is_err() { failed.push(acc); }
       }
       Ok(json!({ "ok": true, "failed": failed }))
   }

   // Optional pre-check the form can call before saving, to catch a clash the
   // OS owns *before* the combo is committed to a bookmark.
   #[tauri::command]
   pub fn is_shortcut_available(app: AppHandle, accelerator: String) -> Result<bool,String> {
       Ok(!app.global_shortcut().is_registered(accelerator.as_str()))
   }
   ```
   Note: confirm exact v2 API surface — `register(&str)` vs `Shortcut::from_str`, and `is_registered`; only register on `ShortcutState::Pressed` inside the handler to avoid double-fire.
   Deliverable: a command to (re)apply all shortcuts returning the combos the OS refused (`failed`); plus an availability pre-check.

   **Detection limits**: `register()`/`is_registered` reliably catch self-duplicates and combos already owned by another app on Windows. They **cannot** catch the small set of keys the OS silently pre-empts (register succeeds, but the press never reaches us) — document that in Help rather than trying to detect it.

5. **lib.rs — plugin registration + startup sync + handler routing** `src-tauri/src/lib.rs`
   ```rust
   .plugin(
       tauri_plugin_global_shortcut::Builder::new()
           .with_handler(|app, shortcut, event| {
               if event.state() == ShortcutState::Pressed {
                   commands::on_shortcut_pressed(app, &shortcut.to_string());
               }
           })
           .build(),
   )
   ```
   - In `setup`, after `app.manage(AppState{..})`, call the sync logic once to register existing shortcuts (call `commands::sync_global_shortcuts` via the managed handle, or factor the body into a non-command fn reused by both).
   - Add `commands::sync_global_shortcuts` to `invoke_handler!` (`lib.rs:67-92`).
   Deliverable: shortcuts live from app launch.

6. **Capabilities permission** — `src-tauri/capabilities/*.json`
   Add `"global-shortcut:allow-register"`, `"global-shortcut:allow-unregister-all"`, `"global-shortcut:allow-is-registered"` (or `global-shortcut:default`). Without this the plugin calls are denied at runtime.
   Deliverable: plugin permitted.

### Frontend (TS/React)

7. **types/bookmark.ts** — add `shortcut?: string` to `Bookmark` and `BookmarkUI`; map it in `convertToUI` (`shortcut: bookmark.shortcut || undefined`). `src/types/bookmark.ts`.

8. **shared/bookmarks/api.ts** — add `shortcut?: string` to `BookmarkApiInput`; include `shortcut: bookmark.shortcut ?? null` in **both** `createBookmark` and `updateBookmark` request bodies (`api.ts:92-149`).
   Note: the browser extension also imports this module but never sets `shortcut` → harmless `null`. Shortcuts remain a desktop-only concept.

9. **Accelerator capture util** — `src/lib/shortcut.ts` (new)
   ```ts
   // KeyboardEvent -> Tauri accelerator, or null if not a valid combo.
   export function eventToAccelerator(e: KeyboardEvent): string | null {
     const mods:string[] = [];
     if (e.ctrlKey || e.metaKey) mods.push("CmdOrCtrl");
     if (e.altKey) mods.push("Alt");
     if (e.shiftKey) mods.push("Shift");
     const main = mainKeyFromEvent(e);      // e.code -> "Digit1","KeyG",... ; ignore lone modifier keys
     if (!main || mods.length === 0) return null;   // require >=1 modifier
     return [...mods, main].join("+");
   }
   export function formatAcceleratorForDisplay(acc:string): string  // "CmdOrCtrl+Shift+Digit1" -> "Ctrl+Shift+1"
   ```
   Use `e.code` (layout-independent) for the main key. Must match the accelerator strings Tauri's plugin parses — verify against plugin docs and keep the keyset restricted to letters/digits/function keys.

10. **BookmarkForm.tsx — shortcut field**
    - `useState<string|null>(bookmark?.shortcut ?? null)`.
    - A read-only "capture" input: on focus it listens for the next keydown, runs `eventToAccelerator`, shows the formatted combo; a clear (X) button resets to null; `Esc` cancels capture.
    - Inline validation (two checks):
      1. **Self duplicate** — if the captured accelerator is already used by another bookmark (check the full bookmark list passed in), show an amber warning like the duplicate-URL one (`BookmarkForm.tsx:183-190`) and block save.
      2. **(Optional) OS availability** — call `invoke("is_shortcut_available", { accelerator })` to warn *before* saving when another app already owns the combo. Even if skipped, `sync_global_shortcuts` will still report it via `failed` after save.
    - Include `shortcut` in the `onSave({...})` payload (`BookmarkForm.tsx:99-110`).
    - Place the field below Title / above Tags for natural tab order.
    Note: `existingBookmarks` is currently passed only for new bookmarks (`page.tsx:340`). To validate on edit too, pass the full list (excluding the current bookmark) for uniqueness checking.

11. **useBookmarks.ts — re-sync after mutations + open-on-shortcut**
    - After `handleSave` (`useBookmarks.ts:56-83`) and `handleDelete` (`:90-100`) succeed, call `invoke("sync_global_shortcuts")` and surface any `failed` combos via `toast.warning`.
    - `BookmarkApiInput` passed to create/update must carry `shortcut`.

12. **page.tsx — listen for shortcut fire** `src/app/page.tsx`
    Add an effect mirroring the existing `bookmark-added` listener (`page.tsx:161-167`):
    ```ts
    listen<string>("open-bookmark-shortcut", (e) => {
      const bm = bookmarksRef.current.find(b => b.id === e.payload);
      if (bm) handleBookmarkClick(bm);
    });
    ```
    Use a ref to current bookmarks to avoid stale closure. Reuses all existing open + access-count logic.

### Card badge

13. **BookmarkCard.tsx — always-visible shortcut badge** `src/components/BookmarkCard.tsx`
    Show the assigned combo as a small `kbd`-style badge on the card so users can see/recall bindings at a glance.
    - **Placement**: the right-side cluster currently holds only the hover-revealed action buttons (`BookmarkCard.tsx:159-174`, `opacity-0 group-hover:opacity-100`). Wrap that region so the badge sits **outside** the hover group and stays visible:
      ```tsx
      {!isOrderingMode && (
        <div className="flex items-center gap-1 shrink-0 ml-3">
          {bookmark.shortcut && (
            <kbd className="text-[10px] font-mono text-muted-foreground border rounded px-1.5 py-0.5 bg-muted whitespace-nowrap">
              {formatAcceleratorForDisplay(bookmark.shortcut)}
            </kbd>
          )}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {/* existing Pin / Edit / Delete buttons */}
          </div>
        </div>
      )}
      ```
    - Reuse `formatAcceleratorForDisplay` from `src/lib/shortcut.ts` (Step 9) so the card shows `Ctrl+Shift+1`, not the raw `CmdOrCtrl+Shift+Digit1`.
    - **Styling per UI guidelines** (`.claude/skills/ui-design-guidelines.md`: monochrome base + blue accent reserved for feedback): keep the badge **neutral/muted** (`text-muted-foreground` + `bg-muted` + `border`), not blue, so it reads as metadata rather than an action.
    - Hidden in ordering mode (the row is already simplified there). On very narrow cards the badge may compete with tags — acceptable since it's a short token; if needed, gate it behind the same `showTags` width check (`BookmarkCard.tsx:79-89`).
    Deliverable: each card with a binding shows its combo at all times.

### Docs / polish
14. Update in-app Help (`HelpDialog.tsx`) and `README` with the shortcut feature + "modifier required, must be unique, may be refused/pre-empted by OS" caveats.

## Key Files
| File | Operation | Description |
|------|-----------|-------------|
| `src-tauri/Cargo.toml` | Modify | add `tauri-plugin-global-shortcut` |
| `src-tauri/src/db.rs` | Modify | `shortcut` column + idempotent ALTER migration |
| `src-tauri/src/commands.rs` | Modify | persist/expose shortcut; `on_shortcut_pressed`; `sync_global_shortcuts` |
| `src-tauri/src/lib.rs` | Modify | register plugin+handler, startup sync, invoke_handler |
| `src-tauri/capabilities/*.json` | Modify | global-shortcut permissions |
| `src/types/bookmark.ts` | Modify | `shortcut` field + convertToUI |
| `src/shared/bookmarks/api.ts` | Modify | `shortcut` in create/update payloads |
| `src/lib/shortcut.ts` | Create | KeyboardEvent → accelerator + display formatting |
| `src/components/BookmarkForm.tsx` | Modify | capture field + uniqueness validation |
| `src/hooks/useBookmarks.ts` | Modify | re-sync after mutate; carry shortcut |
| `src/app/page.tsx` | Modify | `open-bookmark-shortcut` listener; pass full list for validation |
| `src/components/BookmarkCard.tsx` | Modify | always-visible `kbd`-style shortcut badge |
| `src/components/HelpDialog.tsx`, `README` | Modify | document feature |

## Risks and Mitigation
| Risk | Mitigation |
|------|------------|
| JS-captured accelerator string ≠ Tauri-parsed accelerator → registration silently fails | Centralize mapping in `src/lib/shortcut.ts`; restrict to letters/digits/F-keys; test a few combos end-to-end early |
| OS / another app already owns a combo (Windows) | Detectable: `register` returns Err → collect into `failed`, toast a warning; optional `is_shortcut_available` pre-check in the form; never abort the rest of the sync |
| OS silently pre-empts a reserved combo | **Not** detectable at register time (register succeeds, press never arrives) — document in Help; require a modifier to reduce the chance |
| Two bookmarks share a shortcut | Enforce uniqueness in the form before save; on sync, a duplicate would just map to the first row found |
| Migration on existing DBs | `PRAGMA table_info` check + `ALTER TABLE ADD COLUMN`, ignore if present |
| Missing capability permission → runtime denial | Add global-shortcut permissions to capabilities JSON (Step 6) |
| Event not delivered while window hidden/closed | Tauri webview JS keeps running when minimized, so emit works; **fallback**: open directly in Rust (opener plugin for URL, reuse `open_path` for path) inside `on_shortcut_pressed` if testing shows delivery gaps |
| Global shortcut hijacks the combo system-wide (annoyance) | Require ≥1 modifier; document; allow easy clearing in the form |

## Verification (manual — no test framework configured)
1. `npm run tauri:dev`, assign `Ctrl+Shift+1` to a URL bookmark, save.
2. Minimize the app → press `Ctrl+Shift+1` → page opens in default browser; access count increments.
3. Assign a shortcut to a `path` bookmark → fires `open_path`.
4. Try a combo already owned by the OS → expect a toast warning, app still works.
5. Restart app → shortcut still registered (startup sync).
6. Clear a shortcut, save → combo no longer fires, and the card badge disappears.
7. A bound bookmark shows a muted `Ctrl+Shift+1` badge on its card at all times (hidden in ordering mode).

## Execution
Run in a new chat:
```
/everything-claude-code:multi-execute .claude/plan/bookmark-shortcuts.md
```
(Note: the multi-plan template prints `/ccg:execute`, but that command is NOT installed here — use `multi-execute` above.)

## SESSION_ID (for multi-execute use)
- CODEX_SESSION: N/A — `codeagent-wrapper` not installed; planned with Claude built-in tools (Glob/Grep/Read).
- GEMINI_SESSION: N/A
