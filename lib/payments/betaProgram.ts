import type {
  PlanBillingPeriodCode,
  PlanCode,
  PlanPricingDefinition,
} from "@/lib/plans/catalog";

export const BETA_COUPON_CODE = "BETA";
export const BETA_PINNED_PLAN_CODE: PlanCode = "pro";
export const BETA_PINNED_BILLING_PERIOD_CODE: PlanBillingPeriodCode = "monthly";
export const BETA_PINNED_MONTHLY_AMOUNT = 9.99;

export type BetaProgramMetadata = {
  active: boolean;
  couponCode: string;
  pinnedPlanCode: PlanCode;
  pinnedBillingPeriodCode: PlanBillingPeriodCode;
  pinnedMonthlyAmount: number;
  activatedAt?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseFiniteNumber(value: unknown, fallback: number) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function canApplyBetaProgramToSelection(
  planCode: unknown,
  billingPeriodCode: unknown,
) {
  return (
    planCode === BETA_PINNED_PLAN_CODE &&
    billingPeriodCode === BETA_PINNED_BILLING_PERIOD_CODE
  );
}

export function resolveBetaProgramMetadata(metadata: unknown) {
  if (!isRecord(metadata)) return null;

  const beta = metadata.beta;
  if (!isRecord(beta) || beta.active !== true) {
    return null;
  }

  const couponCode =
    typeof beta.couponCode === "string" && beta.couponCode.trim()
      ? beta.couponCode.trim().toUpperCase()
      : BETA_COUPON_CODE;

  return {
    active: true,
    couponCode,
    pinnedPlanCode: BETA_PINNED_PLAN_CODE,
    pinnedBillingPeriodCode: BETA_PINNED_BILLING_PERIOD_CODE,
    pinnedMonthlyAmount: roundMoney(
      parseFiniteNumber(beta.pinnedMonthlyAmount, BETA_PINNED_MONTHLY_AMOUNT),
    ),
    activatedAt:
      typeof beta.activatedAt === "string" && beta.activatedAt.trim()
        ? beta.activatedAt
        : null,
  } satisfies BetaProgramMetadata;
}

export function applyBetaProgramPricing(
  plan: PlanPricingDefinition,
  metadata: unknown,
) {
  const beta = resolveBetaProgramMetadata(metadata);
  if (!beta) return plan;
  if (!canApplyBetaProgramToSelection(plan.code, plan.billingPeriodCode)) {
    return plan;
  }

  const pinnedMonthlyAmount = roundMoney(beta.pinnedMonthlyAmount);
  const pinnedTotalAmount = roundMoney(
    pinnedMonthlyAmount * Math.max(plan.billingPeriodMonths, 1),
  );

  return {
    ...plan,
    baseMonthlyAmount: pinnedMonthlyAmount,
    monthlyAmount: pinnedMonthlyAmount,
    baseTotalAmount: pinnedTotalAmount,
    totalAmount: pinnedTotalAmount,
    compareTotalAmount: Math.max(plan.compareTotalAmount, pinnedTotalAmount),
    limitedOffer: "Valor beta vitalicio mantido nesta conta.",
    renewalLabel:
      "Renovacao beta protegida nesta conta. O valor do Flow PRO mensal permanece fixo.",
    cycleDiscountPercent: 0,
    cycleBadge: "Beta vitalicio",
  } satisfies PlanPricingDefinition;
}
