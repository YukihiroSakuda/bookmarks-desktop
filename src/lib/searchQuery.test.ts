import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "./searchNormalize";
import { buildQueryTerms, matchesAllTerms, splitSearchTerms } from "./searchQuery";

const matches = (fields: string[], query: string) =>
  matchesAllTerms(fields.map(normalizeForSearch), buildQueryTerms(query));

describe("splitSearchTerms", () => {
  it("splits on spaces, including the full-width space an IME types", () => {
    expect(splitSearchTerms("見積　2026  final")).toEqual(["見積", "2026", "final"]);
  });

  it("keeps a quoted phrase together", () => {
    expect(splitSearchTerms('"release notes" 2026')).toEqual(["release notes", "2026"]);
    expect(splitSearchTerms("“release   notes”")).toEqual(["release notes"]);
  });

  it("runs an unclosed quote to the end", () => {
    expect(splitSearchTerms('docs "getting started')).toEqual(["docs", "getting started"]);
  });

  it("ignores empty quotes and blank input", () => {
    expect(splitSearchTerms('"" ')).toEqual([]);
    expect(splitSearchTerms("   ")).toEqual([]);
  });
});

describe("matchesAllTerms", () => {
  it("requires every term, in any order", () => {
    expect(matches(["Actions · GitHub"], "github actions")).toBe(true);
    expect(matches(["Actions · GitHub"], "github pages")).toBe(false);
  });

  it("lets each term match a different field", () => {
    expect(matches(["React docs", "https://github.com/facebook/react"], "github docs")).toBe(true);
  });

  it("still finds what a whole-string match found", () => {
    expect(matches(["2026 見積書"], "2026 見積")).toBe(true);
  });

  it("applies the romaji/kana forms to each term separately", () => {
    expect(matches(["パソコンショップ"], "shoppu pasokon")).toBe(true);
  });

  it("matches a quoted phrase only side by side", () => {
    expect(matches(["release notes"], '"release notes"')).toBe(true);
    expect(matches(["notes on the release"], '"release notes"')).toBe(false);
    expect(matches(["notes on the release"], "release notes")).toBe(true);
  });

  it("matches everything for a blank query", () => {
    expect(matches(["anything"], "  ")).toBe(true);
  });
});
