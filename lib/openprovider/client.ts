import {
  AuthLoginResponseData,
  OpenProviderApiResponse,
  OpenProviderErrorPayload,
} from "./types";

type QueryValue = string | number | boolean | null | undefined | Array<string | number | boolean>;

interface RequestOptions extends RequestInit {
  query?: Record<string, QueryValue>;
  requireAuth?: boolean;
  retryOnAuthFailure?: boolean;
  requestId?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  retryableStatuses: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: Number(process.env.OPENPROVIDER_MAX_RETRIES) || 3,
  baseDelayMs: Number(process.env.OPENPROVIDER_RETRY_BASE_DELAY_MS) || 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  const delay = config.baseDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (error instanceof OpenProviderRequestError) {
    // Don't retry maintenance errors
    if (error.maintenance) {
      return false;
    }
    // Retry on specific HTTP statuses
    if (config.retryableStatuses.includes(error.status)) {
      return true;
    }
    // Retry on timeout errors
    if (error.status === 504 || /timeout/i.test(error.message)) {
      return true;
    }
  }

  // Retry on network errors (AbortError from timeout)
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  return false;
}

class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly recoveryTimeoutMs: number = 60000, // 1 minute
    private readonly successThreshold: number = 2,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeoutMs) {
        this.state = 'half-open';
      } else {
        throw new OpenProviderRequestError(
          "Circuit breaker is open - API is currently unavailable",
          { status: 503 }
        );
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess() {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export class OpenProviderRequestError extends Error {
  status: number;
  code?: number;
  details?: unknown;
  maintenance: boolean;
  retryCount?: number;

  constructor(
    message: string,
    {
      status = 500,
      code,
      details,
      maintenance = false,
      retryCount,
    }: {
      status?: number;
      code?: number;
      details?: unknown;
      maintenance?: boolean;
      retryCount?: number;
    } = {},
  ) {
    super(message);
    this.name = "OpenProviderRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.maintenance = maintenance;
    this.retryCount = retryCount;
  }
}

function parseJsonResponse<TData>(rawText: string): OpenProviderApiResponse<TData> {
  if (!rawText.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawText) as OpenProviderApiResponse<TData>;
  } catch {
    return {
      desc: rawText.trim(),
      data: rawText.trim() as unknown as TData,
    };
  }
}

function isMaintenancePayload(payload: OpenProviderApiResponse<unknown>) {
  if (payload.maintenance) {
    return true;
  }

  if (payload.code === 4005) {
    return true;
  }

  if (typeof payload.desc === "string" && /maintenance|manutenc/i.test(payload.desc)) {
    return true;
  }

  return false;
}

function buildUrl(baseUrl: string, endpoint: string, query?: Record<string, QueryValue>) {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedEndpoint = endpoint.replace(/^\//, "");
  const url = new URL(`${normalizedBase}/${normalizedEndpoint}`);

  if (!query) {
    return url.toString();
  }

  for (const [key, rawValue] of Object.entries(query)) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      continue;
    }

    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      url.searchParams.append(key, String(value));
    }
  }

  return url.toString();
}

export class OpenProviderClient {
  private readonly baseUrl: string;
  private readonly username: string;
  private readonly password: string;
  private readonly ip: string;
  private readonly timeoutMs: number;
  private readonly circuitBreaker: CircuitBreaker;

  private token = "";
  private loginPromise: Promise<string> | null = null;

  constructor() {
    this.baseUrl = process.env.OPENPROVIDER_BASE_URL || "https://api.openprovider.eu/v1beta";
    this.username = process.env.OPENPROVIDER_USERNAME?.trim() || "";
    this.password = process.env.OPENPROVIDER_PASSWORD || "";
    this.ip = process.env.OPENPROVIDER_IP?.trim() || "";
    this.timeoutMs = Number(process.env.OPENPROVIDER_TIMEOUT_MS) || 12000;

    const failureThreshold = Number(process.env.OPENPROVIDER_CIRCUIT_BREAKER_FAILURE_THRESHOLD) || 5;
    const recoveryTimeoutMs = Number(process.env.OPENPROVIDER_CIRCUIT_BREAKER_RECOVERY_TIMEOUT_MS) || 60000;
    this.circuitBreaker = new CircuitBreaker(failureThreshold, recoveryTimeoutMs);
  }

  private ensureConfigured() {
    const missing: string[] = [];

    if (!this.username) {
      missing.push("OPENPROVIDER_USERNAME");
    }

    if (!this.password) {
      missing.push("OPENPROVIDER_PASSWORD");
    }

    if (missing.length > 0) {
      throw new OpenProviderRequestError(
        `Configuracao incompleta da Openprovider. Defina: ${missing.join(", ")}`,
        { status: 500 },
      );
    }
  }

  private buildAuthHeaders(token: string) {
    return {
      Authorization: `Bearer ${token}`,
    };
  }

  private isAuthenticationFailure(error: unknown) {
    if (!(error instanceof OpenProviderRequestError)) {
      return false;
    }

    if (error.status === 401) {
      return true;
    }

    return /Authentication\/Authorization Failed/i.test(error.message);
  }

