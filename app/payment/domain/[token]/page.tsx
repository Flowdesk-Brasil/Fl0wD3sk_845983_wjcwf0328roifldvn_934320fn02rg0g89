import { redirect } from "next/navigation";
import { verifyDomainCheckoutToken } from "@/lib/domains/checkout";
import { buildDomainPaymentHref } from "@/lib/payments/unifiedCheckout";

type DomainPaymentPageProps = {
  params: Promise<{
    token: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Legacy domain payment route.
 * Redirects to the unified /payment/{productSlug}/{billingPeriodSlug} route.
 */
export default async function DomainPaymentPage({
  params,
}: DomainPaymentPageProps) {
  const routeParams = await params;
  const token = routeParams.token?.trim() || "";
  const payload = verifyDomainCheckoutToken(token);

  if (!payload) {
    redirect("/dashboard/domains/acquire?error=checkout_expired");
  }

  // Redirect to the unified payment route
  const unifiedHref = buildDomainPaymentHref({
    token,
    fqdn: payload.fqdn,
    operation: payload.operation,
    returnPath: "/dashboard/domains",
    fresh: true,
  });

  redirect(unifiedHref);
}
