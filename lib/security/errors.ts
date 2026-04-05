const TOKEN_LIKE_PATTERN =
  /\b(?:Bearer\s+)?[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{12,}\.[A-Za-z0-9_\-]{12,}\b/g;
const LONG_SECRET_PATTERN = /\b[A-Za-z0-9_\-]{32,}\b/g;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractErrorMessage(
  error: unknown,
  fallback = "unknown_error",
) {
  if (error instanceof Error) {
    const message = normalizeWhitespace(error.message || "");
    return message || fallback;
  }

  if (typeof error === "string") {
    const message = normalizeWhitespace(error);
    return message || fallback;
  }

  return fallback;
}

export function redactSensitiveErrorMessage(message: string) {
  return normalizeWhitespace(message)
    .replace(TOKEN_LIKE_PATTERN, "[redacted-token]")
    .replace(LONG_SECRET_PATTERN, (match) => {
      if (/^[0-9]+$/.test(match)) {
        return match;
      }

      return "[redacted-secret]";
    })
    .slice(0, 280);
}

export function extractAuditErrorMessage(
  error: unknown,
  fallback = "unknown_error",
) {
  return redactSensitiveErrorMessage(extractErrorMessage(error, fallback));
}

export function sanitizeErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (process.env.NODE_ENV !== "production") {
    return extractErrorMessage(error, fallbackMessage);
  }

  return fallbackMessage;
}
