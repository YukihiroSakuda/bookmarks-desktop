const TOKEN_STORAGE_KEY = "apiToken";

let cachedToken: string | null = null;

async function fetchToken(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/pair`);
  if (!res.ok) throw new Error(`Pairing failed: HTTP ${res.status}`);
  const body = (await res.json()) as { token: string };
  return body.token;
}

/** Returns the cached pairing token, fetching and persisting a new one on first use. */
export async function getToken(baseUrl: string): Promise<string> {
  if (cachedToken) return cachedToken;

  const stored = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
  if (stored[TOKEN_STORAGE_KEY]) {
    cachedToken = stored[TOKEN_STORAGE_KEY] as string;
    return cachedToken;
  }

  const token = await fetchToken(baseUrl);
  cachedToken = token;
  await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
  return token;
}

/** Drops the cached/stored token so the next request re-pairs from scratch. */
export async function clearToken(): Promise<void> {
  cachedToken = null;
  await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
}
