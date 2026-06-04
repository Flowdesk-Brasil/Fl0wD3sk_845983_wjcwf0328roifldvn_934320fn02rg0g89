import crypto from "node:crypto";
import {
  applyDomainMarkup,
  buildDomainRegistrationIdempotencyKey,
  buildDomainTransferIdempotencyKey,
  parseFqdn,
  tldRequiresBrDocument,
  type DomainContact,
  type DomainProviderName,
  type DomainQuote,
  type DomainRecord,
  type DomainTransferRecord,
} from "@/lib/domains/adapter";
import {
  createCloudflareDnsRecord,
  deleteCloudflareDnsRecord,
  ensureCloudflareZone,
  listCloudflareDnsRecords,
  updateCloudflareDnsRecord,
} from "@/lib/domains/cloudflare";
import {
  createDomainCheckoutToken,
  type DomainCheckoutTokenPayload,
} from "@/lib/domains/checkout";
import { domainProviderOrchestrator } from "@/lib/domains/provider";
import { getCurrencyToBRLRate } from "@/lib/currency";
import {
  decryptFlowSecureValue,
  encryptFlowSecureValue,
} from "@/lib/security/flowSecure";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

const QUOTE_TTL_MINUTES = 20;

type QuoteRow = {
  id: string;
  auth_user_id: number;
  fqdn: string;
  tld: string;
  operation: "register" | "renew" | "transfer" | "restore";
  period_years: number;
  provider: DomainProviderName;
  provider_cost: number;
  provider_currency: string;
  exchange_rate_to_brl: number;
  markup_percent: number;
  subtotal_brl: number;
  total_brl: number;
  is_premium: boolean;
  is_accepted: boolean;
  expires_at: string;
  provider_attempts?: unknown;
};

type ContactRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  document_type: DomainContact["documentType"];
  document_encrypted: string | null;
};

type DomainRow = {
  id: string;
  auth_user_id: number;
  fqdn: string;
  sld: string;
  tld: string;
  provider: DomainProviderName;
  provider_domain_id: string | null;
  status: DomainRecord["status"];
  registration_period: number;
  auto_renew: boolean;
  transfer_lock: boolean;
  privacy_enabled: boolean;
  dnssec_enabled: boolean;
  registered_at: string | null;
  expiration_date: string | null;
  nameservers: string[] | null;
  flowdesk_managed_dns: boolean;
  current_dns_provider: string | null;
  purchase_price_brl: number | null;
  renewal_price_brl: number | null;
  payment_order_id: number | null;
  created_at: string;
  updated_at: string;
  cloudflare_zone_id?: string | null;
};

type TransferRow = {
  id: string;
  auth_user_id: number;
  domain_id: string | null;
  fqdn: string;
  direction: "in" | "out";
  status: DomainTransferRecord["status"];
  provider: DomainProviderName | null;
  provider_ref: string | null;
  quote_id: string | null;
  payment_order_id: number | null;
  error_message: string | null;
  initiated_at: string;
  completed_at: string | null;
  updated_at: string;
  contact_id?: string | null;
  auth_code_encrypted?: string | null;
};

