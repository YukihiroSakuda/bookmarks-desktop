import { describe, expect, it } from "vitest";
import { eventToAccelerator, formatAcceleratorForDisplay } from "./shortcut";

const key = (code: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods }) as KeyboardEvent;

describe("eventToAccelerator", () => {
  it("builds a Tauri accelerator from modifiers and the physical key", () => {
    expect(eventToAccelerator(key("Digit1", { ctrlKey: true, shiftKey: true }))).toBe(
      "CmdOrCtrl+Shift+Digit1"
    );
    expect(eventToAccelerator(key("KeyK", { altKey: true }))).toBe("Alt+KeyK");
    expect(eventToAccelerator(key("F12", { metaKey: true }))).toBe("CmdOrCtrl+F12");
  });

  it("rejects a key without a modifier", () => {
    expect(eventToAccelerator(key("KeyK"))).toBeNull();
  });

  it("rejects a lone modifier and unsupported keys", () => {
    expect(eventToAccelerator(key("ControlLeft", { ctrlKey: true }))).toBeNull();
    expect(eventToAccelerator(key("BracketLeft", { ctrlKey: true }))).toBeNull();
  });
});

describe("formatAcceleratorForDisplay", () => {
  it("shows the keys the way they are printed on the keyboard", () => {
    expect(formatAcceleratorForDisplay("CmdOrCtrl+Shift+Digit1")).toBe("Ctrl+Shift+1");
    expect(formatAcceleratorForDisplay("Alt+KeyK")).toBe("Alt+K");
    expect(formatAcceleratorForDisplay("CmdOrCtrl+Alt+Space")).toBe("Ctrl+Alt+Space");
  });
});
