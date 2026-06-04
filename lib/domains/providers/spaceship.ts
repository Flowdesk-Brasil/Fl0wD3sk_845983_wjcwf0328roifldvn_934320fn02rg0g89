import crypto from "node:crypto";
import type {
  DomainAvailabilityResult,
  DomainContact,
  DomainProviderAdapter,
  DomainProviderCapabilities,
  DomainProviderJob,
  ProviderDomainDetail,
} from "@/lib/domains/adapter";
import { parseFqdn, tldRequiresBrDocument } from "@/lib/domains/adapter";
import { DomainProviderError } from "./errors";
import {
  normalizePhoneParts,
  providerFetchJson,
  splitContactName,
  type ProviderFetchJsonOptions,
} from "./http";

const BASE_URL = (process.env.SPACESHIP_BASE_URL || "https://spaceship.dev/api").replace(/\/$/, "");

type SpaceshipTldPrice = {
  register: number;
  renew: number;
  transfer: number;
  currency?: string;
};

// The availability API only returns prices for premium domains. Standard TLD
// costs use a conservative catalog and can be overridden without code changes.
const DEFAULT_TLD_PRICES: Record<string, SpaceshipTldPrice> = {
  com: { register: 9.86, renew: 10.18, transfer: 10.18 },
  net: { register: 11.4, renew: 11.4, transfer: 11.4 },
  org: { register: 11.59, renew: 11.59, transfer: 11.59 },
  io: { register: 51.75, renew: 51.75, transfer: 51.75 },
  ai: { register: 79.98, renew: 79.98, transfer: 79.98 },
  app: { register: 14.69, renew: 14.69, transfer: 14.69 },
  dev: { register: 12.62, renew: 12.62, transfer: 12.62 },
  co: { register: 25.98, renew: 25.98, transfer: 25.98 },
  me: { register: 15.53, renew: 15.53, transfer: 15.53 },
  online: { register: 28.66, renew: 20.18, transfer: 20.18 },
  store: { register: 43.67, renew: 30.78, transfer: 30.78 },
  tech: { register: 50.92, renew: 50.92, transfer: 50.92 },
};

function configured() {
  return Boolean(process.env.SPACESHIP_API_KEY?.trim() && process.env.SPACESHIP_API_SECRET?.trim());
}

function headers() {
  if (!configured()) {
    throw new DomainProviderError("spaceship", "not_configured", "Spaceship nao configurada.", 503);
  }
  return {
    "Content-Type": "application/json",
    "X-API-Key": process.env.SPACESHIP_API_KEY!.trim(),
    "X-API-Secret": process.env.SPACESHIP_API_SECRET!.trim(),
  };
}

async function request<T>(
  path: string,
  init: RequestInit,
  options: ProviderFetchJsonOptions = {},
) {
  return providerFetchJson<T>("spaceship", `${BASE_URL}${path}`, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  }, 15_000, options);
}

function parseDomain(fqdn: string) {
  const parsed = parseFqdn(fqdn);
  if (!parsed) throw new DomainProviderError("spaceship", "validation", "Dominio invalido.", 400);
  return parsed;
}

function parseTldPriceCatalog() {
  const configuredCatalog = process.env.SPACESHIP_TLD_PRICE_CATALOG_JSON?.trim();
  if (!configuredCatalog) return DEFAULT_TLD_PRICES;
  try {
    const parsed = JSON.parse(configuredCatalog) as Record<string, Partial<SpaceshipTldPrice>>;
    const normalized: Record<string, SpaceshipTldPrice> = { ...DEFAULT_TLD_PRICES };
    for (const [tld, raw] of Object.entries(parsed)) {
      const register = Number(raw.register);
      const renew = Number(raw.renew);
      const transfer = Number(raw.transfer);
      if (register > 0 && renew > 0 && transfer > 0) {
        normalized[tld.trim().toLowerCase().replace(/^\./, "")] = {
          register,
          renew,
          transfer,
          currency: String(raw.currency || "USD").toUpperCase(),
        };
      }
    }
    return normalized;
  } catch {
    return DEFAULT_TLD_PRICES;
  }
}

