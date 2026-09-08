import type { SupabaseClient } from "@supabase/supabase-js";

export type HostingRepositoryIdentity = {
  owner: string;
  name: string;
  id?: string | null;
};

export type HostingRepositoryConflict = {
  vpsCode: string;
  owner: string;
  name: string;
};

function escapePostgrestValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildHostingRepositoryConflictFilter(repository: HostingRepositoryIdentity) {
  const owner = escapePostgrestValue(repository.owner);
  const name = escapePostgrestValue(repository.name);
  const filters = [`and(github_owner.eq.${owner},github_repo.eq.${name})`];
  if (repository.id) {
    filters.unshift(`github_repo_id.eq.${escapePostgrestValue(repository.id)}`);
  }
  return filters.join(",");
}

export async function findUserHostingRepositoryConflict(
  supabase: SupabaseClient,
  userId: number,
  repository: HostingRepositoryIdentity,
  excludeProjectId?: number,
) {
  let query = supabase
    .from("hosting_projects")
    .select("id, vps_code, github_owner, github_repo, status")
    .eq("user_id", userId)
    .not("status", "in", "(cancelled,deleted)")
    .or(buildHostingRepositoryConflictFilter(repository));

  if (typeof excludeProjectId === "number" && Number.isFinite(excludeProjectId)) {
    query = query.neq("id", excludeProjectId);
  }

  const { data, error } = await query.maybeSingle<{
    id: number;
    vps_code: string;
    github_owner: string;
    github_repo: string;
    status: string;
  }>();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.vps_code) {
    return null;
  }

  return {
    vpsCode: data.vps_code,
    owner: data.github_owner,
    name: data.github_repo,
  } satisfies HostingRepositoryConflict;
}

export function readHostingRepositoryPending(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  return (payload as Record<string, unknown>).repositoryPending === true;
}

export function readHostingRepositoryConflict(payload: unknown): HostingRepositoryConflict | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const conflict = record.repositoryConflict;
  if (!conflict || typeof conflict !== "object" || Array.isArray(conflict)) {
    return null;
  }
  const conflictRecord = conflict as Record<string, unknown>;
  const vpsCode = typeof conflictRecord.vpsCode === "string" ? conflictRecord.vpsCode : null;
  const owner = typeof conflictRecord.owner === "string" ? conflictRecord.owner : null;
  const name = typeof conflictRecord.name === "string" ? conflictRecord.name : null;
  if (!vpsCode || !owner || !name) {
    return null;
  }
  return { vpsCode, owner, name };
}

export function withHostingRepositoryPendingFlags(
  payload: Record<string, unknown>,
  input: {
    pending: boolean;
    conflict?: HostingRepositoryConflict | null;
  },
) {
  if (!input.pending) {
    const next = { ...payload };
    delete next.repositoryPending;
    delete next.repositoryConflict;
    return next;
  }

  return {
    ...payload,
    repositoryPending: true,
    repositoryConflict: input.conflict
      ? {
          vpsCode: input.conflict.vpsCode,
          owner: input.conflict.owner,
          name: input.conflict.name,
        }
      : null,
  };
}

export function isPaymentOrderHostingProjectUniqueViolation(message: string | null | undefined) {
  if (!message) return false;
  return message.includes("idx_hosting_projects_payment_order_unique");
}
