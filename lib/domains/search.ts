import { getCurrencyToBRLRate } from "@/lib/currency";
import { applyDomainMarkup, parseFqdn } from "@/lib/domains/adapter";
import {
  domainProviderOrchestrator,
  type DomainAvailabilityBatchItem,
} from "@/lib/domains/provider";
import type { DomainSearchResponse, DomainSearchResult } from "@/lib/domains/searchTypes";

const DEFAULT_TLDS = [
  "com",
  "com.br",
  "net",
  "org",
  "io",
  "ai",
  "app",
  "dev",
  "co",
  "me",
  "store",
  "online",
  "tech",
];
const CACHE_TTL_MS = 2 * 60 * 1000;
const STALE_CACHE_TTL_MS = 10 * 60 * 1000;
const ERROR_CACHE_TTL_MS = 15 * 1000;
const MAX_CACHE_ENTRIES = 500;
const cache = new Map<
  string,
  { freshUntil: number; staleUntil: number; value: DomainSearchResponse }
>();
const inFlightSearches = new Map<string, Promise<DomainSearchResponse>>();

function searchTlds(requested?: string | null) {
  const configured = process.env.DOMAIN_SEARCH_TLDS?.split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([requested, ...(configured?.length ? configured : DEFAULT_TLDS)].filter(Boolean) as string[])).slice(0, 20);
}

function sanitize(input: string) {
  return input
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^[a-z]+:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/^www\./, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9.-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseSearch(input: string) {
  const normalized = sanitize(input);
  const parsed = parseFqdn(normalized);
  if (parsed) return { query: normalized, baseName: parsed.sld, requestedTld: parsed.tld };
  const baseName = normalized.split(".")[0]?.replace(/\./g, "") || "";
  if (baseName.length < 2) throw new Error("Informe um nome de dominio valido.");
  return { query: normalized, baseName, requestedTld: null };
}

function unknownResult(item: DomainAvailabilityBatchItem): DomainSearchResult {
  const parsed = parseFqdn(item.fqdn);
  return {
    domain: item.fqdn,
    extension: parsed?.tld || item.fqdn.split(".").slice(1).join("."),
    status: "unknown",
    isAvailable: false,
    price: 0,
    currency: "BRL",
    isPremium: false,
    reason: item.error?.message || "Consulta indisponivel.",
    whois: "",
  };
}

async function mapBatchResults(items: DomainAvailabilityBatchItem[]) {
  const currencies = Array.from(
    new Set(items.map((item) => item.value?.currency).filter(Boolean) as string[]),
  );
  const rates = new Map(
    await Promise.all(
      currencies.map(async (currency) => [currency, await getCurrencyToBRLRate(currency)] as const),
    ),
  );

  return items.map((item): DomainSearchResult => {
    const result = item.value;
    if (!result) return unknownResult(item);
    const rate = rates.get(result.currency) || 1;
    const price =
      result.registrationCost > 0
        ? applyDomainMarkup({
            providerCost: result.registrationCost,
            exchangeRateToBrl: rate,
          }).totalBrl
        : 0;
    return {
      domain: result.fqdn,
      extension: result.tld,
      status: result.isAvailable ? "free" : "in use",
      isAvailable: result.isAvailable,
      price,
      currency: "BRL",
      isPremium: result.isPremium,
      reason: result.reason || "",
      whois: "",
    };
  });
}

async function performSearch(parsed: ReturnType<typeof parseSearch>): Promise<DomainSearchResponse> {
  const tlds = searchTlds(parsed.requestedTld);
  const fqdns = tlds.map((tld) => `${parsed.baseName}.${tld}`);
  const results = await mapBatchResults(
    await domainProviderOrchestrator.checkAvailabilityBatch(fqdns),
  );

  const exactDomain = parsed.requestedTld ? `${parsed.baseName}.${parsed.requestedTld}` : null;
  results.sort((left, right) => {
    if (left.domain === exactDomain) return -1;
    if (right.domain === exactDomain) return 1;
    if (left.isAvailable !== right.isAvailable) return left.isAvailable ? -1 : 1;
    return tlds.indexOf(left.extension) - tlds.indexOf(right.extension);
  });

  return {
    query: parsed.query,
    baseName: parsed.baseName,
    exactDomain,
    searchedTlds: tlds,
    results,
  };
}

function setSearchCache(cacheKey: string, value: DomainSearchResponse) {
  const now = Date.now();
  const hasProviderResults = value.results.some((result) => result.status !== "unknown");
  cache.delete(cacheKey);
  cache.set(cacheKey, {
    freshUntil: now + (hasProviderResults ? CACHE_TTL_MS : ERROR_CACHE_TTL_MS),
    staleUntil: now + (hasProviderResults ? STALE_CACHE_TTL_MS : ERROR_CACHE_TTL_MS),
    value: structuredClone(value),
  });

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value as string | undefined;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function refreshSearch(
  cacheKey: string,
  parsed: ReturnType<typeof parseSearch>,
) {
  const current = inFlightSearches.get(cacheKey);
  if (current) return current;

  const promise = performSearch(parsed)
    .then((value) => {
      const existing = cache.get(cacheKey);
      const hasProviderResults = value.results.some((result) => result.status !== "unknown");
      if (hasProviderResults || !existing || existing.staleUntil <= Date.now()) {
        setSearchCache(cacheKey, value);
        return value;
      }
      return structuredClone(existing.value);
    })
    .finally(() => {
      if (inFlightSearches.get(cacheKey) === promise) {
        inFlightSearches.delete(cacheKey);
      }
    });

  inFlightSearches.set(cacheKey, promise);
  return promise;
}

export async function searchDomains(query: string): Promise<DomainSearchResponse> {
  const parsed = parseSearch(query);
  const cacheKey = `${parsed.baseName}:${parsed.requestedTld || "*"}`;
  const cached = cache.get(cacheKey);
  const now = Date.now();

  if (cached?.freshUntil && cached.freshUntil > now) {
    return structuredClone(cached.value);
  }
  if (cached?.staleUntil && cached.staleUntil > now) {
    void refreshSearch(cacheKey, parsed).catch(() => {});
    return structuredClone(cached.value);
  }

  return structuredClone(await refreshSearch(cacheKey, parsed));
}

export async function streamSearchDomains(
  query: string,
  onChunk: (payload: { results: DomainSearchResult[]; isIntermediate: boolean }) => void,
) {
  const response = await searchDomains(query);
  onChunk({ results: response.results, isIntermediate: false });
  return response;
}
