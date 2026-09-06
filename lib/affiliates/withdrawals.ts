/**
 * Saques.
 *
 * O dinheiro sai do saldo no momento da solicitacao, nao no pagamento: se o
 * valor continuasse disponivel enquanto o pedido esta na fila, o afiliado
 * poderia solicitar duas vezes o mesmo saldo. Rejeitar devolve.
 *
 * A transferencia em si e manual, por decisao (programRules.WITHDRAWAL_EXECUTION):
 * mover dinheiro sozinho precisa de aprovacao humana.
 */

import { supabaseAdmin } from "@/lib/supabase/admin";
import { postLedgerEntry } from "./ledger";
import { queueAffiliateWebhook } from "./notifications";
import {
  WITHDRAWAL_COOLDOWN_HOURS,
  WITHDRAWAL_FEE_BRL,
  WITHDRAWAL_MINIMUM_BRL,
} from "./programRules";

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

export type WithdrawalRequestInput = {
  affiliateId: string;
  amount: number;
  pixKey: string;
  pixKeyType: PixKeyType;
};

export type WithdrawalRequestResult =
  | { ok: true; withdrawalId: string; amount: number; fee: number; net: number }
  | { ok: false; status: number; message: string };

function round2(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function toNumber(value: unknown) {
  const numeric =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(numeric) ? numeric : 0;
}

// ─── Validacao de chave PIX ───────────────────────────────────────────────────

function stripNonDigits(value: string) {
  return value.replace(/\D+/g, "");
}

/** Validacao de CPF pelos digitos verificadores. */
export function isValidCpf(raw: string) {
  const digits = stripNonDigits(raw);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  for (const [length, factor] of [[9, 10], [10, 11]] as const) {
    let sum = 0;
    for (let index = 0; index < length; index += 1) {
      sum += Number(digits[index]) * (factor - index);
    }
    const remainder = (sum * 10) % 11 % 10;
    if (remainder !== Number(digits[length])) return false;
  }

  return true;
}

/** Validacao de CNPJ pelos digitos verificadores. */
export function isValidCnpj(raw: string) {
  const digits = stripNonDigits(raw);
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const weightsFirst = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const weightsSecond = [6, ...weightsFirst];

  for (const weights of [weightsFirst, weightsSecond]) {
    let sum = 0;
    for (let index = 0; index < weights.length; index += 1) {
      sum += Number(digits[index]) * weights[index];
    }
    const remainder = sum % 11;
    const expected = remainder < 2 ? 0 : 11 - remainder;
    if (expected !== Number(digits[weights.length])) return false;
  }

  return true;
}

export function validatePixKey(
  key: string,
  type: PixKeyType,
): { ok: true; normalized: string } | { ok: false; message: string } {
  const value = String(key ?? "").trim();

  if (!value) {
    return { ok: false, message: "Informe a chave PIX." };
  }

  switch (type) {
    case "cpf": {
      if (!isValidCpf(value)) {
        return { ok: false, message: "CPF invalido. Confira os numeros e tente de novo." };
      }
      return { ok: true, normalized: stripNonDigits(value) };
    }
    case "cnpj": {
      if (!isValidCnpj(value)) {
        return { ok: false, message: "CNPJ invalido. Confira os numeros e tente de novo." };
      }
      return { ok: true, normalized: stripNonDigits(value) };
    }
    case "email": {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) || value.length > 77) {
        return { ok: false, message: "E-mail invalido para chave PIX." };
      }
      return { ok: true, normalized: value.toLowerCase() };
    }
    case "phone": {
      const digits = stripNonDigits(value);
      // Celular brasileiro: 11 digitos com DDD, ou 13 com +55.
      if (digits.length === 11) {
        return { ok: true, normalized: `+55${digits}` };
      }
      if (digits.length === 13 && digits.startsWith("55")) {
        return { ok: true, normalized: `+${digits}` };
      }
      return { ok: false, message: "Telefone invalido. Use DDD + numero." };
    }
    case "random": {
      const normalized = value.toLowerCase();
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(normalized)
      ) {
        return { ok: false, message: "Chave aleatoria invalida. Copie do seu banco." };
      }
      return { ok: true, normalized };
    }
    default:
      return { ok: false, message: "Tipo de chave PIX invalido." };
  }
}

// ─── Solicitacao ──────────────────────────────────────────────────────────────

