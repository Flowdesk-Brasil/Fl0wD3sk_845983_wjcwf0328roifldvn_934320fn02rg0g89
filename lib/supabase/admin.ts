import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function resolveSupabaseEnv() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    supabaseUrl,
    serviceRoleKey,
  };
}

const DEFAULT_TIMEOUT_MS = 8_000;
const READ_ONLY_MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 250;
const IDEMPOTENT_HTTP_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const SUPABASE_READ_COALESCE_TTL_MS = 650;
const MAX_SUPABASE_READ_CACHE_ENTRIES = 500;
const MAX_SUPABASE_INFLIGHT_READS = 18;
const MAX_SUPABASE_INFLIGHT_WRITES = 8;
const READ_CONCURRENCY_WAIT_TIMEOUT_MS = 1_500;
const WRITE_CONCURRENCY_WAIT_TIMEOUT_MS = 2_500;
const SUPABASE_FAILURES_BEFORE_CIRCUIT = 4;
const SUPABASE_READ_CIRCUIT_OPEN_MS = 8_000;
const SUPABASE_WRITE_CIRCUIT_OPEN_MS = 12_000;

type SupabaseBucket = "read" | "write";

type ResponseSnapshot = {
  status: number;
  statusText: string;
  headers: Array<[string, string]>;
  body: Uint8Array;
};

type CachedReadResponse = {
  expiresAt: number;
  snapshot: ResponseSnapshot;
};

type CircuitState = {
  consecutiveFailures: number;
  openUntilMs: number;
  lastFailureMessage: string | null;
};

const inflightReadRequests = new Map<string, Promise<ResponseSnapshot>>();
const recentReadResponses = new Map<string, CachedReadResponse>();
const bucketWaiters: Record<SupabaseBucket, Array<() => void>> = {
  read: [],
  write: [],
};
const bucketInflightCounts: Record<SupabaseBucket, number> = {
  read: 0,
  write: 0,
};
const bucketCircuitState: Record<SupabaseBucket, CircuitState> = {
  read: {
    consecutiveFailures: 0,
    openUntilMs: 0,
    lastFailureMessage: null,
  },
  write: {
    consecutiveFailures: 0,
    openUntilMs: 0,
    lastFailureMessage: null,
  },
};

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message || "unknown_error";
  }

  if (typeof error === "string") {
    return error;
  }

  return "unknown_error";
}

function resolveRequestMethod(options: RequestInit) {
  const method = options.method?.trim().toUpperCase();
  return method || "GET";
}

function resolveSupabaseBucket(method: string): SupabaseBucket {
  return IDEMPOTENT_HTTP_METHODS.has(method) ? "read" : "write";
}

function shouldRetrySupabaseRequest(options: RequestInit) {
  const method = resolveRequestMethod(options);
  if (IDEMPOTENT_HTTP_METHODS.has(method)) {
    return true;
  }

  const headers = new Headers(options.headers);
  const retrySafeHeader = headers.get("x-flowdesk-retry-safe")?.trim().toLowerCase();
  return retrySafeHeader === "1" || retrySafeHeader === "true";
}

function shouldCoalesceReadRequest(url: string | URL | Request, options: RequestInit) {
  const method = resolveRequestMethod(options);
  if (!IDEMPOTENT_HTTP_METHODS.has(method)) {
    return false;
  }

  const headers = new Headers(options.headers);
  const bypassHeader = headers.get("x-flowdesk-bypass-read-coalescing")?.trim().toLowerCase();
  if (bypassHeader === "1" || bypassHeader === "true") {
    return false;
  }

  const requestUrl = typeof url === "string" || url instanceof URL ? String(url) : url.url;
  return requestUrl.length > 0;
}

