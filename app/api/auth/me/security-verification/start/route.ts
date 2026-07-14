import { NextRequest, NextResponse } from "next/server";
import {
  createSensitiveActionChallenge,
  type SensitiveAccountAction,
} from "@/lib/auth/sensitiveAction";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

const ACTION_VALUES = [
  "account_delete",
  "email_change",
  "password_change",
  "passkey_add",
  "provider_unlink",
  "totp_enable",
  "totp_disable",
  "passkey_remove",
  "vps_delete",
] as const satisfies readonly SensitiveAccountAction[];
const ACTIONS = new Set<SensitiveAccountAction>(ACTION_VALUES);

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
        action: flowSecureDto.enum(ACTION_VALUES),
        target: flowSecureDto.optional(flowSecureDto.string({
          maxLength: 80,
          pattern: /^[A-Za-z0-9:_-]+$/,
        })),
      },
      { rejectUnknown: true },
    );
    const action = body.action as SensitiveAccountAction;
    if (!ACTIONS.has(action)) throw new Error("Acao sensivel invalida.");

    const challenge = await createSensitiveActionChallenge(session.user.id, action, {
      target: typeof body.target === "string" ? body.target : null,
    });
    return applyNoStoreHeaders(NextResponse.json({ ok: true, ...challenge }));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel iniciar a confirmacao.",
        },
        { status: 400 },
      ),
    );
  }
}
