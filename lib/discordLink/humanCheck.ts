import crypto from "node:crypto";
import { cookies } from "next/headers";

const DISCORD_LINK_HUMAN_COOKIE_NAME = "flowdesk_discord_link_human";
const DISCORD_LINK_HUMAN_MINIMUM_SOLVE_MS = 900;
const DISCORD_LINK_HUMAN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

type DiscordLinkHumanChallengePayload = {
  accessNonce: string;
  nonce: string;
  iat: string;
  exp: string;
};

type DiscordLinkHumanVerificationPayload = {
  accessNonce: string;
  verifiedAt: string;
  exp: string;
};

function resolveDiscordLinkHumanSecret() {
  return (
    process.env.AUTH_AUDIT_HASH_SALT ||
    process.env.DISCORD_CLIENT_SECRET ||
    process.env.AUTH_SECRET ||
    "flowdesk-discord-link-human-secret"
  );
}

function safeTimingEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signEncodedPayload(encodedPayload: string) {
  return crypto
    .createHmac("sha256", resolveDiscordLinkHumanSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function buildTokenFromPayload(
  payload: DiscordLinkHumanChallengePayload | DiscordLinkHumanVerificationPayload,
) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signEncodedPayload(encodedPayload)}`;
}

function parseToken(token: string | null | undefined) {
  if (!token) {
    return { ok: false as const, reason: "missing" };
  }

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return { ok: false as const, reason: "malformed" };
  }

  const expectedSignature = signEncodedPayload(encodedPayload);
  if (!safeTimingEqual(signature, expectedSignature)) {
    return { ok: false as const, reason: "signature" };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as
      | DiscordLinkHumanChallengePayload
      | DiscordLinkHumanVerificationPayload;
    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, reason: "parse" };
  }
}

function resolveSharedExpiration(accessExpiresAt: string, maxLifetimeMs: number) {
  const accessExpirationMs = Date.parse(accessExpiresAt);
  const fallbackExpirationMs = Date.now() + maxLifetimeMs;

  if (!Number.isFinite(accessExpirationMs)) {
    return new Date(fallbackExpirationMs).toISOString();
  }

  return new Date(Math.min(accessExpirationMs, fallbackExpirationMs)).toISOString();
}

export function getDiscordLinkHumanCookieName() {
  return DISCORD_LINK_HUMAN_COOKIE_NAME;
}

export function getDiscordLinkHumanMinimumSolveMs() {
  return DISCORD_LINK_HUMAN_MINIMUM_SOLVE_MS;
}

export function createDiscordLinkHumanChallenge(input: {
  accessNonce: string;
  accessExpiresAt: string;
}) {
  const payload = {
    accessNonce: input.accessNonce,
    nonce: crypto.randomBytes(18).toString("base64url"),
    iat: new Date().toISOString(),
    exp: resolveSharedExpiration(
      input.accessExpiresAt,
      DISCORD_LINK_HUMAN_CHALLENGE_TTL_MS,
    ),
  } satisfies DiscordLinkHumanChallengePayload;

  return {
    token: buildTokenFromPayload(payload),
    payload,
  };
}

export function createDiscordLinkHumanVerificationToken(input: {
  accessNonce: string;
  accessExpiresAt: string;
}) {
  const payload = {
    accessNonce: input.accessNonce,
    verifiedAt: new Date().toISOString(),
    exp: resolveSharedExpiration(
      input.accessExpiresAt,
      DISCORD_LINK_HUMAN_CHALLENGE_TTL_MS,
    ),
  } satisfies DiscordLinkHumanVerificationPayload;

  return {
    token: buildTokenFromPayload(payload),
    payload,
  };
}

export function validateDiscordLinkHumanChallengeToken(input: {
  token: string | null | undefined;
  accessNonce: string;
}) {
  const parsed = parseToken(input.token);
  if (!parsed.ok) {
    return {
      ok: false as const,
      reason: parsed.reason,
      message: "A verificacao humana desta vinculacao nao e valida.",
    };
  }

  const payload = parsed.payload as Partial<DiscordLinkHumanChallengePayload>;
  if (
    typeof payload.accessNonce !== "string" ||
    !payload.accessNonce ||
    typeof payload.nonce !== "string" ||
    !payload.nonce ||
    typeof payload.iat !== "string" ||
    !payload.iat ||
    typeof payload.exp !== "string" ||
    !payload.exp
  ) {
    return {
      ok: false as const,
      reason: "payload",
      message: "A verificacao humana desta vinculacao nao e valida.",
    };
  }

  if (payload.accessNonce !== input.accessNonce) {
    return {
      ok: false as const,
      reason: "access_mismatch",
      message: "A verificacao humana nao pertence a esta tentativa segura.",
    };
  }

  const issuedAtMs = Date.parse(payload.iat);
  const expiresAtMs = Date.parse(payload.exp);
  if (
    !Number.isFinite(issuedAtMs) ||
    !Number.isFinite(expiresAtMs) ||
    expiresAtMs <= Date.now()
  ) {
    return {
      ok: false as const,
      reason: "expired",
      message: "A verificacao humana expirou. Gere uma nova tentativa.",
    };
  }

  return {
    ok: true as const,
    payload: payload as DiscordLinkHumanChallengePayload,
  };
}

export async function getDiscordLinkHumanCookieValue() {
  const cookieStore = await cookies();
  return cookieStore.get(DISCORD_LINK_HUMAN_COOKIE_NAME)?.value || null;
}

export async function validateDiscordLinkHumanVerification(input: {
  accessNonce: string;
}) {
  const cookieValue = await getDiscordLinkHumanCookieValue();
  const parsed = parseToken(cookieValue);
  if (!parsed.ok) {
    return {
      ok: false as const,
      reason: parsed.reason,
      message: "Confirme a verificacao humana antes de vincular a conta.",
    };
  }

  const payload = parsed.payload as Partial<DiscordLinkHumanVerificationPayload>;
  if (
    typeof payload.accessNonce !== "string" ||
    !payload.accessNonce ||
    typeof payload.verifiedAt !== "string" ||
    !payload.verifiedAt ||
    typeof payload.exp !== "string" ||
    !payload.exp
  ) {
    return {
      ok: false as const,
      reason: "payload",
      message: "Confirme a verificacao humana antes de vincular a conta.",
    };
  }

  if (payload.accessNonce !== input.accessNonce) {
    return {
      ok: false as const,
      reason: "access_mismatch",
      message: "Esta verificacao humana pertence a outra tentativa segura.",
    };
  }

  const expiresAtMs = Date.parse(payload.exp);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return {
      ok: false as const,
      reason: "expired",
      message: "A verificacao humana expirou. Clique novamente para continuar.",
    };
  }

  return {
    ok: true as const,
    payload: payload as DiscordLinkHumanVerificationPayload,
  };
}
