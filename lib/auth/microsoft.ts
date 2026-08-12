import { authConfig } from "@/lib/auth/config";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type ExchangeMicrosoftCodeInput = {
  code: string;
  redirectUri: string;
  codeVerifier?: string | null;
};

export type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
};

type MicrosoftGraphMeResponse = {
  id?: string;
  displayName?: string;
  givenName?: string;
  surname?: string;
  mail?: string | null;
  userPrincipalName?: string | null;
  preferredLanguage?: string | null;
};

export type MicrosoftUser = {
  id: string;
  displayName: string | null;
  givenName: string | null;
  surname: string | null;
  email: string;
  preferredLanguage: string | null;
  avatarUrl: string | null;
};

const MICROSOFT_AUTHORIZE_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_GRAPH_ME_ENDPOINT =
  "https://graph.microsoft.com/v1.0/me?$select=id,displayName,givenName,surname,mail,userPrincipalName,preferredLanguage";
const MICROSOFT_GRAPH_PHOTO_ENDPOINT =
  "https://graph.microsoft.com/v1.0/me/photo/$value";
const MICROSOFT_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read"];
const MICROSOFT_PHOTO_BUCKET = "account-avatars";
const MICROSOFT_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const MICROSOFT_PHOTO_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function requireMicrosoftClientConfig() {
  if (!authConfig.microsoftClientId || !authConfig.microsoftClientSecret) {
    throw new Error("O login com Microsoft ainda nao esta configurado neste ambiente.");
  }

  return {
    clientId: authConfig.microsoftClientId,
    clientSecret: authConfig.microsoftClientSecret,
  };
}

export function buildMicrosoftAuthorizeUrl(
  state: string,
  redirectUri: string,
  input?: {
    codeChallenge?: string | null;
    nonce?: string | null;
  },
) {
  const { clientId } = requireMicrosoftClientConfig();
  const url = new URL(MICROSOFT_AUTHORIZE_ENDPOINT);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPES.join(" "));
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);

  if (input?.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }

  if (input?.nonce) {
    url.searchParams.set("nonce", input.nonce);
  }

  return url.toString();
}

export async function exchangeMicrosoftCodeForToken({
  code,
  redirectUri,
  codeVerifier,
}: ExchangeMicrosoftCodeInput) {
  const { clientId, clientSecret } = requireMicrosoftClientConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

  if (codeVerifier) {
    body.set("code_verifier", codeVerifier);
  }

  const response = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao trocar codigo OAuth da Microsoft: ${text}`);
  }

  const payload = (await response.json()) as MicrosoftTokenResponse;
  if (!payload.access_token) {
    throw new Error("Microsoft nao retornou access_token.");
  }

  return payload;
}

export async function fetchMicrosoftUser(accessToken: string) {
  const response = await fetch(MICROSOFT_GRAPH_ME_ENDPOINT, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Falha ao buscar usuario Microsoft: ${text}`);
  }

  const payload = (await response.json()) as MicrosoftGraphMeResponse;
  const email = payload.mail?.trim() || payload.userPrincipalName?.trim() || "";

  if (!payload.id || !email) {
    throw new Error("Microsoft nao retornou os dados minimos do usuario.");
  }

  return {
    id: payload.id,
    displayName: payload.displayName?.trim() || null,
    givenName: payload.givenName?.trim() || null,
    surname: payload.surname?.trim() || null,
    email,
    preferredLanguage: payload.preferredLanguage?.trim() || null,
    avatarUrl: null,
  } satisfies MicrosoftUser;
}

async function fetchMicrosoftUserPhoto(accessToken: string) {
  const response = await fetch(MICROSOFT_GRAPH_PHOTO_ENDPOINT, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (response.status === 404) return null;
  if (!response.ok) return null;

  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";
  if (!MICROSOFT_PHOTO_CONTENT_TYPES.has(contentType)) return null;

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MICROSOFT_PHOTO_MAX_BYTES) {
    return null;
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > MICROSOFT_PHOTO_MAX_BYTES) return null;

  return {
    buffer,
    contentType,
    extension: contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg",
  };
}

export async function syncMicrosoftProfilePhotoForAuthUser(
  userId: number,
  accessToken: string,
) {
  const photo = await fetchMicrosoftUserPhoto(accessToken);
  if (!photo) return null;

  const supabase = getSupabaseAdminClientOrThrow();
  const userResult = await supabase
    .from("auth_users")
    .select("profile_avatar_url, profile_avatar_source")
    .eq("id", userId)
    .maybeSingle<{
      profile_avatar_url: string | null;
      profile_avatar_source: string | null;
    }>();

  if (userResult.error) throw new Error(userResult.error.message);
  if (userResult.data?.profile_avatar_source === "upload") {
    return userResult.data.profile_avatar_url || null;
  }

  const folder = String(userId);
  const path = `${folder}/microsoft-${Date.now()}.${photo.extension}`;
  const upload = await supabase.storage
    .from(MICROSOFT_PHOTO_BUCKET)
    .upload(path, photo.buffer, {
      contentType: photo.contentType,
      cacheControl: "31536000",
      upsert: false,
    });
  if (upload.error) throw new Error(upload.error.message);

  const publicUrl = supabase.storage
    .from(MICROSOFT_PHOTO_BUCKET)
    .getPublicUrl(path).data.publicUrl;

  const [updateResult, providerResult] = await Promise.all([
    supabase
      .from("auth_users")
      .update({
        profile_avatar_url: publicUrl,
        profile_avatar_source: "microsoft",
        profile_avatar_updated_at: new Date().toISOString(),
      })
      .eq("id", userId),
    supabase
      .from("auth_user_provider_profiles")
      .update({
        provider_avatar_url: publicUrl,
      })
      .eq("user_id", userId)
      .eq("provider", "microsoft"),
  ]);

  if (updateResult.error || providerResult.error) {
    await supabase.storage.from(MICROSOFT_PHOTO_BUCKET).remove([path]);
    throw new Error(updateResult.error?.message || providerResult.error?.message);
  }

  const existingFiles = await supabase.storage
    .from(MICROSOFT_PHOTO_BUCKET)
    .list(folder);
  const staleMicrosoftPhotos = (existingFiles.data || [])
    .filter((entry) => entry.name.startsWith("microsoft-") && `${folder}/${entry.name}` !== path)
    .map((entry) => `${folder}/${entry.name}`);
  if (staleMicrosoftPhotos.length) {
    await supabase.storage.from(MICROSOFT_PHOTO_BUCKET).remove(staleMicrosoftPhotos);
  }

  return publicUrl;
}
