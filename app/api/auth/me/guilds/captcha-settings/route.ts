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
import { cleanupExpiredUnpaidServerSetups } from "@/lib/payments/setupCleanup";
import {
  createServerSaveDiagnosticContext,
  recordServerSaveDiagnostic,
  resolveServerSaveAccessMode,
} from "@/lib/servers/serverSaveDiagnostics";
import { invalidateDashboardSettingsCache } from "@/lib/servers/serverDashboardSettingsCache";
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
  deriveLegacyTicketPanelFields,
  normalizeCaptchaPanelLayout,
  normalizeTicketPanelLayout,
  ticketPanelLayoutHasAtMostOneFunctionButton,
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
const MAX_VERIFIED_ROLES = 10;
const MAX_BYPASS_ROLES = 10;

const OPTIONAL_DISCORD_SNOWFLAKE_TEXT = flowSecureDto.string({
  maxLength: 20,
  pattern: /^(?:\d{17,20})?$/,
  allowEmpty: true,
  disallowAngleBrackets: true,
  rejectThreatPatterns: false,
});

const CAPTCHA_SETTINGS_SELECT =
  "guild_id, enabled, panel_channel_id, logs_channel_id, verified_role_ids, bypass_role_ids, panel_layout, panel_title, panel_description, panel_button_label, panel_message_id, challenge_title, challenge_description, max_attempts, timeout_seconds, kick_on_fail, success_message, updated_at";

type CaptchaSecureSnapshot = {
  enabled: boolean;
  panelChannelId: string | null;
  logsChannelId: string | null;
  verifiedRoleIds: string[];
  bypassRoleIds: string[];
  panelLayout: TicketPanelLayout;
  panelTitle: string;
  panelDescription: string;
  panelButtonLabel: string;
  challengeTitle: string;
  challengeDescription: string;
  maxAttempts: number;
  timeoutSeconds: number;
  kickOnFail: boolean;
  successMessage: string;
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

function normalizeCaptchaSecureSnapshot(value: unknown): CaptchaSecureSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const legacyFields = deriveLegacyTicketPanelFields(
    normalizeCaptchaPanelLayout(record.panelLayout, {
      panelTitle: getTrimmedText(record.panelTitle),
      panelDescription: getTrimmedText(record.panelDescription),
      panelButtonLabel: getTrimmedText(record.panelButtonLabel),
    }),
  );

  return {
    enabled: record.enabled === true,
    panelChannelId: getTrimmedId(record.panelChannelId) || null,
    logsChannelId: getTrimmedId(record.logsChannelId) || null,
    verifiedRoleIds: normalizeRoleIds(record.verifiedRoleIds, MAX_VERIFIED_ROLES),
    bypassRoleIds: normalizeRoleIds(record.bypassRoleIds, MAX_BYPASS_ROLES),
    panelLayout: normalizeCaptchaPanelLayout(record.panelLayout, legacyFields),
    panelTitle: legacyFields.panelTitle,
    panelDescription: legacyFields.panelDescription,
    panelButtonLabel: legacyFields.panelButtonLabel,
    challengeTitle:
      getTrimmedText(record.challengeTitle) || "Verificacao de seguranca",
    challengeDescription:
      getTrimmedText(record.challengeDescription) ||
      "Selecione o codigo que aparece na imagem acima.",
    maxAttempts: Math.max(1, Math.min(10, Number(record.maxAttempts ?? 3) || 3)),
    timeoutSeconds: Math.max(
      30,
      Math.min(600, Number(record.timeoutSeconds ?? 120) || 120),
    ),
    kickOnFail: record.kickOnFail === true,
    successMessage:
      getTrimmedText(record.successMessage) ||
      "Verificacao concluida com sucesso. Bem-vindo ao servidor!",
  };
}

