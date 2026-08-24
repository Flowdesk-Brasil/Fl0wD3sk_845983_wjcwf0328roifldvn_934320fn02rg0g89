import { NextResponse } from "next/server";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { hasSecureInternalTokenAuth } from "@/lib/security/internalTokens";
import {
  extractAuditErrorMessage,
  sanitizePublicErrorMessage,
} from "@/lib/security/errors";
import {
  applyTimeclockAction,
  getTimeclockDashboard,
  getTimeclockStatus,
} from "@/lib/timeclock/service";
import {
  buildTimeclockStatusDiscordPayload,
  buildTimeclockTextDiscordPayload,
} from "@/lib/timeclock/discordMessages";
import { formatDuration, formatSignedDuration } from "@/lib/timeclock/core";

const INTERNAL_TIMECLOCK_ACTIONS = [
  "status",
  "start",
  "pause",
  "resume",
  "finish",
  "history",
  "ranking",
] as const;

function resolveInternalToken() {
  return (
    process.env.TIMECLOCK_INTERNAL_API_TOKEN ||
    process.env.SALES_INTERNAL_API_TOKEN ||
    process.env.FLOWAI_INTERNAL_API_TOKEN ||
    process.env.CRON_SECRET ||
    ""
  ).trim();
}

function isAuthorized(request: Request) {
  return hasSecureInternalTokenAuth({
    request,
    expectedTokens: [resolveInternalToken()],
    headerNames: [
      "x-flowdesk-internal-token",
      "x-timeclock-internal-token",
      "x-sales-internal-token",
    ],
    allowDevWithoutToken: true,
  });
}

function buildHistoryContent(payload: Awaited<ReturnType<typeof getTimeclockDashboard>>, userId: string) {
  const items = payload.history.items
    .filter((item) => item.userId === userId)
    .slice(0, 8);
  if (!items.length) {
    return "## Historico de ponto\nNenhuma jornada encontrada para seu usuario nesse periodo.";
  }
  return [
    "## Historico de ponto",
    ...items.map((item) => [
      `**${item.workday}** - ${item.status}`,
      `Trabalhado: ${formatDuration(item.totalWorkedSeconds)} | Pausado: ${formatDuration(item.totalPausedSeconds)} | Banco: ${formatSignedDuration(item.balanceSeconds)}`,
    ].join("\n")),
  ].join("\n\n");
}

function buildRankingContent(payload: Awaited<ReturnType<typeof getTimeclockDashboard>>) {
  if (!payload.ranking.length) {
    return "## Ranking do ponto\nAinda nao existem jornadas finalizadas neste periodo.";
  }
  return [
    "## Ranking do ponto",
    ...payload.ranking.slice(0, 10).map((item) =>
      `**${item.position}o ${item.user.displayName}** - ${formatDuration(item.totalWorkedSeconds)} | ${item.sessionCount} jornadas | banco ${formatSignedDuration(item.bankSeconds)}`,
    ),
  ].join("\n");
}

function resolveTimeclockInternalError(error: unknown) {
  const message = sanitizePublicErrorMessage(error, "Erro ao processar Bate Ponto.");
  const lowered = message.toLowerCase();
  const status =
    lowered.includes("desativado") ||
    lowered.includes("sem schema") ||
    lowered.includes("migration") ||
    lowered.includes("cargo autorizado") ||
    lowered.includes("nao existe jornada") ||
    lowered.includes("intervalo aberto")
      ? 409
      : 500;

  return { message, status };
}

export async function POST(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!isAuthorized(request)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autorizado." }, { status: 401 }),
      );
    }

    const rawPayload = await request.json().catch(() => ({}));
    let payload: {
      action: (typeof INTERNAL_TIMECLOCK_ACTIONS)[number];
      guildId: string;
      userId: string;
      actorId?: string;
      source?: "discord_button" | "discord_command";
      interactionId?: string;
      memberRoleIds?: string[];
    };
    try {
      payload = parseFlowSecureDto(
        rawPayload,
        {
          action: flowSecureDto.enum(INTERNAL_TIMECLOCK_ACTIONS),
          guildId: flowSecureDto.discordSnowflake(),
          userId: flowSecureDto.discordSnowflake(),
          actorId: flowSecureDto.optional(flowSecureDto.discordSnowflake()),
          source: flowSecureDto.optional(
            flowSecureDto.enum(["discord_button", "discord_command"] as const),
          ),
          interactionId: flowSecureDto.optional(
            flowSecureDto.string({
              maxLength: 120,
              pattern: /^[A-Za-z0-9:_-]+$/,
              disallowAngleBrackets: true,
            }),
          ),
          memberRoleIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.discordSnowflake()),
          ),
        },
        { rejectUnknown: true },
      );
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) throw error;
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    const source = payload.source || "discord_command";
    const memberRoleIds = payload.memberRoleIds || [];

    if (payload.action === "status") {
      const result = await getTimeclockStatus({
        guildId: payload.guildId,
        userId: payload.userId,
        actorId: payload.actorId || payload.userId,
        memberRoleIds,
        source,
        interactionId: payload.interactionId || null,
      });
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          result,
          discordPayload: buildTimeclockStatusDiscordPayload(result),
        }),
      );
    }

    if (payload.action === "history") {
      const dashboard = await getTimeclockDashboard({
        guildId: payload.guildId,
        range: "30d",
        userId: payload.userId,
        pageSize: 50,
      });
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          discordPayload: buildTimeclockTextDiscordPayload(
            buildHistoryContent(dashboard, payload.userId),
          ),
        }),
      );
    }

    if (payload.action === "ranking") {
      const dashboard = await getTimeclockDashboard({
        guildId: payload.guildId,
        range: "30d",
        pageSize: 25,
      });
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          discordPayload: buildTimeclockTextDiscordPayload(buildRankingContent(dashboard)),
        }),
      );
    }

    let action = payload.action.toUpperCase() as "START" | "PAUSE" | "RESUME" | "FINISH";
    if (payload.action === "start") {
      const current = await getTimeclockStatus({
        guildId: payload.guildId,
        userId: payload.userId,
        actorId: payload.actorId || payload.userId,
        memberRoleIds,
        source,
      });
      action = current.status === "PAUSED" ? "RESUME" : "START";
    }

    const result = await applyTimeclockAction({
      guildId: payload.guildId,
      userId: payload.userId,
      actorId: payload.actorId || payload.userId,
      memberRoleIds,
      source,
      action,
      interactionId: payload.interactionId || null,
      idempotencyKey: payload.interactionId
        ? `discord:${payload.guildId}:${payload.interactionId}:${payload.action}`
        : null,
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        result,
        discordPayload: buildTimeclockStatusDiscordPayload(result, {
          notice: result.idempotent ? "Acao ja processada anteriormente." : "Ponto atualizado.",
        }),
      }),
    );
  } catch (error) {
    const resolvedError = resolveTimeclockInternalError(error);
    console.error("[timeclock-internal] falha ao processar acao do Discord:", {
      requestId,
      message: extractAuditErrorMessage(error, "unknown_timeclock_error"),
    });
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          requestId,
          message: resolvedError.message,
          discordPayload: buildTimeclockTextDiscordPayload(
            resolvedError.message,
          ),
        },
        { status: resolvedError.status },
      ),
    );
  }
}
