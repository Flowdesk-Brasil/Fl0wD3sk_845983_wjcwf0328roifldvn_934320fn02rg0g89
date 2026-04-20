import { NextRequest, NextResponse } from "next/server";
import {
  isGoogleAuthConfigured,
  normalizeInternalNextPath,
  resolveGoogleRedirectUri,
} from "@/lib/auth/config";
import { buildLoginRedirectResponse } from "@/lib/auth/loginFlash";
import { buildAuthOriginRedirectResponse } from "@/lib/auth/requestOrigin";
import { isLikelyEmbeddedAuthBrowser } from "@/lib/auth/oauthBrowser";
import {
  createOAuthNonce,
  createOAuthPkcePair,
  setOAuthTransactionCookies,
} from "@/lib/auth/oauthIdentity";
import { buildGoogleAuthorizeUrl } from "@/lib/auth/google";
import { createOAuthState } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";

export async function GET(request: NextRequest) {
  const originRedirectResponse = buildAuthOriginRedirectResponse(request);
  if (originRedirectResponse) {
    return originRedirectResponse;
  }

  const requestContext = createSecurityRequestContext(request);
  const requestedNextPath = normalizeInternalNextPath(
    request.nextUrl.searchParams.get("next"),
  );
  const requestedMode =
    request.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
  const rateLimit = await enforceRequestRateLimit({
    action: "auth_google_start",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 18,
    context: requestContext,
  });

  if (!rateLimit.ok) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_google_start",
      outcome: "blocked",
      metadata: {
        reason: "rate_limit",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });

    const response = buildLoginRedirectResponse(request, {
      nextPath: requestedNextPath,
      mode: requestedMode,
      error: "slow_down",
    });
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return attachRequestId(response, requestContext.requestId);
  }

  await logSecurityAuditEventSafe(requestContext, {
    action: "auth_google_start",
    outcome: "started",
  });

  if (isLikelyEmbeddedAuthBrowser(request.headers.get("user-agent"))) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_google_start",
      outcome: "blocked",
      metadata: {
        reason: "embedded_browser_blocked",
      },
    });

    return attachRequestId(
      buildLoginRedirectResponse(request, {
        nextPath: requestedNextPath,
        mode: requestedMode,
        error: "google_embedded_browser",
      }),
      requestContext.requestId,
    );
  }

  if (!isGoogleAuthConfigured()) {
    return attachRequestId(
      buildLoginRedirectResponse(request, {
        nextPath: requestedNextPath,
        mode: requestedMode,
        error: "google_not_configured",
      }),
      requestContext.requestId,
    );
  }

  const state = createOAuthState();
  const pkce = createOAuthPkcePair();
  const nonce = createOAuthNonce();
  const redirectUri = resolveGoogleRedirectUri(request);
  const googleAuthUrl = buildGoogleAuthorizeUrl(state, redirectUri, {
    codeChallenge: pkce.challenge,
    nonce,
  });
  const response = NextResponse.redirect(googleAuthUrl, 302);
  setOAuthTransactionCookies(request, response, {
    provider: "google",
    state,
    redirectUri,
    requestedMode,
    requestedNextPath,
    pkceVerifier: pkce.verifier,
    nonce,
  });

  await logSecurityAuditEventSafe(requestContext, {
    action: "auth_google_start",
    outcome: "succeeded",
    metadata: {
      redirectUri,
      requestedNextPath,
      requestedMode,
    },
  });

  return attachRequestId(applyNoStoreHeaders(response), requestContext.requestId);
}
