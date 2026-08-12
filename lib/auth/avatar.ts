type UserAvatarFields = {
  profile_avatar_url?: string | null;
  profile_avatar_source?: string | null;
  discord_user_id?: string | null;
  avatar?: string | null;
};

export type AuthProfileAvatarSource =
  | "discord"
  | "google"
  | "microsoft"
  | "github"
  | "upload"
  | "existing";

export function buildDiscordUserAvatarUrl(
  discordUserId: string | null | undefined,
  avatarHash: string | null | undefined,
  size = 512,
) {
  if (!discordUserId || !avatarHash) return null;
  const extension = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatarHash}.${extension}?size=${size}`;
}

export function resolveAuthUserAvatarUrl(user: UserAvatarFields | null | undefined) {
  if (!user) return null;
  return (
    user.profile_avatar_url ||
    buildDiscordUserAvatarUrl(user.discord_user_id, user.avatar)
  );
}

export function normalizeProfileAvatarUrl(value: string | null | undefined) {
  const trimmed = value?.trim() || "";
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function resolveNextAuthUserProfileAvatar(
  currentUser: UserAvatarFields | null | undefined,
  provider: Exclude<AuthProfileAvatarSource, "upload" | "existing">,
  providerAvatarUrl: string | null | undefined,
) {
  const normalizedProviderAvatarUrl = normalizeProfileAvatarUrl(providerAvatarUrl);
  const currentAvatarUrl = normalizeProfileAvatarUrl(currentUser?.profile_avatar_url);
  const currentAvatarSource = currentUser?.profile_avatar_source || null;

  if (currentAvatarUrl && currentAvatarSource === "upload") {
    return {
      profileAvatarUrl: currentAvatarUrl,
      profileAvatarSource: "upload",
    };
  }

  if (normalizedProviderAvatarUrl) {
    return {
      profileAvatarUrl: normalizedProviderAvatarUrl,
      profileAvatarSource: provider,
    };
  }

  return {
    profileAvatarUrl: currentAvatarUrl,
    profileAvatarSource: currentAvatarUrl ? currentAvatarSource || "existing" : null,
  };
}