function buildCaptchaResponse(snapshot: CaptchaSecureSnapshot, updatedAt: string | null) {
  return {
    enabled: snapshot.enabled,
    panelChannelId: snapshot.panelChannelId,
    logsChannelId: snapshot.logsChannelId,
    verifiedRoleIds: snapshot.verifiedRoleIds,
    bypassRoleIds: snapshot.bypassRoleIds,
    panelLayout: snapshot.panelLayout,
    panelTitle: snapshot.panelTitle,
    panelDescription: snapshot.panelDescription,
    panelButtonLabel: snapshot.panelButtonLabel,
    challengeTitle: snapshot.challengeTitle,
    challengeDescription: snapshot.challengeDescription,
    maxAttempts: snapshot.maxAttempts,
    timeoutSeconds: snapshot.timeoutSeconds,
    kickOnFail: snapshot.kickOnFail,
    successMessage: snapshot.successMessage,
    updatedAt,
  };
}

function isValidTextChannelType(type?: number) {
  return type === GUILD_TEXT || type === GUILD_ANNOUNCEMENT;
}

async function ensureGuildAccess(guildId: string, requiredPermission: TeamRolePermission) {
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

    const access = await ensureGuildAccess(guildId, "server_manage_captcha_overview");
    if (!access.ok) return access.response;

    const supabase = getSupabaseAdminClientOrThrow();
    const [result, secureSnapshotResult] = await Promise.all([
      supabase
        .from("guild_captcha_settings")
        .select(CAPTCHA_SETTINGS_SELECT.replace("guild_id, ", ""))
        .eq("guild_id", guildId)
        .maybeSingle(),
      readServerSettingsVaultSnapshot<CaptchaSecureSnapshot>({
        guildId,
        moduleKey: "captcha_settings",
      }),
    ]);

    if (result.error) {
      const code = typeof result.error.code === "string" ? result.error.code : "";
      const message = String(result.error.message || "").toLowerCase();
      if (code !== "42P01" && !message.includes("guild_captcha_settings")) {
        throw new Error(result.error.message);
      }
    }

    const secureSnapshot = normalizeCaptchaSecureSnapshot(
      secureSnapshotResult?.payload,
    );
    if (secureSnapshot) {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          settings: buildCaptchaResponse(
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

    const canonicalSnapshot = normalizeCaptchaSecureSnapshot({
      enabled: result.data.enabled,
      panelChannelId: result.data.panel_channel_id,
      logsChannelId: result.data.logs_channel_id,
      verifiedRoleIds: result.data.verified_role_ids,
      bypassRoleIds: result.data.bypass_role_ids,
      panelLayout: result.data.panel_layout,
      panelTitle: result.data.panel_title,
      panelDescription: result.data.panel_description,
      panelButtonLabel: result.data.panel_button_label,
      challengeTitle: result.data.challenge_title,
      challengeDescription: result.data.challenge_description,
      maxAttempts: result.data.max_attempts,
      timeoutSeconds: result.data.timeout_seconds,
      kickOnFail: result.data.kick_on_fail,
      successMessage: result.data.success_message,
    });

    if (canonicalSnapshot && secureSnapshotResult?.recovery?.unreadable) {
      void rewriteUnreadableServerSettingsVaultSnapshot({
        guildId,
        moduleKey: "captcha_settings",
        payload: canonicalSnapshot,
        configuredByUserId: access.context.sessionData.authSession.user.id,
        recovery: secureSnapshotResult.recovery,
      });
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: canonicalSnapshot
          ? buildCaptchaResponse(canonicalSnapshot, result.data.updated_at)
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
            "Erro ao carregar configuracoes de captcha.",
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

  let diagnostic = createServerSaveDiagnosticContext("captcha_settings");

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
          verifiedRoleIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.string({ maxLength: 20 })),
          ),
          bypassRoleIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.string({ maxLength: 20 })),
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
          challengeTitle: flowSecureDto.optional(
            flowSecureDto.legacyPanelPlainText({ maxLength: 80 }),
          ),
          challengeDescription: flowSecureDto.optional(
            flowSecureDto.legacyPanelPlainText({ maxLength: 400 }),
          ),
          maxAttempts: flowSecureDto.optional(flowSecureDto.number()),
          timeoutSeconds: flowSecureDto.optional(flowSecureDto.number()),
          kickOnFail: flowSecureDto.optional(flowSecureDto.boolean()),
          successMessage: flowSecureDto.optional(
            flowSecureDto.string({ allowEmpty: true, maxLength: 400 }),
          ),
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
    const snapshot = normalizeCaptchaSecureSnapshot({
      enabled: body.enabled ?? true,
      panelChannelId: body.panelChannelId,
      logsChannelId: body.logsChannelId,
      verifiedRoleIds: body.verifiedRoleIds,
      bypassRoleIds: body.bypassRoleIds,
      panelLayout: body.panelLayout,
      panelTitle: body.panelTitle,
      panelDescription: body.panelDescription,
      panelButtonLabel: body.panelButtonLabel,
      challengeTitle: body.challengeTitle,
      challengeDescription: body.challengeDescription,
      maxAttempts: body.maxAttempts,
      timeoutSeconds: body.timeoutSeconds,
      kickOnFail: body.kickOnFail,
      successMessage: body.successMessage,
    });

    if (!snapshot || !isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Guild ID invalido." }, { status: 400 }),
      );
    }

    diagnostic = createServerSaveDiagnosticContext("captcha_settings", guildId);

    if (
      snapshot.enabled &&
      (!snapshot.panelChannelId ||
        !snapshot.verifiedRoleIds.length ||
        !ticketPanelLayoutHasRequiredParts(snapshot.panelLayout) ||
        !ticketPanelLayoutHasAtMostOneFunctionButton(snapshot.panelLayout))
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Defina canal principal, pelo menos um cargo verificado e uma mensagem valida com um botao funcional.",
          },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(guildId, "server_manage_captcha_overview");
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
            { ok: false, message: "Bot nao possui acesso aos canais deste servidor." },
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
            { ok: false, message: "Canal principal de captcha invalido." },
            { status: 400 },
          ),
        );
      }

      if (snapshot.logsChannelId) {
        const logsChannel = channelsById.get(snapshot.logsChannelId);
        if (!logsChannel || !isValidTextChannelType(logsChannel.type)) {
          return applyNoStoreHeaders(
            NextResponse.json(
              { ok: false, message: "Canal de logs de captcha invalido." },
              { status: 400 },
            ),
          );
        }
      }

      const invalidRole = snapshot.verifiedRoleIds.some(
        (roleId) => !rolesById.has(roleId),
      );
      if (invalidRole) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Um ou mais cargos verificados sao invalidos." },
            { status: 400 },
          ),
        );
      }
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const upsertResult = await supabase
      .from("guild_captcha_settings")
      .upsert(
        {
          guild_id: guildId,
          enabled: snapshot.enabled,
          panel_channel_id: snapshot.panelChannelId,
          logs_channel_id: snapshot.logsChannelId,
          verified_role_ids: snapshot.verifiedRoleIds,
          bypass_role_ids: snapshot.bypassRoleIds,
          panel_layout: snapshot.panelLayout,
          panel_title: snapshot.panelTitle,
          panel_description: snapshot.panelDescription,
          panel_button_label: snapshot.panelButtonLabel,
          challenge_title: snapshot.challengeTitle,
          challenge_description: snapshot.challengeDescription,
          max_attempts: snapshot.maxAttempts,
          timeout_seconds: snapshot.timeoutSeconds,
          kick_on_fail: snapshot.kickOnFail,
          success_message: snapshot.successMessage,
          configured_by_user_id: authUserId,
        },
        { onConflict: "guild_id" },
      )
      .select(CAPTCHA_SETTINGS_SELECT)
      .single();

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message);
    }

    const secureUpdated = await writeServerSettingsVaultSnapshotSafe({
      guildId,
      moduleKey: "captcha_settings",
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
      detail: "Configuracoes de captcha salvas com sucesso.",
    });

    void sendServerSettingsSavedEmailSafe({
      user: access.context.sessionData.authSession.user,
      guildId,
      moduleLabel: "Captcha",
      detail: snapshot.enabled ? "Modulo ativo" : "Modulo desativado",
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: buildCaptchaResponse(
          snapshot,
          secureUpdated?.updatedAt || upsertResult.data.updated_at,
        ),
      }),
    );
  } catch (error) {
    recordServerSaveDiagnostic({
      context: diagnostic,
      outcome: "failed",
      httpStatus: 500,
      detail: extractAuditErrorMessage(error, "Erro ao salvar configuracoes de captcha."),
    });
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao salvar configuracoes de captcha.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
