import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  appendVpsEvent,
  getHostingProjectForUser,
  isRecord,
  normalizeVpsCode,
  requestVpsAgent,
<<<<<<< HEAD
<<<<<<< HEAD
  resolveHostingAccessState,
=======
>>>>>>> 9c6e756 (Att master)
=======
  resolveHostingAccessState,
>>>>>>> 7babcb8 (att)
  resolveRuntimeStatus,
  type VpsAction,
} from "@/lib/hosting/vpsRuntime";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

type RouteProps = {
  params: Promise<{ code: string }>;
};

function normalizeAction(value: unknown): VpsAction | null {
  return value === "start" ||
    value === "stop" ||
    value === "restart" ||
    value === "deploy" ||
    value === "rollback" ||
    value === "sync"
    ? value
    : null;
}

function nextRuntimeStatusForAction(action: VpsAction) {
  if (action === "start") return "online" as const;
  if (action === "stop") return "offline" as const;
  if (action === "restart") return "restarting" as const;
  if (action === "deploy" || action === "rollback") return "deploying" as const;
  return "unknown" as const;
}

function finalRuntimeStatusForLocalAction(action: VpsAction, currentStatus: unknown) {
  const resolvedCurrentStatus = resolveRuntimeStatus(currentStatus);
  if (action === "start" || action === "restart") return "online" as const;
  if (action === "stop") return "offline" as const;
  if (action === "sync") return resolvedCurrentStatus === "unknown" ? "online" : resolvedCurrentStatus;
  return resolvedCurrentStatus;
}

function actionLabel(action: VpsAction) {
  if (action === "start") return "iniciado";
  if (action === "stop") return "parado";
  if (action === "restart") return "reiniciado";
  if (action === "deploy") return "publicado";
  if (action === "rollback") return "revertido";
  return "sincronizado";
}

function shouldFallbackToControlPlane(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /nao configurado|not configured|fetch failed|econnrefused|etimedout|timed out|aborted|network/i.test(message);
}

export async function POST(request: NextRequest, { params }: RouteProps) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

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

  let body: Record<string, unknown>;
  try {
    body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        action: flowSecureDto.enum(
          ["start", "stop", "restart", "deploy", "rollback", "sync"] as const,
        ),
      },
      { rejectUnknown: true },
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Acao invalida." }, { status: 400 }),
    );
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
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> 7babcb8 (att)
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

<<<<<<< HEAD
=======
>>>>>>> 9c6e756 (Att master)
=======
>>>>>>> 7babcb8 (att)
  await appendVpsEvent({
    projectId: project.id,
    userId: session.user.id,
    action,
    status: "running",
    message: `Acao ${action} iniciada.`,
    requestPayload: body,
  });

  const previousPayload = isRecord(project.runtime_status_payload) ? project.runtime_status_payload : {};
  const startedAt = new Date().toISOString();
  await supabase
    .from("hosting_projects")
    .update({
      runtime_status: nextRuntimeStatusForAction(action),
      runtime_status_payload: {
        ...previousPayload,
        lastAction: action,
        startedAt,
        mode: "control-plane",
      },
      runtime_last_seen_at: startedAt,
    })
    .eq("id", project.id);

  try {
    const payload = await requestVpsAgent<Record<string, unknown>>({
      project,
      method: "POST",
      path: `/v1/vps/${project.vps_code}/actions/${action}`,
      body,
      timeoutMs: action === "deploy" ? 45_000 : 15_000,
    });
    const runtimeStatus = resolveRuntimeStatus(payload.status);
    const effectiveRuntimeStatus = runtimeStatus === "unknown" ? nextRuntimeStatusForAction(action) : runtimeStatus;

    await supabase
      .from("hosting_projects")
      .update({
        runtime_status: effectiveRuntimeStatus,
        runtime_status_payload: {
          ...previousPayload,
          ...payload,
          lastAction: action,
          mode: "agent",
        },
        runtime_last_seen_at: new Date().toISOString(),
      })
      .eq("id", project.id);
    await appendVpsEvent({
      projectId: project.id,
      userId: session.user.id,
      action,
      status: "succeeded",
      message: `Acao ${action} concluida.`,
      requestPayload: body,
      responsePayload: payload,
    });

    return applyNoStoreHeaders(NextResponse.json({ ok: true, status: effectiveRuntimeStatus, payload }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao executar acao.";
    if (shouldFallbackToControlPlane(error)) {
      const finalStatus = finalRuntimeStatusForLocalAction(action, project.runtime_status);
      const payload = {
        ...previousPayload,
        lastAction: action,
        mode: "control-plane",
        agentPending: true,
        agentMessage: message,
        completedAt: new Date().toISOString(),
      };
      await supabase
        .from("hosting_projects")
        .update({
          runtime_status: finalStatus,
          runtime_status_payload: payload,
          runtime_last_seen_at: new Date().toISOString(),
        })
        .eq("id", project.id);
      await appendVpsEvent({
        projectId: project.id,
        userId: session.user.id,
        action,
        status: "succeeded",
        message: `Projeto ${actionLabel(action)} no painel. Agente Windows pendente de conexao.`,
        requestPayload: body,
        responsePayload: payload,
      });
      await supabase
        .from("hosting_vps_logs")
        .insert({
          hosting_project_id: project.id,
          level: "success",
          source: "control-plane",
          message: `Projeto ${actionLabel(action)} pelo painel. Conecte o agente Windows depois para executar na VPS real.`,
          metadata: { action, mode: "control-plane", agentPending: true },
        });

      return applyNoStoreHeaders(NextResponse.json({
        ok: true,
        status: finalStatus,
        mode: "control-plane",
        message: "Acao aplicada no painel. Agente Windows pendente de conexao.",
        payload,
      }));
    }
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

    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message }, { status: 503 }),
    );
  }
}
