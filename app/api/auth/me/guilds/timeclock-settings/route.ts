import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  fetchGuildChannelsByBot,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import {
  getEffectiveDashboardPermissions,
  type TeamRolePermission,
} from "@/lib/teams/userTeams";
import { getGuildLicenseStatusForUser } from "@/lib/payments/licenseStatus";
import { cleanupExpiredUnpaidServerSetups } from "@/lib/payments/setupCleanup";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import {
  extractAuditErrorMessage,
  sanitizeErrorMessage,
} from "@/lib/security/errors";
import {
  createServerSaveDiagnosticContext,
  recordServerSaveDiagnostic,
  resolveServerSaveAccessMode,
} from "@/lib/servers/serverSaveDiagnostics";
import { invalidateDashboardSettingsCache } from "@/lib/servers/serverDashboardSettingsCache";
import {
  getTimeclockSettings,
  saveTimeclockSettings,
  type TimeclockSettings,
} from "@/lib/timeclock/service";
import { normalizeScheduleDay } from "@/lib/timeclock/core";

const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;

const OPTIONAL_DISCORD_SNOWFLAKE_TEXT = flowSecureDto.string({
  maxLength: 20,
  pattern: /^(?:\d{17,20})?$/,
  allowEmpty: true,
  disallowAngleBrackets: true,
  rejectThreatPatterns: false,
});

const DISCORD_SNOWFLAKE_LIST = flowSecureDto.array(
  flowSecureDto.string({
    maxLength: 20,
    pattern: /^\d{17,20}$/,
    disallowAngleBrackets: true,
    rejectThreatPatterns: false,
  }),
);

function resolveOptionalId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isValidTextChannelType(type?: number) {
  return type === GUILD_TEXT || type === GUILD_ANNOUNCEMENT;
}

async function ensureGuildAccess(guildId: string, requiredPermission: TeamRolePermission) {
  const sessionData = await resolveSessionAccessToken();
  if (!sessionData?.authSession) {
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
    };
  }

  if (!sessionData.accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Token OAuth ausente na sessao." },
        { status: 401 },
      ),
    };
  }

  const { permissions: dashboardPerms, isTeamServer } = await getEffectiveDashboardPermissions({
    authUserId: sessionData.authSession.user.id,
    guildId,
  });

  const accessibleGuild = await assertUserAdminInGuildOrNull(
    {
      authSession: sessionData.authSession,
      accessToken: sessionData.accessToken,
    },
    guildId,
  );

  const hasFullAccess = dashboardPerms === "full";
  const hasSpecificPerm =
    dashboardPerms instanceof Set && dashboardPerms.has(requiredPermission);
  const canManage = hasFullAccess || hasSpecificPerm || (!isTeamServer && accessibleGuild);

  if (!canManage) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Voce nao possui permissao para gerenciar este modulo." },
        { status: 403 },
      ),
    };
  }

  return {
    ok: true as const,
    context: {
      sessionData,
      accessibleGuild,
      hasTeamAccess: isTeamServer,
    },
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const guildId = (url.searchParams.get("guildId") || "").trim();
    if (!isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Guild ID invalido." }, { status: 400 }),
      );
    }

    const access = await ensureGuildAccess(guildId, "server_manage_tickets_overview");
    if (!access.ok) return applyNoStoreHeaders(access.response);

    await cleanupExpiredUnpaidServerSetups({
      userId: access.context.sessionData.authSession.user.id,
      guildId,
      source: "guild_timeclock_settings_get",
    });

    const settings = await getTimeclockSettings(guildId);
    return applyNoStoreHeaders(NextResponse.json({ ok: true, settings }));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Erro ao carregar Bate Ponto."),
        },
        { status: 500 },
      ),
    );
  }
}

