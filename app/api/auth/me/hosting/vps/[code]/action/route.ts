import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  appendVpsEvent,
  decryptEnvValue,
  getHostingProjectForUser,
  normalizeVpsCode,
  requestVpsAgent,
  resolveHostingAccessState,
  resolveRuntimeStatus,
  type VpsAction,
} from "@/lib/hosting/vpsRuntime";
import { readHostingGitHubToken } from "@/lib/hosting/github";
import { resolveHostingRegion } from "@/lib/hosting/catalog";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { buildPublicApiErrorResponse } from "@/lib/security/apiResponses";
import { extractAuditErrorMessage } from "@/lib/security/errors";
import { createSecurityRequestContext } from "@/lib/security/requestSecurity";

type RouteProps = {
  params: Promise<{ code: string }>;
};

const VPS_ACTIONS = ["start", "stop", "restart", "deploy", "rollback", "sync", "kill", "reset-world", "command"] as const;

type VpsActionBody = {
  action: VpsAction;
  command?: string;
};

function normalizeAction(value: unknown): VpsAction | null {
  return value === "start" ||
    value === "stop" ||
    value === "restart" ||
    value === "deploy" ||
    value === "rollback" ||
    value === "sync" ||
    value === "kill" ||
    value === "reset-world" ||
    value === "command"
    ? value
    : null;
}

function nextRuntimeStatusForAction(action: VpsAction) {
  if (action === "start") return "starting" as const;
  if (action === "stop") return "offline" as const;
  if (action === "restart") return "restarting" as const;
  if (action === "deploy" || action === "rollback") return "deploying" as const;
  if (action === "kill" || action === "reset-world") return "offline" as const;
  return "unknown" as const;
}

