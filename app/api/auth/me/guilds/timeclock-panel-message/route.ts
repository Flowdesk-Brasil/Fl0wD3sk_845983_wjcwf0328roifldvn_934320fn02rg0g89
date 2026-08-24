import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  fetchGuildChannelsByBot,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { getEffectiveDashboardPermissions } from "@/lib/teams/userTeams";
import { getGuildLicenseStatusForUser } from "@/lib/payments/licenseStatus";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import {
  buildTicketPanelDispatchPayload,
  ticketPanelMessageLooksManaged,
} from "@/lib/servers/ticketPanelDiscordPayload";
import {
  normalizeTicketPanelLayout,
  ticketPanelLayoutHasAtMostOneFunctionButton,
  ticketPanelLayoutHasRequiredParts,
} from "@/lib/servers/ticketPanelBuilder";
import {
  getTimeclockSettings,
  updateTimeclockPanelMessageId,
} from "@/lib/timeclock/service";

const TIMECLOCK_OPEN_CUSTOM_ID = "timeclock:open";
const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;
const DISCORD_RETRY_DELAYS_MS = [180, 420];

type DiscordChannelMessage = {
  id?: unknown;
  author?: { bot?: unknown } | null;
  components?: unknown;
};

function resolveBotToken() {
  return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || null;
}

function isValidTextChannelType(type?: number) {
  return type === GUILD_TEXT || type === GUILD_ANNOUNCEMENT;
}

