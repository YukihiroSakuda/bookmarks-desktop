/**
 * Supabase auth 用の chrome.storage.local アダプタ
 *
 * Supabase の SupportedStorage は同期的な getItem/setItem/removeItem を要求するが、
 * chrome.storage.local は非同期 API のみ提供する。
 * このアダプタはインメモリキャッシュで同期的に応答し、
 * バックグラウンドで chrome.storage.local に永続化する。
 */

const STORAGE_KEY_PREFIX = "sb-";
let cache: Record<string, string> = {};
let initialized = false;

/**
 * chrome.storage.local からキャッシュを初期化する。
 * Supabase クライアント作成前に await する必要がある。
 */
export async function initStorage(): Promise<void> {
  if (initialized) return;
  const result = await chrome.storage.local.get(null);
  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith(STORAGE_KEY_PREFIX) && typeof value === "string") {
      cache[key] = value;
    }
  }
  initialized = true;
}

export const chromeStorageAdapter = {
  getItem(key: string): string | null {
    return cache[key] ?? null;
  },

  setItem(key: string, value: string): void {
    cache[key] = value;
    chrome.storage.local.set({ [key]: value });
  },

  removeItem(key: string): void {
    delete cache[key];
    chrome.storage.local.remove(key);
  },
};
