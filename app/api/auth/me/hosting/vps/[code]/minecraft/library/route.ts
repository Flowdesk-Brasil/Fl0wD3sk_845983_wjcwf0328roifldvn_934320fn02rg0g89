import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  normalizeVpsCode,
  requestVpsAgent,
} from "@/lib/hosting/vpsRuntime";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";

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

  const projectId = request.nextUrl.searchParams.get("projectId") || "";
  const path = projectId
    ? `/v1/minecraft/servers/${loaded.project.vps_code}/library/project/${encodeURIComponent(projectId)}`
    : `/v1/minecraft/servers/${loaded.project.vps_code}/library/search?${request.nextUrl.searchParams.toString()}`;

  try {
    const payload = await requestVpsAgent<Record<string, unknown>>({
      project: loaded.project,
      method: "GET",
      path,
      timeoutMs: 20_000,
    });
    return applyNoStoreHeaders(NextResponse.json({ ok: true, ...payload }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel carregar a biblioteca.";
    return applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status: 503 }));
  }
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  const { code } = await params;
  const loaded = await loadMinecraftProject(code);
  if ("response" in loaded && loaded.response) return applyNoStoreHeaders(loaded.response);

  const body = await request.json().catch(() => ({}));
  const action = body?.action === "delete" ? "delete" : "install";
  const agentPath = action === "delete"
    ? `/v1/minecraft/servers/${loaded.project.vps_code}/addons/delete`
    : `/v1/minecraft/servers/${loaded.project.vps_code}/addons/install`;

  try {
    const payload = await requestVpsAgent<Record<string, unknown>>({
      project: loaded.project,
      method: "POST",
      path: agentPath,
      body,
      timeoutMs: 30_000,
    });
    return applyNoStoreHeaders(NextResponse.json({ ok: true, ...payload }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel concluir a acao.";
    return applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status: 400 }));
  }
}
