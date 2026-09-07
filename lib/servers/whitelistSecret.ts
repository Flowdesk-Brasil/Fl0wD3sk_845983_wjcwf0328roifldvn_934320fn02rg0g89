import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "wl.v1";

function resolveSecret() {
  const value =
    process.env.FLOWDESK_WHITELIST_DB_SECRET ||
    process.env.FLOWSECURE_MASTER_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!value.trim()) {
    throw new Error("Segredo de criptografia da whitelist indisponivel.");
  }
  return createHash("sha256").update(`whitelist-db:${value.trim()}`).digest();
}

export function encryptWhitelistSecret(plain: string, guildId: string) {
  const text = String(plain || "");
  if (!text) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", resolveSecret(), iv);
  cipher.setAAD(Buffer.from(guildId, "utf8"));
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptWhitelistSecret(cipherText: string | null | undefined, guildId: string) {
  const raw = String(cipherText || "");
  if (!raw) return "";
  const parts = raw.split(".");
  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("Envelope de senha invalido.");
  }
  const iv = Buffer.from(parts[1], "base64url");
  const data = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", resolveSecret(), iv);
  decipher.setAAD(Buffer.from(guildId, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function maskDatabaseHost(host: string | null | undefined) {
  const value = String(host || "").trim();
  if (!value) return "";
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(value)) {
    const chunks = value.split(".");
    return `${chunks[0]}.*.*.${chunks[3]}`;
  }
  const parts = value.split(".");
  if (parts.length < 2) return "***";
  return `${parts[0][0] || "*"}***.${parts.slice(-2).join(".")}`;
}
