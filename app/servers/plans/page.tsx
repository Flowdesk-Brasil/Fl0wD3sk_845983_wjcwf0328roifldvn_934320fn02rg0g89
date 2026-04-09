import { redirect } from "next/navigation";
import { ServersPlansUpgradePage } from "@/components/servers/ServersPlansUpgradePage";
import { buildLoginHref } from "@/lib/auth/paths";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { getBasicPlanAvailability, getUserPlanState } from "@/lib/plans/state";

type ServersPlansPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function takeFirstQueryValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] || null;
  return value || null;
}

export default async function ServersPlansPage({
  searchParams,
}: ServersPlansPageProps) {
  const session = await getCurrentAuthSessionFromCookie();

  if (!session) {
    redirect(buildLoginHref("/servers/plans"));
  }

  const query = searchParams ? await searchParams : {};
  const shouldShowServerLimitBanner =
    takeFirstQueryValue(query.reason) === "server-limit";
  const user = session.user;
  const [userPlanState, basicPlanAvailability] = await Promise.all([
    getUserPlanState(user.id),
    getBasicPlanAvailability(user.id),
  ]);

  return (
    <ServersPlansUpgradePage
      currentPlan={
        userPlanState
          ? {
              planCode: userPlanState.plan_code,
              status: userPlanState.status,
            }
          : null
      }
      preferredGuildId={session.activeGuildId || null}
      showServerLimitBanner={shouldShowServerLimitBanner}
      basicPlanAvailable={basicPlanAvailability.isAvailable}
    />
  );
}
