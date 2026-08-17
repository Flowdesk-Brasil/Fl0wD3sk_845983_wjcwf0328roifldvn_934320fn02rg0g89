import { NextRequest, NextResponse } from "next/server";
import {
  authConfig,
  isGoogleAuthConfigured,
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
import { exchangeGoogleCodeForToken, fetchGoogleUser } from "@/lib/auth/google";
import {
  buildLoginRedirectResponse,
  buildLoginOtpRedirectLocation,
  buildLoginTwoFactorRedirectLocation,
} from "@/lib/auth/loginFlash";
import {
  createPendingOAuthEmailOtpChallenge,
  shouldRequireInitialOAuthEmailOtp,
} from "@/lib/auth/oauthOtp";
import { buildAuthOriginRedirectResponse } from "@/lib/auth/requestOrigin";
import {
  createSessionForUser,
  findAuthUserByEmail,
  findAuthUserByGoogleUserId,
  getCurrentAuthSessionFromCookie,
  markAuthUserLastLogin,
  resolveAuthUserForGoogleLogin,
} from "@/lib/auth/session";
import { createPendingTwoFactorLoginIfNeeded } from "@/lib/auth/twoFactor";
import { buildCanonicalUrlFromInternalPath } from "@/lib/routing/subdomains";
import { extractAuditErrorMessage } from "@/lib/security/errors";
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
  clearOAuthTransactionCookies(request, response, "google");
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

function resolveGoogleAuthErrorCode(error: unknown) {
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
    message.includes("auth_user_persistence_failed") ||
    message.includes("auth_user_resolve_empty") ||
    message.includes("supabase nao retornou auth_users") ||
    message.includes("supabase nao retornou o usuario criado") ||
    (message.includes("auth_user_resolve") &&
      message.includes("cannot read properties of null") &&
      message.includes("id"))
  ) {
    return "auth_user_persistence_failed";
  }

  if (
    message.includes("redirect_uri_mismatch") ||
    (message.includes("invalid_grant") && message.includes("redirect"))
  ) {
    return "google_redirect_mismatch";
  }

  if (
    message.includes("invalid_client") ||
    message.includes("unauthorized_client")
  ) {
    return "google_provider_config_invalid";
  }

  if (message.includes("oidc google invalido")) {
    return "google_oidc_failed";
  }

  if (message.includes("falha ao trocar codigo oauth do google")) {
    return "google_oauth_exchange_failed";
  }

  if (
    message.includes("ja esta vinculada a outra conta flowdesk") ||
    message.includes("ja esta vinculada a outra conta google") ||
    message.includes("ja esta vinculado a outra conta google") ||
    message.includes("email desta conta ja esta vinculado a outra conta google")
  ) {
    return "google_conflict";
  }

  if (message.includes("email verificado")) {
    return "google_unverified_email";
  }

  if (message.includes("nao esta configurado")) {
    return "google_not_configured";
  }

  return "google_auth_failed";
}

function wrapGoogleCallbackError(phase: string, error: unknown) {
  if (error instanceof Error) {
    error.message = `google_callback_phase:${phase}: ${error.message}`;
    return error;
  }

  return new Error(`google_callback_phase:${phase}: ${String(error)}`);
}

function sanitizeGoogleCallbackStack(error: unknown) {
  if (!(error instanceof Error) || !error.stack) return null;

  return error.stack
    .split("\n")
    .slice(0, 8)
    .map((line) =>
      extractAuditErrorMessage(
        line
          .replace(/code=[^&\s)]+/gi, "code=[redacted]")
          .replace(/state=[^&\s)]+/gi, "state=[redacted]")
          .replace(/access_token=[^&\s)]+/gi, "access_token=[redacted]")
          .replace(/id_token=[^&\s)]+/gi, "id_token=[redacted]")
          .replace(/refresh_token=[^&\s)]+/gi, "refresh_token=[redacted]"),
      ),
    )
    .join("\n");
}

async function runGoogleCallbackStep<TValue>(
  phase: string,
  requestId: string,
  callback: () => Promise<TValue>,
) {
  console.info("[auth_google_callback] phase", {
    requestId,
    phase,
    outcome: "started",
  });

  try {
    const value = await callback();
    console.info("[auth_google_callback] phase", {
      requestId,
      phase,
      outcome: "succeeded",
    });
    return value;
  } catch (error) {
    console.warn("[auth_google_callback] phase", {
      requestId,
      phase,
      outcome: "failed",
      errorName: error instanceof Error ? error.name : typeof error,
      detail: extractAuditErrorMessage(error),
      stack: sanitizeGoogleCallbackStack(error),
    });
    throw wrapGoogleCallbackError(phase, error);
  }
}