function domainPricing(tld: string, item: Record<string, unknown>) {
  const premiumPricing = Array.isArray(item.premiumPricing) ? item.premiumPricing : [];
  const premiumByOperation = new Map(
    premiumPricing.map((entry) => {
      const record = entry as Record<string, unknown>;
      return [String(record.operation || "").toLowerCase(), record];
    }),
  );
  const premiumRegister = premiumByOperation.get("register");
  const premiumRenew = premiumByOperation.get("renew");
  const premiumTransfer = premiumByOperation.get("transfer");
  const catalog = parseTldPriceCatalog()[tld];
  const itemPrice = Number(item.price || 0);
  const register = Number(premiumRegister?.price || itemPrice || catalog?.register || 0);
  const renew = Number(premiumRenew?.price || catalog?.renew || register || 0);
  const transfer = Number(premiumTransfer?.price || catalog?.transfer || register || 0);
  return {
    register,
    renew,
    transfer,
    currency: String(
      premiumRegister?.currency || item.currency || catalog?.currency || "USD",
    ),
    premium: premiumPricing.length > 0,
  };
}

function availabilityState(item: Record<string, unknown>) {
  const result = String(item.result || "");
  return {
    result,
    available: result.toLowerCase() === "available",
    supported: !/unsupported/i.test(result),
  };
}

async function createContact(contact: DomainContact) {
  const name = splitContactName(contact.fullName);
  const phone = normalizePhoneParts(contact.phone);
  const response = await request<{ contactId?: string }>("/v1/contacts", {
    method: "PUT",
    body: JSON.stringify({
      firstName: name.firstName,
      lastName: name.lastName,
      email: contact.email,
      address1: contact.street,
      city: contact.city,
      country: contact.country.toUpperCase(),
      stateProvince: contact.state,
      postalCode: contact.postalCode,
      phone: phone.spaceship,
      taxNumber: contact.documentNumber?.replace(/\D/g, "") || undefined,
    }),
  });
  if (!response.data.contactId) {
    throw new DomainProviderError("spaceship", "permanent", "Spaceship nao retornou o contato.", 502);
  }
  return response.data.contactId;
}

function asyncJob(
  fqdn: string,
  headersValue: Headers,
  operation: string,
): DomainProviderJob {
  const id = headersValue.get("spaceship-async-operationid") || crypto.randomUUID();
  return {
    jobId: `spaceship:${operation}:${id}`,
    providerRef: id,
    provider: "spaceship",
    status: "processing",
    fqdn,
  };
}

