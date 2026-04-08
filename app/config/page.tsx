import { redirect } from "next/navigation";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { ConfigFlow } from "@/components/config/ConfigFlow";
import { buildLoginHref } from "@/lib/auth/paths";
import {
  buildConfigCheckoutPath,
  normalizePlanBillingPeriodCode,
  normalizePlanCode,
} from "@/lib/plans/catalog";

type ConfigPageProps = {
  searchParams?: Promise<{
    plan?: string | string[];
    billing?: string | string[];
  }>;
};

function takeFirstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function ConfigPage({ searchParams }: ConfigPageProps) {
  const query = searchParams ? await searchParams : {};
  const requestedPlan = takeFirstQueryValue(query.plan);
  const requestedBilling = takeFirstQueryValue(query.billing);
  const requestedNextPath = requestedPlan
    ? buildConfigCheckoutPath({
        planCode: requestedPlan,
        billingPeriodCode: requestedBilling,
        fallbackPlanCode: "pro",
      })
    : "/config";
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect(buildLoginHref(requestedNextPath));
  }

  if (requestedPlan) {
    redirect(requestedNextPath);
  }

  return (
    <ConfigFlow
      displayName={user.display_name}
      initialPlanCode={normalizePlanCode(null, "pro")}
      initialBillingPeriodCode={normalizePlanBillingPeriodCode(null, "monthly")}
      hasExplicitInitialPlan={false}
    />
  );
}
