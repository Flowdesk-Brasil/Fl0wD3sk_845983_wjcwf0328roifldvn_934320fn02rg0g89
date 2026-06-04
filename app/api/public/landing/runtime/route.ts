import { NextResponse } from "next/server";
import {
  getCurrentAuthSessionFromCookieSafe,
} from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { checkSupabaseReadAvailability } from "@/lib/supabase/availability";
import { resolveAuthUserAvatarUrl } from "@/lib/auth/avatar";

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
        avatarUrl: resolveAuthUserAvatarUrl(sessionResult.session.user),
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
