/**
 * Motor de comissao.
 *
 * Entra aqui um pedido aprovado; sai uma conversao registrada, a comissao
 * calculada pelo nivel do afiliado e o lancamento no ledger. E o unico lugar
 * do sistema que cria dinheiro para um afiliado.
 *
 * Tudo aqui e tolerante a falha por decisao: um erro no programa de afiliados
 * nunca pode derrubar a liberacao do pedido do cliente que pagou.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { AFFILIATE_LEVELS, RANK_BONUS } from "./affiliateLevels";
import type { AffiliateLevel, AffiliateRankTier } from "./affiliateTypes";
import { findAffiliateByCode, type AffiliateRecord } from "./account";
import { postLedgerEntry } from "./ledger";
import {
  BLOCK_SELF_REFERRAL,
  COUPON_DISCOUNT_SOURCE,
  HOLDING_PERIOD_DAYS,
  LEVEL_CAN_REGRESS,
  RECURRENCE_MAX_CHARGES,
  RECURRENCE_MODE,
  type AffiliatePeriodCode,
  type AffiliatePlanCode,
  isAffiliatePlanCode,
} from "./programRules";
import { queueAffiliateWebhook } from "./notifications";
import { readAffiliateCouponRedemption } from "./coupons";
import { resolveRankTier } from "./ranking";

const LEVEL_ORDER: AffiliateLevel[] = ["bronze", "silver", "gold", "diamond"];

/** Espelha lib/plans/catalog.ts, que nao exporta este mapa. */
const PERIOD_BY_CYCLE_DAYS: Record<number, AffiliatePeriodCode> = {
  30: "monthly",
  90: "quarterly",
  180: "semiannual",
  365: "annual",
};

function round2(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown) {
  const numeric =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(numeric) ? numeric : 0;
}

function resolvePeriodFromCycleDays(days: unknown): AffiliatePeriodCode | null {
  const numeric = Math.round(toNumber(days));
  if (PERIOD_BY_CYCLE_DAYS[numeric]) {
    return PERIOD_BY_CYCLE_DAYS[numeric];
  }

  // Ciclos personalizados caem no periodo mais proximo, para nunca perder a
  // comissao por causa de um valor fora da tabela.
  if (numeric <= 0) return null;
  if (numeric < 60) return "monthly";
  if (numeric < 135) return "quarterly";
  if (numeric < 270) return "semiannual";
  return "annual";
}

// ─── Calculo ──────────────────────────────────────────────────────────────────

export type CommissionBreakdown = {
  level: AffiliateLevel;
  basePct: number;
  rankBonusPct: number;
  effectivePct: number;
  saleAmount: number;
  commissionAmount: number;
};

/**
 * Calcula a comissao de uma venda.
 *
 * O bonus de ranking vale para quem estava no podio do mes; usar o nivel e o
 * podio do momento da venda evita recalcular o passado quando o afiliado sobe.
 */
export function calculateCommission(input: {
  level: AffiliateLevel;
  saleAmount: number;
  rankTier?: AffiliateRankTier;
}): CommissionBreakdown {
  const level = AFFILIATE_LEVELS[input.level] ? input.level : "bronze";
  const basePct = AFFILIATE_LEVELS[level].commissionPct;
  const rankBonusPct =
    input.rankTier && RANK_BONUS[input.rankTier] ? RANK_BONUS[input.rankTier].bonusPct : 0;

  const effectivePct = basePct + rankBonusPct;
  const saleAmount = Math.max(0, round2(input.saleAmount));
  const commissionAmount = round2((saleAmount * effectivePct) / 100);

  return { level, basePct, rankBonusPct, effectivePct, saleAmount, commissionAmount };
}

// ─── Registro da conversao ────────────────────────────────────────────────────

type SettledOrderLike = {
  id: number;
  user_id?: number | null;
  order_number?: number | null;
  plan_code?: string | null;
  plan_billing_cycle_days?: number | null;
};

export type ConversionOutcome =
  | { recorded: true; conversionId: string; commissionAmount: number }
  | { recorded: false; reason: string };

