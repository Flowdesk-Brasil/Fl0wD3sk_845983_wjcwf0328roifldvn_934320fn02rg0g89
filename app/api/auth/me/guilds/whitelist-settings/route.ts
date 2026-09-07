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
import {
  createServerSaveDiagnosticContext,
  recordServerSaveDiagnostic,
  resolveServerSaveAccessMode,
} from "@/lib/servers/serverSaveDiagnostics";
import { invalidateDashboardSettingsCache } from "@/lib/servers/serverDashboardSettingsCache";
import { writeServerSettingsVaultSnapshotSafe } from "@/lib/servers/serverSettingsVault";
import {
  extractAuditErrorMessage,
  sanitizeErrorMessage,
} from "@/lib/security/errors";
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
import { normalizeWhitelistSettingsDraft } from "@/lib/servers/whitelistSettingsModel";
import { whitelistPanelHasRequiredParts } from "@/lib/servers/whitelistPanelBuilder";
import { encryptWhitelistSecret } from "@/lib/servers/whitelistSecret";
import { normalizeWhitelistMapping } from "@/lib/servers/whitelistMapping";
import { deriveLegacyTicketPanelFields } from "@/lib/servers/ticketPanelBuilder";

const OPTIONAL_SNOWFLAKE = flowSecureDto.string({
  maxLength: 20,
  pattern: /^(?:\d{17,20})?$/,
  allowEmpty: true,
  disallowAngleBrackets: true,
  rejectThreatPatterns: false,
});

function isMissingApprovalModeColumn(error: { message?: string; code?: string } | null) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "");
  return code === "42703" || message.includes("approval_mode");
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
  const { permissions: dashboardPerms, isTeamServer } =
    await getEffectiveDashboardPermissions({
      authUserId: sessionData.authSession.user.id,
      guildId,
    });
  const accessibleGuild = await assertUserAdminInGuildOrNull(
    { authSession: sessionData.authSession, accessToken: sessionData.accessToken },
    guildId,
  );
  const hasFullAccess = dashboardPerms === "full";
  const hasSpecificPerm =
    dashboardPerms instanceof Set &&
    (
      dashboardPerms.has("server_manage_whitelist_overview") ||
      dashboardPerms.has("server_manage_whitelist_database") ||
      dashboardPerms.has("server_manage_whitelist_message") ||
      dashboardPerms.has(requiredPermission)
    );
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
    context: { sessionData, accessibleGuild, hasTeamAccess: isTeamServer },
  };
}

