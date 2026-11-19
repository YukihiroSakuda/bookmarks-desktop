import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the frontend's pure logic (search, sorting, import, shared
// form helpers). Anything that needs the Tauri webview is out of reach here.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
