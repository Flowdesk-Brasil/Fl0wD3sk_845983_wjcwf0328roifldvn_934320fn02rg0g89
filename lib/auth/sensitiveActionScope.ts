export type SensitiveAccountAction =
  | "account_delete"
  | "email_change"
  | "password_change"
  | "passkey_add"
  | "provider_unlink"
  | "totp_enable"
  | "totp_disable"
  | "passkey_remove"
  | "vps_delete";

export type SensitiveActionMetadata = {
  action?: unknown;
  target?: unknown;
  proof_action?: unknown;
  proof_target?: unknown;
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
  "vps_delete",
] as const satisfies readonly SensitiveAccountAction[];

export function normalizeSensitiveAccountAction(value: unknown) {
  return typeof value === "string" &&
    (SENSITIVE_ACCOUNT_ACTIONS as readonly string[]).includes(value)
    ? (value as SensitiveAccountAction)
    : null;
}

function readMetadataText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export function isSensitiveActionProofScopeValid(
  metadata: SensitiveActionMetadata | null | undefined,
  action: SensitiveAccountAction,
  target?: string | null,
) {
  const expectedAction =
    normalizeSensitiveAccountAction(metadata?.proof_action) ||
    normalizeSensitiveAccountAction(metadata?.action) ||
    "";
  const expectedTarget = readMetadataText(target);
  const proofTarget =
    readMetadataText(metadata?.proof_target) || readMetadataText(metadata?.target);

  return expectedAction === action && (!expectedTarget || proofTarget === expectedTarget);
}

export function resolveSensitiveActionProofScope(
  metadata: SensitiveActionMetadata | null | undefined,
  options?: {
    action?: SensitiveAccountAction | null;
    target?: string | null;
  },
) {
  const challengeAction = normalizeSensitiveAccountAction(metadata?.action);
  const requestedAction = options?.action || null;
  if (challengeAction && requestedAction && challengeAction !== requestedAction) {
    throw new Error("Esta confirmacao de seguranca nao e valida para esta acao.");
  }

  const challengeTarget = readMetadataText(metadata?.target);
  const requestedTarget = readMetadataText(options?.target);
  if (challengeTarget && requestedTarget && challengeTarget !== requestedTarget) {
    throw new Error("Esta confirmacao de seguranca nao e valida para esta acao.");
  }

  return {
    action: challengeAction || requestedAction || null,
    target: challengeTarget || requestedTarget || null,
  };
}
