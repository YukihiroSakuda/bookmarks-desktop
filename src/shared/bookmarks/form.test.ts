import { describe, expect, it } from "vitest";
import {
  detectKind,
  findDuplicateBookmark,
  getAutoTagNames,
  mergeBookmarkTags,
  normalizeLocalPath,
  pathBasename,
  TagRuleLike,
} from "./form";

describe("detectKind", () => {
  it.each([
    ["C:\\Users\\me\\doc.xlsx", "path"],
    ["D:/projects", "path"],
    ["\\\\server\\share\\file.txt", "path"],
    ["file:///C:/dir", "path"],
    ["https://example.com", "url"],
    ["example.com", "url"],
  ])("%s is a %s", (value, kind) => {
    expect(detectKind(value)).toBe(kind);
  });
});

describe("normalizeLocalPath", () => {
  it("treats file URLs, separators, case and trailing slashes alike", () => {
    expect(normalizeLocalPath("file:///C:/My%20Docs/")).toBe("c:\\my docs");
    expect(normalizeLocalPath("C:\\My Docs\\")).toBe("c:\\my docs");
  });
});

describe("pathBasename", () => {
  it("returns the last segment of a path", () => {
    expect(pathBasename("C:\\a\\b\\report.pdf")).toBe("report.pdf");
    expect(pathBasename("C:\\a\\folder\\")).toBe("folder");
  });
});

describe("findDuplicateBookmark", () => {
  const saved = [
    { id: "web", url: "https://Example.com/page/" },
    { id: "dir", url: "C:\\Work\\Specs" },
  ];

  it("matches web URLs ignoring case and a trailing slash", () => {
    expect(findDuplicateBookmark(saved, "https://example.com/page")?.id).toBe("web");
  });

  it("matches local paths written differently", () => {
    expect(findDuplicateBookmark(saved, "file:///c:/work/specs/")?.id).toBe("dir");
  });

  it("finds nothing for a new URL", () => {
    expect(findDuplicateBookmark(saved, "https://example.com/other")).toBeUndefined();
  });
});

describe("getAutoTagNames", () => {
  const tags = [
    { id: "t-docs", name: "docs" },
    { id: "t-gh", name: "github" },
  ];
  const rules: TagRuleLike[] = [
    { pattern: "github.com", tagId: "t-gh", targetField: "url", matchType: "contains" },
    { pattern: "guide", tagId: "t-docs", targetField: "title", matchType: "ends_with" },
  ];

  it("applies every matching rule, case-insensitively", () => {
    expect(
      getAutoTagNames(rules, tags, { title: "Setup GUIDE", url: "https://GitHub.com/x" })
    ).toEqual(["docs", "github"]);
  });

  it("returns nothing when no rule matches", () => {
    expect(getAutoTagNames(rules, tags, { title: "Home", url: "https://example.com" })).toEqual([]);
  });
});

describe("mergeBookmarkTags", () => {
  it("keeps manual tags first and drops duplicates", () => {
    expect(mergeBookmarkTags(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });
});
