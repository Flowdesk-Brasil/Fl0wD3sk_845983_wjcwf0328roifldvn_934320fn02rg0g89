import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { requestDomainAuthCode } from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(req);
    if (originGuard) return originGuard;
    const body = parseFlowSecureDto(
      await req.json().catch(() => ({})),
      { confirm: flowSecureDto.boolean() },
      { rejectUnknown: true },
    );
    if (body.confirm !== true) {
      return NextResponse.json(
        { ok: false, message: "Confirmacao necessaria para solicitar Auth Code." },
        { status: 409 },
      );
    }
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const { id } = await params;
    const { authCode } = await requestDomainAuthCode({ authUserId: user.id, domainId: id });
    return NextResponse.json({
      ok: true,
      authCode,
      warning: "Este codigo sera exibido apenas uma vez. Guarde-o em seguranca.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Erro ao solicitar Auth Code." },
      { status: 400 },
    );
  }
}
