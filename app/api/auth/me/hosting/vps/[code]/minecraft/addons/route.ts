import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  normalizeVpsCode,
  requestVpsAgent,
} from "@/lib/hosting/vpsRuntime";
import { applyNoStoreHeaders } from "@/lib/security/http";

type RouteProps = {
  params: Promise<{ code: string }>;
};

async function loadMinecraftProject(code: string) {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return { response: NextResponse.json({ ok: false, message: "Login necessario." }, { status: 401 }) };
  }
  const vpsCode = normalizeVpsCode(code);
  if (!vpsCode) {
    return { response: NextResponse.json({ ok: false, message: "Codigo invalido." }, { status: 400 }) };
  }
  const project = await getHostingProjectForUser({ userId: session.user.id, vpsCode });
  if (!project) {
    return { response: NextResponse.json({ ok: false, message: "Projeto nao encontrado." }, { status: 404 }) };
  }
  if (project.hosting_kind !== "minecraft") {
    return { response: NextResponse.json({ ok: false, message: "Este painel nao e Minecraft." }, { status: 409 }) };
  }
  return { session, project };
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await loadMinecraftProject(code);
  if ("response" in loaded && loaded.response) return applyNoStoreHeaders(loaded.response);

  const type = request.nextUrl.searchParams.get("type") === "mods" ? "mods" : "plugins";
  try {
    const payload = await requestVpsAgent<Record<string, unknown>>({
      project: loaded.project,
      method: "GET",
      path: `/v1/minecraft/servers/${loaded.project.vps_code}/addons?type=${type}`,
      timeoutMs: 15_000,
    });
    return applyNoStoreHeaders(NextResponse.json({ ok: true, ...payload }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel carregar addons.";
    return applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status: 503 }));
  }
}
