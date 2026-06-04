import crypto from "node:crypto";
import { XMLParser } from "fast-xml-parser";
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
import { normalizePhoneParts, splitContactName } from "./http";

type OpenSrsInput =
  | string
  | number
  | boolean
  | null
  | undefined
  | OpenSrsInput[]
  | { [key: string]: OpenSrsInput };

type OpenSrsRecord = Record<string, unknown>;

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

function baseUrl() {
  const configuredUrl = process.env.HOVER_OPENSRS_BASE_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/$/, "");
  return process.env.HOVER_OPENSRS_ENVIRONMENT === "production"
    ? "https://rr-n1-tor.opensrs.net:55443"
    : "https://horizon.opensrs.net:55443";
}

function configured() {
  return Boolean(
    process.env.HOVER_OPENSRS_USERNAME?.trim() &&
      process.env.HOVER_OPENSRS_API_KEY?.trim(),
  );
}

function asRecord(value: unknown): OpenSrsRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as OpenSrsRecord)
    : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function escapeXml(value: unknown) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function itemXml(key: string, value: OpenSrsInput): string {
  if (value === undefined) return "";
  const encodedKey = escapeXml(key);

  if (Array.isArray(value)) {
    return `<item key="${encodedKey}"><dt_array>${value
      .map((item, index) => itemXml(String(index), item))
      .join("")}</dt_array></item>`;
  }

  if (value && typeof value === "object") {
    return `<item key="${encodedKey}"><dt_assoc>${Object.entries(value)
      .map(([entryKey, entryValue]) => itemXml(entryKey, entryValue))
      .join("")}</dt_assoc></item>`;
  }

  if (value === null || value === "") return `<item key="${encodedKey}"/>`;
  return `<item key="${encodedKey}">${escapeXml(value)}</item>`;
}

function buildCommandXml(
  action: string,
  attributes: Record<string, OpenSrsInput> = {},
  topLevel: Record<string, OpenSrsInput> = {},
) {
  const command: Record<string, OpenSrsInput> = {
    protocol: "XCP",
    action: action.toUpperCase(),
    object: "DOMAIN",
    ...topLevel,
  };
  if (Object.keys(attributes).length) command.attributes = attributes;

  return [
    "<?xml version='1.0' encoding='UTF-8' standalone='no'?>",
    "<!DOCTYPE OPS_envelope SYSTEM 'ops.dtd'>",
    "<OPS_envelope><header><version>0.9</version></header><body><data_block><dt_assoc>",
    ...Object.entries(command).map(([key, value]) => itemXml(key, value)),
    "</dt_assoc></data_block></body></OPS_envelope>",
  ].join("");
}

function decodeItem(value: unknown): unknown {
  const item = asRecord(value);
  if ("dt_assoc" in item) return decodeAssoc(item.dt_assoc);
  if ("dt_array" in item) return decodeArray(item.dt_array);
  return item["#text"] === undefined ? "" : String(item["#text"]);
}

function decodeAssoc(value: unknown): OpenSrsRecord {
  const assoc = asRecord(value);
  const result: OpenSrsRecord = {};
  for (const rawItem of asArray(assoc.item)) {
    const item = asRecord(rawItem);
    const key = String(item["@_key"] || "");
    if (key) result[key] = decodeItem(item);
  }
  return result;
}

function decodeArray(value: unknown) {
  const array = asRecord(value);
  return asArray(array.item)
    .map((item) => {
      const record = asRecord(item);
      return {
        key: Number(record["@_key"]),
        value: decodeItem(record),
      };
    })
    .sort((left, right) => left.key - right.key)
    .map((item) => item.value);
}

function parseResponseXml(xml: string) {
  const parsed = asRecord(xmlParser.parse(xml));
  const envelope = asRecord(parsed.OPS_envelope);
  const body = asRecord(envelope.body);
  const dataBlock = asRecord(body.data_block);
  const response = decodeAssoc(dataBlock.dt_assoc);
  if (!Object.keys(response).length) {
    throw new DomainProviderError("hover", "temporary", "Resposta XML vazia da Hover.", 502);
  }
  return response;
}

function responseAttributes(response: OpenSrsRecord) {
  return asRecord(response.attributes);
}

