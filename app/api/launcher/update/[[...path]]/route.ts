import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import {
  LAUNCHER_SETUP_FILE_NAME,
  resolveLauncherArtifactUrl,
  resolveLauncherUpdateYml,
} from "@/lib/launcher/updateFeed";

export async function GET(
  _request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  const params = await context.params;
  const fileName = (params.path || []).join("/") || "latest.yml";

  if (!fileName || fileName === "latest.yml") {
    const yml = await resolveLauncherUpdateYml();
    if (!yml) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Nenhuma atualizacao do launcher foi publicada ainda." },
          { status: 404 },
        ),
      );
    }
    return applyNoStoreHeaders(
      new NextResponse(yml, {
        status: 200,
        headers: {
          "Content-Type": "text/yaml; charset=utf-8",
          "Cache-Control": "public, max-age=60",
        },
      }),
    );
  }

  const safeName = fileName.replace(/\\/g, "/").split("/").pop() || "";
  if (!/^[A-Za-z0-9._-]+$/.test(safeName)) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Arquivo invalido." }, { status: 400 }),
    );
  }

  const artifact = await resolveLauncherArtifactUrl(safeName);
  if (!artifact) {
    return applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: "Atualizacao do launcher nao encontrada." },
        { status: 404 },
      ),
    );
  }
  if (artifact.kind === "url") {
    return applyNoStoreHeaders(NextResponse.redirect(artifact.url, 302));
  }

  const { size } = statSync(artifact.path);
  const stream = createReadStream(artifact.path);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${safeName || LAUNCHER_SETUP_FILE_NAME}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
