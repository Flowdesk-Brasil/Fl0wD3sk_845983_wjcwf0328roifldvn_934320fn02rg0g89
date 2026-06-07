import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUserFromSessionCookie();
    if (!user) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
      );
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const { data, error } = await supabase
      .from("hosting_projects")
      .select("id, vps_code, status, runtime_status, billing_status, github_repo, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(12);

    if (error) throw new Error(error.message);

    const projects = (data || []).map((project) => ({
      id: project.id,
      vps_code: project.vps_code,
      status: project.runtime_status || project.status || project.billing_status,
      github_repo: project.github_repo,
      created_at: project.created_at,
    }));

    return applyNoStoreHeaders(NextResponse.json({ ok: true, projects }));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao listar projetos de hospedagem.",
        },
        { status: 500 },
      ),
    );
  }
}
