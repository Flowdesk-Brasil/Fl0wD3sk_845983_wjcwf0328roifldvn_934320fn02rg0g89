import { NextRequest, NextResponse } from "next/server";
import {
  authConfig,
  isSecureRequest,
  resolveDiscordRedirectUri,
} from "@/lib/auth/config";
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
  const requestContext = createSecurityRequestContext(request);
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

    const response = applyNoStoreHeaders(
      NextResponse.redirect(new URL("/login?error=slow_down", request.url)),
    );
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

  const response = NextResponse.redirect(discordAuthUrl);

  response.cookies.set(authConfig.oauthStateCookieName, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    maxAge: 60 * 10,
    path: "/",
    priority: "high",
  });

  response.cookies.set(authConfig.oauthRedirectUriCookieName, redirectUri, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(request),
    maxAge: 60 * 10,
    path: "/",
    priority: "high",
  });

  await logSecurityAuditEventSafe(requestContext, {
    action: "auth_discord_start",
    outcome: "succeeded",
    metadata: {
      redirectUri,
    },
  });

  return attachRequestId(applyNoStoreHeaders(response), requestContext.requestId);
}
