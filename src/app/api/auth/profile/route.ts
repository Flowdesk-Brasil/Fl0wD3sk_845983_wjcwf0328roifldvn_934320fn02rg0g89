import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !anonKey || !serviceKey) return Response.json({ error: "Backend não configurado." }, { status: 503 });
  if (!token) return Response.json({ error: "Não autenticado." }, { status: 401 });

  const auth = createClient(url, anonKey, { auth: { persistSession: false } });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authenticated, error: authError } = await auth.auth.getUser(token);
  if (authError || !authenticated.user) return Response.json({ error: "Sessão inválida." }, { status: 401 });

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", authenticated.user.id)
    .single();
  if (profileError || !profile) return Response.json({ error: "Perfil não encontrado." }, { status: 404 });

  return Response.json({ profile });
}
