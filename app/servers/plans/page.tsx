import { redirect } from "next/navigation";
import { ServersPlansUpgradePage } from "@/components/servers/ServersPlansUpgradePage";
import { buildLoginHref } from "@/lib/auth/paths";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { buildAccountPlanUsageSnapshot } from "@/lib/plans/accountPlanUsage";
import { countPlanGuildsForUser } from "@/lib/plans/planGuilds";
import { getUserPlanState } from "@/lib/plans/state";

type ServersPlansPageProps = {
  searchParams?: Promise<{
    reason?: string | string[];
  }>;
};

function takeFirstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function ServersPlansPage({
  searchParams,
}: ServersPlansPageProps) {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect(buildLoginHref("/servers/plans"));
  }

  const [query, userPlanState, licensedServersCount] = await Promise.all([
    searchParams
      ? searchParams
      : Promise.resolve<{ reason?: string | string[] }>({}),
    getUserPlanState(user.id),
    countPlanGuildsForUser(user.id),
  ]);

  return (
    <ServersPlansUpgradePage
      displayName={user.display_name}
      currentPlan={
        userPlanState
          ? {
              planCode: userPlanState.plan_code,
              planName: userPlanState.plan_name,
              status: userPlanState.status,
              billingCycleDays: userPlanState.billing_cycle_days,
              maxLicensedServers: userPlanState.max_licensed_servers,
              expiresAt: userPlanState.expires_at,
            }
          : null
      }
      usage={buildAccountPlanUsageSnapshot(userPlanState, licensedServersCount)}
      reason={takeFirstQueryValue(query.reason)}
    />
  );
}
