import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";

const DISCORD_LINK_ACCESS_COOKIE_NAME = "flowdesk_discord_link_access";
const DISCORD_LINK_ACCESS_QUERY_PARAM = "access";
const DISCORD_LINK_STATUS_QUERY_PARAM = "status";
const DISCORD_LINK_ACCESS_TTL_MS = 15 * 60 * 1000;

type DiscordLinkAccessPayload = {
  nonce: string;
  exp: string;
};

function resolveDiscordLinkAccessSecret() {
  return (
    process.env.AUTH_AUDIT_HASH_SALT ||
    process.env.DISCORD_CLIENT_SECRET ||
    process.env.AUTH_SECRET ||
    "flowdesk-discord-link-secret"
  );
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signEncodedPayload(encodedPayload: string) {
  return crypto
    .createHmac("sha256", resolveDiscordLinkAccessSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function buildTokenFromPayload(payload: DiscordLinkAccessPayload) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${signEncodedPayload(encodedPayload)}`;
}

function parseToken(token: string) {
  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) {
    return { ok: false as const, reason: "malformed" };
  }

  const expectedSignature = signEncodedPayload(encodedPayload);
  if (signature !== expectedSignature) {
    return { ok: false as const, reason: "signature" };
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as DiscordLinkAccessPayload;
    if (
      !payload ||
      typeof payload.nonce !== "string" ||
      !payload.nonce ||
      typeof payload.exp !== "string" ||
      !payload.exp
    ) {
      return { ok: false as const, reason: "payload" };
    }

    return { ok: true as const, payload };
  } catch {
    return { ok: false as const, reason: "parse" };
  }
}

export function createDiscordLinkAccessToken() {
  const payload = {
    nonce: crypto.randomBytes(24).toString("base64url"),
    exp: new Date(Date.now() + DISCORD_LINK_ACCESS_TTL_MS).toISOString(),
  } satisfies DiscordLinkAccessPayload;

  return {
    token: buildTokenFromPayload(payload),
    payload,
  };
}

export function getDiscordLinkAccessCookieName() {
  return DISCORD_LINK_ACCESS_COOKIE_NAME;
}

export function getDiscordLinkAccessQueryParam() {
  return DISCORD_LINK_ACCESS_QUERY_PARAM;
}

export function getDiscordLinkStatusQueryParam() {
  return DISCORD_LINK_STATUS_QUERY_PARAM;
}

export async function getDiscordLinkAccessCookieValue() {
  const cookieStore = await cookies();
  return cookieStore.get(DISCORD_LINK_ACCESS_COOKIE_NAME)?.value || null;
}

export async function validateDiscordLinkAccessToken(token: string | null | undefined) {
  if (!token) {
    return {
      ok: false as const,
      reason: "missing",
      message: "Este link de vinculacao nao esta completo.",
    };
  }

  const parsed = parseToken(token);
  if (!parsed.ok) {
    return {
      ok: false as const,
      reason: parsed.reason,
      message: "Este link de vinculacao nao e valido.",
    };
  }

  const cookieValue = await getDiscordLinkAccessCookieValue();
  if (!cookieValue || cookieValue !== token) {
    return {
      ok: false as const,
      reason: "session_mismatch",
      message:
        "Este link de vinculacao pertence a outra sessao autenticada ou expirou no navegador.",
    };
  }

  const expiresAtMs = Date.parse(parsed.payload.exp);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    return {
      ok: false as const,
      reason: "expired",
      message: "Este link de vinculacao expirou. Gere uma nova tentativa segura.",
    };
  }

  return {
    ok: true as const,
    payload: parsed.payload,
  };
}

export function extractDiscordLinkAccessTokenFromRequest(request: NextRequest) {
  return request.nextUrl.searchParams.get(DISCORD_LINK_ACCESS_QUERY_PARAM);
}
