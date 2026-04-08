import { redirect } from "next/navigation";
import { ServersPlansUpgradePage } from "@/components/servers/ServersPlansUpgradePage";
import { buildLoginHref } from "@/lib/auth/paths";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { getUserPlanState } from "@/lib/plans/state";

type ServersPlansPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ServersPlansPage({
  searchParams: _searchParams,
}: ServersPlansPageProps) {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect(buildLoginHref("/servers/plans"));
  }

  void _searchParams;
  const userPlanState = await getUserPlanState(user.id);

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
    />
  );
}
