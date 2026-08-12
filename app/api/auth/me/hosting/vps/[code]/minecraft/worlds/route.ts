import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  normalizeVpsCode,
} from "@/lib/hosting/vpsRuntime";
import { requestVpsAgent } from "@/lib/hosting/vpsRuntime";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";

type RouteProps = {
  params: Promise<{ code: string }>;
};

function normalizeWorldSlug(value: unknown) {
  if (typeof value !== "string") return null;
  const slug = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  return /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])?$/.test(slug) ? slug : null;
}

type MinecraftServerRecord = {
  id: number;
  server_name: string;
  server_slug: string;
  minecraft_version: string;
  server_type: string;
  primary_domain: string;
  fixed_domain: string | null;
  limits: Record<string, unknown> | null;
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

async function loadMinecraftServerRecord(projectId: number) {
  const supabase = getSupabaseAdminClientOrThrow();
  const { data: server } = await supabase
    .from("hosting_minecraft_servers")
    .select("id, server_name, server_slug, minecraft_version, server_type, primary_domain, fixed_domain, limits")
    .eq("hosting_project_id", projectId)
    .maybeSingle<MinecraftServerRecord>();
  if (!server) return { server: null, worlds: [] as string[] };

  const { data: worldRows } = await supabase
    .from("hosting_minecraft_worlds")
    .select("world_slug")
    .eq("minecraft_server_id", server.id)
    .order("created_at", { ascending: true });

  return {
    server,
    worlds: (worldRows || [])
      .map((row) => String((row as { world_slug?: unknown }).world_slug || ""))
      .filter(Boolean),
  };
}

async function ensureMinecraftServerOnAgent(project: Awaited<ReturnType<typeof loadMinecraftProject>>["project"]) {
  if (!project) return null;
  const { server, worlds } = await loadMinecraftServerRecord(project.id);
  if (!server) return null;
  const firstWorldName = worlds[0] || "world";
  return requestVpsAgent<Record<string, unknown>>({
    project,
    method: "POST",
    path: "/v1/minecraft/servers",
    body: {
      projectCode: project.vps_code,
      server: {
        serverName: server.server_name,
        serverType: server.server_type,
        version: server.minecraft_version,
        subdomain: server.server_slug,
        firstWorldName,
        domains: {
          primary: server.primary_domain,
          fixed: server.fixed_domain,
        },
      },
      limits: server.limits || {},
    },
    timeoutMs: 30_000,
  });
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await loadMinecraftProject(code);
  if ("response" in loaded && loaded.response) return applyNoStoreHeaders(loaded.response);

  let payload: Record<string, unknown>;
  try {
    payload = await requestVpsAgent<Record<string, unknown>>({
      project: loaded.project,
      method: "GET",
      path: `/v1/minecraft/servers/${loaded.project.vps_code}/status`,
      timeoutMs: 30_000,
    });
  } catch {
    const { server, worlds } = await loadMinecraftServerRecord(loaded.project.id);
    if (!server) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Servidor Minecraft nao encontrado." }, { status: 404 }),
      );
    }
    payload = {
      ok: true,
      status: "created",
      source: "database",
      server: {
        serverName: server.server_name,
        serverType: server.server_type,
        version: server.minecraft_version,
      },
      domains: {
        primary: server.primary_domain,
        fixed: server.fixed_domain,
      },
      worlds,
      limits: server.limits || {},
    };
  }

  return applyNoStoreHeaders(NextResponse.json({ ok: true, minecraft: payload }));
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  const { code } = await params;
  const loaded = await loadMinecraftProject(code);
  if ("response" in loaded && loaded.response) return applyNoStoreHeaders(loaded.response);

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 80) : "";
  const slug = normalizeWorldSlug(name);
  if (!name || !slug) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Nome do mundo invalido." }, { status: 400 }),
    );
  }

  let payload: Record<string, unknown>;
  try {
    payload = await requestVpsAgent<Record<string, unknown>>({
      project: loaded.project,
      method: "POST",
      path: `/v1/minecraft/servers/${loaded.project.vps_code}/worlds`,
      body: { name },
      timeoutMs: 30_000,
    });
  } catch {
    await ensureMinecraftServerOnAgent(loaded.project);
    payload = await requestVpsAgent<Record<string, unknown>>({
      project: loaded.project,
      method: "POST",
      path: `/v1/minecraft/servers/${loaded.project.vps_code}/worlds`,
      body: { name },
      timeoutMs: 30_000,
    });
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const { data: server } = await supabase
    .from("hosting_minecraft_servers")
    .select("id")
    .eq("hosting_project_id", loaded.project.id)
    .maybeSingle();

  if (server?.id) {
    await supabase
      .from("hosting_minecraft_worlds")
      .upsert(
        {
          minecraft_server_id: server.id,
          hosting_project_id: loaded.project.id,
          world_slug: slug,
          world_name: name,
          status: "created",
          metadata: { source: "dashboard" },
        },
        { onConflict: "minecraft_server_id,world_slug" },
      );
  }

  return applyNoStoreHeaders(NextResponse.json({ ok: true, minecraft: payload }));
}
