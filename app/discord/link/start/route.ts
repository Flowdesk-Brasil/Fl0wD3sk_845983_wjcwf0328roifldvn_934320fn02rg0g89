import { NextRequest, NextResponse } from "next/server";
import {
  createDiscordLinkAccessToken,
  getDiscordLinkAccessCookieName,
  getDiscordLinkAccessQueryParam,
} from "@/lib/discordLink/linkAccess";
import { OFFICIAL_DISCORD_LINK_PATH } from "@/lib/discordLink/config";
import { applyNoStoreHeaders } from "@/lib/security/http";

export async function GET(request: NextRequest) {
  const { token, payload } = createDiscordLinkAccessToken();
  const redirectUrl = new URL(OFFICIAL_DISCORD_LINK_PATH, request.url);
  redirectUrl.searchParams.set(getDiscordLinkAccessQueryParam(), token);

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set(getDiscordLinkAccessCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    expires: new Date(payload.exp),
    path: "/",
  });

  return applyNoStoreHeaders(response);
}
