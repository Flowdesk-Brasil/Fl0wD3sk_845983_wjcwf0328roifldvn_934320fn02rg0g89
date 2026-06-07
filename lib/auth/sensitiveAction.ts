import crypto from "node:crypto";
import { getEnabledTwoFactorMethods } from "@/lib/auth/twoFactor";
import { hashFlowSecureValue } from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export type SensitiveAccountAction =
  | "account_delete"
  | "email_change"
  | "password_change"
  | "passkey_add"
  | "provider_unlink"
  | "totp_enable"
  | "totp_disable"
  | "passkey_remove";

type SensitiveActionMetadata = {
  action?: unknown;
  proof_action?: unknown;
  proof_hash?: unknown;
  verified_at?: unknown;
  verified_method?: unknown;
};

export const SENSITIVE_ACCOUNT_ACTIONS = [
  "account_delete",
  "email_change",
  "password_change",
  "passkey_add",
  "provider_unlink",
  "totp_enable",
  "totp_disable",
  "passkey_remove",
] as const satisfies readonly SensitiveAccountAction[];

export function normalizeSensitiveAccountAction(value: unknown) {
  return typeof value === "string" &&
    (SENSITIVE_ACCOUNT_ACTIONS as readonly string[]).includes(value)
    ? (value as SensitiveAccountAction)
    : null;
}

type SensitiveActionChallengeRow = {
  id: string;
  user_id: number;
  challenge: string;
  metadata: SensitiveActionMetadata | null;
  expires_at: string;
  consumed_at: string | null;
};

const SENSITIVE_ACTION_TTL_MS = 5 * 60 * 1000;

function hashProof(userId: number, proof: string) {
  return hashFlowSecureValue(proof, {
    purpose: "auth_sensitive_action",
    subcontext: String(userId),
  });
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export async function createSensitiveActionChallenge(
  userId: number,
  action: SensitiveAccountAction,
) {
  const methods = await getEnabledTwoFactorMethods(userId);
  if (!methods.length) {
    return {
      required: false as const,
      methods,
      challengeId: null,
      expiresAt: null,
    };
  }

  const supabase = getSupabaseAdminClientOrThrow();
  await supabase
    .from("auth_security_challenges")
    .delete()
    .eq("user_id", userId)
    .eq("kind", "sensitive_action")
    .is("consumed_at", null);

  const expiresAt = new Date(Date.now() + SENSITIVE_ACTION_TTL_MS).toISOString();
  const result = await supabase
    .from("auth_security_challenges")
    .insert({
      user_id: userId,
      kind: "sensitive_action",
      challenge: crypto.randomBytes(32).toString("base64url"),
      metadata: { action },
      expires_at: expiresAt,
    })
    .select("id")
    .single<{ id: string }>();
  if (result.error || !result.data) {
    throw new Error(
      result.error?.message || "Nao foi possivel iniciar a confirmacao de seguranca.",
    );
  }

  return {
    required: true as const,
    methods,
    challengeId: result.data.id,
    expiresAt,
  };
}

export async function readSensitiveActionChallenge(userId: number, challengeId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("auth_security_challenges")
    .select("id, user_id, challenge, metadata, expires_at, consumed_at")
    .eq("id", challengeId)
    .eq("user_id", userId)
    .eq("kind", "sensitive_action")
    .maybeSingle<SensitiveActionChallengeRow>();
  if (result.error || !result.data) {
    throw new Error("Confirmacao de seguranca nao encontrada.");
  }
  if (result.data.consumed_at || Date.parse(result.data.expires_at) <= Date.now()) {
    throw new Error("A confirmacao de seguranca expirou. Tente novamente.");
  }
  return result.data;
}

export async function issueSensitiveActionProof(
  userId: number,
  challengeId: string,
  options?: {
    action?: SensitiveAccountAction | null;
    method?: "totp" | "passkey" | null;
  },
) {
  const challenge = await readSensitiveActionChallenge(userId, challengeId);
  const proofToken = crypto.randomBytes(48).toString("base64url");
  const proofHash = hashProof(userId, proofToken);
  if (!proofHash) throw new Error("Nao foi possivel proteger a confirmacao.");
  const proofAction =
    options?.action ||
    normalizeSensitiveAccountAction(challenge.metadata?.action) ||
    null;

  const supabase = getSupabaseAdminClientOrThrow();
  const update = await supabase
    .from("auth_security_challenges")
    .update({
      metadata: {
        ...(challenge.metadata || {}),
        ...(proofAction ? { proof_action: proofAction } : {}),
        proof_hash: proofHash,
        verified_at: new Date().toISOString(),
        ...(options?.method ? { verified_method: options.method } : {}),
      },
    })
    .eq("id", challenge.id)
    .is("consumed_at", null);
  if (update.error) throw new Error(update.error.message);

  return `${challenge.id}.${proofToken}`;
}

export async function requireSensitiveActionProof(
  userId: number,
  action: SensitiveAccountAction,
  rawProof: unknown,
) {
  const methods = await getEnabledTwoFactorMethods(userId);
  if (!methods.length) return;

  const proof = typeof rawProof === "string" ? rawProof.trim() : "";
  const separator = proof.indexOf(".");
  const challengeId = separator > 0 ? proof.slice(0, separator) : "";
  const proofToken = separator > 0 ? proof.slice(separator + 1) : "";
  if (!challengeId || !proofToken) {
    throw new Error("Confirme a autenticacao em duas etapas para continuar.");
  }

  const challenge = await readSensitiveActionChallenge(userId, challengeId);
  const expectedAction =
    normalizeSensitiveAccountAction(challenge.metadata?.proof_action) ||
    normalizeSensitiveAccountAction(challenge.metadata?.action) ||
    "";
  const expectedHash =
    typeof challenge.metadata?.proof_hash === "string"
      ? challenge.metadata.proof_hash
      : "";
  const proofHash = hashProof(userId, proofToken);
  if (
    expectedAction !== action ||
    !expectedHash ||
    !proofHash ||
    !safeEqual(expectedHash, proofHash)
  ) {
    throw new Error("Esta confirmacao de seguranca nao e valida para esta acao.");
  }

  const supabase = getSupabaseAdminClientOrThrow();
  const consumed = await supabase
    .from("auth_security_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();
  if (consumed.error || !consumed.data) {
    throw new Error("Esta confirmacao de seguranca ja foi utilizada.");
  }
}