/**
 * Registra a conversao de um pedido aprovado.
 *
 * Chamada de paymentSettlement no momento em que o pedido e liquidado. Nunca
 * lanca: qualquer problema vira log e a liberacao do pedido segue normalmente.
 */
export async function recordAffiliateConversionForOrder(
  order: SettledOrderLike,
): Promise<ConversionOutcome> {
  try {
    // O select da reconciliacao nao traz amount; busca o que falta pelo id.
    const { data: fullOrder, error: orderError } = await supabaseAdmin
      .from("payment_orders")
      .select("id, order_number, user_id, amount, plan_code, plan_billing_cycle_days, paid_at, provider_payload")
      .eq("id", order.id)
      .single();

    if (orderError || !fullOrder) {
      return { recorded: false, reason: "Pedido nao encontrado para atribuicao." };
    }

    // Primeira via: atribuicao carimbada no pedido a partir do cookie.
    let attribution = readAttributionFromOrderPayload(fullOrder.provider_payload);

    // Segunda via: o cliente digitou o cupom do afiliado. Cobre quem comprou de
    // outro dispositivo, em aba anonima ou com o cookie ja expirado.
    const couponRedemption = await readAffiliateCouponRedemption(fullOrder.id as number);

    if (!attribution?.affiliateCode && couponRedemption) {
      attribution = {
        affiliateCode: couponRedemption.affiliateCode,
        linkId: null,
        visitorId: null,
      };
    }

    if (!attribution?.affiliateCode) {
      return { recorded: false, reason: "Pedido sem indicacao de afiliado." };
    }

    const affiliate = await findAffiliateByCode(attribution.affiliateCode);
    if (!affiliate) {
      return { recorded: false, reason: "Afiliado da atribuicao nao existe mais." };
    }

    if (affiliate.suspended_at || !affiliate.is_active) {
      return { recorded: false, reason: "Afiliado suspenso ou inativo." };
    }

    const customerUserId = toNumber(fullOrder.user_id) || null;

    // Auto-indicacao: registra cancelada para ficar auditavel, sem pagar.
    if (BLOCK_SELF_REFERRAL && customerUserId && customerUserId === affiliate.user_id) {
      await insertConversion({
        affiliate,
        order: fullOrder,
        attribution,
        breakdown: calculateCommission({
          level: affiliate.level,
          saleAmount: toNumber(fullOrder.amount),
        }),
        status: "cancelled",
        reversalReason: "self_referral",
        chargeSequence: 1,
      });

      return { recorded: false, reason: "Auto-indicacao bloqueada." };
    }

    const chargeSequence = await resolveChargeSequence(affiliate.id, customerUserId);
    const recurrenceCheck = isChargeEligible(chargeSequence);
    if (!recurrenceCheck.eligible) {
      return { recorded: false, reason: recurrenceCheck.reason };
    }

    const rankTier = await resolveRankTier(affiliate.id);
    const breakdown = calculateCommission({
      level: affiliate.level,
      saleAmount: toNumber(fullOrder.amount),
      rankTier,
    });

    // COUPON_DISCOUNT_SOURCE = "commission": quem banca o desconto do cupom e o
    // proprio afiliado, entao o valor concedido sai da comissao dele. Em
    // "margin" (padrao) a comissao fica cheia e o desconto sai da margem.
    if (
      COUPON_DISCOUNT_SOURCE === "commission" &&
      couponRedemption?.affiliateCode === affiliate.affiliate_id &&
      couponRedemption.discountAmount > 0
    ) {
      breakdown.commissionAmount = round2(
        Math.max(0, breakdown.commissionAmount - couponRedemption.discountAmount),
      );
    }

    if (breakdown.commissionAmount <= 0) {
      return { recorded: false, reason: "Comissao calculada em zero." };
    }

    const inserted = await insertConversion({
      affiliate,
      order: fullOrder,
      attribution,
      breakdown,
      status: "approved",
      chargeSequence,
    });

    if (!inserted.ok) {
      return { recorded: false, reason: inserted.reason };
    }

    // Comissao entra em carencia. So vira saldo sacavel apos HOLDING_PERIOD_DAYS,
    // quando matureAffiliateCommissions() lanca a maturacao.
    const ledger = await postLedgerEntry({
      affiliateId: affiliate.id,
      entryType: "commission_accrued",
      pendingDelta: breakdown.commissionAmount,
      earnedDelta: breakdown.commissionAmount,
      conversionId: inserted.conversionId,
      description: `Comissao do pedido #${fullOrder.order_number ?? fullOrder.id}`,
      createdBy: "system:settlement",
      idempotencyKey: `conversion-accrued-${inserted.conversionId}`,
    });

    if (!ledger.ok) {
      console.error("[affiliates] conversao gravada sem lancamento:", ledger.reason);
    }

    if (inserted.linkId) {
      await incrementLinkConversions(inserted.linkId);
    }

    await evaluateAffiliateLevel(affiliate.id);

    void queueAffiliateWebhook({
      affiliateId: affiliate.id,
      eventType: "conversion.approved",
      payload: {
        conversionId: inserted.conversionId,
        orderNumber: fullOrder.order_number ?? null,
        planCode: breakdownPlanCode(fullOrder.plan_code),
        saleAmount: breakdown.saleAmount,
        commissionAmount: breakdown.commissionAmount,
        commissionPct: breakdown.effectivePct,
        availableAt: addDaysIso(HOLDING_PERIOD_DAYS),
      },
    });

    return {
      recorded: true,
      conversionId: inserted.conversionId,
      commissionAmount: breakdown.commissionAmount,
    };
  } catch (error) {
    console.error("[affiliates] falha inesperada ao registrar conversao:", error);
    return { recorded: false, reason: "Erro inesperado." };
  }
}

