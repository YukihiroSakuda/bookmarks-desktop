import { describe, expect, it } from "vitest";
import { buildQueryForms, matchesAnyForm, normalizeForSearch } from "./searchNormalize";

const matches = (target: string, query: string) =>
  matchesAnyForm(normalizeForSearch(target), buildQueryForms(query));

describe("normalizeForSearch", () => {
  it("folds full-width alphanumerics and case", () => {
    expect(normalizeForSearch("ＧｉｔＨｕｂ１２３")).toBe("github123");
  });

  it("shifts katakana to hiragana and leaves kanji alone", () => {
    expect(normalizeForSearch("パソコン設定")).toBe("ぱそこん設定");
  });
});

describe("search matching", () => {
  it("matches romaji typed with the IME off against katakana", () => {
    expect(matches("パソコンの設定", "pasokon")).toBe(true);
  });

  it("matches kana typed with the IME on against latin text", () => {
    expect(matches("Amazon", "あまぞん")).toBe(true);
  });

  it("matches full-width input against half-width text", () => {
    expect(matches("GitHub", "ｇｉｔ")).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matches("GitHub", "gitlab")).toBe(false);
  });

  it("matches everything for an empty or blank query", () => {
    expect(matches("anything", "")).toBe(true);
    expect(matches("anything", "   ")).toBe(true);
  });
});
