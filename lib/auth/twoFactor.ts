import crypto from "node:crypto";
import * as OTPAuth from "otpauth";
import type { PendingOtpSessionContext } from "@/lib/auth/emailOtp";
import { createSessionForUser } from "@/lib/auth/session";
import {
  decryptFlowSecureValue,
  encryptFlowSecureValue,
} from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export type TwoFactorMethod = "totp" | "passkey";

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
  } | null;
  expires_at: string;
  consumed_at: string | null;
};

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
      metadata: { payload_encrypted: encrypted },
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
  const decrypted = decryptFlowSecureValue(encrypted, {
    purpose: "auth_two_factor_login",
    aad: String(result.data.user_id),
  });
  if (!decrypted) throw new Error("Nao foi possivel validar a segunda etapa.");

  return {
    row: result.data,
    payload: JSON.parse(decrypted) as PendingTwoFactorPayload,
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

  const secret = decryptFlowSecureValue(result.data.secret_encrypted, {
    purpose: "auth_totp_secret",
    aad: String(userId),
  });
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
