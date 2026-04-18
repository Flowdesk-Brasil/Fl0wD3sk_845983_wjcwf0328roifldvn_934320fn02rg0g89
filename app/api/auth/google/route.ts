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

    const response = applyNoStoreHeaders(
      NextResponse.redirect(new URL("/login?error=slow_down", request.url), 302),
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return attachRequestId(response, requestContext.requestId);
  }

  await logSecurityAuditEventSafe(requestContext, {
    action: "auth_google_start",
    outcome: "started",
  });

  if (!isGoogleAuthConfigured()) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.redirect(new URL("/login?error=google_not_configured", request.url), 302),
      ),
      requestContext.requestId,
    );
  }

  const state = createOAuthState();
  const redirectUri = resolveGoogleRedirectUri(request);
  const requestedNextPath = normalizeInternalNextPath(
    request.nextUrl.searchParams.get("next"),
  );
  const requestedMode =
    request.nextUrl.searchParams.get("mode") === "link" ? "link" : "login";
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
