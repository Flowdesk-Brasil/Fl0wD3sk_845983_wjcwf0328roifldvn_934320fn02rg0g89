import { NextResponse } from "next/server";
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
    const transfers = (await listUserDomainTransfers({ authUserId: user.id })).map((transfer) => {
      const { provider, providerRef, ...publicTransfer } = transfer;
      void provider;
      void providerRef;
      return publicTransfer;
    });
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
      },
      { rejectUnknown: true },
    );
    const result = await prepareDomainTransferCheckout({
      authUserId: user.id,
      quoteId: body.quoteId,
      authCode: body.authCode,
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
