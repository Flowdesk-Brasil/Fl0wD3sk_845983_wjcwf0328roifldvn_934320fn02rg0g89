import { redirect } from "next/navigation";
import { ConfigFlow } from "@/components/config/ConfigFlow";
import { buildLoginHref } from "@/lib/auth/paths";
import { buildServersPlansPath } from "@/lib/plans/addServerFlow";
import { buildAccountPlanUsageSnapshot } from "@/lib/plans/accountPlanUsage";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import {
  buildConfigCheckoutPath,
  normalizePlanBillingPeriodCodeFromSlug,
  normalizePlanCodeFromSlug,
  resolvePlanPricing,
} from "@/lib/plans/catalog";
import {
  shouldBlockConfigServerSelection,
  shouldBypassConfigServerSelectionBlock,
} from "@/lib/plans/configServerSelection";
import { buildConfigCheckoutEntryHref } from "@/lib/plans/configRouting";
import { countPlanGuildsForUser } from "@/lib/plans/planGuilds";
import { getUserPlanState } from "@/lib/plans/state";

type ConfigPlanBillingPageProps = {
  params: Promise<{
    planSlug: string;
    billingSlug: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ConfigPlanBillingPage({
  params,
  searchParams,
}: ConfigPlanBillingPageProps) {
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
  const canonicalPath = buildConfigCheckoutEntryHref({
    planCode: resolvedPricing.code,
    billingPeriodCode: resolvedPricing.billingPeriodCode,
    searchParams: query,
    omitSearchParamKeys: ["plan", "billing"],
  });
  const canonicalPathname = buildConfigCheckoutPath({
    planCode: resolvedPricing.code,
    billingPeriodCode: resolvedPricing.billingPeriodCode,
  });
  const user = await getCurrentUserFromSessionCookie({ fullContext: true });

  if (!user) {
    redirect(buildLoginHref(canonicalPath));
  }

  if (
    `/config/${routeParams.planSlug}/${routeParams.billingSlug}`.toLowerCase() !==
    canonicalPathname.toLowerCase()
  ) {
    redirect(canonicalPath);
  }

  const [userPlanState, licensedServersCount] = await Promise.all([
    getUserPlanState(user.id),
    countPlanGuildsForUser(user.id),
  ]);
  const usage = buildAccountPlanUsageSnapshot(userPlanState, licensedServersCount);

  if (
    shouldBlockConfigServerSelection({
      userPlanState,
      licensedServersCount: usage.licensedServersCount,
      targetPlanMaxLicensedServers: resolvedPricing.entitlements.maxLicensedServers,
    })
    && !shouldBypassConfigServerSelectionBlock({
      userPlanState,
      targetPlanCode: resolvedPricing.code,
      searchParams: query,
    })
  ) {
    redirect(buildServersPlansPath());
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
