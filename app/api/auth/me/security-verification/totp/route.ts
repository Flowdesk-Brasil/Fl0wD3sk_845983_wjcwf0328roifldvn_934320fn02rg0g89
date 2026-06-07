import { NextRequest, NextResponse } from "next/server";
import {
  issueSensitiveActionProof,
  normalizeSensitiveAccountAction,
  SENSITIVE_ACCOUNT_ACTIONS,
  readSensitiveActionChallenge,
} from "@/lib/auth/sensitiveAction";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { verifyUserTotp } from "@/lib/auth/twoFactor";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

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
        action: flowSecureDto.optional(flowSecureDto.enum(SENSITIVE_ACCOUNT_ACTIONS)),
        target: flowSecureDto.optional(flowSecureDto.string({
          maxLength: 80,
          pattern: /^[A-Za-z0-9:_-]+$/,
        })),
      },
      { rejectUnknown: true },
    );
    const challengeId = body.challengeId;
    const action = normalizeSensitiveAccountAction(body.action);
    const target = typeof body.target === "string" ? body.target : null;

    await readSensitiveActionChallenge(session.user.id, challengeId);
    const valid = await verifyUserTotp(session.user.id, body.code);
    if (!valid) throw new Error("Codigo do autenticador invalido.");
    const proof = await issueSensitiveActionProof(session.user.id, challengeId, {
      action,
      target,
      method: "totp",
    });
    return applyNoStoreHeaders(NextResponse.json({ ok: true, proof }));
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
