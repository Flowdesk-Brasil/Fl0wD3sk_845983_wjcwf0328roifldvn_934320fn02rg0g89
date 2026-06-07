import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { prepareDomainCheckout } from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(request);
    if (originGuard) return originGuard;
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const body = parseFlowSecureDto(
      await request.json().catch(() => ({})),
      {
        quoteId: flowSecureDto.string({ maxLength: 80, pattern: /^[A-Za-z0-9-]+$/ }),
      },
      { rejectUnknown: true },
    );
    const result = await prepareDomainCheckout({
      authUserId: user.id,
      quoteId: body.quoteId,
    });
    return NextResponse.json({
      ok: true,
      purchaseContext: result.purchaseContext,
      domain: { id: result.domain.id, fqdn: result.domain.fqdn, status: result.domain.status },
      quote: { id: result.quote.id, fqdn: result.quote.fqdn, totalBrl: result.quote.total_brl, expiresAt: result.quote.expires_at },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao preparar compra." },
      { status: 400 },
    );
  }
}
