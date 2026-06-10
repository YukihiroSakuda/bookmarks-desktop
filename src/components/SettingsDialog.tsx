"use client";

import { useState, useEffect, useRef } from "react";
import { Settings, Sun, Monitor, MoonStar, Upload, Download, Trash2, X, TriangleAlert, Keyboard, FileJson, RotateCcw } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./Button";
import { useImportBookmarks } from "./ImportBookmarks";
import { exportBookmarksToHtml, downloadHtml } from "@/utils/export";
import { BookmarkUI } from "@/types/bookmark";
import { eventToAccelerator, formatAcceleratorForDisplay } from "@/lib/shortcut";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const DELETE_CONFIRM_PHRASE = "delete all";

type Theme = "light" | "system" | "dark";

const THEMES: { key: Theme; icon: typeof Sun; label: string }[] = [
  { key: "light", icon: Sun, label: "Light" },
  { key: "system", icon: Monitor, label: "System" },
  { key: "dark", icon: MoonStar, label: "Dark" },
];

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(selected: Theme) {
  const applied = selected === "system" ? getSystemTheme() : selected;
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(applied);
}

interface SettingsDialogProps {
  listColumns: 1 | 2 | 3 | 4;
  onListColumnsChange: (cols: 1 | 2 | 3 | 4) => void;
  summonShortcut: string;
  onSummonShortcutChange: (accelerator: string) => void;
  bookmarks: BookmarkUI[];
  onBookmarksUpdate: (bookmarks: BookmarkUI[]) => void;
  onDeleteAll: () => void;
  onRestoreComplete: () => void;
  isOrderingMode?: boolean;
}

