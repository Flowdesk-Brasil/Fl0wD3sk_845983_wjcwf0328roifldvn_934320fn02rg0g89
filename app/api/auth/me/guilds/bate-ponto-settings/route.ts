import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  fetchGuildChannelsByBot,
  fetchGuildRolesByBot,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import {
  getEffectiveDashboardPermissions,
  type TeamRolePermission,
} from "@/lib/teams/userTeams";
import { getGuildLicenseStatusForUser } from "@/lib/payments/licenseStatus";
import {
  createServerSaveDiagnosticContext,
  recordServerSaveDiagnostic,
  resolveServerSaveAccessMode,
} from "@/lib/servers/serverSaveDiagnostics";
import { invalidateDashboardSettingsCache } from "@/lib/servers/serverDashboardSettingsCache";
import { dispatchBatePontoPanelMessage } from "@/lib/servers/dispatchBatePontoPanelMessage";
import {
  readServerSettingsVaultSnapshot,
  rewriteUnreadableServerSettingsVaultSnapshot,
  writeServerSettingsVaultSnapshotSafe,
} from "@/lib/servers/serverSettingsVault";
import {
  extractAuditErrorMessage,
  sanitizeErrorMessage,
} from "@/lib/security/errors";
import {
  createDefaultBatePontoPanelLayout,
  deriveLegacyTicketPanelFields,
  normalizeBatePontoLogLayout,
  normalizeBatePontoPanelLayout,
  ticketPanelLayoutHasAtMostOneFunctionButton,
  ticketPanelLayoutHasRenderableContent,
  ticketPanelLayoutHasRequiredParts,
  type TicketPanelLayout,
} from "@/lib/servers/ticketPanelBuilder";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { sendServerSettingsSavedEmailSafe } from "@/lib/mail/transactional";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;
const MAX_ALLOWED_ROLES = 20;
const DEFAULT_TIMEZONE = "America/Sao_Paulo";

const OPTIONAL_DISCORD_SNOWFLAKE_TEXT = flowSecureDto.string({
  maxLength: 20,
  pattern: /^(?:\d{17,20})?$/,
  allowEmpty: true,
  disallowAngleBrackets: true,
  rejectThreatPatterns: false,
});

const BATE_PONTO_SETTINGS_SELECT =
  "guild_id, enabled, panel_channel_id, logs_channel_id, panel_layout, panel_title, panel_description, panel_button_label, panel_message_id, log_layout, allowed_role_ids, hour_bank_enabled, daily_target_minutes, timezone, auto_finish_open_sessions, max_open_hours, updated_at";

type BatePontoSecureSnapshot = {
  enabled: boolean;
  panelChannelId: string | null;
  logsChannelId: string | null;
  panelLayout: TicketPanelLayout;
  panelTitle: string;
  panelDescription: string;
  panelButtonLabel: string;
  logLayout: TicketPanelLayout;
  allowedRoleIds: string[];
  hourBankEnabled: boolean;
  dailyTargetMinutes: number;
  timezone: string;
  autoFinishOpenSessions: boolean;
  maxOpenHours: number;
};

function getTrimmedId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRoleIds(value: unknown, maxItems: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => getTrimmedId(item))
        .filter(isGuildId),
    ),
  ).slice(0, maxItems);
}

function normalizeTimezone(value: unknown) {
  const timezone = getTrimmedText(value);
  if (!timezone) return DEFAULT_TIMEZONE;
  return timezone.slice(0, 64);
}

function normalizeBatePontoSecureSnapshot(
  value: unknown,
): BatePontoSecureSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const legacyFields = deriveLegacyTicketPanelFields(
    normalizeBatePontoPanelLayout(record.panelLayout, {
      panelTitle: getTrimmedText(record.panelTitle),
      panelDescription: getTrimmedText(record.panelDescription),
      panelButtonLabel: getTrimmedText(record.panelButtonLabel),
    }),
  );

  return {
    enabled: record.enabled === true,
    panelChannelId: getTrimmedId(record.panelChannelId) || null,
    logsChannelId: getTrimmedId(record.logsChannelId) || null,
    panelLayout: normalizeBatePontoPanelLayout(record.panelLayout, legacyFields),
    panelTitle: legacyFields.panelTitle,
    panelDescription: legacyFields.panelDescription,
    panelButtonLabel: legacyFields.panelButtonLabel,
    logLayout: normalizeBatePontoLogLayout(record.logLayout),
    allowedRoleIds: normalizeRoleIds(record.allowedRoleIds, MAX_ALLOWED_ROLES),
    hourBankEnabled: record.hourBankEnabled !== false,
    dailyTargetMinutes: Math.max(
      60,
      Math.min(1440, Number(record.dailyTargetMinutes ?? 480) || 480),
    ),
    timezone: normalizeTimezone(record.timezone),
    autoFinishOpenSessions: record.autoFinishOpenSessions === true,
    maxOpenHours: Math.max(
      1,
      Math.min(24, Number(record.maxOpenHours ?? 12) || 12),
    ),
  };
}