export async function POST(request: Request) {
  const invalidMutationResponse = ensureSameOriginJsonMutationRequest(request);
  if (invalidMutationResponse) return applyNoStoreHeaders(invalidMutationResponse);

  let diagnostic = createServerSaveDiagnosticContext("timeclock_settings");

  try {
    let body: { guildId: string } & Record<string, unknown>;
    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          guildId: flowSecureDto.discordSnowflake(),
          enabled: flowSecureDto.optional(flowSecureDto.boolean()),
          mainChannelId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          logChannelId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          // Read-only fields returned by GET. Accept them from cached clients and ignore on save.
          panelMessageId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          timezone: flowSecureDto.optional(
            flowSecureDto.string({
              maxLength: 80,
              pattern: /^[A-Za-z0-9_+\-/]+$/,
              disallowAngleBrackets: true,
            }),
          ),
          panelLayout: flowSecureDto.optional(flowSecureDto.array(flowSecureDto.record())),
          employeeRoleIds: flowSecureDto.optional(DISCORD_SNOWFLAKE_LIST),
          viewHistoryRoleIds: flowSecureDto.optional(DISCORD_SNOWFLAKE_LIST),
          editTimeclockRoleIds: flowSecureDto.optional(DISCORD_SNOWFLAKE_LIST),
          approveHoursRoleIds: flowSecureDto.optional(DISCORD_SNOWFLAKE_LIST),
          adminRoleIds: flowSecureDto.optional(DISCORD_SNOWFLAKE_LIST),
          hourBankEnabled: flowSecureDto.optional(flowSecureDto.boolean()),
          overtimeApprovalEnabled: flowSecureDto.optional(flowSecureDto.boolean()),
          rankingPublic: flowSecureDto.optional(flowSecureDto.boolean()),
          alertsEnabled: flowSecureDto.optional(flowSecureDto.boolean()),
          earlyStartPolicy: flowSecureDto.optional(
            flowSecureDto.enum(["count", "ignore", "approval", "limit"] as const),
          ),
          lateFinishPolicy: flowSecureDto.optional(
            flowSecureDto.enum(["count", "ignore", "approval", "limit"] as const),
          ),
          updatedAt: flowSecureDto.optional(
            flowSecureDto.nullable(
              flowSecureDto.string({
                maxLength: 80,
                pattern: /^[0-9T:Z.+-]+$/,
                disallowAngleBrackets: true,
              }),
            ),
          ),
          maxSessionSeconds: flowSecureDto.optional(
            flowSecureDto.number({ integer: true, min: 3600, max: 172800 }),
          ),
          scheduleDays: flowSecureDto.optional(flowSecureDto.array(flowSecureDto.record())),
        },
        { rejectUnknown: true },
      );
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) throw error;
      recordServerSaveDiagnostic({
        context: diagnostic,
        outcome: "payload_invalid",
        httpStatus: 400,
        detail: error.issues[0] || error.message,
      });
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    const guildId = body.guildId;
    diagnostic = createServerSaveDiagnosticContext("timeclock_settings", guildId);

    const access = await ensureGuildAccess(guildId, "server_manage_tickets_overview");
    if (!access.ok) return applyNoStoreHeaders(access.response);

    const authUserId = access.context.sessionData.authSession.user.id;
    const accessMode = resolveServerSaveAccessMode({
      accessibleGuild: access.context.accessibleGuild,
      hasTeamAccess: access.context.hasTeamAccess,
    });

    let licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId);
    if (licenseStatus !== "paid") {
      licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId, { forceFresh: true });
    }

    if (licenseStatus === "expired" || licenseStatus === "off") {
      recordServerSaveDiagnostic({
        context: diagnostic,
        authUserId,
        accessMode,
        licenseStatus,
        outcome: "license_blocked",
        httpStatus: 403,
        detail: "Servidor com plano expirado ou desligado para editar Bate Ponto.",
      });
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Servidor com plano expirado/desligado. Renove o pagamento para editar configuracoes.",
          },
          { status: 403 },
        ),
      );
    }

    const enabled = body.enabled === true;
    const mainChannelId = resolveOptionalId(body.mainChannelId);
    const logChannelId = resolveOptionalId(body.logChannelId);

    if (enabled) {
      const rawChannels = await fetchGuildChannelsByBot(guildId);
      if (!rawChannels) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Bot nao possui acesso aos canais deste servidor." },
            { status: 403 },
          ),
        );
      }
      const channelsById = new Map(rawChannels.map((channel) => [channel.id, channel]));
      const mainChannel = mainChannelId ? channelsById.get(mainChannelId) : null;
      const logChannel = logChannelId ? channelsById.get(logChannelId) : null;
      if (!mainChannel || !isValidTextChannelType(mainChannel.type)) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Escolha um canal principal valido para o Bate Ponto." },
            { status: 400 },
          ),
        );
      }
      if (logChannelId && (!logChannel || !isValidTextChannelType(logChannel.type))) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Canal de logs do Bate Ponto invalido." },
            { status: 400 },
          ),
        );
      }
    }

    const scheduleDays = Array.isArray(body.scheduleDays)
      ? body.scheduleDays.map((day) => normalizeScheduleDay(day as Partial<TimeclockSettings["scheduleDays"][number]> & { weekday: number }))
      : undefined;

    const settings = await saveTimeclockSettings({
      guildId,
      configuredByUserId: authUserId,
      settings: {
        enabled,
        mainChannelId,
        logChannelId,
        timezone: typeof body.timezone === "string" ? body.timezone : undefined,
        panelLayout: Array.isArray(body.panelLayout) ? body.panelLayout : undefined,
        employeeRoleIds: Array.isArray(body.employeeRoleIds) ? body.employeeRoleIds as string[] : undefined,
        viewHistoryRoleIds: Array.isArray(body.viewHistoryRoleIds) ? body.viewHistoryRoleIds as string[] : undefined,
        editTimeclockRoleIds: Array.isArray(body.editTimeclockRoleIds) ? body.editTimeclockRoleIds as string[] : undefined,
        approveHoursRoleIds: Array.isArray(body.approveHoursRoleIds) ? body.approveHoursRoleIds as string[] : undefined,
        adminRoleIds: Array.isArray(body.adminRoleIds) ? body.adminRoleIds as string[] : undefined,
        hourBankEnabled: typeof body.hourBankEnabled === "boolean" ? body.hourBankEnabled : undefined,
        overtimeApprovalEnabled:
          typeof body.overtimeApprovalEnabled === "boolean" ? body.overtimeApprovalEnabled : undefined,
        rankingPublic: typeof body.rankingPublic === "boolean" ? body.rankingPublic : undefined,
        alertsEnabled: typeof body.alertsEnabled === "boolean" ? body.alertsEnabled : undefined,
        earlyStartPolicy:
          typeof body.earlyStartPolicy === "string" ? body.earlyStartPolicy as TimeclockSettings["earlyStartPolicy"] : undefined,
        lateFinishPolicy:
          typeof body.lateFinishPolicy === "string" ? body.lateFinishPolicy as TimeclockSettings["lateFinishPolicy"] : undefined,
        maxSessionSeconds:
          typeof body.maxSessionSeconds === "number" ? body.maxSessionSeconds : undefined,
        scheduleDays,
      },
    });

    invalidateDashboardSettingsCache({ guildId });
    recordServerSaveDiagnostic({
      context: diagnostic,
      authUserId,
      accessMode,
      licenseStatus,
      outcome: "saved",
      httpStatus: 200,
      detail: "Configuracoes do Bate Ponto salvas.",
    });

    return applyNoStoreHeaders(NextResponse.json({ ok: true, settings }));
  } catch (error) {
    recordServerSaveDiagnostic({
      context: diagnostic,
      outcome: "failed",
      httpStatus: 500,
      detail: extractAuditErrorMessage(error, "Erro ao salvar Bate Ponto."),
    });
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Erro ao salvar Bate Ponto."),
        },
        { status: 500 },
      ),
    );
  }
}
