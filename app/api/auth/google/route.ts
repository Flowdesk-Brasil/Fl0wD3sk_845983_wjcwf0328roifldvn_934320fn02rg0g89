import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthModeCookieName,
  getOAuthNextPathCookieName,
  getOAuthRedirectUriCookieName,
  getOAuthStateCookieName,
  isGoogleAuthConfigured,
  normalizeInternalNextPath,
  resolveGoogleRedirectUri,
} from "@/lib/auth/config";
import {
  clearSharedAuthCookie,
  setSharedAuthCookie,
} from "@/lib/auth/cookies";
import { buildLoginRedirectResponse } from "@/lib/auth/loginFlash";
import { isLikelyEmbeddedAuthBrowser } from "@/lib/auth/oauthBrowser";
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
  const redirectUri = resolveGoogleRedirectUri(request);
  const googleAuthUrl = buildGoogleAuthorizeUrl(state, redirectUri);
  const response = NextResponse.redirect(googleAuthUrl, 302);

  setSharedAuthCookie(request, response, getOAuthStateCookieName("google"), state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
    priority: "high",
  });

  setSharedAuthCookie(
    request,
    response,
    getOAuthRedirectUriCookieName("google"),
    redirectUri,
    {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
      priority: "high",
    },
  );

  if (requestedNextPath) {
    setSharedAuthCookie(
      request,
      response,
      getOAuthNextPathCookieName("google"),
      requestedNextPath,
      {
        httpOnly: true,
        sameSite: "lax",
        maxAge: 60 * 10,
        path: "/",
        priority: "high",
      },
    );
  } else {
    clearSharedAuthCookie(request, response, getOAuthNextPathCookieName("google"), {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    });
  }

  setSharedAuthCookie(
    request,
    response,
    getOAuthModeCookieName("google"),
    requestedMode,
    {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
      priority: "high",
    },
  );

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
