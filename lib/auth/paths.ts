export const DISCORD_AUTH_START_PATH = "/api/auth/discord/";
export const LOGIN_PATH = "/login";

export function buildLoginHref(nextPath?: string | null) {
  if (!nextPath) return LOGIN_PATH;

  const normalizedNextPath = nextPath.trim();
  if (!normalizedNextPath) return LOGIN_PATH;

  const params = new URLSearchParams({
    next: normalizedNextPath,
  });

  return `${LOGIN_PATH}?${params.toString()}`;
}

export function buildDiscordAuthStartHref(nextPath?: string | null) {
  if (!nextPath) return DISCORD_AUTH_START_PATH;

  const normalizedNextPath = nextPath.trim();
  if (!normalizedNextPath) return DISCORD_AUTH_START_PATH;

  const params = new URLSearchParams({
    next: normalizedNextPath,
  });

  return `${DISCORD_AUTH_START_PATH}?${params.toString()}`;
}