async function ensureGuildAccess(guildId: string) {
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
    dashboardPerms instanceof Set && dashboardPerms.has("server_manage_tickets_message");
  const canManage = hasFullAccess || hasSpecificPerm || (!isTeamServer && accessibleGuild);
  if (!canManage) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Voce nao possui permissao para publicar esta mensagem." },
        { status: 403 },
      ),
    };
  }
  return { ok: true as const, authUserId: sessionData.authSession.user.id };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDiscordWithBot<T>(input: {
  url: string;
  botToken: string;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  resourceLabel: string;
}) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= DISCORD_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const response = await fetch(input.url, {
        method: input.method || "GET",
        headers: {
          Authorization: `Bot ${input.botToken}`,
          ...(input.body ? { "Content-Type": "application/json" } : {}),
        },
        body: input.body ? JSON.stringify(input.body) : undefined,
        cache: "no-store",
      });
      if (!response.ok) {
        const text = await response.text();
        const retryable = response.status === 429 || response.status >= 500;
        if (retryable && attempt < DISCORD_RETRY_DELAYS_MS.length) {
          await sleep(DISCORD_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw new Error(`Discord respondeu com erro ao ${input.resourceLabel}: ${text || response.statusText}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(`Falha ao ${input.resourceLabel}.`);
      if (attempt < DISCORD_RETRY_DELAYS_MS.length) {
        await sleep(DISCORD_RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  throw lastError || new Error(`Falha ao ${input.resourceLabel}.`);
}

async function fetchStoredMessage(input: {
  channelId: string;
  messageId: string | null;
  botToken: string;
}) {
  if (!input.messageId) return null;
  const response = await fetch(
    `https://discord.com/api/v10/channels/${input.channelId}/messages/${input.messageId}`,
    {
      method: "GET",
      headers: { Authorization: `Bot ${input.botToken}` },
      cache: "no-store",
    },
  );
  if (response.status === 404) return null;
  if (!response.ok) return null;
  return (await response.json()) as DiscordChannelMessage;
}

export async function POST(request: Request) {
  const invalidMutationResponse = ensureSameOriginJsonMutationRequest(request);
  if (invalidMutationResponse) return applyNoStoreHeaders(invalidMutationResponse);

  try {
    let body: { guildId: string; mainChannelId: string; panelLayout: Record<string, unknown>[] };
    try {
      body = parseFlowSecureDto(
        await request.json().catch(() => ({})),
        {
          guildId: flowSecureDto.discordSnowflake(),
          mainChannelId: flowSecureDto.discordSnowflake(),
          panelLayout: flowSecureDto.array(flowSecureDto.record()),
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

    const guildId = body.guildId;
    const mainChannelId = body.mainChannelId;
    const panelLayout = normalizeTicketPanelLayout(body.panelLayout, {
      panelTitle: "Controle de Ponto",
      panelDescription: "Utilize o botao abaixo para acessar seu ponto.",
      panelButtonLabel: "Bater Ponto",
    });

    if (!isGuildId(guildId) || !isGuildId(mainChannelId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID ou canal informados sao invalidos." },
          { status: 400 },
        ),
      );
    }
    if (
      !panelLayout.length ||
      !ticketPanelLayoutHasRequiredParts(panelLayout) ||
      !ticketPanelLayoutHasAtMostOneFunctionButton(panelLayout)
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            ok: false,
            message:
              "Adicione conteudo e apenas uma acao principal na mensagem do Bate Ponto.",
          },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(guildId);
    if (!access.ok) return applyNoStoreHeaders(access.response);

    let licenseStatus = await getGuildLicenseStatusForUser(guildId, access.authUserId);
    if (licenseStatus !== "paid") {
      licenseStatus = await getGuildLicenseStatusForUser(guildId, access.authUserId, { forceFresh: true });
    }
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

    const rawChannels = await fetchGuildChannelsByBot(guildId);
    const channel = rawChannels?.find((item) => item.id === mainChannelId);
    if (!channel || !isValidTextChannelType(channel.type)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Canal principal do Bate Ponto invalido." },
          { status: 400 },
        ),
      );
    }

    const botToken = resolveBotToken();
    if (!botToken) {
      throw new Error("DISCORD_BOT_TOKEN nao configurado no ambiente do site.");
    }

    const settings = await getTimeclockSettings(guildId);
    const storedMessage = await fetchStoredMessage({
      channelId: mainChannelId,
      messageId: settings.panelMessageId,
      botToken,
    });
    const managedMessage =
      storedMessage &&
      ticketPanelMessageLooksManaged(storedMessage, {
        interactiveCustomId: TIMECLOCK_OPEN_CUSTOM_ID,
      })
        ? storedMessage
        : (
            await requestDiscordWithBot<DiscordChannelMessage[]>({
              url: `https://discord.com/api/v10/channels/${mainChannelId}/messages?limit=25`,
              botToken,
              resourceLabel: "buscar mensagens recentes do canal",
            })
          ).find((message) =>
            ticketPanelMessageLooksManaged(message, {
              interactiveCustomId: TIMECLOCK_OPEN_CUSTOM_ID,
            }),
          );

    const payload = buildTicketPanelDispatchPayload(panelLayout, {
      interactiveCustomId: TIMECLOCK_OPEN_CUSTOM_ID,
    });
    const dispatchedMessage =
      managedMessage && typeof managedMessage.id === "string"
        ? await requestDiscordWithBot<{ id: string }>({
            url: `https://discord.com/api/v10/channels/${mainChannelId}/messages/${managedMessage.id}`,
            method: "PATCH",
            body: payload,
            botToken,
            resourceLabel: "atualizar a mensagem do Bate Ponto",
          })
        : await requestDiscordWithBot<{ id: string }>({
            url: `https://discord.com/api/v10/channels/${mainChannelId}/messages`,
            method: "POST",
            body: payload,
            botToken,
            resourceLabel: "enviar a mensagem do Bate Ponto",
          });

    await updateTimeclockPanelMessageId({
      guildId,
      messageId: typeof dispatchedMessage.id === "string" ? dispatchedMessage.id : null,
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        mode: managedMessage ? "updated" : "created",
        channelId: mainChannelId,
        messageId: dispatchedMessage.id,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(error, "Erro ao enviar mensagem do Bate Ponto."),
        },
        { status: 500 },
      ),
    );
  }
}