function buildBatePontoResponse(
  snapshot: BatePontoSecureSnapshot,
  updatedAt: string | null,
) {
  return {
    enabled: snapshot.enabled,
    panelChannelId: snapshot.panelChannelId,
    logsChannelId: snapshot.logsChannelId,
    panelLayout: snapshot.panelLayout,
    panelTitle: snapshot.panelTitle,
    panelDescription: snapshot.panelDescription,
    panelButtonLabel: snapshot.panelButtonLabel,
    logLayout: snapshot.logLayout,
    allowedRoleIds: snapshot.allowedRoleIds,
    hourBankEnabled: snapshot.hourBankEnabled,
    dailyTargetMinutes: snapshot.dailyTargetMinutes,
    timezone: snapshot.timezone,
    autoFinishOpenSessions: snapshot.autoFinishOpenSessions,
    maxOpenHours: snapshot.maxOpenHours,
    updatedAt,
  };
}

function isValidTextChannelType(type?: number) {
  return type === GUILD_TEXT || type === GUILD_ANNOUNCEMENT;
}

async function ensureGuildAccess(
  guildId: string,
  requiredPermission: TeamRolePermission,
) {
  const sessionData = await resolveSessionAccessToken();
  if (!sessionData?.authSession) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      ),
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

  const { permissions: dashboardPerms, isTeamServer } =
    await getEffectiveDashboardPermissions({
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
  const canManage =
    hasFullAccess || hasSpecificPerm || (!isTeamServer && accessibleGuild);

  if (!canManage) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Voce nao possui permissao para gerenciar este modulo.",
        },
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
        NextResponse.json(
          { ok: false, message: "Guild ID invalido." },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(
      guildId,
      "server_manage_bate_ponto_overview",
    );
    if (!access.ok) return access.response;

    const supabase = getSupabaseAdminClientOrThrow();
    const [result, secureSnapshotResult] = await Promise.all([
      supabase
        .from("guild_bate_ponto_settings")
        .select(BATE_PONTO_SETTINGS_SELECT.replace("guild_id, ", ""))
        .eq("guild_id", guildId)
        .maybeSingle(),
      readServerSettingsVaultSnapshot<BatePontoSecureSnapshot>({
        guildId,
        moduleKey: "bate_ponto_settings",
      }),
    ]);

    if (result.error) {
      const code = typeof result.error.code === "string" ? result.error.code : "";
      const message = String(result.error.message || "").toLowerCase();
      if (code !== "42P01" && !message.includes("guild_bate_ponto_settings")) {
        throw new Error(result.error.message);
      }
    }

    const secureSnapshot = normalizeBatePontoSecureSnapshot(
      secureSnapshotResult?.payload,
    );
    if (secureSnapshot) {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          settings: buildBatePontoResponse(
            secureSnapshot,
            secureSnapshotResult?.updatedAt || null,
          ),
        }),
      );
    }

    if (!result.data) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: true, settings: null }),
      );
    }

    const record = result.data as unknown as Record<string, unknown>;
    const canonicalSnapshot = normalizeBatePontoSecureSnapshot({
      enabled: record.enabled,
      panelChannelId: record.panel_channel_id,
      logsChannelId: record.logs_channel_id,
      panelLayout: record.panel_layout,
      panelTitle: record.panel_title,
      panelDescription: record.panel_description,
      panelButtonLabel: record.panel_button_label,
      logLayout: record.log_layout,
      allowedRoleIds: record.allowed_role_ids,
      hourBankEnabled: record.hour_bank_enabled,
      dailyTargetMinutes: record.daily_target_minutes,
      timezone: record.timezone,
      autoFinishOpenSessions: record.auto_finish_open_sessions,
      maxOpenHours: record.max_open_hours,
    });

    if (canonicalSnapshot && secureSnapshotResult?.recovery?.unreadable) {
      void rewriteUnreadableServerSettingsVaultSnapshot({
        guildId,
        moduleKey: "bate_ponto_settings",
        payload: canonicalSnapshot,
        configuredByUserId: access.context.sessionData.authSession.user.id,
        recovery: secureSnapshotResult.recovery,
      });
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: canonicalSnapshot
          ? buildBatePontoResponse(
              canonicalSnapshot,
              typeof record.updated_at === "string" ? record.updated_at : null,
            )
          : null,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao carregar configuracoes de bate ponto.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}

