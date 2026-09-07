import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import {
  decryptFlowSecureValue,
  isFlowSecureEnvelope,
  type FlowSecurePurpose,
} from "@/lib/security/flowSecure";

const PREFIX = "wl.v1";
const REENTER_PASSWORD =
  "Digite a senha do banco novamente no campo Senha e teste. A senha salva nao pode ser lida.";

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

export function isWhitelistPasswordEnvelope(value: string | null | undefined) {
  const parts = String(value || "").split(".");
  return parts.length === 4 && parts[0] === PREFIX;
}

function decryptWlV1(cipherText: string, guildId: string) {
  const parts = cipherText.split(".");
  const iv = Buffer.from(parts[1], "base64url");
  const data = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", resolveSecret(), iv);
  decipher.setAAD(Buffer.from(guildId, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function looksLikePlainPassword(value: string) {
  if (!value || value.length > 255) return false;
  if (isWhitelistPasswordEnvelope(value) || isFlowSecureEnvelope(value)) return false;
  if (value.includes("\n") || value.includes("\r")) return false;
  return true;
}

function decryptLegacyFlowSecure(cipherText: string, guildId: string) {
  const purposes: FlowSecurePurpose[] = [
    "server_settings_snapshot",
    "hosting_env_secret",
    "test_variable_secret",
  ];
  const aads = [guildId, `whitelist:${guildId}`, `guild:${guildId}`, null];
  for (const purpose of purposes) {
    for (const aad of aads) {
      try {
        const plain = decryptFlowSecureValue(cipherText, {
          purpose,
          aad,
          allowPlaintextFallback: false,
        });
        if (plain) return plain;
      } catch {
        /* try the next envelope context */
      }
    }
  }
  return "";
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
  const raw = String(cipherText || "").trim();
  if (!raw) return "";
  try {
    if (isWhitelistPasswordEnvelope(raw)) {
      return decryptWlV1(raw, guildId);
    }
    if (isFlowSecureEnvelope(raw)) {
      return decryptLegacyFlowSecure(raw, guildId);
    }
    if (looksLikePlainPassword(raw)) {
      return raw;
    }
  } catch {
    return "";
  }
  return "";
}

export function resolveWhitelistDbPassword(input: {
  cipher: string | null | undefined;
  guildId: string;
  override?: string | null;
}) {
  const typed = String(input.override || "");
  if (typed) {
    return { password: typed, reencrypt: true };
  }
  const password = decryptWhitelistSecret(input.cipher, input.guildId);
  if (!password) {
    throw new Error(REENTER_PASSWORD);
  }
  return {
    password,
    reencrypt: !isWhitelistPasswordEnvelope(input.cipher),
  };
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