export async function requestWithdrawal(
  input: WithdrawalRequestInput,
): Promise<WithdrawalRequestResult> {
  const amount = round2(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, status: 400, message: "Informe um valor valido para saque." };
  }

  if (amount < WITHDRAWAL_MINIMUM_BRL) {
    return {
      ok: false,
      status: 400,
      message: `O saque minimo e de R$ ${WITHDRAWAL_MINIMUM_BRL.toFixed(2).replace(".", ",")}.`,
    };
  }

  const pix = validatePixKey(input.pixKey, input.pixKeyType);
  if (!pix.ok) {
    return { ok: false, status: 400, message: pix.message };
  }

  const { data: affiliate, error: affiliateError } = await supabaseAdmin
    .from("affiliates")
    .select("id, balance_available, suspended_at, is_active")
    .eq("id", input.affiliateId)
    .single();

  if (affiliateError || !affiliate) {
    return { ok: false, status: 404, message: "Perfil de afiliado nao encontrado." };
  }

  if (affiliate.suspended_at || !affiliate.is_active) {
    return {
      ok: false,
      status: 403,
      message: "Sua conta esta suspensa. Saques ficam bloqueados ate a revisao.",
    };
  }

  const available = toNumber(affiliate.balance_available);
  if (amount > available) {
    return {
      ok: false,
      status: 400,
      message: `Voce tem R$ ${available.toFixed(2).replace(".", ",")} disponiveis para saque.`,
    };
  }

  // Uma solicitacao aberta por vez. O indice unico parcial no banco garante isso
  // mesmo com duas abas enviando ao mesmo tempo; aqui e so para a mensagem boa.
  const { data: openRequest } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .select("id")
    .eq("affiliate_id", input.affiliateId)
    .in("status", ["pending", "processing"])
    .maybeSingle();

  if (openRequest) {
    return {
      ok: false,
      status: 409,
      message: "Voce ja tem um saque em andamento. Aguarde o processamento.",
    };
  }

  if (WITHDRAWAL_COOLDOWN_HOURS > 0) {
    const cooldownStart = new Date(
      Date.now() - WITHDRAWAL_COOLDOWN_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: recent } = await supabaseAdmin
      .from("affiliate_withdrawals")
      .select("id")
      .eq("affiliate_id", input.affiliateId)
      .gte("created_at", cooldownStart)
      .limit(1)
      .maybeSingle();

    if (recent) {
      return {
        ok: false,
        status: 429,
        message: `Aguarde ${WITHDRAWAL_COOLDOWN_HOURS}h entre solicitacoes de saque.`,
      };
    }
  }

  const fee = round2(WITHDRAWAL_FEE_BRL);
  const net = round2(amount - fee);

  if (net <= 0) {
    return { ok: false, status: 400, message: "Valor insuficiente para cobrir a taxa." };
  }

  const { data: withdrawal, error: insertError } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .insert([
      {
        affiliate_id: input.affiliateId,
        amount,
        fee_amount: fee,
        net_amount: net,
        pix_key: pix.normalized,
        pix_key_type: input.pixKeyType,
        status: "pending",
      },
    ])
    .select("id")
    .single();

  if (insertError || !withdrawal) {
    if (insertError?.code === "23505") {
      return {
        ok: false,
        status: 409,
        message: "Voce ja tem um saque em andamento. Aguarde o processamento.",
      };
    }

    console.error("[affiliates] falha ao criar saque:", insertError);
    return { ok: false, status: 500, message: "Nao foi possivel registrar o saque." };
  }

  const withdrawalId = withdrawal.id as string;

  // Retem o valor imediatamente.
  const ledger = await postLedgerEntry({
    affiliateId: input.affiliateId,
    entryType: "withdrawal_requested",
    availableDelta: -amount,
    withdrawalId,
    description: `Saque solicitado (${input.pixKeyType})`,
    createdBy: "affiliate",
    idempotencyKey: `withdrawal-requested-${withdrawalId}`,
  });

  if (!ledger.ok) {
    // Sem retencao o saldo ficaria sacavel duas vezes: desfaz a solicitacao.
    await supabaseAdmin.from("affiliate_withdrawals").delete().eq("id", withdrawalId);
    return {
      ok: false,
      status: 500,
      message: "Nao foi possivel reservar o saldo. Tente novamente.",
    };
  }

  void queueAffiliateWebhook({
    affiliateId: input.affiliateId,
    eventType: "withdrawal.requested",
    payload: { withdrawalId, amount, fee, net },
  });

  return { ok: true, withdrawalId, amount, fee, net };
}

// ─── Processamento (administrativo) ───────────────────────────────────────────

export type WithdrawalDecisionResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

/** Marca o saque como pago. O valor ja saiu do saldo na solicitacao. */
export async function markWithdrawalPaid(input: {
  withdrawalId: string;
  reviewedBy: string;
  receiptUrl?: string | null;
  notes?: string | null;
}): Promise<WithdrawalDecisionResult> {
  const { data: withdrawal, error } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .select("id, affiliate_id, amount, status")
    .eq("id", input.withdrawalId)
    .single();

  if (error || !withdrawal) {
    return { ok: false, status: 404, message: "Saque nao encontrado." };
  }

  if (!["pending", "processing"].includes(String(withdrawal.status))) {
    return { ok: false, status: 409, message: "Este saque ja foi finalizado." };
  }

  const now = new Date().toISOString();

  const { error: updateError } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .update({
      status: "paid",
      processed_at: now,
      reviewed_by: input.reviewedBy,
      reviewed_at: now,
      receipt_url: input.receiptUrl ?? null,
      notes: input.notes ?? null,
    })
    .eq("id", input.withdrawalId);

  if (updateError) {
    return { ok: false, status: 500, message: "Falha ao atualizar o saque." };
  }

  // Lancamento sem efeito em saldo: serve de marco no extrato.
  await postLedgerEntry({
    affiliateId: withdrawal.affiliate_id as string,
    entryType: "withdrawal_paid",
    availableDelta: 0,
    pendingDelta: 0,
    earnedDelta: 0,
    withdrawalId: input.withdrawalId,
    description: "Saque pago",
    createdBy: input.reviewedBy,
    idempotencyKey: `withdrawal-paid-${input.withdrawalId}`,
  }).catch(() => undefined);

  void queueAffiliateWebhook({
    affiliateId: withdrawal.affiliate_id as string,
    eventType: "withdrawal.paid",
    payload: {
      withdrawalId: input.withdrawalId,
      amount: toNumber(withdrawal.amount),
      paidAt: now,
    },
  });

  return { ok: true };
}

