import { NextResponse } from "next/server";
import { resolveSessionAccessToken } from "@/lib/auth/discordGuildAccess";
import { getUserPlanScheduledChange } from "@/lib/plans/change";
import {
  isPlanBillingPeriodCode,
  isPlanCode,
  type PlanBillingPeriodCode,
  type PlanCode,
} from "@/lib/plans/catalog";
import { buildConfigCheckoutEntryHref } from "@/lib/plans/configRouting";
import {
  ensureDowngradeEnforcementForUser,
  getDowngradeEnforcementSummaryForUser,
  saveDowngradeEnforcementSelection,
} from "@/lib/plans/downgradeEnforcement";
import { getUserPlanState } from "@/lib/plans/state";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

type DowngradeSelectionBody = {
  selectedGuildIds?: unknown;
};

function normalizeGuildId(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{10,25}$/.test(normalized) ? normalized : null;
}

function normalizeSelectedGuildIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  const uniqueGuildIds = new Set<string>();

  for (const candidate of value) {
    const guildId = normalizeGuildId(candidate);
    if (guildId) uniqueGuildIds.add(guildId);
  }

  return [...uniqueGuildIds];
}

function buildDowngradeCheckoutPath(input: {
  targetPlanCode: PlanCode;
  targetBillingPeriodCode: PlanBillingPeriodCode;
  preferredGuildId: string | null;
}) {
  return buildConfigCheckoutEntryHref({
    planCode: input.targetPlanCode,
    billingPeriodCode: input.targetBillingPeriodCode,
    searchParams: {
      fresh: "1",
      source: "downgrade-regularization",
      guild: input.preferredGuildId,
    },
  });
}

export async function POST(request: Request) {
  try {
    const securityResponse = ensureSameOriginJsonMutationRequest(request);
    if (securityResponse) return securityResponse;

    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession) {
      return NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      );
    }

    let body: DowngradeSelectionBody = {};
    try {
      body = (await request.json()) as DowngradeSelectionBody;
    } catch {
      return NextResponse.json(
        { ok: false, message: "Payload JSON invalido." },
        { status: 400 },
      );
    }

    const selectedGuildIds = normalizeSelectedGuildIds(body.selectedGuildIds);
    const userId = sessionData.authSession.user.id;
    const [userPlanState, scheduledChange] = await Promise.all([
      getUserPlanState(userId),
      getUserPlanScheduledChange(userId),
    ]);
    await ensureDowngradeEnforcementForUser({
      userId,
      userPlanState,
      scheduledChange,
    });
    const activeEnforcement = await getDowngradeEnforcementSummaryForUser(userId);
    if (!activeEnforcement) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nao existe regularizacao pendente de downgrade para esta conta.",
        },
        { status: 409 },
      );
    }

    const savedEnforcement = await saveDowngradeEnforcementSelection({
      userId,
      selectedGuildIds,
    });
    const savedSummary = await getDowngradeEnforcementSummaryForUser(userId);
    if (!savedSummary) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Nao foi possivel confirmar a selecao dos servidores no momento.",
        },
        { status: 500 },
      );
    }

    const targetPlanCode = isPlanCode(savedSummary.targetPlanCode)
      ? savedSummary.targetPlanCode
      : "pro";
    const targetBillingPeriodCode = isPlanBillingPeriodCode(
      savedSummary.targetBillingPeriodCode,
    )
      ? savedSummary.targetBillingPeriodCode
      : "monthly";
    const preferredGuildId =
      savedSummary.selectedGuildIds[0] ||
      selectedGuildIds[0] ||
      null;

    return NextResponse.json({
      ok: true,
      message:
        "Selecao confirmada. Continue para concluir o pagamento do novo plano.",
      downgradeEnforcement: {
        id: savedSummary.id,
        status: savedSummary.status,
        effectiveAt: savedSummary.effectiveAt,
        targetPlanCode: savedSummary.targetPlanCode,
        targetBillingPeriodCode: savedSummary.targetBillingPeriodCode,
        targetBillingCycleDays: savedSummary.targetBillingCycleDays,
        targetMaxLicensedServers: savedSummary.targetMaxLicensedServers,
        selectedGuildIds: savedSummary.selectedGuildIds,
        scheduledChangeId: savedSummary.scheduledChangeId,
      },
      checkoutPath: buildDowngradeCheckoutPath({
        targetPlanCode,
        targetBillingPeriodCode,
        preferredGuildId,
      }),
      internal: {
        status: savedEnforcement?.status || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: sanitizeErrorMessage(
          error,
          "Nao foi possivel confirmar a selecao dos servidores.",
        ),
      },
      { status: 500 },
    );
  }
}
