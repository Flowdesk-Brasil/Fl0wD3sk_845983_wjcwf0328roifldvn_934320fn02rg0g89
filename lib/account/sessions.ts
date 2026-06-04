import { invalidateAuthSessionCache } from "@/lib/auth/session";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type AccountSessionRow = {
  id: string;
  ip_address: string | null;
  user_agent: string | null;
  auth_method: string | null;
  expires_at: string;
  created_at: string;
  last_seen_at: string | null;
};

function resolveBrowser(userAgent: string) {
  if (!userAgent) return "Navegador desconhecido";
  if (/Edg\//i.test(userAgent)) return "Microsoft Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/CriOS\//i.test(userAgent)) return "Chrome para iOS";
  if (/Chrome\//i.test(userAgent)) return "Google Chrome";
  if (/FxiOS\//i.test(userAgent)) return "Firefox para iOS";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Navegador desconhecido";
}

function resolvePlatform(userAgent: string) {
  if (/Windows NT/i.test(userAgent)) return "Windows";
  if (/Android/i.test(userAgent)) return "Android";
  if (/(iPhone|iPod)/i.test(userAgent)) return "iOS";
  if (/iPad/i.test(userAgent)) return "iPadOS";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Sistema desconhecido";
}

function resolveDeviceType(userAgent: string) {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return "tablet" as const;
  if (/Mobi|Android|iPhone|iPod/i.test(userAgent)) return "mobile" as const;
  return "desktop" as const;
}

function normalizeIpAddress(value: string | null) {
  if (!value) return "IP nao identificado";
  if (value === "::1" || value === "127.0.0.1") return "Ambiente local";
  return value;
}

function mapAccountSession(row: AccountSessionRow, currentSessionId: string) {
  const userAgent = row.user_agent || "";
  return {
    id: row.id,
    current: row.id === currentSessionId,
    deviceType: resolveDeviceType(userAgent),
    browser: resolveBrowser(userAgent),
    platform: resolvePlatform(userAgent),
    ipAddress: normalizeIpAddress(row.ip_address),
    authMethod: row.auth_method || "email",
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at || row.created_at,
    expiresAt: row.expires_at,
  };
}

function isMissingSessionMetadataColumn(message: string | null | undefined) {
  const normalized = message?.toLowerCase() || "";
  return normalized.includes("last_seen_at") || normalized.includes("auth_method");
}

export async function listAccountSessions(
  userId: number,
  currentSessionId: string,
) {
  const supabase = getSupabaseAdminClientOrThrow();
  const nowIso = new Date().toISOString();
  const result = await supabase
    .from("auth_sessions")
    .select(
      "id, ip_address, user_agent, auth_method, expires_at, created_at, last_seen_at",
    )
    .eq("user_id", userId)
    .is("revoked_at", null)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: false })
    .returns<AccountSessionRow[]>();

  let rows = result.data || [];
  if (result.error) {
    if (!isMissingSessionMetadataColumn(result.error.message)) {
      throw new Error(result.error.message);
    }

    const legacy = await supabase
      .from("auth_sessions")
      .select("id, ip_address, user_agent, expires_at, created_at")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .returns<
        Array<
          Omit<AccountSessionRow, "auth_method" | "last_seen_at">
        >
      >();
    if (legacy.error) throw new Error(legacy.error.message);
    rows = (legacy.data || []).map((row) => ({
      ...row,
      auth_method: null,
      last_seen_at: null,
    }));
  }

  return rows
    .map((row) => mapAccountSession(row, currentSessionId))
    .sort((left, right) => Number(right.current) - Number(left.current));
}

export async function revokeAccountSession(input: {
  userId: number;
  currentSessionId: string;
  sessionId: string;
}) {
  if (input.sessionId === input.currentSessionId) {
    throw new Error("A sessao atual nao pode ser desconectada por esta tela.");
  }

  const result = await getSupabaseAdminClientOrThrow()
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.sessionId)
    .eq("user_id", input.userId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (result.error) throw new Error(result.error.message);
  if (!result.data) throw new Error("Esta sessao ja foi encerrada.");

  invalidateAuthSessionCache();
}

export async function revokeOtherAccountSessions(
  userId: number,
  currentSessionId: string,
) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("auth_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .neq("id", currentSessionId)
    .is("revoked_at", null)
    .select("id")
    .returns<Array<{ id: string }>>();
  if (result.error) throw new Error(result.error.message);

  invalidateAuthSessionCache();
  return result.data?.length || 0;
}
