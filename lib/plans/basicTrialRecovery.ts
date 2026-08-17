import { resolvePlanCycleExpirationIso } from "@/lib/plans/cycle";
import { parseUtcTimestampMs } from "@/lib/time/utcTimestamp";

type BasicTrialOrderLike = {
  guild_id?: string | null;
  status?: string | null;
  plan_code?: string | null;
  payment_method?: string | null;
  plan_billing_cycle_days?: number | null;
  paid_at?: string | null;
  expires_at?: string | null;
  created_at?: string | null;
};

export type BasicTrialReuseDecision =
  | {
      kind: "same_guild";
      canReuse: true;
      licenseGuildId: string;
      shouldRecordGuildRepair: false;
    }
  | {
      kind: "account_trial_attach_guild";
      canReuse: true;
      licenseGuildId: string;
      shouldRecordGuildRepair: true;
    }
  | {
      kind: "account_trial";
      canReuse: true;
      licenseGuildId: null;
      shouldRecordGuildRepair: false;
    }
  | {
      kind: "different_guild";
      canReuse: false;
      licenseGuildId: null;
      shouldRecordGuildRepair: false;
      existingGuildId: string;
      requestedGuildId: string;
    }
  | {
      kind: "expired";
      canReuse: false;
      licenseGuildId: null;
      shouldRecordGuildRepair: false;
      expiresAt: string | null;
    };

function normalizeOptionalGuildId(value: string | null | undefined) {
  const guildId = typeof value === "string" ? value.trim() : "";
  return guildId || null;
}

export function resolveBasicTrialOrderExpiresAt(order: BasicTrialOrderLike) {
  const explicitExpiresAtMs = parseUtcTimestampMs(order.expires_at);
  if (Number.isFinite(explicitExpiresAtMs)) {
    return new Date(explicitExpiresAtMs).toISOString();
  }

  const baseTimestamp = order.paid_at || order.created_at || null;
  if (!baseTimestamp) return null;

  return resolvePlanCycleExpirationIso({
    baseTimestamp,
    billingCycleDays: order.plan_billing_cycle_days || 7,
    fallbackBillingCycleDays: 7,
  });
}

export function isBasicTrialOrderCurrentlyUsable(
  order: BasicTrialOrderLike,
  nowMs = Date.now(),
) {
  if ((order.status || "").trim().toLowerCase() !== "approved") {
    return false;
  }

  const isBasicTrial =
    (order.payment_method || "").trim().toLowerCase() === "trial" ||
    (order.plan_code || "").trim().toLowerCase() === "basic";
  if (!isBasicTrial) {
    return false;
  }

  const expiresAt = resolveBasicTrialOrderExpiresAt(order);
  const expiresAtMs = parseUtcTimestampMs(expiresAt);
  return Number.isFinite(expiresAtMs) && nowMs <= expiresAtMs;
}

export function resolveBasicTrialReuseDecision(
  order: BasicTrialOrderLike,
  requestedGuildId: string | null | undefined,
  nowMs = Date.now(),
): BasicTrialReuseDecision {
  const expiresAt = resolveBasicTrialOrderExpiresAt(order);
  if (!isBasicTrialOrderCurrentlyUsable(order, nowMs)) {
    return {
      kind: "expired",
      canReuse: false,
      licenseGuildId: null,
      shouldRecordGuildRepair: false,
      expiresAt,
    };
  }

  const existingGuildId = normalizeOptionalGuildId(order.guild_id);
  const normalizedRequestedGuildId = normalizeOptionalGuildId(requestedGuildId);

  if (!normalizedRequestedGuildId) {
    return {
      kind: "account_trial",
      canReuse: true,
      licenseGuildId: null,
      shouldRecordGuildRepair: false,
    };
  }

  if (!existingGuildId) {
    return {
      kind: "account_trial_attach_guild",
      canReuse: true,
      licenseGuildId: normalizedRequestedGuildId,
      shouldRecordGuildRepair: true,
    };
  }

  if (existingGuildId === normalizedRequestedGuildId) {
    return {
      kind: "same_guild",
      canReuse: true,
      licenseGuildId: normalizedRequestedGuildId,
      shouldRecordGuildRepair: false,
    };
  }

  return {
    kind: "different_guild",
    canReuse: false,
    licenseGuildId: null,
    shouldRecordGuildRepair: false,
    existingGuildId,
    requestedGuildId: normalizedRequestedGuildId,
  };
}
