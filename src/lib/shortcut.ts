/**
 * Keyboard shortcut helpers shared by the bookmark form and card badge.
 *
 * The app stores Tauri accelerator strings (e.g. `"CmdOrCtrl+Shift+Digit1"`) so
 * they parse cleanly on the Rust side. We capture the main key from
 * `KeyboardEvent.code` (layout-independent) and restrict it to letters, digits,
 * and function keys — the subset Tauri's global-shortcut plugin reliably parses.
 */

const MODIFIER_CODES = new Set([
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

/** Map a `KeyboardEvent.code` to a Tauri-parsable key token, or null if unsupported. */
function mainKeyFromCode(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code;
  if (/^Digit[0-9]$/.test(code)) return code;
  if (/^F([1-9]|1[0-2])$/.test(code)) return code;
  if (code === "Space") return "Space";
  return null;
}

/**
 * Convert a keydown event to a Tauri accelerator string, or null when it is not
 * a valid combo (no modifier, a lone modifier key, or an unsupported main key).
 */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) return null;

  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push("CmdOrCtrl");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");

  const main = mainKeyFromCode(e.code);
  if (!main || mods.length === 0) return null;

  return [...mods, main].join("+");
}

/** Render a stored accelerator for display, e.g. `"CmdOrCtrl+Shift+Digit1"` -> `"Ctrl+Shift+1"`. */
export function formatAcceleratorForDisplay(accelerator: string): string {
  return accelerator
    .split("+")
    .map((part) => {
      if (part === "CmdOrCtrl") return "Ctrl";
      const keyMatch = /^Key([A-Z])$/.exec(part);
      if (keyMatch) return keyMatch[1];
      const digitMatch = /^Digit([0-9])$/.exec(part);
      if (digitMatch) return digitMatch[1];
      return part; // Alt, Shift, F1..F12
    })
    .join("+");
}
