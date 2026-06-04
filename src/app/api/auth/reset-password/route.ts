import { createClient } from "@supabase/supabase-js";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return Response.json({ error: "Supabase não configurado." }, { status: 503 });

  let email = "";
  try {
    const body = await request.json() as { email?: unknown };
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return Response.json({ error: "Dados inválidos." }, { status: 400 });
  }
  if (!email.includes("@")) return Response.json({ error: "Informe um e-mail válido." }, { status: 400 });

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  await client.auth.resetPasswordForEmail(email, {
    redirectTo: new URL("/", request.url).toString(),
  });

  // Do not reveal whether the account exists.
  return Response.json({ success: true });
}
