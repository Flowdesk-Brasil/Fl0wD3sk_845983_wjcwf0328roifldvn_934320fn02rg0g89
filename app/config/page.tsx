import { redirect } from "next/navigation";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { ConfigFlow } from "@/components/config/ConfigFlow";

export default async function ConfigPage() {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    redirect("/login");
  }

  return <ConfigFlow displayName={user.display_name} />;
}
