/**
 * Atribuicao de indicacao.
 *
 * O visitante clica no link do afiliado, cai em /r/<codigo>, e sai de la com um
 * cookie assinado dizendo quem indicou. O cookie precisa sobreviver ate o
 * checkout, que pode estar em outro subdominio (account.flwdesk.com), por isso
 * usa o mesmo resolvedor de dominio da autenticacao.
 *
 * O valor e assinado com HMAC: sem isso, qualquer visitante poderia editar o
 * cookie e creditar a venda a um afiliado escolhido por ele.
 */

import crypto from "node:crypto";
import type { NextResponse } from "next/server";
import { resolveCookieDomainForRequest, getRequestProtocol } from "@/lib/routing/subdomains";
import {
  ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
  ATTRIBUTION_COOKIE_NAME,
  ATTRIBUTION_MODEL,
  ATTRIBUTION_WINDOW_DAYS,
} from "./programRules";

type RequestLike = Pick<Request, "headers" | "url">;

export type AttributionPayload = {
  /** affiliate_id publico, ex.: AFF-8KD2M1 */
  affiliateCode: string;
  /** uuid do link clicado, quando o clique veio de um link especifico */
  linkId: string | null;
  /** identificador anonimo do visitante, para deduplicar cliques */
  visitorId: string;
  /** epoch em segundos do primeiro clique atribuido */
  issuedAt: number;
};

const COOKIE_VERSION = "v1";

function resolveAttributionSecret() {
  const candidates = [
    process.env.AFFILIATE_ATTRIBUTION_SECRET,
    process.env.AUTH_COOKIE_SECRET,
    process.env.AUTH_SECRET,
    process.env.NEXTAUTH_SECRET,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate ?? "").trim();
    if (normalized.length >= 16) {
      return normalized;
    }
  }

  return null;
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

/** Gera um identificador anonimo de visitante. Nao deriva de IP nem de conta. */
export function createVisitorId() {
  return crypto.randomBytes(16).toString("base64url");
}

export function encodeAttributionCookie(payload: AttributionPayload): string | null {
  const secret = resolveAttributionSecret();
  if (!secret) {
    console.error(
      "[affiliates] AFFILIATE_ATTRIBUTION_SECRET (ou AUTH_SECRET) ausente: atribuicao desativada.",
    );
    return null;
  }

  const body = [
    COOKIE_VERSION,
    payload.affiliateCode,
    payload.linkId || "",
    payload.visitorId,
    String(payload.issuedAt),
  ].join("|");

  const encoded = Buffer.from(body, "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function decodeAttributionCookie(raw: string | null | undefined): AttributionPayload | null {
  const value = String(raw ?? "").trim();
  if (!value || !value.includes(".")) {
    return null;
  }

  const secret = resolveAttributionSecret();
  if (!secret) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(".");
  const encoded = value.slice(0, separatorIndex);
  const signature = value.slice(separatorIndex + 1);

  if (!encoded || !signature || !safeEqual(signature, sign(encoded, secret))) {
    return null;
  }

  let body: string;
  try {
    body = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const [version, affiliateCode, linkId, visitorId, issuedAtRaw] = body.split("|");

  if (version !== COOKIE_VERSION || !affiliateCode || !visitorId) {
    return null;
  }

  const issuedAt = Number.parseInt(issuedAtRaw ?? "", 10);
  if (!Number.isFinite(issuedAt) || issuedAt <= 0) {
    return null;
  }

  // Janela de atribuicao. O cookie tem maxAge, mas navegador nao e confiavel:
  // a validade e reconferida aqui, no servidor.
  const ageSeconds = Math.floor(Date.now() / 1000) - issuedAt;
  if (ageSeconds > ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60) {
    return null;
  }

  return {
    affiliateCode,
    linkId: linkId || null,
    visitorId,
    issuedAt,
  };
}

/**
 * Grava a atribuicao na resposta.
 *
 * No modelo "first", uma atribuicao valida existente nao e sobrescrita: o
 * primeiro afiliado que trouxe o visitante fica com o credito.
 */
export function applyAttributionCookie(
  request: RequestLike,
  response: NextResponse,
  payload: AttributionPayload,
  existing: AttributionPayload | null,
): { applied: boolean; reason?: string } {
  if (ATTRIBUTION_MODEL === "first" && existing) {
    return { applied: false, reason: "first_click_wins" };
  }

  const encoded = encodeAttributionCookie(payload);
  if (!encoded) {
    return { applied: false, reason: "missing_secret" };
  }

  const options = {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/",
    maxAge: ATTRIBUTION_COOKIE_MAX_AGE_SECONDS,
    secure: getRequestProtocol(request) === "https",
  };

  response.cookies.set(ATTRIBUTION_COOKIE_NAME, encoded, options);

  // Reescreve com o dominio compartilhado, para o cookie valer nos subdominios
  // do checkout. Escrever de novo com o mesmo nome substitui a versao anterior
  // (sai um unico Set-Cookie) - mesmo padrao de lib/auth/cookies.ts.
  const domain = resolveCookieDomainForRequest(request);
  if (domain) {
    response.cookies.set(ATTRIBUTION_COOKIE_NAME, encoded, { ...options, domain });
  }

  return { applied: true };
}

/** Le a atribuicao a partir dos cookies de uma requisicao. */
export function readAttributionFromRequest(request: Request): AttributionPayload | null {
  const header = request.headers.get("cookie");
  if (!header) {
    return null;
  }

  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === ATTRIBUTION_COOKIE_NAME) {
      return decodeAttributionCookie(decodeURIComponent(rest.join("=")));
    }
  }

  return null;
}

/** Le a atribuicao dentro de Server Component ou Route Handler. */
export async function readAttributionFromCookieStore(): Promise<AttributionPayload | null> {
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return decodeAttributionCookie(store.get(ATTRIBUTION_COOKIE_NAME)?.value);
}
