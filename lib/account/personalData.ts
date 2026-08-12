import { resolveAuthUserAvatarUrl } from "@/lib/auth/avatar";
import {
  fetchHostingGitHubProfile,
  readHostingGitHubToken,
  revokeHostingGitHubConnectionForUser,
  storeHostingGitHubTokenForUser,
} from "@/lib/hosting/github";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

export type LinkedAccountProvider = "discord" | "google" | "microsoft" | "github";

type ProviderProfileRow = {
  provider: LinkedAccountProvider;
  provider_user_id: string;
  provider_email: string | null;
  provider_display_name: string | null;
  provider_avatar_url: string | null;
  linked_at: string;
};

type PersonalDataUserRow = {
  id: number;
  display_name: string;
  username: string;
  email: string | null;
  email_verified_at: string | null;
  discord_user_id: string | null;
  google_user_id: string | null;
  microsoft_user_id: string | null;
  avatar: string | null;
  profile_avatar_url: string | null;
  profile_avatar_source: string | null;
};

type GitHubConnectionRow = {
  github_login: string | null;
  github_avatar_url: string | null;
  encrypted_token: string | null;
  token_status: string | null;
  created_at: string;
};

function providerLabel(provider: LinkedAccountProvider) {
  if (provider === "discord") return "Discord";
  if (provider === "google") return "Google";
  if (provider === "microsoft") return "Microsoft";
  return "GitHub";
}

