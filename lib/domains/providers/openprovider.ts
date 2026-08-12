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
import {
  OpenProviderRequestError,
  isOpenProviderAuthError,
  openProviderClient,
} from "@/lib/openprovider/client";
import type {
  DomainCheckResponseData,
  DomainCheckResult,
} from "@/lib/openprovider/types";
import { DomainProviderError, asProviderError } from "./errors";
import { normalizePhoneParts, splitContactName } from "./http";

type OpenproviderData = Record<string, unknown>;

function configured() {
  return Boolean(
    process.env.OPENPROVIDER_USERNAME?.trim() &&
      process.env.OPENPROVIDER_PASSWORD?.trim(),
  );
}

function requireParsed(fqdn: string) {
  const parsed = parseFqdn(fqdn);
  if (!parsed) {
    throw new DomainProviderError("openprovider", "validation", "Dominio invalido.", 400);
  }
  return parsed;
}

function mapAvailabilityResult(
  parsed: ReturnType<typeof requireParsed>,
  result: DomainCheckResult,
): DomainAvailabilityResult {
  const regular = result.price?.reseller || result.price?.product;
  const premiumPrice = result.premium?.price?.create || 0;
  const price = Number(regular?.price || premiumPrice || 0);
  return {
    fqdn: parsed.fqdn,
    sld: parsed.sld,
    tld: parsed.tld,
    isAvailable: result.status === "free",
    isPremium: Boolean(result.is_premium),
    supported: !/not supported|invalid extension/i.test(result.reason || ""),
    registrationCost: price,
    renewalCost: price,
    transferCost: price,
    currency: regular?.currency || result.premium?.currency || "EUR",
    provider: "openprovider",
    reason: result.reason || null,
  };
}

async function checkAvailabilityBatch(fqdns: string[]) {
  if (!configured()) {
    throw new DomainProviderError("openprovider", "not_configured", "Openprovider nao configurada.", 503);
  }

  const parsed = fqdns.map(requireParsed);
  const response = await openProviderClient.post<DomainCheckResponseData>("domains/check", {
    domains: parsed.map((domain) => ({ name: domain.sld, extension: domain.tld })),
    with_price: true,
  });
  const results = response.data?.results || [];
  if (!results.length) {
    throw new DomainProviderError("openprovider", "temporary", "Resposta vazia da Openprovider.", 502);
  }

  const byFqdn = new Map(
    results.map((result) => [String(result.domain || "").trim().toLowerCase(), result]),
  );
  return parsed.map((domain, index) => {
    const result = byFqdn.get(domain.fqdn) || results[index];
    if (!result) {
      throw new DomainProviderError(
        "openprovider",
        "temporary",
        `A Openprovider nao retornou resultado para ${domain.fqdn}.`,
        502,
      );
    }
    return mapAvailabilityResult(domain, result);
  });
}

function mapError(error: unknown) {
  if (error instanceof OpenProviderRequestError) {
    const kind =
      isOpenProviderAuthError(error)
        ? "not_configured"
        : error.status === 429
        ? "rate_limited"
        : [408, 500, 502, 503, 504].includes(error.status) || error.maintenance
          ? "temporary"
          : /not supported|not available|extension/i.test(error.message)
            ? "unsupported"
            : "permanent";
    return new DomainProviderError("openprovider", kind, error.message, error.status, error.details);
  }
  return asProviderError("openprovider", error, "Falha na Openprovider.");
}

async function createCustomer(contact: DomainContact) {
  const name = splitContactName(contact.fullName);
  const phone = normalizePhoneParts(contact.phone);
  const streetMatch = contact.street.trim().match(/^(.*?)(?:,\s*|\s+)(\d+[A-Za-z-]*)$/);
  const response = await openProviderClient.post<OpenproviderData>("customers", {
    name: {
      first_name: name.firstName,
      last_name: name.lastName,
      full_name: contact.fullName,
      initials: `${name.firstName.charAt(0)} ${name.lastName.charAt(0)}`.trim(),
    },
    address: {
      street: streetMatch?.[1] || contact.street,
      number: streetMatch?.[2] || "1",
      zipcode: contact.postalCode,
      city: contact.city,
      state: contact.state,
      country: contact.country.toUpperCase(),
    },
    email: contact.email,
    phone: {
      country_code: phone.countryCode,
      area_code: phone.areaCode,
      subscriber_number: phone.subscriberNumber,
    },
    locale: "pt_BR",
    additional_data: contact.documentNumber
      ? { social_security_number: contact.documentNumber.replace(/\D/g, "") }
      : undefined,
    tags: [{ key: "customer", value: "flowdesk-domain" }],
  });
  const data = response.data || {};
  const handle = String(data.handle || "");
  if (!handle) {
    throw new DomainProviderError(
      "openprovider",
      "permanent",
      "A Openprovider nao retornou o identificador do contato.",
      502,
      response,
    );
  }
  return handle;
}