export const spaceshipAdapter: DomainProviderAdapter = {
  name: "spaceship",
  priority: 2,
  isConfigured: configured,

  async checkAvailability(fqdn): Promise<DomainAvailabilityResult> {
    const parsed = parseDomain(fqdn);
    const response = await request<{ domains?: Array<Record<string, unknown>> }>("/v1/domains/available", {
      method: "POST",
      body: JSON.stringify({ domains: [parsed.fqdn] }),
    }, {
      trafficScope: "availability",
      retryOnRateLimit: true,
    });
    const item = response.data.domains?.[0] || {};
    const pricing = domainPricing(parsed.tld, item);
    const state = availabilityState(item);
    return {
      fqdn: parsed.fqdn,
      sld: parsed.sld,
      tld: parsed.tld,
      isAvailable: state.available,
      isPremium: pricing.premium,
      supported: state.supported,
      registrationCost: pricing.register,
      renewalCost: pricing.renew,
      transferCost: pricing.transfer,
      currency: pricing.currency,
      provider: "spaceship",
      reason: state.result || null,
    };
  },

  async checkAvailabilityBatch(fqdns) {
    const parsed = fqdns.map(parseDomain);
    const response = await request<{ domains?: Array<Record<string, unknown>> }>("/v1/domains/available", {
      method: "POST",
      body: JSON.stringify({ domains: parsed.map((item) => item.fqdn).slice(0, 20) }),
    }, {
      trafficScope: "availability",
      retryOnRateLimit: true,
    });
    const map = new Map((response.data.domains || []).map((item) => [String(item.domain), item]));
    return parsed.map((domain) => {
      const item = map.get(domain.fqdn) || {};
      const pricing = domainPricing(domain.tld, item);
      const state = availabilityState(item);
      return {
        fqdn: domain.fqdn,
        sld: domain.sld,
        tld: domain.tld,
        isAvailable: state.available,
        isPremium: pricing.premium,
        supported: state.supported,
        registrationCost: pricing.register,
        renewalCost: pricing.renew,
        transferCost: pricing.transfer,
        currency: pricing.currency,
        provider: "spaceship",
        reason: state.result || null,
      };
    });
  },

  async registerDomain(input) {
    const parsed = parseDomain(input.fqdn);
    const contactId = await createContact(input.contact);
    const response = await request<Record<string, unknown>>(`/v1/domains/${encodeURIComponent(parsed.fqdn)}`, {
      method: "POST",
      body: JSON.stringify({
        autoRenew: input.autoRenew,
        years: input.periodYears,
        privacyProtection: { level: "high", userConsent: true },
        contacts: {
          registrant: contactId,
          admin: contactId,
          tech: contactId,
          billing: contactId,
        },
      }),
    });
    if (input.nameservers?.length) {
      await this.updateNameservers(parsed.fqdn, input.nameservers, parsed.fqdn);
    }
    return asyncJob(parsed.fqdn, response.headers, "register");
  },

  async getDomain(providerDomainId, fqdn): Promise<ProviderDomainDetail | null> {
    const domain = fqdn || providerDomainId;
    const response = await request<Record<string, unknown>>(`/v1/domains/${encodeURIComponent(domain)}`, {
      method: "GET",
    });
    const nameservers = response.data.nameservers as Record<string, unknown> | undefined;
    return {
      providerDomainId: domain,
      fqdn: String(response.data.name || domain),
      status: String(response.data.lifecycleStatus || "active"),
      expirationDate: String(response.data.expirationDate || "") || null,
      autoRenew: Boolean(response.data.autoRenew),
      transferLock: Array.isArray(response.data.eppStatuses)
        ? response.data.eppStatuses.includes("clientTransferProhibited")
        : null,
      nameservers: Array.isArray(nameservers?.hosts)
        ? nameservers.hosts.map(String)
        : null,
    };
  },

  async renewDomain(providerDomainId, periodYears, fqdn) {
    const domain = fqdn || providerDomainId;
    const detail = await this.getDomain(providerDomainId, domain);
    await request(`/v1/domains/${encodeURIComponent(domain)}/renew`, {
      method: "POST",
      body: JSON.stringify({
        years: periodYears,
        currentExpirationDate: detail?.expirationDate,
      }),
    });
  },

  async updateNameservers(providerDomainId, nameservers, fqdn) {
    const domain = fqdn || providerDomainId;
    await request(`/v1/domains/${encodeURIComponent(domain)}/nameservers`, {
      method: "PUT",
      body: JSON.stringify({ provider: "custom", hosts: nameservers }),
    });
  },

  async setTransferLock(providerDomainId, locked, fqdn) {
    await request(`/v1/domains/${encodeURIComponent(fqdn || providerDomainId)}/transfer/lock`, {
      method: "PUT",
      body: JSON.stringify({ isLocked: locked }),
    });
  },

  async requestAuthCode(providerDomainId, fqdn) {
    const response = await request<{ authCode?: string }>(
      `/v1/domains/${encodeURIComponent(fqdn || providerDomainId)}/transfer/auth-code`,
      { method: "GET" },
    );
    if (!response.data.authCode) throw new Error("Spaceship nao retornou o Auth Code.");
    return { authCode: response.data.authCode };
  },

  async startTransferIn(input) {
    const parsed = parseDomain(input.fqdn);
    const contactId = await createContact(input.contact);
    const response = await request(`/v1/domains/${encodeURIComponent(parsed.fqdn)}/transfer`, {
      method: "POST",
      body: JSON.stringify({
        autoRenew: true,
        privacyProtection: { level: "high", userConsent: true },
        contacts: {
          registrant: contactId,
          admin: contactId,
          tech: contactId,
          billing: contactId,
        },
        authCode: input.authCode,
      }),
    });
    return asyncJob(parsed.fqdn, response.headers, "transfer");
  },

  async getTransferStatus(providerRef, fqdn) {
    if (!fqdn) return { status: "pending", providerRef };
    const response = await request<Record<string, unknown>>(
      `/v1/domains/${encodeURIComponent(fqdn)}/transfer`,
      { method: "GET" },
    );
    return {
      status: String(response.data.status || "pending"),
      detail: String(response.data.direction || "") || null,
      providerRef,
    };
  },

  async getCapabilities(tld): Promise<DomainProviderCapabilities> {
    return {
      tld,
      register: true,
      transferIn: true,
      transferOut: true,
      renew: true,
      privacy: true,
      dnssec: false,
      nameserverUpdate: true,
      authCodeRequest: true,
      requiresDocument: tldRequiresBrDocument(tld),
    };
  },

  async healthCheck() {
    const startedAt = Date.now();
    try {
      await this.checkAvailabilityBatch(["flowdesk-health-check.com"]);
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Falha na Spaceship.",
      };
    }
  },
};