type DomainPaymentOrder = {
  id: number;
  user_id: number;
  amount?: string | number | null;
  currency?: string | null;
  provider_payload?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeDocument(contact: DomainContact) {
  const raw = contact.documentNumber?.trim() || "";
  return contact.documentType === "passport"
    ? raw.toUpperCase().replace(/[^A-Z0-9]/g, "")
    : raw.replace(/\D/g, "");
}

function contactFromRow(row: ContactRow): DomainContact {
  return {
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    street: row.street,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    documentType: row.document_type,
    documentNumber: decryptFlowSecureValue(row.document_encrypted, {
      purpose: "payment_pii",
      subcontext: "domain_contact_document",
    }),
  };
}

function mapDomain(row: DomainRow): DomainRecord {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    fqdn: row.fqdn,
    sld: row.sld,
    tld: row.tld,
    provider: row.provider,
    providerDomainId: row.provider_domain_id,
    status: row.status,
    registrationPeriodYears: row.registration_period,
    autoRenew: row.auto_renew,
    transferLock: row.transfer_lock,
    privacyEnabled: row.privacy_enabled,
    dnssecEnabled: row.dnssec_enabled,
    registeredAt: row.registered_at,
    expirationDate: row.expiration_date,
    nameservers: row.nameservers,
    flowdeskManagedDns: row.flowdesk_managed_dns,
    currentDnsProvider: row.current_dns_provider,
    purchasePriceBrl: row.purchase_price_brl,
    renewalPriceBrl: row.renewal_price_brl,
    paymentOrderId: row.payment_order_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTransfer(row: TransferRow): DomainTransferRecord {
  return {
    id: row.id,
    authUserId: row.auth_user_id,
    domainId: row.domain_id,
    fqdn: row.fqdn,
    direction: row.direction,
    status: row.status,
    provider: row.provider,
    providerRef: row.provider_ref,
    quoteId: row.quote_id,
    paymentOrderId: row.payment_order_id,
    errorMessage: row.error_message,
    initiatedAt: row.initiated_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

async function getQuote(
  authUserId: number,
  quoteId: string,
  operation?: QuoteRow["operation"],
  allowExpired = false,
) {
  const supabase = getSupabaseAdminClientOrThrow();
  let query = supabase
    .from("domain_quotes")
    .select("*")
    .eq("id", quoteId)
    .eq("auth_user_id", authUserId);
  if (operation) query = query.eq("operation", operation);
  const result = await query.single<QuoteRow>();
  if (result.error || !result.data) throw new Error("Cotacao de dominio nao encontrada.");
  if (!allowExpired && new Date(result.data.expires_at).getTime() <= Date.now()) {
    throw new Error("Cotacao expirada. Consulte o dominio novamente.");
  }
  return result.data;
}

async function saveContact(authUserId: number, contact: DomainContact) {
  const document = normalizeDocument(contact);
  const supabase = getSupabaseAdminClientOrThrow();
  const result = await supabase
    .from("domain_contacts")
    .insert({
      auth_user_id: authUserId,
      full_name: contact.fullName.trim(),
      email: contact.email.trim().toLowerCase(),
      phone: contact.phone.trim(),
      street: contact.street.trim(),
      city: contact.city.trim(),
      state: contact.state.trim().toUpperCase(),
      postal_code: contact.postalCode.replace(/\D/g, ""),
      country: (contact.country || "BR").trim().toUpperCase(),
      document_type: contact.documentType,
      document_hash: document
        ? crypto.createHash("sha256").update(document).digest("hex")
        : null,
      document_last4: document ? document.slice(-4) : null,
      document_encrypted: encryptFlowSecureValue(document, {
        purpose: "payment_pii",
        subcontext: "domain_contact_document",
      }),
      provider: "openprovider",
    })
    .select("id")
    .single<{ id: string }>();
  if (result.error || !result.data) {
    throw new Error(result.error?.message || "Falha ao salvar contato do dominio.");
  }
  return result.data.id;
}

export async function logDomainEvent(input: {
  domainId?: string | null;
  authUserId?: number | null;
  eventType: string;
  payload?: Record<string, unknown>;
  providerRef?: string | null;
}) {
  try {
    await getSupabaseAdminClientOrThrow().from("domain_events").insert({
      domain_id: input.domainId || null,
      auth_user_id: input.authUserId || null,
      event_type: input.eventType,
      payload: input.payload || {},
      provider_ref: input.providerRef || null,
    });
  } catch {
    // A trilha auxiliar nao deve interromper a operacao principal.
  }
}

export async function quoteDomain(input: {
  authUserId: number;
  fqdn: string;
  operation?: QuoteRow["operation"];
  periodYears?: number;
}): Promise<DomainQuote> {
  const parsed = parseFqdn(input.fqdn);
  if (!parsed) throw new Error("Dominio invalido.");
  const operation = input.operation || "register";
  const periodYears = Math.min(10, Math.max(1, input.periodYears || 1));
  const resolved = await domainProviderOrchestrator.checkAvailability(parsed.fqdn);
  const availability = resolved.value;
  if (operation === "register" && !availability.isAvailable) {
    throw new Error(`O dominio ${parsed.fqdn} nao esta disponivel para registro.`);
  }

  const unitCost =
    operation === "transfer"
      ? availability.transferCost
      : operation === "renew"
        ? availability.renewalCost
        : operation === "restore"
          ? availability.renewalCost * 2
          : availability.registrationCost;
  if (!Number.isFinite(unitCost) || unitCost <= 0) {
    throw new Error("O provedor nao retornou um preco valido para esta operacao.");
  }
  const providerCost = roundMoney(unitCost * periodYears);
  const exchangeRateToBrl = await getCurrencyToBRLRate(availability.currency);
  const pricing = applyDomainMarkup({ providerCost, exchangeRateToBrl });
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + QUOTE_TTL_MINUTES * 60_000).toISOString();

  const result = await getSupabaseAdminClientOrThrow().from("domain_quotes").insert({
    id,
    auth_user_id: input.authUserId,
    fqdn: parsed.fqdn,
    tld: parsed.tld,
    operation,
    period_years: periodYears,
    provider: resolved.provider,
    provider_cost: providerCost,
    provider_currency: availability.currency,
    exchange_rate_to_brl: exchangeRateToBrl,
    provider_cost_usd: providerCost,
    exchange_rate_usd_brl: exchangeRateToBrl,
    markup_percent: pricing.markupPercent,
    subtotal_brl: pricing.subtotalBrl,
    total_brl: pricing.totalBrl,
    is_premium: availability.isPremium,
    provider_attempts: resolved.attempts,
    expires_at: expiresAt,
  });
  if (result.error) throw new Error(result.error.message);

  return {
    id,
    fqdn: parsed.fqdn,
    tld: parsed.tld,
    operation,
    periodYears,
    provider: resolved.provider,
    providerCost,
    providerCurrency: availability.currency,
    exchangeRateToBrl,
    markupPercent: pricing.markupPercent,
    subtotalBrl: pricing.subtotalBrl,
    totalBrl: pricing.totalBrl,
    isPremium: availability.isPremium,
    expiresAt,
  };
}

function validateContactForTld(contact: DomainContact, tld: string) {
  if (!contact.fullName || !contact.email || !contact.phone || !contact.street || !contact.city) {
    throw new Error("Preencha todos os dados do titular do dominio.");
  }
  if (tldRequiresBrDocument(tld) && normalizeDocument(contact).length < 11) {
    throw new Error("Este dominio exige CPF ou CNPJ valido do titular.");
  }
}

async function acceptQuote(quoteId: string, authUserId: number) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("domain_quotes")
    .update({ is_accepted: true, accepted_at: new Date().toISOString() })
    .eq("id", quoteId)
    .eq("auth_user_id", authUserId);
  if (result.error) throw new Error(result.error.message);
}

export async function prepareDomainCheckout(input: {
  authUserId: number;
  quoteId: string;
  contact: DomainContact;
}) {
  const quote = await getQuote(input.authUserId, input.quoteId, "register");
  validateContactForTld(input.contact, quote.tld);
  const contactId = await saveContact(input.authUserId, input.contact);
  const parsed = parseFqdn(quote.fqdn)!;
  const idempotencyKey = buildDomainRegistrationIdempotencyKey({
    userId: input.authUserId,
    fqdn: quote.fqdn,
    quoteId: quote.id,
  });
  const supabase = getSupabaseAdminClientOrThrow();
  const existing = await supabase
    .from("domains")
    .select("*")
    .eq("auth_user_id", input.authUserId)
    .eq("fqdn", quote.fqdn)
    .maybeSingle<DomainRow>();

  let domain: DomainRow;
  if (existing.data) {
    if (!["draft", "quote_created", "payment_pending", "failed", "cancelled"].includes(existing.data.status)) {
      throw new Error("Este dominio ja esta vinculado a sua conta.");
    }
    const updated = await supabase
      .from("domains")
      .update({
        provider: quote.provider,
        registrant_contact_id: contactId,
        status: "payment_pending",
        registration_period: quote.period_years,
        purchase_price_brl: quote.total_brl,
        renewal_price_brl: quote.total_brl,
        provider_cost: quote.provider_cost,
        provider_currency: quote.provider_currency,
        markup_percent: quote.markup_percent,
        idempotency_key: idempotencyKey,
        quote_id: quote.id,
      })
      .eq("id", existing.data.id)
      .select("*")
      .single<DomainRow>();
    if (updated.error || !updated.data) throw new Error(updated.error?.message || "Falha ao preparar dominio.");
    domain = updated.data;
  } else {
    const inserted = await supabase
      .from("domains")
      .insert({
        auth_user_id: input.authUserId,
        fqdn: parsed.fqdn,
        sld: parsed.sld,
        tld: parsed.tld,
        provider: quote.provider,
        registrant_contact_id: contactId,
        status: "payment_pending",
        domain_type: "pending",
        registration_period: quote.period_years,
        auto_renew: true,
        transfer_lock: true,
        purchase_price_brl: quote.total_brl,
        renewal_price_brl: quote.total_brl,
        provider_cost: quote.provider_cost,
        provider_currency: quote.provider_currency,
        provider_cost_usd: quote.provider_cost,
        markup_percent: quote.markup_percent,
        idempotency_key: idempotencyKey,
        quote_id: quote.id,
      })
      .select("*")
      .single<DomainRow>();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Falha ao preparar dominio.");
    domain = inserted.data;
  }

  await acceptQuote(quote.id, input.authUserId);
  const payload: DomainCheckoutTokenPayload = {
    version: 1,
    authUserId: input.authUserId,
    operation: "register",
    fqdn: quote.fqdn,
    quoteId: quote.id,
    contactId,
    domainId: domain.id,
    amount: Number(quote.total_brl),
    currency: "BRL",
    expiresAt: quote.expires_at,
  };
  return { domain: mapDomain(domain), quote, purchaseContext: { type: "domain", token: createDomainCheckoutToken(payload) } };
}

export async function prepareDomainTransferCheckout(input: {
  authUserId: number;
  quoteId: string;
  authCode: string;
  contact: DomainContact;
}) {
  const quote = await getQuote(input.authUserId, input.quoteId, "transfer");
  validateContactForTld(input.contact, quote.tld);
  const authCode = input.authCode.trim();
  if (authCode.length < 4) throw new Error("Informe o Auth Code/EPP do dominio.");
  const contactId = await saveContact(input.authUserId, input.contact);
  const idempotencyKey = buildDomainTransferIdempotencyKey({
    userId: input.authUserId,
    fqdn: quote.fqdn,
    direction: "in",
    quoteId: quote.id,
  });
  const supabase = getSupabaseAdminClientOrThrow();
  const existing = await supabase
    .from("domain_transfers")
    .select("*")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle<TransferRow>();
  let transfer = existing.data;
  if (!transfer) {
    const inserted = await supabase
      .from("domain_transfers")
      .insert({
        auth_user_id: input.authUserId,
        fqdn: quote.fqdn,
        direction: "in",
        status: "waiting_payment",
        provider: quote.provider,
        quote_id: quote.id,
        contact_id: contactId,
        auth_code_hash: crypto.createHash("sha256").update(authCode).digest("hex"),
        auth_code_encrypted: encryptFlowSecureValue(authCode, {
          purpose: "payment_pii",
          subcontext: "domain_transfer_auth_code",
        }),
        idempotency_key: idempotencyKey,
      })
      .select("*")
      .single<TransferRow>();
    if (inserted.error || !inserted.data) throw new Error(inserted.error?.message || "Falha ao preparar transferencia.");
    transfer = inserted.data;
  }
  await acceptQuote(quote.id, input.authUserId);
  const payload: DomainCheckoutTokenPayload = {
    version: 1,
    authUserId: input.authUserId,
    operation: "transfer",
    fqdn: quote.fqdn,
    quoteId: quote.id,
    contactId,
    transferId: transfer.id,
    amount: Number(quote.total_brl),
    currency: "BRL",
    expiresAt: quote.expires_at,
  };
  return { transfer: mapTransfer(transfer), quote, purchaseContext: { type: "domain", token: createDomainCheckoutToken(payload) } };
}

async function loadContact(id: string) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("domain_contacts")
    .select("*")
    .eq("id", id)
    .single<ContactRow>();
  if (result.error || !result.data) throw new Error("Contato do dominio nao encontrado.");
  return contactFromRow(result.data);
}

function purchaseContextFromOrder(order: DomainPaymentOrder) {
  if (!isRecord(order.provider_payload) || !isRecord(order.provider_payload.purchase_context)) return null;
  const context = order.provider_payload.purchase_context;
  if (context.type !== "domain") return null;
  return context;
}

export async function finalizePaidDomainOrder(order: DomainPaymentOrder) {
  const context = purchaseContextFromOrder(order);
  if (!context) return false;
  const authUserId = Number(context.authUserId);
  const quoteId = String(context.quoteId || "");
  const contactId = String(context.contactId || "");
  const operation = context.operation === "transfer" ? "transfer" : "register";
  if (authUserId !== order.user_id || !quoteId || !contactId) {
    throw new Error("Contexto de pagamento do dominio invalido.");
  }
  const quote = await getQuote(authUserId, quoteId, operation, true);
  if (
    roundMoney(Number(order.amount || 0)) !== roundMoney(Number(quote.total_brl)) ||
    String(order.currency || "").toUpperCase() !== "BRL"
  ) {
    throw new Error("O valor pago nao corresponde a cotacao do dominio.");
  }
  const contact = await loadContact(contactId);
  const cloudflare = await ensureCloudflareZone(quote.fqdn);
  const supabase = getSupabaseAdminClientOrThrow();

  if (operation === "register") {
    const domainId = String(context.domainId || "");
    const current = await supabase.from("domains").select("*").eq("id", domainId).eq("auth_user_id", authUserId).single<DomainRow>();
    if (current.error || !current.data) throw new Error("Dominio pendente nao encontrado.");
    if (["active", "registration_pending"].includes(current.data.status)) return true;

    const registered = await domainProviderOrchestrator.withFallback("register", (provider) =>
      provider.registerDomain({
        fqdn: quote.fqdn,
        periodYears: quote.period_years,
        autoRenew: true,
        contact,
        nameservers: cloudflare.nameservers,
        idempotencyKey: buildDomainRegistrationIdempotencyKey({
          userId: authUserId,
          fqdn: quote.fqdn,
          quoteId: quote.id,
        }),
      }),
    );
    const now = new Date().toISOString();
    const update = await supabase
      .from("domains")
      .update({
        provider: registered.provider,
        provider_domain_id: registered.value.providerRef || quote.fqdn,
        provider_attempts: registered.attempts,
        status: registered.value.status === "completed" ? "active" : "registration_pending",
        domain_type: "registered",
        payment_order_id: order.id,
        registered_at: now,
        nameservers: cloudflare.nameservers,
        flowdesk_managed_dns: true,
        current_dns_provider: "cloudflare",
        cloudflare_zone_id: cloudflare.zoneId,
        cloudflare_zone_status: cloudflare.status,
        cloudflare_dnssec: cloudflare.dnssec,
        dnssec_enabled: Boolean(cloudflare.dnssec),
        last_synced_at: now,
      })
      .eq("id", domainId);
    if (update.error) throw new Error(update.error.message);
    await supabase.from("domain_ledger").insert({
      domain_id: domainId,
      auth_user_id: authUserId,
      event_type: "registration",
      fqdn: quote.fqdn,
      provider_cost: quote.provider_cost,
      provider_currency: quote.provider_currency,
      exchange_rate_to_brl: quote.exchange_rate_to_brl,
      provider_cost_usd: quote.provider_cost,
      exchange_rate_usd_brl: quote.exchange_rate_to_brl,
      markup_percent: quote.markup_percent,
      amount_brl: quote.total_brl,
      payment_order_id: order.id,
      quote_id: quote.id,
      status: "confirmed",
    });
    await logDomainEvent({
      domainId,
      authUserId,
      eventType: "registered",
      providerRef: registered.value.providerRef,
      payload: { provider: registered.provider, attempts: registered.attempts, cloudflareZoneId: cloudflare.zoneId },
    });
    return true;
  }

  const transferId = String(context.transferId || "");
  const current = await supabase.from("domain_transfers").select("*").eq("id", transferId).eq("auth_user_id", authUserId).single<TransferRow>();
  if (current.error || !current.data) throw new Error("Transferencia pendente nao encontrada.");
  if (["submitted_to_provider", "completed"].includes(current.data.status)) return true;
  const authCode = decryptFlowSecureValue(current.data.auth_code_encrypted || null, {
    purpose: "payment_pii",
    subcontext: "domain_transfer_auth_code",
  });
  if (!authCode) throw new Error("Auth Code da transferencia indisponivel.");
  const transferred = await domainProviderOrchestrator.withFallback("transfer_in", (provider) =>
    provider.startTransferIn({
      fqdn: quote.fqdn,
      authCode,
      contact,
      nameservers: cloudflare.nameservers,
      idempotencyKey: buildDomainTransferIdempotencyKey({
        userId: authUserId,
        fqdn: quote.fqdn,
        direction: "in",
        quoteId: quote.id,
      }),
    }),
  );
  const update = await supabase.from("domain_transfers").update({
    status: "submitted_to_provider",
    provider: transferred.provider,
    provider_ref: transferred.value.providerRef,
    provider_attempts: transferred.attempts,
    payment_order_id: order.id,
    auth_code_encrypted: null,
  }).eq("id", transferId);
  if (update.error) throw new Error(update.error.message);

  const parsed = parseFqdn(quote.fqdn)!;
  const existingDomain = await supabase
    .from("domains")
    .select("id")
    .eq("auth_user_id", authUserId)
    .eq("fqdn", quote.fqdn)
    .maybeSingle<{ id: string }>();
  const domainPayload = {
    provider: transferred.provider,
    provider_domain_id: transferred.value.providerRef || quote.fqdn,
    registrant_contact_id: contactId,
    status: "transfer_in_pending",
    domain_type: "transferred",
    registration_period: quote.period_years,
    auto_renew: true,
    transfer_lock: true,
    purchase_price_brl: quote.total_brl,
    renewal_price_brl: quote.total_brl,
    provider_cost: quote.provider_cost,
    provider_currency: quote.provider_currency,
    provider_cost_usd: quote.provider_cost,
    markup_percent: quote.markup_percent,
    payment_order_id: order.id,
    quote_id: quote.id,
    nameservers: cloudflare.nameservers,
    flowdesk_managed_dns: true,
    current_dns_provider: "cloudflare",
    cloudflare_zone_id: cloudflare.zoneId,
    cloudflare_zone_status: cloudflare.status,
    cloudflare_dnssec: cloudflare.dnssec,
    dnssec_enabled: Boolean(cloudflare.dnssec),
    provider_attempts: transferred.attempts,
  };
  if (existingDomain.data) {
    const domainUpdate = await supabase.from("domains").update(domainPayload).eq("id", existingDomain.data.id);
    if (domainUpdate.error) throw new Error(domainUpdate.error.message);
  } else {
    const domainInsert = await supabase.from("domains").insert({
      auth_user_id: authUserId,
      fqdn: parsed.fqdn,
      sld: parsed.sld,
      tld: parsed.tld,
      ...domainPayload,
    });
    if (domainInsert.error) throw new Error(domainInsert.error.message);
  }
  return true;
}

export async function listUserDomains(authUserId: number) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("domains")
    .select("*")
    .eq("auth_user_id", authUserId)
    .order("created_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return (result.data || []).map((row) => mapDomain(row as DomainRow));
}

export async function getUserDomain(authUserId: number, domainId: string) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("domains")
    .select("*")
    .eq("id", domainId)
    .eq("auth_user_id", authUserId)
    .maybeSingle<DomainRow>();
  if (result.error) throw new Error(result.error.message);
  return result.data ? mapDomain(result.data) : null;
}