function buildReadRequestKey(url: string | URL | Request, options: RequestInit) {
  const method = resolveRequestMethod(options);
  const headers = new Headers(options.headers);
  const requestUrl = typeof url === "string" || url instanceof URL ? String(url) : url.url;

  return [
    method,
    requestUrl,
    headers.get("accept-profile") || "",
    headers.get("content-profile") || "",
    headers.get("prefer") || "",
    headers.get("range") || "",
  ].join("\n");
}

function cloneResponseSnapshot(snapshot: ResponseSnapshot): ResponseSnapshot {
  return {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: [...snapshot.headers],
    body: snapshot.body.slice(),
  };
}

function buildResponseFromSnapshot(snapshot: ResponseSnapshot) {
  return new Response(snapshot.body.slice(), {
    status: snapshot.status,
    statusText: snapshot.statusText,
    headers: new Headers(snapshot.headers),
  });
}

async function createResponseSnapshot(response: Response) {
  const body =
    response.status === 204 || response.status === 205 || response.status === 304
      ? new Uint8Array(0)
      : new Uint8Array(await response.arrayBuffer());

  return {
    status: response.status,
    statusText: response.statusText,
    headers: Array.from(response.headers.entries()),
    body,
  } satisfies ResponseSnapshot;
}

function pruneRecentReadResponses(nowMs: number) {
  for (const [key, entry] of recentReadResponses.entries()) {
    if (entry.expiresAt <= nowMs) {
      recentReadResponses.delete(key);
    }
  }

  if (recentReadResponses.size <= MAX_SUPABASE_READ_CACHE_ENTRIES) {
    return;
  }

  const overflow = recentReadResponses.size - MAX_SUPABASE_READ_CACHE_ENTRIES;
  const keys = Array.from(recentReadResponses.keys());
  for (const key of keys.slice(0, overflow)) {
    recentReadResponses.delete(key);
  }
}

function shouldRetainReadSnapshot(snapshot: ResponseSnapshot) {
  return snapshot.status < 500 && snapshot.status !== 429;
}

function readCachedSnapshot(key: string) {
  const nowMs = Date.now();
  pruneRecentReadResponses(nowMs);

  const entry = recentReadResponses.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs) {
    recentReadResponses.delete(key);
    return null;
  }

  return cloneResponseSnapshot(entry.snapshot);
}

function writeCachedSnapshot(key: string, snapshot: ResponseSnapshot) {
  if (!shouldRetainReadSnapshot(snapshot)) {
    recentReadResponses.delete(key);
    return;
  }

  pruneRecentReadResponses(Date.now());
  recentReadResponses.set(key, {
    expiresAt: Date.now() + SUPABASE_READ_COALESCE_TTL_MS,
    snapshot: cloneResponseSnapshot(snapshot),
  });
}

function resolveRetryDelayMs(attempt: number) {
  const exponentialDelayMs = INITIAL_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1));
  const jitterMs = Math.floor(Math.random() * INITIAL_BACKOFF_MS);
  return exponentialDelayMs + jitterMs;
}

function isRetriableResponseStatus(status: number) {
  return status === 408 || status === 429 || status === 502 || status === 503 || status === 504;
}

function shouldTripCircuitForResponseStatus(status: number) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function markSupabaseTransportSuccess(bucket: SupabaseBucket) {
  bucketCircuitState[bucket] = {
    consecutiveFailures: 0,
    openUntilMs: 0,
    lastFailureMessage: null,
  };
}

function markSupabaseTransportFailure(
  bucket: SupabaseBucket,
  method: string,
  message: string,
) {
  const current = bucketCircuitState[bucket];
  const nextFailures = current.consecutiveFailures + 1;
  const shouldOpenCircuit = nextFailures >= SUPABASE_FAILURES_BEFORE_CIRCUIT;

  bucketCircuitState[bucket] = {
    consecutiveFailures: nextFailures,
    openUntilMs:
      shouldOpenCircuit
        ? Date.now() +
          (bucket === "read"
            ? SUPABASE_READ_CIRCUIT_OPEN_MS
            : SUPABASE_WRITE_CIRCUIT_OPEN_MS)
        : current.openUntilMs,
    lastFailureMessage: message,
  };

  if (shouldOpenCircuit) {
    console.warn(
      `[Supabase] Circuit breaker aberto para ${method} (${bucket}) apos ${nextFailures} falhas consecutivas: ${message}`,
    );
  }
}

