import {
  HOSTING_PLANS,
  getHostingKindLabel,
  resolveHostingRegion,
  type HostingKind,
} from "@/lib/hosting/catalog";

export type HostingPurchaseContext = {
  type: "hosting";
  hostingKind: HostingKind;
  hostingPlanId: string;
  hostingRegionId: string;
  repository?: string | null;
  minecraftServerName?: string | null;
  minecraftVersion?: string | null;
  minecraftServerType?: string | null;
  minecraftSubdomain?: string | null;
  minecraftFirstWorldName?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: unknown, maxLength = 160) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function isHostingKind(value: unknown): value is HostingKind {
  return value === "site" || value === "bot" || value === "minecraft";
}

function readHostingPurchaseContextRecord(
  record: Record<string, unknown>,
): HostingPurchaseContext | null {
  if (record.type !== "hosting") return null;

  const hostingKind = isHostingKind(record.hostingKind) ? record.hostingKind : null;
  const hostingPlanId =
    normalizeText(record.hostingPlanId, 80) || normalizeText(record.hostingPlan, 80);
  const hostingRegionId =
    normalizeText(record.hostingRegionId, 80) || normalizeText(record.hostingRegion, 80);
  if (!hostingKind || !hostingPlanId || !hostingRegionId) return null;

  const plan = HOSTING_PLANS[hostingKind].find((item) => item.id === hostingPlanId);
  const region = resolveHostingRegion(hostingRegionId);
  if (!plan || !region) return null;

  return {
    type: "hosting",
    hostingKind,
    hostingPlanId: plan.id,
    hostingRegionId: region.id,
    repository: normalizeText(record.repository, 220),
    minecraftServerName: normalizeText(record.minecraftServerName, 80),
    minecraftVersion: normalizeText(record.minecraftVersion, 24),
    minecraftServerType: normalizeText(record.minecraftServerType, 40),
    minecraftSubdomain: normalizeText(record.minecraftSubdomain, 64),
    minecraftFirstWorldName: normalizeText(record.minecraftFirstWorldName, 80),
  };
}

export function readHostingPurchaseContextFromProviderPayload(
  providerPayload: unknown,
): HostingPurchaseContext | null {
  if (!isRecord(providerPayload)) return null;
  const purchaseContext = providerPayload.purchase_context;
  if (!isRecord(purchaseContext)) return null;
  return readHostingPurchaseContextRecord(purchaseContext);
}

export function resolveHostingCheckoutTitle(input: {
  kind: HostingKind;
  planName: string;
}) {
  return input.kind === "minecraft"
    ? input.planName
    : `${input.planName} VPS`;
}

export function hostingPurchaseMatchesProvisionRequest(
  context: HostingPurchaseContext,
  request: {
    kind: HostingKind;
    planId: string;
    regionId: string;
  },
) {
  return (
    context.hostingKind === request.kind &&
    context.hostingPlanId === request.planId &&
    context.hostingRegionId === request.regionId
  );
}

export function resolveHostingPurchaseContextForProvision(input: {
  providerPayload: unknown;
  planName: string | null | undefined;
  amount: unknown;
  providerStatusDetail: string | null | undefined;
  request: {
    kind: HostingKind;
    planId: string;
    regionId: string;
    planName: string;
  };
}) {
  const fromPayload = readHostingPurchaseContextFromProviderPayload(input.providerPayload);
  if (
    fromPayload &&
    hostingPurchaseMatchesProvisionRequest(fromPayload, input.request)
  ) {
    return fromPayload;
  }

  const amount = typeof input.amount === "number" ? input.amount : Number(input.amount);
  const isZeroApproved =
    (Number.isFinite(amount) && amount <= 0) ||
    normalizeText(input.providerStatusDetail, 80) === "covered_by_internal_credits";
  const payloadRecord = isRecord(input.providerPayload) ? input.providerPayload : null;
  const checkoutTitle = resolveHostingCheckoutTitle({
    kind: input.request.kind,
    planName: input.request.planName,
  });
  const orderTitle = normalizeText(input.planName, 120);

  if (
    isZeroApproved &&
    payloadRecord?.source === "flowdesk_checkout" &&
    orderTitle === checkoutTitle
  ) {
    return {
      type: "hosting" as const,
      hostingKind: input.request.kind,
      hostingPlanId: input.request.planId,
      hostingRegionId: input.request.regionId,
    };
  }

  return fromPayload;
}

export function buildHostingPurchaseContextProviderPayload(input: {
  kind: HostingKind;
  plan: { id: string; name: string; monthlyAmount: number; currency: string };
  region: { id: string; name: string };
  repository?: string | null;
  minecraft?: {
    serverName?: string | null;
    version?: string | null;
    serverType?: string | null;
    subdomain?: string | null;
    firstWorldName?: string | null;
  } | null;
}) {
  const title = resolveHostingCheckoutTitle({
    kind: input.kind,
    planName: input.plan.name,
  });
  const subtitle = `${getHostingKindLabel(input.kind)} em ${input.region.name}`;

  return {
    purchase_context: {
      type: "hosting",
      title,
      subtitle,
      hostingKind: input.kind,
      hostingPlanId: input.plan.id,
      hostingPlanName: input.plan.name,
      hostingRegionId: input.region.id,
      hostingRegionName: input.region.name,
      repository: input.repository || null,
      minecraftServerName: input.minecraft?.serverName || null,
      minecraftVersion: input.minecraft?.version || null,
      minecraftServerType: input.minecraft?.serverType || null,
      minecraftSubdomain: input.minecraft?.subdomain || null,
      minecraftFirstWorldName: input.minecraft?.firstWorldName || null,
      billingInterval: "monthly",
      amount: input.plan.monthlyAmount,
      currency: input.plan.currency,
    },
  };
}
