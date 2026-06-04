import { NextRequest, NextResponse } from "next/server";
import {
  listAccountSessions,
  revokeOtherAccountSessions,
} from "@/lib/account/sessions";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";

export async function GET() {
  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  try {
    const sessions = await listAccountSessions(session.user.id, session.id);
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        currentSessionId: session.id,
        sessions,
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
              : "Nao foi possivel carregar suas sessoes.",
        },
        { status: 500 },
      ),
    );
  }
}

export async function DELETE(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return applyNoStoreHeaders(originGuard);

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  try {
    const revokedCount = await revokeOtherAccountSessions(
      session.user.id,
      session.id,
    );
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        revokedCount,
        message:
          revokedCount > 0
            ? "Outras sessoes desconectadas."
            : "Nao ha outras sessoes ativas.",
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
              : "Nao foi possivel desconectar as sessoes.",
        },
        { status: 400 },
      ),
    );
  }
}
