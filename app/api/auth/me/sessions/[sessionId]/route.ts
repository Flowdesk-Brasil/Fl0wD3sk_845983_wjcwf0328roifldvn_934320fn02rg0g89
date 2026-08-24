import { NextRequest, NextResponse } from "next/server";
import { revokeAccountSession } from "@/lib/account/sessions";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  try {
    const { sessionId } = await context.params;
    if (!sessionId?.trim()) {
      return applyNoStoreHeaders(
        NextResponse.json({ ok: false, message: "Sessao invalida." }, { status: 400 }),
      );
    }

    const revoked = await revokeAccountSession({
      userId: session.user.id,
      currentSessionId: session.id,
      sessionId,
    });
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        revoked,
        message: revoked ? "Sessao desconectada." : "Sessao ja estava encerrada.",
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel desconectar esta sessao.",
        },
        { status: 400 },
      ),
    );
  }
}
