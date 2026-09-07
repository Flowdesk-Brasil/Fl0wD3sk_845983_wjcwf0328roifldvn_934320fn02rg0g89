import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { buildLauncherBindGuildCookie } from "@/lib/launcher/auth";
import {
  LAUNCHER_SETUP_FILE_NAME,
  resolveLauncherArtifactUrl,
} from "@/lib/launcher/updateFeed";

const FILE_NAME = LAUNCHER_SETUP_FILE_NAME;

export async function GET(request: Request) {
  const artifact = await resolveLauncherArtifactUrl(FILE_NAME);
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
  if (artifact.kind === "url") {
    const response = NextResponse.redirect(artifact.url, 302);
    if (bindCookie) response.headers.set("Set-Cookie", bindCookie);
    return applyNoStoreHeaders(response);
  }
  const filePath = artifact.path;
  const { size } = statSync(filePath);
  const stream = createReadStream(filePath);
  const webStream = Readable.toWeb(stream) as unknown as ReadableStream;
  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${FILE_NAME}"`,
      "Cache-Control": "private, no-store",
      ...(bindCookie ? { "Set-Cookie": bindCookie } : {}),
    },
  });
}
