import { authConfig } from "@/lib/auth/config";

type ExchangeGoogleCodeInput = {
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
};

export type GoogleTokenResponse = {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type: string;
};

export type GoogleUser = {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
  locale?: string | null;
};

const GOOGLE_AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_ENDPOINT = "https://openidconnect.googleapis.com/v1/userinfo";

function requireGoogleClientConfig() {
  if (!authConfig.googleClientId || !authConfig.googleClientSecret) {
    throw new Error("O login com Google ainda nao esta configurado neste ambiente.");
  }

  return {
    clientId: authConfig.googleClientId,
    clientSecret: authConfig.googleClientSecret,
  };
}

export function buildGoogleAuthorizeUrl(
  state: string,
  redirectUri: string,
  input?: {
    codeChallenge?: string | null;
    nonce?: string | null;
  },
) {
  const { clientId } = requireGoogleClientConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });

  if (input?.codeChallenge) {
    params.set("code_challenge", input.codeChallenge);
    params.set("code_challenge_method", "S256");
  }

  if (input?.nonce) {
    params.set("nonce", input.nonce);
  }

  return `${GOOGLE_AUTHORIZATION_ENDPOINT}?${params.toString()}`;
}

export async function exchangeGoogleCodeForToken({
  code,
  redirectUri,
  codeVerifier,
}: ExchangeGoogleCodeInput) {
  const { clientId, clientSecret } = requireGoogleClientConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao trocar codigo OAuth do Google: ${text}`);
  }

  const payload = (await response.json()) as GoogleTokenResponse;
  if (!payload.access_token) {
    throw new Error("Google nao retornou access_token.");
  }

  return payload;
}

export async function fetchGoogleUser(accessToken: string) {
  const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao buscar usuario Google: ${text}`);
  }

  const payload = (await response.json()) as GoogleUser;

  if (!payload.sub || !payload.email) {
    throw new Error("Google nao retornou os dados minimos do usuario.");
  }

  return payload;
}