async function getDomainRow(authUserId: number, domainId: string) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("domains")
    .select("*")
    .eq("id", domainId)
    .eq("auth_user_id", authUserId)
    .single<DomainRow>();
  if (result.error || !result.data) throw new Error("Dominio nao encontrado.");
  return result.data;
}

export async function setDomainAutoRenew(input: { authUserId: number; domainId: string; autoRenew: boolean }) {
  const domain = await getDomainRow(input.authUserId, input.domainId);
  const result = await getSupabaseAdminClientOrThrow().from("domains").update({ auto_renew: input.autoRenew }).eq("id", domain.id);
  if (result.error) throw new Error(result.error.message);
  await logDomainEvent({
    domainId: domain.id,
    authUserId: input.authUserId,
    eventType: "auto_renew_toggled",
    payload: { autoRenew: input.autoRenew },
  });
}

export async function updateDomainNameservers(input: { authUserId: number; domainId: string; nameservers: string[] }) {
  const domain = await getDomainRow(input.authUserId, input.domainId);
  const provider = domainProviderOrchestrator.getProvider(domain.provider);
  if (!provider || !domain.provider_domain_id) throw new Error("Registrador do dominio indisponivel.");
  await provider.updateNameservers(domain.provider_domain_id, input.nameservers, domain.fqdn);
  const result = await getSupabaseAdminClientOrThrow().from("domains").update({ nameservers: input.nameservers }).eq("id", domain.id);
  if (result.error) throw new Error(result.error.message);
}

