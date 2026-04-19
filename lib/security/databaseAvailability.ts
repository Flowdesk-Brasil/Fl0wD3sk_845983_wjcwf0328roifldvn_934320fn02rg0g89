import { extractErrorMessage } from "@/lib/security/errors";

const DATABASE_AVAILABILITY_PATTERNS = [
  "supabase",
  "timeout",
  "timed out",
  "fetch failed",
  "network",
  "socket hang up",
  "econnreset",
  "econnrefused",
  "etimedout",
  "service unavailable",
  "bad gateway",
  "gateway timeout",
  "concurrency limit reached",
  "circuit breaker is open",
  "too many requests",
];

export function isDatabaseAvailabilityError(error: unknown) {
  const message = extractErrorMessage(error, "").toLowerCase();
  if (!message) {
    return false;
  }

  return DATABASE_AVAILABILITY_PATTERNS.some((pattern) =>
    message.includes(pattern),
  );
}

export function resolveDatabaseFailureStatus(error: unknown) {
  return isDatabaseAvailabilityError(error) ? 503 : 500;
}

export function resolveDatabaseFailureMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (isDatabaseAvailabilityError(error)) {
    return "Sistema temporariamente ocupado. Tente novamente em alguns instantes.";
  }

  return fallbackMessage;
}
