import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import type { PendingOtpSessionContext } from "@/lib/auth/emailOtp";
import { createSessionForUser } from "@/lib/auth/session";
import {
  buildFlowSecureDiagnosticFingerprint,
  FlowSecureDecryptionError,
  decryptFlowSecureValue,
  encryptFlowSecureValue,
} from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export type TwoFactorMethod = "totp" | "passkey";
export const TWO_FACTOR_RESTART_REQUIRED_CODE = "two_factor_restart_required";
const TWO_FACTOR_RESTART_REQUIRED_MESSAGE =
  "Sua segunda etapa de login expirou ou foi renovada. Inicie o login novamente.";

type PendingTwoFactorPayload = {
  userId: number;
  redirectTo: string;
  rememberSession: boolean;
  ipAddress: string | null;
  userAgent: string | null;
  sessionContext: PendingOtpSessionContext | null;
};

type PendingTwoFactorRow = {
  id: string;
  user_id: number;
  challenge: string;
  metadata: {
    payload_encrypted?: unknown;
    flowsecure_key_fingerprint?: unknown;
  } | null;
  expires_at: string;
  consumed_at: string | null;
};

export class PendingTwoFactorLoginError extends Error {
  readonly code = TWO_FACTOR_RESTART_REQUIRED_CODE;
  readonly statusCode = 409;
  readonly restartRequired = true;

  constructor(message = TWO_FACTOR_RESTART_REQUIRED_MESSAGE) {
    super(message);
    this.name = "PendingTwoFactorLoginError";
  }
}

export function describeTwoFactorLoginError(error: unknown, fallbackMessage: string) {
  if (error instanceof PendingTwoFactorLoginError) {
    return {
      statusCode: error.statusCode,
      message: error.message,
      code: error.code,
      restartRequired: error.restartRequired,
    };
  }

  return {
    statusCode: 400,
    message:
      error instanceof Error ? error.message : fallbackMessage,
    code: null,
    restartRequired: false,
  };
}

function buildTwoFactorFlowSecureFingerprint(userId: number) {
  return buildFlowSecureDiagnosticFingerprint(
    {
      purpose: "auth_two_factor_login",
      userId,
      version: 2,
    },
    {
      prefix: "fs2fa",
      subcontext: "auth_two_factor_login",
      maxPayloadLength: 256,
    },
  );
}

function isPendingTwoFactorPayload(value: unknown): value is PendingTwoFactorPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<PendingTwoFactorPayload>;
  return (
    typeof candidate.userId === "number" &&
    Number.isSafeInteger(candidate.userId) &&
    typeof candidate.redirectTo === "string" &&
    typeof candidate.rememberSession === "boolean" &&
    (candidate.ipAddress === null || typeof candidate.ipAddress === "string") &&
    (candidate.userAgent === null || typeof candidate.userAgent === "string")
  );
}

async function invalidateUnreadablePendingTwoFactorLogin(input: {
  row: PendingTwoFactorRow;
  reason: string;
  error: unknown;
  keyFingerprintMatches: boolean | null;
}) {
  const invalidatedAt = new Date().toISOString();
  const metadata =
    input.row.metadata && typeof input.row.metadata === "object"
      ? input.row.metadata
      : {};
  const errorName = input.error instanceof Error ? input.error.name : typeof input.error;
  const errorCode =
    input.error instanceof FlowSecureDecryptionError
      ? input.error.code
      : null;

  console.warn("[Auth2FA] pending login challenge invalidated", {
    challengeId: input.row.id,
    userId: input.row.user_id,
    reason: input.reason,
    errorName,
    errorCode,
    keyFingerprintMatches: input.keyFingerprintMatches,
  });

  const supabase = getSupabaseAdminClientOrThrow();
  await supabase
    .from("auth_security_challenges")
    .update({
      consumed_at: invalidatedAt,
      metadata: {
        ...metadata,
        invalidated_at: invalidatedAt,
        invalidated_reason: input.reason,
        invalidated_error: errorName,
        key_fingerprint_matches: input.keyFingerprintMatches,
      },
    })
    .eq("id", input.row.id)
    .is("consumed_at", null);
}

