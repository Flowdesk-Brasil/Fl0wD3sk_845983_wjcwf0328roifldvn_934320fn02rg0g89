/**
 * Carimbo da atribuicao no pedido.
 *
 * O webhook do Mercado Pago chega do servidor deles, sem o navegador do
 * cliente e portanto sem o cookie de atribuicao. Se a indicacao nao for gravada
 * no pedido no momento do checkout, ela se perde e a comissao nunca acontece.
 *
 * Por isso a atribuicao e copiada do cookie para provider_payload.flowdesk_affiliate
 * quando o pedido nasce. Dali em diante ela viaja com o pedido.
 */

import { findAffiliateByCode } from "./account";
import { readAttributionFromCookieStore } from "./attribution";

export type OrderAffiliateStamp = {
  flowdesk_affiliate: {
    affiliateCode: string;
    linkId: string | null;
    visitorId: string | null;
    attributedAt: string;
  };
};

/**
 * Devolve o fragmento a mesclar em provider_payload, ou null se nao houver
 * indicacao valida. Nunca lanca: checkout nao pode quebrar por causa disso.
 */
export async function buildOrderAffiliateStamp(): Promise<OrderAffiliateStamp | null> {
  try {
    const attribution = await readAttributionFromCookieStore();
    if (!attribution?.affiliateCode) {
      return null;
    }

    // Confere que o afiliado ainda existe e pode receber comissao antes de
    // carimbar. Evita carregar indicacao morta pelo pedido inteiro.
    const affiliate = await findAffiliateByCode(attribution.affiliateCode);
    if (!affiliate || affiliate.suspended_at || !affiliate.is_active) {
      return null;
    }

    return {
      flowdesk_affiliate: {
        affiliateCode: affiliate.affiliate_id,
        linkId: attribution.linkId,
        visitorId: attribution.visitorId,
        attributedAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    console.error("[affiliates] falha ao carimbar atribuicao no pedido:", error);
    return null;
  }
}
