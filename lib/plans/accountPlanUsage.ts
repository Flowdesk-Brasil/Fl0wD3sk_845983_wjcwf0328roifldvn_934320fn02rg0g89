import type { UserPlanStateRecord } from "@/lib/plans/state";

export type AccountPlanUsageSnapshot = {
  licensedServersCount: number;
  maxLicensedServers: number;
  remainingLicensedServers: number;
  hasReachedLicensedServersLimit: boolean;
  canAddMoreServers: boolean;
};

export function buildAccountPlanUsageSnapshot(
  planState: UserPlanStateRecord | null,
  licensedServersCount: number,
): AccountPlanUsageSnapshot {
  const normalizedLicensedServersCount = Math.max(0, licensedServersCount);

  if (!planState) {
    return {
      licensedServersCount: normalizedLicensedServersCount,
      maxLicensedServers: 0,
      remainingLicensedServers: 0,
      hasReachedLicensedServersLimit: false,
      canAddMoreServers: true,
    };
  }

  const maxLicensedServers = Math.max(planState.max_licensed_servers || 1, 1);
  const remainingLicensedServers = Math.max(
    maxLicensedServers - normalizedLicensedServersCount,
    0,
  );
  const hasReachedLicensedServersLimit =
    normalizedLicensedServersCount >= maxLicensedServers;
  const canAddMoreServers =
    (planState.status === "active" || planState.status === "trial") &&
    !hasReachedLicensedServersLimit;

  return {
    licensedServersCount: normalizedLicensedServersCount,
    maxLicensedServers,
    remainingLicensedServers,
    hasReachedLicensedServersLimit,
    canAddMoreServers,
  };
}
