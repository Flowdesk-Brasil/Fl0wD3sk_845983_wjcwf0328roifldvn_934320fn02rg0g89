import { NextRequest, NextResponse } from "next/server";
import {
  unlinkAccountProvider,
  type LinkedAccountProvider,
} from "@/lib/account/personalData";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import { requireSensitiveActionProof } from "@/lib/auth/sensitiveAction";
import {
  applyNoStoreHeaders,
  ensureSameOriginJsonMutationRequest,
} from "@/lib/security/http";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";

const PROVIDERS = new Set<LinkedAccountProvider>([
  "discord",
  "google",
  "microsoft",
  "github",
]);

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ provider: string }> },
) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) return originGuard;

  const session = await getCurrentAuthSessionFromCookie();
  if (!session) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Sessao expirada." }, { status: 401 }),
    );
  }

  const { provider: rawProvider } = await context.params;
  const provider = rawProvider.toLowerCase() as LinkedAccountProvider;
  if (!PROVIDERS.has(provider)) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Provedor invalido." }, { status: 400 }),
    );
  }

  try {
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        securityProof: flowSecureDto.optional(flowSecureDto.unknown()),
      },
      { rejectUnknown: true },
    );
    await requireSensitiveActionProof(
      session.user.id,
      "provider_unlink",
      body.securityProof,
    );
    await unlinkAccountProvider(session.user.id, provider);
    return applyNoStoreHeaders(
      NextResponse.json({ ok: true, message: "Conta desvinculada com sucesso." }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : "Nao foi possivel desvincular esta conta.",
        },
        { status: 400 },
      ),
    );
  }
}