export async function POST(request: Request) {
  const invalidMutationResponse = ensureSameOriginJsonMutationRequest(request);
  if (invalidMutationResponse) return applyNoStoreHeaders(invalidMutationResponse);

  let diagnostic = createServerSaveDiagnosticContext("whitelist_settings");

  try {
    let body: Record<string, unknown>;
    try {
      body = parseFlowSecureDto(await request.json().catch(() => ({})), {
        guildId: flowSecureDto.discordSnowflake(),
        enabled: flowSecureDto.optional(flowSecureDto.boolean()),
        panelChannelId: flowSecureDto.optional(flowSecureDto.nullable(OPTIONAL_SNOWFLAKE)),
        reviewChannelId: flowSecureDto.optional(flowSecureDto.nullable(OPTIONAL_SNOWFLAKE)),
        logsChannelId: flowSecureDto.optional(flowSecureDto.nullable(OPTIONAL_SNOWFLAKE)),
        approvedRoleIds: flowSecureDto.optional(flowSecureDto.array(flowSecureDto.string({ maxLength: 20 }))),
        deniedRoleIds: flowSecureDto.optional(flowSecureDto.array(flowSecureDto.string({ maxLength: 20 }))),
        reviewRoleIds: flowSecureDto.optional(flowSecureDto.array(flowSecureDto.string({ maxLength: 20 }))),
        identifierKind: flowSecureDto.optional(flowSecureDto.string({ maxLength: 32 })),
        identifierLabel: flowSecureDto.optional(flowSecureDto.string({ maxLength: 45, allowEmpty: true })),
        identifierPlaceholder: flowSecureDto.optional(flowSecureDto.string({ maxLength: 80, allowEmpty: true })),
        approvalMode: flowSecureDto.optional(flowSecureDto.string({ maxLength: 16 })),
        connectionMode: flowSecureDto.optional(flowSecureDto.string({ maxLength: 16 })),
        dbEngine: flowSecureDto.optional(flowSecureDto.string({ maxLength: 16 })),
        dbHost: flowSecureDto.optional(flowSecureDto.string({ maxLength: 255, allowEmpty: true })),
        dbPort: flowSecureDto.optional(flowSecureDto.number()),
        dbName: flowSecureDto.optional(flowSecureDto.string({ maxLength: 128, allowEmpty: true })),
        dbUser: flowSecureDto.optional(flowSecureDto.string({ maxLength: 128, allowEmpty: true })),
        dbSsl: flowSecureDto.optional(flowSecureDto.boolean()),
        dbPassword: flowSecureDto.optional(flowSecureDto.string({ maxLength: 255, allowEmpty: true })),
        mapping: flowSecureDto.optional(flowSecureDto.record()),
        mappingStatus: flowSecureDto.optional(flowSecureDto.string({ maxLength: 16 })),
        panelLayout: flowSecureDto.optional(flowSecureDto.array(flowSecureDto.record())),
      }) as Record<string, unknown>;
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

    const guildId = String(body.guildId || "");
    if (!isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Guild ID invalido." }, { status: 400 }),
      );
    }

    const access = await ensureGuildAccess(guildId, "server_manage_whitelist_overview");
    if (!access.ok) return access.response;

    diagnostic = createServerSaveDiagnosticContext("whitelist_settings", guildId);
    const draft = normalizeWhitelistSettingsDraft(body);
    const legacy = deriveLegacyTicketPanelFields(draft.panelLayout);

    if (draft.enabled && !whitelistPanelHasRequiredParts(draft.panelLayout)) {
      recordServerSaveDiagnostic({
        context: diagnostic,
        outcome: "validation_failed",
        httpStatus: 400,
        detail: "A mensagem da whitelist precisa de conteudo e do botao Solicitar whitelist.",
      });
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: "A mensagem da whitelist precisa de conteudo e do botao Solicitar whitelist.",
          },
          { status: 400 },
        ),
      );
    }

    const authUserId = access.context.sessionData.authSession.user.id;
    let licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId);
    if (licenseStatus !== "paid") {
      licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId, {
        forceFresh: true,
      });
    }
    if (licenseStatus === "expired" || licenseStatus === "off") {
      recordServerSaveDiagnostic({
        context: diagnostic,
        authUserId,
        accessMode: resolveServerSaveAccessMode(access.context),
        licenseStatus,
        outcome: "license_blocked",
        httpStatus: 403,
        detail: "Plano expirado ou desligado.",
      });
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message: "Servidor com plano expirado/desligado. Renove o pagamento para editar configuracoes.",
          },
          { status: 403 },
        ),
      );
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const existing = await supabase
      .from("guild_whitelist_settings")
      .select("db_password_cipher")
      .eq("guild_id", guildId)
      .maybeSingle();

    if (existing.error) {
      const code = String(existing.error.code || "");
      const message = String(existing.error.message || "").toLowerCase();
      if (code === "42P01" || message.includes("guild_whitelist_settings")) {
        throw new Error(
          "Tabela da whitelist ainda nao existe. Rode sql/152_guild_whitelist.sql e sql/153_guild_whitelist_approval_mode.sql no Supabase.",
        );
      }
      throw new Error(existing.error.message);
    }

    const incomingPassword = String(body.dbPassword || "");
    const nextCipher = incomingPassword
      ? encryptWhitelistSecret(incomingPassword, guildId)
      : existing.data?.db_password_cipher || null;

    const mapping = normalizeWhitelistMapping(body.mapping);
    const row = {
      guild_id: guildId,
      enabled: draft.enabled,
      panel_channel_id: draft.panelChannelId,
      review_channel_id: draft.reviewChannelId,
      logs_channel_id: draft.logsChannelId,
      panel_layout: draft.panelLayout,
      panel_title: legacy.panelTitle || "Whitelist da cidade",
      panel_description: legacy.panelDescription || "",
      panel_button_label: legacy.panelButtonLabel || "Solicitar whitelist",
      approved_role_ids: draft.approvedRoleIds,
      denied_role_ids: draft.deniedRoleIds,
      review_role_ids: draft.reviewRoleIds,
      identifier_kind: draft.identifierKind,
      identifier_label: draft.identifierLabel,
      identifier_placeholder: draft.identifierPlaceholder,
      approval_mode: draft.approvalMode,
      connection_mode: "agent",
      db_engine: draft.dbEngine,
      db_host: "127.0.0.1",
      db_port: draft.dbPort,
      db_name: draft.dbName || null,
      db_user: draft.dbUser || null,
      db_ssl: draft.dbSsl,
      db_password_cipher: nextCipher,
      mapping,
      mapping_status: draft.mappingStatus,
      configured_by_user_id: authUserId,
    };

    let upsert = await supabase
      .from("guild_whitelist_settings")
      .upsert(row, { onConflict: "guild_id" });

    if (upsert.error && isMissingApprovalModeColumn(upsert.error)) {
      const { approval_mode: _ignored, ...rowWithoutApprovalMode } = row;
      upsert = await supabase
        .from("guild_whitelist_settings")
        .upsert(rowWithoutApprovalMode, { onConflict: "guild_id" });
    }

    if (upsert.error) {
      throw new Error(upsert.error.message);
    }

    const publicSnapshot = {
      ...draft,
      dbPassword: "",
      hasDbPassword: Boolean(nextCipher),
      mapping,
    };

    await writeServerSettingsVaultSnapshotSafe({
      guildId,
      moduleKey: "whitelist_settings",
      payload: publicSnapshot,
      configuredByUserId: authUserId,
    });

    invalidateDashboardSettingsCache({ guildId });
    recordServerSaveDiagnostic({
      context: diagnostic,
      authUserId,
      accessMode: resolveServerSaveAccessMode(access.context),
      licenseStatus,
      outcome: "saved",
      httpStatus: 200,
      detail: "Configuracoes de whitelist salvas com sucesso.",
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: { ...publicSnapshot, updatedAt: new Date().toISOString() },
      }),
    );
  } catch (error) {
    recordServerSaveDiagnostic({
      context: diagnostic,
      outcome: "failed",
      httpStatus: 500,
      detail: extractAuditErrorMessage(error, "Erro ao salvar whitelist."),
    });
    if (error instanceof FlowSecureDtoError) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: error.message }, { status: 400 }),
      );
    }
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Erro ao salvar whitelist."),
        },
        { status: 500 },
      ),
    );
  }
}
