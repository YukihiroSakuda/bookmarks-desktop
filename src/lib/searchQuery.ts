import { buildQueryForms } from "./searchNormalize";

/**
 * How the search box reads what is typed into it — shared by the bookmark
 * filter (`useBookmarkFiltering`) and the folder search (`useFolderSearch`),
 * so both halves of one search follow the same rule.
 *
 * Whitespace separates terms, and a result must contain **every** term (AND),
 * in any order and in any of the searched fields: `github actions` finds
 * "Actions · GitHub", and `見積 2026` finds `2026_見積書.xlsx`. Quotes keep a
 * phrase together: `"release notes"` only matches those words side by side.
 *
 * A single word behaves exactly as before, and AND never hides a result the
 * old whole-string match would have shown — it only finds more.
 *
 * The Rust side splits the same way for callers that send only the raw query
 * (`split_search_terms` in `src-tauri/src/folder_search.rs`) — keep the two
 * in step.
 */

/** Straight, full-width and curly double quotes all open or close a phrase. */
const QUOTE = /["＂“”]/u;
const SPACE = /\s/u;

/**
 * The terms in a search box entry. Whitespace — the full-width space an IME
 * types included — separates them; text in quotes stays one term. An
 * unclosed quote runs to the end.
 */
export function splitSearchTerms(raw: string): string[] {
  const terms: string[] = [];
  let current = "";
  let quoted = false;

  const flush = () => {
    const term = current.replace(/\s+/gu, " ").trim();
    if (term) terms.push(term);
    current = "";
  };

  for (const char of raw) {
    if (QUOTE.test(char)) {
      flush();
      quoted = !quoted;
    } else if (!quoted && SPACE.test(char)) {
      flush();
    } else {
      current += char;
    }
  }
  flush();
  return terms;
}

/**
 * Each term's search forms (see `buildQueryForms`: plain, romaji→kana,
 * kana→romaji). An empty list means a blank query, which matches everything.
 */
export function buildQueryTerms(raw: string): string[][] {
  return splitSearchTerms(raw)
    .map((term) => buildQueryForms(term).filter((form) => form !== ""))
    .filter((forms) => forms.length > 0);
}

/**
 * True when every term has a form contained in at least one of `fields`
 * (each already run through `normalizeForSearch`).
 */
export function matchesAllTerms(fields: string[], terms: string[][]): boolean {
  return terms.every((forms) =>
    forms.some((form) => fields.some((field) => field.includes(form)))
  );
}