export async function setDomainTransferLock(input: { authUserId: number; domainId: string; locked: boolean }) {
  const domain = await getDomainRow(input.authUserId, input.domainId);
  const provider = domainProviderOrchestrator.getProvider(domain.provider);
  if (!provider || !domain.provider_domain_id) throw new Error("Registrador do dominio indisponivel.");
  await provider.setTransferLock(domain.provider_domain_id, input.locked, domain.fqdn);
  const result = await getSupabaseAdminClientOrThrow().from("domains").update({ transfer_lock: input.locked }).eq("id", domain.id);
  if (result.error) throw new Error(result.error.message);
}

export async function requestDomainAuthCode(input: { authUserId: number; domainId: string }) {
  const domain = await getDomainRow(input.authUserId, input.domainId);
  const provider = domainProviderOrchestrator.getProvider(domain.provider);
  if (!provider || !domain.provider_domain_id) throw new Error("Registrador do dominio indisponivel.");
  if (domain.transfer_lock) throw new Error("Desative o bloqueio de transferencia antes de solicitar o Auth Code.");
  return provider.requestAuthCode(domain.provider_domain_id, domain.fqdn);
}

export async function listUserDomainTransfers(input: { authUserId: number }) {
  const result = await getSupabaseAdminClientOrThrow()
    .from("domain_transfers")
    .select("*")
    .eq("auth_user_id", input.authUserId)
    .order("initiated_at", { ascending: false });
  if (result.error) throw new Error(result.error.message);
  return (result.data || []).map((row) => mapTransfer(row as TransferRow));
}

