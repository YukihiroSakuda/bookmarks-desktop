import { describe, expect, it } from "vitest";
import { duplicateKey, parseAddDate, planBookmarkImport } from "./bookmarkImport";

describe("parseAddDate", () => {
  it("reads seconds since the epoch", () => {
    expect(parseAddDate("1700000000")).toBe("2023-11-14T22:13:20.000Z");
  });

  it.each([null, undefined, "", "abc", "0", "-5", "13300000000000000"])(
    "rejects %s",
    (raw) => {
      expect(parseAddDate(raw)).toBeUndefined();
    }
  );
});

describe("duplicateKey", () => {
  it("treats web URLs the same way the add form's duplicate warning does", () => {
    expect(duplicateKey("https://Example.com/a/")).toBe(duplicateKey("https://example.com/a"));
  });

  it("treats a file URL and the plain path as the same bookmark", () => {
    expect(duplicateKey("file:///C:/Docs/")).toBe(duplicateKey("C:\\docs"));
  });
});

describe("planBookmarkImport", () => {
  it("skips URLs that are already saved", () => {
    const plan = planBookmarkImport(
      [
        { url: "https://example.com/", title: "Example" },
        { url: "https://new.example", title: "New" },
      ],
      [{ url: "https://EXAMPLE.com" }]
    );
    expect(plan.toCreate.map((p) => p.url)).toEqual(["https://new.example"]);
    expect(plan.duplicates).toBe(1);
  });

  it("imports a URL filed in several folders only once", () => {
    const link = { url: "https://example.com", title: "Example" };
    const plan = planBookmarkImport([link, link, { ...link, url: "https://example.com/" }], []);
    expect(plan.toCreate).toHaveLength(1);
    expect(plan.duplicates).toBe(2);
  });

  it("carries ADD_DATE through as the creation date", () => {
    const plan = planBookmarkImport(
      [{ url: "https://example.com", title: "Example", addDate: "1700000000" }],
      []
    );
    expect(plan.toCreate[0].createdAt).toBe("2023-11-14T22:13:20.000Z");
  });

  it("drops bookmarklets, browser queries and empty links", () => {
    const plan = planBookmarkImport(
      [
        { url: "javascript:alert(1)", title: "Bookmarklet" },
        { url: "place:sort=8&maxResults=10", title: "Recent Tags" },
        { url: "  ", title: "Empty" },
      ],
      []
    );
    expect(plan.toCreate).toEqual([]);
    expect(plan.duplicates).toBe(0);
  });

  it("falls back to the URL when a link has no text", () => {
    const plan = planBookmarkImport([{ url: "https://example.com", title: "  " }], []);
    expect(plan.toCreate[0].title).toBe("https://example.com");
  });
});
