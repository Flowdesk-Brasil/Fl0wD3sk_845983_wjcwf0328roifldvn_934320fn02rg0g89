import type {
  DomainAvailabilityResult,
  DomainOperation,
  DomainProviderAdapter,
  DomainProviderName,
} from "@/lib/domains/adapter";
import { DomainProviderError, asProviderError } from "./providers/errors";
import { openproviderAdapter } from "./providers/openprovider";
import { spaceshipAdapter } from "./providers/spaceship";

// Hover/OpenSRS remains implemented but is intentionally disabled from runtime.
const ACTIVE_PROVIDERS: DomainProviderAdapter[] = [
  openproviderAdapter,
  spaceshipAdapter,
].sort((left, right) => left.priority - right.priority);

const AVAILABILITY_CACHE_TTL_MS = Math.max(
  10_000,
  Number(process.env.DOMAIN_AVAILABILITY_CACHE_TTL_MS) || 60_000,
);
const HEALTH_CACHE_TTL_MS = Math.max(
  10_000,
  Number(process.env.DOMAIN_PROVIDER_HEALTH_CACHE_TTL_MS) || 60_000,
);
const MAX_AVAILABILITY_CACHE_ENTRIES = 2_000;

export type DomainProviderAttempt = {
  provider: DomainProviderName;
  operation: DomainOperation;
  ok: boolean;
  fallbackUsed: boolean;
  message?: string | null;
};

export type DomainAvailabilityBatchItem = {
  fqdn: string;
  value: DomainAvailabilityResult | null;
  provider: DomainProviderName | null;
  attempts: DomainProviderAttempt[];
  error: DomainProviderError | null;
};

type AvailabilityCacheEntry = {
  expiresAt: number;
  item: DomainAvailabilityBatchItem;
};

type DomainProviderHealth = {
  provider: DomainProviderName;
  configured: boolean;
  ok: boolean;
  latencyMs: number;
  message?: string | null;
};

const availabilityCache = new Map<string, AvailabilityCacheEntry>();
const availabilityInFlight = new Map<string, Promise<DomainAvailabilityBatchItem>>();
let healthCache: { expiresAt: number; value: DomainProviderHealth[] } | null = null;
let healthInFlight: Promise<DomainProviderHealth[]> | null = null;

function cloneAttempt(attempt: DomainProviderAttempt) {
  return { ...attempt };
}

function cloneBatchItem(item: DomainAvailabilityBatchItem): DomainAvailabilityBatchItem {
  return {
    ...item,
    value: item.value ? { ...item.value } : null,
    attempts: item.attempts.map(cloneAttempt),
  };
}

function pruneAvailabilityCache() {
  const now = Date.now();
  for (const [key, entry] of availabilityCache) {
    if (entry.expiresAt <= now) availabilityCache.delete(key);
  }
  while (availabilityCache.size > MAX_AVAILABILITY_CACHE_ENTRIES) {
    const oldest = availabilityCache.keys().next().value as string | undefined;
    if (!oldest) break;
    availabilityCache.delete(oldest);
  }
}

function getCachedAvailability(fqdn: string) {
  const cached = availabilityCache.get(fqdn);
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) availabilityCache.delete(fqdn);
    return null;
  }
  return cloneBatchItem(cached.item);
}

function setCachedAvailability(item: DomainAvailabilityBatchItem) {
  if (!item.value) return;
  availabilityCache.delete(item.fqdn);
  availabilityCache.set(item.fqdn, {
    expiresAt: Date.now() + AVAILABILITY_CACHE_TTL_MS,
    item: cloneBatchItem(item),
  });
  pruneAvailabilityCache();
}

function validateAvailabilityResult(
  provider: DomainProviderAdapter,
  result: DomainAvailabilityResult | undefined,
) {
  if (!result) {
    return new DomainProviderError(
      provider.name,
      "temporary",
      `${provider.name} nao retornou o dominio consultado.`,
      502,
    );
  }
  if (!result.supported) {
    return new DomainProviderError(
      provider.name,
      "unsupported",
      `TLD .${result.tld} nao suportado.`,
      422,
    );
  }
  if (result.isAvailable && result.registrationCost <= 0) {
    return new DomainProviderError(
      provider.name,
      "temporary",
      "Provedor nao retornou um preco registravel.",
      502,
    );
  }
  return null;
}

