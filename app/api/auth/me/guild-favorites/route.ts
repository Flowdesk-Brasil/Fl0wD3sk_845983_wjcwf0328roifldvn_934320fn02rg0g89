import { NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type GuildFavoritesPayload = {
  favoriteGuildIds?: unknown;
};

const MAX_FAVORITE_GUILDS = 100;
const DISCORD_GUILD_ID_REGEX = /^\d{10,25}$/;

function normalizeFavoriteGuildIds(input: unknown) {
  if (!Array.isArray(input)) return [];

  const unique = new Set<string>();

  for (const value of input) {
    if (typeof value !== "string") continue;

    const guildId = value.trim();
    if (!DISCORD_GUILD_ID_REGEX.test(guildId)) continue;

    unique.add(guildId);
    if (unique.size >= MAX_FAVORITE_GUILDS) break;
  }

  return Array.from(unique);
}

export async function GET() {
  try {
    const authSession = await getCurrentAuthSessionFromCookie();
    if (!authSession) {
      return NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      );
    }

    const supabase = getSupabaseAdminClientOrThrow();
    const result = await supabase
      .from("auth_user_favorite_guilds")
      .select("guild_id, sort_order")
      .eq("user_id", authSession.user.id)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (result.error) {
      throw new Error(result.error.message);
    }

    return NextResponse.json({
      ok: true,
      favoriteGuildIds: (result.data || []).map((row) => row.guild_id),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Erro ao carregar favoritos.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const authSession = await getCurrentAuthSessionFromCookie();
    if (!authSession) {
      return NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      );
    }

    let body: GuildFavoritesPayload = {};

    try {
      body = (await request.json()) as GuildFavoritesPayload;
    } catch {
      return NextResponse.json(
        { ok: false, message: "Payload JSON invalido." },
        { status: 400 },
      );
    }

    const favoriteGuildIds = normalizeFavoriteGuildIds(body.favoriteGuildIds);
    const supabase = getSupabaseAdminClientOrThrow();

    const deleteResult = await supabase
      .from("auth_user_favorite_guilds")
      .delete()
      .eq("user_id", authSession.user.id);

    if (deleteResult.error) {
      throw new Error(deleteResult.error.message);
    }

    if (favoriteGuildIds.length) {
      const rows = favoriteGuildIds.map((guildId, index) => ({
        user_id: authSession.user.id,
        guild_id: guildId,
        sort_order: index,
      }));

      const insertResult = await supabase
        .from("auth_user_favorite_guilds")
        .insert(rows);

      if (insertResult.error) {
        throw new Error(insertResult.error.message);
      }
    }

    return NextResponse.json({
      ok: true,
      favoriteGuildIds,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Erro ao salvar favoritos.",
      },
      { status: 500 },
    );
  }
}
