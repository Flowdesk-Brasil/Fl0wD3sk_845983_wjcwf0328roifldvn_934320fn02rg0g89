import { redirect } from "next/navigation";
import { AppMaintenanceScreen } from "@/components/common/AppMaintenanceScreen";
import { AccountPaymentCheckout } from "@/components/payment/AccountPaymentCheckout";
import { buildLoginHref } from "@/lib/auth/paths";
import { getCurrentUserFromSessionCookieSafe } from "@/lib/auth/session";
import {
  resolveDomainPurchaseContext,
  verifyDomainCheckoutToken,
} from "@/lib/domains/checkout";
import {
  DEFAULT_PLAN_BILLING_PERIOD_CODE,
  DEFAULT_PLAN_CODE,
} from "@/lib/plans/catalog";

type DomainPaymentPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function readSingleQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isTruthyQueryFlag(value: string | string[] | undefined) {
  const candidate = readSingleQueryValue(value);
  if (typeof candidate !== "string") return false;
  const normalized = candidate.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function buildDomainPaymentHref(token: string, query: Record<string, string | string[] | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, item);
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }
  const search = params.toString();
  return `/payment/domain/${encodeURIComponent(token)}${search ? `?${search}` : ""}`;
}

export default async function DomainPaymentPage({
  params,
  searchParams,
}: DomainPaymentPageProps) {
  const routeParams = await params;
  const query = searchParams ? await searchParams : {};
  const token = routeParams.token?.trim() || "";
  const payload = verifyDomainCheckoutToken(token);
  const resolvedContext = resolveDomainPurchaseContext({ type: "domain", token });

  if (!payload || !resolvedContext) {
    redirect("/dashboard/domains/acquire?error=checkout_expired");
  }

  const currentHref = buildDomainPaymentHref(token, query);
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
        fallbackHref="/dashboard/domains/acquire"
      />
    );
  }

  const user = sessionResult.user;

  if (!user) {
    redirect(buildLoginHref(currentHref));
  }

  if (payload.authUserId !== user.id) {
    redirect("/dashboard/domains/acquire?error=checkout_account");
  }

  const isRegister = payload.operation === "register";
  const forceFreshCheckout = isTruthyQueryFlag(query.fresh);
  const purchaseContext = {
    type: "domain" as const,
    token,
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
  };

  return (
    <AccountPaymentCheckout
      displayName={user.display_name}
      initialPlanCode={DEFAULT_PLAN_CODE}
      initialBillingPeriodCode={DEFAULT_PLAN_BILLING_PERIOD_CODE}
      forceFreshCheckout={forceFreshCheckout}
      purchaseContext={purchaseContext}
    />
  );
}
