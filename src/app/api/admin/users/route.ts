import { createClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types";

const allowedRoles = new Set<UserRole>(["admin", "receptionist", "professor"]);

function error(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) return error("Backend não configurado.", 503);

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return error("Não autenticado.", 401);
  if (!serviceKey) return error("Backend administrativo não configurado.", 503);

  const authClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const adminClient = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !authData.user) return error("Sessão inválida.", 401);

  const { data: caller } = await adminClient
    .from("profiles")
    .select("role, active")
    .eq("id", authData.user.id)
    .single();
  if (!caller?.active || caller.role !== "admin") return error("Acesso negado.", 403);

  let body: { full_name?: unknown; email?: unknown; password?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Corpo da requisição inválido.", 400);
  }

  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const role = body.role as UserRole;
  if (fullName.length < 3 || !email.includes("@") || password.length < 8 || !allowedRoles.has(role)) {
    return error("Revise nome, e-mail, senha e perfil de acesso.", 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) return error("Não foi possível criar o usuário.", 400);

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .update({ full_name: fullName, email, role, active: true })
    .eq("id", created.user.id)
    .select("id, full_name, email, role, active, created_at")
    .single();

  if (profileError || !profile) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    return error("Não foi possível provisionar o perfil.", 500);
  }

  return Response.json({ profile }, { status: 201 });
}
