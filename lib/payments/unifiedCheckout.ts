import {
  DEFAULT_PLAN_CODE,
  type PlanBillingPeriodCode,
  type PlanCode,
} from "@/lib/plans/catalog";
import {
  HOSTING_PLANS,
  HOSTING_REGIONS,
  resolveHostingRegion,
  type HostingKind,
} from "@/lib/hosting/catalog";
import { buildPaymentCheckoutEntryHref, normalizePaymentProductSlug } from "@/lib/payments/paymentRouting";

type QueryValue = string | number | boolean | null | undefined;
type QueryInput = Record<string, QueryValue | QueryValue[]>;

function mergeQuery(input: QueryInput) {
  const params: QueryInput = {};
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      const filtered = value.filter((item): item is Exclude<QueryValue, null | undefined> =>
        item !== null && item !== undefined && item !== "",
      );
      if (filtered.length) params[key] = filtered;
    } else if (value !== null && value !== undefined && value !== "") {
      params[key] = value;
    }
  }
  return params;
}

/**
 * Builds a human-readable product slug for VPS/hosting purchases.
 * E.g. kind=site, planId=site-start → "vps-site-start"
 */
function hostingProductSlug(input: { kind: HostingKind; planId: string }) {
  return normalizePaymentProductSlug(
    `vps-${input.kind}-${input.planId}`,
    DEFAULT_PLAN_CODE,
  );
}

/**
 * Builds a human-readable product slug for domain purchases.
 * E.g. operation=register, fqdn=example.com → "registrar-example-com"
 */
function domainProductSlug(input: { fqdn?: string | null; operation?: string | null; token: string }) {
  const suffix = input.operation === "transfer" ? "transferir" : "registrar";
  return normalizePaymentProductSlug(
    input.fqdn ? `${suffix}-${input.fqdn}` : `${suffix}-dominio-${input.token.slice(0, 10)}`,
    DEFAULT_PLAN_CODE,
  );
}

export function buildUnifiedPaymentHref(input: {
  productSlug: string;
  billingPeriodCode?: PlanBillingPeriodCode;
  planCode?: PlanCode;
  orderNumber?: unknown;
  orderId?: unknown;
  searchParams?: QueryInput;
}) {
  return buildPaymentCheckoutEntryHref({
    productSlug: input.productSlug,
    planCode: input.planCode || DEFAULT_PLAN_CODE,
    billingPeriodCode: input.billingPeriodCode || "monthly",
    orderNumber: input.orderNumber,
    orderId: input.orderId,
    searchParams: input.searchParams,
  });
}

export function buildHostingPaymentHref(input: {
  kind: HostingKind;
  planId: string;
  regionId: string;
  repository?: string | null;
  minecraft?: {
    serverName?: string | null;
    version?: string | null;
    serverType?: string | null;
    subdomain?: string | null;
    firstWorldName?: string | null;
  } | null;
  returnPath?: string | null;
  fresh?: boolean;
}) {
  const plan = HOSTING_PLANS[input.kind]?.find((item) => item.id === input.planId) || null;
  const region = resolveHostingRegion(input.regionId) || HOSTING_REGIONS[0] || null;
  const productSlug = hostingProductSlug({ kind: input.kind, planId: plan?.id || input.planId });

  return buildUnifiedPaymentHref({
    productSlug,
    planCode: plan?.paymentPlanCode || DEFAULT_PLAN_CODE,
    billingPeriodCode: "monthly",
    searchParams: mergeQuery({
      source: "dashboard-hosting",
      purchaseType: "hosting",
      hostingKind: input.kind,
      hostingPlan: plan?.id || input.planId,
      hostingRegion: region?.id || input.regionId,
      repository: input.repository || null,
      minecraftServerName: input.minecraft?.serverName || null,
      minecraftVersion: input.minecraft?.version || null,
      minecraftServerType: input.minecraft?.serverType || null,
      minecraftSubdomain: input.minecraft?.subdomain || null,
      minecraftFirstWorldName: input.minecraft?.firstWorldName || null,
      amount: plan?.monthlyAmount ?? null,
      currency: plan?.currency || "BRL",
      return: "hosting",
      returnPath: input.returnPath || null,
      fresh: input.fresh ? 1 : null,
    }),
  });
}

export function buildDomainPaymentHref(input: {
  token: string;
  fqdn?: string | null;
  operation?: "register" | "transfer" | null;
  returnPath?: string | null;
  fresh?: boolean;
}) {
  return buildUnifiedPaymentHref({
    productSlug: domainProductSlug(input),
    planCode: DEFAULT_PLAN_CODE,
    billingPeriodCode: "annual",
    searchParams: mergeQuery({
      source: "dashboard-domains",
      purchaseType: "domain",
      domainToken: input.token,
      return: "domain",
      returnPath: input.returnPath || "/dashboard/domains",
      fresh: input.fresh ? 1 : null,
    }),
  });
}
