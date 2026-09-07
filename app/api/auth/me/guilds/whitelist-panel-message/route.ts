import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  fetchGuildChannelsByBot,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { getEffectiveDashboardPermissions } from "@/lib/teams/userTeams";
import { cleanupExpiredUnpaidServerSetups } from "@/lib/payments/setupCleanup";
import { getGuildLicenseStatusForUser } from "@/lib/payments/licenseStatus";
import {
  ensureSameOriginJsonMutationRequest,
  applyNoStoreHeaders,
} from "@/lib/security/http";
import {
  buildTicketPanelDispatchPayload,
  ticketPanelMessageLooksManaged,
} from "@/lib/servers/ticketPanelDiscordPayload";
import {
  createServerSaveDiagnosticContext,
  recordServerSaveDiagnostic,
  resolveServerSaveAccessMode,
} from "@/lib/servers/serverSaveDiagnostics";
import {
  extractAuditErrorMessage,
  sanitizeErrorMessage,
} from "@/lib/security/errors";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  applyWhitelistPanelTokens,
  normalizeWhitelistPanelLayout,
  whitelistPanelHasRequiredParts,
} from "@/lib/servers/whitelistPanelBuilder";

const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;
const WHITELIST_START_CUSTOM_ID = "whitelist:request";

function resolveBotToken() {
  return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || null;
}

function isValidTextChannelType(type?: number) {
  return type === GUILD_TEXT || type === GUILD_ANNOUNCEMENT;
}

async function getStoredPanelMessageId(guildId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("guild_whitelist_settings")
    .select("panel_message_id, identifier_label")
    .eq("guild_id", guildId)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  return {
    messageId:
      typeof result.data?.panel_message_id === "string"
        ? result.data.panel_message_id.trim()
        : "",
    identifierLabel:
      typeof result.data?.identifier_label === "string"
        ? result.data.identifier_label.trim()
        : "ID / License",
  };
}

async function updateStoredPanelMessageId(guildId: string, panelMessageId: string | null) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("guild_whitelist_settings")
    .update({ panel_message_id: panelMessageId || null })
    .eq("guild_id", guildId);

  if (result.error) throw new Error(result.error.message);
}

