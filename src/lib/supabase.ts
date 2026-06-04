import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const useLocalData =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes("dummy.supabase.co") ||
  supabaseAnonKey === "dummy";

export function shouldUseLocalData() {
  if (useLocalData) return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("corpoevolucao_data_mode") === "local";
}

export const supabase = createClient(
  useLocalData ? "https://dummy.supabase.co" : supabaseUrl,
  useLocalData ? "dummy" : supabaseAnonKey,
  {
    auth: {
      persistSession: !useLocalData,
      autoRefreshToken: !useLocalData,
      detectSessionInUrl: !useLocalData,
    },
  },
);
