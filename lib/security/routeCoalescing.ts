import crypto from "node:crypto";

type JsonRouteResolution = {
  body: unknown;
  status?: number;
  headers?: Record<string, string>;
};

type CacheEntry = {
  expiresAt: number;
  value: JsonRouteResolution;
};

type ResponseSnapshot = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: string;
};

type ResponseCacheEntry = {
  expiresAt: number;
  value: ResponseSnapshot;
};

const inflightRouteMutations = new Map<string, Promise<JsonRouteResolution>>();
const recentRouteMutationResponses = new Map<string, CacheEntry>();
const inflightRouteResponses = new Map<string, Promise<ResponseSnapshot>>();
const recentRouteResponses = new Map<string, ResponseCacheEntry>();
const MAX_RECENT_ROUTE_MUTATIONS = 500;

function cloneJsonValue<TValue>(value: TValue): TValue {
  return JSON.parse(JSON.stringify(value)) as TValue;
}

function cloneResolution(value: JsonRouteResolution): JsonRouteResolution {
  return {
    body: cloneJsonValue(value.body),
    status: value.status,
    headers: value.headers ? { ...value.headers } : undefined,
  };
}

function pruneRecentRouteMutations(nowMs: number) {
  if (recentRouteMutationResponses.size <= MAX_RECENT_ROUTE_MUTATIONS) {
    return;
  }

  for (const [key, entry] of recentRouteMutationResponses.entries()) {
    if (entry.expiresAt <= nowMs) {
      recentRouteMutationResponses.delete(key);
    }
  }

  if (recentRouteMutationResponses.size <= MAX_RECENT_ROUTE_MUTATIONS) {
    return;
  }

  const overflow = recentRouteMutationResponses.size - MAX_RECENT_ROUTE_MUTATIONS;
  const keys = Array.from(recentRouteMutationResponses.keys());
  for (const key of keys.slice(0, overflow)) {
    recentRouteMutationResponses.delete(key);
  }
}

function pruneRecentRouteResponses(nowMs: number) {
  if (recentRouteResponses.size <= MAX_RECENT_ROUTE_MUTATIONS) {
    return;
  }

  for (const [key, entry] of recentRouteResponses.entries()) {
    if (entry.expiresAt <= nowMs) {
      recentRouteResponses.delete(key);
    }
  }

  if (recentRouteResponses.size <= MAX_RECENT_ROUTE_MUTATIONS) {
    return;
  }

  const overflow = recentRouteResponses.size - MAX_RECENT_ROUTE_MUTATIONS;
  const keys = Array.from(recentRouteResponses.keys());
  for (const key of keys.slice(0, overflow)) {
    recentRouteResponses.delete(key);
  }
}

async function snapshotResponse(response: Response) {
  const cloned = response.clone();

  return {
    status: cloned.status,
    statusText: cloned.statusText,
    headers: Array.from(cloned.headers.entries()),
    body: await cloned.text(),
  } satisfies ResponseSnapshot;
}

function buildResponseFromSnapshot(snapshot: ResponseSnapshot) {
  return new Response(snapshot.body, {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: new Headers(snapshot.headers),
  });
}

export function createCoalescedRouteKey(input: {
  namespace: string;
  parts: Array<string | number | boolean | null | undefined>;
}) {
  return crypto
    .createHash("sha256")
    .update(
      [input.namespace, ...input.parts.map((part) => (part == null ? "" : String(part).trim()))].join("\n"),
    )
    .digest("hex");
}

export async function runCoalescedJsonRouteMutation(input: {
  key: string;
  producer: () => Promise<JsonRouteResolution>;
  ttlMs?: number;
  shouldCache?: (value: JsonRouteResolution) => boolean;
}) {
  const nowMs = Date.now();
  pruneRecentRouteMutations(nowMs);

  const cached = recentRouteMutationResponses.get(input.key);
  if (cached && cached.expiresAt > nowMs) {
    return cloneResolution(cached.value);
  }

  const inflight = inflightRouteMutations.get(input.key);
  if (inflight) {
    return cloneResolution(await inflight);
  }

  const request = (async () => {
    const value = await input.producer();
    const ttlMs = Math.max(0, Math.trunc(input.ttlMs || 0));
    const shouldCache =
      input.shouldCache?.(value) ??
      (ttlMs > 0 && (value.status || 200) < 500);

    if (ttlMs > 0 && shouldCache) {
      recentRouteMutationResponses.set(input.key, {
        expiresAt: Date.now() + ttlMs,
        value: cloneResolution(value),
      });
    }

    return value;
  })();

  inflightRouteMutations.set(input.key, request);

  try {
    return cloneResolution(await request);
  } finally {
    inflightRouteMutations.delete(input.key);
  }
}

export async function runCoalescedRouteResponse(input: {
  key: string;
  producer: () => Promise<Response>;
  ttlMs?: number;
  shouldCache?: (value: ResponseSnapshot) => boolean;
}) {
  const nowMs = Date.now();
  pruneRecentRouteResponses(nowMs);

  const cached = recentRouteResponses.get(input.key);
  if (cached && cached.expiresAt > nowMs) {
    return buildResponseFromSnapshot(cached.value);
  }

  const inflight = inflightRouteResponses.get(input.key);
  if (inflight) {
    return buildResponseFromSnapshot(await inflight);
  }

  const request = (async () => {
    const response = await input.producer();
    const snapshot = await snapshotResponse(response);
    const ttlMs = Math.max(0, Math.trunc(input.ttlMs || 0));
    const shouldCache =
      input.shouldCache?.(snapshot) ??
      (ttlMs > 0 && snapshot.status < 500);

    if (ttlMs > 0 && shouldCache) {
      recentRouteResponses.set(input.key, {
        expiresAt: Date.now() + ttlMs,
        value: snapshot,
      });
    }

    return snapshot;
  })();

  inflightRouteResponses.set(input.key, request);

  try {
    return buildResponseFromSnapshot(await request);
  } finally {
    inflightRouteResponses.delete(input.key);
  }
}
