import { redirect } from "next/navigation";
import { AppMaintenanceScreen } from "@/components/common/AppMaintenanceScreen";
import { AccountPaymentCheckout } from "@/components/payment/AccountPaymentCheckout";
import { buildLoginHref } from "@/lib/auth/paths";
import { getCurrentUserFromSessionCookieSafe } from "@/lib/auth/session";
import {
  HOSTING_PLANS,
  getHostingKindLabel,
  resolveHostingRegion,
  type HostingKind,
} from "@/lib/hosting/catalog";
import {
  resolveDomainPurchaseContext,
  verifyDomainCheckoutToken,
} from "@/lib/domains/checkout";
import {
  normalizePlanBillingPeriodCodeFromSlug,
  normalizePlanCodeFromSlug,
  isPlanSlug,
  resolvePlanPricing,
} from "@/lib/plans/catalog";
import { buildPaymentCheckoutEntryHref } from "@/lib/payments/paymentRouting";

const PAYMENT_PROVIDER_RETURN_QUERY_KEYS = [
  "collection_id",
  "collection_status",
  "payment_id",
  "paymentId",
  "status",
  "external_reference",
  "payment_type",
  "merchant_order_id",
  "preference_id",
  "site_id",
  "processing_mode",
  "merchant_account_id",
] as const;

