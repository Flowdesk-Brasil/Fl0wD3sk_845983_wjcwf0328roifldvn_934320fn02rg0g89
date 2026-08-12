import { NextRequest, NextResponse } from "next/server";
import {
  authConfig,
  isMicrosoftAuthConfigured,
  normalizeInternalNextPath,
} from "@/lib/auth/config";
import {
  setSharedSessionCookie,
} from "@/lib/auth/cookies";
import {
  clearOAuthTransactionCookies,
  validateOAuthTransactionFromRequest,
  validateOidcIdTokenClaims,
} from "@/lib/auth/oauthIdentity";
import {
  exchangeMicrosoftCodeForToken,
  fetchMicrosoftUser,
  syncMicrosoftProfilePhotoForAuthUser,
} from "@/lib/auth/microsoft";
import {
  buildLoginRedirectResponse,
  buildLoginTwoFactorRedirectLocation,
} from "@/lib/auth/loginFlash";
import { buildAuthOriginRedirectResponse } from "@/lib/auth/requestOrigin";
import {
  createSessionForUser,
  getCurrentAuthSessionFromCookie,
  markAuthUserLastLogin,
  resolveAuthUserForMicrosoftLogin,
} from "@/lib/auth/session";
import { createPendingTwoFactorLoginIfNeeded } from "@/lib/auth/twoFactor";
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
  clearOAuthTransactionCookies(request, response, "microsoft");
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

function resolveMicrosoftAuthErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

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
    message.includes("redirect_uri_mismatch") ||
    (message.includes("invalid_grant") && message.includes("redirect"))
  ) {
    return "microsoft_redirect_mismatch";
  }

  if (
    message.includes("invalid_client") ||
    message.includes("unauthorized_client")
  ) {
    return "microsoft_provider_config_invalid";
  }

  if (message.includes("oidc microsoft invalido")) {
    return "microsoft_oidc_failed";
  }

  if (message.includes("falha ao trocar codigo oauth microsoft")) {
    return "microsoft_oauth_exchange_failed";
  }

  if (
    message.includes("ja esta vinculada a outra conta flowdesk") ||
    message.includes("ja esta vinculada a outra conta microsoft") ||
    message.includes("ja esta vinculado a outra conta microsoft") ||
    message.includes("email desta conta ja esta vinculado a outra conta microsoft")
  ) {
    return "microsoft_conflict";
  }

  if (message.includes("nao retornou um email")) {
    return "microsoft_missing_email";
  }

  if (message.includes("nao esta configurado")) {
    return "microsoft_not_configured";
  }

  return "microsoft_auth_failed";
}

export async function handleMicrosoftAuthCallback(request: NextRequest) {
  const originRedirectResponse = buildAuthOriginRedirectResponse(request);
  if (originRedirectResponse) {
    return originRedirectResponse;
  }

  const initialRequestContext = createSecurityRequestContext(request);
  const state = request.nextUrl.searchParams.get("state");
  const oauthTransaction = validateOAuthTransactionFromRequest(
    request,
    "microsoft",
    state,
  );
  const nextPathCookie = normalizeInternalNextPath(oauthTransaction?.nextPath);
  const oauthModeCookie = oauthTransaction?.mode || "login";

  const rateLimit = await enforceRequestRateLimit({
    action: "auth_microsoft_callback",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 24,
    context: initialRequestContext,
  });

  if (!rateLimit.ok) {
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_microsoft_callback",
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
    action: "auth_microsoft_callback",
    outcome: "started",
  });

  if (!isMicrosoftAuthConfigured()) {
    const response = buildLoginRedirectResponse(request, {
        nextPath: nextPathCookie,
        mode: oauthModeCookie,
        error: "microsoft_not_configured",
      });
    clearOAuthCookies(request, response);
    return attachRequestId(response, initialRequestContext.requestId);
  }

  const code = request.nextUrl.searchParams.get("code");

  if (!code || !oauthTransaction?.redirectUri) {
    const response = buildLoginRedirectResponse(request, {
        nextPath: nextPathCookie,
        mode: oauthModeCookie,
        error: "microsoft_invalid_state",
      });
    clearOAuthCookies(request, response);
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_microsoft_callback",
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
    const tokenPayload = await exchangeMicrosoftCodeForToken({
      code,
      redirectUri: oauthTransaction.redirectUri,
      codeVerifier: oauthTransaction.pkceVerifier,
    });
    const oidcValidation = validateOidcIdTokenClaims({
      provider: "microsoft",
      idToken: tokenPayload.id_token,
      expectedAudience: authConfig.microsoftClientId || "",
      expectedNonce: oauthTransaction.nonce,
    });
    if (!oidcValidation.ok) {
      throw new Error(
        `OIDC Microsoft invalido: ${oidcValidation.reason || "unknown_reason"}`,
      );
    }
    const microsoftUser = await fetchMicrosoftUser(tokenPayload.access_token!);
    const user = await resolveAuthUserForMicrosoftLogin(microsoftUser, {
      currentUserId: currentSession?.user.id ?? null,
    });
    await syncMicrosoftProfilePhotoForAuthUser(
      user.id,
      tokenPayload.access_token!,
    ).catch((error) => {
      console.warn(
        "[auth_microsoft_callback] failed to sync profile photo",
        error,
      );
    });

    const successLocation = buildCanonicalUrlFromInternalPath(
      request,
      nextPathCookie || fallbackNextPath,
    );

    if (oauthModeCookie === "link" && currentSession) {
      await markAuthUserLastLogin(user.id, "microsoft");

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
        action: "auth_microsoft_callback",
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
        authMethod: "microsoft",
        nextPath: nextPathCookie || fallbackNextPath,
        discordAccessToken: null,
        discordRefreshToken: null,
        discordTokenExpiresAt: null,
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
        action: "auth_microsoft_callback",
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
        authMethod: "microsoft",
        discordAccessToken: null,
        discordRefreshToken: null,
        discordTokenExpiresAt: null,
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
      action: "auth_microsoft_callback",
      outcome: "succeeded",
      metadata: {
        redirectTo: successLocation,
        oauthMode: oauthModeCookie,
        otpRequired: false,
        socialSession: true,
      },
    });
    return attachRequestId(response, initialRequestContext.requestId);
  } catch (error) {
    const errorCode = resolveMicrosoftAuthErrorCode(error);
    console.warn("[auth_microsoft_callback] failed", {
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
      action: "auth_microsoft_callback",
      outcome: "failed",
      metadata: {
        reason: "oauth_exchange_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
      },
    });
    return attachRequestId(response, initialRequestContext.requestId);
  }
}
