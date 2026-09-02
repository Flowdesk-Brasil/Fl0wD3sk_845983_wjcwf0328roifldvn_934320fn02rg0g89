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
  DEFAULT_SUGGESTION_PUBLISHED_FOOTER,
  DEFAULT_SUGGESTION_PUBLISHED_HEADER,
  normalizeSuggestionPanelLayout,
  normalizeSuggestionPublishedLayout,
  normalizeTicketPanelLayout,
  suggestionPublishedLayoutHasRequiredSlots,
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

const OPTIONAL_DISCORD_SNOWFLAKE_TEXT = flowSecureDto.string({
  maxLength: 20,
  pattern: /^(?:\d{17,20})?$/,
  allowEmpty: true,
  disallowAngleBrackets: true,
  rejectThreatPatterns: false,
});

const SUGGESTIONS_SETTINGS_SELECT =
  "guild_id, enabled, panel_channel_id, publish_channel_id, logs_channel_id, panel_layout, panel_title, panel_description, panel_button_label, panel_message_id, suggestion_layout, published_header, published_footer, thread_name_prefix, updated_at";

type SuggestionsSecureSnapshot = {
  enabled: boolean;
  panelChannelId: string | null;
  publishChannelId: string | null;
  logsChannelId: string | null;
  panelLayout: TicketPanelLayout;
  panelTitle: string;
  panelDescription: string;
  panelButtonLabel: string;
  suggestionLayout: TicketPanelLayout;
};

function getTrimmedId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getTrimmedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSuggestionsSecureSnapshot(
  value: unknown,
): SuggestionsSecureSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const legacyFields = deriveLegacyTicketPanelFields(
    normalizeSuggestionPanelLayout(record.panelLayout, {
      panelTitle: getTrimmedText(record.panelTitle),
      panelDescription: getTrimmedText(record.panelDescription),
      panelButtonLabel: getTrimmedText(record.panelButtonLabel),
    }),
  );

  return {
    enabled: record.enabled === true,
    panelChannelId: getTrimmedId(record.panelChannelId) || null,
    publishChannelId: getTrimmedId(record.publishChannelId) || null,
    logsChannelId: getTrimmedId(record.logsChannelId) || null,
    panelLayout: normalizeSuggestionPanelLayout(record.panelLayout, legacyFields),
    panelTitle: legacyFields.panelTitle,
    panelDescription: legacyFields.panelDescription,
    panelButtonLabel: legacyFields.panelButtonLabel,
    suggestionLayout: normalizeSuggestionPublishedLayout(record.suggestionLayout, {
      publishedHeader:
        getTrimmedText(record.publishedHeader) ||
        DEFAULT_SUGGESTION_PUBLISHED_HEADER,
      publishedFooter:
        getTrimmedText(record.publishedFooter) ||
        DEFAULT_SUGGESTION_PUBLISHED_FOOTER,
    }),
  };
}

