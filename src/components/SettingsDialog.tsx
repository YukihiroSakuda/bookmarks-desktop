"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Sun, Monitor, MoonStar, Upload, Download, Trash2, X, TriangleAlert, Keyboard, FileJson, RotateCcw, ExternalLink, Image as ImageIcon, FolderOpen, RefreshCw, Pin, PinOff } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "./Button";
import { useImportBookmarks } from "./ImportBookmarks";
import { exportBookmarksToHtml, downloadHtml } from "@/utils/export";
import { BookmarkUI } from "@/types/bookmark";
import { eventToAccelerator, formatAcceleratorForDisplay } from "@/lib/shortcut";
import { toast } from "sonner";
import { tauriFetch } from "@/lib/tauriFetch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { UiLang } from "@/lib/uiLanguage";
import { LanguageToggle } from "./LanguageToggle";
import { SETTINGS_TEXT } from "@/lib/settingsText";

const DELETE_CONFIRM_PHRASE = "delete all";

/**
 * The dialog shows one of these at a time. Ordered the way they are reached
 * for: the two everyday appearance controls, then the keys, then the two
 * features that write outside the app, then what the app is.
 */
const SETTINGS_SECTIONS = [
  { id: "appearance" },
  { id: "shortcuts" },
  { id: "files" },
  { id: "data" },
  { id: "about" },
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Shown until the user picks a location; the backend resolves it for real. */
const DEFAULT_SHORTCUT_DIR = "%USERPROFILE%\\Bookmarks";

const MS_STORE_URL = "https://apps.microsoft.com/detail/9MT8VDHDB2Z9";
const RELEASES_URL = "https://github.com/YukihiroSakuda/bookmarks-desktop/releases";
const PRIVACY_URL =
  "https://github.com/YukihiroSakuda/bookmarks-desktop/blob/main/docs/privacy-policy.md";

/** External links must go through the opener plugin — a plain <a> navigates the Tauri webview. */
function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => {
        openUrl(href).catch((e) => console.error(e));
      }}
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
    >
      {children}
      <ExternalLink size={11} />
    </button>
  );
}

type Theme = "light" | "system" | "dark";

const THEMES: { key: Theme; icon: typeof Sun }[] = [
  { key: "light", icon: Sun },
  { key: "system", icon: Monitor },
  { key: "dark", icon: MoonStar },
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
  lang: UiLang;
  onLangChange: (lang: UiLang) => void;
  listColumns: 1 | 2 | 3 | 4;
  onListColumnsChange: (cols: 1 | 2 | 3 | 4) => void;
  summonShortcut: string;
  onSummonShortcutChange: (accelerator: string) => void;
  shortcutDirEnabled: boolean;
  shortcutDirPath: string;
  onShortcutDirChange: (patch: {
    shortcutDirEnabled?: boolean;
    shortcutDirPath?: string;
  }) => void;
  bookmarks: BookmarkUI[];
  onBookmarksUpdate: (bookmarks: BookmarkUI[]) => void;
  onDeleteAll: () => void;
  onRestoreComplete: () => void;
  isOrderingMode?: boolean;
}

