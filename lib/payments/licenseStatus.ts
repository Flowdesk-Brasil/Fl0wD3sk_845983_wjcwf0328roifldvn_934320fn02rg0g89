import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export type GuildLicenseStatus = "paid" | "expired" | "off" | "not_paid";

export const LICENSE_VALIDITY_DAYS = 30;
export const EXPIRED_GRACE_DAYS = 3;
export const LICENSE_VALIDITY_MS = LICENSE_VALIDITY_DAYS * 24 * 60 * 60 * 1000;
export const EXPIRED_GRACE_MS = EXPIRED_GRACE_DAYS * 24 * 60 * 60 * 1000;

type ApprovedOrderRecord = {
  paid_at: string | null;
  created_at: string;
};

type ApprovedOrderWithUserRecord = ApprovedOrderRecord & {
  guild_id: string;
  user_id: number;
};

export type LockedGuildLicenseRecord = {
  guildId: string;
  userId: number;
  status: "paid" | "expired";
  paidAt: string | null;
  createdAt: string;
};

export function resolveLicenseBaseTimestamp(order: ApprovedOrderRecord) {
  const paidAtMs = order.paid_at ? Date.parse(order.paid_at) : Number.NaN;
  if (Number.isFinite(paidAtMs)) return paidAtMs;

  const createdAtMs = Date.parse(order.created_at);
  if (Number.isFinite(createdAtMs)) return createdAtMs;

  return Date.now();
}

export function resolveGuildLicenseStatusFromLatestApprovedOrder(
  latestApprovedOrder: ApprovedOrderRecord | null,
  nowMs = Date.now(),
): GuildLicenseStatus {
  if (!latestApprovedOrder) return "not_paid";

  const baseTimestamp = resolveLicenseBaseTimestamp(latestApprovedOrder);
  const licenseExpiresAtMs = baseTimestamp + LICENSE_VALIDITY_MS;
  const graceExpiresAtMs = licenseExpiresAtMs + EXPIRED_GRACE_MS;

  if (nowMs <= licenseExpiresAtMs) return "paid";
  if (nowMs <= graceExpiresAtMs) return "expired";
  return "off";
}

export async function getLatestApprovedOrderForGuild(guildId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("payment_orders")
    .select("paid_at, created_at")
    .eq("guild_id", guildId)
    .eq("status", "approved")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ApprovedOrderRecord>();

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.data || null;
}

export async function getGuildLicenseStatus(guildId: string) {
  const latestApprovedOrder = await getLatestApprovedOrderForGuild(guildId);
  return resolveGuildLicenseStatusFromLatestApprovedOrder(latestApprovedOrder);
}

export async function getLockedGuildLicenseByGuildId(guildId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("payment_orders")
    .select("guild_id, user_id, paid_at, created_at")
    .eq("guild_id", guildId)
    .eq("status", "approved")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<ApprovedOrderWithUserRecord>();

  if (result.error) {
    throw new Error(result.error.message);
  }

  const record = result.data || null;
  if (!record) return null;

  const status = resolveGuildLicenseStatusFromLatestApprovedOrder(record);
  if (status !== "paid" && status !== "expired") return null;

  return {
    guildId: record.guild_id,
    userId: record.user_id,
    status,
    paidAt: record.paid_at,
    createdAt: record.created_at,
  } satisfies LockedGuildLicenseRecord;
}

export async function getLockedGuildLicenseMap(guildIds: string[]) {
  const normalizedGuildIds = Array.from(
    new Set(
      guildIds.filter(
        (guildId): guildId is string =>
          typeof guildId === "string" && guildId.trim().length > 0,
      ),
    ),
  );

  const lockedMap = new Map<string, LockedGuildLicenseRecord>();
  if (!normalizedGuildIds.length) {
    return lockedMap;
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("payment_orders")
    .select("guild_id, user_id, paid_at, created_at")
    .in("guild_id", normalizedGuildIds)
    .eq("status", "approved")
    .order("paid_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .returns<ApprovedOrderWithUserRecord[]>();

  if (result.error) {
    throw new Error(result.error.message);
  }

  for (const record of result.data || []) {
    if (lockedMap.has(record.guild_id)) continue;

    const status = resolveGuildLicenseStatusFromLatestApprovedOrder(record);
    if (status !== "paid" && status !== "expired") continue;

    lockedMap.set(record.guild_id, {
      guildId: record.guild_id,
      userId: record.user_id,
      status,
      paidAt: record.paid_at,
      createdAt: record.created_at,
    });
  }

  return lockedMap;
}
