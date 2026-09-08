/**
 * Regras do programa de afiliados.
 *
 * Este arquivo e a fonte unica das decisoes de negocio do programa. Todas tem
 * um padrao razoavel e podem ser sobrescritas por variavel de ambiente sem
 * mexer em codigo. Mudar um valor aqui muda o comportamento de atribuicao,
 * comissao, carencia e saque em todo o sistema.
 */

import type { AffiliateLevel } from "./affiliateTypes";

function envInt(key: string, fallback: number) {
  const raw = String(process.env[key] ?? "").trim();
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envMoney(key: string, fallback: number) {
  const raw = String(process.env[key] ?? "").trim();
  if (!raw) return fallback;

  const parsed = Number.parseFloat(raw.replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envBool(key: string, fallback: boolean) {
  const raw = String(process.env[key] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on", "sim"].includes(raw)) return true;
  if (["0", "false", "no", "off", "nao"].includes(raw)) return false;
  return fallback;
}

// ─── Decisao 1: janela e modelo de atribuicao ─────────────────────────────────
// Padrao de mercado: ultimo clique vence, valido por 30 dias. "first" faz o
// primeiro clique prevalecer (o cookie existente nao e sobrescrito).

export const ATTRIBUTION_WINDOW_DAYS = envInt("AFFILIATE_ATTRIBUTION_WINDOW_DAYS", 30);

export const ATTRIBUTION_MODEL: "last" | "first" =
  String(process.env.AFFILIATE_ATTRIBUTION_MODEL ?? "").trim().toLowerCase() === "first"
    ? "first"
    : "last";

export const ATTRIBUTION_COOKIE_NAME = "fd_aff";
export const ATTRIBUTION_COOKIE_MAX_AGE_SECONDS = ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60;

// ─── Decisao 2: recorrencia ───────────────────────────────────────────────────
// "first" paga comissao apenas na primeira compra do cliente indicado.
// "all" paga em toda renovacao enquanto a assinatura viver.
// "limited" paga nas N primeiras cobrancas (AFFILIATE_RECURRENCE_MAX_CHARGES).

export const RECURRENCE_MODE: "first" | "all" | "limited" = (() => {
  const raw = String(process.env.AFFILIATE_RECURRENCE_MODE ?? "").trim().toLowerCase();
  if (raw === "all" || raw === "limited") return raw;
  return "first";
})();

export const RECURRENCE_MAX_CHARGES = envInt("AFFILIATE_RECURRENCE_MAX_CHARGES", 12);

// ─── Decisao 3: carencia ──────────────────────────────────────────────────────
// Dias entre a venda aprovada e a comissao virar saldo sacavel. Precisa cobrir
// a janela de reembolso e chargeback do meio de pagamento.

export const HOLDING_PERIOD_DAYS = envInt("AFFILIATE_HOLDING_PERIOD_DAYS", 7);

// ─── Decisao 4: saque ─────────────────────────────────────────────────────────

export const WITHDRAWAL_MINIMUM_BRL = envMoney("AFFILIATE_WITHDRAWAL_MINIMUM_BRL", 50);
export const WITHDRAWAL_FEE_BRL = envMoney("AFFILIATE_WITHDRAWAL_FEE_BRL", 0);
// Um saque aberto por vez nao e configuravel: e garantido por indice unico
// parcial em affiliate_withdrawals. Tornar isso um numero exigiria trocar o
// indice, entao nao existe variavel de ambiente prometendo o contrario.
export const WITHDRAWAL_COOLDOWN_HOURS = envInt("AFFILIATE_WITHDRAWAL_COOLDOWN_HOURS", 24);

// ─── Decisao 5: execucao do PIX ───────────────────────────────────────────────
// "manual": um administrador transfere e registra o comprovante no painel.
// Automatizar a transferencia exige integracao com API de pagamento e nao esta
// implementado de proposito: mover dinheiro sozinho precisa de decisao humana.

export const WITHDRAWAL_EXECUTION = "manual" as const;

// ─── Decisao 6: progressao de nivel ───────────────────────────────────────────
// Reavaliado a cada venda aprovada, com base nas vendas aprovadas do mes
// corrente. LEVEL_CAN_REGRESS=false trava o nivel no maior ja atingido.

export const LEVEL_CAN_REGRESS = envBool("AFFILIATE_LEVEL_CAN_REGRESS", true);

// ─── Decisao 7: auto-indicacao ────────────────────────────────────────────────
// Comprar pelo proprio link nao gera comissao. A conversao e registrada com
// status "cancelled" e motivo de fraude, para ficar auditavel.

export const BLOCK_SELF_REFERRAL = envBool("AFFILIATE_BLOCK_SELF_REFERRAL", true);

// ─── Decisao 8: cupom do afiliado ─────────────────────────────────────────────
// O cupom da desconto ao cliente. COUPON_DISCOUNT_SOURCE define de onde sai:
// "margin" mantem a comissao cheia do afiliado; "commission" desconta do
// afiliado o valor do desconto concedido.

export const COUPON_ENABLED = envBool("AFFILIATE_COUPON_ENABLED", true);
export const COUPON_DISCOUNT_PCT = envInt("AFFILIATE_COUPON_DISCOUNT_PCT", 10);
export const COUPON_DISCOUNT_SOURCE: "margin" | "commission" =
  String(process.env.AFFILIATE_COUPON_DISCOUNT_SOURCE ?? "").trim().toLowerCase() ===
  "commission"
    ? "commission"
    : "margin";

// ─── Antifraude ───────────────────────────────────────────────────────────────

/** Cliques do mesmo visitante no mesmo link dentro dessa janela contam uma vez. */
export const CLICK_DEDUPE_WINDOW_MINUTES = envInt("AFFILIATE_CLICK_DEDUPE_MINUTES", 30);

/** Teto de cliques aceitos por visitante por link por dia. */
export const CLICK_MAX_PER_VISITOR_PER_DAY = envInt("AFFILIATE_CLICK_MAX_PER_DAY", 40);

// ─── Planos e periodos ────────────────────────────────────────────────────────
// Espelham lib/plans/catalog.ts. O schema antigo aceitava "enterprise", que nao
// existe no produto, e ignorava ultra, master, trimestral e semestral.

export const AFFILIATE_PLAN_CODES = ["basic", "pro", "ultra", "master"] as const;
export type AffiliatePlanCode = (typeof AFFILIATE_PLAN_CODES)[number];

export const AFFILIATE_PERIOD_CODES = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
] as const;
export type AffiliatePeriodCode = (typeof AFFILIATE_PERIOD_CODES)[number];

export const AFFILIATE_PLAN_LABELS: Record<AffiliatePlanCode, string> = {
  basic: "Basic",
  pro: "Pro",
  ultra: "Ultra",
  master: "Master",
};

export const AFFILIATE_PERIOD_LABELS: Record<AffiliatePeriodCode, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
};

export function isAffiliatePlanCode(value: unknown): value is AffiliatePlanCode {
  return AFFILIATE_PLAN_CODES.includes(String(value ?? "").trim() as AffiliatePlanCode);
}

export function isAffiliatePeriodCode(value: unknown): value is AffiliatePeriodCode {
  return AFFILIATE_PERIOD_CODES.includes(
    String(value ?? "").trim() as AffiliatePeriodCode,
  );
}

// ─── Termos do programa ───────────────────────────────────────────────────────
// Subir a versao obriga todo afiliado a aceitar novamente antes de continuar.

export const PROGRAM_TERMS_VERSION =
  String(process.env.AFFILIATE_TERMS_VERSION ?? "").trim() || "2026-09-01";

export const PROGRAM_TERMS_URL =
  String(process.env.AFFILIATE_TERMS_URL ?? "").trim() || "/terms";

// ─── Resumo legivel ───────────────────────────────────────────────────────────
// Usado pela landing e pelo painel para que a comunicacao publica sempre reflita
// a configuracao real, em vez de numeros escritos a mao no componente.

export type ProgramRulesSummary = {
  attributionWindowDays: number;
  attributionModel: "last" | "first";
  recurrenceMode: "first" | "all" | "limited";
  recurrenceMaxCharges: number;
  holdingPeriodDays: number;
  withdrawalMinimum: number;
  withdrawalFee: number;
  withdrawalExecution: "manual";
  levelCanRegress: boolean;
  blockSelfReferral: boolean;
  couponEnabled: boolean;
  couponDiscountPct: number;
  termsVersion: string;
  termsUrl: string;
};

export function getProgramRulesSummary(): ProgramRulesSummary {
  return {
    attributionWindowDays: ATTRIBUTION_WINDOW_DAYS,
    attributionModel: ATTRIBUTION_MODEL,
    recurrenceMode: RECURRENCE_MODE,
    recurrenceMaxCharges: RECURRENCE_MAX_CHARGES,
    holdingPeriodDays: HOLDING_PERIOD_DAYS,
    withdrawalMinimum: WITHDRAWAL_MINIMUM_BRL,
    withdrawalFee: WITHDRAWAL_FEE_BRL,
    withdrawalExecution: WITHDRAWAL_EXECUTION,
    levelCanRegress: LEVEL_CAN_REGRESS,
    blockSelfReferral: BLOCK_SELF_REFERRAL,
    couponEnabled: COUPON_ENABLED,
    couponDiscountPct: COUPON_DISCOUNT_PCT,
    termsVersion: PROGRAM_TERMS_VERSION,
    termsUrl: PROGRAM_TERMS_URL,
  };
}

/** Nivel inicial de quem entra no programa. */
export const DEFAULT_AFFILIATE_LEVEL: AffiliateLevel = "bronze";
