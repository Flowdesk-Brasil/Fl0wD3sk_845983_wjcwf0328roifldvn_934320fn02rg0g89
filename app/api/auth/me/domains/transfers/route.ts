import { NextResponse } from "next/server";
import type { DomainContact } from "@/lib/domains/adapter";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import {
  listUserDomainTransfers,
  prepareDomainTransferCheckout,
} from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await getCurrentUserFromSessionCookie();
    if (!user) return NextResponse.json({ ok: false, message: "Nao autenticado." }, { status: 401 });
    const transfers = (await listUserDomainTransfers({ authUserId: user.id })).map(
      ({ provider: _provider, providerRef: _providerRef, ...transfer }) => transfer,
    );
    return NextResponse.json({
      ok: true,
      transfers,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao listar transferencias." },
      { status: 500 },
    );
  }
}

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
        authCode: flowSecureDto.string({
          minLength: 4,
          maxLength: 180,
          rejectThreatPatterns: false,
        }),
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
    const result = await prepareDomainTransferCheckout({
      authUserId: user.id,
      quoteId: body.quoteId,
      authCode: body.authCode,
      contact,
    });
    return NextResponse.json({
      ok: true,
      purchaseContext: result.purchaseContext,
      transfer: { id: result.transfer.id, fqdn: result.transfer.fqdn, status: result.transfer.status },
      quote: { id: result.quote.id, fqdn: result.quote.fqdn, totalBrl: result.quote.total_brl, expiresAt: result.quote.expires_at },
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Falha ao preparar transferencia." },
      { status: 400 },
    );
  }
}
