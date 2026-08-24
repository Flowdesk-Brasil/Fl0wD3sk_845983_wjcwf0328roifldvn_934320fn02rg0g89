import { NextRequest, NextResponse } from "next/server";
import {
  createPasswordResetRequest,
  revokePasswordResetToken,
} from "@/lib/auth/passwordReset";
import { sendPasswordResetEmail } from "@/lib/mail/authEmail";
import { resolveAuthOrigin } from "@/lib/routing/subdomains";
import {
  FlowSecureDtoError,
  flowSecureDto,
  parseFlowSecureDto,
} from "@/lib/security/flowSecure";
import {
  extractAuditErrorMessage,
  sanitizePublicErrorMessage,
} from "@/lib/security/errors";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";

function extractClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  return forwardedFor.split(",")[0]?.trim() || null;
}

async function deliverPasswordResetEmail(input: {
  toEmail: string;
  resetUrl: string;
  expiresInMinutes: number;
  requestContext: ReturnType<typeof createSecurityRequestContext>;
}) {
  try {
    await sendPasswordResetEmail({
      toEmail: input.toEmail,
      resetUrl: input.resetUrl,
      expiresInMinutes: input.expiresInMinutes,
    });
    await logSecurityAuditEventSafe(input.requestContext, {
      action: "auth_password_reset_email_delivery",
      outcome: "succeeded",
    });
  } catch (error) {
    await logSecurityAuditEventSafe(input.requestContext, {
      action: "auth_password_reset_email_delivery",
      outcome: "failed",
      metadata: { reason: extractAuditErrorMessage(error) },
    });
    throw error;
  }
}

function buildPasswordResetAcceptedResponse(requestId: string) {
  return attachRequestId(
    applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        message:
          "Se este email estiver cadastrado, enviaremos um link seguro de redefinicao.",
      }),
    ),
    requestId,
  );
}

function buildPasswordResetDeliveryFailureResponse(
  error: unknown,
  requestId: string,
) {
  return attachRequestId(
    applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizePublicErrorMessage(
            error,
            "Nao foi possivel enviar o email de redefinicao agora. Tente novamente em instantes.",
          ),
          requestId,
        },
        { status: 503 },
      ),
    ),
    requestId,
  );
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  const requestContext = createSecurityRequestContext(request);
  let payload: { email: string };

  try {
    payload = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      { email: flowSecureDto.email() },
      { rejectUnknown: true },
    );
  } catch (error) {
    const message =
      error instanceof FlowSecureDtoError
        ? error.issues[0] || error.message
        : "Payload invalido.";
    return attachRequestId(
      applyNoStoreHeaders(NextResponse.json({ ok: false, message }, { status: 400 })),
      requestContext.requestId,
    );
  }

  const rateLimit = await enforceRequestRateLimit({
    action: "auth_password_reset_request",
    windowMs: 15 * 60 * 1000,
    maxAttempts: 8,
    context: requestContext,
  });

  if (!rateLimit.ok) {
    const response = applyNoStoreHeaders(
      NextResponse.json(
        { ok: false, message: "Muitas tentativas seguidas. Aguarde alguns segundos." },
        { status: 429 },
      ),
    );
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return attachRequestId(response, requestContext.requestId);
  }

  await logSecurityAuditEventSafe(requestContext, {
    action: "auth_password_reset_request",
    outcome: "started",
  });

  try {
    const reset = await createPasswordResetRequest({
      email: payload.email,
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get("user-agent"),
    });

    if (reset) {
      const resetUrl = new URL(`/pass/v1/tk/${reset.token}`, resolveAuthOrigin(request)).toString();
      try {
        await deliverPasswordResetEmail({
          toEmail: reset.user.email || payload.email,
          resetUrl,
          expiresInMinutes: reset.expiresInMinutes,
          requestContext,
        });
      } catch (deliveryError) {
        await revokePasswordResetToken(reset.token).catch((revokeError) =>
          logSecurityAuditEventSafe(requestContext, {
            action: "auth_password_reset_token_revoke_after_delivery_failure",
            outcome: "failed",
            metadata: { reason: extractAuditErrorMessage(revokeError) },
          }),
        );
        return buildPasswordResetDeliveryFailureResponse(
          deliveryError,
          requestContext.requestId,
        );
      }
    }

    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_password_reset_request",
      outcome: "succeeded",
      metadata: { sent: Boolean(reset) },
    });
  } catch (error) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "auth_password_reset_request",
      outcome: "failed",
      metadata: { reason: extractAuditErrorMessage(error) },
    });
  }

  return buildPasswordResetAcceptedResponse(requestContext.requestId);
}
