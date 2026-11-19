import { describe, expect, it } from "vitest";
import { BookmarkUI } from "@/types/bookmark";
import { createBookmarkComparator, recencyScore } from "./bookmarkScore";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 10, 19);

function bookmark(overrides: Partial<BookmarkUI>): BookmarkUI {
  return {
    id: "id",
    kind: "url",
    title: "Title",
    url: "https://example.com",
    tags: [],
    isPinned: false,
    createdAt: new Date(NOW).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    accessCount: 0,
    ...overrides,
  };
}

const daysAgo = (days: number) => new Date(NOW - days * DAY).toISOString();

describe("recencyScore", () => {
  it("halves every 30 days since the last access", () => {
    const b = bookmark({ accessCount: 3, lastAccessedAt: daysAgo(30) });
    expect(recencyScore(b, NOW)).toBeCloseTo(2);
  });

  it("gives an unopened bookmark a base of 1 from its creation date", () => {
    expect(recencyScore(bookmark({ createdAt: daysAgo(0) }), NOW)).toBeCloseTo(1);
  });

  it("ranks five opens this week above two hundred six months ago", () => {
    const recent = bookmark({ accessCount: 5, lastAccessedAt: daysAgo(3) });
    const stale = bookmark({ accessCount: 200, lastAccessedAt: daysAgo(180) });
    expect(recencyScore(recent, NOW)).toBeGreaterThan(recencyScore(stale, NOW));
  });

  it("treats a future timestamp as now rather than inflating the score", () => {
    const b = bookmark({ accessCount: 1, lastAccessedAt: daysAgo(-10) });
    expect(recencyScore(b, NOW)).toBeCloseTo(2);
  });
});

describe("createBookmarkComparator", () => {
  const a = bookmark({ id: "a", title: "Alpha", createdAt: daysAgo(2), customOrder: 2 });
  const b = bookmark({ id: "b", title: "Beta", createdAt: daysAgo(1), customOrder: 1 });
  const ids = (list: BookmarkUI[]) => list.map((x) => x.id);

  it("sorts by title in both directions", () => {
    expect(ids([b, a].sort(createBookmarkComparator("title", "asc")))).toEqual(["a", "b"]);
    expect(ids([a, b].sort(createBookmarkComparator("title", "desc")))).toEqual(["b", "a"]);
  });

  it("sorts by date added", () => {
    expect(ids([b, a].sort(createBookmarkComparator("createdAt", "asc")))).toEqual(["a", "b"]);
  });

  it("ignores the direction for the manual order", () => {
    expect(ids([a, b].sort(createBookmarkComparator("custom", "desc")))).toEqual(["b", "a"]);
    expect(ids([a, b].sort(createBookmarkComparator("custom", "asc")))).toEqual(["b", "a"]);
  });
});
