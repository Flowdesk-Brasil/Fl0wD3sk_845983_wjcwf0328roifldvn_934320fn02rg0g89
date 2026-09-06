import { fetchGuildChannelsByBot } from "@/lib/auth/discordGuildAccess";
import {
  buildTicketPanelDispatchPayload,
  ticketPanelMessageLooksManaged,
} from "@/lib/servers/ticketPanelDiscordPayload";
import {
  normalizeBatePontoPanelLayout,
  ticketPanelLayoutHasAtMostOneFunctionButton,
  ticketPanelLayoutHasRequiredParts,
  type TicketPanelLayout,
} from "@/lib/servers/ticketPanelBuilder";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

const GUILD_TEXT = 0;
const GUILD_ANNOUNCEMENT = 5;
const BATE_PONTO_START_CUSTOM_ID = "bateponto:start";

export type DispatchBatePontoPanelMessageResult =
  | {
      ok: true;
      mode: "created" | "updated";
      channelId: string;
      messageId?: string;
    }
  | {
      ok: false;
      message: string;
    };

function resolveBotToken() {
  return process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN || null;
}

function isValidTextChannelType(type?: number) {
  return type === GUILD_TEXT || type === GUILD_ANNOUNCEMENT;
}

async function getStoredPanelMessageId(guildId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("guild_bate_ponto_settings")
    .select("panel_message_id")
    .eq("guild_id", guildId)
    .maybeSingle();

  if (result.error) throw new Error(result.error.message);
  return typeof result.data?.panel_message_id === "string"
    ? result.data.panel_message_id.trim()
    : "";
}

async function updateStoredPanelMessageId(
  guildId: string,
  panelMessageId: string | null,
) {
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("guild_bate_ponto_settings")
    .update({ panel_message_id: panelMessageId || null })
    .eq("guild_id", guildId);

  if (result.error) throw new Error(result.error.message);
}

export async function dispatchBatePontoPanelMessage(input: {
  guildId: string;
  panelChannelId: string;
  panelLayout: TicketPanelLayout;
}): Promise<DispatchBatePontoPanelMessageResult> {
  const guildId = input.guildId.trim();
  const panelChannelId = input.panelChannelId.trim();
  const panelLayout = normalizeBatePontoPanelLayout(input.panelLayout);

  if (
    !panelLayout.length ||
    !ticketPanelLayoutHasRequiredParts(panelLayout) ||
    !ticketPanelLayoutHasAtMostOneFunctionButton(panelLayout)
  ) {
    return {
      ok: false,
      message:
        "Adicione pelo menos um conteudo com texto e uma acao antes de enviar o embed.",
    };
  }

  const rawChannels = await fetchGuildChannelsByBot(guildId);
  const panelChannel = rawChannels?.find((channel) => channel.id === panelChannelId);
  if (!panelChannel || !isValidTextChannelType(panelChannel.type)) {
    return {
      ok: false,
      message: "Canal do painel de bate ponto invalido.",
    };
  }

  const botToken = resolveBotToken();
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN nao configurado no ambiente do site.");
  }

  const payload = buildTicketPanelDispatchPayload(panelLayout, {
    interactiveCustomId: BATE_PONTO_START_CUSTOM_ID,
  });
  const storedPanelMessageId = await getStoredPanelMessageId(guildId);

  const listResponse = await fetch(
    `https://discord.com/api/v10/channels/${panelChannelId}/messages?limit=25`,
    {
      headers: { Authorization: `Bot ${botToken}` },
      cache: "no-store",
    },
  );
  if (!listResponse.ok) {
    throw new Error("Falha ao buscar mensagens recentes do canal de bate ponto.");
  }

  const recentMessages = (await listResponse.json()) as unknown[];
  let managedMessage = recentMessages.find((message) =>
    ticketPanelMessageLooksManaged(message, {
      interactiveCustomId: BATE_PONTO_START_CUSTOM_ID,
    }),
  ) as { id?: string } | undefined;

  if (!managedMessage && storedPanelMessageId) {
    const storedResponse = await fetch(
      `https://discord.com/api/v10/channels/${panelChannelId}/messages/${storedPanelMessageId}`,
      {
        headers: { Authorization: `Bot ${botToken}` },
        cache: "no-store",
      },
    );
    if (storedResponse.ok) {
      const storedMessage = await storedResponse.json();
      if (
        ticketPanelMessageLooksManaged(storedMessage, {
          interactiveCustomId: BATE_PONTO_START_CUSTOM_ID,
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
    throw new Error(text || "Falha ao enviar o embed de bate ponto.");
  }

  const dispatchedMessage = (await dispatchResponse.json()) as { id?: string };
  if (typeof dispatchedMessage.id === "string") {
    await updateStoredPanelMessageId(guildId, dispatchedMessage.id);
  }

  return {
    ok: true,
    mode: managedMessage ? "updated" : "created",
    channelId: panelChannelId,
    messageId: dispatchedMessage.id,
  };
}