export function SettingsDialog({
  listColumns,
  onListColumnsChange,
  summonShortcut,
  onSummonShortcutChange,
  bookmarks,
  onBookmarksUpdate,
  onDeleteAll,
  onRestoreComplete,
  isOrderingMode = false,
}: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isCapturingSummon, setIsCapturingSummon] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const deleteInputRef = useRef<HTMLInputElement>(null);

  function handleSummonKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    e.preventDefault();
    if (e.key === "Escape") {
      setIsCapturingSummon(false);
      e.currentTarget.blur();
      return;
    }
    const accelerator = eventToAccelerator(e.nativeEvent);
    if (accelerator) {
      setIsCapturingSummon(false);
      e.currentTarget.blur();
      if (accelerator !== summonShortcut) onSummonShortcutChange(accelerator);
    }
  }

  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem("theme") as Theme;
    if (saved && ["light", "system", "dark"].includes(saved)) {
      setTheme(saved);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isCapturingSummon) setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, isCapturingSummon]);

  function handleThemeChange(selected: Theme) {
    setTheme(selected);
    localStorage.setItem("theme", selected);
    applyTheme(selected);
  }

  const { isImporting, handleFileUpload } = useImportBookmarks({
    onImportComplete: (count) => {
      toast.success(`${count} bookmarks imported successfully!`);
      setOpen(false);
    },
    onBookmarksUpdate,
  });

  function handleImportClick() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".html";
    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (target.files) {
        handleFileUpload({ target: { files: target.files } } as React.ChangeEvent<HTMLInputElement>);
      }
    };
    input.click();
  }

  function openDeleteConfirm() {
    setDeleteInput("");
    setShowDeleteConfirm(true);
    setTimeout(() => deleteInputRef.current?.focus(), 0);
  }

  function handleDeleteConfirm() {
    if (deleteInput !== DELETE_CONFIRM_PHRASE) return;
    setShowDeleteConfirm(false);
    setOpen(false);
    onDeleteAll();
  }

  async function handleExportClick() {
    try {
      const html = exportBookmarksToHtml(bookmarks);
      await downloadHtml(html);
      toast.success(`${bookmarks.length} bookmarks exported successfully!`);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error("Export failed. Please try again.");
    }
  }

  async function handleBackupClick() {
    setIsBackingUp(true);
    try {
      const res = await invoke<{ cancelled?: boolean }>("export_data");
      if (!res?.cancelled) toast.success("Backup saved successfully!");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Backup failed. Please try again.");
    } finally {
      setIsBackingUp(false);
    }
  }

  async function handleRestoreConfirm() {
    setShowRestoreConfirm(false);
    setIsRestoring(true);
    try {
      const res = await invoke<{ cancelled?: boolean; bookmarks?: number }>("import_data");
      if (res?.cancelled) return;
      toast.success(`Restored ${res?.bookmarks ?? 0} bookmarks from backup.`);
      onRestoreComplete();
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Restore failed. Please try again.");
    } finally {
      setIsRestoring(false);
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={Settings}
        disabled={isOrderingMode}
        onClick={() => setOpen(true)}
      />

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-sm flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 flex items-center justify-center size-9 rounded-full bg-destructive/10">
                <TriangleAlert className="size-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Delete all bookmarks?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This action <span className="font-medium text-foreground">cannot be undone</span>. All bookmarks will be permanently deleted.
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1.5">
                Type <span className="font-mono font-semibold text-foreground">{DELETE_CONFIRM_PHRASE}</span> to confirm
              </label>
              <input
                ref={deleteInputRef}
                type="text"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleDeleteConfirm(); }}
                placeholder={DELETE_CONFIRM_PHRASE}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring placeholder:text-muted-foreground font-mono"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                disabled={deleteInput !== DELETE_CONFIRM_PHRASE}
                onClick={handleDeleteConfirm}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                Delete All
              </Button>
            </div>
          </div>
        </div>
      )}

      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-[60]">
          <div className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-sm flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0 flex items-center justify-center size-9 rounded-full bg-destructive/10">
                <TriangleAlert className="size-5 text-destructive" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Restore from backup?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  This <span className="font-medium text-foreground">replaces all current data</span> (bookmarks, tags, rules, and settings) with the contents of the backup file. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRestoreConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={RotateCcw}
                onClick={handleRestoreConfirm}
              >
                Choose file & restore
              </Button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-md flex flex-col max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                <span className="text-blue-500">#</span>
                Settings
              </h2>
              <Button onClick={() => setOpen(false)} variant="ghost" size="sm" icon={X} />
            </div>

            <div className="flex flex-col gap-5">
              {/* Display Columns */}
              <div>
                <label className="block text-sm font-medium mb-2">Display Columns</label>
                <div className="flex gap-1.5">
                  {([1, 2, 3, 4] as const).map((col) => (
                    <button
                      key={col}
                      onClick={() => onListColumnsChange(col)}
                      className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${
                        listColumns === col
                          ? "bg-foreground text-background border-foreground"
                          : "bg-secondary text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      {col}
                    </button>
                  ))}
                </div>
              </div>

              {/* Global Shortcut */}
              <div>
                <label className="block text-sm font-medium mb-2">Bring App to Front</label>
                <div className="relative">
                  <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    readOnly
                    value={
                      isCapturingSummon
                        ? "Press a key combination…"
                        : formatAcceleratorForDisplay(summonShortcut)
                    }
                    onFocus={() => setIsCapturingSummon(true)}
                    onBlur={() => setIsCapturingSummon(false)}
                    onKeyDown={handleSummonKeyDown}
                    className="w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer caret-transparent"
                  />
                </div>
              </div>

              {/* Per-Bookmark Shortcuts */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium">Per-Bookmark Shortcuts</label>
                  {(() => {
                    const assigned = bookmarks.filter((b) => b.shortcut);
                    return (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                            {assigned.length > 0 ? `${assigned.length} assigned` : "None assigned"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-64 p-3">
                          <p className="text-xs font-medium mb-2">Per-Bookmark Shortcuts</p>
                          {assigned.length === 0 ? (
                            <p className="text-xs text-muted-foreground">No shortcuts assigned yet.</p>
                          ) : (
                            <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                              {assigned.map((b) => (
                                <div key={b.id} className="flex items-center justify-between gap-2">
                                  <span className="text-xs truncate text-muted-foreground min-w-0">{b.title || b.url}</span>
                                  <kbd className="shrink-0 inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-mono text-foreground">
                                    {formatAcceleratorForDisplay(b.shortcut!)}
                                  </kbd>
                                </div>
                              ))}
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    );
                  })()}
                </div>
                <p className="text-xs text-muted-foreground">
                  Active while the app is open. Assign keys in each bookmark&apos;s edit form.
                </p>
              </div>

              {/* Theme */}
              <div>
                <label className="block text-sm font-medium mb-2">Theme</label>
                <div className="flex gap-1.5">
                  {THEMES.map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => handleThemeChange(key)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm rounded-md border transition-colors ${
                        theme === key
                          ? "bg-foreground text-background border-foreground"
                          : "bg-secondary text-muted-foreground border-border hover:bg-accent"
                      }`}
                    >
                      <Icon size={14} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Data */}
              <div>
                <label className="block text-sm font-medium mb-2">Data</label>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Upload}
                    onClick={handleImportClick}
                    disabled={isImporting}
                    className="flex-1"
                  >
                    {isImporting ? "Importing..." : "Import"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    onClick={handleExportClick}
                    className="flex-1"
                  >
                    Export
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  HTML import/export is compatible with browser bookmarks (memos, tags, and shortcuts are not included).
                </p>
                <div className="flex gap-2 mt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={FileJson}
                    onClick={handleBackupClick}
                    disabled={isBackingUp}
                    className="flex-1"
                  >
                    {isBackingUp ? "Backing up..." : "Backup"}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={RotateCcw}
                    onClick={() => setShowRestoreConfirm(true)}
                    disabled={isRestoring}
                    className="flex-1"
                  >
                    {isRestoring ? "Restoring..." : "Restore"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  JSON backup includes everything (tags, memos, shortcuts, settings). Restore replaces all current data.
                </p>
              </div>

              {/* Danger Zone */}
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-xs font-medium text-destructive mb-2">Danger Zone</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Delete all bookmarks</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={openDeleteConfirm}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    Delete All
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