export class DomainProviderOrchestrator {
  getProviders() {
    return [...ACTIVE_PROVIDERS];
  }

  getProvider(name: string) {
    return ACTIVE_PROVIDERS.find((provider) => provider.name === name) || null;
  }

  private ordered(preferred?: DomainProviderName | null) {
    if (!preferred) return this.getProviders();
    const selected = this.getProvider(preferred);
    return selected
      ? [selected, ...ACTIVE_PROVIDERS.filter((provider) => provider.name !== preferred)]
      : this.getProviders();
  }

  async withFallback<T>(
    operation: DomainOperation,
    callback: (provider: DomainProviderAdapter) => Promise<T>,
    preferred?: DomainProviderName | null,
  ): Promise<{ value: T; provider: DomainProviderName; attempts: DomainProviderAttempt[] }> {
    const attempts: DomainProviderAttempt[] = [];
    let lastError: DomainProviderError | null = null;

    for (const provider of this.ordered(preferred)) {
      if (!provider.isConfigured()) {
        attempts.push({
          provider: provider.name,
          operation,
          ok: false,
          fallbackUsed: attempts.length > 0,
          message: "Provedor nao configurado.",
        });
        lastError = new DomainProviderError(
          provider.name,
          "not_configured",
          `${provider.name} nao configurado.`,
          503,
        );
        continue;
      }

      try {
        const value = await callback(provider);
        attempts.push({
          provider: provider.name,
          operation,
          ok: true,
          fallbackUsed: attempts.length > 0,
        });
        return { value, provider: provider.name, attempts };
      } catch (error) {
        const mapped = asProviderError(provider.name, error, `Falha em ${provider.name}.`);
        attempts.push({
          provider: provider.name,
          operation,
          ok: false,
          fallbackUsed: attempts.length > 0,
          message: mapped.message,
        });
        lastError = mapped;
        if (!mapped.allowsFallback) throw mapped;
      }
    }

    throw (
      lastError ||
      new DomainProviderError("openprovider", "temporary", "Nenhum provedor de dominios disponivel.", 503)
    );
  }

  async checkAvailability(fqdn: string) {
    const [item] = await this.checkAvailabilityBatch([fqdn]);
    if (item?.value && item.provider) {
      return {
        value: item.value,
        provider: item.provider,
        attempts: item.attempts,
      };
    }
    throw (
      item?.error ||
      new DomainProviderError("openprovider", "temporary", "Consulta de dominio indisponivel.", 503)
    );
  }

  async checkAvailabilityBatch(fqdns: string[]): Promise<DomainAvailabilityBatchItem[]> {
    const normalized = Array.from(
      new Set(fqdns.map((fqdn) => fqdn.trim().toLowerCase()).filter(Boolean)),
    );
    const requested = fqdns.map((fqdn) => fqdn.trim().toLowerCase());
    const missing = normalized.filter(
      (fqdn) => !getCachedAvailability(fqdn) && !availabilityInFlight.has(fqdn),
    );

    if (missing.length) {
      const batchPromise = this.resolveAvailabilityBatch(missing);
      for (const fqdn of missing) {
        const itemPromise = batchPromise.then(
          (items) =>
            items.find((item) => item.fqdn === fqdn) || {
              fqdn,
              value: null,
              provider: null,
              attempts: [],
              error: new DomainProviderError(
                "openprovider",
                "temporary",
                `Consulta de ${fqdn} nao retornada.`,
                502,
              ),
            },
        );
        availabilityInFlight.set(fqdn, itemPromise);
        void itemPromise.finally(() => {
          if (availabilityInFlight.get(fqdn) === itemPromise) {
            availabilityInFlight.delete(fqdn);
          }
        });
      }
    }

    return Promise.all(
      requested.map(async (fqdn) => {
        const cached = getCachedAvailability(fqdn);
        if (cached) return cached;
        const inFlight = availabilityInFlight.get(fqdn);
        if (inFlight) return cloneBatchItem(await inFlight);
        return {
          fqdn,
          value: null,
          provider: null,
          attempts: [],
          error: new DomainProviderError(
            "openprovider",
            "temporary",
            `Consulta de ${fqdn} indisponivel.`,
            503,
          ),
        };
      }),
    );
  }

