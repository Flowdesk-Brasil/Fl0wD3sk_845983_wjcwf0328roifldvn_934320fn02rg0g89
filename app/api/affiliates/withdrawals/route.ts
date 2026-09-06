/**
 * Solicitacao de saque.
 *
 * Esta rota nao existia. A aba "Historico de Saques" so listava uma tabela: o
 * afiliado via o saldo e nao tinha como pedir o dinheiro. Este e o ultimo elo
 * da cadeia de indicacao.
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { requireActiveAffiliate } from "@/lib/affiliates/account";
import { requestWithdrawal, type PixKeyType } from "@/lib/affiliates/withdrawals";
import {
  WITHDRAWAL_COOLDOWN_HOURS,
  WITHDRAWAL_FEE_BRL,
  WITHDRAWAL_MINIMUM_BRL,
} from "@/lib/affiliates/programRules";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { applyNoStoreHeaders, ensureSameOriginJsonMutationRequest } from "@/lib/security/http";
import {
  attachRequestId,
  createSecurityRequestContext,
  enforceRequestRateLimit,
  logSecurityAuditEventSafe,
} from "@/lib/security/requestSecurity";

export const dynamic = "force-dynamic";

const VALID_PIX_KEY_TYPES: PixKeyType[] = ["cpf", "cnpj", "email", "phone", "random"];

function json(status: number, body: Record<string, unknown>) {
  return applyNoStoreHeaders(NextResponse.json(body, { status }));
}

export async function POST(request: NextRequest) {
  const originGuard = ensureSameOriginJsonMutationRequest(request);
  if (originGuard) {
    return originGuard;
  }

  const requestContext = createSecurityRequestContext(request);

  // Saque mexe com dinheiro: limite mais apertado que o resto do painel.
  const rateLimit = await enforceRequestRateLimit({
    action: "affiliate_withdrawal_request",
    windowMs: 60 * 60 * 1000,
    maxAttempts: 8,
    context: requestContext,
  });

  if (!rateLimit.ok) {
    const response = json(429, {
      ok: false,
      message: "Muitas solicitacoes seguidas. Aguarde para tentar de novo.",
    });
    response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
    return attachRequestId(response, requestContext.requestId);
  }

  const user = await getCurrentUserFromSessionCookie();
  if (!user) {
    return attachRequestId(
      json(401, { ok: false, message: "Faca login para continuar." }),
      requestContext.requestId,
    );
  }

  const gate = await requireActiveAffiliate(user.id);
  if (!gate.ok) {
    return attachRequestId(
      json(gate.status, { ok: false, code: gate.code, message: gate.message }),
      requestContext.requestId,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return attachRequestId(
      json(400, { ok: false, message: "Requisicao invalida." }),
      requestContext.requestId,
    );
  }

  const payload = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const rawAmount = payload.amount;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : Number.parseFloat(String(rawAmount ?? "").replace(",", "."));

  if (!Number.isFinite(amount)) {
    return attachRequestId(
      json(400, { ok: false, message: "Informe um valor valido para saque." }),
      requestContext.requestId,
    );
  }

  const pixKeyType = String(payload.pixKeyType ?? "").trim().toLowerCase() as PixKeyType;
  if (!VALID_PIX_KEY_TYPES.includes(pixKeyType)) {
    return attachRequestId(
      json(400, { ok: false, message: "Selecione um tipo de chave PIX valido." }),
      requestContext.requestId,
    );
  }

  const result = await requestWithdrawal({
    affiliateId: gate.affiliate.id,
    amount,
    pixKey: String(payload.pixKey ?? ""),
    pixKeyType,
  });

  if (!result.ok) {
    await logSecurityAuditEventSafe(requestContext, {
      action: "affiliate_withdrawal_request",
      outcome: "failed",
      metadata: { affiliateId: gate.affiliate.affiliate_id, reason: result.message },
    });

    return attachRequestId(
      json(result.status, { ok: false, message: result.message }),
      requestContext.requestId,
    );
  }

  await logSecurityAuditEventSafe(requestContext, {
    action: "affiliate_withdrawal_request",
    outcome: "succeeded",
    metadata: {
      affiliateId: gate.affiliate.affiliate_id,
      withdrawalId: result.withdrawalId,
      amount: result.amount,
    },
  });

  return attachRequestId(
    json(200, {
      ok: true,
      withdrawal: {
        withdrawalId: result.withdrawalId,
        amount: result.amount,
        fee: result.fee,
        net: result.net,
        status: "pending",
      },
      message: "Saque solicitado. Voce recebe o PIX apos a conferencia.",
    }),
    requestContext.requestId,
  );
}

/** Lista os saques do afiliado e as regras vigentes do programa. */
export async function GET() {
  const user = await getCurrentUserFromSessionCookie();
  if (!user) {
    return json(401, { ok: false, message: "Faca login para continuar." });
  }

  const gate = await requireActiveAffiliate(user.id);
  if (!gate.ok) {
    return json(gate.status, { ok: false, code: gate.code, message: gate.message });
  }

  const { data, error } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .select(
      "id, amount, fee_amount, net_amount, pix_key, pix_key_type, status, notes, rejection_reason, receipt_url, processed_at, created_at",
    )
    .eq("affiliate_id", gate.affiliate.id)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[affiliates] falha ao listar saques:", error);
    return json(500, { ok: false, message: "Nao foi possivel carregar seus saques." });
  }

  return json(200, {
    ok: true,
    rules: {
      minimum: WITHDRAWAL_MINIMUM_BRL,
      fee: WITHDRAWAL_FEE_BRL,
      cooldownHours: WITHDRAWAL_COOLDOWN_HOURS,
    },
    availableBalance: Number(gate.affiliate.balance_available ?? 0),
    withdrawals: (data || []).map((row) => ({
      withdrawalId: row.id,
      amount: Number(row.amount ?? 0),
      fee: Number(row.fee_amount ?? 0),
      net: Number(row.net_amount ?? row.amount ?? 0),
      pixKey: maskPixKey(String(row.pix_key ?? ""), String(row.pix_key_type ?? "")),
      pixKeyType: row.pix_key_type,
      status: row.status,
      notes: row.rejection_reason || row.notes || null,
      receiptUrl: row.receipt_url,
      requestedAt: row.created_at,
      paidAt: row.status === "paid" ? row.processed_at : null,
    })),
  });
}

/**
 * Mascara a chave para nao devolver o dado completo em toda listagem.
 * O valor cheio so aparece no painel administrativo, para quem paga.
 */
function maskPixKey(key: string, type: string) {
  if (!key) return "";

  if (type === "email") {
    const [name, domain] = key.split("@");
    if (!domain) return "***";
    const visible = name.slice(0, 2);
    return `${visible}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
  }

  if (key.length <= 4) return "*".repeat(key.length);
  return `${"*".repeat(Math.max(key.length - 4, 3))}${key.slice(-4)}`;
}