  private async doRequest<TData>(
    endpoint: string,
    {
      query,
      requireAuth = true,
      retryOnAuthFailure = true,
      requestId = Math.random().toString(36).slice(2, 8),
      maxRetries = DEFAULT_RETRY_CONFIG.maxRetries,
      retryDelayMs = DEFAULT_RETRY_CONFIG.baseDelayMs,
      headers,
      ...options
    }: RequestOptions = {},
  ): Promise<OpenProviderApiResponse<TData>> {
    return this.circuitBreaker.execute(async () => {
      const retryConfig: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        maxRetries,
        baseDelayMs: retryDelayMs,
      };

      let lastError: unknown;

      for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const mergedHeaders = new Headers(headers);
          const hasBody = options.body !== undefined && options.body !== null;

          if (hasBody && !mergedHeaders.has("Content-Type")) {
            mergedHeaders.set("Content-Type", "application/json");
          }

          if (requireAuth) {
            const token = await this.login(requestId);
            for (const [key, value] of Object.entries(this.buildAuthHeaders(token))) {
              mergedHeaders.set(key, value);
            }
          }

          const response = await fetch(buildUrl(this.baseUrl, endpoint, query), {
            ...options,
            headers: mergedHeaders,
            signal: controller.signal,
          });

          const rawText = await response.text();
          const payload = parseJsonResponse<TData>(rawText);

          if (isMaintenancePayload(payload)) {
            throw new OpenProviderRequestError(
              "A Openprovider informou manutencao temporaria na API.",
              {
                status: response.status || 503,
                code: payload.code,
                details: payload,
                maintenance: true,
                retryCount: attempt,
              },
            );
          }

          if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
            throw new OpenProviderRequestError(
              payload.desc || `A Openprovider respondeu com status ${response.status}.`,
              {
                status: response.status || 500,
                code: payload.code,
                details: payload,
                retryCount: attempt,
              },
            );
          }

          // Success - return the payload
          if (attempt > 0) {
            console.log(`[OpenProvider][${requestId}] Request succeeded after ${attempt} retries`);
          }
          return payload;

        } catch (error) {
          lastError = error;

          // Log retry attempts
          if (attempt > 0) {
            console.warn(`[OpenProvider][${requestId}] Attempt ${attempt} failed:`, error instanceof Error ? error.message : String(error));
          }

          // Check if we should retry
          const shouldRetry = attempt < retryConfig.maxRetries && isRetryableError(error, retryConfig);

          if (!shouldRetry) {
            // Don't retry - rethrow the error
            if (error instanceof OpenProviderRequestError) {
              throw error;
            }

            if (error instanceof DOMException && error.name === "AbortError") {
              throw new OpenProviderRequestError("Timeout ao consultar a Openprovider.", {
                status: 504,
                retryCount: attempt,
              });
            }

            const unknownError = error as Error;
            throw new OpenProviderRequestError(
              unknownError?.message || "Falha inesperada ao consultar a Openprovider.",
              { retryCount: attempt },
            );
          }

          // Calculate delay and wait before retry
          const delay = calculateRetryDelay(attempt, retryConfig);
          console.log(`[OpenProvider][${requestId}] Retrying in ${delay}ms (attempt ${attempt + 1}/${retryConfig.maxRetries + 1})`);
          await sleep(delay);

        } finally {
          clearTimeout(timeoutId);
        }
      }

      // If we get here, all retries failed
      if (lastError instanceof OpenProviderRequestError) {
        throw lastError;
      }

      throw new OpenProviderRequestError(
        "Falha apos todas as tentativas de retry.",
        { retryCount: retryConfig.maxRetries },
      );
    });
  }

  private async login(requestId: string): Promise<string> {
    this.ensureConfigured();

    if (this.token) {
      return this.token;
    }

    if (!this.loginPromise) {
      this.loginPromise = (async () => {
        const payload: Record<string, string> = {
          username: this.username,
          password: this.password,
        };

        if (this.ip) {
          payload.ip = this.ip;
        }

        console.log(`[OpenProvider][${requestId}] Authenticating`);

        const response = await this.doRequest<AuthLoginResponseData>("auth/login", {
          method: "POST",
          body: JSON.stringify(payload),
          requireAuth: false,
          retryOnAuthFailure: false,
          maxRetries: 2, // Fewer retries for auth
          requestId,
        });

        const token = response.data?.token?.trim();
        if (!token) {
          throw new OpenProviderRequestError(
            "A Openprovider nao retornou token de autenticacao.",
            {
              status: 502,
              details: response,
            },
          );
        }

        console.log(`[OpenProvider][${requestId}] Authentication succeeded`);
        this.token = token;
        return token;
      })().finally(() => {
        this.loginPromise = null;
      });
    }

    return this.loginPromise;
  }

  async get<TData>(endpoint: string, query?: Record<string, QueryValue>) {
    return this.doRequest<TData>(endpoint, {
      method: "GET",
      query,
    });
  }

  async post<TData>(endpoint: string, body?: unknown, options: Omit<RequestOptions, "body" | "method"> = {}) {
    return this.doRequest<TData>(endpoint, {
      ...options,
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  getCircuitBreakerStatus() {
    return this.circuitBreaker.getState();
  }
}

export function getOpenProviderErrorMessage(error: unknown) {
  if (error instanceof OpenProviderRequestError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Erro desconhecido ao consultar a Openprovider.";
}

export function getOpenProviderErrorDetails(error: unknown): OpenProviderErrorPayload | null {
  if (error instanceof OpenProviderRequestError && error.details && typeof error.details === "object") {
    return error.details as OpenProviderErrorPayload;
  }

  return null;
}

export const openProviderClient = new OpenProviderClient();
