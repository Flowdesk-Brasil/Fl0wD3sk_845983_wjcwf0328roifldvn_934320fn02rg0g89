import type { DomainProviderName } from "@/lib/domains/adapter";
import { DomainProviderError } from "./errors";

export type ProviderTrafficPolicy = {
  maxRequests: number;
  windowMs: number;
  minIntervalMs: number;
  maxWaitMs: number;
  maxQueue: number;
};

type ProviderTrafficState = {
  tail: Promise<void>;
  pending: number;
  timestamps: number[];
  blockedUntil: number;
  lastStartedAt: number;
};

const states = new Map<string, ProviderTrafficState>();

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function defaultPolicy(provider: DomainProviderName): ProviderTrafficPolicy {
  if (provider === "spaceship") {
    return {
      // Spaceship documents 30 availability requests per 30 seconds.
      // Keep headroom for concurrent instances and manual operations.
      maxRequests: positiveInteger(process.env.SPACESHIP_RATE_LIMIT_MAX_REQUESTS, 24),
      windowMs: positiveInteger(process.env.SPACESHIP_RATE_LIMIT_WINDOW_MS, 30_000),
      minIntervalMs: positiveInteger(process.env.SPACESHIP_REQUEST_MIN_INTERVAL_MS, 200),
      maxWaitMs: positiveInteger(process.env.SPACESHIP_RATE_LIMIT_MAX_WAIT_MS, 35_000),
      maxQueue: positiveInteger(process.env.SPACESHIP_REQUEST_MAX_QUEUE, 120),
    };
  }

  return {
    maxRequests: 40,
    windowMs: 30_000,
    minIntervalMs: 100,
    maxWaitMs: 35_000,
    maxQueue: 120,
  };
}

function getState(key: string) {
  const existing = states.get(key);
  if (existing) return existing;

  const created: ProviderTrafficState = {
    tail: Promise.resolve(),
    pending: 0,
    timestamps: [],
    blockedUntil: 0,
    lastStartedAt: 0,
  };
  states.set(key, created);
  return created;
}

function normalizePolicy(
  provider: DomainProviderName,
  override?: Partial<ProviderTrafficPolicy>,
): ProviderTrafficPolicy {
  const defaults = defaultPolicy(provider);
  return {
    maxRequests: Math.max(1, Math.round(override?.maxRequests || defaults.maxRequests)),
    windowMs: Math.max(1_000, Math.round(override?.windowMs || defaults.windowMs)),
    minIntervalMs: Math.max(0, Math.round(override?.minIntervalMs ?? defaults.minIntervalMs)),
    maxWaitMs: Math.max(1_000, Math.round(override?.maxWaitMs || defaults.maxWaitMs)),
    maxQueue: Math.max(1, Math.round(override?.maxQueue || defaults.maxQueue)),
  };
}

export async function reserveProviderRequest(
  provider: DomainProviderName,
  scope: string,
  override?: Partial<ProviderTrafficPolicy>,
) {
  const key = `${provider}:${scope}`;
  const state = getState(key);
  const policy = normalizePolicy(provider, override);

  if (state.pending >= policy.maxQueue) {
    throw new DomainProviderError(
      provider,
      "rate_limited",
      `Fila de requisicoes da ${provider} temporariamente cheia.`,
      429,
    );
  }

  const previous = state.tail;
  let release = () => {};
  state.tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  state.pending += 1;
  const enqueuedAt = Date.now();

  await previous;

  try {
    while (true) {
      const now = Date.now();
      state.timestamps = state.timestamps.filter(
        (timestamp) => timestamp > now - policy.windowMs,
      );

      const windowReadyAt =
        state.timestamps.length >= policy.maxRequests
          ? state.timestamps[0] + policy.windowMs
          : now;
      const spacingReadyAt = state.lastStartedAt + policy.minIntervalMs;
      const readyAt = Math.max(now, state.blockedUntil, windowReadyAt, spacingReadyAt);
      const waitMs = Math.max(0, readyAt - now);

      if (Date.now() - enqueuedAt + waitMs > policy.maxWaitMs) {
        throw new DomainProviderError(
          provider,
          "rate_limited",
          `A ${provider} esta limitando requisicoes. Aguarde alguns segundos e tente novamente.`,
          429,
          { retryAfterMs: waitMs },
        );
      }

      if (waitMs <= 0) break;
      await sleep(waitMs);
    }

    const startedAt = Date.now();
    state.timestamps.push(startedAt);
    state.lastStartedAt = startedAt;
    return { waitMs: startedAt - enqueuedAt };
  } finally {
    state.pending = Math.max(0, state.pending - 1);
    release();
  }
}

export function noteProviderRateLimit(
  provider: DomainProviderName,
  scope: string,
  retryAfterMs: number,
) {
  const state = getState(`${provider}:${scope}`);
  const normalized = Math.max(1_000, Math.min(60_000, Math.round(retryAfterMs || 30_000)));
  state.blockedUntil = Math.max(state.blockedUntil, Date.now() + normalized);
}

export function getProviderTrafficSnapshot() {
  const now = Date.now();
  return Array.from(states.entries()).map(([key, state]) => ({
    key,
    pending: state.pending,
    recentRequests: state.timestamps.filter((timestamp) => timestamp > now - 30_000).length,
    blockedForMs: Math.max(0, state.blockedUntil - now),
  }));
}
