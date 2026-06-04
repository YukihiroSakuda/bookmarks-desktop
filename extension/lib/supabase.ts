import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { chromeStorageAdapter, initStorage } from "./chromeStorageAdapter";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

let _supabase: SupabaseClient | null = null;

/**
 * chrome.storage.local を初期化してから Supabase クライアントを返す。
 * 初回呼び出し時にストレージキャッシュをロードする。
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (_supabase) return _supabase;

  await initStorage();

  _supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      storage: chromeStorageAdapter,
    },
  });

  return _supabase;
}