export const openproviderAdapter: DomainProviderAdapter = {
  name: "openprovider",
  priority: 1,
  isConfigured: configured,

  async checkAvailability(fqdn): Promise<DomainAvailabilityResult> {
    try {
      const [result] = await checkAvailabilityBatch([fqdn]);
      return result;
    } catch (error) {
      throw mapError(error);
    }
  },

  async checkAvailabilityBatch(fqdns) {
    try {
      return await checkAvailabilityBatch(fqdns);
    } catch (error) {
      throw mapError(error);
    }
  },

  async registerDomain(input): Promise<DomainProviderJob> {
    const parsed = requireParsed(input.fqdn);
    try {
      const handle = await createCustomer(input.contact);
      const response = await openProviderClient.post<OpenproviderData>("domains", {
        domain: { name: parsed.sld, extension: parsed.tld },
        period: input.periodYears,
        owner_handle: handle,
        admin_handle: handle,
        tech_handle: handle,
        billing_handle: handle,
        autorenew: input.autoRenew ? "on" : "off",
        is_private_whois_enabled: true,
        name_servers: input.nameservers?.map((name) => ({ name })),
        comments: `Flowdesk ${input.idempotencyKey}`,
      });
      const id = String(response.data?.id || response.data?.domain_id || parsed.fqdn);
      return {
        jobId: `openprovider:${id}`,
        providerRef: id,
        provider: "openprovider",
        status: "completed",
        fqdn: parsed.fqdn,
      };
    } catch (error) {
      throw mapError(error);
    }
  },

  async getDomain(providerDomainId, fqdn): Promise<ProviderDomainDetail | null> {
    try {
      const response = await openProviderClient.get<OpenproviderData>(`domains/${encodeURIComponent(providerDomainId)}`);
      const data = response.data || {};
      return {
        providerDomainId,
        fqdn: String(data.domain || fqdn || ""),
        status: String(data.status || "active"),
        expirationDate: String(data.expiration_date || "") || null,
        autoRenew: String(data.autorenew || "").toLowerCase() === "on",
        transferLock: Boolean(data.is_locked),
        nameservers: Array.isArray(data.name_servers)
          ? data.name_servers.map((item) => String((item as Record<string, unknown>).name || item))
          : null,
      };
    } catch (error) {
      const mapped = mapError(error);
      if (mapped.status === 404) return null;
      throw mapped;
    }
  },

  async renewDomain(providerDomainId, periodYears) {
    try {
      await openProviderClient.post(`domains/${encodeURIComponent(providerDomainId)}/renew`, {
        period: periodYears,
      });
    } catch (error) {
      throw mapError(error);
    }
  },

  async updateNameservers(providerDomainId, nameservers) {
    try {
      await openProviderClient.put(`domains/${encodeURIComponent(providerDomainId)}`, {
        name_servers: nameservers.map((name) => ({ name })),
      });
    } catch (error) {
      throw mapError(error);
    }
  },

  async setTransferLock(providerDomainId, locked) {
    try {
      await openProviderClient.put(`domains/${encodeURIComponent(providerDomainId)}`, {
        is_locked: locked,
      });
    } catch (error) {
      throw mapError(error);
    }
  },

  async requestAuthCode(providerDomainId) {
    try {
      const response = await openProviderClient.get<OpenproviderData>(
        `domains/${encodeURIComponent(providerDomainId)}/authcode`,
      );
      const authCode = String(response.data?.auth_code || response.data?.authCode || "");
      if (!authCode) throw new Error("Auth Code nao retornado pela Openprovider.");
      return { authCode };
    } catch (error) {
      throw mapError(error);
    }
  },

  async updateDomainContact(input) {
    try {
      const handle = await createCustomer(input.contact);
      await openProviderClient.put(`domains/${encodeURIComponent(input.providerDomainId)}`, {
        owner_handle: handle,
        admin_handle: handle,
        tech_handle: handle,
        billing_handle: handle,
        comments: `Flowdesk registrant update ${input.idempotencyKey}`,
      });
      return { providerContactRef: handle };
    } catch (error) {
      throw mapError(error);
    }
  },

  async startTransferIn(input) {
    const parsed = requireParsed(input.fqdn);
    try {
      const handle = await createCustomer(input.contact);
      const response = await openProviderClient.post<OpenproviderData>("domains/transfer", {
        domain: { name: parsed.sld, extension: parsed.tld },
        auth_code: input.authCode,
        owner_handle: handle,
        admin_handle: handle,
        tech_handle: handle,
        billing_handle: handle,
        name_servers: input.nameservers?.map((name) => ({ name })),
        comments: `Flowdesk ${input.idempotencyKey}`,
      });
      const ref = String(response.data?.id || response.data?.order_id || crypto.randomUUID());
      return {
        jobId: `openprovider-transfer:${ref}`,
        providerRef: ref,
        provider: "openprovider",
        status: "processing",
        fqdn: parsed.fqdn,
      };
    } catch (error) {
      throw mapError(error);
    }
  },

  async getTransferStatus(providerRef) {
    try {
      const response = await openProviderClient.get<OpenproviderData>(
        `domains/transfers/${encodeURIComponent(providerRef)}`,
      );
      return {
        status: String(response.data?.status || "pending"),
        detail: String(response.data?.description || "") || null,
        providerRef,
      };
    } catch (error) {
      throw mapError(error);
    }
  },

  async getCapabilities(tld): Promise<DomainProviderCapabilities> {
    return {
      tld,
      register: true,
      transferIn: true,
      transferOut: true,
      renew: true,
      privacy: true,
      dnssec: true,
      nameserverUpdate: true,
      authCodeRequest: true,
      requiresDocument: tldRequiresBrDocument(tld),
    };
  },

  async healthCheck() {
    const startedAt = Date.now();
    try {
      await openProviderClient.authenticate();
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Falha na Openprovider.",
      };
    }
  },
};
