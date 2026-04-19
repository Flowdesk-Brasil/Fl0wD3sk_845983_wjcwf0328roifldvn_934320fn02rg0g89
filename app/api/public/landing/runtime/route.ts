import { NextResponse } from "next/server";
import {
  getCurrentAuthSessionFromCookieSafe,
} from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { checkSupabaseReadAvailability } from "@/lib/supabase/availability";

function buildDiscordAvatarUrl(
  discordUserId: string | null,
  avatarHash: string | null,
) {
  if (!avatarHash || !discordUserId) return null;
  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=96`;
}

export async function GET() {
  const databaseAvailable = await checkSupabaseReadAvailability();

  if (!databaseAvailable) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        databaseAvailable: false,
        authenticatedUser: null,
      }),
    );
  }

  const sessionResult = await getCurrentAuthSessionFromCookieSafe();
  const authenticatedUser = sessionResult.session
    ? {
        username: sessionResult.session.user.username,
        avatarUrl: buildDiscordAvatarUrl(
          sessionResult.session.user.discord_user_id,
          sessionResult.session.user.avatar,
        ),
        href: "/dashboard",
      }
    : null;

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      databaseAvailable: !sessionResult.degraded,
      authenticatedUser,
    }),
  );
}