/** Rejeita o saque e devolve o valor retido ao saldo disponivel. */
export async function rejectWithdrawal(input: {
  withdrawalId: string;
  reviewedBy: string;
  reason: string;
}): Promise<WithdrawalDecisionResult> {
  const { data: withdrawal, error } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .select("id, affiliate_id, amount, status")
    .eq("id", input.withdrawalId)
    .single();

  if (error || !withdrawal) {
    return { ok: false, status: 404, message: "Saque nao encontrado." };
  }

  if (!["pending", "processing"].includes(String(withdrawal.status))) {
    return { ok: false, status: 409, message: "Este saque ja foi finalizado." };
  }

  const amount = toNumber(withdrawal.amount);
  const now = new Date().toISOString();

  const ledger = await postLedgerEntry({
    affiliateId: withdrawal.affiliate_id as string,
    entryType: "withdrawal_refunded",
    availableDelta: amount,
    withdrawalId: input.withdrawalId,
    description: `Saque rejeitado: ${input.reason}`,
    createdBy: input.reviewedBy,
    idempotencyKey: `withdrawal-refunded-${input.withdrawalId}`,
  });

  if (!ledger.ok) {
    return { ok: false, status: 500, message: "Falha ao devolver o saldo." };
  }

  const { error: updateError } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .update({
      status: "rejected",
      processed_at: now,
      reviewed_by: input.reviewedBy,
      reviewed_at: now,
      rejection_reason: input.reason,
      notes: input.reason,
    })
    .eq("id", input.withdrawalId);

  if (updateError) {
    // O saldo ja voltou, mas o saque continuaria como pendente: o indice unico
    // parcial bloquearia qualquer novo saque do afiliado. Como o ledger e
    // imutavel, desfazer significa lancar a entrada inversa e deixar o pedido
    // no estado anterior, para o operador tentar de novo.
    await postLedgerEntry({
      affiliateId: withdrawal.affiliate_id as string,
      entryType: "withdrawal_requested",
      availableDelta: -amount,
      withdrawalId: input.withdrawalId,
      description: "Estorno da devolucao: falha ao marcar o saque como recusado",
      createdBy: input.reviewedBy,
      idempotencyKey: `withdrawal-reject-rollback-${input.withdrawalId}`,
    });

    console.error("[affiliates] falha ao recusar saque:", updateError);
    return {
      ok: false,
      status: 500,
      message: "Nao foi possivel recusar o saque. O saldo nao foi alterado; tente de novo.",
    };
  }

  void queueAffiliateWebhook({
    affiliateId: withdrawal.affiliate_id as string,
    eventType: "withdrawal.rejected",
    payload: { withdrawalId: input.withdrawalId, amount, reason: input.reason },
  });

  return { ok: true };
}

/** Move para "processing": sinaliza que a transferencia esta sendo feita. */
/**
 * Mascara a chave PIX para exibicao ao proprio afiliado.
 *
 * O valor completo so aparece no painel administrativo, que e onde alguem
 * precisa dele para transferir.
 */
export function maskPixKey(key: string, type: string | null | undefined) {
  const value = String(key ?? "");
  if (!value) return "";

  if (type === "email") {
    const [name, domain] = value.split("@");
    if (!domain) return "***";
    return `${name.slice(0, 2)}${"*".repeat(Math.max(name.length - 2, 1))}@${domain}`;
  }

  if (value.length <= 4) return "*".repeat(value.length);
  return `${"*".repeat(Math.max(value.length - 4, 3))}${value.slice(-4)}`;
}

export async function markWithdrawalProcessing(input: {
  withdrawalId: string;
  reviewedBy: string;
}): Promise<WithdrawalDecisionResult> {
  const { data, error } = await supabaseAdmin
    .from("affiliate_withdrawals")
    .update({ status: "processing", reviewed_by: input.reviewedBy })
    .eq("id", input.withdrawalId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    return { ok: false, status: 500, message: "Falha ao atualizar o saque." };
  }

  if (!data) {
    return { ok: false, status: 409, message: "Saque nao esta pendente." };
  }

  return { ok: true };
}