export async function listDomainDnsRecords(authUserId: number, domainId: string) {
  const domain = await getDomainRow(authUserId, domainId);
  if (!domain.cloudflare_zone_id) return [];
  return listCloudflareDnsRecords(domain.cloudflare_zone_id);
}

export async function createDomainDnsRecord(authUserId: number, domainId: string, input: {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number | null;
}) {
  const domain = await getDomainRow(authUserId, domainId);
  if (!domain.cloudflare_zone_id) throw new Error("Zona Cloudflare ainda nao configurada.");
  const record = await createCloudflareDnsRecord(domain.cloudflare_zone_id, input);
  await logDomainEvent({ domainId, authUserId, eventType: "dns_record_created", payload: { type: input.type, name: input.name } });
  return record;
}

export async function deleteDomainDnsRecord(authUserId: number, domainId: string, recordId: string) {
  const domain = await getDomainRow(authUserId, domainId);
  if (!domain.cloudflare_zone_id) throw new Error("Zona Cloudflare ainda nao configurada.");
  await deleteCloudflareDnsRecord(domain.cloudflare_zone_id, recordId);
  await logDomainEvent({ domainId, authUserId, eventType: "dns_record_deleted", payload: { recordId } });
}

export async function updateDomainDnsRecord(authUserId: number, domainId: string, recordId: string, input: {
  type: string;
  name: string;
  content: string;
  ttl?: number;
  proxied?: boolean;
  priority?: number | null;
}) {
  const domain = await getDomainRow(authUserId, domainId);
  if (!domain.cloudflare_zone_id) throw new Error("Zona Cloudflare ainda nao configurada.");
  const record = await updateCloudflareDnsRecord(domain.cloudflare_zone_id, recordId, input);
  await logDomainEvent({ domainId, authUserId, eventType: "dns_record_updated", payload: { recordId, type: input.type, name: input.name } });
  return record;
}
