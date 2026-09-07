import "server-only";

import crypto from "node:crypto";
import {
  decryptFlowSecureValue,
  encryptFlowSecureValue,
  hashFlowSecureValue,
} from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { getPanelManagedServersSnapshotForCurrentSession } from "@/lib/servers/managedServers";
import { decryptWhitelistSecret } from "@/lib/servers/whitelistSecret";
import { normalizeWhitelistMapping } from "@/lib/servers/whitelistMapping";
import { isWhitelistAgentOperation } from "@/lib/servers/whitelistAgent";
import { invalidateDashboardSettingsCache } from "@/lib/servers/serverDashboardSettingsCache";
import { looksLikePublicCityDbHost, normalizeCityDbHost } from "@/lib/servers/whitelistHost";

const LOGIN_TTL_MINUTES = 10;
const ACCESS_TTL_HOURS = 12;
const REFRESH_TTL_DAYS = 60;
const ONLINE_WINDOW_MS = 45_000;
export const LAUNCHER_BIND_GUILD_COOKIE = "flowdesk_launcher_bind_guild";

export function parseLauncherBindGuildCookie(cookieHeader: string | null | undefined) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${LAUNCHER_BIND_GUILD_COOKIE}=([^;]+)`),
  );
  const value = decodeURIComponent(match?.[1] || "").trim();
  return /^\d{5,32}$/.test(value) ? value : null;
}

export function buildLauncherBindGuildCookie(guildId: string, hostname: string) {
  const normalized = String(guildId || "").trim();
  if (!/^\d{5,32}$/.test(normalized)) return null;
  const firstParty = hostname.endsWith("flwdesk.com");
  return [
    `${LAUNCHER_BIND_GUILD_COOKIE}=${encodeURIComponent(normalized)}`,
    "Path=/",
    "Max-Age=604800",
    "SameSite=Lax",
    firstParty ? "Domain=.flwdesk.com" : "",
    firstParty ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

export type LauncherServerSummary = {
  guildId: string;
  guildName: string;
  iconUrl: string | null;
  status: string;
};

export type LauncherSession = {
  tokenId: string;
  deviceId: string;
  authUserId: number;
  displayName: string;
  email: string | null;
  guildId: string | null;
  devicePublicId: string;
  connectionStatus: string;
  lastSeenAt: string | null;
  lastError: string | null;
  hostname: string;
  servers: LauncherServerSummary[];
};

function resolveAccountOrigin() {
  const raw =
    process.env.NEXT_PUBLIC_ACCOUNT_URL ||
    (process.env.NODE_ENV !== "production"
      ? process.env.NEXT_PUBLIC_ACCOUNT_URL_LOCAL
      : "") ||
    "https://account.flwdesk.com";
  return raw
    .replace(/\/+$/, "")
    .replace("https://www.flwdesk.com", "https://account.flwdesk.com");
}

export function resolveLauncherWebOrigin(request?: Request | null) {
  const host = `${request?.headers.get("host") || ""} ${request?.url || ""}`;
  if (/localhost|127\.0\.0\.1/i.test(host)) {
    return "http://localhost:3000";
  }
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }
  return resolveAccountOrigin();
}

function isoFromNow(input: { minutes?: number; hours?: number; days?: number }) {
  const date = new Date();
  if (input.minutes) date.setMinutes(date.getMinutes() + input.minutes);
  if (input.hours) date.setHours(date.getHours() + input.hours);
  if (input.days) date.setDate(date.getDate() + input.days);
  return date.toISOString();
}

function hashLauncherValue(
  token: string,
  purpose: "launcher_login_token" | "launcher_access_token",
  subcontext: string,
) {
  const hash = hashFlowSecureValue(token, { purpose, subcontext, encoding: "hex" });
  if (!hash) throw new Error("Nao foi possivel proteger o token do launcher.");
  return hash;
}

function encryptCompletedPayload(payload: string, attemptId: string) {
  const encrypted = encryptFlowSecureValue(payload, {
    purpose: "launcher_access_token",
    aad: `launcher_login:${attemptId}`,
    subcontext: "completed_payload",
  });
  if (!encrypted) throw new Error("Nao foi possivel proteger a sessao do launcher.");
  return encrypted;
}

function decryptCompletedPayload(cipher: string, attemptId: string) {
  const decrypted = decryptFlowSecureValue(cipher, {
    purpose: "launcher_access_token",
    aad: `launcher_login:${attemptId}`,
    subcontext: "completed_payload",
  });
  if (!decrypted) throw new Error("Sessao do launcher indisponivel.");
  return decrypted;
}

function randomToken(prefix: string, bytes = 32) {
  return `${prefix}${crypto.randomBytes(bytes).toString("base64url")}`;
}

function loginCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let value = "";
  for (let index = 0; index < 6; index += 1) {
    value += alphabet[crypto.randomInt(0, alphabet.length)];
  }
  return `${value.slice(0, 3)}-${value.slice(3)}`;
}

export function isLauncherOnline(lastSeenAt: string | null | undefined) {
  if (!lastSeenAt) return false;
  const parsed = Date.parse(lastSeenAt);
  return Number.isFinite(parsed) && Date.now() - parsed < ONLINE_WINDOW_MS;
}

export async function startLauncherLogin(input: {
  deviceLabel?: string;
  hostname?: string;
  platform?: string;
  installId?: string;
  appVersion?: string;
  origin?: string;
}) {
  const attemptToken = randomToken("flw_att_");
  const pollToken = randomToken("flw_poll_");
  const code = loginCode();
  const expiresAt = isoFromNow({ minutes: LOGIN_TTL_MINUTES });
  const supabase = getSupabaseAdminClientOrThrow();
  const inserted = await supabase
    .from("launcher_login_attempts")
    .insert({
      status: "pending",
      attempt_token_hash: hashLauncherValue(attemptToken, "launcher_login_token", "attempt"),
      poll_token_hash: hashLauncherValue(pollToken, "launcher_login_token", "poll"),
      login_code: code,
      device_label: String(input.deviceLabel || "Flowdesk Launcher").slice(0, 80),
      hostname: String(input.hostname || "").slice(0, 80),
      platform: String(input.platform || "").slice(0, 40),
      install_id_hash: hashLauncherValue(
        String(input.installId || crypto.randomUUID()),
        "launcher_login_token",
        "install",
      ),
      app_version: String(input.appVersion || "").slice(0, 24),
      expires_at: expiresAt,
    })
    .select("id")
    .single();
  if (inserted.error) throw new Error(inserted.error.message);
  const origin = input.origin || resolveAccountOrigin();
  const nextPath = `/launcher/approve?token=${encodeURIComponent(attemptToken)}`;
  return {
    loginCode: code,
    attemptToken,
    pollToken,
    expiresAt,
    verificationUrl: `${origin}${nextPath}`,
    loginUrl: `${origin}/login?next=${encodeURIComponent(nextPath)}`,
  };
}

export async function pollLauncherLogin(pollToken: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const hashed = hashLauncherValue(pollToken, "launcher_login_token", "poll");
  const row = await supabase
    .from("launcher_login_attempts")
    .select("id, status, expires_at, completed_payload_cipher")
    .eq("poll_token_hash", hashed)
    .maybeSingle();
  if (!row.data) return { status: "revoked" as const };
  if (row.data.status === "pending" && Date.parse(row.data.expires_at) <= Date.now()) {
    await supabase
      .from("launcher_login_attempts")
      .update({ status: "expired" })
      .eq("id", row.data.id)
      .eq("status", "pending");
    return { status: "expired" as const, expiresAt: row.data.expires_at };
  }
  if (row.data.status !== "completed") {
    return { status: row.data.status as "pending" | "expired" | "revoked", expiresAt: row.data.expires_at };
  }
  const payload = row.data.completed_payload_cipher
    ? JSON.parse(decryptCompletedPayload(row.data.completed_payload_cipher, row.data.id))
    : null;
  await supabase
    .from("launcher_login_attempts")
    .update({ completed_payload_cipher: null })
    .eq("id", row.data.id);
  return {
    status: "completed" as const,
    accessToken: payload?.accessToken || null,
    refreshToken: payload?.refreshToken || null,
    expiresAt: payload?.accessExpiresAt || null,
    user: payload?.user || null,
  };
}

function safeDecryptWhitelistPassword(cipher: string | null | undefined, guildId: string) {
  try {
    return cipher ? decryptWhitelistSecret(cipher, guildId) : "";
  } catch {
    return "";
  }
}

async function upsertLauncherGuildBinding(input: {
  deviceId: string;
  devicePublicId: string;
  authUserId: number;
  guildId: string;
  observedIp?: string | null;
  appVersion?: string | null;
  error?: string | null;
  requirePanel?: boolean;
}) {
  const supabase = getSupabaseAdminClientOrThrow();
  const now = new Date().toISOString();
  const online = !input.error;
  const observedIp = looksLikePublicCityDbHost(String(input.observedIp || ""))
    ? normalizeCityDbHost(String(input.observedIp || ""))
    : "";
  const devicePatch: Record<string, unknown> = {
    guild_id: input.guildId,
    connection_status: online ? "online" : "error",
    last_error: input.error || null,
    last_seen_at: now,
    app_version: input.appVersion || undefined,
  };
  if (observedIp) devicePatch.observed_ip = observedIp;
  const deviceUpdate = await supabase
    .from("launcher_devices")
    .update(devicePatch)
    .eq("id", input.deviceId);
  if (deviceUpdate.error) {
    throw new Error(deviceUpdate.error.message || "Falha ao vincular o dispositivo.");
  }

  const existing = await supabase
    .from("guild_whitelist_settings")
    .select("guild_id, db_host, agent_public_ip")
    .eq("guild_id", input.guildId)
    .maybeSingle();
  const savedHost = looksLikePublicCityDbHost(String(existing.data?.db_host || ""))
    ? normalizeCityDbHost(String(existing.data?.db_host || ""))
    : "";
  const keptPublicIp = looksLikePublicCityDbHost(String(existing.data?.agent_public_ip || ""))
    ? normalizeCityDbHost(String(existing.data?.agent_public_ip || ""))
    : "";
  const patch: Record<string, unknown> = {
    guild_id: input.guildId,
    connection_mode: "direct",
    agent_public_id: input.devicePublicId,
    agent_last_seen_at: now,
    configured_by_user_id: input.authUserId,
    last_health_at: now,
    last_health_ok: online,
    last_health_error: input.error || null,
  };
  if (observedIp) {
    patch.agent_public_ip = observedIp;
    if (!savedHost) patch.db_host = observedIp;
  } else if (keptPublicIp) {
    patch.agent_public_ip = keptPublicIp;
    if (!savedHost) patch.db_host = keptPublicIp;
  } else if (!savedHost) {
    patch.db_host = null;
  }
  const write = existing.data
    ? await supabase.from("guild_whitelist_settings").update(patch).eq("guild_id", input.guildId)
    : await supabase.from("guild_whitelist_settings").insert({ ...patch, enabled: false });
  if (write.error) {
    const upserted = await supabase.from("guild_whitelist_settings").upsert(
      { ...patch, enabled: false },
      { onConflict: "guild_id" },
    );
    if (upserted.error) {
      if (input.requirePanel !== false) {
        throw new Error(upserted.error.message || "Falha ao vincular o launcher no painel.");
      }
      invalidateDashboardSettingsCache({ guildId: input.guildId });
      return;
    }
  }
  invalidateDashboardSettingsCache({ guildId: input.guildId });
}

async function attachLauncherDeviceToGuild(input: {
  deviceId: string;
  devicePublicId: string;
  authUserId: number;
  guildId: string;
}) {
  await upsertLauncherGuildBinding({ ...input, requirePanel: false });
}

export async function completeLauncherLogin(
  attemptToken: string,
  options?: { preferredGuildId?: string | null },
) {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session?.user?.id) {
    return { ok: false as const, code: "unauthenticated" as const };
  }
  const supabase = getSupabaseAdminClientOrThrow();
  const hashed = hashLauncherValue(attemptToken, "launcher_login_token", "attempt");
  const attempt = await supabase
    .from("launcher_login_attempts")
    .select("*")
    .eq("attempt_token_hash", hashed)
    .maybeSingle();
  if (!attempt.data || attempt.data.status !== "pending") {
    return { ok: false as const, code: "invalid_attempt" as const };
  }
  if (Date.parse(attempt.data.expires_at) <= Date.now()) {
    await supabase.from("launcher_login_attempts").update({ status: "expired" }).eq("id", attempt.data.id);
    return { ok: false as const, code: "expired" as const };
  }

  let servers: LauncherServerSummary[] = [];
  try {
    const snapshot = await getPanelManagedServersSnapshotForCurrentSession({ forceFresh: false });
    servers = (snapshot.servers || [])
      .filter((server) => server.status === "paid" && server.canManage)
      .map((server) => ({
        guildId: server.guildId,
        guildName: server.guildName,
        iconUrl: server.iconUrl,
        status: server.status,
      }));
  } catch {
    servers = [];
  }

  const existingDevice = await supabase
    .from("launcher_devices")
    .select("id, device_public_id, guild_id")
    .eq("auth_user_id", session.user.id)
    .eq("install_id_hash", attempt.data.install_id_hash)
    .maybeSingle();

  const devicePublicId =
    existingDevice.data?.device_public_id || `fdl_${crypto.randomBytes(12).toString("hex")}`;
  const deviceRow = {
    auth_user_id: session.user.id,
    device_public_id: devicePublicId,
    install_id_hash: attempt.data.install_id_hash,
    hostname: attempt.data.hostname,
    platform: attempt.data.platform,
    app_version: attempt.data.app_version,
    label: attempt.data.device_label || "Flowdesk Launcher",
    connection_status: existingDevice.data?.guild_id ? "online" : "awaiting_server",
    servers_cache: servers,
    last_seen_at: new Date().toISOString(),
  };

  const upserted = existingDevice.data
    ? await supabase.from("launcher_devices").update(deviceRow).eq("id", existingDevice.data.id).select("id, guild_id, device_public_id").single()
    : await supabase.from("launcher_devices").insert(deviceRow).select("id, guild_id, device_public_id").single();
  if (upserted.error || !upserted.data) {
    throw new Error(upserted.error?.message || "Falha ao registrar o dispositivo.");
  }

  await supabase
    .from("launcher_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("device_id", upserted.data.id)
    .is("revoked_at", null);

  const accessToken = randomToken("flw_lnch_");
  const refreshToken = randomToken("flw_lnchr_");
  const accessExpiresAt = isoFromNow({ hours: ACCESS_TTL_HOURS });
  const refreshExpiresAt = isoFromNow({ days: REFRESH_TTL_DAYS });
  const tokenInsert = await supabase.from("launcher_tokens").insert({
    device_id: upserted.data.id,
    auth_user_id: session.user.id,
    access_token_hash: hashLauncherValue(accessToken, "launcher_access_token", "access"),
    refresh_token_hash: hashLauncherValue(refreshToken, "launcher_access_token", "refresh"),
    access_expires_at: accessExpiresAt,
    refresh_expires_at: refreshExpiresAt,
  });
  if (tokenInsert.error) throw new Error(tokenInsert.error.message);

  const payload = encryptCompletedPayload(
    JSON.stringify({
      accessToken,
      refreshToken,
      accessExpiresAt,
      user: {
        displayName: session.user.display_name,
        email: session.user.email,
      },
    }),
    attempt.data.id,
  );

  const preferredGuildId = String(options?.preferredGuildId || "").trim();
  const boundGuildId =
    upserted.data.guild_id ||
    (preferredGuildId && servers.some((server) => server.guildId === preferredGuildId)
      ? preferredGuildId
      : "") ||
    (servers.length === 1 ? servers[0].guildId : "");
  if (boundGuildId && !upserted.data.guild_id) {
    await attachLauncherDeviceToGuild({
      deviceId: upserted.data.id,
      devicePublicId: upserted.data.device_public_id,
      authUserId: session.user.id,
      guildId: boundGuildId,
    });
  }

  await supabase
    .from("launcher_login_attempts")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      auth_user_id: session.user.id,
      device_id: upserted.data.id,
      completed_payload_cipher: payload,
    })
    .eq("id", attempt.data.id);

  const boundServer = servers.find((server) => server.guildId === boundGuildId) || null;
  return {
    ok: true as const,
    displayName: session.user.display_name,
    bound: Boolean(boundGuildId),
    guildName: boundServer?.guildName || null,
  };
}

export async function resolveLauncherBearer(authorization: string | null) {
  const token = String(authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token.startsWith("flw_lnch_")) return null;
  const supabase = getSupabaseAdminClientOrThrow();
  const hashed = hashLauncherValue(token, "launcher_access_token", "access");
  const row = await supabase
    .from("launcher_tokens")
    .select("id, device_id, auth_user_id, access_expires_at, revoked_at")
    .eq("access_token_hash", hashed)
    .maybeSingle();
  if (!row.data || row.data.revoked_at) return null;
  if (Date.parse(row.data.access_expires_at) <= Date.now()) return null;
  const device = await supabase
    .from("launcher_devices")
    .select("*")
    .eq("id", row.data.device_id)
    .maybeSingle();
  if (!device.data) return null;
  const user = await supabase
    .from("auth_users")
    .select("id, display_name, email")
    .eq("id", row.data.auth_user_id)
    .maybeSingle();
  await supabase
    .from("launcher_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", row.data.id);
  return {
    tokenId: row.data.id,
    deviceId: device.data.id,
    authUserId: row.data.auth_user_id,
    displayName: user.data?.display_name || "Conta Flowdesk",
    email: user.data?.email || null,
    guildId: device.data.guild_id,
    devicePublicId: device.data.device_public_id,
    connectionStatus: device.data.connection_status,
    lastSeenAt: device.data.last_seen_at,
    lastError: device.data.last_error,
    hostname: device.data.hostname,
    servers: Array.isArray(device.data.servers_cache) ? device.data.servers_cache : [],
  } satisfies LauncherSession;
}

export async function refreshLauncherSession(refreshToken: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const hashed = hashLauncherValue(refreshToken, "launcher_access_token", "refresh");
  const row = await supabase
    .from("launcher_tokens")
    .select("*")
    .eq("refresh_token_hash", hashed)
    .maybeSingle();
  if (!row.data || row.data.revoked_at) return null;
  if (Date.parse(row.data.refresh_expires_at) <= Date.now()) return null;
  const accessToken = randomToken("flw_lnch_");
  const nextRefresh = randomToken("flw_lnchr_");
  const accessExpiresAt = isoFromNow({ hours: ACCESS_TTL_HOURS });
  const refreshExpiresAt = isoFromNow({ days: REFRESH_TTL_DAYS });
  await supabase
    .from("launcher_tokens")
    .update({
      access_token_hash: hashLauncherValue(accessToken, "launcher_access_token", "access"),
      refresh_token_hash: hashLauncherValue(nextRefresh, "launcher_access_token", "refresh"),
      access_expires_at: accessExpiresAt,
      refresh_expires_at: refreshExpiresAt,
      last_used_at: new Date().toISOString(),
    })
    .eq("id", row.data.id);
  return { accessToken, refreshToken: nextRefresh, expiresAt: accessExpiresAt };
}

export async function revokeLauncherSession(session: LauncherSession) {
  const supabase = getSupabaseAdminClientOrThrow();
  await supabase
    .from("launcher_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", session.tokenId);
  await supabase
    .from("launcher_devices")
    .update({ connection_status: "offline" })
    .eq("id", session.deviceId);
}

export async function bindLauncherGuild(
  session: LauncherSession,
  guildId: string,
  input?: { observedIp?: string | null },
) {
  const allowed = (session.servers || []).some((server) => server.guildId === guildId);
  if (!allowed) {
    throw new Error("Este servidor nao esta disponivel para a conta conectada.");
  }
  await upsertLauncherGuildBinding({
    deviceId: session.deviceId,
    devicePublicId: session.devicePublicId,
    authUserId: session.authUserId,
    guildId,
    observedIp: input?.observedIp,
    requirePanel: false,
  });
}

export async function markLauncherHeartbeat(
  session: LauncherSession,
  input: { observedIp?: string | null; appVersion?: string | null; error?: string | null },
) {
  const supabase = getSupabaseAdminClientOrThrow();
  const now = new Date().toISOString();
  const online = !input.error;
  if (session.guildId) {
    await upsertLauncherGuildBinding({
      deviceId: session.deviceId,
      devicePublicId: session.devicePublicId,
      authUserId: session.authUserId,
      guildId: session.guildId,
      observedIp: input.observedIp,
      appVersion: input.appVersion,
      error: input.error,
      requirePanel: false,
    });
    return;
  }
  const awaitingPatch: Record<string, unknown> = {
    connection_status: "awaiting_server",
    last_seen_at: now,
    last_error: input.error || null,
    app_version: input.appVersion || undefined,
  };
  if (looksLikePublicCityDbHost(String(input.observedIp || ""))) {
    awaitingPatch.observed_ip = normalizeCityDbHost(String(input.observedIp || ""));
  }
  const deviceUpdate = await supabase
    .from("launcher_devices")
    .update(awaitingPatch)
    .eq("id", session.deviceId);
  if (deviceUpdate.error) {
    throw new Error(deviceUpdate.error.message || "Falha no heartbeat do launcher.");
  }
}

export async function buildLauncherSyncPayload(session: LauncherSession, body: Record<string, unknown>) {
  if (!session.guildId) {
    return { ok: true, message: "Escolha um servidor para conectar.", jobs: [], config: null };
  }
  const supabase = getSupabaseAdminClientOrThrow();
  const settings = await supabase
    .from("guild_whitelist_settings")
    .select(
      "guild_id, mapping, db_engine, db_host, db_port, db_name, db_user, db_ssl, db_password_cipher, connection_mode, agent_public_ip",
    )
    .eq("guild_id", session.guildId)
    .maybeSingle();

  const incomingResults = Array.isArray(body.results) ? body.results : [];
  const jobs: Array<Record<string, unknown>> = [];
  const mapping = normalizeWhitelistMapping(settings.data?.mapping);
  try {
    for (const item of incomingResults.slice(0, 8)) {
      const record = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
      const jobId = Number(record.id);
      if (!Number.isFinite(jobId)) continue;
      const job = await supabase
        .from("guild_whitelist_agent_jobs")
        .select("id, guild_id, request_id, operation, status")
        .eq("id", jobId)
        .eq("guild_id", session.guildId)
        .maybeSingle();
      if (!job.data || (job.data.status !== "claimed" && job.data.status !== "queued")) continue;
      const ok = record.ok !== false;
      const result =
        record.result && typeof record.result === "object"
          ? (record.result as Record<string, unknown>)
          : {};
      await supabase
        .from("guild_whitelist_agent_jobs")
        .update({
          status: ok ? "done" : "failed",
          result,
          error_message: ok ? null : String(record.errorMessage || result.message || "Falha no launcher."),
          completed_at: new Date().toISOString(),
        })
        .eq("id", jobId);
      if (job.data.request_id && isWhitelistAgentOperation(String(job.data.operation))) {
        const operation = String(job.data.operation);
        const approve = operation === "APPROVE_WHITELIST";
        const remove = operation === "REMOVE_WHITELIST";
        if (approve || remove) {
          await supabase
            .from("guild_whitelist_requests")
            .update({
              status: ok ? (approve ? "approved" : "denied") : "apply_failed",
              apply_error: ok ? null : String(record.errorMessage || result.message || "Falha no launcher."),
              player_key: result.playerKey ? String(result.playerKey) : null,
              previous_whitelist_value: result.previousValue == null ? null : String(result.previousValue),
              next_whitelist_value: result.nextValue == null ? null : String(result.nextValue),
              applied_at: ok ? new Date().toISOString() : null,
            })
            .eq("id", job.data.request_id);
        }
      }
    }

    const staleCutoff = new Date(Date.now() - 120_000).toISOString();
    await supabase
      .from("guild_whitelist_agent_jobs")
      .update({ status: "queued", claimed_at: null })
      .eq("guild_id", session.guildId)
      .eq("status", "claimed")
      .lt("claimed_at", staleCutoff);

    const queued = await supabase
      .from("guild_whitelist_agent_jobs")
      .select("id, operation, payload")
      .eq("guild_id", session.guildId)
      .eq("status", "queued")
      .order("created_at", { ascending: true })
      .limit(5);
    for (const job of queued.data || []) {
      await supabase
        .from("guild_whitelist_agent_jobs")
        .update({ status: "claimed", claimed_at: new Date().toISOString() })
        .eq("id", job.id)
        .eq("status", "queued");
      const payload =
        job.payload && typeof job.payload === "object" ? (job.payload as Record<string, unknown>) : {};
      jobs.push({
        id: job.id,
        operation: job.operation,
        payload: { ...payload, mapping: payload.mapping || mapping },
      });
    }
  } catch {
    /* Jobs are optional. Heartbeat already marked the launcher online. */
  }

  const password = safeDecryptWhitelistPassword(
    settings.data?.db_password_cipher,
    session.guildId,
  );

  return {
    ok: true,
    message: jobs.length ? "Ha tarefas da whitelist." : "Conectado.",
    jobs,
    config: {
      engine: settings.data?.db_engine || "mysql",
      host:
        looksLikePublicCityDbHost(String(settings.data?.db_host || ""))
          ? normalizeCityDbHost(String(settings.data?.db_host || ""))
          : looksLikePublicCityDbHost(String(settings.data?.agent_public_ip || ""))
            ? normalizeCityDbHost(String(settings.data?.agent_public_ip || ""))
            : "",
      port: Number(settings.data?.db_port || 3306),
      database: settings.data?.db_name || "",
      user: settings.data?.db_user || "",
      password,
      ssl: settings.data?.db_ssl === true,
      mapping,
    },
  };
}

export async function getLauncherStatusForGuild(guildId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const [device, settings] = await Promise.all([
    supabase
      .from("launcher_devices")
      .select("connection_status, last_seen_at, last_error, hostname, label, device_public_id, observed_ip")
      .eq("guild_id", guildId)
      .order("last_seen_at", { ascending: false })
      .limit(1),
    supabase
      .from("guild_whitelist_settings")
      .select("agent_public_id, agent_token_hash, agent_last_seen_at, agent_public_ip")
      .eq("guild_id", guildId)
      .maybeSingle(),
  ]);
  const row = Array.isArray(device.data) ? device.data[0] : device.data;
  const lastSeenAt = row?.last_seen_at || settings.data?.agent_last_seen_at || null;
  const online = isLauncherOnline(lastSeenAt);
  const paired = Boolean(
    row || settings.data?.agent_public_id || settings.data?.agent_token_hash,
  );
  const status = !paired
    ? "awaiting"
    : online
      ? "online"
      : row?.connection_status === "error"
        ? "error"
        : row?.connection_status === "authenticating"
          ? "authenticating"
          : "offline";
  return {
    status,
    online,
    hostname: row?.hostname || null,
    label: row?.label || null,
    lastSeenAt,
    lastError: row?.last_error || null,
    paired,
    publicId: row?.device_public_id || settings.data?.agent_public_id || null,
    observedIp:
      looksLikePublicCityDbHost(String(row?.observed_ip || ""))
        ? normalizeCityDbHost(String(row?.observed_ip || ""))
        : looksLikePublicCityDbHost(String(settings.data?.agent_public_ip || ""))
          ? normalizeCityDbHost(String(settings.data?.agent_public_ip || ""))
          : null,
  };
}
