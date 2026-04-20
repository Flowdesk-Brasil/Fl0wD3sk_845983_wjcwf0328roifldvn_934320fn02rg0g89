import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import {
  getOAuthModeCookieName,
  getOAuthNextPathCookieName,
  getOAuthRedirectUriCookieName,
  getOAuthStateCookieName,
  type OAuthProvider,
} from "@/lib/auth/config";
import {
  clearSharedAuthCookie,
  setSharedAuthCookie,
} from "@/lib/auth/cookies";
import { constantTimeEqualText } from "@/lib/security/flowSecure";

const OAUTH_COOKIE_TTL_SECONDS = 60 * 10;
const OAUTH_PKCE_METHOD = "S256";

type OAuthMode = "login" | "link";

type OAuthProviderIdentityMetadata = {
  provider: OAuthProvider;
  protocol: "oauth2" | "oidc";
  pkceRequired: boolean;
  nonceRequired: boolean;
  oidcIssuers: string[];
};

type OAuthTransactionInput = {
  provider: OAuthProvider;
  state: string;
  redirectUri: string;
  requestedMode: OAuthMode;
  requestedNextPath?: string | null;
  pkceVerifier?: string | null;
  nonce?: string | null;
};

type ValidatedOAuthTransaction = {
  state: string;
  redirectUri: string;
  nextPath: string | null;
  mode: OAuthMode;
  pkceVerifier: string | null;
  nonce: string | null;
};

const OAUTH_PROVIDER_IDENTITY_REGISTRY: Record<
  OAuthProvider,
  OAuthProviderIdentityMetadata
> = {
  discord: {
    provider: "discord",
    protocol: "oauth2",
    pkceRequired: false,
    nonceRequired: false,
    oidcIssuers: [],
  },
  google: {
    provider: "google",
    protocol: "oidc",
    pkceRequired: true,
    nonceRequired: true,
    oidcIssuers: ["https://accounts.google.com", "accounts.google.com"],
  },
  microsoft: {
    provider: "microsoft",
    protocol: "oidc",
    pkceRequired: true,
    nonceRequired: true,
    oidcIssuers: ["https://login.microsoftonline.com"],
  },
};

function buildOAuthCookieName(provider: OAuthProvider, suffix: string) {
  return `flowdesk_oauth_${provider}_${suffix}`;
}

function getOAuthPkceVerifierCookieName(provider: OAuthProvider) {
  return buildOAuthCookieName(provider, "pkce_verifier");
}

function getOAuthNonceCookieName(provider: OAuthProvider) {
  return buildOAuthCookieName(provider, "nonce");
}

function decodeJwtPayload(token: string) {
  const segments = token.split(".");
  if (segments.length < 2) {
    throw new Error("ID token retornou formato invalido.");
  }

  const payload = segments[1];
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(paddingLength);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
    string,
    unknown
  >;
}

export function getOAuthProviderIdentityMetadata(provider: OAuthProvider) {
  return OAUTH_PROVIDER_IDENTITY_REGISTRY[provider];
}

export function createOAuthPkcePair() {
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier, "utf8")
    .digest("base64url");

  return {
    verifier,
    challenge,
    method: OAUTH_PKCE_METHOD,
  };
}

export function createOAuthNonce() {
  return crypto.randomBytes(24).toString("base64url");
}

export function setOAuthTransactionCookies(
  request: NextRequest,
  response: NextResponse,
  input: OAuthTransactionInput,
) {
  setSharedAuthCookie(
    request,
    response,
    getOAuthStateCookieName(input.provider),
    input.state,
    {
      httpOnly: true,
      sameSite: "lax",
      maxAge: OAUTH_COOKIE_TTL_SECONDS,
      path: "/",
      priority: "high",
    },
  );

  setSharedAuthCookie(
    request,
    response,
    getOAuthRedirectUriCookieName(input.provider),
    input.redirectUri,
    {
      httpOnly: true,
      sameSite: "lax",
      maxAge: OAUTH_COOKIE_TTL_SECONDS,
      path: "/",
      priority: "high",
    },
  );

  setSharedAuthCookie(
    request,
    response,
    getOAuthModeCookieName(input.provider),
    input.requestedMode,
    {
      httpOnly: true,
      sameSite: "lax",
      maxAge: OAUTH_COOKIE_TTL_SECONDS,
      path: "/",
      priority: "high",
    },
  );

  if (input.requestedNextPath) {
    setSharedAuthCookie(
      request,
      response,
      getOAuthNextPathCookieName(input.provider),
      input.requestedNextPath,
      {
        httpOnly: true,
        sameSite: "lax",
        maxAge: OAUTH_COOKIE_TTL_SECONDS,
        path: "/",
        priority: "high",
      },
    );
  } else {
    clearSharedAuthCookie(request, response, getOAuthNextPathCookieName(input.provider), {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    });
  }

  if (input.pkceVerifier) {
    setSharedAuthCookie(
      request,
      response,
      getOAuthPkceVerifierCookieName(input.provider),
      input.pkceVerifier,
      {
        httpOnly: true,
        sameSite: "lax",
        maxAge: OAUTH_COOKIE_TTL_SECONDS,
        path: "/",
        priority: "high",
      },
    );
  } else {
    clearSharedAuthCookie(request, response, getOAuthPkceVerifierCookieName(input.provider), {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    });
  }

  if (input.nonce) {
    setSharedAuthCookie(
      request,
      response,
      getOAuthNonceCookieName(input.provider),
      input.nonce,
      {
        httpOnly: true,
        sameSite: "lax",
        maxAge: OAUTH_COOKIE_TTL_SECONDS,
        path: "/",
        priority: "high",
      },
    );
  } else {
    clearSharedAuthCookie(request, response, getOAuthNonceCookieName(input.provider), {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    });
  }
}

