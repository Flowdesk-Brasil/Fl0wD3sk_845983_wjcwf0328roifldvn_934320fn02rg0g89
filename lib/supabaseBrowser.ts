import { createClient } from "@supabase/supabase-js";

const VPS_URL = "https://flowdesk.db.flwdesk.com";
const VPS_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkwMDI5NjAwLCJleHAiOjE5NDc3MDk2MDB9.yPgutsfUlQPS6mjSegQU8MRTaPNK9cKqJiSopVh0GDA";

function isLegacySupabaseHost(url?: string) {
  if (!url) return true;
  return url.includes("supabase.co") || url.includes("2.25.237.179");
}

const configuredSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const supabaseUrl = isLegacySupabaseHost(configuredSupabaseUrl) ? VPS_URL : configuredSupabaseUrl;
const supabaseAnonKey =
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || isLegacySupabaseHost(configuredSupabaseUrl)
    ? VPS_ANON_KEY
    : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.trim();

if (!configuredSupabaseUrl || !supabaseAnonKey) {
  console.warn(
    "[supabaseBrowser] NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY ausente. Recursos do Supabase no navegador podem ficar indisponiveis.",
  );
}

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey || "missing", {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});
