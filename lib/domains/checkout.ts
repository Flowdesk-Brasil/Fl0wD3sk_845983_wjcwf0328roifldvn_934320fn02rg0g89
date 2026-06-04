import crypto from "node:crypto";

export type DomainCheckoutOperation = "register" | "transfer";

export type DomainCheckoutTokenPayload = {
  version: 1;
  authUserId: number;
  operation: DomainCheckoutOperation;
  fqdn: string;
  quoteId: string;
  contactId: string;
  domainId?: string | null;
  transferId?: string | null;
  amount: number;
  currency: "BRL";
  expiresAt: string;
};

export type ResolvedDomainPurchaseContext = {
  type: "domain";
  authUserId: number;
  title: string;
  subtitle: string;
  amount: number;
  currency: string;
  providerPayload: Record<string, unknown>;
};

function secret() {
  const value =
    process.env.DOMAIN_CHECKOUT_SECRET?.trim() ||
    process.env.PAYMENT_LINK_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim();
  if (!value && process.env.NODE_ENV === "production") {
    throw new Error("DOMAIN_CHECKOUT_SECRET/PAYMENT_LINK_SECRET nao configurado.");
  }
  return value || "flowdesk-domain-checkout-dev";
}

function sign(encodedPayload: string) {
  return crypto.createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function createDomainCheckoutToken(payload: DomainCheckoutTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyDomainCheckoutToken(token: string): DomainCheckoutTokenPayload | null {
  const [encoded, signature] = token.trim().split(".");
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DomainCheckoutTokenPayload;
    if (
      payload.version !== 1 ||
      !Number.isInteger(payload.authUserId) ||
      !["register", "transfer"].includes(payload.operation) ||
      !payload.fqdn ||
      !payload.quoteId ||
      !payload.contactId ||
      !Number.isFinite(payload.amount) ||
      payload.amount <= 0 ||
      payload.currency !== "BRL" ||
      new Date(payload.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function resolveDomainPurchaseContext(value: unknown): ResolvedDomainPurchaseContext | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.type !== "domain" || typeof record.token !== "string") return null;
  const payload = verifyDomainCheckoutToken(record.token);
  if (!payload) return null;

  const title =
    payload.operation === "transfer"
      ? `Transferencia de ${payload.fqdn}`
      : `Registro de ${payload.fqdn}`;
  const subtitle =
    payload.operation === "transfer"
      ? "Transferencia e DNS gerenciados pela Flowdesk"
      : "Dominio e DNS gerenciados pela Flowdesk";

  return {
    type: "domain",
    authUserId: payload.authUserId,
    title,
    subtitle,
    amount: payload.amount,
    currency: payload.currency,
    providerPayload: {
      purchase_context: {
        type: "domain",
        operation: payload.operation,
        authUserId: payload.authUserId,
        fqdn: payload.fqdn,
        quoteId: payload.quoteId,
        contactId: payload.contactId,
        domainId: payload.domainId || null,
        transferId: payload.transferId || null,
        amount: payload.amount,
        currency: payload.currency,
        expiresAt: payload.expiresAt,
      },
    },
  };
}