function ensureSupabaseCircuitClosed(bucket: SupabaseBucket, method: string) {
  const state = bucketCircuitState[bucket];
  const nowMs = Date.now();
  if (state.openUntilMs <= nowMs) {
    return;
  }

  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((state.openUntilMs - nowMs) / 1000),
  );
  throw new Error(
    `Supabase ${method} circuit breaker is open for ${retryAfterSeconds}s`,
  );
}

function resolveBucketConcurrencyLimit(bucket: SupabaseBucket) {
  return bucket === "read" ? MAX_SUPABASE_INFLIGHT_READS : MAX_SUPABASE_INFLIGHT_WRITES;
}

function resolveBucketWaitTimeoutMs(bucket: SupabaseBucket) {
  return bucket === "read"
    ? READ_CONCURRENCY_WAIT_TIMEOUT_MS
    : WRITE_CONCURRENCY_WAIT_TIMEOUT_MS;
}

async function acquireSupabaseConcurrencySlot(bucket: SupabaseBucket, method: string) {
  const limit = resolveBucketConcurrencyLimit(bucket);
  if (bucketInflightCounts[bucket] < limit) {
    bucketInflightCounts[bucket] += 1;
    return () => releaseSupabaseConcurrencySlot(bucket);
  }

  await new Promise<void>((resolve, reject) => {
    const waiters = bucketWaiters[bucket];
    const wake = () => {
      clearTimeout(timeoutId);
      resolve();
    };
    const timeoutId = setTimeout(() => {
      const index = waiters.indexOf(wake);
      if (index >= 0) {
        waiters.splice(index, 1);
      }
      reject(
        new Error(
          `Supabase ${method} concurrency limit reached for ${bucket} requests`,
        ),
      );
    }, resolveBucketWaitTimeoutMs(bucket));

    waiters.push(wake);
  });

  return () => releaseSupabaseConcurrencySlot(bucket);
}

function releaseSupabaseConcurrencySlot(bucket: SupabaseBucket) {
  const waiters = bucketWaiters[bucket];
  const nextWake = waiters.shift();
  if (nextWake) {
    nextWake();
    return;
  }

  bucketInflightCounts[bucket] = Math.max(0, bucketInflightCounts[bucket] - 1);
}

