"use client";

import { cn } from "@/lib/utils";
import { UiLang } from "@/lib/uiLanguage";

/**
 * Two-letter codes rather than the full names: they read the same whichever
 * language is active, so the control keeps its width and its meaning when you
 * use it — which matters for something that sits in a dialog header.
 */
const TABS: { key: UiLang; label: string }[] = [
  { key: "en", label: "EN" },
  { key: "ja", label: "JA" },
];

/**
 * The language switch, in the header of every dialog that has a language.
 *
 * Both the help and settings dialogs carry it: it is one control on one stored
 * value, so it is one component rather than the same markup written twice.
 */
export function LanguageToggle({
  lang,
  onChange,
  className,
}: {
  lang: UiLang;
  onChange: (lang: UiLang) => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center border rounded-md overflow-hidden text-sm",
        className
      )}
    >
      {TABS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={cn(
            "px-3 py-1 transition-colors",
            lang === key
              ? "bg-blue-500 text-white"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
