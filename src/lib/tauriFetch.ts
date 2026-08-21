import { invoke } from "@tauri-apps/api/core";

/**
 * Minimal `fetch`-compatible adapter that routes the app's `/api/*` calls to
 * Tauri commands (Rust backend) instead of HTTP. Only the subset of the Fetch
 * API actually used by the app is implemented (`ok`, `status`, `json()`), so
 * existing hooks keep working with near-zero changes.
 */
type FetchLike = {
  ok: boolean;
  status: number;
  // Mirror the native `fetch` Response.json() signature (Promise<any>) so the
  // existing call sites that consume the parsed body keep type-checking.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: () => Promise<any>;
};

function ok(data: unknown): FetchLike {
  return { ok: true, status: 200, json: async () => data };
}

function fail(message: string): FetchLike {
  return { ok: false, status: 500, json: async () => ({ error: message }) };
}

async function dispatch(
  seg: string[],
  method: string,
  body: Record<string, unknown> | undefined,
  query: URLSearchParams
): Promise<unknown> {
  // seg[0] === "api"
  const [, a, b, c] = seg;

  if (a === "bookmarks") {
    if (b === undefined) {
      if (method === "GET") return invoke("list_bookmarks");
      if (method === "POST") return invoke("create_bookmark", { data: body });
      if (method === "DELETE") return invoke("delete_all_bookmarks");
    } else if (b === "reorder") {
      return invoke("reorder_bookmarks", { order: body?.order });
    } else if (b === "title") {
      return invoke("fetch_title", { url: query.get("url") ?? "" });
    } else {
      const id = b;
      if (c === "pin") return invoke("toggle_pin", { id });
      if (c === "access") return invoke("increment_access", { id });
      if (c === "favicon") return invoke("fetch_favicon", { id, url: body?.url });
      if (c === undefined) {
        if (method === "PUT" || method === "PATCH")
          return invoke("update_bookmark", { id, data: body });
        if (method === "DELETE") return invoke("delete_bookmark", { id });
      }
    }
  }

  if (a === "favicons") {
    if (b === "missing") return invoke("count_missing_favicons");
    if (b === "fetch-missing") return invoke("fetch_missing_favicons");
    if (b === "cancel") return invoke("cancel_fetch_favicons");
  }

  if (a === "folder-search") {
    return invoke("search_in_folders", { query: query.get("q") ?? "" });
  }

  if (a === "tags") {
    if (b === undefined) {
      if (method === "GET") return invoke("list_tags");
      if (method === "POST")
        return invoke("create_tag", { name: body?.name, color: body?.color ?? null });
      if (method === "DELETE") return invoke("delete_all_tags");
    } else if (b === "reorder") {
      return invoke("reorder_tags", { order: body?.order });
    } else {
      const id = b;
      if (method === "PUT" || method === "PATCH") {
        // A tag update carries either a rename or a color change, never both.
        if (body && "color" in body)
          return invoke("set_tag_color", { id, color: body.color ?? null });
        return invoke("update_tag", { id, name: body?.name });
      }
      if (method === "DELETE") return invoke("delete_tag", { id });
    }
  }

  if (a === "tag-rules") {
    if (b === undefined) {
      if (method === "GET") return invoke("list_tag_rules");
      if (method === "POST") return invoke("create_tag_rule", { data: body });
    } else {
      const id = b;
      if (method === "DELETE") return invoke("delete_tag_rule", { id });
    }
  }

  if (a === "settings") {
    if (method === "GET") return invoke("get_settings");
    if (method === "PUT") return invoke("update_settings", { data: body });
  }

  throw new Error(`Unhandled API route: ${method} /${seg.join("/")}`);
}

export async function tauriFetch(input: string, init?: RequestInit): Promise<FetchLike> {
  const method = (init?.method ?? "GET").toUpperCase();
  let body: Record<string, unknown> | undefined;
  if (typeof init?.body === "string") {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = undefined;
    }
  }

  const [rawPath, queryString] = input.split("?");
  const query = new URLSearchParams(queryString ?? "");
  const path = rawPath.replace(/\/$/, "");
  const seg = path.split("/").filter(Boolean);

  try {
    const data = await dispatch(seg, method, body, query);
    return ok(data);
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
