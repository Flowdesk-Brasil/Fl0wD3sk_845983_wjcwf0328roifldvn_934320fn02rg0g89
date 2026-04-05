import { NextResponse } from "next/server";
import {
  getAccessibleGuildsForSession,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import { getLockedGuildLicenseMap } from "@/lib/payments/licenseStatus";
import { sanitizeErrorMessage } from "@/lib/security/errors";

function buildGuildIconUrl(guildId: string, icon: string | null) {
  if (!icon) return null;

  const extension = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${guildId}/${icon}.${extension}?size=64`;
}

export async function GET(request: Request) {
  try {
    const sessionData = await resolveSessionAccessToken();
    const url = new URL(request.url);
    const excludePaid =
      url.searchParams.get("excludePaid") === "1" ||
      url.searchParams.get("excludePaid") === "true";

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

    let guilds = (await getAccessibleGuildsForSession({
      authSession: sessionData.authSession,
      accessToken: sessionData.accessToken,
    })).map((guild) => ({
      id: guild.id,
      name: guild.name,
      icon_url: buildGuildIconUrl(guild.id, guild.icon),
      owner: guild.owner,
      admin: true,
    }));

    if (excludePaid) {
      const lockedGuilds = await getLockedGuildLicenseMap(
        guilds.map((guild) => guild.id),
      );
      guilds = guilds.filter((guild) => !lockedGuilds.has(guild.id));
    }

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
        message: sanitizeErrorMessage(
          error,
          "Erro ao listar servidores do usuario.",
        ),
      },
      { status: 500 },
    );
  }
}
