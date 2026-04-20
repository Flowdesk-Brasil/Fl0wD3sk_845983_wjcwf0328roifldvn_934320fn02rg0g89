import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  createUserTeamForUser,
  getUserTeamsSnapshotForUser,
} from "@/lib/teams/userTeams";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import { getManagedServersForCurrentSession } from "@/lib/servers/managedServers";

const TEAM_ICON_KEYS = [
  "aurora",
  "ember",
  "ocean",
  "amethyst",
  "forest",
  "sunset",
] as const;

function normalizeStringArray(input: unknown) {
  if (!Array.isArray(input)) return [];
  return input.filter((value): value is string => typeof value === "string");
}

export async function GET() {
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
          message: sanitizeErrorMessage(error, "Erro ao carregar equipes."),
        },
        { status: 500 },
      ),
    );
  }
}

export async function POST(request: Request) {
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

    let body: {
      name: string;
      iconKey?: (typeof TEAM_ICON_KEYS)[number];
      guildIds: string[];
      memberDiscordIds?: string[];
    };

    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          name: flowSecureDto.string({
            minLength: 3,
            maxLength: 64,
            normalizeWhitespace: true,
          }),
          iconKey: flowSecureDto.optional(flowSecureDto.enum(TEAM_ICON_KEYS)),
          guildIds: flowSecureDto.array(flowSecureDto.discordSnowflake(), {
            minLength: 1,
            maxLength: 100,
          }),
          memberDiscordIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.discordSnowflake(), {
              maxLength: 50,
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
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    const name = body.name;
    const iconKey = body.iconKey || "";
    const guildIds = normalizeStringArray(body.guildIds);
    const memberDiscordIds = normalizeStringArray(body.memberDiscordIds);
    const managedServers = await getManagedServersForCurrentSession();
    const allowedGuildIds = new Set(managedServers.map((server) => server.guildId));
    const validatedGuildIds = guildIds.filter((guildId) => allowedGuildIds.has(guildId));

    const createdTeamId = await createUserTeamForUser({
      authUserId: authSession.user.id,
      discordUserId: authSession.user.discord_user_id,
      name,
      iconKey,
      guildIds: validatedGuildIds,
      memberDiscordIds,
    });

    const payload = await getUserTeamsSnapshotForUser({
      authUserId: authSession.user.id,
      discordUserId: authSession.user.discord_user_id,
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        createdTeamId,
        ...payload,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Erro ao criar equipe."),
        },
        { status: 500 },
      ),
    );
  }
}
