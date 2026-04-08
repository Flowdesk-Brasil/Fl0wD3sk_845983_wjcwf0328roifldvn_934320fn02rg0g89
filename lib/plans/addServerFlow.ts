type AddServerPlanStateResponse = {
  ok?: boolean;
  plan?: {
    planCode?: string | null;
  } | null;
  usage?: {
    hasReachedLicensedServersLimit?: boolean;
  } | null;
};

export function buildServersPlansPath(reason = "server-limit") {
  return `/servers/plans?reason=${encodeURIComponent(reason)}`;
}

export async function resolveAddServerTargetHref() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch("/api/auth/me/plan-state", {
      cache: "no-store",
      signal: controller.signal,
    });
    const payload = (await response.json().catch(() => null)) as
      | AddServerPlanStateResponse
      | null;

    if (
      response.ok &&
      payload?.ok &&
      payload.plan?.planCode &&
      payload.usage?.hasReachedLicensedServersLimit
    ) {
      return buildServersPlansPath();
    }
  } catch {
    // Em caso de falha de rede, mantemos o fluxo padrao de onboarding.
  } finally {
    window.clearTimeout(timeoutId);
  }

  return "/config/#/step/1";
}
