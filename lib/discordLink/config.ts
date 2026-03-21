export const OFFICIAL_DISCORD_GUILD_ID =
  process.env.OFFICIAL_SUPPORT_GUILD_ID?.trim() || "1483994900344082584";

export const OFFICIAL_DISCORD_LINK_CHANNEL_ID =
  process.env.OFFICIAL_LINK_CHANNEL_ID?.trim() || "1484968829724659802";

export const OFFICIAL_DISCORD_LINKED_ROLE_ID =
  process.env.OFFICIAL_LINKED_ROLE_ID?.trim() || "1484996418178388169";

export const OFFICIAL_DISCORD_LINK_PATH =
  process.env.OFFICIAL_ACCOUNT_LINK_PATH?.trim() || "/discord/link";

export const OFFICIAL_DISCORD_LINK_START_PATH =
  process.env.OFFICIAL_ACCOUNT_LINK_START_PATH?.trim() || "/discord/link/start";

export const OFFICIAL_DISCORD_LINKED_ROLE_NAME =
  process.env.OFFICIAL_LINKED_ROLE_NAME?.trim() || "Conta vinculada";

export const OFFICIAL_DISCORD_INVITE_URL =
  process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim() ||
  "https://discord.gg/j9V2UUmfYP";

export const FLOWDESK_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://flowdeskbot.vercel.app";

export function buildOfficialDiscordLinkUrl(origin?: string | null) {
  const baseOrigin = (origin || FLOWDESK_APP_URL).replace(/\/+$/, "");
  const normalizedPath = OFFICIAL_DISCORD_LINK_START_PATH.startsWith("/")
    ? OFFICIAL_DISCORD_LINK_START_PATH
    : `/${OFFICIAL_DISCORD_LINK_START_PATH}`;

  return `${baseOrigin}${normalizedPath}`;
}

export function buildOfficialDiscordChannelUrl() {
  return `https://discord.com/channels/${OFFICIAL_DISCORD_GUILD_ID}/${OFFICIAL_DISCORD_LINK_CHANNEL_ID}`;
}