export async function POST(request: Request) {
  const invalidMutationResponse = ensureSameOriginJsonMutationRequest(request);
  if (invalidMutationResponse) {
    return applyNoStoreHeaders(invalidMutationResponse);
  }

  let diagnostic = createServerSaveDiagnosticContext("whitelist_panel_dispatch");

  try {
    let body: {
      guildId: string;
      panelChannelId: string;
      panelLayout: Record<string, unknown>[];
      identifierLabel?: string;
    };

    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          guildId: flowSecureDto.discordSnowflake(),
          panelChannelId: flowSecureDto.discordSnowflake(),
          panelLayout: flowSecureDto.array(flowSecureDto.record()),
          identifierLabel: flowSecureDto.optional(
            flowSecureDto.string({ maxLength: 45, allowEmpty: true }),
          ),
        },
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

    const guildId = body.guildId;
    const panelChannelId = body.panelChannelId;
    const panelLayout = normalizeWhitelistPanelLayout(body.panelLayout);
    diagnostic = createServerSaveDiagnosticContext("whitelist_panel_dispatch", guildId);

    if (!isGuildId(guildId) || !isGuildId(panelChannelId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID ou canal informados sao invalidos." },
          { status: 400 },
        ),
      );
    }

    if (!panelLayout.length || !whitelistPanelHasRequiredParts(panelLayout)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "A mensagem da whitelist precisa de conteudo e do botao Solicitar whitelist.",
          },
          { status: 400 },
        ),
      );
    }

    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession || !sessionData.accessToken) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 }),
      );
    }

    const authUserId = sessionData.authSession.user.id;
    const { permissions: dashboardPerms, isTeamServer } =
      await getEffectiveDashboardPermissions({ authUserId, guildId });
    const accessibleGuild = await assertUserAdminInGuildOrNull(
      {
        authSession: sessionData.authSession,
        accessToken: sessionData.accessToken,
      },
      guildId,
    );
    const canManage =
      dashboardPerms === "full" ||
      (dashboardPerms instanceof Set &&
        (dashboardPerms.has("server_manage_whitelist_message") ||
          dashboardPerms.has("server_manage_whitelist_overview"))) ||
      (!isTeamServer && accessibleGuild);

    if (!canManage) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Voce nao possui permissao para gerenciar este modulo." },
          { status: 403 },
        ),
      );
    }

    const licenseStatus = await getGuildLicenseStatusForUser(guildId, authUserId, {
      forceFresh: true,
    });
    if (licenseStatus === "expired" || licenseStatus === "off") {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Servidor com plano expirado/desligado. Renove o pagamento para enviar o embed.",
          },
          { status: 403 },
        ),
      );
    }

    if (licenseStatus === "not_paid") {
      const cleanupSummary = await cleanupExpiredUnpaidServerSetups({
        userId: authUserId,
        guildId,
        source: "guild_whitelist_panel_dispatch_post",
      });
      if (cleanupSummary.cleanedGuildIds.includes(guildId)) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              ok: false,
              message:
                "A configuracao desse servidor expirou apos 30 minutos sem pagamento.",
            },
            { status: 409 },
          ),
        );
      }
    }

    const rawChannels = await fetchGuildChannelsByBot(guildId);
    const panelChannel = rawChannels?.find((channel) => channel.id === panelChannelId);
    if (!panelChannel || !isValidTextChannelType(panelChannel.type)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Canal do painel de whitelist invalido." },
          { status: 400 },
        ),
      );
    }

    const botToken = resolveBotToken();
    if (!botToken) {
      throw new Error("DISCORD_BOT_TOKEN nao configurado no ambiente do site.");
    }

    const stored = await getStoredPanelMessageId(guildId);
    const tokenizedLayout = applyWhitelistPanelTokens(panelLayout, {
      guildName: panelChannel.name || "este servidor",
      identifierLabel: String(body.identifierLabel || stored.identifierLabel || "ID / License"),
    });
    const payload = buildTicketPanelDispatchPayload(tokenizedLayout, {
      interactiveCustomId: WHITELIST_START_CUSTOM_ID,
    });

    const listResponse = await fetch(
      `https://discord.com/api/v10/channels/${panelChannelId}/messages?limit=25`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        cache: "no-store",
      },
    );
    if (!listResponse.ok) {
      throw new Error("Falha ao buscar mensagens recentes do canal de whitelist.");
    }

    const recentMessages = (await listResponse.json()) as unknown[];
    let managedMessage = recentMessages.find((message) =>
      ticketPanelMessageLooksManaged(message, {
        interactiveCustomId: WHITELIST_START_CUSTOM_ID,
      }),
    ) as { id?: string } | undefined;

    if (!managedMessage && stored.messageId) {
      const storedResponse = await fetch(
        `https://discord.com/api/v10/channels/${panelChannelId}/messages/${stored.messageId}`,
        {
          headers: { Authorization: `Bot ${botToken}` },
          cache: "no-store",
        },
      );
      if (storedResponse.ok) {
        const storedMessage = await storedResponse.json();
        if (
          ticketPanelMessageLooksManaged(storedMessage, {
            interactiveCustomId: WHITELIST_START_CUSTOM_ID,
          })
        ) {
          managedMessage = storedMessage;
        }
      }
    }

    const dispatchResponse = await fetch(
      managedMessage?.id
        ? `https://discord.com/api/v10/channels/${panelChannelId}/messages/${managedMessage.id}`
        : `https://discord.com/api/v10/channels/${panelChannelId}/messages`,
      {
        method: managedMessage?.id ? "PATCH" : "POST",
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    if (!dispatchResponse.ok) {
      const text = await dispatchResponse.text();
      throw new Error(text || "Falha ao enviar o embed de whitelist.");
    }

    const dispatchedMessage = (await dispatchResponse.json()) as { id?: string };
    if (typeof dispatchedMessage.id === "string") {
      await updateStoredPanelMessageId(guildId, dispatchedMessage.id);
    }

    recordServerSaveDiagnostic({
      context: diagnostic,
      authUserId,
      accessMode: resolveServerSaveAccessMode({
        accessibleGuild,
        hasTeamAccess: isTeamServer,
      }),
      licenseStatus,
      outcome: "saved",
      httpStatus: 200,
      detail: managedMessage
        ? "Embed de whitelist atualizado com sucesso."
        : "Embed de whitelist enviado com sucesso.",
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        mode: managedMessage ? "updated" : "created",
        channelId: panelChannelId,
        messageId: dispatchedMessage.id,
      }),
    );
  } catch (error) {
    recordServerSaveDiagnostic({
      context: diagnostic,
      outcome: "failed",
      httpStatus: 500,
      detail: extractAuditErrorMessage(error, "Erro ao enviar o embed de whitelist."),
    });
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Erro ao enviar o embed de whitelist."),
        },
        { status: 500 },
      ),
    );
  }
}
