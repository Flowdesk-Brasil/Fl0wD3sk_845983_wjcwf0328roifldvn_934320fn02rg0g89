import type { DomainProviderName } from "@/lib/domains/adapter";

export type DomainProviderErrorKind =
  | "not_configured"
  | "unsupported"
  | "temporary"
  | "rate_limited"
  | "validation"
  | "unavailable"
  | "permanent";

export class DomainProviderError extends Error {
  constructor(
    public readonly provider: DomainProviderName,
    public readonly kind: DomainProviderErrorKind,
    message: string,
    public readonly status = 500,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainProviderError";
  }

  get allowsFallback() {
    return (
      this.kind === "not_configured" ||
      this.kind === "unsupported" ||
      this.kind === "temporary" ||
      this.kind === "rate_limited"
    );
  }
}

export function asProviderError(
  provider: DomainProviderName,
  error: unknown,
  fallbackMessage: string,
) {
  if (error instanceof DomainProviderError) return error;
  const message = error instanceof Error ? error.message : fallbackMessage;
  if (/timeout|abort|temporar|unavailable|maintenance|503|502|504/i.test(message)) {
    return new DomainProviderError(provider, "temporary", message, 503, error);
  }
  if (/429|rate limit|too many/i.test(message)) {
    return new DomainProviderError(provider, "rate_limited", message, 429, error);
  }
  if (/not configured|configuracao|credential|api key|username|password/i.test(message)) {
    return new DomainProviderError(provider, "not_configured", message, 503, error);
  }
  return new DomainProviderError(provider, "permanent", message, 500, error);
}
