import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  isHostingGitHubConfigured,
  readHostingGitHubToken,
} from "@/lib/hosting/github";
import { inspectHostingRepository } from "@/lib/hosting/inspectRepository";
import { applyNoStoreHeaders } from "@/lib/security/http";

export async function GET(request: NextRequest) {
  if (!isHostingGitHubConfigured()) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "GitHub OAuth nao configurado." }, { status: 503 }),
    );
  }

  const session = await getCurrentAuthSessionFromCookie();
  const token = await readHostingGitHubToken(session?.user?.id);
  if (!session?.user?.id || !token) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Conecte sua conta GitHub primeiro." }, { status: 401 }),
    );
  }

  const owner = request.nextUrl.searchParams.get("owner")?.trim() || "";
  const repo = request.nextUrl.searchParams.get("repo")?.trim() || "";
  const branch = request.nextUrl.searchParams.get("branch")?.trim() || "main";
  if (!owner || !repo) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Repositorio invalido." }, { status: 400 }),
    );
  }

  try {
    const inspected = await inspectHostingRepository({ token, owner, repo, branch });
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        framework: inspected.framework,
        packageName: inspected.packageName,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        message: error instanceof Error ? error.message : "Nao foi possivel ler o repositorio.",
      }, { status: 502 }),
    );
  }
}
