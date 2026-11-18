import { Sparkles, Check, X, Globe, FolderOpen } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "./Button";
import { Suggestion } from "@/types/suggestion";

interface SuggestionsMenuProps {
  suggestions: Suggestion[];
  /** Opens the ordinary add form filled in from the suggestion. */
  onReview: (suggestion: Suggestion) => void;
  onDismiss: (id: string) => void;
  disabled?: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/** The last segment of a Windows path: the file or folder name. */
function nameOf(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/**
 * Bookmarks an AI assistant proposed. Nothing here is saved: "Review" opens the
 * normal add form, and the bookmark exists only if the user presses Save there.
 * Everything shown is text from an AI that may have read hostile pages, so it
 * is rendered as plain text, with the real host and full URL always visible.
 */
export function SuggestionsMenu({
  suggestions,
  onReview,
  onDismiss,
  disabled,
}: SuggestionsMenuProps) {
  if (suggestions.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" icon={Sparkles} disabled={disabled}>
          Suggestions
          <span className="ml-1 rounded-full bg-blue-500 px-1.5 text-[10px] font-medium leading-4 text-white">
            {suggestions.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="border-b px-3 py-2">
          <p className="text-sm font-medium">Suggested by an AI assistant</p>
          <p className="text-xs text-muted-foreground">
            Nothing is saved until you add it. Check the address or path before you do.
          </p>
        </div>
        <ul className="max-h-80 overflow-y-auto divide-y">
          {suggestions.map((s) => (
            <li key={s.id} className="flex flex-col gap-1.5 px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" title={s.title || undefined}>
                  {s.title || (s.kind === "path" ? nameOf(s.url) : hostOf(s.url))}
                </p>
                <p className="flex items-center gap-1 text-xs text-blue-500 truncate">
                  {s.kind === "path" ? (
                    <>
                      <FolderOpen size={12} className="shrink-0" />
                      On this computer
                    </>
                  ) : (
                    <>
                      <Globe size={12} className="shrink-0" />
                      {hostOf(s.url)}
                    </>
                  )}
                </p>
                <p className="text-xs font-mono text-muted-foreground break-all line-clamp-2" title={s.url}>
                  {s.url}
                </p>
              </div>
              {s.reason && <p className="text-xs text-muted-foreground">{s.reason}</p>}
              <div className="flex justify-end gap-1.5">
                <Button variant="ghost" size="sm" icon={X} onClick={() => onDismiss(s.id)}>
                  Dismiss
                </Button>
                <Button variant="primary" size="sm" icon={Check} onClick={() => onReview(s)}>
                  Review & add
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
