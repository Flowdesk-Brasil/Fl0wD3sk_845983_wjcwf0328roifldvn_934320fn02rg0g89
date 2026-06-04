import { redirect } from "next/navigation";
import { AccountWorkspace } from "@/components/account/AccountWorkspace";
import { MaintenanceGate } from "@/components/common/MaintenanceGate";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { resolveAuthUserAvatarUrl } from "@/lib/auth/avatar";

async function AccountLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect("/login");
  }

  return (
    <AccountWorkspace
      authUserId={user.id}
      discordUserId={user.discord_user_id}
      displayName={user.display_name}
      username={user.username}
      avatarUrl={resolveAuthUserAvatarUrl(user)}
    >
      {children}
    </AccountWorkspace>
  );
}

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <MaintenanceGate area="account">
      <AccountLayoutContent>{children}</AccountLayoutContent>
    </MaintenanceGate>
  );
}
