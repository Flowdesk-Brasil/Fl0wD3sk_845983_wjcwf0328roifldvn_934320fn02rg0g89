import { notFound } from "next/navigation";
import { HostingWorkspace } from "@/components/dashboard/HostingWorkspace";
import { getCurrentUserFromSessionCookieSafe } from "@/lib/auth/session";
import {
  HOSTING_STEP_BY_PATH_SEGMENT,
  type HostingStep,
} from "@/lib/hosting/catalog";
import { resolveHostingGitHubConnectedForUser } from "@/lib/hosting/github";

type DashboardHostingStepPageProps = {
  params: Promise<{
    step: string;
  }>;
};

export default async function DashboardHostingStepPage({
  params,
}: DashboardHostingStepPageProps) {
  const { step } = await params;
  const initialStep = HOSTING_STEP_BY_PATH_SEGMENT[step] as HostingStep | undefined;

  if (!initialStep) {
    notFound();
  }

  const session = await getCurrentUserFromSessionCookieSafe();
  const githubConnected = session.user?.id
    ? await resolveHostingGitHubConnectedForUser(session.user.id)
    : false;

  return (
    <HostingWorkspace
      initialStep={initialStep}
      forceOnboarding
      githubConnected={githubConnected}
    />
  );
}
