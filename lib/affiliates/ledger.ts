/**
 * Razao contabil do programa de afiliados.
 *
 * O saldo de um afiliado nao e um campo que se soma e subtrai: e a soma dos
 * lancamentos desta tabela. Os campos balance_pending / balance_available /
 * total_earned em public.affiliates sao cache, reescritos por
 * affiliate_recompute_balances() a cada lancamento.
 *
 * Corrigir um erro significa lancar a entrada inversa. O banco recusa update e
 * delete no ledger.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

export type LedgerEntryType =
  | "commission_accrued"
  | "commission_matured"
  | "commission_reversed"
  | "withdrawal_requested"
  | "withdrawal_paid"
  | "withdrawal_refunded"
  | "adjustment";

export type LedgerEntryInput = {
  affiliateId: string;
  entryType: LedgerEntryType;
  /** Variacao do saldo em carencia. */
  pendingDelta?: number;
  /** Variacao do saldo sacavel. */
  availableDelta?: number;
  /** Variacao do total ganho na vida (nao diminui em saque, so em estorno). */
  earnedDelta?: number;
  conversionId?: string | null;
  withdrawalId?: string | null;
  description?: string | null;
  createdBy?: string | null;
  /**
   * Chave unica que impede lancar o mesmo evento duas vezes. Obrigatoria para
   * qualquer lancamento originado de webhook ou job, que podem reprocessar.
   */
  idempotencyKey?: string | null;
};

export type LedgerPostResult =
  | { ok: true; entryId: string; duplicate: false }
  | { ok: true; entryId: null; duplicate: true }
  | { ok: false; reason: string };

/** Tipos que existem para registrar um evento, nao para mover saldo. */
const MARKER_ENTRY_TYPES = new Set<LedgerEntryType>(["withdrawal_paid"]);

function round2(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Grava um lancamento e recalcula o saldo do afiliado.
 *
 * Repetir a mesma idempotencyKey nao lanca de novo: devolve duplicate: true.
 */
export async function postLedgerEntry(
  input: LedgerEntryInput,
): Promise<LedgerPostResult> {
  const pendingDelta = round2(input.pendingDelta ?? 0);
  const availableDelta = round2(input.availableDelta ?? 0);
  const earnedDelta = round2(input.earnedDelta ?? 0);

  // Marcos como "saque pago" nao mexem em saldo (o valor ja saiu na
  // solicitacao) mas precisam aparecer no extrato. So recusa o lancamento
  // vazio que nao e marco nem movimento.
  const isMarkerEntry = MARKER_ENTRY_TYPES.has(input.entryType);
  if (
    !isMarkerEntry &&
    pendingDelta === 0 &&
    availableDelta === 0 &&
    earnedDelta === 0
  ) {
    return { ok: false, reason: "Lancamento sem efeito em nenhum saldo." };
  }

  const { data, error } = await supabaseAdmin
    .from("affiliate_ledger")
    .insert([
      {
        affiliate_id: input.affiliateId,
        entry_type: input.entryType,
        pending_delta: pendingDelta,
        available_delta: availableDelta,
        earned_delta: earnedDelta,
        conversion_id: input.conversionId ?? null,
        withdrawal_id: input.withdrawalId ?? null,
        description: input.description ?? null,
        created_by: input.createdBy ?? null,
        idempotency_key: input.idempotencyKey ?? null,
      },
    ])
    .select("id")
    .single();

  if (error) {
    // 23505 = unique_violation. Com idempotencyKey, isso significa que o evento
    // ja foi contabilizado antes: e sucesso, nao falha.
    if (error.code === "23505" && input.idempotencyKey) {
      return { ok: true, entryId: null, duplicate: true };
    }

    console.error("[affiliates] falha ao lancar no ledger:", error);
    return { ok: false, reason: error.message };
  }

  const recomputed = await recomputeAffiliateBalances(input.affiliateId);
  if (!recomputed.ok) {
    // O lancamento ja esta gravado e e imutavel; o cache e que ficou velho.
    // Nao e erro fatal, mas precisa aparecer no log para reconciliacao.
    console.error(
      "[affiliates] lancamento gravado mas saldo nao recalculado:",
      recomputed.reason,
    );
  }

  return { ok: true, entryId: data.id as string, duplicate: false };
}

/** Reescreve o cache de saldo do afiliado somando o ledger. */
export async function recomputeAffiliateBalances(
  affiliateId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { error } = await supabaseAdmin.rpc("affiliate_recompute_balances", {
    target_affiliate_id: affiliateId,
  });

  if (error) {
    return { ok: false, reason: error.message };
  }

  return { ok: true };
}

export type LedgerEntryRecord = {
  id: string;
  entry_type: LedgerEntryType;
  pending_delta: number;
  available_delta: number;
  earned_delta: number;
  conversion_id: string | null;
  withdrawal_id: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

/** Extrato do afiliado, do mais recente para o mais antigo. */
export async function listLedgerEntries(
  affiliateId: string,
  options?: { limit?: number; before?: string },
) {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 500);

  let query = supabaseAdmin
    .from("affiliate_ledger")
    .select(
      "id, entry_type, pending_delta, available_delta, earned_delta, conversion_id, withdrawal_id, description, created_by, created_at",
    )
    .eq("affiliate_id", affiliateId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options?.before) {
    query = query.lt("created_at", options.before);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[affiliates] falha ao listar extrato:", error);
    return [] as LedgerEntryRecord[];
  }

  return (data || []) as LedgerEntryRecord[];
}

/**
 * Soma o ledger sem passar pelo cache. Use para conferir se
 * public.affiliates esta batendo com a verdade.
 */
export async function auditAffiliateBalances(affiliateId: string) {
  const { data, error } = await supabaseAdmin
    .from("affiliate_ledger")
    .select("pending_delta, available_delta, earned_delta")
    .eq("affiliate_id", affiliateId);

  if (error) {
    return { ok: false as const, reason: error.message };
  }

  const totals = (data || []).reduce(
    (acc, row) => ({
      pending: acc.pending + Number(row.pending_delta ?? 0),
      available: acc.available + Number(row.available_delta ?? 0),
      earned: acc.earned + Number(row.earned_delta ?? 0),
    }),
    { pending: 0, available: 0, earned: 0 },
  );

  return {
    ok: true as const,
    pending: round2(totals.pending),
    available: round2(totals.available),
    earned: round2(totals.earned),
  };
}
