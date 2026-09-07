import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { buildLauncherBindGuildCookie } from "@/lib/launcher/auth";
import {
  LAUNCHER_SETUP_FILE_NAME,
  resolveLauncherArtifactUrl,
} from "@/lib/launcher/updateFeed";

export async function GET(request: Request) {
  const artifact = await resolveLauncherArtifactUrl(LAUNCHER_SETUP_FILE_NAME);
  const requestUrl = new URL(request.url);
  const guildId = requestUrl.searchParams.get("guildId") || "";
  const bindCookie = buildLauncherBindGuildCookie(guildId, requestUrl.hostname);
  const wantsRedirect = requestUrl.searchParams.get("redirect") === "1";

  if (!artifact?.url) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            "O instalador ainda esta sendo publicado. O GitHub Actions gera o FlowdeskLauncher-Setup.exe no merge.",
        },
        { status: 404 },
      ),
    );
  }

  if (wantsRedirect) {
    const response = NextResponse.redirect(artifact.url, 302);
    if (bindCookie) response.headers.set("Set-Cookie", bindCookie);
    return applyNoStoreHeaders(response);
  }

  const response = NextResponse.json({
    ok: true,
    url: artifact.url,
    fileName: LAUNCHER_SETUP_FILE_NAME,
  });
  if (bindCookie) response.headers.set("Set-Cookie", bindCookie);
  return applyNoStoreHeaders(response);
}