type PaymentPlanBillingPageProps = {
  params: Promise<{
    planSlug: string;
    billingSlug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function isTruthyQueryFlag(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== "string") return false;
  const normalized = candidate.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function readSingleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Resolves the purchase type from the query parameters.
 * Returns "hosting" | "domain" | "plan" depending on the incoming query params.
 */
function resolvePurchaseType(
  query: Record<string, string | string[] | undefined>,
): "hosting" | "domain" | "plan" {
  const purchaseType = readSingleQueryValue(query.purchaseType);
  if (purchaseType === "hosting") return "hosting";
  if (purchaseType === "domain") return "domain";

  // Legacy fallback: check source param for hosting
  if (readSingleQueryValue(query.source) === "dashboard-hosting") return "hosting";
  if (readSingleQueryValue(query.source) === "dashboard-domains") return "domain";

  return "plan";
}

function buildHostingPurchaseContext(
  query: Record<string, string | string[] | undefined>,
) {
  const hostingKind = readSingleQueryValue(query.hostingKind) as
    | HostingKind
    | undefined;
  const hostingPlanId = readSingleQueryValue(query.hostingPlan);
  const hostingRegionId = readSingleQueryValue(query.hostingRegion);
  if (
    !hostingKind ||
    !hostingPlanId ||
    !hostingRegionId ||
    !(hostingKind in HOSTING_PLANS)
  ) {
    return null;
  }

  const plan = HOSTING_PLANS[hostingKind].find(
    (item) => item.id === hostingPlanId,
  );
  const region = resolveHostingRegion(hostingRegionId);
  if (!plan || !region) return null;

  const repository = readSingleQueryValue(query.repository) || null;
  const minecraftServerName = readSingleQueryValue(query.minecraftServerName) || null;
  const minecraftVersion = readSingleQueryValue(query.minecraftVersion) || null;
  const minecraftServerType = readSingleQueryValue(query.minecraftServerType) || null;
  const minecraftSubdomain = readSingleQueryValue(query.minecraftSubdomain) || null;
  const minecraftFirstWorldName = readSingleQueryValue(query.minecraftFirstWorldName) || null;
  const amount = plan.monthlyAmount;
  const currency = plan.currency;
  const isMinecraft = hostingKind === "minecraft";

  return {
    type: "hosting" as const,
    title: isMinecraft ? plan.name : `${plan.name} VPS`,
    subtitle: `${getHostingKindLabel(hostingKind)} em ${region.city}, ${region.country}`,
    details: isMinecraft
      ? [
          `${amount.toLocaleString("pt-BR", { style: "currency", currency })}/mes`,
          minecraftServerName || "Servidor Minecraft",
          minecraftVersion ? `Minecraft ${minecraftVersion}` : "Versao padrao",
          minecraftFirstWorldName ? `Mundo ${minecraftFirstWorldName}` : "Mundo inicial",
          minecraftSubdomain ? `${minecraftSubdomain}.mine.flwdesk.com` : "Subdominio Flowdesk",
        ]
      : [
          `${amount.toLocaleString("pt-BR", { style: "currency", currency })}/mes`,
          region.name,
          repository ? `Repo ${repository}` : "Repositorio selecionado",
        ],
    amount,
    currency,
    paymentPlanCode: plan.paymentPlanCode,
    hostingKind,
    hostingPlan: plan.id,
    hostingRegion: region.id,
    repository,
    minecraftServerName,
    minecraftVersion,
    minecraftServerType,
    minecraftSubdomain,
    minecraftFirstWorldName,
  };
}

function buildDomainPurchaseContext(
  query: Record<string, string | string[] | undefined>,
) {
  const domainToken = readSingleQueryValue(query.domainToken);
  if (!domainToken) return null;

  const payload = verifyDomainCheckoutToken(domainToken);
  const resolvedContext = resolveDomainPurchaseContext({
    type: "domain",
    token: domainToken,
  });
  if (!payload || !resolvedContext) return null;

  const isRegister = payload.operation === "register";

  return {
    type: "domain" as const,
    token: domainToken,
    title: resolvedContext.title,
    subtitle: resolvedContext.subtitle,
    details: [
      payload.fqdn,
      isRegister ? "Registro por 1 ano" : "Transferencia para Flowdesk",
      "DNS gerenciado pela Flowdesk",
    ],
    amount: resolvedContext.amount,
    currency: resolvedContext.currency,
    fqdn: payload.fqdn,
    operation: payload.operation,
    billingLabel: isRegister ? "/ano" : "",
    renewalLabel: isRegister
      ? "Renovacao anual gerenciada pela Flowdesk"
      : "Transferencia de entrada para sua conta Flowdesk",
    authUserId: payload.authUserId,
  };
}

export default async function PaymentPlanBillingPage({
  params,
  searchParams,
}: PaymentPlanBillingPageProps) {
  const routeParams = await params;
  const query = searchParams ? await searchParams : {};
  const purchaseType = resolvePurchaseType(query);
  const isCustomPurchase = purchaseType !== "plan";
  const isKnownPlanPaymentSlug = isPlanSlug(routeParams.planSlug);

  // For custom purchases, preserve the original product slug as-is
  // For plan purchases, normalize to the canonical plan slug
  const initialPlanCode = normalizePlanCodeFromSlug(
    routeParams.planSlug,
    "pro",
  );
  const initialBillingPeriodCode = normalizePlanBillingPeriodCodeFromSlug(
    routeParams.billingSlug,
    "monthly",
  );
  const resolvedPricing = resolvePlanPricing(
    initialPlanCode,
    initialBillingPeriodCode,
  );

  // Build canonical href differently based on purchase type
  const canonicalHref = isCustomPurchase
    ? buildPaymentCheckoutEntryHref({
        productSlug: routeParams.planSlug,
        planCode: initialPlanCode,
        billingPeriodCode: initialBillingPeriodCode,
        searchParams: query,
        omitSearchParamKeys: [
          "plan",
          "billing",
          "guild",
          "code",
          "orderId",
          "cartId",
          ...PAYMENT_PROVIDER_RETURN_QUERY_KEYS,
        ],
      })
    : buildPaymentCheckoutEntryHref({
        planCode: resolvedPricing.code,
        billingPeriodCode: resolvedPricing.billingPeriodCode,
        searchParams: query,
        omitSearchParamKeys: [
          "plan",
          "billing",
          "guild",
          "code",
          "orderId",
          "cartId",
          ...PAYMENT_PROVIDER_RETURN_QUERY_KEYS,
        ],
      });

  const canonicalPathname = canonicalHref.split("?")[0] || canonicalHref;
  const currentPathname = `/payment/${routeParams.planSlug}/${routeParams.billingSlug}`;
  const forceFreshCheckout = isTruthyQueryFlag(query.fresh);

  // Build purchase context based on type
  let purchaseContext = null;
  if (purchaseType === "hosting") {
    purchaseContext = buildHostingPurchaseContext(query);
  } else if (purchaseType === "domain") {
    purchaseContext = buildDomainPurchaseContext(query);
  }

  const isInvalidPlanSlug = purchaseType === "plan" && !isKnownPlanPaymentSlug;
  const isInvalidCustomPurchase = isCustomPurchase && !purchaseContext;
  if (isInvalidPlanSlug || isInvalidCustomPurchase) {
    return (
      <AppMaintenanceScreen
        badgeLabel="Link invalido"
        title="Este link de pagamento nao e valido"
        description="Nao encontramos os dados do produto nesta URL. Volte ao produto, selecione o plano novamente e gere uma nova cobranca segura."
        refreshLabel="Revalidar link"
        backLabel="Voltar ao painel"
        fallbackHref="/dashboard"
      />
    );
  }

  const sessionResult = await getCurrentUserFromSessionCookieSafe({
    fullContext: true,
  });

  if (sessionResult.degraded) {
    return (
      <AppMaintenanceScreen
        badgeLabel="Checkout protegido"
        title="Checkout temporariamente indisponivel"
        description="Estamos restabelecendo a conexao com a base antes de continuar com seu pagamento. Tente novamente em instantes."
        refreshLabel="Tentar novamente"
        fallbackHref="/"
      />
    );
  }

  const user = sessionResult.user;

  if (!user) {
    redirect(buildLoginHref(canonicalHref));
  }

  // For domain purchases, verify the token belongs to the authenticated user
  if (purchaseType === "domain" && purchaseContext && "authUserId" in purchaseContext) {
    if (purchaseContext.authUserId !== user.id) {
      redirect("/dashboard/domains/acquire?error=checkout_account");
    }
  }

  // Only redirect for canonical path normalization if NOT a custom purchase
  // Custom purchases keep the product slug as-is
  if (
    !isCustomPurchase &&
    currentPathname.toLowerCase() !== canonicalPathname.toLowerCase()
  ) {
    redirect(canonicalHref);
  }

  return (
    <AccountPaymentCheckout
      displayName={user.display_name}
      initialPlanCode={
        purchaseContext?.type === "hosting"
          ? purchaseContext.paymentPlanCode
          : isCustomPurchase
            ? initialPlanCode
            : resolvedPricing.code
      }
      initialBillingPeriodCode={
        isCustomPurchase
          ? initialBillingPeriodCode
          : resolvedPricing.billingPeriodCode
      }
      forceFreshCheckout={forceFreshCheckout}
      purchaseContext={purchaseContext}
    />
  );
}
