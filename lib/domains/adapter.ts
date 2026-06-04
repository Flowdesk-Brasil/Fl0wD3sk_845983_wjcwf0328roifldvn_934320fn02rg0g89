export type DomainProviderName = "openprovider" | "spaceship" | "hover";

export type DomainOperation =
  | "check"
  | "register"
  | "renew"
  | "transfer_in"
  | "transfer_out"
  | "nameservers"
  | "dnssec"
  | "auth_code";

export type DomainContact = {
  fullName: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  documentType: "cpf" | "cnpj" | "passport" | "none";
  documentNumber?: string | null;
};

export type DomainAvailabilityResult = {
  fqdn: string;
  sld: string;
  tld: string;
  isAvailable: boolean;
  isPremium: boolean;
  supported: boolean;
  registrationCost: number;
  renewalCost: number;
  transferCost: number;
  currency: string;
  provider: DomainProviderName;
  reason?: string | null;
};

export type DomainProviderJob = {
  jobId: string;
  providerRef?: string | null;
  provider: DomainProviderName;
  status: "pending" | "processing" | "completed" | "failed";
  fqdn: string;
  message?: string | null;
};

export type ProviderDomainDetail = {
  providerDomainId: string;
  fqdn: string;
  status: string;
  expirationDate?: string | null;
  autoRenew?: boolean | null;
  transferLock?: boolean | null;
  nameservers?: string[] | null;
};

export type DomainProviderCapabilities = {
  tld: string;
  register: boolean;
  transferIn: boolean;
  transferOut: boolean;
  renew: boolean;
  privacy: boolean;
  dnssec: boolean;
  nameserverUpdate: boolean;
  authCodeRequest: boolean;
  requiresDocument: boolean;
};

export interface DomainProviderAdapter {
  readonly name: DomainProviderName;
  readonly priority: number;
  isConfigured(): boolean;
  checkAvailability(fqdn: string): Promise<DomainAvailabilityResult>;
  checkAvailabilityBatch(fqdns: string[]): Promise<DomainAvailabilityResult[]>;
  registerDomain(input: {
    fqdn: string;
    periodYears: number;
    autoRenew: boolean;
    contact: DomainContact;
    nameservers?: string[];
    idempotencyKey: string;
  }): Promise<DomainProviderJob>;
  getDomain(providerDomainId: string, fqdn?: string): Promise<ProviderDomainDetail | null>;
  renewDomain(providerDomainId: string, periodYears: number, fqdn?: string): Promise<void>;
  updateNameservers(providerDomainId: string, nameservers: string[], fqdn?: string): Promise<void>;
  setTransferLock(providerDomainId: string, locked: boolean, fqdn?: string): Promise<void>;
  requestAuthCode(providerDomainId: string, fqdn?: string): Promise<{ authCode: string }>;
  startTransferIn(input: {
    fqdn: string;
    authCode: string;
    contact: DomainContact;
    nameservers?: string[];
    idempotencyKey: string;
  }): Promise<DomainProviderJob>;
  getTransferStatus(providerRef: string, fqdn?: string): Promise<{
    status: string;
    detail?: string | null;
    providerRef?: string | null;
  }>;
  getCapabilities(tld: string): Promise<DomainProviderCapabilities>;
  healthCheck(): Promise<{ ok: boolean; latencyMs: number; message?: string | null }>;
}

export type DomainStatus =
  | "draft"
  | "quote_created"
  | "payment_pending"
  | "registration_requested"
  | "registration_pending"
  | "active"
  | "action_required"
  | "suspended"
  | "client_hold"
  | "server_hold"
  | "expired"
  | "redemption"
  | "pending_delete"
  | "transfer_in_pending"
  | "transfer_out_pending"
  | "failed"
  | "cancelled";

export type DomainRecord = {
  id: string;
  authUserId: number;
  fqdn: string;
  sld: string;
  tld: string;
  provider: DomainProviderName;
  providerDomainId?: string | null;
  status: DomainStatus;
  registrationPeriodYears: number;
  autoRenew: boolean;
  transferLock: boolean;
  privacyEnabled: boolean;
  dnssecEnabled: boolean;
  registeredAt?: string | null;
  expirationDate?: string | null;
  nameservers?: string[] | null;
  flowdeskManagedDns: boolean;
  currentDnsProvider?: string | null;
  purchasePriceBrl?: number | null;
  renewalPriceBrl?: number | null;
  paymentOrderId?: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DomainTransferRecord = {
  id: string;
  authUserId: number;
  domainId?: string | null;
  fqdn: string;
  direction: "in" | "out";
  status:
    | "initiated"
    | "waiting_auth_code"
    | "waiting_unlock"
    | "waiting_payment"
    | "submitted_to_provider"
    | "waiting_previous_registrar"
    | "action_required"
    | "completed"
    | "failed"
    | "cancelled";
  provider?: DomainProviderName | null;
  providerRef?: string | null;
  quoteId?: string | null;
  paymentOrderId?: number | null;
  errorMessage?: string | null;
  initiatedAt: string;
  completedAt?: string | null;
  updatedAt: string;
};

export type DomainQuote = {
  id: string;
  fqdn: string;
  tld: string;
  operation: "register" | "renew" | "transfer" | "restore";
  periodYears: number;
  provider: DomainProviderName;
  providerCost: number;
  providerCurrency: string;
  exchangeRateToBrl: number;
  markupPercent: number;
  subtotalBrl: number;
  totalBrl: number;
  isPremium: boolean;
  expiresAt: string;
};

export const DOMAIN_MARKUP_PERCENT = 20;

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function applyDomainMarkup(input: {
  providerCost: number;
  exchangeRateToBrl: number;
  markupPercent?: number;
}) {
  const markupPercent = input.markupPercent ?? DOMAIN_MARKUP_PERCENT;
  const subtotalBrl = roundMoney(input.providerCost * input.exchangeRateToBrl);
  const totalBrl = roundMoney(subtotalBrl * (1 + markupPercent / 100));
  return { subtotalBrl, totalBrl, markupPercent };
}

export function formatDomainPriceBrl(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

export function parseFqdn(fqdn: string): { sld: string; tld: string; fqdn: string } | null {
  const normalized = fqdn
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./, "")
    .replace(/\.+$/, "");

  if (!/^(?!-)(?:[a-z0-9-]{1,63}\.)+[a-z0-9-]{2,63}$/i.test(normalized)) {
    return null;
  }

  const parts = normalized.split(".");
  return {
    sld: parts[0],
    tld: parts.slice(1).join("."),
    fqdn: normalized,
  };
}

export function buildDomainRegistrationIdempotencyKey(input: {
  userId: number | string;
  fqdn: string;
  quoteId: string;
}) {
  return `domain_register:${input.userId}:${input.fqdn.toLowerCase()}:${input.quoteId}`;
}

export function buildDomainTransferIdempotencyKey(input: {
  userId: number | string;
  fqdn: string;
  direction: "in" | "out";
  quoteId?: string;
}) {
  return `domain_transfer_${input.direction}:${input.userId}:${input.fqdn.toLowerCase()}:${input.quoteId || "none"}`;
}

export function tldRequiresBrDocument(tld: string) {
  return tld.toLowerCase().endsWith(".br") || tld.toLowerCase() === "br";
}
