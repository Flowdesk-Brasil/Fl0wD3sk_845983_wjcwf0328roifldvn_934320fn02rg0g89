import { NextRequest, NextResponse } from "next/server";
import {
  fetchHostingGitHubProfile,
  hasHostingGitHubStoredToken,
  HostingGitHubNetworkError,
  hasHostingGitHubTokenCookie,
  isHostingGitHubConfigured,
  isPermanentHostingGitHubAuthError,
  markHostingGitHubTokenInvalid,
  readHostingGitHubToken,
  setHostingGitHubTokenCookie,
  storeHostingGitHubTokenForUser,
} from "@/lib/hosting/github";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";

export async function GET(request: NextRequest) {
  if (!isHostingGitHubConfigured()) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        connected: false,
        diagnostics: {
          configured: false,
          tokenPresent: false,
          storedTokenPresent: false,
          sessionPresent: false,
          accountsCount: 0,
        },
        message: "Configure GITHUB_CLIENT_ID e GITHUB_CLIENT_SECRET para ativar o GitHub real.",
      }),
    );
  }

  const session = await getCurrentAuthSessionFromCookie();
  const userId = session?.user?.id;
  const tokenPresent = await hasHostingGitHubTokenCookie();
  const storedTokenPresent = userId ? await hasHostingGitHubStoredToken(userId) : false;
  const sessionPresent = Boolean(userId);
  const token = await readHostingGitHubToken(userId);

  if (!token) {
    let message: string | undefined;
    if (tokenPresent) {
      message =
        "Encontrei um token local do GitHub, mas nao consegui valida-lo neste host. Tente reconectar.";
    } else if (storedTokenPresent && !sessionPresent) {
      message = "Sua conta GitHub esta salva, mas a sessao expirou. Faca login novamente.";
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        connected: false,
        accounts: [],
        diagnostics: {
          configured: true,
          tokenPresent,
          storedTokenPresent,
          sessionPresent,
          accountsCount: 0,
        },
        ...(message ? { message } : {}),
      }),
    );
  }

  try {
    const profile = await fetchHostingGitHubProfile(token);
    if (userId) {
      await storeHostingGitHubTokenForUser({
        userId,
        token,
        login: profile.user.login,
        accountType: profile.user.type,
        avatarUrl: profile.user.avatarUrl,
      }).catch(() => null);
    }
    const response = NextResponse.json({
      ok: true,
      connected: true,
      diagnostics: {
        configured: true,
        tokenPresent: true,
        storedTokenPresent: true,
        sessionPresent,
        accountsCount: profile.accounts.length,
      },
      ...profile,
    });
    setHostingGitHubTokenCookie(request, response, token);
    return applyNoStoreHeaders(response);
  } catch (error) {
    if (error instanceof HostingGitHubNetworkError) {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          connected: true,
          degraded: true,
          accounts: [],
          diagnostics: {
            configured: true,
            tokenPresent: true,
            storedTokenPresent: true,
            sessionPresent,
            accountsCount: 0,
          },
          message:
            "Sua conta GitHub esta vinculada, mas o GitHub demorou para responder. Tente continuar novamente em alguns segundos.",
        }),
      );
    }

    if (userId && isPermanentHostingGitHubAuthError(error)) {
      await markHostingGitHubTokenInvalid(
        userId,
        error instanceof Error ? error.message : "Falha ao validar GitHub.",
      ).catch(() => null);
    }
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: false,
        connected: false,
        accounts: [],
        diagnostics: {
          configured: true,
          tokenPresent: true,
          storedTokenPresent: true,
          sessionPresent,
          accountsCount: 0,
        },
        message: error instanceof Error ? error.message : "Nao foi possivel ler o GitHub.",
      }, { status: 502 }),
    );
  }
}
