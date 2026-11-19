import { describe, expect, it } from "vitest";
import { BookmarkUI } from "@/types/bookmark";
import { createBookmarkFilter, searchableFields } from "./bookmarkFilter";
import { TagMatchMode } from "./tagMatchMode";

function bookmark(overrides: Partial<BookmarkUI>): BookmarkUI {
  return {
    id: "id",
    kind: "url",
    title: "Title",
    url: "https://example.com",
    tags: [],
    isPinned: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    accessCount: 0,
    ...overrides,
  };
}

const shown = (b: BookmarkUI, query: string, tags: string[] = [], mode: TagMatchMode = "any") =>
  createBookmarkFilter(query, tags, mode)(searchableFields(b), b.tags);

describe("createBookmarkFilter", () => {
  it("matches the URL and the memo, not only the title", () => {
    // Drag-to-reorder used to test the title alone, so a card shown because
    // its URL matched was missing from the reorder's idea of the list.
    expect(shown(bookmark({ url: "https://github.com/x" }), "github")).toBe(true);
    expect(shown(bookmark({ memo: "weekly report" }), "weekly")).toBe(true);
  });

  it("requires every search term", () => {
    const b = bookmark({ title: "React docs", url: "https://react.dev" });
    expect(shown(b, "react docs")).toBe(true);
    expect(shown(b, "react vue")).toBe(false);
  });

  it("combines selected tags with any or all", () => {
    const b = bookmark({ tags: ["work", "docs"] });
    expect(shown(b, "", ["work", "personal"], "any")).toBe(true);
    expect(shown(b, "", ["work", "personal"], "all")).toBe(false);
    expect(shown(b, "", ["work", "docs"], "all")).toBe(true);
  });

  it("requires both the search and the tags", () => {
    const b = bookmark({ title: "React docs", tags: ["work"] });
    expect(shown(b, "react", ["personal"])).toBe(false);
    expect(shown(b, "react", ["work"])).toBe(true);
  });

  it("shows everything with no search and no tags", () => {
    expect(shown(bookmark({}), "", [], "all")).toBe(true);
  });
});
