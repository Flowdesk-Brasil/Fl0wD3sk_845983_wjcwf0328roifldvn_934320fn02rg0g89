import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { buildLauncherBindGuildCookie } from "@/lib/launcher/auth";
import {
  LAUNCHER_SETUP_FILE_NAME,
  resolveLauncherArtifactUrl,
} from "@/lib/launcher/updateFeed";

export async function GET(request: Request) {
  const artifact = await resolveLauncherArtifactUrl(LAUNCHER_SETUP_FILE_NAME, request.url);
  if (!artifact) {
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
  const requestUrl = new URL(request.url);
  const guildId = requestUrl.searchParams.get("guildId") || "";
  const bindCookie = buildLauncherBindGuildCookie(guildId, requestUrl.hostname);
  const response = NextResponse.redirect(artifact.url, 302);
  if (bindCookie) response.headers.set("Set-Cookie", bindCookie);
  return applyNoStoreHeaders(response);
}
