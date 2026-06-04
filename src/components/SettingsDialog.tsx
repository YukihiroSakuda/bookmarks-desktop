"use client";

import { useState, useEffect } from "react";
import { Settings, Sun, Monitor, MoonStar, Upload, Download, Trash2, X } from "lucide-react";
import { Button } from "./Button";
import { useImportBookmarks } from "./ImportBookmarks";
import { exportBookmarksToHtml, downloadHtml } from "@/utils/export";
import { BookmarkUI } from "@/types/bookmark";
import { toast } from "sonner";

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
  bookmarks: BookmarkUI[];
  onBookmarksUpdate: (bookmarks: BookmarkUI[]) => void;
  onDeleteAll: () => void;
  isOrderingMode?: boolean;
}

export function SettingsDialog({
  listColumns,
  onListColumnsChange,
  bookmarks,
  onBookmarksUpdate,
  onDeleteAll,
  isOrderingMode = false,
}: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    if (!open) return;
    const saved = localStorage.getItem("theme") as Theme;
    if (saved && ["light", "system", "dark"].includes(saved)) {
      setTheme(saved);
    }
  }, [open]);

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

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        icon={Settings}
        disabled={isOrderingMode}
        onClick={() => setOpen(true)}
      />

      {open && (
        <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-sm flex flex-col">
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
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Import from HTML</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Upload}
                      onClick={handleImportClick}
                      disabled={isImporting}
                    >
                      {isImporting ? "Importing..." : "Import"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Export to HTML</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={handleExportClick}
                    >
                      Export
                    </Button>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div>
                <label className="block text-sm font-medium mb-2 text-destructive">Danger Zone</label>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Delete all bookmarks</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => {
                      setOpen(false);
                      onDeleteAll();
                    }}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
