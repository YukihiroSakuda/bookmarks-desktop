import { toHiragana, toRomaji } from "wanakana";

/**
 * Normalizes text for substring search: NFKC folds full-width alphanumerics
 * to half-width, then katakana (U+30A1-30F6) is shifted to hiragana. Only
 * touches those two ranges — Latin letters and kanji pass through untouched,
 * so this is safe to run on arbitrary target text (titles, URLs, memos)
 * without risk of mangling English content.
 */
export function normalizeForSearch(text: string): string {
  const folded = text.normalize("NFKC").toLowerCase();
  let result = "";
  for (const char of folded) {
    const code = char.codePointAt(0)!;
    result += code >= 0x30a1 && code <= 0x30f6
      ? String.fromCodePoint(code - 0x60)
      : char;
  }
  return result;
}

/**
 * Query-side forms to test a target against. Besides the plain normalized
 * query, includes:
 * - a romaji/katakana-to-hiragana conversion, so typing "pasokon" (IME off)
 *   matches a target containing "パソコン" or "ぱそこん";
 * - a kana-to-romaji conversion, so typing "あまぞん" (IME on) matches a
 *   target containing "Amazon".
 * Converting only the *query* — never the target — is deliberate: running
 * kana conversion on arbitrary target text risks mangling real English words
 * (e.g. "github" -> garbled kana). Both wanakana conversions already leave
 * text in the "wrong" script untouched (toHiragana passes kanji through,
 * toRomaji passes kanji/romaji through), so this never loses the plain form.
 */
export function buildQueryForms(rawQuery: string): string[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [""];
  const forms = [
    normalizeForSearch(trimmed),
    normalizeForSearch(toHiragana(trimmed, { passRomaji: false })),
    normalizeForSearch(toRomaji(trimmed)),
  ];
  return Array.from(new Set(forms));
}

/** True if `target` (already run through `normalizeForSearch`) contains any query form. */
export function matchesAnyForm(target: string, forms: string[]): boolean {
  return forms.some((form) => form === "" || target.includes(form));
}
