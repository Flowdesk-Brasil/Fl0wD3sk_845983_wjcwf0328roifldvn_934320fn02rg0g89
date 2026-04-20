import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  createDiscordLinkHumanChallenge,
  createDiscordLinkHumanVerificationToken,
  getDiscordLinkHumanCookieName,
  getDiscordLinkHumanMinimumSolveMs,
  validateDiscordLinkHumanChallengeToken,
  validateDiscordLinkHumanVerification,
} from "@/lib/discordLink/humanCheck";
import { validateDiscordLinkAccessToken } from "@/lib/discordLink/linkAccess";
import { OFFICIAL_DISCORD_GUILD_ID } from "@/lib/discordLink/config";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest, applyNoStoreHeaders } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
  extendSecurityRequestContext,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";

function buildDiscordAvatarUrl(
  discordUserId: string | null,
  avatarHash: string | null,
) {
  if (!avatarHash || !discordUserId) return null;
  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=160`;
}

async function buildAuthenticatedUserPayload() {
  const authSession = await getCurrentAuthSessionFromCookie();
  if (!authSession || !authSession.user.discord_user_id) return null;

  return {
    discordUserId: authSession.user.discord_user_id,
    username: authSession.user.username,
    displayName: authSession.user.display_name,
    avatarUrl: buildDiscordAvatarUrl(
      authSession.user.discord_user_id,
      authSession.user.avatar,
    ),
  };
}

const DISCORD_LINK_TOKEN_PATTERN = /^[A-Za-z0-9._-]+$/;

export async function GET(request: NextRequest) {
  const requestContext = createSecurityRequestContext(request, {
    guildId: OFFICIAL_DISCORD_GUILD_ID,
  });
  const accessToken = request.nextUrl.searchParams.get("access");
  const accessValidation = await validateDiscordLinkAccessToken(accessToken);
  const authenticatedUser = await buildAuthenticatedUserPayload();

  if (!accessValidation.ok) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "discord_link_human_check",
      outcome: "blocked",
      metadata: {
        reason: accessValidation.reason,
      },
    });

    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            authenticated: Boolean(authenticatedUser),
            message: accessValidation.message,
            authenticatedUser,
          },
          { status: 403 },
        ),
      ),
      requestContext.requestId,
    );
  }

  const verification = await validateDiscordLinkHumanVerification({
    accessNonce: accessValidation.payload.nonce,
  });

  if (verification.ok) {
    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          authenticated: Boolean(authenticatedUser),
          verified: true,
          minSolveMs: getDiscordLinkHumanMinimumSolveMs(),
          authenticatedUser,
        }),
      ),
      requestContext.requestId,
    );
  }

  const challenge = createDiscordLinkHumanChallenge({
    accessNonce: accessValidation.payload.nonce,
    accessExpiresAt: accessValidation.payload.exp,
  });

  return attachRequestId(
    applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        authenticated: Boolean(authenticatedUser),
        verified: false,
        challengeToken: challenge.token,
        minSolveMs: getDiscordLinkHumanMinimumSolveMs(),
        authenticatedUser,
      }),
    ),
    requestContext.requestId,
  );
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) {
    return originGuard;
  }

  const requestContext = createSecurityRequestContext(request, {
    guildId: OFFICIAL_DISCORD_GUILD_ID,
  });
  const authenticatedUser = await buildAuthenticatedUserPayload();

  let payload: {
    accessToken?: string | null;
    challengeToken?: string | null;
    dwellMs?: number;
    interactionCount?: number;
    pointerType?: "mouse" | "touch" | "pen" | "unknown";
  };

  try {
    payload = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        accessToken: flowSecureDto.optional(
          flowSecureDto.nullable(
            flowSecureDto.string({
              minLength: 16,
              maxLength: 768,
              pattern: DISCORD_LINK_TOKEN_PATTERN,
              disallowAngleBrackets: true,
              rejectThreatPatterns: false,
            }),
          ),
        ),
        challengeToken: flowSecureDto.optional(
          flowSecureDto.nullable(
            flowSecureDto.string({
              minLength: 16,
              maxLength: 768,
              pattern: DISCORD_LINK_TOKEN_PATTERN,
              disallowAngleBrackets: true,
              rejectThreatPatterns: false,
            }),
          ),
        ),
        dwellMs: flowSecureDto.optional(
          flowSecureDto.number({
            integer: true,
            min: 0,
            max: 10 * 60 * 1000,
          }),
        ),
        interactionCount: flowSecureDto.optional(
          flowSecureDto.number({
            integer: true,
            min: 0,
            max: 1000,
          }),
        ),
        pointerType: flowSecureDto.optional(
          flowSecureDto.enum(["mouse", "touch", "pen", "unknown"] as const),
        ),
      },
      {
        rejectUnknown: true,
      },
    );
  } catch (error) {
    const message =
      error instanceof FlowSecureDtoError
        ? error.issues[0] || error.message
        : "Payload invalido.";

    await logSecurityAuditEventSafe(requestContext, {
      action: "discord_link_human_check",
      outcome: "blocked",
      metadata: {
        reason: message,
      },
    });

    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message,
            authenticatedUser,
          },
          { status: 400 },
        ),
      ),
      requestContext.requestId,
    );
  }

  const accessToken = payload.accessToken ?? null;
  const challengeToken = payload.challengeToken ?? null;
  const dwellMs = payload.dwellMs ?? 0;
  const interactionCount = payload.interactionCount ?? 0;
  const pointerType = payload.pointerType ?? "unknown";

  const accessValidation = await validateDiscordLinkAccessToken(accessToken);
  if (!accessValidation.ok) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "discord_link_human_check",
      outcome: "blocked",
      metadata: {
        reason: accessValidation.reason,
      },
    });

    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: accessValidation.message,
            authenticatedUser,
          },
          { status: 403 },
        ),
      ),
      requestContext.requestId,
    );
  }

  const session = await getCurrentAuthSessionFromCookie();
  const authenticatedContext = extendSecurityRequestContext(requestContext, {
    sessionId: session?.id || null,
    userId: session?.user.id || null,
    guildId: OFFICIAL_DISCORD_GUILD_ID,
  });

  const rateLimit = await enforceRequestRateLimit({
    action: "discord_link_human_check",
    windowMs: 10 * 60 * 1000,
    maxAttempts: 60,
    context: authenticatedContext,
  });

  if (!rateLimit.ok) {
    await logSecurityAuditEventSafe(authenticatedContext, {
      action: "discord_link_human_check",
      outcome: "blocked",
      metadata: {
        reason: "rate_limit",
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      },
    });

    const response = applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            "Muitas validacoes humanas em sequencia. Aguarde alguns segundos e tente novamente.",
          authenticatedUser,
        },
        { status: 429 },
      ),
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return attachRequestId(response, authenticatedContext.requestId);
  }

  await logSecurityAuditEventSafe(authenticatedContext, {
    action: "discord_link_human_check",
    outcome: "started",
    metadata: {
      pointerType,
      dwellMs,
      interactionCount,
    },
  });

  const challengeValidation = validateDiscordLinkHumanChallengeToken({
    token: challengeToken,
    accessNonce: accessValidation.payload.nonce,
  });

  if (!challengeValidation.ok) {
    await logSecurityAuditEventSafe(authenticatedContext, {
      action: "discord_link_human_check",
      outcome: "blocked",
      metadata: {
        reason: challengeValidation.reason,
      },
    });

    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: challengeValidation.message,
            authenticatedUser,
          },
          { status: 403 },
        ),
      ),
      authenticatedContext.requestId,
    );
  }

  if (dwellMs < getDiscordLinkHumanMinimumSolveMs() || interactionCount < 1) {
    await logSecurityAuditEventSafe(authenticatedContext, {
      action: "discord_link_human_check",
      outcome: "blocked",
      metadata: {
        reason: "insufficient_proof",
        dwellMs,
        interactionCount,
        pointerType,
      },
    });

    return attachRequestId(
      applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Confirme a verificacao humana com um clique normal para continuar a vinculacao.",
            authenticatedUser,
          },
          { status: 400 },
        ),
      ),
      authenticatedContext.requestId,
    );
  }

  const verificationToken = createDiscordLinkHumanVerificationToken({
    accessNonce: accessValidation.payload.nonce,
    accessExpiresAt: accessValidation.payload.exp,
  });

  await logSecurityAuditEventSafe(authenticatedContext, {
    action: "discord_link_human_check",
    outcome: "succeeded",
    metadata: {
      pointerType,
      dwellMs,
      interactionCount,
    },
  });

  const response = attachRequestId(
    applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        verified: true,
        verificationToken: verificationToken.token,
        authenticatedUser,
      }),
    ),
    authenticatedContext.requestId,
  );

  response.cookies.set(getDiscordLinkHumanCookieName(), verificationToken.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    expires: new Date(verificationToken.payload.exp),
    path: "/",
  });

  return response;
}
