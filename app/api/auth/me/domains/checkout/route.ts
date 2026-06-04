import { NextResponse } from "next/server";
import type { DomainContact } from "@/lib/domains/adapter";
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
        contact: flowSecureDto.record(),
      },
      { rejectUnknown: true },
    );
    const contact = parseFlowSecureDto<DomainContact>(
      body.contact,
      {
        fullName: flowSecureDto.personName(),
        email: flowSecureDto.email(),
        phone: flowSecureDto.string({ minLength: 8, maxLength: 32 }),
        street: flowSecureDto.string({ minLength: 3, maxLength: 180 }),
        city: flowSecureDto.string({ minLength: 2, maxLength: 100 }),
        state: flowSecureDto.string({ minLength: 2, maxLength: 64 }),
        postalCode: flowSecureDto.string({ minLength: 3, maxLength: 24 }),
        country: flowSecureDto.string({ minLength: 2, maxLength: 2 }),
        documentType: flowSecureDto.enum(["cpf", "cnpj", "passport", "none"] as const),
        documentNumber: flowSecureDto.optional(
          flowSecureDto.string({ allowEmpty: true, maxLength: 40 }),
        ),
      },
      { rejectUnknown: true },
    );
    const result = await prepareDomainCheckout({
      authUserId: user.id,
      quoteId: body.quoteId,
      contact,
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