export function SettingsDialog({
  lang,
  onLangChange,
  listColumns,
  onListColumnsChange,
  summonShortcut,
  onSummonShortcutChange,
  shortcutDirEnabled,
  shortcutDirPath,
  onShortcutDirChange,
  bookmarks,
  onBookmarksUpdate,
  onDeleteAll,
  onRestoreComplete,
  isOrderingMode = false,
}: SettingsDialogProps) {
  const t = SETTINGS_TEXT[lang];
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");
  const [isCapturingSummon, setIsCapturingSummon] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  // Every section is rendered into one scrolling column — the sidebar moves
  // you to one rather than swapping what exists, so scrolling past the end of
  // a category still reveals the next. `activeId` is only which entry the
  // sidebar highlights. Kept across open/close: while tuning one area you
  // tend to come straight back to it.
  const [activeId, setActiveId] = useState<SettingsSection>("appearance");
  const contentRef = useRef<HTMLDivElement | null>(null);
  // State-backed container node so the scroll-spy effect re-runs once the
  // element is actually mounted (it does not exist while the dialog is shut).
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const setContentNode = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    setContainerEl(node);
  }, []);

  const registerRef = (id: string) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el;
  };

  const scrollTo = (id: SettingsSection) => {
    setActiveId(id);
    const el = sectionRefs.current[id];
    const container = contentRef.current;
    if (el && container) {
      const top =
        container.scrollTop +
        el.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        16;
      container.scrollTo({ top, behavior: "smooth" });
    }
  };

  // Scroll spy: keep the sidebar entry in sync with the section in view.
  useEffect(() => {
    const container = containerEl;
    if (!open || !container) return;

    const handleScroll = () => {
      // At the very bottom, force-select the last section: About is short
      // enough that it would never otherwise cross the threshold.
      if (container.scrollTop + container.clientHeight >= container.scrollHeight - 2) {
        setActiveId(SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id);
        return;
      }
      const threshold = container.getBoundingClientRect().top + 24;
      let current: SettingsSection = SETTINGS_SECTIONS[0].id;
      for (const { id } of SETTINGS_SECTIONS) {
        const el = sectionRefs.current[id];
        if (el && el.getBoundingClientRect().top - threshold <= 1) {
          current = id;
        }
      }
      setActiveId(current);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    const raf = requestAnimationFrame(handleScroll);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [open, containerEl]);
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

  // Version comes from the Tauri backend, so it stays unresolved on the web dev server.
  useEffect(() => {
    if (!open || appVersion) return;
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, [open, appVersion]);

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

  // "Fetch missing icons" is the only action that contacts many sites at once,
  // so it is always user-initiated, shows its progress, and can be stopped.
  const [missingIcons, setMissingIcons] = useState(0);
  const [iconProgress, setIconProgress] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    tauriFetch("/api/favicons/missing")
      .then((res) => (res.ok ? res.json() : { count: 0 }))
      .then((data) => {
        if (!cancelled) setMissingIcons(data?.count ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, iconProgress]);

  useEffect(() => {
    const promise = listen<{ done: number; total: number }>("favicon-progress", (event) => {
      setIconProgress({ done: event.payload.done, total: event.payload.total });
    });
    return () => {
      promise.then((unlisten) => unlisten());
    };
  }, []);

  async function handleFetchIconsClick() {
    setIconProgress({ done: 0, total: missingIcons });
    try {
      const res = await tauriFetch("/api/favicons/fetch-missing", { method: "POST" });
      const data = res.ok ? await res.json() : null;
      if (data?.cancelled) {
        toast.success(t.iconsStopped(data.updated));
      } else {
        toast.success(t.iconsDone(data?.updated ?? 0, data?.total ?? 0));
      }
      onRestoreComplete();
    } catch (error) {
      console.error("Error fetching icons:", error);
      toast.error(t.iconsFailed);
    } finally {
      setIconProgress(null);
    }
  }

  function handleCancelFetchIcons() {
    tauriFetch("/api/favicons/cancel", { method: "POST" }).catch(() => {});
  }

  // Shortcut folder. Switching it on or picking a new location is saved like
  // any other setting; the backend reconciles the folder right after.
  const [isSyncingShortcuts, setIsSyncingShortcuts] = useState(false);
  const [isPinning, setIsPinning] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  async function handlePickShortcutDir() {
    try {
      const res = await tauriFetch("/api/shortcut-dir/pick", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(t.pickFolderFailedWith(data?.error ?? "unknown error"));
        return;
      }
      if (data?.cancelled) return;
      onShortcutDirChange({ shortcutDirPath: data.path });
    } catch (error) {
      console.error("Error picking shortcut folder:", error);
      toast.error(t.pickFolderFailed);
    }
  }

  async function handleOpenShortcutDir() {
    const res = await tauriFetch("/api/shortcut-dir/open", { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      toast.error(t.openFolderFailedWith(data?.error ?? "unknown error"));
    }
  }

  // Quick Access can also be changed from Explorer, so the toggle reads the
  // real state when the dialog opens rather than tracking it locally.
  useEffect(() => {
    if (!open || !shortcutDirEnabled) return;
    let cancelled = false;
    tauriFetch("/api/shortcut-dir/pinned")
      .then((res) => (res.ok ? res.json() : { pinned: false }))
      .then((data) => {
        if (!cancelled) setIsPinned(Boolean(data?.pinned));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, shortcutDirEnabled, shortcutDirPath]);

  async function handleTogglePin() {
    const pinning = !isPinned;
    setIsPinning(true);
    try {
      const res = await tauriFetch(`/api/shortcut-dir/${pinning ? "pin" : "unpin"}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        // tauriFetch turns a backend error into `ok: false` rather than
        // throwing, so this branch has to report it — swallowing it here is
        // what made a real failure look like a silent refusal.
        toast.error(t.quickAccessFailedWith(data?.error ?? "unknown error"));
        return;
      }

      // The backend reports the state it observed afterwards, so the button
      // never claims an outcome the shell did not actually produce.
      setIsPinned(Boolean(data?.pinned));
      if (data?.pinned === pinning) {
        toast.success(pinning ? t.quickAccessPinned : t.quickAccessUnpinned);
      } else {
        toast.warning(t.quickAccessManual);
      }
    } catch (error) {
      console.error("Error changing Quick Access pin:", error);
      toast.error(t.quickAccessFailed);
    } finally {
      setIsPinning(false);
    }
  }

  async function handleSyncShortcuts() {
    setIsSyncingShortcuts(true);
    try {
      const res = await tauriFetch("/api/shortcut-dir/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast.error(t.syncFailedWith(data?.error ?? "unknown error"));
        return;
      }
      if (data?.enabled === false) return;
      const skipped = data.skipped?.length ?? 0;
      toast.success(skipped > 0 ? t.syncDoneSkipped(skipped) : t.syncDone);
    } catch (error) {
      console.error("Error syncing shortcut folder:", error);
      toast.error(t.syncFailed);
    } finally {
      setIsSyncingShortcuts(false);
    }
  }

  const { isImporting, handleFileUpload } = useImportBookmarks({
    onImportComplete: (count) => {
      toast.success(t.imported(count));
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
      toast.success(t.exported(bookmarks.length));
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      toast.error(t.exportFailed);
    }
  }

  async function handleBackupClick() {
    setIsBackingUp(true);
    try {
      const res = await invoke<{ cancelled?: boolean }>("export_data");
      if (!res?.cancelled) toast.success(t.backupSaved);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t.backupFailed);
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
      toast.success(t.restored(res?.bookmarks ?? 0));
      onRestoreComplete();
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t.restoreFailed);
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
                <h3 className="font-semibold text-base">{t.deleteConfirmTitle}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.deleteConfirmBefore}
                  <span className="font-medium text-foreground">{t.deleteConfirmStrong}</span>
                  {t.deleteConfirmAfter}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1.5">
                {t.typeConfirmBefore}
                <span className="font-mono font-semibold text-foreground">{DELETE_CONFIRM_PHRASE}</span>
                {t.typeConfirmAfter}
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
                {t.cancel}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={Trash2}
                disabled={deleteInput !== DELETE_CONFIRM_PHRASE}
                onClick={handleDeleteConfirm}
                className="text-destructive hover:text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                {t.deleteAll}
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
                <h3 className="font-semibold text-base">{t.restoreConfirmTitle}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.restoreConfirmBefore}
                  <span className="font-medium text-foreground">{t.restoreConfirmStrong}</span>
                  {t.restoreConfirmAfter}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowRestoreConfirm(false)}
              >
                {t.cancel}
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
          <div className="bg-popover rounded-2xl border shadow-lg w-full max-w-2xl flex flex-col h-[80vh] max-h-[46rem] overflow-hidden">
            <div className="flex justify-between items-center px-6 pt-6 pb-4">
              <h2 className="text-2xl font-bold">
                <span className="text-blue-500">#</span>
                {t.title}
              </h2>
              <div className="flex items-center gap-2">
                <LanguageToggle lang={lang} onChange={onLangChange} />
                <Button onClick={() => setOpen(false)} variant="ghost" size="sm" icon={X} />
              </div>
            </div>

            {/* Eight sections stacked in one narrow column had made the dialog
                long enough that its bottom was out of sight with nothing to say
                what was down there. The sidebar names the categories and jumps
                to them, but every section stays rendered and the column still
                scrolls end to end — same arrangement as the help dialog, so
                reading straight through works and nothing is hidden behind a
                click. */}
            <div className="flex flex-1 min-h-0 border-t">
              <nav className="w-52 shrink-0 border-r overflow-y-auto py-3">
                {SETTINGS_SECTIONS.map(({ id }) => (
                  <button
                    key={id}
                    onClick={() => scrollTo(id)}
                    className={cn(
                      "w-full text-left px-4 py-1.5 text-sm whitespace-nowrap transition-colors",
                      activeId === id
                        ? "text-blue-500 font-medium bg-blue-500/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent"
                    )}
                  >
                    {t.sections[id]}
                  </button>
                ))}
              </nav>

              <div ref={setContentNode} className="flex-1 min-w-0 overflow-y-auto px-6 py-5">
                <div className="flex flex-col gap-6 pb-2">
                <section ref={registerRef("appearance")}>
                  <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">{t.sections.appearance}</h2>
                  <div className="flex flex-col gap-5">
                    {/* Display Columns */}
                    <div>
                      <label className="block text-sm font-medium mb-2">{t.displayColumns}</label>
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

                    {/* Theme */}
                    <div>
                      <label className="block text-sm font-medium mb-2">{t.theme}</label>
                      <div className="flex gap-1.5">
                        {THEMES.map(({ key, icon: Icon }) => (
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
                            {t.themes[key]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </section>

                <div className="border-t" />

                <section ref={registerRef("shortcuts")}>
                  <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">{t.sections.shortcuts}</h2>
                  <div className="flex flex-col gap-5">
                    {/* Global Shortcut */}
                    <div>
                      <label className="block text-sm font-medium mb-2">{t.bringToFront}</label>
                      <div className="relative">
                        <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                        <input
                          type="text"
                          readOnly
                          value={
                            isCapturingSummon
                              ? t.pressCombo
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
                        <label className="text-sm font-medium">{t.perBookmark}</label>
                        {(() => {
                          const assigned = bookmarks.filter((b) => b.shortcut);
                          return (
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                                  {assigned.length > 0 ? t.assigned(assigned.length) : t.noneAssigned}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent align="end" className="w-64 p-3">
                                <p className="text-xs font-medium mb-2">{t.perBookmark}</p>
                                {assigned.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">{t.noShortcutsYet}</p>
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
                        {t.perBookmarkNote}
                      </p>
                    </div>
                  </div>
                </section>

                <div className="border-t" />

                <section ref={registerRef("files")}>
                  <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">{t.sections.files}</h2>
                  <div className="flex flex-col gap-5">
                    {/* File shortcuts */}
                    <div>
                      <label className="block text-sm font-medium mb-2">{t.fileShortcuts}</label>
                      <div className="flex gap-1.5">
                        {([
                          [t.off, false],
                          [t.on, true],
                        ] as const).map(([label, value]) => (
                          <button
                            key={label}
                            onClick={() => onShortcutDirChange({ shortcutDirEnabled: value })}
                            className={`flex-1 py-1.5 text-sm rounded-md border transition-colors ${
                              shortcutDirEnabled === value
                                ? "bg-foreground text-background border-foreground"
                                : "bg-secondary text-muted-foreground border-border hover:bg-accent"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t.fileShortcutsNote}
                      </p>

                      {shortcutDirEnabled && (
                        <>
                          <div
                            className="mt-2 rounded-md border border-input bg-transparent px-3 py-2 text-xs text-muted-foreground truncate"
                            title={shortcutDirPath || DEFAULT_SHORTCUT_DIR}
                          >
                            {shortcutDirPath || DEFAULT_SHORTCUT_DIR}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={FolderOpen}
                              onClick={handlePickShortcutDir}
                              className="flex-1"
                            >
                              {t.change}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={ExternalLink}
                              onClick={handleOpenShortcutDir}
                              className="flex-1"
                            >
                              {t.openFolder}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              icon={RefreshCw}
                              onClick={handleSyncShortcuts}
                              disabled={isSyncingShortcuts}
                              className="flex-1"
                            >
                              {isSyncingShortcuts ? t.syncing : t.syncNow}
                            </Button>
                          </div>
                          <Button
                            variant="secondary"
                            size="sm"
                            icon={isPinned ? PinOff : Pin}
                            onClick={handleTogglePin}
                            disabled={isPinning}
                            className="w-full mt-2"
                          >
                            {isPinning
                              ? t.working
                              : isPinned
                                ? t.unpinFromQuickAccess
                                : t.pinToQuickAccess}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </section>

                <div className="border-t" />

                <section ref={registerRef("data")}>
                  <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">{t.sections.data}</h2>
                  <div className="flex flex-col gap-5">
                    {/* Data */}
                    <div>
                      <label className="block text-sm font-medium mb-2">{t.data}</label>
                      <div className="flex gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Upload}
                          onClick={handleImportClick}
                          disabled={isImporting}
                          className="flex-1"
                        >
                          {isImporting ? t.importing : t.importLabel}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={Download}
                          onClick={handleExportClick}
                          className="flex-1"
                        >
                          {t.exportLabel}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t.htmlNote}
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
                          {isBackingUp ? t.backingUp : t.backup}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={RotateCcw}
                          onClick={() => setShowRestoreConfirm(true)}
                          disabled={isRestoring}
                          className="flex-1"
                        >
                          {isRestoring ? t.restoring : t.restore}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t.jsonNote}
                      </p>

                      <div className="flex gap-2 mt-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={ImageIcon}
                          onClick={handleFetchIconsClick}
                          disabled={iconProgress !== null || missingIcons === 0}
                          className="flex-1"
                        >
                          {iconProgress
                            ? t.fetchingIcons(iconProgress.done, iconProgress.total)
                            : missingIcons === 0
                              ? t.allIconsFetched
                              : t.fetchIcons(missingIcons)}
                        </Button>
                        {iconProgress && (
                          <Button variant="secondary" size="sm" onClick={handleCancelFetchIcons}>
                            {t.stop}
                          </Button>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t.iconsNote}
                      </p>
                    </div>

                    {/* Danger Zone */}
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-xs font-medium text-destructive mb-2">{t.dangerZone}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{t.deleteAllBookmarks}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Trash2}
                          onClick={openDeleteConfirm}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          {t.deleteAll}
                        </Button>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="border-t" />

                <section ref={registerRef("about")}>
                  <h2 className="text-base font-bold text-foreground border-l-2 border-blue-500 pl-2.5 mb-3">{t.sections.about}</h2>
                  <div className="flex flex-col gap-5">
                    {/* About */}
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium">Bookmarks &amp; Tags</span>
                        <span className="text-xs text-muted-foreground font-mono">
                          {appVersion ? `v${appVersion}` : ""}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2">
                        <ExtLink href={MS_STORE_URL}>Microsoft Store</ExtLink>
                        <ExtLink href={RELEASES_URL}>GitHub Releases</ExtLink>
                        <ExtLink href={PRIVACY_URL}>Privacy Policy</ExtLink>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {t.aboutNote}
                      </p>
                    </div>
                  </div>
                </section>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
