import { NextRequest, NextResponse } from "next/server";
import {
  normalizeInternalNextPath,
} from "@/lib/auth/config";
import {
  setSharedSessionCookie,
} from "@/lib/auth/cookies";
import { exchangeCodeForToken, fetchDiscordUser } from "@/lib/auth/discord";
import {
  clearOAuthTransactionCookies,
  validateOAuthTransactionFromRequest,
} from "@/lib/auth/oauthIdentity";
import {
  buildLoginRedirectResponse,
  buildLoginTwoFactorRedirectLocation,
} from "@/lib/auth/loginFlash";
import { buildAuthOriginRedirectResponse } from "@/lib/auth/requestOrigin";
import {
  createSessionForUser,
  getCurrentAuthSessionFromCookie,
  markAuthUserLastLogin,
  resolveAuthUserForDiscordLogin,
  updateSessionDiscordTokens,
} from "@/lib/auth/session";
import { createPendingTwoFactorLoginIfNeeded } from "@/lib/auth/twoFactor";
import {
  buildCanonicalUrlFromInternalPath,
  getRequestHostname,
  resolveHostRuntimeContext,
} from "@/lib/routing/subdomains";
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
  clearOAuthTransactionCookies(request, response, "discord");
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

function resolveDiscordAuthErrorCode(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : "";

  if (
    message.includes("schema cache") ||
    message.includes("could not find") ||
    message.includes("does not exist") ||
    message.includes("column") ||
    message.includes("relation")
  ) {
    return "auth_schema_outdated";
  }

  if (
    message.includes("auth_user_resolve_empty") ||
    message.includes("supabase nao retornou auth_users") ||
    message.includes("supabase nao retornou o usuario criado")
  ) {
    return "auth_user_persistence_failed";
  }

  if (
    message.includes("redirect_uri_mismatch") ||
    (message.includes("invalid_grant") && message.includes("redirect"))
  ) {
    return "discord_redirect_mismatch";
  }

  if (
    message.includes("invalid_client") ||
    message.includes("unauthorized_client")
  ) {
    return "discord_provider_config_invalid";
  }

  if (message.includes("falha ao trocar codigo oauth")) {
    return "discord_oauth_exchange_failed";
  }

  if (
    message.includes("ja esta vinculada a outra conta") ||
    message.includes("ja esta vinculado a outro discord") ||
    message.includes("email desta conta ja esta vinculado")
  ) {
    return "discord_conflict";
  }

  if (message.includes("email verificado")) {
    return "discord_unverified_email";
  }

  return "discord_auth_failed";
}

function isLocalDiscordAuthRequest(request: NextRequest) {
  return resolveHostRuntimeContext(getRequestHostname(request)).mode === "local";
}