export async function POST(request: Request) {
  const invalidMutationResponse = ensureSameOriginJsonMutationRequest(request);
  if (invalidMutationResponse) {
    return applyNoStoreHeaders(invalidMutationResponse);
  }

  let diagnostic = createServerSaveDiagnosticContext("bate_ponto_settings");

  try {
    let body: Record<string, unknown>;
    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          guildId: flowSecureDto.discordSnowflake(),
          enabled: flowSecureDto.optional(flowSecureDto.boolean()),
          panelChannelId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          logsChannelId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          panelLayout: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.record()),
          ),
          panelTitle: flowSecureDto.optional(
            flowSecureDto.legacyPanelPlainText({ maxLength: 80 }),
          ),
          panelDescription: flowSecureDto.optional(
            flowSecureDto.legacyPanelPlainText({ maxLength: 400 }),
          ),
          panelButtonLabel: flowSecureDto.optional(
            flowSecureDto.legacyPanelPlainText({ maxLength: 40 }),
          ),
          logLayout: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.record()),
          ),
          allowedRoleIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.string({ maxLength: 20 })),
          ),
          hourBankEnabled: flowSecureDto.optional(flowSecureDto.boolean()),
          dailyTargetMinutes: flowSecureDto.optional(flowSecureDto.number()),
          timezone: flowSecureDto.optional(
            flowSecureDto.string({ allowEmpty: true, maxLength: 64 }),
          ),
          autoFinishOpenSessions: flowSecureDto.optional(flowSecureDto.boolean()),
          maxOpenHours: flowSecureDto.optional(flowSecureDto.number()),
        },
        { rejectUnknown: true },
      ) as Record<string, unknown>;
    } catch (error) {
      if (!(error instanceof FlowSecureDtoError)) throw error;
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: error.issues[0] || error.message },
          { status: 400 },
        ),
      );
    }

    const guildId = String(body.guildId || "");
    const snapshot = normalizeBatePontoSecureSnapshot({
      enabled: body.enabled ?? true,
      panelChannelId: body.panelChannelId,
      logsChannelId: body.logsChannelId,
      panelLayout: body.panelLayout,
      panelTitle: body.panelTitle,
      panelDescription: body.panelDescription,
      panelButtonLabel: body.panelButtonLabel,
      logLayout: body.logLayout,
      allowedRoleIds: body.allowedRoleIds,
      hourBankEnabled: body.hourBankEnabled,
      dailyTargetMinutes: body.dailyTargetMinutes,
      timezone: body.timezone,
      autoFinishOpenSessions: body.autoFinishOpenSessions,
      maxOpenHours: body.maxOpenHours,
    });

    if (!snapshot || !isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID invalido." },
          { status: 400 },
        ),
      );
    }

    diagnostic = createServerSaveDiagnosticContext("bate_ponto_settings", guildId);

    if (
      snapshot.enabled &&
      (!snapshot.panelChannelId ||
        !ticketPanelLayoutHasRenderableContent(snapshot.logLayout))
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Defina o canal do painel e um template de log valido antes de salvar.",
          },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(
      guildId,
      "server_manage_bate_ponto_overview",
    );
    if (!access.ok) return access.response;

    const authUserId = access.context.sessionData.authSession.user.id;
    const accessMode = resolveServerSaveAccessMode({
      accessibleGuild: access.context.accessibleGuild,
      hasTeamAccess: access.context.hasTeamAccess,
    });

    let licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId);
    if (licenseStatus !== "paid") {
      licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId, {
        forceFresh: true,
      });
    }

    if (licenseStatus === "expired" || licenseStatus === "off") {
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

    if (snapshot.enabled) {
      const [rawChannels, rawRoles] = await Promise.all([
        fetchGuildChannelsByBot(guildId),
        fetchGuildRolesByBot(guildId),
      ]);

      if (!rawChannels) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              ok: false,
              message: "Bot nao possui acesso aos canais deste servidor.",
            },
            { status: 403 },
          ),
        );
      }

      const channelsById = new Map(rawChannels.map((channel) => [channel.id, channel]));
      const rolesById = new Map((rawRoles || []).map((role) => [role.id, role]));
      const panelChannel = snapshot.panelChannelId
        ? channelsById.get(snapshot.panelChannelId)
        : null;

      if (!panelChannel || !isValidTextChannelType(panelChannel.type)) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Canal do painel de bate ponto invalido." },
            { status: 400 },
          ),
        );
      }

      if (snapshot.logsChannelId) {
        const logsChannel = channelsById.get(snapshot.logsChannelId);
        if (!logsChannel || !isValidTextChannelType(logsChannel.type)) {
          return applyNoStoreHeaders(
            NextResponse.json(
              { ok: false, message: "Canal de logs de bate ponto invalido." },
              { status: 400 },
            ),
          );
        }
      }

      const invalidRole = snapshot.allowedRoleIds.some(
        (roleId) => !rolesById.has(roleId),
      );
      if (invalidRole) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Um ou mais cargos permitidos sao invalidos." },
            { status: 400 },
          ),
        );
      }
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const upsertResult = await supabase
      .from("guild_bate_ponto_settings")
      .upsert(
        {
          guild_id: guildId,
          enabled: snapshot.enabled,
          panel_channel_id: snapshot.panelChannelId,
          logs_channel_id: snapshot.logsChannelId,
          panel_layout: snapshot.panelLayout,
          panel_title: snapshot.panelTitle,
          panel_description: snapshot.panelDescription,
          panel_button_label: snapshot.panelButtonLabel,
          log_layout: snapshot.logLayout,
          allowed_role_ids: snapshot.allowedRoleIds,
          hour_bank_enabled: snapshot.hourBankEnabled,
          daily_target_minutes: snapshot.dailyTargetMinutes,
          timezone: snapshot.timezone,
          auto_finish_open_sessions: snapshot.autoFinishOpenSessions,
          max_open_hours: snapshot.maxOpenHours,
          configured_by_user_id: authUserId,
        },
        { onConflict: "guild_id" },
      )
      .select(BATE_PONTO_SETTINGS_SELECT)
      .single();

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message);
    }

    const secureUpdated = await writeServerSettingsVaultSnapshotSafe({
      guildId,
      moduleKey: "bate_ponto_settings",
      configuredByUserId: authUserId,
      payload: snapshot,
    });
    invalidateDashboardSettingsCache({ guildId });

    recordServerSaveDiagnostic({
      context: diagnostic,
      authUserId,
      accessMode,
      licenseStatus,
      outcome: "saved",
      httpStatus: 200,
      detail: "Configuracoes de bate ponto salvas com sucesso.",
    });

    void sendServerSettingsSavedEmailSafe({
      user: access.context.sessionData.authSession.user,
      guildId,
      moduleLabel: "Bate Ponto",
      detail: snapshot.enabled ? "Modulo ativo" : "Modulo desativado",
    });

    let panelDispatch:
      | Awaited<ReturnType<typeof dispatchBatePontoPanelMessage>>
      | null = null;

    if (snapshot.enabled && snapshot.panelChannelId) {
      const panelLayoutForDispatch =
        ticketPanelLayoutHasRequiredParts(snapshot.panelLayout) &&
        ticketPanelLayoutHasAtMostOneFunctionButton(snapshot.panelLayout)
          ? snapshot.panelLayout
          : createDefaultBatePontoPanelLayout({
              panelTitle: snapshot.panelTitle,
              panelDescription: snapshot.panelDescription,
              panelButtonLabel: snapshot.panelButtonLabel,
            });

      try {
        panelDispatch = await dispatchBatePontoPanelMessage({
          guildId,
          panelChannelId: snapshot.panelChannelId,
          panelLayout: panelLayoutForDispatch,
        });
      } catch (error) {
        panelDispatch = {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao enviar o embed de bate ponto.",
          ),
        };
      }
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: buildBatePontoResponse(
          snapshot,
          secureUpdated?.updatedAt || upsertResult.data.updated_at,
        ),
        panelDispatch,
      }),
    );
  } catch (error) {
    recordServerSaveDiagnostic({
      context: diagnostic,
      outcome: "failed",
      httpStatus: 500,
      detail: extractAuditErrorMessage(
        error,
        "Erro ao salvar configuracoes de bate ponto.",
      ),
    });
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao salvar configuracoes de bate ponto.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
