import { redirect } from "next/navigation";
import { ServersDashboard } from "@/components/servers/ServersDashboard";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";

export default async function ServersPage() {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect("/login");
  }

  return <ServersDashboard displayName={user.display_name} />;
}