function buildSuggestionsResponse(
  snapshot: SuggestionsSecureSnapshot,
  updatedAt: string | null,
) {
  return {
    enabled: snapshot.enabled,
    panelChannelId: snapshot.panelChannelId,
    publishChannelId: snapshot.publishChannelId,
    logsChannelId: snapshot.logsChannelId,
    panelLayout: snapshot.panelLayout,
    panelTitle: snapshot.panelTitle,
    panelDescription: snapshot.panelDescription,
    panelButtonLabel: snapshot.panelButtonLabel,
    suggestionLayout: snapshot.suggestionLayout,
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
      "server_manage_suggestions_overview",
    );
    if (!access.ok) return access.response;

    const supabase = getSupabaseAdminClientOrThrow();
    const [result, secureSnapshotResult] = await Promise.all([
      supabase
        .from("guild_suggestions_settings")
        .select(SUGGESTIONS_SETTINGS_SELECT.replace("guild_id, ", ""))
        .eq("guild_id", guildId)
        .maybeSingle(),
      readServerSettingsVaultSnapshot<SuggestionsSecureSnapshot>({
        guildId,
        moduleKey: "suggestions_settings",
      }),
    ]);

    if (result.error) {
      const code = typeof result.error.code === "string" ? result.error.code : "";
      const message = String(result.error.message || "").toLowerCase();
      if (code !== "42P01" && !message.includes("guild_suggestions_settings")) {
        throw new Error(result.error.message);
      }
    }

    const secureSnapshot = normalizeSuggestionsSecureSnapshot(
      secureSnapshotResult?.payload,
    );
    if (secureSnapshot) {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          settings: buildSuggestionsResponse(
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

    const canonicalSnapshot = normalizeSuggestionsSecureSnapshot({
      enabled: result.data.enabled,
      panelChannelId: result.data.panel_channel_id,
      publishChannelId: result.data.publish_channel_id,
      logsChannelId: result.data.logs_channel_id,
      panelLayout: result.data.panel_layout,
      panelTitle: result.data.panel_title,
      panelDescription: result.data.panel_description,
      panelButtonLabel: result.data.panel_button_label,
      suggestionLayout: result.data.suggestion_layout,
      publishedHeader: result.data.published_header,
      publishedFooter: result.data.published_footer,
    });

    if (canonicalSnapshot && secureSnapshotResult?.recovery?.unreadable) {
      void rewriteUnreadableServerSettingsVaultSnapshot({
        guildId,
        moduleKey: "suggestions_settings",
        payload: canonicalSnapshot,
        configuredByUserId: access.context.sessionData.authSession.user.id,
        recovery: secureSnapshotResult.recovery,
      });
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: canonicalSnapshot
          ? buildSuggestionsResponse(canonicalSnapshot, result.data.updated_at)
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
            "Erro ao carregar configuracoes de sugestoes.",
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

  let diagnostic = createServerSaveDiagnosticContext("suggestions_settings");

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
          publishChannelId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          logsChannelId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          panelLayout: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.record()),
          ),
          panelTitle: flowSecureDto.optional(
            flowSecureDto.string({ allowEmpty: true, maxLength: 80 }),
          ),
          panelDescription: flowSecureDto.optional(
            flowSecureDto.string({ allowEmpty: true, maxLength: 400 }),
          ),
          panelButtonLabel: flowSecureDto.optional(
            flowSecureDto.string({ allowEmpty: true, maxLength: 40 }),
          ),
          suggestionLayout: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.record()),
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
    const snapshot = normalizeSuggestionsSecureSnapshot({
      enabled: body.enabled ?? true,
      panelChannelId: body.panelChannelId,
      publishChannelId: body.publishChannelId,
      logsChannelId: body.logsChannelId,
      panelLayout: body.panelLayout,
      panelTitle: body.panelTitle,
      panelDescription: body.panelDescription,
      panelButtonLabel: body.panelButtonLabel,
      suggestionLayout: body.suggestionLayout,
    });

    if (!snapshot || !isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID invalido." },
          { status: 400 },
        ),
      );
    }

    diagnostic = createServerSaveDiagnosticContext("suggestions_settings", guildId);

    if (
      snapshot.enabled &&
      (!snapshot.panelChannelId ||
        !snapshot.publishChannelId ||
        !ticketPanelLayoutHasRequiredParts(snapshot.panelLayout) ||
        !ticketPanelLayoutHasAtMostOneFunctionButton(snapshot.panelLayout) ||
        !suggestionPublishedLayoutHasRequiredSlots(snapshot.suggestionLayout))
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Defina canal do painel, canal de publicacao, mensagem valida do painel e template publicado com titulo e descricao fixos do membro.",
          },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(
      guildId,
      "server_manage_suggestions_overview",
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
      const rawChannels = await fetchGuildChannelsByBot(guildId);

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
      const panelChannel = snapshot.panelChannelId
        ? channelsById.get(snapshot.panelChannelId)
        : null;
      const publishChannel = snapshot.publishChannelId
        ? channelsById.get(snapshot.publishChannelId)
        : null;

      if (!panelChannel || !isValidTextChannelType(panelChannel.type)) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Canal do painel de sugestoes invalido." },
            { status: 400 },
          ),
        );
      }

      if (!publishChannel || !isValidTextChannelType(publishChannel.type)) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              ok: false,
              message: "Canal de publicacao de sugestoes invalido.",
            },
            { status: 400 },
          ),
        );
      }

      if (snapshot.logsChannelId) {
        const logsChannel = channelsById.get(snapshot.logsChannelId);
        if (!logsChannel || !isValidTextChannelType(logsChannel.type)) {
          return applyNoStoreHeaders(
            NextResponse.json(
              { ok: false, message: "Canal de logs de sugestoes invalido." },
              { status: 400 },
            ),
          );
        }
      }
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const upsertResult = await supabase
      .from("guild_suggestions_settings")
      .upsert(
        {
          guild_id: guildId,
          enabled: snapshot.enabled,
          panel_channel_id: snapshot.panelChannelId,
          publish_channel_id: snapshot.publishChannelId,
          logs_channel_id: snapshot.logsChannelId,
          panel_layout: snapshot.panelLayout,
          panel_title: snapshot.panelTitle,
          panel_description: snapshot.panelDescription,
          panel_button_label: snapshot.panelButtonLabel,
          suggestion_layout: snapshot.suggestionLayout,
          published_header: DEFAULT_SUGGESTION_PUBLISHED_HEADER,
          published_footer: DEFAULT_SUGGESTION_PUBLISHED_FOOTER,
          thread_name_prefix: "Debater sugestao",
          configured_by_user_id: authUserId,
        },
        { onConflict: "guild_id" },
      )
      .select(SUGGESTIONS_SETTINGS_SELECT)
      .single();

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message);
    }

    const secureUpdated = await writeServerSettingsVaultSnapshotSafe({
      guildId,
      moduleKey: "suggestions_settings",
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
      detail: "Configuracoes de sugestoes salvas com sucesso.",
    });

    void sendServerSettingsSavedEmailSafe({
      user: access.context.sessionData.authSession.user,
      guildId,
      moduleLabel: "Sugestoes",
      detail: snapshot.enabled ? "Modulo ativo" : "Modulo desativado",
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: buildSuggestionsResponse(
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
      detail: extractAuditErrorMessage(
        error,
        "Erro ao salvar configuracoes de sugestoes.",
      ),
    });
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao salvar configuracoes de sugestoes.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
