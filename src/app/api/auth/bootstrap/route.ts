import { createClient } from "@supabase/supabase-js";

function fail(error: string, status: number) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return fail("Supabase administrativo não configurado.", 503);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: existing, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (listError) return fail("Não foi possível validar o primeiro acesso.", 503);
  if (existing.users.length) return fail("O administrador inicial já foi criado.", 409);

  let body: { fullName?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Dados inválidos.", 400);
  }

  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (fullName.length < 3 || !email.includes("@") || password.length < 8) {
    return fail("Informe nome, e-mail válido e senha com pelo menos 8 caracteres.", 400);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) return fail(createError?.message ?? "Não foi possível criar o administrador.", 400);

  const { error: profileError } = await admin.from("profiles").upsert({
    id: created.user.id,
    full_name: fullName,
    email,
    role: "admin",
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id);
    return fail("O Auth foi configurado, mas o perfil não pôde ser criado. Execute a migração do banco.", 500);
  }

  return Response.json({ success: true }, { status: 201 });
}
