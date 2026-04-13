import { redirect } from "next/navigation";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { TabRenderer } from "@/components/account/TabRegistry";

export default async function AccountSettingsPage() {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect("/login");
  }

  return (
    <TabRenderer 
      id="overview" 
      displayName={user.display_name} 
      avatarUrl={user.avatar ? `https://cdn.discordapp.com/avatars/${user.discord_user_id}/${user.avatar}.png` : null} 
    />
  );
}