export async function getAccountPersonalData(userId: number) {
  const supabase = getSupabaseAdminClientOrThrow();
  const [
    userResult,
    credentialResult,
    providerProfilesResult,
    githubResult,
    passkeysResult,
    totpResult,
  ] = await Promise.all([
    supabase
      .from("auth_users")
      .select("id, display_name, username, email, email_verified_at, discord_user_id, google_user_id, microsoft_user_id, avatar, profile_avatar_url, profile_avatar_source")
      .eq("id", userId)
      .single<PersonalDataUserRow>(),
    supabase
      .from("auth_user_credentials")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle<{ user_id: number }>(),
    supabase
      .from("auth_user_provider_profiles")
      .select("provider, provider_user_id, provider_email, provider_display_name, provider_avatar_url, linked_at")
      .eq("user_id", userId)
      .returns<ProviderProfileRow[]>(),
    supabase
      .from("hosting_github_connections")
      .select("github_login, github_avatar_url, encrypted_token, token_status, created_at")
      .eq("user_id", userId)
      .maybeSingle<GitHubConnectionRow>(),
    supabase
      .from("auth_user_passkeys")
      .select("id, name, device_type, backed_up, created_at, last_used_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("auth_user_totp")
      .select("enabled, verified_at")
      .eq("user_id", userId)
      .maybeSingle<{ enabled: boolean; verified_at: string | null }>(),
  ]);

  if (userResult.error || !userResult.data) {
    throw new Error(userResult.error?.message || "Conta nao encontrada.");
  }

  const user = userResult.data;
  const profiles = new Map(
    (providerProfilesResult.data || []).map((profile) => [profile.provider, profile]),
  );
  let githubConnection = githubResult.data || null;
  const githubRevokedByUser =
    githubConnection?.token_status === "revoked" ||
    githubConnection?.token_status === "invalid";
  if (!githubRevokedByUser && !githubConnection?.encrypted_token) {
    const token = await readHostingGitHubToken(userId).catch(() => null);
    if (token) {
      const profile = await fetchHostingGitHubProfile(token).catch(() => null);
      if (profile) {
        await storeHostingGitHubTokenForUser({
          userId,
          token,
          login: profile.user.login,
          accountType: profile.user.type,
          avatarUrl: profile.user.avatarUrl,
        }).catch(() => null);
        githubConnection = {
          github_login: profile.user.login,
          github_avatar_url: profile.user.avatarUrl,
          encrypted_token: "synced",
          token_status: "active",
          created_at: new Date().toISOString(),
        };
      }
    }
  }
  const githubConnected = Boolean(
    githubConnection?.encrypted_token &&
      githubConnection.token_status !== "revoked" &&
      githubConnection.token_status !== "invalid",
  );
  const nativeConnected = Boolean(credentialResult.data);
  const signInCount =
    Number(nativeConnected) +
    Number(Boolean(user.discord_user_id)) +
    Number(Boolean(user.google_user_id)) +
    Number(Boolean(user.microsoft_user_id));

  const providers = ([
    ["discord", Boolean(user.discord_user_id)],
    ["google", Boolean(user.google_user_id)],
    ["microsoft", Boolean(user.microsoft_user_id)],
    ["github", githubConnected],
  ] as const).map(([provider, linked]) => {
    const profile = profiles.get(provider);
    const github = provider === "github" ? githubConnection : null;
    return {
      id: provider,
      label: providerLabel(provider),
      linked,
      canUnlink: provider === "github" || (linked && signInCount > 1),
      identifier:
        profile?.provider_email ||
        profile?.provider_display_name ||
        github?.github_login ||
        null,
      avatarUrl: profile?.provider_avatar_url || github?.github_avatar_url || null,
      linkedAt: profile?.linked_at || github?.created_at || null,
      purpose: provider === "github" ? "Acesso a projetos VPS" : "Metodo de entrada",
    };
  });

  return {
    profile: {
      authUserId: user.id,
      displayName: user.display_name,
      username: user.username,
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      avatarUrl: resolveAuthUserAvatarUrl(user),
      avatarSource: user.profile_avatar_source,
    },
    nativeConnected,
    providers,
    security: {
      totpEnabled: Boolean(totpResult.data?.enabled),
      totpVerifiedAt: totpResult.data?.verified_at || null,
      passkeys: (passkeysResult.data || []).map((passkey) => ({
        id: passkey.id,
        name: passkey.name,
        deviceType: passkey.device_type,
        backedUp: passkey.backed_up,
        createdAt: passkey.created_at,
        lastUsedAt: passkey.last_used_at,
      })),
    },
  };
}

export async function unlinkAccountProvider(
  userId: number,
  provider: LinkedAccountProvider,
) {
  const supabase = getSupabaseAdminClientOrThrow();

  if (provider === "github") {
    const [connectionResult, profileResult] = await Promise.all([
      revokeHostingGitHubConnectionForUser(userId).then(
        () => ({ error: null }),
        (error) => ({ error }),
      ),
      supabase
        .from("auth_user_provider_profiles")
        .delete()
        .eq("user_id", userId)
        .eq("provider", provider),
    ]);
    if (connectionResult.error) {
      throw new Error(
        connectionResult.error instanceof Error
          ? connectionResult.error.message
          : "Nao foi possivel revogar GitHub.",
      );
    }
    if (profileResult.error) throw new Error(profileResult.error.message);
    return;
  }

  const [userResult, credentialResult, fallbackProfilesResult] = await Promise.all([
    supabase
      .from("auth_users")
      .select("discord_user_id, google_user_id, microsoft_user_id, profile_avatar_source")
      .eq("id", userId)
      .single<{
        discord_user_id: string | null;
        google_user_id: string | null;
        microsoft_user_id: string | null;
        profile_avatar_source: string | null;
      }>(),
    supabase
      .from("auth_user_credentials")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle<{ user_id: number }>(),
    supabase
      .from("auth_user_provider_profiles")
      .select("provider, provider_avatar_url")
      .eq("user_id", userId)
      .neq("provider", provider)
      .order("linked_at", { ascending: true }),
  ]);

  if (userResult.error || !userResult.data) {
    throw new Error(userResult.error?.message || "Conta nao encontrada.");
  }

  const user = userResult.data;
  const signInCount =
    Number(Boolean(credentialResult.data)) +
    Number(Boolean(user.discord_user_id)) +
    Number(Boolean(user.google_user_id)) +
    Number(Boolean(user.microsoft_user_id));
  if (signInCount <= 1) {
    throw new Error("Adicione outro metodo de entrada antes de desvincular este acesso.");
  }

  const column =
    provider === "discord"
      ? "discord_user_id"
      : provider === "google"
        ? "google_user_id"
        : "microsoft_user_id";
  const update: Record<string, unknown> = {
    [column]: null,
    last_auth_method: null,
  };

  if (provider === "discord") {
    update.avatar = null;
  }

  if (user.profile_avatar_source === provider) {
    const fallback = (fallbackProfilesResult.data || []).find(
      (profile) => profile.provider_avatar_url,
    );
    update.profile_avatar_url = fallback?.provider_avatar_url || null;
    update.profile_avatar_source = fallback?.provider || null;
    update.profile_avatar_updated_at = new Date().toISOString();
  }

  const updateResult = await supabase
    .from("auth_users")
    .update(update)
    .eq("id", userId);
  if (updateResult.error) throw new Error(updateResult.error.message);

  const profileDelete = await supabase
    .from("auth_user_provider_profiles")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);
  if (profileDelete.error) throw new Error(profileDelete.error.message);

  if (provider === "discord") {
    await supabase
      .from("auth_sessions")
      .update({
        discord_access_token: null,
        discord_refresh_token: null,
        discord_token_expires_at: null,
        active_guild_id: null,
        discord_guilds_cache: null,
        discord_guilds_cached_at: null,
      })
      .eq("user_id", userId);
  }
}