/** Envolve a chamada para uso em contexto fire-and-forget. */
export async function recordAffiliateConversionForOrderSafe(order: SettledOrderLike) {
  try {
    return await recordAffiliateConversionForOrder(order);
  } catch (error) {
    console.error("[affiliates] conversao ignorada por erro:", error);
    return { recorded: false as const, reason: "Erro capturado." };
  }
}

function breakdownPlanCode(value: unknown): AffiliatePlanCode {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isAffiliatePlanCode(normalized) ? normalized : "pro";
}

function addDaysIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * A atribuicao e carimbada no provider_payload do pedido no momento do
 * checkout, para que o webhook nao dependa de cookie (o webhook chega do
 * Mercado Pago, sem o navegador do cliente).
 */
export function readAttributionFromOrderPayload(payload: unknown): {
  affiliateCode: string;
  linkId: string | null;
  visitorId: string | null;
} | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const raw = record.flowdesk_affiliate;

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  const entry = raw as Record<string, unknown>;
  const affiliateCode = String(entry.affiliateCode ?? "").trim().toUpperCase();

  if (!affiliateCode) {
    return null;
  }

  return {
    affiliateCode,
    linkId: entry.linkId ? String(entry.linkId) : null,
    visitorId: entry.visitorId ? String(entry.visitorId) : null,
  };
}

