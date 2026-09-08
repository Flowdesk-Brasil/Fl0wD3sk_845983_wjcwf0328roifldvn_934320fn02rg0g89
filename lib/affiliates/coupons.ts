/**
 * Cupom do afiliado.
 *
 * A coluna affiliates.coupon_code existia desde a v1 e nada a preenchia; o
 * sistema de cupons do checkout (payment_coupons) era completamente separado
 * dela. Aqui os dois se encontram: o cupom do afiliado vira uma linha em
 * payment_coupons, entao todo o mecanismo de desconto ja testado passa a
 * funcionar sem alteracao no caminho de pagamento.
 *
 * Na liquidacao, se o pedido nao trouxer atribuicao por cookie, a redencao do
 * cupom serve de atribuicao: quem digitou o cupom do afiliado veio por ele.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { COUPON_DISCOUNT_PCT, COUPON_ENABLED } from "./programRules";
import type { AffiliateRecord } from "./account";

const COUPON_SOURCE = "affiliate_program";

/**
 * Garante que o cupom do afiliado existe em payment_coupons.
 * Idempotente: chamar de novo nao duplica nem sobrescreve um cupom manual.
 */
export async function ensureAffiliateCoupon(affiliate: AffiliateRecord) {
  if (!COUPON_ENABLED || !affiliate.coupon_code) {
    return { ok: false as const, reason: "Cupom desativado ou sem codigo." };
  }

  const code = affiliate.coupon_code.trim().toUpperCase();

  const { data: existing, error: readError } = await supabaseAdmin
    .from("payment_coupons")
    .select("id, metadata")
    .eq("code", code)
    .maybeSingle();

  if (readError) {
    console.error("[affiliates] falha ao verificar cupom do checkout:", readError);
    return { ok: false as const, reason: readError.message };
  }

  if (existing) {
    // Cupom com esse codigo ja existe. Se nao for do programa, nao mexe: pode
    // ser uma campanha de marketing criada a mao.
    const metadata = (existing.metadata ?? {}) as Record<string, unknown>;
    return metadata.source === COUPON_SOURCE
      ? { ok: true as const, couponId: existing.id as number, created: false }
      : { ok: false as const, reason: "Codigo ja usado por outro cupom." };
  }

  const { data, error } = await supabaseAdmin
    .from("payment_coupons")
    .insert([
      {
        code,
        label: `Afiliado ${affiliate.affiliate_id}`,
        description: `Cupom do programa de afiliados (${affiliate.affiliate_id}).`,
        status: "active",
        discount_type: "percent",
        discount_value: COUPON_DISCOUNT_PCT,
        metadata: {
          source: COUPON_SOURCE,
          affiliate_row_id: affiliate.id,
          affiliate_code: affiliate.affiliate_id,
        },
      },
    ])
    .select("id")
    .single();

  if (error) {
    // Corrida entre duas adesoes: alguem criou primeiro.
    if (error.code === "23505") {
      return { ok: true as const, couponId: null, created: false };
    }

    console.error("[affiliates] falha ao criar cupom do checkout:", error);
    return { ok: false as const, reason: error.message };
  }

  return { ok: true as const, couponId: data.id as number, created: true };
}

/** Desativa o cupom quando o afiliado e suspenso. */
export async function deactivateAffiliateCoupon(couponCode: string | null) {
  if (!couponCode) return;

  await supabaseAdmin
    .from("payment_coupons")
    .update({ status: "inactive" })
    .eq("code", couponCode.trim().toUpperCase())
    .contains("metadata", { source: COUPON_SOURCE });
}

/**
 * Descobre o afiliado a partir do cupom usado no pedido.
 *
 * Usado na liquidacao como segunda via de atribuicao: se o cliente digitou o
 * cupom do afiliado, a venda e dele, mesmo sem cookie (outro dispositivo,
 * navegacao anonima, cookie expirado).
 */
export async function resolveAffiliateCodeFromOrderCoupon(
  paymentOrderId: number,
): Promise<string | null> {
  const redemption = await readAffiliateCouponRedemption(paymentOrderId);
  return redemption?.affiliateCode ?? null;
}

export type AffiliateCouponRedemption = {
  affiliateCode: string;
  discountAmount: number;
};

/**
 * Le a redencao de cupom de afiliado do pedido, com o desconto concedido.
 *
 * O desconto importa quando COUPON_DISCOUNT_SOURCE = "commission": nesse modo
 * quem banca o desconto e o afiliado, entao o valor sai da comissao dele.
 */
export async function readAffiliateCouponRedemption(
  paymentOrderId: number,
): Promise<AffiliateCouponRedemption | null> {
  const { data: redemption, error } = await supabaseAdmin
    .from("payment_coupon_redemptions")
    .select("coupon_id, discount_amount")
    .eq("payment_order_id", paymentOrderId)
    .maybeSingle();

  if (error || !redemption?.coupon_id) {
    return null;
  }

  const { data: coupon } = await supabaseAdmin
    .from("payment_coupons")
    .select("metadata")
    .eq("id", redemption.coupon_id)
    .maybeSingle();

  const metadata = (coupon?.metadata ?? {}) as Record<string, unknown>;

  if (metadata.source !== COUPON_SOURCE) {
    return null;
  }

  const code = String(metadata.affiliate_code ?? "").trim().toUpperCase();
  if (!code) return null;

  const discountRaw = redemption.discount_amount;
  const discountAmount =
    typeof discountRaw === "number"
      ? discountRaw
      : Number.parseFloat(String(discountRaw ?? "0"));

  return {
    affiliateCode: code,
    discountAmount: Number.isFinite(discountAmount) ? Math.max(0, discountAmount) : 0,
  };
}
