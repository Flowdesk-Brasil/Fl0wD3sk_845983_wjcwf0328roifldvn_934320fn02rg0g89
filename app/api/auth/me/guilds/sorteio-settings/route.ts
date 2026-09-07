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
import {
  readServerSettingsVaultSnapshot,
  rewriteUnreadableServerSettingsVaultSnapshot,
  writeServerSettingsVaultSnapshotSafe,
} from "@/lib/servers/serverSettingsVault";
import {
  normalizeSorteioActiveLayout,
  normalizeSorteioEndedLayout,
  sorteioActiveLayoutHasRequiredParts,
} from "@/lib/servers/sorteioPanelBuilder";
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
import { sendServerSettingsSavedEmailSafe } from "@/lib/mail/transactional";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { ticketPanelLayoutHasRenderableContent } from "@/lib/servers/ticketPanelBuilder";
import type { TicketPanelLayout } from "@/lib/servers/ticketPanelBuilder";

const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;

const OPTIONAL_DISCORD_SNOWFLAKE_TEXT = flowSecureDto.string({
  maxLength: 20,
  pattern: /^(?:\d{17,20})?$/,
  allowEmpty: true,
  disallowAngleBrackets: true,
  rejectThreatPatterns: false,
});

const SORTEIO_SETTINGS_SELECT =
  "enabled, logs_channel_id, create_role_ids, reroll_role_ids, active_layout, ended_layout, default_winner_count, default_duration_minutes, updated_at";

type SorteioSettingsRow = {
  enabled: boolean;
  logs_channel_id: string | null;
  create_role_ids: unknown;
  reroll_role_ids: unknown;
  active_layout: unknown;
  ended_layout: unknown;
  default_winner_count: number | null;
  default_duration_minutes: number | null;
  updated_at: string | null;
};

type SorteioSecureSnapshot = {
  enabled: boolean;
  logsChannelId: string | null;
  createRoleIds: string[];
  rerollRoleIds: string[];
  defaultWinnerCount: number;
  defaultDurationMinutes: number;
  activeLayout: TicketPanelLayout;
  endedLayout: TicketPanelLayout;
};

function getTrimmedId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidTextChannelType(type?: number) {
  return type === GUILD_TEXT || type === GUILD_ANNOUNCEMENT;
}

function normalizeRoleIds(value: unknown, maxItems = 25) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.map((item) => getTrimmedId(item)).filter(isGuildId),
    ),
  ).slice(0, maxItems);
}

function normalizeSorteioSecureSnapshot(value: unknown): SorteioSecureSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const winnerCount = Number(record.defaultWinnerCount ?? 1);
  const durationMinutes = Number(record.defaultDurationMinutes ?? 60);

  return {
    enabled: record.enabled === true,
    logsChannelId: getTrimmedId(record.logsChannelId) || null,
    createRoleIds: normalizeRoleIds(record.createRoleIds),
    rerollRoleIds: normalizeRoleIds(record.rerollRoleIds),
    defaultWinnerCount:
      Number.isFinite(winnerCount) && winnerCount >= 1 && winnerCount <= 25
        ? Math.floor(winnerCount)
        : 1,
    defaultDurationMinutes:
      Number.isFinite(durationMinutes) &&
      durationMinutes >= 1 &&
      durationMinutes <= 43200
        ? Math.floor(durationMinutes)
        : 60,
    activeLayout: normalizeSorteioActiveLayout(record.activeLayout),
    endedLayout: normalizeSorteioEndedLayout(record.endedLayout),
  };
}

function buildSorteioResponse(snapshot: SorteioSecureSnapshot, updatedAt: string | null) {
  return {
    enabled: snapshot.enabled,
    logsChannelId: snapshot.logsChannelId,
    createRoleIds: snapshot.createRoleIds,
    rerollRoleIds: snapshot.rerollRoleIds,
    defaultWinnerCount: snapshot.defaultWinnerCount,
    defaultDurationMinutes: snapshot.defaultDurationMinutes,
    activeLayout: snapshot.activeLayout,
    endedLayout: snapshot.endedLayout,
    updatedAt,
  };
}

