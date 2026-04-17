import { redirect } from "next/navigation";
import { AccountPaymentCheckout } from "@/components/payment/AccountPaymentCheckout";
import { buildLoginHref } from "@/lib/auth/paths";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import {
  normalizePlanBillingPeriodCodeFromSlug,
  normalizePlanCodeFromSlug,
  resolvePlanPricing,
} from "@/lib/plans/catalog";
import { buildPaymentCheckoutEntryHref } from "@/lib/payments/paymentRouting";

type PaymentPlanOrderPageProps = {
  params: Promise<{
    planSlug: string;
    billingSlug: string;
    orderSlug: string;
    cartSlug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaymentPlanOrderPage({
  params,
  searchParams,
}: PaymentPlanOrderPageProps) {
  const routeParams = await params;
  const query = searchParams ? await searchParams : {};
  const initialPlanCode = normalizePlanCodeFromSlug(routeParams.planSlug, "pro");
  const initialBillingPeriodCode = normalizePlanBillingPeriodCodeFromSlug(
    routeParams.billingSlug,
    "monthly",
  );
  const resolvedPricing = resolvePlanPricing(
    initialPlanCode,
    initialBillingPeriodCode,
  );
  const canonicalHref = buildPaymentCheckoutEntryHref({
    planCode: resolvedPricing.code,
    billingPeriodCode: resolvedPricing.billingPeriodCode,
    orderNumber: routeParams.orderSlug,
    orderId: routeParams.cartSlug,
    searchParams: query,
    omitSearchParamKeys: ["plan", "billing", "guild", "code", "orderId", "cartId"],
  });
  const canonicalPathname = canonicalHref.split("?")[0] || canonicalHref;
  const currentPathname =
    `/payment/${routeParams.planSlug}/${routeParams.billingSlug}` +
    `/${routeParams.orderSlug}/${routeParams.cartSlug}`;
  const user = await getCurrentUserFromSessionCookie({ fullContext: true });

  if (!user) {
    redirect(buildLoginHref(canonicalHref));
  }

  if (currentPathname.toLowerCase() !== canonicalPathname.toLowerCase()) {
    redirect(canonicalHref);
  }

  return (
    <AccountPaymentCheckout
      displayName={user.display_name}
      initialPlanCode={resolvedPricing.code}
      initialBillingPeriodCode={resolvedPricing.billingPeriodCode}
    />
  );
}
