import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const hasSupabaseEnvironment = Boolean(supabaseUrl && supabaseAnonKey);
const explicitLocalData = process.env.NEXT_PUBLIC_USE_LOCAL_DATA === "true";

export const useLocalData = explicitLocalData || (!hasSupabaseEnvironment && process.env.NODE_ENV !== "production");

export function shouldUseLocalData() {
  return useLocalData;
}

export const supabase = createClient(
  supabaseUrl || "https://local.corpoevolucao.invalid",
  supabaseAnonKey || "local-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
