const TOKEN_LIKE_PATTERN =
  /\b(?:Bearer\s+)?[A-Za-z0-9_\-]{24,}\.[A-Za-z0-9_\-]{12,}\.[A-Za-z0-9_\-]{12,}\b/g;
const LONG_SECRET_PATTERN = /\b[A-Za-z0-9_\-]{32,}\b/g;
const ENV_VAR_PATTERN =
  /\b(?:AUTH|NEXT_PUBLIC|SUPABASE|GOOGLE|DISCORD|MICROSOFT|MERCADOPAGO|FLOWSECURE|OPENAI|VERCEL|STRIPE|POSTGRES|DATABASE|SMTP)_[A-Z0-9_]+\b/g;
const INFRASTRUCTURE_ERROR_PATTERN =
  /\b(?:smtp|nodemailer|eauth|econnrefused|enotfound|etimedout|dns|service[_\s-]?role|supabase|postgrest|pgrst\d*|api[_\s-]?key|client[_\s-]?secret|private[_\s-]?key|credential|credencial|credenciais|connection refused|connection timeout|network timeout|socket hang up|tls|ssl|database|postgres|sqlstate|row-level security|permission denied|unique constraint|foreign key|violates|schema cache|relation .* does not exist|column .* does not exist|null value in column)\b/i;
const SECRET_ASSIGNMENT_PATTERN =
  /\b(?:secret|token|password|pass|key)\s*[:=]\s*[^,\s]+/i;

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
    .replace(ENV_VAR_PATTERN, "[redacted-env]")
    .replace(TOKEN_LIKE_PATTERN, "[redacted-token]")
    .replace(SECRET_ASSIGNMENT_PATTERN, (match) =>
      match.replace(/[:=]\s*.+$/, "=[redacted-secret]"),
    )
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

export function isSensitiveInfrastructureError(error: unknown) {
  const message = extractErrorMessage(error, "");
  if (!message) return false;
  ENV_VAR_PATTERN.lastIndex = 0;
  SECRET_ASSIGNMENT_PATTERN.lastIndex = 0;
  INFRASTRUCTURE_ERROR_PATTERN.lastIndex = 0;
  return (
    ENV_VAR_PATTERN.test(message) ||
    INFRASTRUCTURE_ERROR_PATTERN.test(message) ||
    SECRET_ASSIGNMENT_PATTERN.test(message)
  );
}

export function sanitizeErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (isSensitiveInfrastructureError(error)) {
    return fallbackMessage;
  }

  if (process.env.NODE_ENV !== "production") {
    return redactSensitiveErrorMessage(extractErrorMessage(error, fallbackMessage));
  }

  return fallbackMessage;
}

export function sanitizePublicErrorMessage(
  error: unknown,
  fallbackMessage: string,
) {
  if (isSensitiveInfrastructureError(error)) {
    return fallbackMessage;
  }

  return redactSensitiveErrorMessage(extractErrorMessage(error, fallbackMessage));
}