async function executeFetchWithRetries<TValue>(
  url: string | URL | Request,
  options: RequestInit,
  transformResponse: (response: Response) => Promise<TValue>,
) {
  const method = resolveRequestMethod(options);
  const bucket = resolveSupabaseBucket(method);
  const canRetry = shouldRetrySupabaseRequest(options);
  const maxAttempts = canRetry ? READ_ONLY_MAX_RETRIES : 1;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (attempt < maxAttempts && isRetriableResponseStatus(response.status)) {
        const retryDelayMs = resolveRetryDelayMs(attempt);
        console.warn(
          `[Supabase] Erro transiente ${response.status} em ${method} na tentativa ${attempt}. Retentando em ${retryDelayMs}ms...`,
        );
        clearTimeout(timeoutId);
        await sleep(retryDelayMs);
        continue;
      }

      if (shouldTripCircuitForResponseStatus(response.status)) {
        markSupabaseTransportFailure(bucket, method, `HTTP ${response.status}`);
      } else {
        markSupabaseTransportSuccess(bucket);
      }

      return await transformResponse(response);
    } catch (error) {
      const isTimeout = error instanceof Error && error.name === "AbortError";
      const isNetworkError = error instanceof TypeError;
      const errorMessage = extractErrorMessage(error);

      if (attempt < maxAttempts && (isTimeout || isNetworkError)) {
        const retryDelayMs = resolveRetryDelayMs(attempt);
        console.warn(
          `[Supabase] ${isTimeout ? "Timeout" : "Erro de Rede"} em ${method} na tentativa ${attempt}. Retentando em ${retryDelayMs}ms...`,
        );
        clearTimeout(timeoutId);
        await sleep(retryDelayMs);
        continue;
      }

      markSupabaseTransportFailure(
        bucket,
        method,
        isTimeout ? "request_timeout" : errorMessage,
      );

      if (isTimeout) {
        throw new Error(
          canRetry
            ? `Supabase ${method} request timed out after ${maxAttempts} attempts of ${DEFAULT_TIMEOUT_MS}ms`
            : `Supabase ${method} request timed out after ${DEFAULT_TIMEOUT_MS}ms`,
        );
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw new Error(`Falha ao processar requisicao Supabase ${method} apos ${maxAttempts} tentativa(s).`);
}

async function fetchReadResponseSnapshot(
  url: string | URL | Request,
  options: RequestInit,
) {
  return executeFetchWithRetries(url, options, createResponseSnapshot);
}

async function fetchReadResponseWithCoalescing(
  url: string | URL | Request,
  options: RequestInit,
) {
  const cacheKey = buildReadRequestKey(url, options);
  const cachedSnapshot = readCachedSnapshot(cacheKey);
  if (cachedSnapshot) {
    return buildResponseFromSnapshot(cachedSnapshot);
  }

  const inflight = inflightReadRequests.get(cacheKey);
  if (inflight) {
    return buildResponseFromSnapshot(cloneResponseSnapshot(await inflight));
  }

  const requestPromise = (async () => {
    const snapshot = await fetchReadResponseSnapshot(url, options);
    writeCachedSnapshot(cacheKey, snapshot);
    return snapshot;
  })();

  inflightReadRequests.set(cacheKey, requestPromise);

  try {
    return buildResponseFromSnapshot(
      cloneResponseSnapshot(await requestPromise),
    );
  } finally {
    inflightReadRequests.delete(cacheKey);
  }
}

/**
 * Custom fetch wrapper to implement timeouts, retries, concurrency backpressure
 * and short-lived read coalescing for Supabase requests.
 */
async function fetchWithTimeout(
  url: string | URL | Request,
  options: RequestInit = {},
): Promise<Response> {
  const method = resolveRequestMethod(options);
  const bucket = resolveSupabaseBucket(method);

  ensureSupabaseCircuitClosed(bucket, method);
  const releaseSlot = await acquireSupabaseConcurrencySlot(bucket, method);

  try {
    ensureSupabaseCircuitClosed(bucket, method);

    if (shouldCoalesceReadRequest(url, options)) {
      return await fetchReadResponseWithCoalescing(url, options);
    }

    return await executeFetchWithRetries(url, options, async (response) => response);
  } catch (error) {
    const message = extractErrorMessage(error);
    if (
      message.toLowerCase().includes("concurrency limit reached") ||
      message.toLowerCase().includes("circuit breaker is open")
    ) {
      markSupabaseTransportFailure(bucket, method, message);
    }
    throw error;
  } finally {
    releaseSlot();
  }
}

function buildClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });
}

const { supabaseUrl, serviceRoleKey } = resolveSupabaseEnv();
export const supabaseAdmin = buildClient(supabaseUrl || "", serviceRoleKey || "");

export function getSupabaseAdminClientOrThrow() {
  const { supabaseUrl, serviceRoleKey } = resolveSupabaseEnv();

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos no ambiente.",
    );
  }

  return supabaseAdmin;
}

export function createSupabaseAdminClient() {
  const { supabaseUrl, serviceRoleKey } = resolveSupabaseEnv();

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return buildClient(supabaseUrl, serviceRoleKey);
}