export function clearOAuthTransactionCookies(
  request: NextRequest,
  response: NextResponse,
  provider: OAuthProvider,
) {
  for (const name of [
    getOAuthStateCookieName(provider),
    getOAuthRedirectUriCookieName(provider),
    getOAuthNextPathCookieName(provider),
    getOAuthModeCookieName(provider),
    getOAuthPkceVerifierCookieName(provider),
    getOAuthNonceCookieName(provider),
  ]) {
    clearSharedAuthCookie(request, response, name, {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    });
  }
}

export function validateOAuthTransactionFromRequest(
  request: NextRequest,
  provider: OAuthProvider,
  returnedState: string | null | undefined,
): ValidatedOAuthTransaction | null {
  const stateCookie = request.cookies.get(getOAuthStateCookieName(provider))?.value || null;
  const redirectUriCookie =
    request.cookies.get(getOAuthRedirectUriCookieName(provider))?.value || null;
  const nextPathCookie =
    request.cookies.get(getOAuthNextPathCookieName(provider))?.value || null;
  const modeCookie =
    request.cookies.get(getOAuthModeCookieName(provider))?.value === "link"
      ? "link"
      : "login";
  const pkceVerifierCookie =
    request.cookies.get(getOAuthPkceVerifierCookieName(provider))?.value || null;
  const nonceCookie =
    request.cookies.get(getOAuthNonceCookieName(provider))?.value || null;

  if (!returnedState || !stateCookie || !redirectUriCookie) {
    return null;
  }

  if (!constantTimeEqualText(returnedState, stateCookie)) {
    return null;
  }

  return {
    state: stateCookie,
    redirectUri: redirectUriCookie,
    nextPath: nextPathCookie,
    mode: modeCookie,
    pkceVerifier: pkceVerifierCookie,
    nonce: nonceCookie,
  };
}

export function validateOidcIdTokenClaims(input: {
  provider: Extract<OAuthProvider, "google" | "microsoft">;
  idToken: string | null | undefined;
  expectedAudience: string;
  expectedNonce: string | null | undefined;
}) {
  if (!input.idToken) {
    return {
      ok: false,
      reason: "missing_id_token",
    } as const;
  }

  try {
    const payload = decodeJwtPayload(input.idToken);
    const issuer = typeof payload.iss === "string" ? payload.iss.trim() : "";
    const audience = payload.aud;
    const nonce = typeof payload.nonce === "string" ? payload.nonce.trim() : "";
    const exp =
      typeof payload.exp === "number"
        ? payload.exp
        : typeof payload.exp === "string"
          ? Number(payload.exp)
          : Number.NaN;
    const metadata = getOAuthProviderIdentityMetadata(input.provider);

    const issuerOk =
      input.provider === "microsoft"
        ? metadata.oidcIssuers.some((allowedIssuer) => issuer.startsWith(allowedIssuer))
        : metadata.oidcIssuers.includes(issuer);
    const audienceOk =
      typeof audience === "string"
        ? audience === input.expectedAudience
        : Array.isArray(audience)
          ? audience.includes(input.expectedAudience)
          : false;
    const nonceOk =
      !metadata.nonceRequired ||
      Boolean(input.expectedNonce && constantTimeEqualText(nonce, input.expectedNonce));
    const expOk = Number.isFinite(exp) && exp * 1000 > Date.now() - 30_000;

    return {
      ok: issuerOk && audienceOk && nonceOk && expOk,
      reason: issuerOk
        ? audienceOk
          ? nonceOk
            ? expOk
              ? null
              : "expired_id_token"
            : "invalid_oidc_nonce"
          : "invalid_oidc_audience"
        : "invalid_oidc_issuer",
    } as const;
  } catch {
    return {
      ok: false,
      reason: "invalid_id_token_payload",
    } as const;
  }
}
