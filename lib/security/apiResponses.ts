import { NextResponse } from "next/server";
import { applyNoStoreHeaders } from "@/lib/security/http";
import {
  attachRequestId,
  type SecurityRequestContext,
} from "@/lib/security/requestSecurity";
import {
  extractAuditErrorMessage,
  sanitizePublicErrorMessage,
} from "@/lib/security/errors";

export function buildPublicApiErrorResponse(
  context: SecurityRequestContext,
  input: {
    error?: unknown;
    fallbackMessage: string;
    status?: number;
    code?: string;
    extra?: Record<string, unknown>;
    exposeSafeErrorMessage?: boolean;
  },
) {
  const status = input.status || 400;
  const code = input.code;
  const message =
    input.error === undefined || !input.exposeSafeErrorMessage
      ? input.fallbackMessage
      : sanitizePublicErrorMessage(input.error, input.fallbackMessage);

  if (input.error !== undefined) {
    const detail = extractAuditErrorMessage(input.error, "public_api_error");
    const logPayload = {
      requestId: context.requestId,
      method: context.method,
      path: context.path,
      status,
      ...(code ? { code } : {}),
      detail,
    };
    if (status >= 500) {
      console.error("[public_api_error]", logPayload);
    } else {
      console.warn("[public_api_error]", logPayload);
    }
  }

  return attachRequestId(
    applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          ...(code ? { code } : {}),
          message,
          requestId: context.requestId,
          ...(input.extra || {}),
        },
        { status },
      ),
    ),
    context.requestId,
  );
}
