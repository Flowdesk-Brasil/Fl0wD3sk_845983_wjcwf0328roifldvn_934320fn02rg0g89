import { NextRequest, NextResponse } from "next/server";
import {
  setSharedSessionCookie,
  setSharedTrustedDeviceCookie,
} from "@/lib/auth/cookies";
import {
  completePendingTwoFactorLogin,
  readPendingTwoFactorLogin,
  verifyUserTotp,
} from "@/lib/auth/twoFactor";
import { issueTrustedDevice } from "@/lib/auth/trustedDevice";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  try {
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        challengeId: flowSecureDto.string({
          minLength: 8,
          maxLength: 120,
          rejectThreatPatterns: false,
        }),
        code: flowSecureDto.string({ maxLength: 6, pattern: /^\d{6}$/ }),
      },
      { rejectUnknown: true },
    );
    const challengeId = body.challengeId;

    const pending = await readPendingTwoFactorLogin(challengeId);
    const valid = await verifyUserTotp(pending.payload.userId, body.code);
    if (!valid) throw new Error("Codigo do autenticador invalido.");

    const completed = await completePendingTwoFactorLogin(challengeId);
    const response = applyNoStoreHeaders(
      NextResponse.json({ ok: true, redirectTo: completed.redirectTo }),
    );
    setSharedSessionCookie(request, response, completed.session.sessionToken, {
      maxAge: completed.session.maxAgeSeconds,
    });
    if (completed.rememberSession) {
      const trustedDevice = await issueTrustedDevice({
        userId: completed.userId,
        userAgent: request.headers.get("user-agent"),
      });
      setSharedTrustedDeviceCookie(request, response, trustedDevice.token);
    }
    return response;
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error ? error.message : "Nao foi possivel validar o codigo.",
        },
        { status: 400 },
      ),
    );
  }
}
