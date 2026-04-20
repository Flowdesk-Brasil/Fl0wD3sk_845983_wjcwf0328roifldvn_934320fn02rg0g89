import { NextResponse } from "next/server";
import {
  getAccessibleGuildsForSession,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
  extendSecurityRequestContext,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { getAcceptedTeamGuildIdsForUser } from "@/lib/teams/userTeams";

type SessionData = NonNullable<Awaited<ReturnType<typeof resolveSessionAccessToken>>>;

const MAX_FAVORITE_GUILDS = 100;
const DISCORD_GUILD_ID_REGEX = /^\d{10,25}$/;

function normalizeFavoriteGuildIds(input: unknown) {
  if (!Array.isArray(input)) return [];

  const unique = new Set<string>();

  for (const value of input) {
    if (typeof value !== "string") continue;

    const guildId = value.trim();
    if (!DISCORD_GUILD_ID_REGEX.test(guildId)) continue;

    unique.add(guildId);
    if (unique.size >= MAX_FAVORITE_GUILDS) break;
  }

  return Array.from(unique);
}

async function getAllowedGuildIdSet(sessionData: SessionData) {
  const [accessibleGuilds, acceptedTeamGuildIds] = await Promise.all([
    sessionData.accessToken
      ? getAccessibleGuildsForSession({
          authSession: sessionData.authSession,
          accessToken: sessionData.accessToken,
        })
      : Promise.resolve([]),
    getAcceptedTeamGuildIdsForUser({
      authUserId: sessionData.authSession.user.id,
      discordUserId: sessionData.authSession.user.discord_user_id,
    }),
  ]);

  return new Set<string>([
    ...accessibleGuilds.map((guild) => guild.id),
    ...acceptedTeamGuildIds,
  ]);
}

export async function GET(request: Request) {
  const requestContext = createSecurityRequestContext(request);
  const respond = (body: unknown, init?: ResponseInit) =>
    attachRequestId(
      applyNoStoreHeaders(NextResponse.json(body, init)),
      requestContext.requestId,
    );

  try {
    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession) {
      return respond(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      );
    }

    const auditContext = extendSecurityRequestContext(requestContext, {
      sessionId: sessionData.authSession.id,
      userId: sessionData.authSession.user.id,
    });

    const [allowedGuildIds, favoritesResult] = await Promise.all([
      getAllowedGuildIdSet(sessionData),
      getSupabaseAdminClientOrThrow()
        .from("auth_user_favorite_guilds")
        .select("guild_id, sort_order")
        .eq("user_id", sessionData.authSession.user.id)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true }),
    ]);

    if (favoritesResult.error) {
      throw new Error(favoritesResult.error.message);
    }

    const favoriteGuildIds = (favoritesResult.data || [])
      .map((row) => row.guild_id)
      .filter((guildId) => allowedGuildIds.has(guildId));

    await logSecurityAuditEventSafe(auditContext, {
      action: "auth_guild_favorites_read",
      outcome: "succeeded",
      metadata: {
        count: favoriteGuildIds.length,
      },
    });

    return respond({
      ok: true,
      favoriteGuildIds,
    });
  } catch (error) {
    return respond(
      {
        ok: false,
        message: sanitizeErrorMessage(error, "Erro ao carregar favoritos."),
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const baseRequestContext = createSecurityRequestContext(request);
  const respond = (
    body: unknown,
    init?: ResponseInit,
    requestId = baseRequestContext.requestId,
  ) =>
    attachRequestId(
      applyNoStoreHeaders(NextResponse.json(body, init)),
      requestId,
    );

  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) {
      return attachRequestId(
        applyNoStoreHeaders(originGuard),
        baseRequestContext.requestId,
      );
    }

    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession) {
      return respond(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      );
    }

    const auditContext = extendSecurityRequestContext(baseRequestContext, {
      sessionId: sessionData.authSession.id,
      userId: sessionData.authSession.user.id,
    });

    const rateLimit = await enforceRequestRateLimit({
      action: "auth_guild_favorites_update",
      windowMs: 10 * 60 * 1000,
      maxAttempts: 20,
      context: auditContext,
    });

    if (!rateLimit.ok) {
      await logSecurityAuditEventSafe(auditContext, {
        action: "auth_guild_favorites_update",
        outcome: "blocked",
        metadata: {
          reason: "rate_limit",
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
      });

      const response = respond(
        { ok: false, message: "Muitas tentativas. Tente novamente em instantes." },
        { status: 429 },
      );
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }

    let body: { favoriteGuildIds?: string[] };

    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          favoriteGuildIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.discordSnowflake(), {
              maxLength: MAX_FAVORITE_GUILDS,
            }),
          ),
        },
        {
          rejectUnknown: true,
        },
      );
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) {
        throw error;
      }
      return respond(
        { ok: false, message: error.issues[0] || error.message },
        { status: 400 },
      );
    }

    const favoriteGuildIds = normalizeFavoriteGuildIds(body.favoriteGuildIds);
    const allowedGuildIds = await getAllowedGuildIdSet(sessionData);
    const filteredFavoriteGuildIds = favoriteGuildIds.filter((guildId) =>
      allowedGuildIds.has(guildId),
    );
    const supabase = getSupabaseAdminClientOrThrow();

    await logSecurityAuditEventSafe(auditContext, {
      action: "auth_guild_favorites_update",
      outcome: "started",
      metadata: {
        submittedCount: favoriteGuildIds.length,
        acceptedCount: filteredFavoriteGuildIds.length,
      },
    });

    const deleteResult = await supabase
      .from("auth_user_favorite_guilds")
      .delete()
      .eq("user_id", sessionData.authSession.user.id);

    if (deleteResult.error) {
      throw new Error(deleteResult.error.message);
    }

    if (filteredFavoriteGuildIds.length) {
      const rows = filteredFavoriteGuildIds.map((guildId, index) => ({
        user_id: sessionData.authSession.user.id,
        guild_id: guildId,
        sort_order: index,
      }));

      const insertResult = await supabase
        .from("auth_user_favorite_guilds")
        .insert(rows);

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    }

    await logSecurityAuditEventSafe(auditContext, {
      action: "auth_guild_favorites_update",
      outcome: "succeeded",
      metadata: {
        submittedCount: favoriteGuildIds.length,
        acceptedCount: filteredFavoriteGuildIds.length,
        rejectedCount: favoriteGuildIds.length - filteredFavoriteGuildIds.length,
      },
    });

    return respond({
      ok: true,
      favoriteGuildIds: filteredFavoriteGuildIds,
    });
  } catch (error) {
    return respond(
      {
        ok: false,
        message: sanitizeErrorMessage(error, "Erro ao salvar favoritos."),
      },
      { status: 500 },
    );
  }
}
