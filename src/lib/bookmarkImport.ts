import {
  detectKind,
  isHttpUrl,
  normalizeBookmarkUrl,
  normalizeLocalPath,
} from "@/shared/bookmarks/form";

/** One `<a>` read out of a browser's bookmark HTML export. */
export interface ImportLink {
  url: string;
  title: string;
  /** The `ADD_DATE` attribute as written: seconds since the Unix epoch. */
  addDate?: string | null;
}

export interface PlannedImport {
  url: string;
  title: string;
  /** ISO timestamp from `ADD_DATE`, when the file carries a usable one. */
  createdAt?: string;
}

export interface ImportPlan {
  toCreate: PlannedImport[];
  /** Links left out because the URL is already saved or appears earlier in the file. */
  duplicates: number;
}

/**
 * Bookmarklets and Firefox's smart-folder queries only mean something inside
 * the browser that made them; outside it they open nothing.
 */
const BROWSER_ONLY_SCHEME = /^(javascript|place):/i;

/**
 * Key two URLs share when the app treats them as the same bookmark — the same
 * comparison as `findDuplicateBookmark`, but as a value, so a whole export can
 * be checked against a Set instead of rescanning the list for every link.
 */
export function duplicateKey(url: string): string {
  if (detectKind(url) === "path") return `path:${normalizeLocalPath(url)}`;
  if (isHttpUrl(url)) return `url:${normalizeBookmarkUrl(url)}`;
  return `raw:${url.trim()}`;
}

/** `ADD_DATE` (seconds since the epoch) as an ISO timestamp, or undefined. */
export function parseAddDate(raw: string | null | undefined): string | undefined {
  if (!raw || !/^\d+$/.test(raw.trim())) return undefined;
  const ms = Number(raw.trim()) * 1000;
  const date = new Date(ms);
  // Year 1990–9999: rejects 0 and values written in another unit (Chrome's
  // internal microsecond timestamps would land far in the future).
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 1990 || date.getUTCFullYear() > 9999) {
    return undefined;
  }
  return date.toISOString();
}

/**
 * Decide which links of an export to create. A link is skipped when its URL
 * is already saved, or when the same URL came earlier in the file — browsers
 * export one entry per folder, so a page filed in two folders appears twice.
 */
export function planBookmarkImport(
  links: ImportLink[],
  existing: { url: string }[]
): ImportPlan {
  const seen = new Set(existing.map((bookmark) => duplicateKey(bookmark.url)));
  const toCreate: PlannedImport[] = [];
  let duplicates = 0;

  for (const link of links) {
    const url = link.url.trim();
    if (!url || BROWSER_ONLY_SCHEME.test(url)) continue;

    const key = duplicateKey(url);
    if (seen.has(key)) {
      duplicates++;
      continue;
    }
    seen.add(key);

    toCreate.push({
      url,
      title: link.title.trim() || url,
      createdAt: parseAddDate(link.addDate),
    });
  }

  return { toCreate, duplicates };
}

/** Every link in a Netscape-format bookmark file (what all browsers export). */
export function extractLinksFromHtml(html: string): ImportLink[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return Array.from(doc.getElementsByTagName("a")).map((a) => ({
    // The attribute as written: `a.href` would resolve it against the page.
    url: a.getAttribute("href") ?? "",
    title: a.textContent ?? "",
    addDate: a.getAttribute("add_date"),
  }));
}