function responseErrorKind(code: number, message: string) {
  if (code === 310 || /rate|too many|exceeded max/i.test(message)) return "rate_limited" as const;
  if (
    [408, 500, 502, 503, 504].includes(code) ||
    /temporar|try again|unavailable|maintenance|timeout|connection/i.test(message)
  ) {
    return "temporary" as const;
  }
  if (
    /not supported|unsupported|capability is not enabled|unknown tld|invalid tld|invalid extension|not enabled for domain/i.test(
      message,
    )
  ) {
    return "unsupported" as const;
  }
  return "permanent" as const;
}

async function request(
  action: string,
  attributes: Record<string, OpenSrsInput> = {},
  topLevel: Record<string, OpenSrsInput> = {},
) {
  if (!configured()) {
    throw new DomainProviderError("hover", "not_configured", "Hover/OpenSRS nao configurada.", 503);
  }

  const xml = buildCommandXml(action, attributes, topLevel);
  const apiKey = process.env.HOVER_OPENSRS_API_KEY!.trim();
  const firstSignature = crypto.createHash("md5").update(xml + apiKey).digest("hex");
  const signature = crypto.createHash("md5").update(firstSignature + apiKey).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(baseUrl(), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "text/xml",
        "X-Username": process.env.HOVER_OPENSRS_USERNAME!.trim(),
        "X-Signature": signature,
      },
      body: xml,
    });
    const rawXml = await response.text();
    if (!response.ok) {
      const kind = responseErrorKind(response.status, rawXml);
      throw new DomainProviderError(
        "hover",
        kind,
        `Hover/OpenSRS HTTP ${response.status}.`,
        response.status,
        rawXml,
      );
    }

    const parsed = parseResponseXml(rawXml);
    const code = Number(parsed.response_code || 500);
    const message = String(parsed.response_text || `Hover/OpenSRS respondeu ${code}.`);
    if (String(parsed.is_success || "") !== "1") {
      const kind = responseErrorKind(code, message);
      throw new DomainProviderError(
        "hover",
        kind,
        message,
        kind === "rate_limited" ? 429 : kind === "temporary" ? 503 : 422,
        parsed,
      );
    }
    return parsed;
  } catch (error) {
    if (error instanceof DomainProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new DomainProviderError("hover", "temporary", "Hover/OpenSRS excedeu o tempo limite.", 504);
    }
    throw new DomainProviderError(
      "hover",
      "temporary",
      error instanceof Error ? error.message : "Falha de rede na Hover/OpenSRS.",
      503,
      error,
    );
  } finally {
    clearTimeout(timeout);
  }
}

function parsedDomain(fqdn: string) {
  const parsed = parseFqdn(fqdn);
  if (!parsed) throw new DomainProviderError("hover", "validation", "Dominio invalido.", 400);
  return parsed;
}

function profileCredentials(fqdn: string) {
  const secret =
    process.env.HOVER_OPENSRS_PROFILE_SECRET?.trim() ||
    process.env.DOMAIN_CHECKOUT_SECRET?.trim() ||
    process.env.HOVER_OPENSRS_API_KEY?.trim() ||
    "flowdesk-hover";
  const domainHash = crypto.createHash("sha256").update(fqdn).digest("hex");
  const passwordHash = crypto.createHmac("sha256", secret).update(fqdn).digest("hex");
  return {
    username: `fd${domainHash.slice(0, 18)}`,
    password: `Fd${passwordHash.slice(0, 18)}`,
  };
}

function contactSet(contact: DomainContact) {
  const name = splitContactName(contact.fullName);
  const phone = normalizePhoneParts(contact.phone);
  const common = {
    first_name: name.firstName,
    last_name: name.lastName,
    org_name: contact.documentType === "cnpj" ? contact.fullName : "",
    address1: contact.street,
    city: contact.city,
    state: contact.state,
    country: contact.country.toUpperCase(),
    postal_code: contact.postalCode,
    phone: `${phone.countryCode}.${phone.areaCode}${phone.subscriberNumber}`,
    email: contact.email,
  };
  return {
    owner: common,
    admin: common,
    billing: common,
    tech: common,
  };
}

function tldData(tld: string, contact: DomainContact) {
  if (!tldRequiresBrDocument(tld)) return undefined;
  const document = contact.documentNumber?.replace(/\D/g, "");
  if (!document) {
    throw new DomainProviderError(
      "hover",
      "validation",
      "CPF ou CNPJ obrigatorio para registrar dominios .br.",
      400,
    );
  }
  return { br_register_number: document };
}

