/**
 * Ranking mensal de afiliados.
 *
 * A agregacao acontece no banco (affiliate_monthly_ranking), que devolve so o
 * topo. A versao anterior carregava todas as conversoes aprovadas do mes para
 * somar em memoria — no painel a cada abertura, e no calculo do bonus de podio
 * a cada liquidacao de pedido, ou seja, dentro do caminho de pagamento.
 *
 * O fallback existe por ordem de deploy: se o site subir antes da migracao que
 * cria a funcao, o ranking continua funcionando pelo caminho antigo em vez de
 * quebrar o painel e a liquidacao.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type MonthlyRankingRow = {
  affiliateRowId: string;
  salesCount: number;
  commissionTotal: number;
};

function toNumber(value: unknown) {
  const numeric =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(numeric) ? numeric : 0;
}

/** Primeiro instante do mes corrente, em UTC. */
export function startOfCurrentMonthIso() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date.toISOString();
}

export async function fetchMonthlyRanking(
  monthStartIso: string,
  maxRows: number,
): Promise<MonthlyRankingRow[]> {
  const { data, error } = await supabaseAdmin.rpc("affiliate_monthly_ranking", {
    month_start: monthStartIso,
    max_rows: maxRows,
  });

  if (!error && Array.isArray(data)) {
    return data.map((row) => ({
      affiliateRowId: String(row.affiliate_row_id),
      salesCount: Math.round(toNumber(row.sales_count)),
      commissionTotal: toNumber(row.commission_total),
    }));
  }

  console.warn(
    "[affiliates] affiliate_monthly_ranking indisponivel, agregando em memoria:",
    error?.message,
  );

  return aggregateInMemory(monthStartIso, maxRows);
}

/** Caminho antigo, mantido apenas como rede de seguranca. */
async function aggregateInMemory(
  monthStartIso: string,
  maxRows: number,
): Promise<MonthlyRankingRow[]> {
  const { data, error } = await supabaseAdmin
    .from("affiliate_conversions")
    .select("affiliate_id, commission_amount")
    .eq("status", "approved")
    .is("reversed_at", null)
    .gte("conversion_date", monthStartIso);

  if (error || !data) {
    return [];
  }

  const totals = new Map<string, { sales: number; commission: number }>();

  for (const row of data) {
    const key = String(row.affiliate_id || "").trim();
    if (!key) continue;

    const current = totals.get(key) || { sales: 0, commission: 0 };
    current.sales += 1;
    current.commission += toNumber(row.commission_amount);
    totals.set(key, current);
  }

  return [...totals.entries()]
    .sort(
      (left, right) =>
        right[1].commission - left[1].commission ||
        right[1].sales - left[1].sales ||
        left[0].localeCompare(right[0]),
    )
    .slice(0, Math.max(maxRows, 1))
    .map(([affiliateRowId, metrics]) => ({
      affiliateRowId,
      salesCount: metrics.sales,
      commissionTotal: metrics.commission,
    }));
}

/**
 * Posicao do afiliado no podio do mes (1, 2, 3 ou null).
 *
 * So o top 3 importa, porque e ate onde vai o bonus de ranking — entao a
 * consulta pede tres linhas, nao a lista inteira.
 */
export async function resolveRankTier(
  affiliateRowId: string,
  monthStartIso = startOfCurrentMonthIso(),
): Promise<1 | 2 | 3 | null> {
  const top = await fetchMonthlyRanking(monthStartIso, 3);
  const position = top.findIndex((row) => row.affiliateRowId === affiliateRowId);

  if (position === 0) return 1;
  if (position === 1) return 2;
  if (position === 2) return 3;
  return null;
}
