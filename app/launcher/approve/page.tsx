import { getCurrentUserFromSessionCookieSafe } from "@/lib/auth/session";
import { LauncherApproveClient } from "./LauncherApproveClient";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LauncherApprovePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string | string[] }>;
}) {
  const params = (await searchParams) || {};
  const tokenValue = Array.isArray(params.token) ? params.token[0] : params.token;
  const attemptToken = String(tokenValue || "").trim();
  const session = await getCurrentUserFromSessionCookieSafe();
  const nextPath = `/launcher/approve?token=${encodeURIComponent(attemptToken)}`;
  if (!session.user) {
    redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  }
  return (
    <LauncherApproveClient
      attemptToken={attemptToken}
      alreadyAuthenticated
      loginHref={`/login?next=${encodeURIComponent(nextPath)}`}
    />
  );
}
