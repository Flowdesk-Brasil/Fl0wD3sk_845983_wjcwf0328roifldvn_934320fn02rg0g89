import { NextResponse } from "next/server";
import {
  getAccessibleGuildsForSession,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";

function buildGuildIconUrl(guildId: string, icon: string | null) {
  if (!icon) return null;

  const extension = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${extension}?size=64`;
}

export async function GET() {
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

    const guilds = (await getAccessibleGuildsForSession({
      authSession: sessionData.authSession,
      accessToken: sessionData.accessToken,
    })).map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon_url: buildGuildIconUrl(guild.id, guild.icon),
      owner: guild.owner,
      admin: true,
    }));

    return NextResponse.json({
      ok: true,
      user: {
        discord_user_id: sessionData.authSession.user.discord_user_id,
        display_name: sessionData.authSession.user.display_name,
      },
      guilds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Erro ao listar servidores do usuario.",
      },
      { status: 500 },
    );
  }
}