export async function handleDiscordAuthCallback(request: NextRequest) {
  const originRedirectResponse = buildAuthOriginRedirectResponse(request);
  if (originRedirectResponse) {
    return originRedirectResponse;
  }

  const initialRequestContext = createSecurityRequestContext(request);
  const state = request.nextUrl.searchParams.get("state");
  const oauthTransaction = validateOAuthTransactionFromRequest(
    request,
    "discord",
    state,
  );
  const nextPathCookie = normalizeInternalNextPath(oauthTransaction?.nextPath);
  const oauthModeCookie = oauthTransaction?.mode || "login";

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

    const response = buildLoginRedirectResponse(request, {
      nextPath: nextPathCookie,
      mode: oauthModeCookie,
      error: "slow_down",
    });
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    clearOAuthCookies(request, response);
    return attachRequestId(response, initialRequestContext.requestId);
  }

  await logSecurityAuditEventSafe(initialRequestContext, {
    action: "auth_discord_callback",
    outcome: "started",
  });

  const code = request.nextUrl.searchParams.get("code");

  if (!code || !oauthTransaction?.redirectUri) {
    const response = buildLoginRedirectResponse(request, {
      nextPath: nextPathCookie,
      mode: oauthModeCookie,
      error: "discord_invalid_state",
    });
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
    const fallbackNextPath = oauthModeCookie === "link" ? "/servers" : "/dashboard";
    const currentSession =
      oauthModeCookie === "link"
        ? await getCurrentAuthSessionFromCookie()
        : null;
    const tokenPayload = await exchangeCodeForToken({
      code,
      redirectUri: oauthTransaction.redirectUri,
    });

    const discordUser = await fetchDiscordUser(tokenPayload.access_token);
    const discordTokenExpiresAt = new Date(
      Date.now() + tokenPayload.expires_in * 1000,
    ).toISOString();
    const localDiscordAuth = isLocalDiscordAuthRequest(request);
    const user = await resolveAuthUserForDiscordLogin(discordUser, {
      currentUserId: currentSession?.user?.id ?? null,
      skipAccountCreatedEmail: localDiscordAuth,
    });
    if (!user?.id) {
      throw new Error("auth_user_resolve_empty_discord");
    }
    const successLocation = buildCanonicalUrlFromInternalPath(
      request,
      nextPathCookie || fallbackNextPath,
    );

    if (oauthModeCookie === "link" && currentSession) {
      await updateSessionDiscordTokens(currentSession.id, {
        discordAccessToken: tokenPayload.access_token,
        discordRefreshToken: tokenPayload.refresh_token || null,
        discordTokenExpiresAt,
      });
      await markAuthUserLastLogin(user.id, "discord");

      const response = redirectWithLocation(successLocation);
      clearOAuthCookies(request, response);

      const authenticatedContext = extendSecurityRequestContext(
        initialRequestContext,
        {
          userId: user.id,
          sessionId: currentSession.id,
        },
      );

      await logSecurityAuditEventSafe(authenticatedContext, {
        action: "auth_discord_callback",
        outcome: "succeeded",
        metadata: {
          redirectTo: successLocation,
          oauthMode: oauthModeCookie,
          otpRequired: false,
          reusedSession: true,
        },
      });

      return attachRequestId(response, initialRequestContext.requestId);
    }

    const pendingTwoFactor = await createPendingTwoFactorLoginIfNeeded({
      userId: user.id,
      redirectTo: nextPathCookie || fallbackNextPath,
      rememberSession: false,
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get("user-agent"),
      sessionContext: {
        authMethod: "discord",
        nextPath: nextPathCookie || fallbackNextPath,
        discordAccessToken: tokenPayload.access_token,
        discordRefreshToken: tokenPayload.refresh_token || null,
        discordTokenExpiresAt,
      },
    });
    if (pendingTwoFactor) {
      const twoFactorLocation = buildLoginTwoFactorRedirectLocation(request, {
        challengeId: pendingTwoFactor.challengeId,
        methods: pendingTwoFactor.methods,
        expiresAt: pendingTwoFactor.expiresAt,
        nextPath: nextPathCookie || fallbackNextPath,
      });
      const response = redirectWithLocation(twoFactorLocation);
      clearOAuthCookies(request, response);

      const authenticatedContext = extendSecurityRequestContext(
        initialRequestContext,
        { userId: user.id },
      );
      await logSecurityAuditEventSafe(authenticatedContext, {
        action: "auth_discord_callback",
        outcome: "succeeded",
        metadata: {
          redirectTo: twoFactorLocation,
          oauthMode: oauthModeCookie,
          twoFactorRequired: true,
          twoFactorMethods: pendingTwoFactor.methods,
        },
      });

      return attachRequestId(response, initialRequestContext.requestId);
    }

    const session = await createSessionForUser(
      user.id,
      {
        ipAddress: extractClientIp(request),
        userAgent: request.headers.get("user-agent"),
      },
      {
        authMethod: "discord",
        discordAccessToken: tokenPayload.access_token,
        discordRefreshToken: tokenPayload.refresh_token || null,
        discordTokenExpiresAt,
      },
      {
        rememberSession: localDiscordAuth,
        skipLoginNotification: localDiscordAuth,
      },
    );
    const response = redirectWithLocation(successLocation);
    setSharedSessionCookie(request, response, session.sessionToken, {
      maxAge: session.maxAgeSeconds,
    });
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
        otpRequired: false,
        socialSession: true,
        localDiscordAuth,
      },
    });

    return attachRequestId(response, initialRequestContext.requestId);
  } catch (error) {
    const errorCode = resolveDiscordAuthErrorCode(error);
    console.warn("[auth_discord_callback] failed", {
      requestId: initialRequestContext.requestId,
      errorCode,
      errorName: error instanceof Error ? error.name : typeof error,
      detail: error instanceof Error ? error.message : "unknown_error",
    });
    const response = buildLoginRedirectResponse(request, {
      nextPath: nextPathCookie,
      mode: oauthModeCookie,
      error: errorCode,
    });
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