async function insertConversion(input: {
  affiliate: AffiliateRecord;
  order: Record<string, unknown>;
  attribution: { affiliateCode: string; linkId: string | null };
  breakdown: CommissionBreakdown;
  status: "approved" | "pending" | "cancelled";
  reversalReason?: string;
  chargeSequence: number;
}): Promise<{ ok: true; conversionId: string; linkId: string | null } | { ok: false; reason: string }> {
  const order = input.order;
  const planCode = breakdownPlanCode(order.plan_code);
  const period = resolvePeriodFromCycleDays(order.plan_billing_cycle_days);
  const linkId = await resolveLinkId(input.affiliate.id, input.attribution.linkId, planCode, period);

  const { data, error } = await supabaseAdmin
    .from("affiliate_conversions")
    .insert([
      {
        affiliate_id: input.affiliate.id,
        link_id: linkId,
        order_id: String(order.order_number ?? order.id),
        payment_order_id: order.id,
        customer_user_id: toNumber(order.user_id) || null,
        plan_slug: planCode,
        period,
        amount_total: input.breakdown.saleAmount,
        commission_amount:
          input.status === "cancelled" ? 0 : input.breakdown.commissionAmount,
        commission_pct: input.breakdown.effectivePct,
        rank_bonus_pct: input.breakdown.rankBonusPct,
        level_at_conversion: input.breakdown.level,
        status: input.status,
        charge_sequence: input.chargeSequence,
        available_at: input.status === "approved" ? addDaysIso(HOLDING_PERIOD_DAYS) : null,
        reversed_at: input.status === "cancelled" ? new Date().toISOString() : null,
        reversal_reason: input.reversalReason ?? null,
      },
    ])
    .select("id, link_id")
    .single();

  if (error) {
    // Reprocessamento do webhook: a cobranca ja virou conversao.
    if (error.code === "23505") {
      return { ok: false, reason: "Conversao ja registrada para esta cobranca." };
    }

    console.error("[affiliates] falha ao gravar conversao:", error);
    return { ok: false, reason: error.message };
  }

  return { ok: true, conversionId: data.id as string, linkId: (data.link_id as string) ?? null };
}

/** Casa a conversao com o link exato, quando ele ainda existe. */
async function resolveLinkId(
  affiliateId: string,
  hintedLinkId: string | null,
  planCode: AffiliatePlanCode,
  period: AffiliatePeriodCode | null,
) {
  if (hintedLinkId) {
    const { data } = await supabaseAdmin
      .from("affiliate_links")
      .select("id")
      .eq("id", hintedLinkId)
      .eq("affiliate_id", affiliateId)
      .maybeSingle();

    if (data?.id) return data.id as string;
  }

  if (!period) return null;

  const { data } = await supabaseAdmin
    .from("affiliate_links")
    .select("id")
    .eq("affiliate_id", affiliateId)
    .eq("plan_slug", planCode)
    .eq("period", period)
    .maybeSingle();

  return (data?.id as string) ?? null;
}

async function incrementLinkConversions(linkId: string) {
  const { data } = await supabaseAdmin
    .from("affiliate_links")
    .select("conversions_count")
    .eq("id", linkId)
    .maybeSingle();

  if (!data) return;

  await supabaseAdmin
    .from("affiliate_links")
    .update({ conversions_count: Math.max(0, toNumber(data.conversions_count)) + 1 })
    .eq("id", linkId);
}

/** Quantas cobrancas deste cliente ja foram comissionadas para este afiliado. */
async function resolveChargeSequence(affiliateId: string, customerUserId: number | null) {
  if (!customerUserId) return 1;

  const { count } = await supabaseAdmin
    .from("affiliate_conversions")
    .select("id", { count: "exact", head: true })
    .eq("affiliate_id", affiliateId)
    .eq("customer_user_id", customerUserId)
    .in("status", ["approved", "pending"]);

  return Math.max(1, (count ?? 0) + 1);
}

function isChargeEligible(chargeSequence: number): { eligible: boolean; reason: string } {
  if (RECURRENCE_MODE === "all") {
    return { eligible: true, reason: "" };
  }

  if (RECURRENCE_MODE === "first") {
    return chargeSequence <= 1
      ? { eligible: true, reason: "" }
      : { eligible: false, reason: "Programa comissiona apenas a primeira compra." };
  }

  return chargeSequence <= RECURRENCE_MAX_CHARGES
    ? { eligible: true, reason: "" }
    : { eligible: false, reason: `Limite de ${RECURRENCE_MAX_CHARGES} cobrancas atingido.` };
}

// ─── Maturacao (carencia) ─────────────────────────────────────────────────────

/**
 * Move para saldo sacavel toda comissao que passou da carencia.
 *
 * Rodar periodicamente (cron). E idempotente: a chave do lancamento impede
 * maturar a mesma conversao duas vezes.
 */