  private async resolveAvailabilityBatch(fqdns: string[]): Promise<DomainAvailabilityBatchItem[]> {
    const pending = new Map(
      fqdns.map((fqdn) => [
        fqdn,
        {
          attempts: [] as DomainProviderAttempt[],
          lastError: null as DomainProviderError | null,
        },
      ]),
    );
    const resolved = new Map<string, DomainAvailabilityBatchItem>();

    for (const provider of ACTIVE_PROVIDERS) {
      if (!pending.size) break;
      const providerFqdns = Array.from(pending.keys());

      if (!provider.isConfigured()) {
        for (const state of pending.values()) {
          const error = new DomainProviderError(
            provider.name,
            "not_configured",
            `${provider.name} nao configurado.`,
            503,
          );
          state.attempts.push({
            provider: provider.name,
            operation: "check",
            ok: false,
            fallbackUsed: state.attempts.length > 0,
            message: error.message,
          });
          state.lastError = error;
        }
        continue;
      }

      try {
        const results = await provider.checkAvailabilityBatch(providerFqdns);
        const byFqdn = new Map(
          results.map((result) => [result.fqdn.trim().toLowerCase(), result]),
        );

        for (const fqdn of providerFqdns) {
          const state = pending.get(fqdn);
          if (!state) continue;
          const result = byFqdn.get(fqdn);
          const error = validateAvailabilityResult(provider, result);
          state.attempts.push({
            provider: provider.name,
            operation: "check",
            ok: !error,
            fallbackUsed: state.attempts.length > 0,
            message: error?.message || null,
          });

          if (error) {
            state.lastError = error;
            continue;
          }

          const item: DomainAvailabilityBatchItem = {
            fqdn,
            value: result || null,
            provider: provider.name,
            attempts: state.attempts.map(cloneAttempt),
            error: null,
          };
          resolved.set(fqdn, item);
          pending.delete(fqdn);
          setCachedAvailability(item);
        }
      } catch (error) {
        const mapped = asProviderError(provider.name, error, `Falha em ${provider.name}.`);
        for (const state of pending.values()) {
          state.attempts.push({
            provider: provider.name,
            operation: "check",
            ok: false,
            fallbackUsed: state.attempts.length > 0,
            message: mapped.message,
          });
          state.lastError = mapped;
        }
        if (!mapped.allowsFallback) break;
      }
    }

    for (const [fqdn, state] of pending) {
      resolved.set(fqdn, {
        fqdn,
        value: null,
        provider: null,
        attempts: state.attempts.map(cloneAttempt),
        error:
          state.lastError ||
          new DomainProviderError(
            "openprovider",
            "temporary",
            "Nenhum provedor de dominios disponivel.",
            503,
          ),
      });
    }

    return fqdns.map((fqdn) => cloneBatchItem(resolved.get(fqdn)!));
  }

  async health() {
    if (healthCache && healthCache.expiresAt > Date.now()) {
      return healthCache.value.map((item) => ({ ...item }));
    }
    if (healthInFlight) {
      return (await healthInFlight).map((item) => ({ ...item }));
    }

    healthInFlight = Promise.all(
      ACTIVE_PROVIDERS.map(async (provider) => ({
        provider: provider.name,
        configured: provider.isConfigured(),
        ...(provider.isConfigured()
          ? await provider.healthCheck()
          : { ok: false, latencyMs: 0, message: "Nao configurado." }),
      })),
    ).then((value) => {
      healthCache = {
        expiresAt: Date.now() + HEALTH_CACHE_TTL_MS,
        value: value.map((item) => ({ ...item })),
      };
      return value;
    }).finally(() => {
      healthInFlight = null;
    });

    return (await healthInFlight).map((item) => ({ ...item }));
  }
}

export const domainProviderOrchestrator = new DomainProviderOrchestrator();

export function getActiveDomainProviderName(): DomainProviderName {
  return "openprovider";
}

export function getActiveDomainProvider() {
  return domainProviderOrchestrator;
}
