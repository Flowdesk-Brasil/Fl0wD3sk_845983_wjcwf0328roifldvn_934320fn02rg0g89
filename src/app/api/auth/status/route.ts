import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return Response.json({ mode: "local", hasUsers: true, schemaReady: true });
  }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const [{ data: users, error: usersError }, profiles, settings, payments, contracts, classes] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1 }),
    admin.from("profiles").select("active").limit(1),
    admin.from("settings").select("id").limit(1),
    admin.from("payments").select("provider_payment_id").limit(1),
    admin.from("contracts").select("signature_data").limit(1),
    admin.from("class_sessions").select("id, start_at, capacity").limit(1),
  ]);

  return Response.json({
    mode: "supabase",
    hasUsers: !usersError && Boolean(users.users.length),
    schemaReady: !profiles.error && !settings.error,
    operationsReady: !payments.error && !contracts.error && !classes.error,
  });
}
