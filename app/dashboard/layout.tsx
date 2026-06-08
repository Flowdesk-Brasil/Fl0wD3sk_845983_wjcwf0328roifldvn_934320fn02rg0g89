import { redirect } from "next/navigation";
import { DashboardWorkspace } from "@/components/dashboard/DashboardWorkspace";
import { MaintenanceGate } from "@/components/common/MaintenanceGate";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { ensureUserPaymentDeliveryReady } from "@/lib/payments/paymentReadiness";
import { getPanelManagedServersForCurrentSession } from "@/lib/servers/managedServers";
import { resolveDashboardWorkspaceAlertMessage } from "@/lib/servers/workspaceAlerts";
import { getUserTeamsSnapshotForUser } from "@/lib/teams/userTeams";
import { resolveAuthUserAvatarUrl } from "@/lib/auth/avatar";

async function DashboardLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect("/login");
  }

  await ensureUserPaymentDeliveryReady({
    userId: user.id,
    source: "dashboard_layout_bootstrap",
  });

  const [managedServers, teamsSnapshot] = await Promise.all([
    user.discord_user_id
      ? getPanelManagedServersForCurrentSession().catch(() => [])
      : Promise.resolve([]),
    getUserTeamsSnapshotForUser({
      authUserId: user.id,
      discordUserId: user.discord_user_id,
    }).catch(() => ({ teams: [], pendingInvites: [] })),
  ]);

  const workspaceAlertMessage = resolveDashboardWorkspaceAlertMessage(managedServers);

  return (
    <DashboardWorkspace
      currentAccount={{
        authUserId: user.id,
        discordUserId: user.discord_user_id,
        displayName: user.display_name,
        username: user.username,
        avatarUrl: resolveAuthUserAvatarUrl(user),
        globalName: user.global_name,
        email: user.email,
      }}
      initialServers={managedServers}
      initialTeams={teamsSnapshot.teams}
      initialPendingInvites={teamsSnapshot.pendingInvites}
      workspaceAlertMessage={workspaceAlertMessage}
    >
      {children}
    </DashboardWorkspace>
  );
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MaintenanceGate area="dashboard">
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </MaintenanceGate>
  );
}
