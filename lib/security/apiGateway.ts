import { NextResponse } from "next/server";
import {
  applyStandardSecurityHeaders,
  applyStrictApiCorsHeaders,
} from "@/lib/security/http";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const ALLOWED_API_METHODS = new Set([
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "OPTIONS",
]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const DEFAULT_API_BODY_LIMIT_BYTES = 1 * 1024 * 1024;
const AUTH_BODY_LIMIT_BYTES = 96 * 1024;
const WEBHOOK_BODY_LIMIT_BYTES = 512 * 1024;
const ADMIN_BODY_LIMIT_BYTES = 256 * 1024;
const HOSTING_BODY_LIMIT_BYTES = 4 * 1024 * 1024;
const AVATAR_BODY_LIMIT_BYTES = 6 * 1024 * 1024;
const MAX_API_URL_LENGTH = 8_192;
const MAX_QUERY_PARAMS = 80;
const MAX_QUERY_KEY_LENGTH = 160;
const MAX_QUERY_VALUE_LENGTH = 4_096;
const MAX_HEADER_COUNT = 96;
const MAX_HEADER_NAME_LENGTH = 96;
const MAX_HEADER_VALUE_LENGTH = 8_192;
const MAX_COOKIE_HEADER_LENGTH = 12_288;
const MAX_IDEMPOTENCY_KEY_LENGTH = 120;

const CONTROL_CHAR_PATTERN = /[\u0000-\u001f\u007f]/;
const DANGEROUS_KEY_PATTERN =
  /(?:^|[.[\]])(?:__proto__|prototype|constructor)(?:$|[.[\]])/i;
const PATH_TRAVERSAL_PATTERN =
  /(?:^|[\\/])\.\.(?:[\\/]|$)|(?:%2e|%252e){2}|%2f|%5c/i;
const DANGEROUS_PROTOCOL_PATTERN =
  /(?:^|[^\w])(?:javascript|vbscript|data|file|gopher|dict|ftp):/i;
const SSRF_TARGET_PATTERN =
  /(?:169\.254\.169\.254|metadata\.google\.internal|metadata\.azure\.com|100\.100\.100\.200)/i;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

const DEFAULT_JSON_MIME_TYPES = new Set(["application/json"]);
const WEBHOOK_MIME_TYPES = new Set([
  "application/json",
  "application/x-www-form-urlencoded",
  "text/plain",
]);
const MULTIPART_MIME_TYPES = new Set(["multipart/form-data"]);

export type ApiGatewayRejectionCode =
  | "api_method_not_allowed"
  | "api_url_too_long"
  | "api_path_rejected"
  | "api_query_rejected"
  | "api_headers_rejected"
  | "api_payload_too_large"
  | "api_content_type_required"
  | "api_content_type_rejected";

export type ApiGatewayEvaluation =
  | { ok: true }
  | {
      ok: false;
      status: number;
      code: ApiGatewayRejectionCode;
      reason: string;
    };

function reject(
  status: number,
  code: ApiGatewayRejectionCode,
  reason: string,
): ApiGatewayEvaluation {
  return {
    ok: false,
    status,
    code,
    reason,
  };
}

function safelyDecode(value: string) {
  let output = value;
  for (let index = 0; index < 2; index += 1) {
    try {
      const decoded = decodeURIComponent(output);
      if (decoded === output) break;
      output = decoded;
    } catch {
      break;
    }
  }
  return output;
}

function hasControlChars(value: string) {
  return CONTROL_CHAR_PATTERN.test(value);
}

function hasDangerousKey(value: string) {
  return DANGEROUS_KEY_PATTERN.test(value);
}

function hasTraversal(value: string) {
  const decoded = safelyDecode(value);
  return PATH_TRAVERSAL_PATTERN.test(value) || PATH_TRAVERSAL_PATTERN.test(decoded);
}

function hasDangerousUrlValue(value: string) {
  const decoded = safelyDecode(value).trim();
  return (
    DANGEROUS_PROTOCOL_PATTERN.test(decoded) ||
    SSRF_TARGET_PATTERN.test(decoded)
  );
}

function normalizeMimeType(value: string | null) {
  if (!value) return "";
  if (hasControlChars(value)) return "";
  return value.split(";")[0]?.trim().toLowerCase() || "";
}

function isWebhookPath(pathname: string) {
  return (
    pathname.startsWith("/api/webhooks/") ||
    pathname.startsWith("/api/payments/mercadopago/")
  );
}

function isMultipartUploadPath(pathname: string) {
  return pathname === "/api/auth/me/personal-data/avatar";
}

function isHostingHeavyMutationPath(pathname: string) {
  return (
    pathname.includes("/hosting/vps/") &&
    (pathname.endsWith("/files") ||
      pathname.endsWith("/env") ||
      pathname.endsWith("/flow-chat") ||
      pathname.endsWith("/settings"))
  );
}

function resolveBodyLimitBytes(pathname: string) {
  if (isMultipartUploadPath(pathname)) return AVATAR_BODY_LIMIT_BYTES;
  if (isHostingHeavyMutationPath(pathname)) return HOSTING_BODY_LIMIT_BYTES;
  if (isWebhookPath(pathname)) return WEBHOOK_BODY_LIMIT_BYTES;
  if (pathname.startsWith("/api/admin/")) return ADMIN_BODY_LIMIT_BYTES;
  if (pathname.startsWith("/api/auth/")) return AUTH_BODY_LIMIT_BYTES;
  return DEFAULT_API_BODY_LIMIT_BYTES;
}

function resolveAllowedMimeTypes(pathname: string) {
  if (isWebhookPath(pathname)) return WEBHOOK_MIME_TYPES;
  if (isMultipartUploadPath(pathname)) return MULTIPART_MIME_TYPES;
  return DEFAULT_JSON_MIME_TYPES;
}

function inspectPathAndQuery(url: URL): ApiGatewayEvaluation {
  if (url.toString().length > MAX_API_URL_LENGTH) {
    return reject(414, "api_url_too_long", "url_too_long");
  }

  if (hasControlChars(url.pathname) || hasTraversal(url.pathname)) {
    return reject(400, "api_path_rejected", "unsafe_path");
  }

  const entries = Array.from(url.searchParams.entries());
  if (entries.length > MAX_QUERY_PARAMS) {
    return reject(400, "api_query_rejected", "too_many_query_params");
  }

  for (const [key, value] of entries) {
    if (
      !key ||
      key.length > MAX_QUERY_KEY_LENGTH ||
      value.length > MAX_QUERY_VALUE_LENGTH ||
      hasControlChars(key) ||
      hasControlChars(value) ||
      hasDangerousKey(key) ||
      hasTraversal(key) ||
      hasTraversal(value) ||
      hasDangerousUrlValue(value)
    ) {
      return reject(400, "api_query_rejected", "unsafe_query");
    }
  }

  return { ok: true };
}

function inspectHeaders(request: Request): ApiGatewayEvaluation {
  const entries = Array.from(request.headers.entries());
  if (entries.length > MAX_HEADER_COUNT) {
    return reject(400, "api_headers_rejected", "too_many_headers");
  }

  for (const [name, value] of entries) {
    if (
      !name ||
      name.length > MAX_HEADER_NAME_LENGTH ||
      value.length > MAX_HEADER_VALUE_LENGTH ||
      hasControlChars(name) ||
      hasControlChars(value)
    ) {
      return reject(400, "api_headers_rejected", "unsafe_header");
    }
  }

  const cookieHeader = request.headers.get("cookie") || "";
  if (cookieHeader.length > MAX_COOKIE_HEADER_LENGTH) {
    return reject(400, "api_headers_rejected", "cookie_header_too_large");
  }

  const idempotencyKey =
    request.headers.get("idempotency-key") ||
    request.headers.get("x-flowdesk-idempotency-key") ||
    "";
  if (
    idempotencyKey &&
    (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
      !IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey))
  ) {
    return reject(400, "api_headers_rejected", "invalid_idempotency_key");
  }

  return { ok: true };
}