function nameserverList(nameservers: string[] = []) {
  return nameservers.map((name, index) => ({ name, sortorder: index + 1 }));
}

async function getPrice(fqdn: string, regType: "new" | "renewal" | "transfer") {
  const response = await request("get_price", {
    domain: fqdn,
    period: 1,
    reg_type: regType,
  });
  const attributes = responseAttributes(response);
  const price = Number(attributes.price || 0);
  if (!Number.isFinite(price) || price <= 0) {
    throw new DomainProviderError(
      "hover",
      "temporary",
      `Hover/OpenSRS nao retornou preco para ${fqdn}.`,
      502,
      response,
    );
  }
  return {
    price,
    premium: String(attributes.is_registry_premium || "") === "1",
  };
}

function nameserversFrom(value: unknown) {
  return asArray(value)
    .map((item) => String(asRecord(item).name || ""))
    .filter(Boolean);
}

function isEnabled(value: unknown) {
  return ["1", "true", "y", "yes", "on", "enabled"].includes(String(value || "").toLowerCase());
}

export const hoverAdapter: DomainProviderAdapter = {
  name: "hover",
  priority: 3,
  isConfigured: configured,

  async checkAvailability(fqdn): Promise<DomainAvailabilityResult> {
    const domain = parsedDomain(fqdn);
    const [lookup, registration] = await Promise.all([
      request("lookup", { domain: domain.fqdn, no_cache: 1 }),
      getPrice(domain.fqdn, "new"),
    ]);
    const lookupAttributes = responseAttributes(lookup);
    const [renewal, transfer] = await Promise.all([
      getPrice(domain.fqdn, "renewal").catch(() => registration),
      getPrice(domain.fqdn, "transfer").catch(() => registration),
    ]);
    const status = String(lookupAttributes.status || "").toLowerCase();
    return {
      fqdn: domain.fqdn,
      sld: domain.sld,
      tld: domain.tld,
      isAvailable: status === "available" || Number(lookup.response_code) === 210,
      isPremium: registration.premium,
      supported: true,
      registrationCost: registration.price,
      renewalCost: renewal.price,
      transferCost: transfer.price,
      currency: process.env.HOVER_OPENSRS_CURRENCY?.trim().toUpperCase() || "USD",
      provider: "hover",
      reason: String(lookup.response_text || status || "") || null,
    };
  },

  async checkAvailabilityBatch(fqdns) {
    return Promise.all(fqdns.map((fqdn) => this.checkAvailability(fqdn)));
  },

  async registerDomain(input): Promise<DomainProviderJob> {
    const domain = parsedDomain(input.fqdn);
    const profile = profileCredentials(domain.fqdn);
    const pricing = await getPrice(domain.fqdn, "new");
    const nameservers = input.nameservers || [];
    const response = await request("sw_register", {
      handle: "process",
      reg_type: "new",
      domain: domain.fqdn,
      period: input.periodYears,
      reg_username: profile.username,
      reg_password: profile.password,
      auto_renew: input.autoRenew ? 1 : 0,
      link_domains: 0,
      f_lock_domain: 1,
      f_whois_privacy: 1,
      custom_tech_contact: 1,
      custom_nameservers: nameservers.length ? 1 : 0,
      nameserver_list: nameserverList(nameservers),
      contact_set: contactSet(input.contact),
      tld_data: tldData(domain.tld, input.contact),
      premium_price_to_verify: pricing.premium ? pricing.price : undefined,
      comments: `Flowdesk ${input.idempotencyKey}`,
    });
    const attributes = responseAttributes(response);
    const orderId = String(attributes.order_id || attributes.id || crypto.randomUUID());
    return {
      jobId: `hover-register:${orderId}`,
      providerRef: domain.fqdn,
      provider: "hover",
      status: Number(response.response_code) === 250 ? "processing" : "completed",
      fqdn: domain.fqdn,
    };
  },

  async getDomain(providerDomainId, fqdn): Promise<ProviderDomainDetail | null> {
    const domain = parsedDomain(fqdn || providerDomainId);
    try {
      const response = await request("get", { type: "all_info" }, { domain: domain.fqdn });
      const attributes = responseAttributes(response);
      const listedNameservers = nameserversFrom(attributes.nameserver_list);
      return {
        providerDomainId: domain.fqdn,
        fqdn: domain.fqdn,
        status: String(attributes.status || "active"),
        expirationDate:
          String(attributes.registry_expiredate || attributes.expiredate || "") || null,
        autoRenew: isEnabled(attributes.auto_renew),
        transferLock: isEnabled(attributes.lock_state),
        nameservers:
          listedNameservers.length > 0
            ? listedNameservers
            : [1, 2, 3, 4, 5, 6]
                .map((index) => String(attributes[`fqdn${index}`] || ""))
                .filter(Boolean),
      };
    } catch (error) {
      if (error instanceof DomainProviderError && /not found|does not belong/i.test(error.message)) {
        return null;
      }
      throw error;
    }
  },

  async renewDomain(providerDomainId, periodYears, fqdn) {
    const domain = parsedDomain(fqdn || providerDomainId);
    const details = await this.getDomain(providerDomainId, domain.fqdn);
    const expirationYear = details?.expirationDate?.match(/\d{4}/)?.[0];
    if (!expirationYear) {
      throw new DomainProviderError(
        "hover",
        "permanent",
        "Hover/OpenSRS nao retornou o ano atual de expiracao.",
        502,
      );
    }
    await request("renew", {
      handle: "process",
      domain: domain.fqdn,
      period: periodYears,
      currentexpirationyear: expirationYear,
      auto_renew: 1,
    });
  },

  async updateNameservers(providerDomainId, nameservers, fqdn) {
    const domain = parsedDomain(fqdn || providerDomainId);
    if (nameservers.length < 2) {
      throw new DomainProviderError("hover", "validation", "Informe ao menos dois nameservers.", 400);
    }
    await request(
      "advanced_update_nameservers",
      { op_type: "assign", assign_ns: nameservers },
      { domain: domain.fqdn },
    );
  },

  async setTransferLock(providerDomainId, locked, fqdn) {
    const domain = parsedDomain(fqdn || providerDomainId);
    await request("modify", {
      affect_domains: 0,
      lock_state: locked ? 1 : 0,
      data: "status",
      domain: domain.fqdn,
    });
  },

  async requestAuthCode(providerDomainId, fqdn) {
    const domain = parsedDomain(fqdn || providerDomainId);
    const response = await request("get", { type: "domain_auth_info" }, { domain: domain.fqdn });
    const authCode = String(responseAttributes(response).domain_auth_info || "");
    if (!authCode) {
      throw new DomainProviderError("hover", "permanent", "Hover/OpenSRS nao retornou o Auth Code.", 502);
    }
    return { authCode };
  },

  async startTransferIn(input) {
    const domain = parsedDomain(input.fqdn);
    const profile = profileCredentials(domain.fqdn);
    const nameservers = input.nameservers || [];
    const response = await request("sw_register", {
      handle: "process",
      reg_type: "transfer",
      domain: domain.fqdn,
      auth_info: input.authCode,
      reg_username: profile.username,
      reg_password: profile.password,
      auto_renew: 1,
      f_lock_domain: 1,
      f_whois_privacy: 1,
      custom_tech_contact: 1,
      custom_transfer_nameservers: nameservers.length ? 1 : 0,
      custom_nameservers: nameservers.length ? 1 : 0,
      nameserver_list: nameserverList(nameservers),
      contact_set: contactSet(input.contact),
      tld_data: tldData(domain.tld, input.contact),
      change_contact: 1,
      comments: `Flowdesk ${input.idempotencyKey}`,
    });
    const attributes = responseAttributes(response);
    const orderId = String(attributes.order_id || attributes.id || crypto.randomUUID());
    return {
      jobId: `hover-transfer:${orderId}`,
      providerRef: orderId,
      provider: "hover",
      status: "processing",
      fqdn: domain.fqdn,
    } satisfies DomainProviderJob;
  },

  async getTransferStatus(providerRef) {
    const response = await request("get_order_info", { order_id: providerRef });
    const fieldHash = asRecord(responseAttributes(response).field_hash);
    return {
      status: String(fieldHash.transfer_status || fieldHash.status || "pending"),
      detail: String(response.response_text || "") || null,
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
      dnssec: true,
      nameserverUpdate: true,
      authCodeRequest: true,
      requiresDocument: tldRequiresBrDocument(tld),
    };
  },

  async healthCheck() {
    const startedAt = Date.now();
    try {
      await request("get_balance");
      return { ok: true, latencyMs: Date.now() - startedAt };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - startedAt,
        message: error instanceof Error ? error.message : "Falha na Hover/OpenSRS.",
      };
    }
  },
};
