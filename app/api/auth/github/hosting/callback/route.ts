import { NextRequest, NextResponse } from "next/server";
import {
  clearHostingGitHubStateCookie,
  createHostingGitHubHandoffTokenBundle,
  exchangeHostingGitHubCode,
  fetchHostingGitHubProfile,
  isHostingGitHubConfigured,
  readHostingGitHubStatePayload,
  readHostingGitHubStateCookie,
  resolveHostingGitHubRelayOrigin,
  setHostingGitHubTokenCookie,
  storeHostingGitHubTokenForUser,
  validateHostingGitHubState,
} from "@/lib/hosting/github";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { applyNoStoreHeaders } from "@/lib/security/http";

const HANDOFF_STORAGE_KEY = "flowdesk_hosting_github_handoff_v1";

type PopupGitHubAccount = {
  login: string;
  avatarUrl: string | null;
};

function popupHtml(input: {
  ok: boolean;
  message: string;
  handoffToken?: string | null;
  user?: PopupGitHubAccount | null;
  accounts?: PopupGitHubAccount[];
}) {
  const payload = {
    source: "flowdesk-hosting-github",
    ...input,
  };

  return new NextResponse(
    `<!doctype html><html><body><script>
      const payload = ${JSON.stringify(payload)};
      const storagePayload = JSON.stringify({ ...payload, storedAt: Date.now() });
      try {
        window.opener?.postMessage(payload, "*");
      } catch {}
      try {
        window.opener?.localStorage?.setItem(${JSON.stringify(HANDOFF_STORAGE_KEY)}, storagePayload);
      } catch {}
      try {
        window.localStorage?.setItem(${JSON.stringify(HANDOFF_STORAGE_KEY)}, storagePayload);
      } catch {}
      window.setTimeout(() => window.close(), 250);
    </script>${input.message}</body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    },
  );
}

function popupRelayHtml(
  returnOrigin: string | null,
  input: {
    ok: boolean;
    message: string;
    handoffToken?: string | null;
    user?: PopupGitHubAccount | null;
    accounts?: PopupGitHubAccount[];
  },
) {
  if (!returnOrigin) return popupHtml(input);

  const relayUrl = new URL("/api/auth/github/hosting/relay", returnOrigin);
  const payload = {
    source: "flowdesk-hosting-github",
    ...input,
  };
  const hash = new URLSearchParams({
    payload: JSON.stringify(payload),
  });

  return new NextResponse(
    `<!doctype html><html><body><script>
      window.location.replace(${JSON.stringify(`${relayUrl.toString()}#${hash.toString()}`)});
    </script>${input.message}</body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() || "";
  const state = request.nextUrl.searchParams.get("state")?.trim() || "";
  const expectedState = await readHostingGitHubStateCookie();

  if (!isHostingGitHubConfigured()) {
    return applyNoStoreHeaders(
      popupHtml({ ok: false, message: "GitHub OAuth nao configurado." }),
    );
  }

  const stateMatchesCookie = Boolean(expectedState && state === expectedState);
  const stateMatchesSignedPayload = validateHostingGitHubState(state);
  const statePayload = readHostingGitHubStatePayload(state);
  const relayOrigin = resolveHostingGitHubRelayOrigin(request, statePayload);

  if (!code || !state || (!stateMatchesCookie && !stateMatchesSignedPayload)) {
    return applyNoStoreHeaders(
      popupHtml({
        ok: false,
        message:
          "Validacao de seguranca do GitHub falhou. Reabra a conexao pelo painel.",
      }),
    );
  }

  try {
    const tokenBundle = await exchangeHostingGitHubCode({ code, request });
    const session = await getCurrentAuthSessionFromCookie().catch(() => null);
    let popupUser: PopupGitHubAccount | null = null;
    let popupAccounts: PopupGitHubAccount[] = [];
    const profile = await fetchHostingGitHubProfile(tokenBundle.accessToken).catch(() => null);
    if (profile) {
      popupUser = {
        login: profile.user.login,
        avatarUrl: profile.user.avatarUrl,
      };
      popupAccounts = profile.accounts.map((account) => ({
        login: account.login,
        avatarUrl: account.avatarUrl,
      }));
    }
    if (session?.user?.id) {
      await (
        profile
          ? storeHostingGitHubTokenForUser({
            userId: session.user.id,
            token: tokenBundle.accessToken,
            refreshToken: tokenBundle.refreshToken,
            accessTokenExpiresAt: tokenBundle.accessTokenExpiresAt,
            refreshTokenExpiresAt: tokenBundle.refreshTokenExpiresAt,
            scope: tokenBundle.scope,
            tokenType: tokenBundle.tokenType,
            login: profile.user.login,
            accountType: profile.user.type,
            avatarUrl: profile.user.avatarUrl,
          })
          : Promise.resolve()
      ).catch(() => null);
    }
    const handoffToken = createHostingGitHubHandoffTokenBundle(tokenBundle);
    const response = popupRelayHtml(relayOrigin, {
      ok: true,
      message: "GitHub conectado com sucesso.",
      handoffToken,
      user: popupUser,
      accounts: popupAccounts,
    });
    setHostingGitHubTokenCookie(request, response, tokenBundle.accessToken);
    clearHostingGitHubStateCookie(request, response);
    return applyNoStoreHeaders(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha ao conectar GitHub.";
    const response = popupRelayHtml(relayOrigin, { ok: false, message });
    clearHostingGitHubStateCookie(request, response);
    return applyNoStoreHeaders(response);
  }
}
