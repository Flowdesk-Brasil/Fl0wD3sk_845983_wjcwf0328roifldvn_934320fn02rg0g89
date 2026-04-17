type ConfigSelectionPlanState = {
  plan_code?: string | null;
  status: "inactive" | "trial" | "active" | "expired" | string | null;
  max_licensed_servers: number | null;
};

type ConfigRedirectBypassInput = {
  userPlanState: ConfigSelectionPlanState | null | undefined;
  targetPlanCode?: string | null;
  searchParams?:
    | URLSearchParams
    | Record<string, string | null | undefined>;
};

function normalizeLicensedServerCount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeMaxLicensedServers(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.max(1, Math.floor(value));
}

export function hasActiveConfigSelectionPlan(
  userPlanState: ConfigSelectionPlanState | null | undefined,
) {
  return userPlanState?.status === "active" || userPlanState?.status === "trial";
}

export function resolveConfigSelectionMaxLicensedServers(input: {
  userPlanState: ConfigSelectionPlanState | null | undefined;
  targetPlanMaxLicensedServers: number;
}) {
  const targetPlanMaxLicensedServers = normalizeMaxLicensedServers(
    input.targetPlanMaxLicensedServers,
  );

  if (!hasActiveConfigSelectionPlan(input.userPlanState)) {
    return targetPlanMaxLicensedServers;
  }

  const currentPlanMaxLicensedServers = normalizeMaxLicensedServers(
    input.userPlanState?.max_licensed_servers,
  );

  return Math.max(currentPlanMaxLicensedServers, targetPlanMaxLicensedServers);
}

export function shouldBlockConfigServerSelection(input: {
  userPlanState: ConfigSelectionPlanState | null | undefined;
  licensedServersCount: number;
  targetPlanMaxLicensedServers: number;
}) {
  if (!hasActiveConfigSelectionPlan(input.userPlanState)) {
    return false;
  }

  const licensedServersCount = normalizeLicensedServerCount(
    input.licensedServersCount,
  );
  const maxLicensedServers = resolveConfigSelectionMaxLicensedServers({
    userPlanState: input.userPlanState,
    targetPlanMaxLicensedServers: input.targetPlanMaxLicensedServers,
  });

  return licensedServersCount >= maxLicensedServers;
}

function readSearchParam(
  input: ConfigRedirectBypassInput["searchParams"],
  key: string,
) {
  if (!input) return null;

  if (input instanceof URLSearchParams) {
    const value = input.get(key);
    return typeof value === "string" ? value : null;
  }

  const value = input[key];
  return typeof value === "string" ? value : null;
}

function isTruthyQueryFlag(value: string | null) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function shouldBypassConfigServerSelectionBlock(
  input: ConfigRedirectBypassInput,
) {
  const source =
    readSearchParam(input.searchParams, "source")?.trim().toLowerCase() || null;
  const renew = isTruthyQueryFlag(readSearchParam(input.searchParams, "renew"));
  const fresh = isTruthyQueryFlag(readSearchParam(input.searchParams, "fresh"));
  const hasActivePlan = hasActiveConfigSelectionPlan(input.userPlanState);
  const currentPlanCode =
    typeof input.userPlanState?.plan_code === "string"
      ? input.userPlanState.plan_code.trim().toLowerCase()
      : null;
  const targetPlanCode =
    typeof input.targetPlanCode === "string"
      ? input.targetPlanCode.trim().toLowerCase()
      : null;

  if (renew) return true;

  if (
    source === "servers-plans" ||
    source === "downgrade-regularization"
  ) {
    return true;
  }

  if (
    fresh &&
    hasActivePlan &&
    targetPlanCode &&
    currentPlanCode &&
    currentPlanCode !== targetPlanCode
  ) {
    return true;
  }

  return false;
}
