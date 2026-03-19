import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import {
  assertUserAdminInGuildOrNull,
  buildBotInviteUrl,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { updateSessionActiveGuild } from "@/lib/auth/session";

type ValidateGuildBody = {
  guildId?: unknown;
};

type DiscordGuildMember = {
  roles: string[];
  permissions?: string;
};

type DiscordGuildRole = {
  id: string;
  permissions: string;
};

type BotGuildStatus = {
  inGuild: boolean;
  hasAdministrator: boolean;
};

const DISCORD_ADMINISTRATOR = BigInt(8);

async function getBotGuildStatus(guildId: string): Promise<BotGuildStatus> {
  const botToken = process.env.DISCORD_BOT_TOKEN || process.env.DISCORD_TOKEN;
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN nao configurado no ambiente do site.");
  }

  const memberResponse = await fetch(
    `https://discord.com/api/guilds/${guildId}/members/${authConfig.discordClientId}`,
    {
      headers: {
        Authorization: `Bot ${botToken}`,
      },
      cache: "no-store",
    },
  );

  if (memberResponse.status === 404 || memberResponse.status === 403) {
    return { inGuild: false, hasAdministrator: false };
  }

  if (!memberResponse.ok) {
    const text = await memberResponse.text();
    throw new Error(`Falha ao validar bot no servidor: ${text}`);
  }

  const member = (await memberResponse.json()) as DiscordGuildMember;

  if (member.permissions) {
    try {
      const bits = BigInt(member.permissions);
      return {
        inGuild: true,
        hasAdministrator:
          (bits & DISCORD_ADMINISTRATOR) === DISCORD_ADMINISTRATOR,
      };
    } catch {
      // Continua para validacao por roles.
    }
  }

  const rolesResponse = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, {
    headers: {
      Authorization: `Bot ${botToken}`,
    },
    cache: "no-store",
  });

  if (rolesResponse.status === 403) {
    return { inGuild: true, hasAdministrator: false };
  }

  if (!rolesResponse.ok) {
    const text = await rolesResponse.text();
    throw new Error(`Falha ao validar permissoes do bot: ${text}`);
  }

  const roles = (await rolesResponse.json()) as DiscordGuildRole[];
  const roleMap = new Map(roles.map((role) => [role.id, role]));
  const memberRoleIds = new Set<string>([guildId, ...(member.roles || [])]);
  let aggregatePermissions = BigInt(0);

  for (const roleId of memberRoleIds) {
    const role = roleMap.get(roleId);
    if (!role) continue;

    try {
      aggregatePermissions |= BigInt(role.permissions);
    } catch {
      // Ignora role com permissao invalida.
    }
  }

  return {
    inGuild: true,
    hasAdministrator:
      (aggregatePermissions & DISCORD_ADMINISTRATOR) === DISCORD_ADMINISTRATOR,
  };
}

export async function POST(request: Request) {
  try {
    const sessionData = await resolveSessionAccessToken();
    if (!sessionData?.authSession) {
      return NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      );
    }

    if (!sessionData.accessToken) {
      return NextResponse.json(
        { ok: false, message: "Token OAuth ausente na sessao." },
        { status: 401 },
      );
    }

    let body: ValidateGuildBody = {};
    try {
      body = (await request.json()) as ValidateGuildBody;
    } catch {
      return NextResponse.json(
        { ok: false, message: "Payload JSON invalido." },
        { status: 400 },
      );
    }

    const guildId = typeof body.guildId === "string" ? body.guildId.trim() : "";
    if (!isGuildId(guildId)) {
      return NextResponse.json(
        { ok: false, message: "Guild ID invalido." },
        { status: 400 },
      );
    }

    const accessibleGuild = await assertUserAdminInGuildOrNull(
      {
        authSession: sessionData.authSession,
        accessToken: sessionData.accessToken,
      },
      guildId,
    );

    const isActiveGuild = sessionData.authSession.activeGuildId === guildId;
    if (!accessibleGuild && !isActiveGuild) {
      return NextResponse.json(
        { ok: false, message: "Servidor nao encontrado para este usuario." },
        { status: 403 },
      );
    }

    if (sessionData.authSession.activeGuildId !== guildId) {
      await updateSessionActiveGuild(sessionData.authSession.id, guildId);
    }

    const botStatus = await getBotGuildStatus(guildId);
    if (botStatus.inGuild && botStatus.hasAdministrator) {
      return NextResponse.json({ ok: true, canProceed: true });
    }

    return NextResponse.json({
      ok: true,
      canProceed: false,
      reason: botStatus.inGuild ? "missing_admin_permission" : "bot_not_found",
      inviteUrl: buildBotInviteUrl(guildId),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao validar presenca do bot no servidor.",
      },
      { status: 500 },
    );
  }
}
