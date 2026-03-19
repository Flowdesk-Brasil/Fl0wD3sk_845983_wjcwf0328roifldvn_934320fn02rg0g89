import type { NextRequest } from "next/server";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variavel obrigatoria ausente: ${name}`);
  }

  return value;
}

function parseSessionHours() {
  const value = Number(process.env.AUTH_SESSION_TTL_HOURS || "168");
  return Number.isFinite(value) && value > 0 ? value : 168;
}

export const authConfig = {
  discordClientId: requireEnv("DISCORD_CLIENT_ID"),
  discordClientSecret: requireEnv("DISCORD_CLIENT_SECRET"),
  discordRedirectUriLocal:
    process.env.DISCORD_REDIRECT_URI_LOCAL ||
    "http://localhost:3000/api/auth/discord/callback",
  discordRedirectUriProd:
    process.env.DISCORD_REDIRECT_URI_PROD ||
    "https://flowdeskbot.vercel.app/api/auth/discord/callback",
  loginSuccessBasePath: process.env.LOGIN_SUCCESS_BASE_PATH || "/config",
  loginSuccessHashPath: process.env.LOGIN_SUCCESS_HASH_PATH || "/step/1",
  oauthStateCookieName: "flowdesk_oauth_state",
  oauthRedirectUriCookieName: "flowdesk_oauth_redirect_uri",
  sessionCookieName: "flowdesk_auth_session",
  sessionTtlHours: parseSessionHours(),
};

function isLocalHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function resolveDiscordRedirectUri(request: NextRequest) {
  const hostname = request.nextUrl.hostname;
  return isLocalHostname(hostname)
    ? authConfig.discordRedirectUriLocal
    : authConfig.discordRedirectUriProd;
}

export function isSecureRequest(request: NextRequest) {
  return request.nextUrl.protocol === "https:";
}

function normalizeBasePath(path: string) {
  if (!path) return "/config";
  return path.startsWith("/") ? path : `/${path}`;
}

function normalizeHashPath(path: string) {
  if (!path) return "";
  return path.replace(/^#/, "");
}

export function buildLoginSuccessLocation(origin: string) {
  const basePath = normalizeBasePath(authConfig.loginSuccessBasePath);
  const hashPath = normalizeHashPath(authConfig.loginSuccessHashPath);

  if (!hashPath) {
    return `${origin}${basePath}`;
  }

  const basePathWithSlash = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${origin}${basePathWithSlash}#${hashPath}`;
}
