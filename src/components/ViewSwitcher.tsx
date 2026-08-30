import { Bookmark, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { AppView } from "@/lib/appView";

interface ViewSwitcherProps {
  view: AppView;
  onViewChange: (view: AppView) => void;
  /** Reordering hijacks the bookmark list; leaving it by switching views would
   *  strand the unsaved order, so the switch is held until it is off. */
  disabled?: boolean;
}

const VIEWS = [
  { id: "bookmarks" as const, label: "Bookmarks", icon: Bookmark },
  { id: "groups" as const, label: "Groups", icon: Layers },
];

export function ViewSwitcher({ view, onViewChange, disabled = false }: ViewSwitcherProps) {
  return (
    <div className="flex items-center gap-1" role="tablist">
      {VIEWS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={view === id}
          disabled={disabled}
          onClick={() => onViewChange(id)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            view === id
              ? "text-blue-500 font-medium bg-blue-500/5"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  );
}
