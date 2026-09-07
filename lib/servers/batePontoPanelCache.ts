import { parseResponseJson } from "@/lib/performance/clientData";

type CacheEntry<T> = {
  timestamp: number;
  value: T;
};

const rankingCache = new Map<string, CacheEntry<unknown>>();
const historyCache = new Map<string, CacheEntry<unknown>>();
const CLIENT_CACHE_TTL_MS = 45_000;

function readCache<T>(store: Map<string, CacheEntry<unknown>>, key: string) {
  const cached = store.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > CLIENT_CACHE_TTL_MS) {
    store.delete(key);
    return null;
  }
  return cached.value as T;
}

function writeCache<T>(store: Map<string, CacheEntry<unknown>>, key: string, value: T) {
  store.set(key, { timestamp: Date.now(), value });
}

export function readCachedBatePontoRanking<T>(guildId: string, periodDays: number) {
  return readCache<T>(rankingCache, `${guildId}:${periodDays}`);
}

export function writeCachedBatePontoRanking<T>(
  guildId: string,
  periodDays: number,
  value: T,
) {
  writeCache(rankingCache, `${guildId}:${periodDays}`, value);
}

export function readCachedBatePontoHistory<T>(
  guildId: string,
  userId: string,
  offset: number,
) {
  return readCache<T>(historyCache, `${guildId}:${userId}:${offset}`);
}

export function writeCachedBatePontoHistory<T>(
  guildId: string,
  userId: string,
  offset: number,
  value: T,
) {
  writeCache(historyCache, `${guildId}:${userId}:${offset}`, value);
}

export function prefetchBatePontoPanels(guildId: string) {
  if (typeof window === "undefined" || !guildId) return;

  if (!readCachedBatePontoRanking(guildId, 30)) {
    void fetch(
      `/api/auth/me/guilds/bate-ponto-ranking?guildId=${encodeURIComponent(guildId)}&periodDays=30`,
      { cache: "no-store" },
    )
      .then((response) => parseResponseJson<{ ok?: boolean; ranking?: unknown }>(response))
      .then((payload) => {
        if (payload?.ok && Array.isArray(payload.ranking)) {
          writeCachedBatePontoRanking(guildId, 30, payload.ranking);
        }
      })
      .catch(() => undefined);
  }

  if (!readCachedBatePontoHistory(guildId, "", 0)) {
    void fetch(
      `/api/auth/me/guilds/bate-ponto-history?guildId=${encodeURIComponent(guildId)}&limit=50&offset=0`,
      { cache: "no-store" },
    )
      .then((response) => parseResponseJson<{ ok?: boolean; events?: unknown }>(response))
      .then((payload) => {
        if (payload?.ok && Array.isArray(payload.events)) {
          writeCachedBatePontoHistory(guildId, "", 0, payload.events);
        }
      })
      .catch(() => undefined);
  }
}