async function ensureGuildAccess(
  guildId: string,
  requiredPermission: TeamRolePermission,
) {
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
    context: { sessionData, accessibleGuild, hasTeamAccess: isTeamServer },
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

    const access = await ensureGuildAccess(guildId, "server_manage_sorteio_overview");
    if (!access.ok) return access.response;

    const supabase = getSupabaseAdminClientOrThrow();
    const [result, secureSnapshotResult] = await Promise.all([
      supabase
        .from("guild_sorteio_settings")
        .select(SORTEIO_SETTINGS_SELECT)
        .eq("guild_id", guildId)
        .maybeSingle(),
      readServerSettingsVaultSnapshot<SorteioSecureSnapshot>({
        guildId,
        moduleKey: "sorteio_settings",
      }),
    ]);

    if (result.error) {
      const code = typeof result.error.code === "string" ? result.error.code : "";
      const message = String(result.error.message || "").toLowerCase();
      if (code !== "42P01" && !message.includes("guild_sorteio_settings")) {
        throw new Error(result.error.message);
      }
    }

    const secureSnapshot = normalizeSorteioSecureSnapshot(secureSnapshotResult?.payload);
    if (secureSnapshot) {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          settings: buildSorteioResponse(secureSnapshot, secureSnapshotResult?.updatedAt || null),
        }),
      );
    }

    const row = (result.data || null) as SorteioSettingsRow | null;
    if (!row) {
      return applyNoStoreHeaders(NextResponse.json({ ok: true, settings: null }));
    }

    const canonicalSnapshot = normalizeSorteioSecureSnapshot({
      enabled: row.enabled,
      logsChannelId: row.logs_channel_id,
      createRoleIds: row.create_role_ids,
      rerollRoleIds: row.reroll_role_ids,
      defaultWinnerCount: row.default_winner_count,
      defaultDurationMinutes: row.default_duration_minutes,
      activeLayout: row.active_layout,
      endedLayout: row.ended_layout,
    });

    if (canonicalSnapshot && secureSnapshotResult?.recovery?.unreadable) {
      void rewriteUnreadableServerSettingsVaultSnapshot({
        guildId,
        moduleKey: "sorteio_settings",
        payload: canonicalSnapshot,
        configuredByUserId: access.context.sessionData.authSession.user.id,
        recovery: secureSnapshotResult.recovery,
      });
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: canonicalSnapshot
          ? buildSorteioResponse(canonicalSnapshot, row.updated_at)
          : null,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Erro ao carregar configuracoes de sorteios."),
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

  let diagnostic = createServerSaveDiagnosticContext("sorteio_settings");

  try {
    let body: Record<string, unknown>;
    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          guildId: flowSecureDto.discordSnowflake(),
          enabled: flowSecureDto.optional(flowSecureDto.boolean()),
          logsChannelId: flowSecureDto.optional(
            flowSecureDto.nullable(OPTIONAL_DISCORD_SNOWFLAKE_TEXT),
          ),
          createRoleIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.string({ maxLength: 20 })),
          ),
          rerollRoleIds: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.string({ maxLength: 20 })),
          ),
          defaultWinnerCount: flowSecureDto.optional(flowSecureDto.number()),
          defaultDurationMinutes: flowSecureDto.optional(flowSecureDto.number()),
          activeLayout: flowSecureDto.optional(
            flowSecureDto.array(flowSecureDto.record()),
          ),
          endedLayout: flowSecureDto.optional(
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
    const snapshot = normalizeSorteioSecureSnapshot({
      enabled: body.enabled ?? true,
      logsChannelId: body.logsChannelId,
      createRoleIds: body.createRoleIds,
      rerollRoleIds: body.rerollRoleIds,
      defaultWinnerCount: body.defaultWinnerCount,
      defaultDurationMinutes: body.defaultDurationMinutes,
      activeLayout: body.activeLayout,
      endedLayout: body.endedLayout,
    });

    if (!snapshot || !isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Guild ID invalido." }, { status: 400 }),
      );
    }

    diagnostic = createServerSaveDiagnosticContext("sorteio_settings", guildId);

    if (
      snapshot.enabled &&
      (!sorteioActiveLayoutHasRequiredParts(snapshot.activeLayout) ||
        !ticketPanelLayoutHasRenderableContent(snapshot.endedLayout))
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "A mensagem do sorteio ativo precisa de conteudo e dos botoes fixos Entrar e Engrenagem, e o template encerrado precisa manter conteudo valido.",
          },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(guildId, "server_manage_sorteio_overview");
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

    if (snapshot.enabled && (snapshot.logsChannelId || snapshot.createRoleIds.length || snapshot.rerollRoleIds.length)) {
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

      if (snapshot.logsChannelId) {
        const logsChannel = channelsById.get(snapshot.logsChannelId);
        if (!logsChannel || !isValidTextChannelType(logsChannel.type)) {
          return applyNoStoreHeaders(
            NextResponse.json(
              { ok: false, message: "Canal de logs de sorteios invalido." },
              { status: 400 },
            ),
          );
        }
      }

      const invalidRole = [...snapshot.createRoleIds, ...snapshot.rerollRoleIds].some(
        (roleId) => !rolesById.has(roleId),
      );
      if (invalidRole) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { ok: false, message: "Um ou mais cargos de sorteios sao invalidos." },
            { status: 400 },
          ),
        );
      }
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const upsertResult = await supabase
      .from("guild_sorteio_settings")
      .upsert(
        {
          guild_id: guildId,
          enabled: snapshot.enabled,
          logs_channel_id: snapshot.logsChannelId,
          create_role_ids: snapshot.createRoleIds,
          reroll_role_ids: snapshot.rerollRoleIds,
          default_winner_count: snapshot.defaultWinnerCount,
          default_duration_minutes: snapshot.defaultDurationMinutes,
          active_layout: snapshot.activeLayout,
          ended_layout: snapshot.endedLayout,
          configured_by_user_id: authUserId,
        },
        { onConflict: "guild_id" },
      )
      .select(SORTEIO_SETTINGS_SELECT)
      .single();

    if (upsertResult.error) {
      throw new Error(upsertResult.error.message);
    }

    const secureUpdated = await writeServerSettingsVaultSnapshotSafe({
      guildId,
      moduleKey: "sorteio_settings",
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
      detail: "Configuracoes de sorteios salvas com sucesso.",
    });

    void sendServerSettingsSavedEmailSafe({
      user: access.context.sessionData.authSession.user,
      guildId,
      moduleLabel: "Sorteios",
      detail: snapshot.enabled ? "Modulo ativo" : "Modulo desativado",
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        settings: buildSorteioResponse(
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
      detail: extractAuditErrorMessage(error, "Erro ao salvar configuracoes de sorteios."),
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
          message: sanitizeErrorMessage(error, "Erro ao salvar configuracoes de sorteios."),
        },
        { status: 500 },
      ),
    );
  }
}
