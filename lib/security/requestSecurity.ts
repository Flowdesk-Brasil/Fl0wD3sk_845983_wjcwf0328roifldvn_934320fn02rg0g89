import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export type SecurityRequestContext = {
  requestId: string;
  method: string;
  path: string;
  ipFingerprint: string | null;
  userAgent: string | null;
  sessionId: string | null;
  userId: number | null;
  guildId: string | null;
};

type AuditOutcome = "started" | "succeeded" | "failed" | "blocked";

type AuditEventInput = {
  action: string;
  outcome: AuditOutcome;
  metadata?: Record<string, unknown>;
};

type RateLimitInput = {
  action: string;
  windowMs: number;
  maxAttempts: number;
  context: SecurityRequestContext;
};

function extractClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const candidate = forwardedFor.split(",")[0]?.trim();
    if (candidate) return candidate;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  if (cfIp) return cfIp;

  return null;
}

function resolveFingerprintSalt() {
  const candidates = [
    process.env.AUTH_AUDIT_HASH_SALT,
    process.env.DISCORD_CLIENT_SECRET,
    process.env.NEXTAUTH_SECRET,
    process.env.AUTH_SECRET,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "flowdesk-default-audit-salt";
}

function hashIpAddress(ipAddress: string | null) {
  if (!ipAddress) return null;
  const salt = resolveFingerprintSalt();
  return crypto
    .createHash("sha256")
    .update(`${salt}:${ipAddress}`)
    .digest("hex");
}

export function createSecurityRequestContext(
  request: Request,
  input?: {
    sessionId?: string | null;
    userId?: number | null;
    guildId?: string | null;
    requestId?: string | null;
  },
): SecurityRequestContext {
  const url = new URL(request.url);
  return {
    requestId:
      (typeof input?.requestId === "string" && input.requestId.trim()) ||
      crypto.randomUUID(),
    method: request.method.toUpperCase(),
    path: url.pathname,
    ipFingerprint: hashIpAddress(extractClientIp(request)),
    userAgent: request.headers.get("user-agent")?.trim() || null,
    sessionId: input?.sessionId || null,
    userId: typeof input?.userId === "number" ? input.userId : null,
    guildId: input?.guildId || null,
  };
}

export function extendSecurityRequestContext(
  context: SecurityRequestContext,
  input: {
    sessionId?: string | null;
    userId?: number | null;
    guildId?: string | null;
  },
): SecurityRequestContext {
  return {
    ...context,
    sessionId: input.sessionId ?? context.sessionId,
    userId:
      typeof input.userId === "number" ? input.userId : context.userId,
    guildId: input.guildId ?? context.guildId,
  };
}

export async function logSecurityAuditEvent(
  context: SecurityRequestContext,
  input: AuditEventInput,
) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase.from("auth_security_events").insert({
    request_id: context.requestId,
    session_id: context.sessionId,
    user_id: context.userId,
    guild_id: context.guildId,
    action: input.action,
    outcome: input.outcome,
    request_method: context.method,
    request_path: context.path,
    ip_fingerprint: context.ipFingerprint,
    user_agent: context.userAgent,
    metadata: input.metadata || {},
  });

  if (result.error) {
    throw new Error(result.error.message);
  }
}

export async function logSecurityAuditEventSafe(
  context: SecurityRequestContext,
  input: AuditEventInput,
) {
  try {
    await logSecurityAuditEvent(context, input);
  } catch {
    // auditoria nunca deve derrubar o fluxo principal
  }
}

async function countAttemptsByDimension(input: {
  action: string;
  windowStartIso: string;
  field: "session_id" | "user_id" | "ip_fingerprint";
  value: string | number | null;
}) {
  if (input.value === null || input.value === undefined || input.value === "") {
    return 0;
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("auth_security_events")
    .select("id", { count: "exact", head: true })
    .eq("action", input.action)
    .eq("outcome", "started")
    .gte("created_at", input.windowStartIso)
    .eq(input.field, input.value);

  if (result.error) {
    throw new Error(result.error.message);
  }

  return result.count || 0;
}

export async function enforceRequestRateLimit(input: RateLimitInput) {
  const windowStartIso = new Date(Date.now() - input.windowMs).toISOString();

  const [ipCount, sessionCount, userCount] = await Promise.all([
    countAttemptsByDimension({
      action: input.action,
      windowStartIso,
      field: "ip_fingerprint",
      value: input.context.ipFingerprint,
    }),
    countAttemptsByDimension({
      action: input.action,
      windowStartIso,
      field: "session_id",
      value: input.context.sessionId,
    }),
    countAttemptsByDimension({
      action: input.action,
      windowStartIso,
      field: "user_id",
      value: input.context.userId,
    }),
  ]);

  const blocked =
    ipCount >= input.maxAttempts ||
    sessionCount >= input.maxAttempts ||
    userCount >= input.maxAttempts;

  return {
    ok: !blocked,
    retryAfterSeconds: Math.max(5, Math.ceil(input.windowMs / 1000 / 2)),
    counts: {
      ip: ipCount,
      session: sessionCount,
      user: userCount,
    },
  };
}

export function attachRequestId<T extends NextResponse>(
  response: T,
  requestId: string,
) {
  response.headers.set("X-Request-Id", requestId);
  return response;
}
