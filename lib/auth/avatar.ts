type UserAvatarFields = {
  profile_avatar_url?: string | null;
  discord_user_id?: string | null;
  avatar?: string | null;
};

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
