import { NextResponse } from "next/server";
import {
  getCurrentAuthSessionFromCookieSafe,
} from "@/lib/auth/session";
import {
  applyNoStoreHeaders,
  ensureFirstPartyPublicReadRequest,
} from "@/lib/security/http";
import { resolveAuthUserAvatarUrl } from "@/lib/auth/avatar";

export async function GET(request: Request) {
  const originGuard = ensureFirstPartyPublicReadRequest(request);
  if (originGuard) return originGuard;

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