function inspectBodyEnvelope(request: Request, pathname: string) {
  const method = request.method.toUpperCase();
  const contentLengthHeader = request.headers.get("content-length");
  const contentTypeHeader = request.headers.get("content-type");
  const contentLength =
    contentLengthHeader === null ? null : Number(contentLengthHeader);
  const hasBody =
    contentLength === null
      ? Boolean(contentTypeHeader) && !SAFE_METHODS.has(method)
      : contentLength > 0;

  if (
    contentLength !== null &&
    (!Number.isFinite(contentLength) || contentLength < 0)
  ) {
    return reject(400, "api_headers_rejected", "invalid_content_length");
  }

  if (SAFE_METHODS.has(method)) {
    if (contentLength && contentLength > 0) {
      return reject(400, "api_payload_too_large", "safe_method_body_rejected");
    }
    return { ok: true } as const;
  }

  if (!MUTATION_METHODS.has(method)) {
    return { ok: true } as const;
  }

  const limit = resolveBodyLimitBytes(pathname);
  if (contentLength !== null && contentLength > limit) {
    return reject(413, "api_payload_too_large", "body_too_large");
  }

  if (!hasBody) {
    return { ok: true } as const;
  }

  const mimeType = normalizeMimeType(contentTypeHeader);
  if (!mimeType) {
    return reject(415, "api_content_type_required", "content_type_required");
  }

  if (!resolveAllowedMimeTypes(pathname).has(mimeType)) {
    return reject(415, "api_content_type_rejected", "content_type_rejected");
  }

  return { ok: true } as const;
}

export function evaluateApiGatewayRequest(request: Request): ApiGatewayEvaluation {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    return { ok: true };
  }

  const method = request.method.toUpperCase();
  if (!ALLOWED_API_METHODS.has(method)) {
    return reject(405, "api_method_not_allowed", "method_not_allowed");
  }

  const pathAndQuery = inspectPathAndQuery(url);
  if (!pathAndQuery.ok) return pathAndQuery;

  const headers = inspectHeaders(request);
  if (!headers.ok) return headers;

  return inspectBodyEnvelope(request, url.pathname);
}

export function buildApiGatewayRejectionResponse(
  request: Request,
  evaluation: Exclude<ApiGatewayEvaluation, { ok: true }>,
  input: {
    requestId: string;
    contentSecurityPolicy?: string | null;
  },
) {
  const response = NextResponse.json(
    {
      ok: false,
      code: evaluation.code,
      message: "Requisicao invalida.",
      requestId: input.requestId,
    },
    { status: evaluation.status },
  );

  applyStandardSecurityHeaders(response, {
    contentSecurityPolicy: input.contentSecurityPolicy,
    requestId: input.requestId,
    noIndex: true,
  });
  applyStrictApiCorsHeaders(response, request);
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Flowdesk-Block-Reason", evaluation.code);

  if (evaluation.status === 405) {
    response.headers.set(
      "Allow",
      Array.from(ALLOWED_API_METHODS).join(", "),
    );
  }

  return response;
}