export async function getEnabledTwoFactorMethods(userId: number) {
  const supabase = getSupabaseAdminClientOrThrow();
  const [totp, passkeys] = await Promise.all([
    supabase
      .from("auth_user_totp")
      .select("enabled")
      .eq("user_id", userId)
      .maybeSingle<{ enabled: boolean }>(),
    supabase
      .from("auth_user_passkeys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
  ]);

  const methods: TwoFactorMethod[] = [];
  if (totp.data?.enabled) methods.push("totp");
  if ((passkeys.count || 0) > 0) methods.push("passkey");
  return methods;
}

export async function createPendingTwoFactorLoginIfNeeded(
  payload: PendingTwoFactorPayload,
) {
  const methods = await getEnabledTwoFactorMethods(payload.userId);
  if (!methods.length) return null;

  const encrypted = encryptFlowSecureValue(JSON.stringify(payload), {
    purpose: "auth_two_factor_login",
    aad: String(payload.userId),
  });
  if (!encrypted) throw new Error("Nao foi possivel proteger a segunda etapa.");
  const keyFingerprint = buildTwoFactorFlowSecureFingerprint(payload.userId);

  const supabase = getSupabaseAdminClientOrThrow();
  await supabase
    .from("auth_security_challenges")
    .delete()
    .eq("user_id", payload.userId)
    .eq("kind", "two_factor_login")
    .is("consumed_at", null);
  const result = await supabase
    .from("auth_security_challenges")
    .insert({
      user_id: payload.userId,
      kind: "two_factor_login",
      challenge: crypto.randomBytes(32).toString("base64url"),
      metadata: {
        payload_encrypted: encrypted,
        flowsecure_key_fingerprint: keyFingerprint,
        payload_schema: "auth_two_factor_login.v2",
      },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    })
    .select("id, expires_at")
    .single<{ id: string; expires_at: string }>();
  if (result.error || !result.data) {
    throw new Error(result.error?.message || "Nao foi possivel iniciar a segunda etapa.");
  }

  return {
    challengeId: result.data.id,
    methods,
    expiresAt: result.data.expires_at,
  };
}

export async function readPendingTwoFactorLogin(challengeId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("auth_security_challenges")
    .select("id, user_id, challenge, metadata, expires_at, consumed_at")
    .eq("id", challengeId)
    .eq("kind", "two_factor_login")
    .maybeSingle<PendingTwoFactorRow>();
  if (result.error || !result.data) {
    throw new Error("Segunda etapa nao encontrada.");
  }
  if (result.data.consumed_at || Date.parse(result.data.expires_at) <= Date.now()) {
    throw new Error("A segunda etapa expirou. Inicie o login novamente.");
  }

  const encrypted =
    typeof result.data.metadata?.payload_encrypted === "string"
      ? result.data.metadata.payload_encrypted
      : null;
  const storedFingerprint =
    typeof result.data.metadata?.flowsecure_key_fingerprint === "string"
      ? result.data.metadata.flowsecure_key_fingerprint
      : null;
  const currentFingerprint = buildTwoFactorFlowSecureFingerprint(result.data.user_id);

  let payload: PendingTwoFactorPayload;
  try {
    const decrypted = decryptFlowSecureValue(encrypted, {
      purpose: "auth_two_factor_login",
      aad: String(result.data.user_id),
    });
    if (!decrypted) throw new Error("missing_two_factor_payload");

    const parsed = JSON.parse(decrypted) as unknown;
    if (!isPendingTwoFactorPayload(parsed) || parsed.userId !== result.data.user_id) {
      throw new Error("invalid_two_factor_payload");
    }
    payload = parsed;
  } catch (error) {
    await invalidateUnreadablePendingTwoFactorLogin({
      row: result.data,
      reason: "payload_unreadable",
      error,
      keyFingerprintMatches: storedFingerprint
        ? storedFingerprint === currentFingerprint
        : null,
    });
    throw new PendingTwoFactorLoginError();
  }

  return {
    row: result.data,
    payload,
  };
}

export async function verifyUserTotp(userId: number, code: unknown) {
  const token =
    typeof code === "string" ? code.trim().replace(/\s+/g, "") : "";
  if (!/^\d{6}$/.test(token)) return false;

  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("auth_user_totp")
    .select("secret_encrypted, enabled")
    .eq("user_id", userId)
    .maybeSingle<{ secret_encrypted: string; enabled: boolean }>();
  if (!result.data?.enabled) return false;

  let secret: string | null = null;
  try {
    secret = decryptFlowSecureValue(result.data.secret_encrypted, {
      purpose: "auth_totp_secret",
      aad: String(userId),
    });
  } catch (error) {
    console.warn("[Auth2FA] TOTP secret unreadable", {
      userId,
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode:
        error instanceof FlowSecureDecryptionError ? error.code : null,
    });
  }
  if (!secret) return false;

  const totp = new OTPAuth.TOTP({
    issuer: "Flowdesk",
    label: String(userId),
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  const valid = totp.validate({ token, window: 1 }) !== null;
  if (valid) {
    await supabase
      .from("auth_user_totp")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", userId);
  }
  return valid;
}

export async function completePendingTwoFactorLogin(challengeId: string) {
  const pending = await readPendingTwoFactorLogin(challengeId);
  const supabase = getSupabaseAdminClientOrThrow();
  const consumed = await supabase
    .from("auth_security_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", pending.row.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (consumed.error || !consumed.data) {
    throw new Error("Esta segunda etapa ja foi utilizada.");
  }

  const sessionContext = pending.payload.sessionContext;
  const session = await createSessionForUser(
    pending.payload.userId,
    {
      ipAddress: pending.payload.ipAddress,
      userAgent: pending.payload.userAgent,
    },
    {
      authMethod: sessionContext?.authMethod || "email",
      discordAccessToken: sessionContext?.discordAccessToken ?? null,
      discordRefreshToken: sessionContext?.discordRefreshToken ?? null,
      discordTokenExpiresAt: sessionContext?.discordTokenExpiresAt ?? null,
    },
    {
      rememberSession: pending.payload.rememberSession,
    },
  );

  return {
    ...pending.payload,
    session,
  };
}
