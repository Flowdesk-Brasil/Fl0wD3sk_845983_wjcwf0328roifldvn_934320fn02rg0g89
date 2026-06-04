import type { DomainProviderName } from "@/lib/domains/adapter";
import { DomainProviderError } from "./errors";
import {
  noteProviderRateLimit,
  reserveProviderRequest,
  type ProviderTrafficPolicy,
} from "./traffic";

export type ProviderFetchJsonOptions = {
  trafficScope?: string;
  trafficPolicy?: Partial<ProviderTrafficPolicy>;
  retryOnRateLimit?: boolean;
  maxRateLimitRetries?: number;
  defaultRetryAfterMs?: number;
};

function parseRetryAfterMs(headers: Headers, fallbackMs: number) {
  const now = Date.now();
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1_000, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(1_000, date - now);
  }

  for (const name of ["ratelimit-reset", "x-ratelimit-reset", "x-rate-limit-reset"]) {
    const raw = headers.get(name);
    if (!raw) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) continue;
    if (value > 1_000_000_000_000) return Math.max(1_000, value - now);
    if (value > 1_000_000_000) return Math.max(1_000, value * 1_000 - now);
    return Math.max(1_000, value * 1_000);
  }

  return fallbackMs;
}

export async function providerFetchJson<T>(
  provider: DomainProviderName,
  url: string,
  init: RequestInit,
  timeoutMs = 15_000,
  options: ProviderFetchJsonOptions = {},
): Promise<{ data: T; headers: Headers; status: number }> {
  const scope = options.trafficScope || "default";
  const maxRateLimitRetries = options.retryOnRateLimit
    ? Math.max(0, options.maxRateLimitRetries ?? 1)
    : 0;

  for (let attempt = 0; attempt <= maxRateLimitRetries; attempt++) {
    await reserveProviderRequest(provider, scope, options.trafficPolicy);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...init,
        cache: "no-store",
        signal: controller.signal,
      });
      const rawText = await response.text();
      let data: unknown = {};
      if (rawText.trim()) {
        try {
          data = JSON.parse(rawText);
        } catch {
          data = { message: rawText.trim() };
        }
      }

      if (!response.ok) {
        const record =
          data && typeof data === "object" && !Array.isArray(data)
            ? (data as Record<string, unknown>)
            : {};
        const message = String(
          record.detail || record.message || record.desc || `HTTP ${response.status}`,
        );
        const kind =
          response.status === 429
            ? "rate_limited"
            : [408, 500, 502, 503, 504].includes(response.status)
              ? "temporary"
              : response.status === 404 || response.status === 422
                ? "unsupported"
                : "permanent";

        if (response.status === 429) {
          const retryAfterMs = parseRetryAfterMs(
            response.headers,
            options.defaultRetryAfterMs || 30_000,
          );
          noteProviderRateLimit(provider, scope, retryAfterMs);
          if (attempt < maxRateLimitRetries) continue;
          throw new DomainProviderError(
            provider,
            kind,
            `A ${provider} atingiu o limite temporario de consultas. Aguarde alguns segundos.`,
            response.status,
            {
            response: data,
            retryAfterMs,
            providerMessage: message,
            },
          );
        }

        throw new DomainProviderError(provider, kind, message, response.status, data);
      }

      return { data: data as T, headers: response.headers, status: response.status };
    } catch (error) {
      if (error instanceof DomainProviderError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new DomainProviderError(provider, "temporary", `${provider} excedeu o tempo limite.`, 504);
      }
      throw new DomainProviderError(
        provider,
        "temporary",
        error instanceof Error ? error.message : `Falha de rede em ${provider}.`,
        503,
        error,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new DomainProviderError(provider, "rate_limited", `${provider} limitou a requisicao.`, 429);
}

export function splitContactName(fullName: string) {
  const parts = fullName.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  return {
    firstName: parts[0] || "Cliente",
    lastName: parts.slice(1).join(" ") || parts[0] || "Flowdesk",
  };
}

export function normalizePhoneParts(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const countryCode = digits.startsWith("55") ? "55" : digits.slice(0, Math.max(1, digits.length - 10));
  const local = digits.slice(countryCode.length);
  const areaCode = local.length > 8 ? local.slice(0, local.length - 8) : "";
  const subscriberNumber = local.slice(areaCode.length) || digits;
  return {
    countryCode: `+${countryCode || "55"}`,
    areaCode: areaCode || "11",
    subscriberNumber,
    spaceship: `+${countryCode || "55"}.${local || digits}`,
  };
}
