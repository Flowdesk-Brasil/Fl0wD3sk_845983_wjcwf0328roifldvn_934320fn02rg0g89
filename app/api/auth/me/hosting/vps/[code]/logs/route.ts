import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  normalizeVpsCode,
} from "@/lib/hosting/vpsRuntime";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders } from "@/lib/security/http";

type RouteProps = {
  params: Promise<{ code: string }>;
};

async function load(code: string) {
  const session = await getCurrentAuthSessionFromCookie();
  const vpsCode = normalizeVpsCode(code);
  if (!session || !vpsCode) {
    return { ok: false as const, status: 401, message: "Login necessario." };
  }
  const project = await getHostingProjectForUser({ userId: session.user.id, vpsCode });
  if (!project) return { ok: false as const, status: 404, message: "VPS nao encontrada." };
  return { ok: true as const, project };
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded.ok) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: loaded.message }, { status: loaded.status }),
    );
  }
  const search = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const level = request.nextUrl.searchParams.get("level")?.trim().toLowerCase() || "";
  let query = getSupabaseAdminClientOrThrow()
    .from("hosting_vps_logs")
    .select("*")
    .eq("hosting_project_id", loaded.project.id)
    .order("emitted_at", { ascending: false })
    .limit(500);
  if (["debug", "info", "warn", "error", "success"].includes(level)) {
    query = query.eq("level", level);
  }
  const { data, error } = await query;
  if (error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: error.message }, { status: 500 }),
    );
  }
  const logs = (data || []).filter((log) =>
    search ? String(log.message || "").toLowerCase().includes(search) : true,
  );
  return applyNoStoreHeaders(NextResponse.json({ ok: true, logs: logs.reverse() }));
}

export async function DELETE(_request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded.ok) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: loaded.message }, { status: loaded.status }),
    );
  }

  const { error } = await getSupabaseAdminClientOrThrow()
    .from("hosting_vps_logs")
    .delete()
    .eq("hosting_project_id", loaded.project.id);

  if (error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: error.message }, { status: 500 }),
    );
  }

  return applyNoStoreHeaders(NextResponse.json({ ok: true, logs: [] }));
}
