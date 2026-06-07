/**
 * POST /api/auth/me/domains/quote
 * Gera uma cotação com preço final em BRL (custo do provedor + câmbio + markup).
 *
 * Body: { fqdn, operation?, period_years? }
 *
 * Retorna:
 * - providerCostUsd: custo bruto em USD (transparência para admin)
 * - exchangeRateUsdBrl: câmbio do momento
 * - markupPercent: margem FlowDesk
 * - totalBrl: valor que será cobrado do usuário
 * - expiresAt: cotação válida por 15 minutos
 */

import { NextResponse } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { quoteDomain } from "@/lib/domains/domainService";
import { flowSecureDto, parseFlowSecureDto } from "@/lib/security/flowSecure";
import { ensureSameOriginJsonMutationRequest } from "@/lib/security/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const originGuard = ensureSameOriginJsonMutationRequest(req);
    if (originGuard) return originGuard;
    const user = await getCurrentUserFromSessionCookie();
    if (!user) {
      return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
    }

    const body = parseFlowSecureDto(
      await req.json().catch(() => ({})),
      {
        fqdn: flowSecureDto.string({
          minLength: 4,
          maxLength: 253,
          pattern: /^(?!-)(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/,
        }),
        operation: flowSecureDto.optional(
          flowSecureDto.enum(["register", "renew", "transfer", "restore"] as const),
        ),
        period_years: flowSecureDto.optional(
          flowSecureDto.number({ integer: true, min: 1, max: 10 }),
        ),
      },
      { rejectUnknown: true },
    );
    const fqdn = body.fqdn.toLowerCase();

    if (!fqdn || fqdn.length < 4) {
      return NextResponse.json(
        { ok: false, message: "Informe um domínio válido." },
        { status: 400 },
      );
    }

    const operation = body.operation || "register";
    const periodYears = body.period_years || 1;

    const quote = await quoteDomain({
      authUserId: user.id,
      fqdn,
      operation,
      periodYears,
    });

    const {
      provider,
      providerCost,
      providerCurrency,
      exchangeRateToBrl,
      ...publicQuote
    } = quote;
    void provider;
    void providerCost;
    void providerCurrency;
    void exchangeRateToBrl;
    return NextResponse.json({ ok: true, quote: publicQuote });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao gerar cotação.";
    const status = message.includes("não está disponível") ? 409 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