function isNullIdDereference(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("cannot read properties of null") &&
    message.includes("id")
  );
}

async function resolveGoogleUserWithPersistenceRecovery(
  googleUser: Awaited<ReturnType<typeof fetchGoogleUser>>,
  currentUserId: number | null,
) {
  try {
    return await resolveAuthUserForGoogleLogin(googleUser, {
      currentUserId,
    });
  } catch (error) {
    if (!isNullIdDereference(error)) {
      throw error;
    }

    const recoveredByGoogle = await findAuthUserByGoogleUserId(googleUser.sub);
    if (recoveredByGoogle?.id) {
      return recoveredByGoogle;
    }

    const recoveredByEmail = await findAuthUserByEmail(googleUser.email);
    if (
      recoveredByEmail?.id &&
      recoveredByEmail.google_user_id === googleUser.sub
    ) {
      return recoveredByEmail;
    }

    throw error;
  }
}

export async function handleGoogleAuthCallback(request: NextRequest) {
  const originRedirectResponse = buildAuthOriginRedirectResponse(request);
  if (originRedirectResponse) {
    return originRedirectResponse;
  }

  const initialRequestContext = createSecurityRequestContext(request);
  const state = request.nextUrl.searchParams.get("state");
  const oauthTransaction = validateOAuthTransactionFromRequest(
    request,
    "google",
    state,
  );
  const nextPathCookie = normalizeInternalNextPath(oauthTransaction?.nextPath);
  const oauthModeCookie = oauthTransaction?.mode || "login";

  const rateLimit = await enforceRequestRateLimit({
    action: "auth_google_callback",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 24,
    context: initialRequestContext,
  });

  if (!rateLimit.ok) {
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_google_callback",
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
    action: "auth_google_callback",
    outcome: "started",
  });

  if (!isGoogleAuthConfigured()) {
    const response = buildLoginRedirectResponse(request, {
      nextPath: nextPathCookie,
      mode: oauthModeCookie,
      error: "google_not_configured",
    });
    clearOAuthCookies(request, response);
    return attachRequestId(response, initialRequestContext.requestId);
  }

  const code = request.nextUrl.searchParams.get("code");

  if (!code || !oauthTransaction?.redirectUri) {
    const response = buildLoginRedirectResponse(request, {
      nextPath: nextPathCookie,
      mode: oauthModeCookie,
      error: "google_invalid_state",
    });
    clearOAuthCookies(request, response);
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_google_callback",
      outcome: "failed",
      metadata: {
        reason: "invalid_oauth_state_or_code",
      },
    });
    return attachRequestId(response, initialRequestContext.requestId);
  }

  try {
    const fallbackNextPath = oauthModeCookie === "link" ? "/servers" : "/dashboard";
    const currentSession = await runGoogleCallbackStep(
      "current_session",
      initialRequestContext.requestId,
      async () =>
        oauthModeCookie === "link"
          ? await getCurrentAuthSessionFromCookie()
          : null,
    );
    const tokenPayload = await runGoogleCallbackStep(
      "token_exchange",
      initialRequestContext.requestId,
      () =>
        exchangeGoogleCodeForToken({
          code,
          redirectUri: oauthTransaction.redirectUri,
          codeVerifier: oauthTransaction.pkceVerifier,
        }),
    );
    const oidcValidation = await runGoogleCallbackStep(
      "oidc_validation",
      initialRequestContext.requestId,
      async () =>
        validateOidcIdTokenClaims({
          provider: "google",
          idToken: tokenPayload.id_token,
          expectedAudience: authConfig.googleClientId || "",
          expectedNonce: oauthTransaction.nonce,
        }),
    );
    if (!oidcValidation.ok) {
      throw new Error(`OIDC Google invalido: ${oidcValidation.reason || "unknown_reason"}`);
    }
    const googleUser = await runGoogleCallbackStep(
      "google_userinfo",
      initialRequestContext.requestId,
      () => fetchGoogleUser(tokenPayload.access_token),
    );
    const existingByGoogle = await runGoogleCallbackStep(
      "auth_user_existing_google",
      initialRequestContext.requestId,
      () => findAuthUserByGoogleUserId(googleUser.sub),
    );
    const existingByGoogleId =
      typeof existingByGoogle?.id === "number" ? existingByGoogle.id : null;

    if (
      shouldRequireInitialOAuthEmailOtp({
        mode: oauthModeCookie,
        existingProviderUserId: existingByGoogleId,
      })
    ) {
      const existingByEmail = await runGoogleCallbackStep(
        "auth_user_existing_email",
        initialRequestContext.requestId,
        () => findAuthUserByEmail(googleUser.email),
      );
      if (
        existingByEmail?.google_user_id &&
        existingByEmail.google_user_id !== googleUser.sub
      ) {
        throw new Error("O email desta conta ja esta vinculado a outra conta Google.");
      }

      const otpChallenge = await runGoogleCallbackStep(
        "email_otp_prepare",
        initialRequestContext.requestId,
        () =>
          createPendingOAuthEmailOtpChallenge({
            provider: "google",
            googleUser,
            nextPath: nextPathCookie || fallbackNextPath,
            ipAddress: extractClientIp(request),
            userAgent: request.headers.get("user-agent"),
          }),
      );
      const otpLocation = buildLoginOtpRedirectLocation(request, {
        challengeId: otpChallenge.challengeId,
        maskedEmail: otpChallenge.maskedEmail,
        expiresAt: otpChallenge.expiresAt,
        resendAvailableAt: otpChallenge.resendAvailableAt,
        provider: "google",
        nextPath: nextPathCookie || fallbackNextPath,
      });
      const response = redirectWithLocation(otpLocation);
      clearOAuthCookies(request, response);

      await logSecurityAuditEventSafe(initialRequestContext, {
        action: "auth_google_callback",
        outcome: "succeeded",
        metadata: {
          redirectTo: otpLocation,
          oauthMode: oauthModeCookie,
          otpRequired: true,
          socialSession: false,
          accountPersisted: false,
        },
      });

      return attachRequestId(response, initialRequestContext.requestId);
    }

    const user = await runGoogleCallbackStep(
      "auth_user_resolve",
      initialRequestContext.requestId,
      () =>
        resolveGoogleUserWithPersistenceRecovery(
          googleUser,
          currentSession?.user?.id ?? null,
        ),
    );
    if (!user?.id) {
      throw new Error("auth_user_resolve_empty_google");
    }
    const successLocation = buildCanonicalUrlFromInternalPath(
      request,
      nextPathCookie || fallbackNextPath,
    );

    if (oauthModeCookie === "link" && currentSession) {
      await runGoogleCallbackStep(
        "mark_last_login",
        initialRequestContext.requestId,
        () => markAuthUserLastLogin(user.id, "google"),
      );

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
        action: "auth_google_callback",
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

    const pendingTwoFactor = await runGoogleCallbackStep(
      "two_factor_prepare",
      initialRequestContext.requestId,
      () =>
        createPendingTwoFactorLoginIfNeeded({
          userId: user.id,
          redirectTo: nextPathCookie || fallbackNextPath,
          rememberSession: false,
          ipAddress: extractClientIp(request),
          userAgent: request.headers.get("user-agent"),
          sessionContext: {
            authMethod: "google",
            nextPath: nextPathCookie || fallbackNextPath,
            discordAccessToken: null,
            discordRefreshToken: null,
            discordTokenExpiresAt: null,
          },
        }),
    );
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
        action: "auth_google_callback",
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

    const session = await runGoogleCallbackStep(
      "session_create",
      initialRequestContext.requestId,
      () =>
        createSessionForUser(
          user.id,
          {
            ipAddress: extractClientIp(request),
            userAgent: request.headers.get("user-agent"),
          },
          {
            authMethod: "google",
            discordAccessToken: null,
            discordRefreshToken: null,
            discordTokenExpiresAt: null,
          },
        ),
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
      action: "auth_google_callback",
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
    const errorCode = resolveGoogleAuthErrorCode(error);
    console.warn("[auth_google_callback] failed", {
      requestId: initialRequestContext.requestId,
      errorCode,
      errorName: error instanceof Error ? error.name : typeof error,
      detail: extractAuditErrorMessage(error),
    });
    const response = buildLoginRedirectResponse(request, {
      nextPath: nextPathCookie,
      mode: oauthModeCookie,
      error: errorCode,
    });
    clearOAuthCookies(request, response);
    await logSecurityAuditEventSafe(initialRequestContext, {
      action: "auth_google_callback",
      outcome: "failed",
      metadata: {
        reason: "oauth_exchange_failed",
        detail: extractAuditErrorMessage(error),
      },
    });
    return attachRequestId(response, initialRequestContext.requestId);
  }
}
