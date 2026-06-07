import { NextRequest, NextResponse } from "next/server";
import {
  consumeHostingGitHubHandoffTokenBundle,
  fetchHostingGitHubProfile,
  readHostingGitHubToken,
  setHostingGitHubTokenCookie,
  storeHostingGitHubTokenForUser,
} from "@/lib/hosting/github";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";

type CompleteGitHubBody = {
  handoffToken?: unknown;
};

export async function POST(request: NextRequest) {
  let body: CompleteGitHubBody;
  try {
    body = await request.json() as CompleteGitHubBody;
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        connected: false,
        message: "Payload invalido ao concluir GitHub.",
      }, { status: 400 }),
    );
  }

  const session = await getCurrentAuthSessionFromCookie();
  const tokenBundle = consumeHostingGitHubHandoffTokenBundle(body.handoffToken);
  const fallbackToken = tokenBundle ? null : await readHostingGitHubToken(session?.user?.id);
  const accessToken = tokenBundle?.accessToken || fallbackToken;
  if (!accessToken) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        connected: false,
        message: "GitHub ainda esta confirmando a autorizacao. Aguarde alguns segundos ou consulte o status novamente.",
      }, { status: 202 }),
    );
  }

  try {
    const profile = await fetchHostingGitHubProfile(accessToken);
    if (session?.user?.id) {
      await storeHostingGitHubTokenForUser({
        userId: session.user.id,
        token: accessToken,
        refreshToken: tokenBundle?.refreshToken,
        accessTokenExpiresAt: tokenBundle?.accessTokenExpiresAt,
        refreshTokenExpiresAt: tokenBundle?.refreshTokenExpiresAt,
        scope: tokenBundle?.scope,
        tokenType: tokenBundle?.tokenType,
        login: profile.user.login,
        accountType: profile.user.type,
        avatarUrl: profile.user.avatarUrl,
      }).catch(() => null);
    }
    const response = NextResponse.json({
      ok: true,
      connected: true,
      ...profile,
    });
    setHostingGitHubTokenCookie(request, response, accessToken);
    return applyNoStoreHeaders(response);
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        connected: false,
        message: error instanceof Error ? error.message : "Nao foi possivel validar o GitHub.",
      }, { status: 502 }),
    );
  }
}

