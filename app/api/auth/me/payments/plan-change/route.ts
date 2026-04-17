import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  hasAcceptedTeamAccessToGuild,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import {
  getUserPlanFlowPointsBalance,
  getUserPlanScheduledChange,
  resolveFlowPointsBalanceAmount,
  resolvePlanChangePreview,
  scheduleUserPlanDowngrade,
} from "@/lib/plans/change";
import {
  applyUserPlanStatePricingAdjustments,
  getBasicPlanAvailability,
  getUserPlanState,
  resolveEffectivePlanSelection,
} from "@/lib/plans/state";
import {
  normalizePlanBillingPeriodCode,
  normalizePlanCode,
  resolvePlanPricing,
} from "@/lib/plans/catalog";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

type SchedulePlanChangeBody = {
  guildId?: unknown;
  planCode?: unknown;
  billingPeriodCode?: unknown;
};

function normalizeGuildId(value: unknown) {
  if (typeof value !== "string") return null;
  const guildId = value.trim();
  return isGuildId(guildId) ? guildId : null;
}

async function ensureGuildAccess(guildId: string | null) {
  const sessionData = await resolveSessionAccessToken();
  if (!sessionData?.authSession) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      ),
    };
  }

  if (!sessionData.accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Token OAuth ausente na sessao." },
        { status: 401 },
      ),
    };
  }

  if (!guildId) {
    return {
      ok: true as const,
      context: {
        sessionData,
      },
    };
  }

  if (sessionData.authSession.activeGuildId === guildId) {
    return {
      ok: true as const,
      context: {
        sessionData,
      },
    };
  }

  let accessibleGuild = null;
  try {
    accessibleGuild = await assertUserAdminInGuildOrNull(
      {
        authSession: sessionData.authSession,
        accessToken: sessionData.accessToken,
      },
      guildId,
    );
  } catch {
    accessibleGuild = null;
  }

  const hasTeamAccess = accessibleGuild
    ? false
    : await hasAcceptedTeamAccessToGuild(
        {
          authSession: sessionData.authSession,
          accessToken: sessionData.accessToken,
        },
        guildId,
      );

  if (!accessibleGuild && !hasTeamAccess && sessionData.authSession.activeGuildId !== guildId) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Servidor nao encontrado para este usuario." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    context: {
      sessionData,
    },
  };
}

async function resolveEffectivePlanSelectionForCheckout(input: {
  userId: number;
  guildId: string | null;
  preferredPlanCode?: unknown;
  preferredBillingPeriodCode?: unknown;
}) {
  if (input.guildId) {
    return resolveEffectivePlanSelection({
      userId: input.userId,
      guildId: input.guildId,
      preferredPlanCode: input.preferredPlanCode,
      preferredBillingPeriodCode: input.preferredBillingPeriodCode,
    });
  }

  const [userPlanState, basicPlanAvailability, flowPointsBalanceRecord, scheduledChange] =
    await Promise.all([
      getUserPlanState(input.userId),
      getBasicPlanAvailability(input.userId),
      getUserPlanFlowPointsBalance(input.userId),
      getUserPlanScheduledChange(input.userId),
    ]);
  const selectedPlan = applyUserPlanStatePricingAdjustments(
    resolvePlanPricing(
      normalizePlanCode(input.preferredPlanCode),
      normalizePlanBillingPeriodCode(input.preferredBillingPeriodCode),
    ),
    userPlanState,
  );

  return {
    plan: selectedPlan,
    guildSettings: null,
    userPlanState,
    basicPlanAvailability,
    flowPointsBalance: resolveFlowPointsBalanceAmount(flowPointsBalanceRecord),
    scheduledChange,
  };
}

export async function POST(request: Request) {
  try {
    const securityResponse = ensureSameOriginJsonMutationRequest(request);
    if (securityResponse) {
      return securityResponse;
    }

    let body: SchedulePlanChangeBody = {};
    try {
      body = (await request.json()) as SchedulePlanChangeBody;
    } catch {
      return NextResponse.json(
        { ok: false, message: "Payload JSON invalido." },
        { status: 400 },
      );
    }

    const guildId = normalizeGuildId(body.guildId);
    const access = await ensureGuildAccess(guildId);
    if (!access.ok) return access.response;

    const userId = access.context.sessionData.authSession.user.id;
    const selection = await resolveEffectivePlanSelectionForCheckout({
      userId,
      guildId,
      preferredPlanCode: body.planCode,
      preferredBillingPeriodCode: body.billingPeriodCode,
    });
    const preview = resolvePlanChangePreview({
      userPlanState: selection.userPlanState,
      targetPlan: selection.plan,
      flowPointsBalance: selection.flowPointsBalance,
      scheduledChange: selection.scheduledChange,
    });

    if (selection.plan.isTrial) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "O plano Basic nao pode ser usado como downgrade agendado nesta conta.",
        },
        { status: 400 },
      );
    }

    if (preview.execution !== "schedule_for_renewal") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Essa troca nao precisa ser agendada. Use o checkout imediato para concluir agora.",
        },
        { status: 409 },
      );
    }

    if (!selection.userPlanState?.expires_at || !preview.currentPlanCode || !preview.currentBillingCycleDays) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nao foi possivel encontrar o vencimento do plano atual para agendar a troca.",
        },
        { status: 409 },
      );
    }

    const scheduledChange = await scheduleUserPlanDowngrade({
      userId,
      guildId,
      currentPlanCode: preview.currentPlanCode,
      currentBillingCycleDays: preview.currentBillingCycleDays,
      targetPlanCode: selection.plan.code,
      targetBillingPeriodCode: selection.plan.billingPeriodCode,
      targetBillingCycleDays: selection.plan.billingCycleDays,
      effectiveAt: selection.userPlanState.expires_at,
      metadata: {
        source: "flowdesk_checkout",
        targetPlanName: selection.plan.name,
        targetTotalAmount: selection.plan.totalAmount,
      },
    });

    return NextResponse.json({
      ok: true,
      scheduledChange: {
        id: scheduledChange.id,
        guildId: scheduledChange.guild_id,
        currentPlanCode: scheduledChange.current_plan_code,
        currentBillingCycleDays: scheduledChange.current_billing_cycle_days,
        targetPlanCode: scheduledChange.target_plan_code,
        targetBillingPeriodCode: scheduledChange.target_billing_period_code,
        targetBillingCycleDays: scheduledChange.target_billing_cycle_days,
        status: scheduledChange.status,
        effectiveAt: scheduledChange.effective_at,
      },
      planChange: {
        kind: preview.kind,
        execution: preview.execution,
        effectiveAt: preview.effectiveAt,
      },
      message:
        "Downgrade agendado com sucesso. O plano atual continua ativo ate o fim do ciclo pago.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: sanitizeErrorMessage(
          error,
          "Nao foi possivel agendar a troca de plano.",
        ),
      },
      { status: 500 },
    );
  }
}
