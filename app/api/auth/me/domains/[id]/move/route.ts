import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { moveDomainToFlowdeskAccount } from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) return originGuard;
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await context.params;
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        targetAccount: flowSecureDto.string({
          minLength: 3,
          maxLength: 254,
          rejectThreatPatterns: false,
        }),
      },
      { rejectUnknown: true },
    );

    const result = await moveDomainToFlowdeskAccount({
      authUserId: user.id,
      domainId: id,
      targetAccount: body.targetAccount,
    });

    return NextResponse.json({
      ok: true,
      domain: result.domain,
      target: result.target,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao mover dominio." },
      { status: 400 },
    );
  }
}
