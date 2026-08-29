import { useEffect, useMemo, useState } from "react";
import { Folder, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { OpenFolder } from "@/types/group";
import { Button } from "./Button";
import { cn } from "@/lib/utils";

interface CaptureDialogProps {
  onClose: () => void;
  onLoad: () => Promise<OpenFolder[]>;
  /** Resolves false when the group could not be created, keeping this open. */
  onCapture: (name: string, paths: string[]) => Promise<boolean>;
}

/**
 * Above this many candidates nothing starts selected. Twenty folders silently
 * pre-checked is a group nobody asked for; a handful is what the user meant.
 */
const PRESELECT_LIMIT = 8;

export function CaptureDialog({ onClose, onLoad, onCapture }: CaptureDialogProps) {
  const [folders, setFolders] = useState<OpenFolder[] | null>(null);
  // Distinct from `folders === null`, which is the loading state. Without it a
  // rejected load leaves the dialog reading "Reading open windows…" forever.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    onLoad()
      .then((found) => {
        if (cancelled) return;
        setLoadError(null);
        setFolders(found);
        setSelected(
          found.length <= PRESELECT_LIMIT ? new Set(found.map((f) => f.path)) : new Set()
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : String(error));
        setFolders([]);
      });
    return () => { cancelled = true; };
  }, [onLoad]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isSaving, onClose]);

  const toggle = (path: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const paths = useMemo(
    () => (folders ?? []).filter((f) => selected.has(f.path)).map((f) => f.path),
    [folders, selected]
  );

  const reload = async () => {
    setFolders(null);
    setLoadError(null);
    try {
      const found = await onLoad();
      setFolders(found);
      setSelected(found.length <= PRESELECT_LIMIT ? new Set(found.map((f) => f.path)) : new Set());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
      setFolders([]);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || paths.length === 0 || isSaving) return;
    setIsSaving(true);
    try {
      const ok = await onCapture(name.trim(), paths);
      if (ok) onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm"
      onClick={() => { if (!isSaving) onClose(); }}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="bg-popover rounded-2xl border shadow-lg p-6 w-full max-w-lg max-h-[80vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-medium">Capture open folders</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={RefreshCw}
            onClick={reload}
            disabled={folders === null || isSaving}
            title="Reload"
          />
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          エクスプローラーで開いているフォルダをグループにします。ブラウザのタブは含まれません。
          エクスプローラーのタブは、各ウィンドウで<strong className="font-medium text-foreground">表示中のものだけ</strong>が対象です。
        </p>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
          {folders === null ? (
            <div className="flex items-center gap-2 py-8 justify-center text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Reading open windows…
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <TriangleAlert className="size-5 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                開いているウィンドウを読み取れませんでした。
              </p>
              <p className="text-xs text-muted-foreground break-all max-w-sm">{loadError}</p>
              <Button type="button" variant="secondary" size="sm" icon={RefreshCw} onClick={reload}>
                Retry
              </Button>
            </div>
          ) : folders.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              開いているエクスプローラーのウィンドウがありません。
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {folders.map((folder) => {
                const on = selected.has(folder.path);
                return (
                  <li key={folder.path}>
                    <button
                      type="button"
                      onClick={() => toggle(folder.path)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors",
                        on ? "bg-blue-500/5" : "hover:bg-accent"
                      )}
                    >
                      <span
                        className={cn(
                          "size-4 rounded border shrink-0 flex items-center justify-center",
                          on ? "bg-blue-500 border-blue-500" : "border-input"
                        )}
                        aria-hidden="true"
                      >
                        {on && (
                          <svg viewBox="0 0 12 12" className="size-3 text-white" fill="none">
                            <path d="M2.5 6.5 5 9l4.5-5.5" stroke="currentColor" strokeWidth="1.8"
                              strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <Folder className="size-4 text-muted-foreground shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm truncate">{folder.name}</span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {folder.path}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <label className="block text-sm font-medium mt-4 mb-1">Group name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Project A morning"
          className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />

        <div className="flex items-center justify-between gap-2 mt-4">
          <span className="text-xs text-muted-foreground">
            {paths.length} selected
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              isLoading={isSaving}
              disabled={!name.trim() || paths.length === 0}
            >
              Create group
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
