import { redirect } from "next/navigation";
import { ConfigFlow } from "@/components/config/ConfigFlow";
import { buildLoginHref } from "@/lib/auth/paths";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import {
  buildConfigCheckoutPath,
  normalizePlanBillingPeriodCodeFromSlug,
  normalizePlanCodeFromSlug,
  resolvePlanPricing,
} from "@/lib/plans/catalog";

type ConfigPlanBillingPageProps = {
  params: Promise<{
    planSlug: string;
    billingSlug: string;
  }>;
};

export default async function ConfigPlanBillingPage({
  params,
}: ConfigPlanBillingPageProps) {
  const routeParams = await params;
  const initialPlanCode = normalizePlanCodeFromSlug(routeParams.planSlug, "pro");
  const initialBillingPeriodCode = normalizePlanBillingPeriodCodeFromSlug(
    routeParams.billingSlug,
    "monthly",
  );
  const resolvedPricing = resolvePlanPricing(
    initialPlanCode,
    initialBillingPeriodCode,
  );
  const canonicalPath = buildConfigCheckoutPath({
    planCode: resolvedPricing.code,
    billingPeriodCode: resolvedPricing.billingPeriodCode,
  });
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect(buildLoginHref(canonicalPath));
  }

  if (
    `/config/${routeParams.planSlug}/${routeParams.billingSlug}`.toLowerCase() !==
    canonicalPath.toLowerCase()
  ) {
    redirect(canonicalPath);
  }

  return (
    <ConfigFlow
      displayName={user.display_name}
      initialPlanCode={resolvedPricing.code}
      initialBillingPeriodCode={resolvedPricing.billingPeriodCode}
      hasExplicitInitialPlan
    />
  );
}
