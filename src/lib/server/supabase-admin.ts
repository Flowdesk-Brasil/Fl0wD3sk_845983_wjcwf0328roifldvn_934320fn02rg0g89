import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { UserRole } from "@/lib/types";

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function environment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !anonKey || !serviceKey) throw new ApiError("Backend administrativo não configurado.", 503);
  return { url, anonKey, serviceKey };
}

export function getAdminClient(): SupabaseClient {
  const { url, serviceKey } = environment();
  return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireRole(request: Request, roles: UserRole[]) {
  const { url, anonKey } = environment();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new ApiError("Não autenticado.", 401);

  const auth = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authenticated, error: authError } = await auth.auth.getUser(token);
  if (authError || !authenticated.user) throw new ApiError("Sessão inválida.", 401);

  const admin = getAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, full_name, email, role, active")
    .eq("id", authenticated.user.id)
    .single();
  if (profileError || !profile?.active) throw new ApiError("Perfil inativo ou não encontrado.", 403);
  if (!roles.includes(profile.role as UserRole)) throw new ApiError("Acesso negado.", 403);

  return { admin, user: authenticated.user, profile };
}

export function apiErrorResponse(reason: unknown) {
  const status = reason instanceof ApiError ? reason.status : 500;
  const message = reason instanceof Error ? reason.message : "Erro interno do servidor.";
  return Response.json({ error: message }, { status });
}
