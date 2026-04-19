import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthModeCookieName,
  getOAuthNextPathCookieName,
  getOAuthRedirectUriCookieName,
  getOAuthStateCookieName,
  normalizeInternalNextPath,
  resolveDiscordRedirectUri,
} from "@/lib/auth/config";
import {
  clearSharedAuthCookie,
  setSharedAuthCookie,
} from "@/lib/auth/cookies";
import { buildLoginRedirectResponse } from "@/lib/auth/loginFlash";
import { buildAuthOriginRedirectResponse } from "@/lib/auth/requestOrigin";
import { buildDiscordAuthorizeUrl } from "@/lib/auth/discord";
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
    action: "auth_discord_start",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 18,
    context: requestContext,
  });

  if (!rateLimit.ok) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_discord_start",
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
    action: "auth_discord_start",
    outcome: "started",
  });

  const state = createOAuthState();
  const redirectUri = resolveDiscordRedirectUri(request);
  const discordAuthUrl = buildDiscordAuthorizeUrl(state, redirectUri);

  const response = NextResponse.redirect(discordAuthUrl, 302);

  setSharedAuthCookie(request, response, getOAuthStateCookieName("discord"), state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 10,
    path: "/",
    priority: "high",
  });

  setSharedAuthCookie(
    request,
    response,
    getOAuthRedirectUriCookieName("discord"),
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
      getOAuthNextPathCookieName("discord"),
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
    clearSharedAuthCookie(request, response, getOAuthNextPathCookieName("discord"), {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    });
  }

  setSharedAuthCookie(
    request,
    response,
    getOAuthModeCookieName("discord"),
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
    action: "auth_discord_start",
    outcome: "succeeded",
    metadata: {
      redirectUri,
      requestedNextPath,
      requestedMode,
    },
  });

  return attachRequestId(applyNoStoreHeaders(response), requestContext.requestId);
}