/** Busca todas as env vars do projeto no Supabase, descriptografa e monta o .env */
async function buildEnvFileContent(projectId: number): Promise<string> {
  const supabase = getSupabaseAdminClientOrThrow();
  const { data } = await supabase
    .from("hosting_vps_env_vars")
    .select("key, encrypted_value, visible_value, sensitive, environment")
    .eq("hosting_project_id", projectId)
    .order("environment")
    .order("key");

  if (!data?.length) return "";

  // Production takes priority; merge all envs, production overwrites others
  const merged: Record<string, string> = {};
  for (const env of ["development", "preview", "production"]) {
    for (const row of data.filter((r) => r.environment === env)) {
      try {
        const value = row.sensitive !== false && row.encrypted_value
          ? decryptEnvValue(row.encrypted_value) ?? (row.visible_value || "")
          : (row.visible_value || "");
        if (value !== null && value !== undefined) {
          merged[row.key] = value;
        }
      } catch {
        // Skip rows that fail to decrypt
      }
    }
  }

  const lines = Object.entries(merged).map(([key, value]) => {
    const escaped = String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r");
    return `${key}="${escaped}"`;
  });

  return lines.join("\n") + "\n";
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const requestContext = createSecurityRequestContext(request);
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Login necessario." }, { status: 401 }),
    );
  }

  const { code } = await params;
  const vpsCode = normalizeVpsCode(code);
  if (!vpsCode) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Codigo da VPS invalido." }, { status: 400 }),
    );
  }

  let body: VpsActionBody;
  try {
    body = parseFlowSecureDto<VpsActionBody>(
      await request.json().catch(() => ({})),
      {
        action: flowSecureDto.enum(VPS_ACTIONS),
        command: flowSecureDto.optional(flowSecureDto.string({ maxLength: 512 })),
      },
      { rejectUnknown: true },
    );
  } catch (error) {
    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Acao invalida.",
      status: 400,
    });
  }
  const action = normalizeAction(body.action);
  if (!action) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Acao invalida." }, { status: 400 }),
    );
  }

  const project = await getHostingProjectForUser({
    userId: session.user.id,
    vpsCode,
  });
  if (!project) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "VPS nao encontrada." }, { status: 404 }),
    );
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const paymentStatus = project.payment_order_id
    ? await supabase
        .from("payment_orders")
        .select("status, expires_at")
        .eq("id", project.payment_order_id)
        .maybeSingle<{ status: string; expires_at: string | null }>()
    : { data: null };

  const accessState = resolveHostingAccessState({
    projectStatus: project.status,
    billingStatus: project.billing_status,
    accessExpiresAt: project.access_expires_at || paymentStatus.data?.expires_at || null,
    refundAccessUntil: project.refund_access_until,
    paymentStatus: paymentStatus.data?.status,
  });

  if (accessState.blocked && action !== "sync") {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message: accessState.isAccessExpired
          ? "A VPS venceu. Regularize o pagamento para executar acoes."
          : "A VPS esta bloqueada para acoes operacionais.",
      }, { status: 402 }),
    );
  }

  if (action === "sync") {
    try {
      const startedAt = Date.now();
      const regionLabel =
        resolveHostingRegion(project.hosting_region_id)?.name ||
        "Boston, United States";
      const payload = await requestVpsAgent<Record<string, unknown>>({
        project,
        method: "GET",
        path: `/v1/vps/${project.vps_code}/metrics`,
        timeoutMs: 8_000,
      });
      const runtimeStatus = resolveRuntimeStatus(payload.status);
      const checkedAt = new Date().toISOString();
      const runtimePayload = {
        ...(project.runtime_status_payload && typeof project.runtime_status_payload === "object"
          ? project.runtime_status_payload as Record<string, unknown>
          : {}),
        agentHealth: {
          connected: true,
          latencyMs: Date.now() - startedAt,
          checkedAt,
          regionLabel,
          host: typeof payload.host === "string" ? payload.host : null,
          publicIp: typeof payload.publicIp === "string" ? payload.publicIp : null,
        },
        lastSync: payload,
      };
      await supabase
        .from("hosting_projects")
        .update({
          runtime_status: runtimeStatus === "unknown" ? project.runtime_status || "unknown" : runtimeStatus,
          runtime_status_payload: runtimePayload,
          runtime_last_seen_at: checkedAt,
        })
        .eq("id", project.id);
      await appendVpsEvent({
        projectId: project.id,
        userId: session.user.id,
        action,
        status: "succeeded",
        message: "Status da VPS verificado pelo agente.",
        responsePayload: { ...payload, latencyMs: Date.now() - startedAt },
      });
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          status: runtimeStatus === "unknown" ? project.runtime_status || "unknown" : runtimeStatus,
          payload,
          runtimeHealth: runtimePayload.agentHealth,
        }),
      );
    } catch (error) {
      const message = extractAuditErrorMessage(error, "Falha ao verificar status.");
      await appendVpsEvent({
        projectId: project.id,
        userId: session.user.id,
        action,
        status: "failed",
        message,
      });
      return buildPublicApiErrorResponse(requestContext, {
        error,
        fallbackMessage: "Nao foi possivel verificar o status da VPS agora.",
        status: 503,
      });
    }
  }

  if (
    project.hosting_kind === "minecraft" &&
    (action === "start" || action === "restart" || action === "stop" || action === "kill" || action === "reset-world" || action === "command")
  ) {
    await appendVpsEvent({
      projectId: project.id,
      userId: session.user.id,
      action,
      status: "running",
      message: `Acao Minecraft ${action} iniciada.`,
      requestPayload: body,
    });

    try {
      const payload = await requestVpsAgent<Record<string, unknown>>({
        project,
        method: "POST",
        path: `/v1/minecraft/servers/${project.vps_code}/actions/${action}`,
        body: action === "command" ? { command: body.command } : {},
        timeoutMs: 120_000,
      });
      const runtimeStatus = resolveRuntimeStatus(payload.status);
      await supabase
        .from("hosting_projects")
        .update({
          runtime_status:
            runtimeStatus === "unknown" ? nextRuntimeStatusForAction(action) : runtimeStatus,
          runtime_status_payload: {
            ...(project.runtime_status_payload && typeof project.runtime_status_payload === "object"
              ? project.runtime_status_payload as Record<string, unknown>
              : {}),
            minecraft: payload,
            lastAction: action,
          },
          runtime_last_seen_at: new Date().toISOString(),
        })
        .eq("id", project.id);
      await appendVpsEvent({
        projectId: project.id,
        userId: session.user.id,
        action,
        status: "succeeded",
        message: `Acao Minecraft ${action} concluida.`,
        responsePayload: payload,
      });
      return applyNoStoreHeaders(NextResponse.json({ ok: true, status: runtimeStatus, payload }));
    } catch (error) {
      const message = extractAuditErrorMessage(error, "Falha ao executar acao Minecraft.");
      await appendVpsEvent({
        projectId: project.id,
        userId: session.user.id,
        action,
        status: "failed",
        message,
      });
      return buildPublicApiErrorResponse(requestContext, {
        error,
        fallbackMessage: "Nao foi possivel executar a acao Minecraft agora.",
        status: 503,
      });
    }
  }

  await appendVpsEvent({
    projectId: project.id,
    userId: session.user.id,
    action,
    status: "running",
    message: `Acao ${action} iniciada.`,
    requestPayload: body,
  });

  await supabase
    .from("hosting_projects")
    .update({
      runtime_status: nextRuntimeStatusForAction(action),
      runtime_status_payload: { lastAction: action, startedAt: new Date().toISOString() },
      runtime_last_seen_at: new Date().toISOString(),
    })
    .eq("id", project.id);

  try {
    // ── Step 1: Always push .env BEFORE start/restart/deploy ─────────────────
    if (action === "deploy" || action === "start" || action === "restart") {
      const envContent = await buildEnvFileContent(project.id);
      if (envContent.trim()) {
        await requestVpsAgent({
          project,
          method: "POST",
          path: `/v1/vps/${project.vps_code}/env`,
          body: { env: envContent },
          timeoutMs: 10_000,
        }).catch(() => null); // Non-fatal: continue even if env push fails
      }
    }

    // ── Step 2: Build the final action body ───────────────────────────────────
    let finalBody: Record<string, unknown> = { ...(body as Record<string, unknown>) };

    if (action === "deploy") {
      const githubToken = await readHostingGitHubToken(session.user.id).catch(() => null);
      // Use token in URL only for private repos - avoids JSON escaping issues
      const tokenPart = githubToken ? `${githubToken}@` : "";
      finalBody = {
        ...finalBody,
        // Build clean URL - token goes in basic auth position
        gitUrl: project.github_owner
          ? `https://${tokenPart}github.com/${project.github_owner}/${project.github_repo}.git`
          : undefined,
        branch: project.github_branch || "main",
      };
    }

    // ── Step 3: Send action to daemon ─────────────────────────────────────────
    const payload = await requestVpsAgent<Record<string, unknown>>({
      project,
      method: "POST",
      path: `/v1/vps/${project.vps_code}/actions/${action}`,
      body: finalBody,
      timeoutMs: action === "deploy" ? 120_000 : 20_000,
    });

    const runtimeStatus = resolveRuntimeStatus(payload.status);

    await supabase
      .from("hosting_projects")
      .update({
        runtime_status: runtimeStatus === "unknown" ? nextRuntimeStatusForAction(action) : runtimeStatus,
        runtime_status_payload: payload,
        runtime_last_seen_at: new Date().toISOString(),
      })
      .eq("id", project.id);

    await appendVpsEvent({
      projectId: project.id,
      userId: session.user.id,
      action,
      status: "succeeded",
      message: `Acao ${action} concluida.`,
      requestPayload: { ...finalBody, gitUrl: finalBody.gitUrl ? "[REDACTED]" : undefined },
      responsePayload: payload,
    });

    return applyNoStoreHeaders(NextResponse.json({ ok: true, status: runtimeStatus, payload }));

  } catch (error) {
    const message = extractAuditErrorMessage(error, "Falha ao executar acao.");
    await appendVpsEvent({
      projectId: project.id,
      userId: session.user.id,
      action,
      status: "failed",
      message,
      requestPayload: body,
    });

    await supabase
      .from("hosting_vps_logs")
      .insert({
        hosting_project_id: project.id,
        level: "error",
        source: "control-plane",
        message,
        metadata: { action },
      });

    await supabase
      .from("hosting_projects")
      .update({
        runtime_status: action === "stop" ? "offline" : "crashed",
        runtime_status_payload: { error: message, action },
        runtime_last_seen_at: new Date().toISOString(),
      })
      .eq("id", project.id);

    return buildPublicApiErrorResponse(requestContext, {
      error,
      fallbackMessage: "Nao foi possivel executar a acao da VPS agora.",
      status: 503,
    });
  }
}
