import { promises as dns } from "node:dns";
import type { DomainAvailabilityResult } from "@/lib/domains/adapter";
import { parseFqdn } from "@/lib/domains/adapter";
import { applyTldCatalogFallback } from "@/lib/domains/tldCatalog";

export type PublicAvailabilityState = "available" | "taken" | "unknown";

const RDAP_TIMEOUT_MS = 7_000;
const RDAP_CONCURRENCY = 5;

function rdapUrl(fqdn: string, tld: string) {
  if (tld === "br" || tld.endsWith(".br")) {
    return `https://rdap.registro.br/domain/${encodeURIComponent(fqdn)}`;
  }
  return `https://rdap.org/domain/${encodeURIComponent(fqdn)}`;
}

function isNotFoundPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const record = payload as Record<string, unknown>;
  const errorCode = Number(record.errorCode || record.status || 0);
  const title = String(record.title || record.description || record.detail || "");
  return errorCode === 404 || /not found|nao encontrado|does not exist/i.test(title);
}

async function fetchRdapState(fqdn: string, tld: string): Promise<PublicAvailabilityState> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RDAP_TIMEOUT_MS);
  try {
    const response = await fetch(rdapUrl(fqdn, tld), {
      method: "GET",
      headers: { Accept: "application/rdap+json, application/json" },
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status === 404) return "available";
    if (response.status === 429 || response.status >= 500) return "unknown";

    const rawText = await response.text();
    let payload: unknown = null;
    if (rawText.trim()) {
      try {
        payload = JSON.parse(rawText);
      } catch {
        payload = rawText;
      }
    }

    if (response.ok) {
      return isNotFoundPayload(payload) ? "available" : "taken";
    }

    if (response.status === 400 || response.status === 422) {
      return isNotFoundPayload(payload) || /not found|unknown domain/i.test(rawText)
        ? "available"
        : "unknown";
    }

    return "unknown";
  } catch {
    return "unknown";
  } finally {
    clearTimeout(timeout);
  }
}

async function dnsNxDomainHint(fqdn: string): Promise<boolean> {
  try {
    await dns.resolve(fqdn);
    return false;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
  }
}

export async function checkPublicAvailability(fqdn: string): Promise<PublicAvailabilityState> {
  const parsed = parseFqdn(fqdn);
  if (!parsed) return "unknown";

  const rdap = await fetchRdapState(parsed.fqdn, parsed.tld);
  if (rdap !== "unknown") return rdap;
  if (await dnsNxDomainHint(parsed.fqdn)) return "available";
  return "unknown";
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

export async function checkPublicAvailabilityBatch(fqdns: string[]): Promise<DomainAvailabilityResult[]> {
  const unique = Array.from(new Set(fqdns.map((item) => item.trim().toLowerCase()).filter(Boolean)));
  const states = await mapWithConcurrency(unique, RDAP_CONCURRENCY, async (fqdn) => ({
    fqdn,
    state: await checkPublicAvailability(fqdn),
  }));

  return states.flatMap(({ fqdn, state }) => {
    const parsed = parseFqdn(fqdn);
    if (!parsed || state === "unknown") return [];
    return [
      applyTldCatalogFallback({
        fqdn: parsed.fqdn,
        sld: parsed.sld,
        tld: parsed.tld,
        isAvailable: state === "available",
        isPremium: false,
        supported: true,
        registrationCost: 0,
        renewalCost: 0,
        transferCost: 0,
        currency: "USD",
        provider: "openprovider",
        reason: state === "available" ? "Disponivel via consulta publica." : "Ja registrado.",
      }),
    ];
  });
}
