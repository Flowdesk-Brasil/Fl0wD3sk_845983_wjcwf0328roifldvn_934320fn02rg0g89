import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  isRecord,
  normalizeVpsCode,
  readString,
  requestVpsAgent,
  resolveRuntimeStatus,
} from "@/lib/hosting/vpsRuntime";
import {
  resolveRuntimeHealth,
  resolveVpsProjectSettings,
} from "@/lib/hosting/vpsSettings";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders } from "@/lib/security/http";

type RouteProps = {
  params: Promise<{ code: string }>;
};

async function loadProject(code: string) {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return { response: NextResponse.json({ ok: false, message: "Login necessario." }, { status: 401 }) };
  }
  const vpsCode = normalizeVpsCode(code);
  if (!vpsCode) {
    return { response: NextResponse.json({ ok: false, message: "Codigo da VPS invalido." }, { status: 400 }) };
  }
  const project = await getHostingProjectForUser({
    userId: session.user.id,
    vpsCode,
  });
  if (!project) {
    return { response: NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }) };
  }
  return { session, project };
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await loadProject(code);
  if ("response" in loaded && loaded.response) return applyNoStoreHeaders(loaded.response);

  const supabase = getSupabaseAdminClientOrThrow();
  const [metricsResult, logsResult, deploysResult, envResult, actionsResult] =
    await Promise.all([
      supabase
        .from("hosting_vps_metrics")
        .select("*")
        .eq("hosting_project_id", loaded.project.id)
        .order("sampled_at", { ascending: false })
        .limit(720),
      supabase
        .from("hosting_vps_logs")
        .select("*")
        .eq("hosting_project_id", loaded.project.id)
        .order("emitted_at", { ascending: false })
        .limit(200),
      supabase
        .from("hosting_vps_deployments")
        .select("*")
        .eq("hosting_project_id", loaded.project.id)
        .order("created_at", { ascending: false })
        .limit(25),
      supabase
        .from("hosting_vps_env_vars")
        .select("id, environment, key, value_preview, visible_value, note, sensitive, version, updated_at")
        .eq("hosting_project_id", loaded.project.id)
        .order("environment", { ascending: true })
        .order("key", { ascending: true }),
      supabase
        .from("hosting_vps_action_events")
        .select("*")
        .eq("hosting_project_id", loaded.project.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const runtimePayload = isRecord(loaded.project.runtime_status_payload)
    ? loaded.project.runtime_status_payload
    : {};
  let resolvedRuntimeStatus = resolveRuntimeStatus(loaded.project.runtime_status);
  let resolvedRuntimePayload: Record<string, unknown> = runtimePayload;
  let resolvedRuntimeLastSeenAt = loaded.project.runtime_last_seen_at;

  if (loaded.project.hosting_kind === "minecraft") {
    const liveMinecraftStatus = await requestVpsAgent<Record<string, unknown>>({
      project: loaded.project,
      method: "GET",
      path: `/v1/minecraft/servers/${loaded.project.vps_code}/status`,
      timeoutMs: 3500,
    }).catch(() => null);
    const liveRuntimeStatus = resolveRuntimeStatus(liveMinecraftStatus?.status);
    if (liveMinecraftStatus && liveRuntimeStatus !== "unknown") {
      resolvedRuntimeStatus = liveRuntimeStatus;
      resolvedRuntimePayload = { ...runtimePayload, minecraft: liveMinecraftStatus };
      resolvedRuntimeLastSeenAt = new Date().toISOString();
      void supabase
        .from("hosting_projects")
        .update({
          runtime_status: liveRuntimeStatus,
          runtime_status_payload: resolvedRuntimePayload,
          runtime_last_seen_at: resolvedRuntimeLastSeenAt,
        })
        .eq("id", loaded.project.id);
    }
  }
  const fileTree = Array.isArray(runtimePayload.fileTree)
    ? runtimePayload.fileTree
    : [];
  const provisioningRepository = isRecord(loaded.project.provisioning_payload)
    ? loaded.project.provisioning_payload.repository
    : null;
  const repositoryFullName = `${loaded.project.github_owner}/${loaded.project.github_repo}`;
  const settings = resolveVpsProjectSettings(loaded.project.provisioning_payload, {
    vpsCode: loaded.project.vps_code,
    repositoryName: loaded.project.github_repo,
    repositoryFullName,
    repositoryBranch: loaded.project.github_branch,
    repositoryHtmlUrl: `https://github.com/${repositoryFullName}`,
    ownerEmail: loaded.session.user.email || loaded.session.user.username,
  });
  const runtimeHealth = resolveRuntimeHealth({
    runtimePayload: resolvedRuntimePayload,
    regionLabel: loaded.project.hosting_region_id,
    lastSeenAt: resolvedRuntimeLastSeenAt,
  });

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      project: {
        id: loaded.project.id,
        vpsCode: loaded.project.vps_code,
        status: loaded.project.status,
        runtimeStatus: resolvedRuntimeStatus,
        runtimeLastSeenAt: resolvedRuntimeLastSeenAt,
        runtimePayload: resolvedRuntimePayload,
        runtimeHealth,
        kind: loaded.project.hosting_kind,
        planId: loaded.project.hosting_plan_id,
        regionId: loaded.project.hosting_region_id,
        repository: {
          owner: loaded.project.github_owner,
          name: loaded.project.github_repo,
          id: loaded.project.github_repo_id,
          branch: loaded.project.github_branch,
          fullName: settings.repository.connected ? repositoryFullName : "Repository disconnected",
          description: readString(
            isRecord(provisioningRepository) ? provisioningRepository.description : null,
          ),
          connected: settings.repository.connected,
        },
        provisioningPayload: loaded.project.provisioning_payload,
      },
      metrics: (metricsResult.data || []).reverse(),
      logs: (logsResult.data || []).reverse(),
      deployments: deploysResult.data || [],
      envVars: envResult.data || [],
      actions: actionsResult.data || [],
      fileTree,
      settings,
    }),
  );
}