export async function matureAffiliateCommissions(limit = 500) {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("affiliate_conversions")
    .select("id, affiliate_id, commission_amount, order_id")
    .eq("status", "approved")
    .is("reversed_at", null)
    .is("matured_at", null)
    .not("available_at", "is", null)
    .lte("available_at", nowIso)
    .order("available_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[affiliates] falha ao buscar comissoes a maturar:", error);
    return { matured: 0, skipped: 0 };
  }

  let matured = 0;
  let skipped = 0;

  for (const conversion of data || []) {
    const amount = toNumber(conversion.commission_amount);
    if (amount <= 0) {
      skipped += 1;
      continue;
    }

    const result = await postLedgerEntry({
      affiliateId: conversion.affiliate_id as string,
      entryType: "commission_matured",
      pendingDelta: -amount,
      availableDelta: amount,
      conversionId: conversion.id as string,
      description: `Carencia cumprida do pedido ${conversion.order_id ?? ""}`.trim(),
      createdBy: "system:maturation",
      idempotencyKey: `conversion-matured-${conversion.id}`,
    });

    if (result.ok) {
      // Marca sempre que o lancamento existe (novo ou ja existente), para a
      // conversao sair da fila em vez de voltar em toda execucao.
      await supabaseAdmin
        .from("affiliate_conversions")
        .update({ matured_at: new Date().toISOString() })
        .eq("id", conversion.id);
    }

    if (result.ok && !result.duplicate) {
      matured += 1;
      void queueAffiliateWebhook({
        affiliateId: conversion.affiliate_id as string,
        eventType: "commission.available",
        payload: { conversionId: conversion.id, amount },
      });
    } else {
      skipped += 1;
    }
  }

  return { matured, skipped };
}

// ─── Estorno ──────────────────────────────────────────────────────────────────

/**
 * Reverte a comissao de um pedido reembolsado, estornado ou cancelado.
 *
 * Debita de onde o dinheiro estiver: se ainda esta em carencia, sai do
 * pendente; se ja maturou, sai do disponivel. Se ja foi sacado, o saldo fica
 * negativo em relacao ao ganho e o ajuste vira um debito a compensar nas
 * proximas comissoes.
 */
export async function reverseAffiliateConversionForOrder(
  paymentOrderId: number,
  reason: string,
): Promise<{ reversed: boolean; reason: string }> {
  try {
    const { data: conversion, error } = await supabaseAdmin
      .from("affiliate_conversions")
      .select("id, affiliate_id, commission_amount, status, reversed_at, matured_at, order_id")
      .eq("payment_order_id", paymentOrderId)
      .maybeSingle();

    if (error || !conversion) {
      return { reversed: false, reason: "Pedido sem conversao de afiliado." };
    }

    if (conversion.reversed_at) {
      return { reversed: false, reason: "Conversao ja estornada." };
    }

    const amount = toNumber(conversion.commission_amount);
    if (amount <= 0) {
      return { reversed: false, reason: "Conversao sem valor a estornar." };
    }

    // De onde debitar depende de onde o dinheiro esta AGORA. available_at diz
    // apenas quando a comissao *deveria* maturar; se o job atrasar, o valor
    // ainda esta em carencia. matured_at so e preenchido quando a maturacao
    // realmente lancou commission_matured no ledger.
    const hasMatured = Boolean(conversion.matured_at);

    const ledger = await postLedgerEntry({
      affiliateId: conversion.affiliate_id as string,
      entryType: "commission_reversed",
      pendingDelta: hasMatured ? 0 : -amount,
      availableDelta: hasMatured ? -amount : 0,
      earnedDelta: -amount,
      conversionId: conversion.id as string,
      description: `Estorno do pedido ${conversion.order_id ?? paymentOrderId}: ${reason}`,
      createdBy: "system:refund",
      idempotencyKey: `conversion-reversed-${conversion.id}`,
    });

    if (!ledger.ok) {
      console.error("[affiliates] falha ao lancar estorno:", ledger.reason);
      return { reversed: false, reason: ledger.reason };
    }

    await supabaseAdmin
      .from("affiliate_conversions")
      .update({
        status: "cancelled",
        reversed_at: new Date().toISOString(),
        reversal_reason: reason,
      })
      .eq("id", conversion.id);

    await evaluateAffiliateLevel(conversion.affiliate_id as string);

    void queueAffiliateWebhook({
      affiliateId: conversion.affiliate_id as string,
      eventType: "conversion.reversed",
      payload: { conversionId: conversion.id, amount, reason },
    });

    return { reversed: true, reason };
  } catch (caught) {
    console.error("[affiliates] falha inesperada ao estornar:", caught);
    return { reversed: false, reason: "Erro inesperado." };
  }
}

