/**
 * Content Script: Web アプリのページに注入され、
 * Supabase セッションを拡張機能に同期する。
 */

function findSupabaseSessionKey(): string | null {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("sb-") && key.endsWith("-auth-token")) {
      return key;
    }
  }
  return null;
}

function syncSession(): void {
  const key = findSupabaseSessionKey();
  if (!key) return;

  const value = localStorage.getItem(key);
  if (value) {
    chrome.runtime.sendMessage({
      type: "SYNC_SESSION",
      key,
      value,
    });
  }
}

// ページロード時に同期
syncSession();

// localStorage の変更を監視 (別タブでのログイン/ログアウト検出)
window.addEventListener("storage", (e) => {
  if (e.key && e.key.startsWith("sb-") && e.key.endsWith("-auth-token")) {
    if (e.newValue) {
      chrome.runtime.sendMessage({
        type: "SYNC_SESSION",
        key: e.key,
        value: e.newValue,
      });
    } else {
      chrome.runtime.sendMessage({
        type: "CLEAR_SESSION",
        key: e.key,
      });
    }
  }
});

// Supabase のセッション更新を検出するため、setItem を監視
const originalSetItem = localStorage.setItem.bind(localStorage);
localStorage.setItem = function (key: string, value: string) {
  originalSetItem(key, value);
  if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
    chrome.runtime.sendMessage({
      type: "SYNC_SESSION",
      key,
      value,
    });
  }
};

const originalRemoveItem = localStorage.removeItem.bind(localStorage);
localStorage.removeItem = function (key: string) {
  originalRemoveItem(key);
  if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
    chrome.runtime.sendMessage({
      type: "CLEAR_SESSION",
      key,
    });
  }
};
