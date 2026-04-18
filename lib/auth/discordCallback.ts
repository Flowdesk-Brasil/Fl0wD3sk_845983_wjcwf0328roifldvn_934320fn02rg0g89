import { NextRequest, NextResponse } from "next/server";
import {
  getOAuthModeCookieName,
  getOAuthNextPathCookieName,
  getOAuthRedirectUriCookieName,
  getOAuthStateCookieName,
  normalizeInternalNextPath,
} from "@/lib/auth/config";
import {
  clearSharedAuthCookie,
  setSharedSessionCookie,
} from "@/lib/auth/cookies";
import { exchangeCodeForToken, fetchDiscordUser } from "@/lib/auth/discord";
import { buildLoginHref, type LoginIntentMode } from "@/lib/auth/paths";
import {
  createUserSessionFromDiscordUser,
  getCurrentAuthSessionFromCookie,
} from "@/lib/auth/session";
import { buildCanonicalUrlFromInternalPath } from "@/lib/routing/subdomains";
import { applyNoStoreHeaders } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
  extendSecurityRequestContext,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";

function extractClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  return forwardedFor.split(",")[0]?.trim() || null;
}

function clearOAuthCookies(request: NextRequest, response: NextResponse) {
  clearSharedAuthCookie(request, response, getOAuthStateCookieName("discord"), {
    httpOnly: true,
    sameSite: "lax",
    priority: "high",
  });
  clearSharedAuthCookie(
    request,
    response,
    getOAuthRedirectUriCookieName("discord"),
    {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    },
  );
  clearSharedAuthCookie(
    request,
    response,
    getOAuthNextPathCookieName("discord"),
    {
      httpOnly: true,
      sameSite: "lax",
      priority: "high",
    },
  );
  clearSharedAuthCookie(request, response, getOAuthModeCookieName("discord"), {
    httpOnly: true,
    sameSite: "lax",
    priority: "high",
  });
}

function redirectWithLocation(location: string) {
  return applyNoStoreHeaders(
    new NextResponse(null, {
      status: 302,
      headers: {
        Location: location,
      },
    }),
  );
}

function buildLoginRedirectLocation(
  request: NextRequest,
  input: {
    nextPath?: string | null;
    mode?: LoginIntentMode;
    error?: string | null;
  } = {},
) {
  const loginPath = buildLoginHref(input.nextPath, input.mode ?? "login");
  const loginUrl = new URL(
    buildCanonicalUrlFromInternalPath(request, loginPath, {
      fallbackArea: "account",
    }),
  );

  if (input.error) {
    loginUrl.searchParams.set("error", input.error);
  }

  return loginUrl.toString();
}

function resolveDiscordAuthErrorCode(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : "";

  if (
    message.includes("ja esta vinculada a outra conta") ||
    message.includes("ja esta vinculado a outro discord") ||
    message.includes("email desta conta ja esta vinculado")
  ) {
    return "discord_conflict";
  }

  return "discord_auth_failed";
}

export async function handleDiscordAuthCallback(request: NextRequest) {
  const initialRequestContext = createSecurityRequestContext(request);
  const nextPathCookie = normalizeInternalNextPath(
    request.cookies.get(getOAuthNextPathCookieName("discord"))?.value,
  );
  const oauthModeCookie =
    request.cookies.get(getOAuthModeCookieName("discord"))?.value === "link"
      ? "link"
      : "login";

  const rateLimit = await enforceRequestRateLimit({
    action: "auth_discord_callback",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 24,
    context: initialRequestContext,
  });

  if (!rateLimit.ok) {
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_discord_callback",
      outcome: "blocked",
      metadata: {
        reason: "rate_limit",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });

    const response = redirectWithLocation(
      buildLoginRedirectLocation(request, {
        nextPath: nextPathCookie,
        mode: oauthModeCookie,
        error: "slow_down",
      }),
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    clearOAuthCookies(request, response);
    return attachRequestId(response, initialRequestContext.requestId);
  }

  await logSecurityAuditEventSafe(initialRequestContext, {
    action: "auth_discord_callback",
    outcome: "started",
  });

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const stateCookie = request.cookies.get(getOAuthStateCookieName("discord"))?.value;
  const redirectUriCookie = request.cookies.get(
    getOAuthRedirectUriCookieName("discord"),
  )?.value;

  if (!code || !state || !stateCookie || !redirectUriCookie || state !== stateCookie) {
    const response = redirectWithLocation(
      buildLoginRedirectLocation(request, {
        nextPath: nextPathCookie,
        mode: oauthModeCookie,
        error: "discord_invalid_state",
      }),
    );
    clearOAuthCookies(request, response);
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_discord_callback",
      outcome: "failed",
      metadata: {
        reason: "invalid_oauth_state_or_code",
      },
    });
    return attachRequestId(response, initialRequestContext.requestId);
  }

  try {
    const currentSession =
      oauthModeCookie === "link"
        ? await getCurrentAuthSessionFromCookie()
        : null;
    const tokenPayload = await exchangeCodeForToken({
      code,
      redirectUri: redirectUriCookie,
    });

    const discordUser = await fetchDiscordUser(tokenPayload.access_token);
    const discordTokenExpiresAt = new Date(
      Date.now() + tokenPayload.expires_in * 1000,
    ).toISOString();

    const { user, session } = await createUserSessionFromDiscordUser(
      discordUser,
      {
        ipAddress: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
      },
      {
        discordAccessToken: tokenPayload.access_token,
        discordRefreshToken: tokenPayload.refresh_token || null,
        discordTokenExpiresAt,
      },
      {
        currentUserId: currentSession?.user.id ?? null,
      },
    );

    const successLocation = buildCanonicalUrlFromInternalPath(
      request,
      nextPathCookie || "/dashboard",
    );
    const response = redirectWithLocation(successLocation);

    setSharedSessionCookie(request, response, session.sessionToken);

    clearOAuthCookies(request, response);
    const authenticatedContext = extendSecurityRequestContext(
      initialRequestContext,
      {
        userId: user.id,
      },
    );
    await logSecurityAuditEventSafe(authenticatedContext, {
      action: "auth_discord_callback",
      outcome: "succeeded",
      metadata: {
        redirectTo: successLocation,
        oauthMode: oauthModeCookie,
      },
    });
    return attachRequestId(response, initialRequestContext.requestId);
  } catch (error) {
    const response = redirectWithLocation(
      buildLoginRedirectLocation(request, {
        nextPath: nextPathCookie,
        mode: oauthModeCookie,
        error: resolveDiscordAuthErrorCode(error),
      }),
    );
    clearOAuthCookies(request, response);
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_discord_callback",
      outcome: "failed",
      metadata: {
        reason: "oauth_exchange_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
    });
    return attachRequestId(response, initialRequestContext.requestId);
  }
}
