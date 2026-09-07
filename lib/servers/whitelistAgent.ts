import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { normalizeWhitelistMapping, type WhitelistMapping } from "@/lib/servers/whitelistMapping";

export const WHITELIST_AGENT_OPERATIONS = [
  "TEST_CONNECTION",
  "INSPECT_SCHEMA",
  "TEST_MAPPING",
  "GET_PLAYER",
  "CHECK_WHITELIST",
  "APPROVE_WHITELIST",
  "REMOVE_WHITELIST",
  "HEALTH_CHECK",
] as const;

export type WhitelistAgentOperation = (typeof WHITELIST_AGENT_OPERATIONS)[number];

export function hashWhitelistAgentToken(token: string) {
  return createHash("sha256").update(String(token || ""), "utf8").digest("hex");
}

export function tokensMatch(leftHash: string, rightHash: string) {
  const left = Buffer.from(String(leftHash || ""), "utf8");
  const right = Buffer.from(String(rightHash || ""), "utf8");
  if (left.length !== right.length || left.length === 0) return false;
  return timingSafeEqual(left, right);
}

export function createWhitelistAgentPairing() {
  const publicId = `fdwa_${randomBytes(12).toString("hex")}`;
  const token = randomBytes(32).toString("hex");
  return {
    publicId,
    token,
    tokenHash: hashWhitelistAgentToken(token),
  };
}

export function isWhitelistAgentOperation(value: string): value is WhitelistAgentOperation {
  return (WHITELIST_AGENT_OPERATIONS as readonly string[]).includes(value);
}

export function resolveWhitelistAgentApiUrl(request?: Request | null) {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    "";
  if (envUrl) {
    return `${envUrl.replace(/\/$/, "")}/api/whitelist-agent/sync`;
  }
  if (request) {
    try {
      return new URL("/api/whitelist-agent/sync", request.url).toString();
    } catch {
      // Fall through.
    }
  }
  return "https://www.flwdesk.com/api/whitelist-agent/sync";
}

export function mappingFromJobPayload(payload: unknown): WhitelistMapping {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return normalizeWhitelistMapping(record.mapping || record);
}

export async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