/** Envolve o estorno para uso fire-and-forget. */
export async function reverseAffiliateConversionForOrderSafe(
  paymentOrderId: number,
  reason: string,
) {
  try {
    return await reverseAffiliateConversionForOrder(paymentOrderId, reason);
  } catch (error) {
    console.error("[affiliates] estorno ignorado por erro:", error);
    return { reversed: false as const, reason: "Erro capturado." };
  }
}

// ─── Progressao de nivel ──────────────────────────────────────────────────────

/**
 * Reavalia o nivel do afiliado pelas vendas aprovadas do mes corrente.
 *
 * A landing promete que "o nivel sobe automaticamente conforme a quantidade de
 * vendas aprovadas no mes". Esta funcao e o que cumpre essa promessa; antes,
 * getLevelFromSalesCount existia e nunca era chamada.
 */
export async function evaluateAffiliateLevel(affiliateId: string) {
  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from("affiliate_conversions")
    .select("id", { count: "exact", head: true })
    .eq("affiliate_id", affiliateId)
    .eq("status", "approved")
    .is("reversed_at", null)
    .gte("conversion_date", startOfMonth.toISOString());

  if (error) {
    console.error("[affiliates] falha ao contar vendas do mes:", error);
    return null;
  }

  const salesThisMonth = count ?? 0;
  const earnedLevel = levelFromSalesCount(salesThisMonth);

  const { data: affiliate } = await supabaseAdmin
    .from("affiliates")
    .select("level, highest_level")
    .eq("id", affiliateId)
    .maybeSingle();

  if (!affiliate) return null;

  const currentLevel = (affiliate.level as AffiliateLevel) || "bronze";
  const highestLevel = (affiliate.highest_level as AffiliateLevel) || currentLevel;

  // Sem regressao, o nivel trava no maior ja alcancado.
  const nextLevel = LEVEL_CAN_REGRESS
    ? earnedLevel
    : higherLevel(earnedLevel, highestLevel);

  const nextHighest = higherLevel(highestLevel, earnedLevel);

  if (nextLevel === currentLevel && nextHighest === highestLevel) {
    return currentLevel;
  }

  await supabaseAdmin
    .from("affiliates")
    .update({
      level: nextLevel,
      highest_level: nextHighest,
      level_evaluated_at: new Date().toISOString(),
    })
    .eq("id", affiliateId);

  if (nextLevel !== currentLevel) {
    void queueAffiliateWebhook({
      affiliateId,
      // Comparar as strings daria ordem alfabetica: "silver" > "gold" e true,
      // e uma queda de Ouro para Prata seria anunciada como promocao.
      eventType:
        LEVEL_ORDER.indexOf(nextLevel) > LEVEL_ORDER.indexOf(currentLevel)
          ? "level.up"
          : "level.changed",
      payload: { from: currentLevel, to: nextLevel, salesThisMonth },
    });
  }

  return nextLevel;
}

export function levelFromSalesCount(salesThisMonth: number): AffiliateLevel {
  if (salesThisMonth >= AFFILIATE_LEVELS.diamond.minSalesPerMonth) return "diamond";
  if (salesThisMonth >= AFFILIATE_LEVELS.gold.minSalesPerMonth) return "gold";
  if (salesThisMonth >= AFFILIATE_LEVELS.silver.minSalesPerMonth) return "silver";
  return "bronze";
}

function higherLevel(left: AffiliateLevel, right: AffiliateLevel): AffiliateLevel {
  return LEVEL_ORDER.indexOf(left) >= LEVEL_ORDER.indexOf(right) ? left : right;
}
