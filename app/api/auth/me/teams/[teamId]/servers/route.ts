import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { getManagedServersForCurrentSession } from "@/lib/servers/managedServers";
import {
  assertTeamPermission,
  getUserTeamsSnapshotForUser,
  invalidateTeamAccessCachesForTeam,
} from "@/lib/teams/userTeams";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type TeamRouteParams = {
  params: Promise<{
    teamId: string;
  }>;
};

function normalizeTeamId(value: string) {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function PATCH(request: Request, { params }: TeamRouteParams) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) {
    return applyNoStoreHeaders(originGuard);
  }

  try {
    const authSession = await getCurrentAuthSessionFromCookie();
    if (!authSession) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Nao autenticado." },
          { status: 401 },
        ),
      );
    }

    const routeParams = await params;
    const teamId = normalizeTeamId(routeParams.teamId);
    if (!teamId) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Equipe invalida." },
          { status: 400 },
        ),
      );
    }

    let body: { guildIds: string[] };
    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          guildIds: flowSecureDto.array(flowSecureDto.discordSnowflake(), {
            minLength: 1,
            maxLength: 100,
          }),
        },
        {
          rejectUnknown: true,
        },
      );
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) {
        throw error;
      }

      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    await assertTeamPermission(teamId, authSession.user.id, "manage_servers");
    const supabase = getSupabaseAdminClientOrThrow();

    const currentServersResult = await supabase
      .from("auth_user_team_servers")
      .select("guild_id")
      .eq("team_id", teamId)
      .returns<Array<{ guild_id: string }>>();

    if (currentServersResult.error) {
      throw new Error(currentServersResult.error.message);
    }

    const currentGuildIds = Array.from(
      new Set(
        (currentServersResult.data || [])
          .map((row) => row.guild_id)
          .filter((guildId): guildId is string => typeof guildId === "string"),
      ),
    );
    const currentGuildIdSet = new Set(currentGuildIds);

    const managedServers = await getManagedServersForCurrentSession();
    const allowedGuildIds = new Set(
      managedServers
        .filter(
          (server) =>
            currentGuildIdSet.has(server.guildId) || server.canLinkToTeam,
        )
        .map((server) => server.guildId),
    );
    const requestedGuildIds = Array.from(new Set(body.guildIds));
    const invalidGuildIds = requestedGuildIds.filter(
      (guildId) => !allowedGuildIds.has(guildId),
    );

    if (invalidGuildIds.length) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Um ou mais servidores selecionados nao podem ser vinculados a esta equipe agora.",
            invalidGuildIds,
          },
          { status: 409 },
        ),
      );
    }

    const conflictResult = await supabase
      .from("auth_user_team_servers")
      .select("guild_id")
      .in("guild_id", requestedGuildIds)
      .neq("team_id", teamId)
      .returns<Array<{ guild_id: string }>>();

    if (conflictResult.error) {
      throw new Error(conflictResult.error.message);
    }

    const conflictingGuildIds = Array.from(
      new Set((conflictResult.data || []).map((row) => row.guild_id)),
    );

    if (conflictingGuildIds.length) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Um ou mais servidores escolhidos ja estao vinculados a outra equipe.",
            conflictingGuildIds,
          },
          { status: 409 },
        ),
      );
    }

    const requestedGuildIdSet = new Set(requestedGuildIds);
    const guildIdsToRemove = currentGuildIds.filter(
      (guildId) => !requestedGuildIdSet.has(guildId),
    );
    const guildIdsToInsert = requestedGuildIds.filter(
      (guildId) => !currentGuildIdSet.has(guildId),
    );

    if (guildIdsToRemove.length) {
      const deleteResult = await supabase
        .from("auth_user_team_servers")
        .delete()
        .eq("team_id", teamId)
        .in("guild_id", guildIdsToRemove);

      if (deleteResult.error) {
        throw new Error(deleteResult.error.message);
      }
    }

    if (guildIdsToInsert.length) {
      const insertResult = await supabase.from("auth_user_team_servers").insert(
        guildIdsToInsert.map((guildId) => ({
          team_id: teamId,
          guild_id: guildId,
        })),
      );

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    }

    await invalidateTeamAccessCachesForTeam(teamId);
    const payload = await getUserTeamsSnapshotForUser({
      authUserId: authSession.user.id,
      discordUserId: authSession.user.discord_user_id,
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        ...payload,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao atualizar servidores da equipe.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
