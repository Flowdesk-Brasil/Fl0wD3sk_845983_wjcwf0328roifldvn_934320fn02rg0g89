import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth/config";
import {
  extractAuditErrorMessage,
  sanitizeErrorMessage,
} from "@/lib/security/errors";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";
import { revokeCurrentSessionFromCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  const requestContext = createSecurityRequestContext(request);
  try {
    const securityResponse = ensureSameOriginJsonMutationRequest(request);
    if (securityResponse) return attachRequestId(securityResponse, requestContext.requestId);

    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_logout",
      outcome: "started",
    });

    await revokeCurrentSessionFromCookie();

    const response = NextResponse.json({ ok: true });
    response.cookies.delete(authConfig.sessionCookieName);
    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_logout",
      outcome: "succeeded",
    });
    return attachRequestId(applyNoStoreHeaders(response), requestContext.requestId);
  } catch (error) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_logout",
      outcome: "failed",
      metadata: {
        message: extractAuditErrorMessage(error),
      },
    });
    return attachRequestId(applyNoStoreHeaders(
      NextResponse.json(
      {
        ok: false,
        message: sanitizeErrorMessage(error, "Erro ao encerrar sessao."),
      },
      { status: 500 },
      ),
    ), requestContext.requestId);
  }
}
