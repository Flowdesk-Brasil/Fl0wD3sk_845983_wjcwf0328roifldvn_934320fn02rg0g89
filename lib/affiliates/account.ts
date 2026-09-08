/**
 * Conta do afiliado: identidade, adesao e estado.
 *
 * A v1 criava o perfil de afiliado em qualquer GET /api/affiliates/me, ou seja,
 * qualquer usuario logado que abrisse a pagina virava afiliado sem pedir e sem
 * aceitar termos. Aqui a adesao e explicita e fica registrada com versao dos
 * termos, data, IP e user agent.
 */

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { AffiliateLevel } from "./affiliateTypes";
import {
  COUPON_ENABLED,
  DEFAULT_AFFILIATE_LEVEL,
  PROGRAM_TERMS_VERSION,
} from "./programRules";

export type AffiliateRecord = {
  id: string;
  user_id: number;
  affiliate_id: string;
  level: AffiliateLevel;
  highest_level: AffiliateLevel | null;
  balance_available: number | string | null;
  balance_pending: number | string | null;
  total_earned: number | string | null;
  coupon_code: string | null;
  whatsapp_group_url: string | null;
  is_active: boolean;
  enrolled_at: string | null;
  terms_version: string | null;
  terms_accepted_at: string | null;
  suspended_at: string | null;
  suspension_reason: string | null;
  level_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
};

const AFFILIATE_SELECT = "*";

// Alfabeto sem caracteres ambiguos (0/O, 1/I/L), porque afiliados leem e ditam
// esse codigo em video, audio e stories.
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 7;
const COUPON_LENGTH = 8;
const MAX_GENERATION_ATTEMPTS = 6;

/**
 * Gera um codigo aleatorio criptografico.
 *
 * A v1 usava Math.random().toString(36), que nao e criptografico e, ao colidir
 * com a restricao unique, devolvia 500 sem nova tentativa.
 */
function randomCode(length: number) {
  const bytes = crypto.randomBytes(length * 2);
  let output = "";

  for (let index = 0; index < bytes.length && output.length < length; index += 1) {
    // Rejeita valores que cairiam fora de um multiplo do alfabeto, para nao
    // enviesar as primeiras letras.
    const value = bytes[index];
    const limit = 256 - (256 % CODE_ALPHABET.length);
    if (value >= limit) continue;
    output += CODE_ALPHABET[value % CODE_ALPHABET.length];
  }

  if (output.length < length) {
    return randomCode(length);
  }

  return output;
}

async function generateUniqueAffiliateCode() {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = `AFF-${randomCode(CODE_LENGTH)}`;

    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .select("id")
      .eq("affiliate_id", candidate)
      .maybeSingle();

    if (error) {
      console.error("[affiliates] falha ao verificar codigo:", error);
      return null;
    }

    if (!data) {
      return candidate;
    }
  }

  return null;
}

async function generateUniqueCouponCode(seed: string) {
  // Primeira tentativa deriva do proprio codigo do afiliado, que ja e unico e
  // legivel: AFF-8KD2M1 vira FLOW8KD2M1.
  const derived = `FLOW${seed.replace(/^AFF-/, "").toUpperCase()}`.slice(0, 12);
  const candidates = [derived];

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    candidates.push(`FLOW${randomCode(COUPON_LENGTH)}`);
  }

  for (const candidate of candidates) {
    const { data, error } = await supabaseAdmin
      .from("affiliates")
      .select("id")
      .eq("coupon_code", candidate)
      .maybeSingle();

    if (error) {
      console.error("[affiliates] falha ao verificar cupom:", error);
      return null;
    }

    if (!data) {
      return candidate;
    }
  }

  return null;
}

/** Busca o perfil pelo usuario logado. Nao cria nada. */
export async function findAffiliateByUserId(userId: number) {
  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select(AFFILIATE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("[affiliates] falha ao buscar perfil por usuario:", error);
    return null;
  }

  return (data as AffiliateRecord | null) ?? null;
}

/** Busca o perfil pelo codigo publico (AFF-XXXXXXX). */
export async function findAffiliateByCode(affiliateCode: string) {
  const normalized = String(affiliateCode ?? "").trim().toUpperCase();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select(AFFILIATE_SELECT)
    .eq("affiliate_id", normalized)
    .maybeSingle();

  if (error) {
    console.error("[affiliates] falha ao buscar perfil por codigo:", error);
    return null;
  }

  return (data as AffiliateRecord | null) ?? null;
}

export type EnrollmentContext = {
  ipFingerprint?: string | null;
  userAgent?: string | null;
};

export type EnrollmentResult =
  | { ok: true; affiliate: AffiliateRecord; created: boolean }
  | { ok: false; reason: string; status: number };

/**
 * Adere ao programa, ou registra o aceite de uma nova versao dos termos para
 * quem ja e afiliado. Idempotente: chamar duas vezes nao duplica nada.
 */
export async function enrollAffiliate(
  userId: number,
  context: EnrollmentContext = {},
): Promise<EnrollmentResult> {
  const existing = await findAffiliateByUserId(userId);

  if (existing) {
    if (existing.suspended_at) {
      return {
        ok: false,
        reason:
          existing.suspension_reason ||
          "Sua participacao no programa esta suspensa. Fale com o suporte.",
        status: 403,
      };
    }

    // Ja e afiliado, mas os termos mudaram: registra o novo aceite.
    if (existing.terms_version !== PROGRAM_TERMS_VERSION) {
      await recordTermsAcceptance(existing.id, context);

      const { data, error } = await supabaseAdmin
        .from("affiliates")
        .update({
          terms_version: PROGRAM_TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
          is_active: true,
        })
        .eq("id", existing.id)
        .select(AFFILIATE_SELECT)
        .single();

      if (error || !data) {
        return { ok: false, reason: "Falha ao registrar o aceite dos termos.", status: 500 };
      }

      return { ok: true, affiliate: data as AffiliateRecord, created: false };
    }

    return { ok: true, affiliate: existing, created: false };
  }

  const affiliateCode = await generateUniqueAffiliateCode();
  if (!affiliateCode) {
    return {
      ok: false,
      reason: "Nao foi possivel gerar seu codigo de afiliado. Tente novamente.",
      status: 503,
    };
  }

  const couponCode = COUPON_ENABLED ? await generateUniqueCouponCode(affiliateCode) : null;
  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .insert([
      {
        user_id: userId,
        affiliate_id: affiliateCode,
        level: DEFAULT_AFFILIATE_LEVEL,
        highest_level: DEFAULT_AFFILIATE_LEVEL,
        coupon_code: couponCode,
        is_active: true,
        enrolled_at: now,
        terms_version: PROGRAM_TERMS_VERSION,
        terms_accepted_at: now,
        level_evaluated_at: now,
      },
    ])
    .select(AFFILIATE_SELECT)
    .single();

  if (error || !data) {
    // Corrida entre duas abas: o perfil pode ter sido criado no meio do caminho.
    if (error?.code === "23505") {
      const raced = await findAffiliateByUserId(userId);
      if (raced) {
        return { ok: true, affiliate: raced, created: false };
      }
    }

    console.error("[affiliates] falha ao criar perfil:", error);
    return { ok: false, reason: "Falha ao criar o perfil de afiliado.", status: 500 };
  }

  const affiliate = data as AffiliateRecord;

  await recordTermsAcceptance(affiliate.id, context);
  await supabaseAdmin.from("affiliate_settings").insert([{ affiliate_id: affiliate.id }]);

  // Registra o cupom no sistema de descontos do checkout, para o desconto
  // funcionar sem nenhuma alteracao no caminho de pagamento.
  const { ensureAffiliateCoupon } = await import("./coupons");
  await ensureAffiliateCoupon(affiliate);

  return { ok: true, affiliate, created: true };
}

async function recordTermsAcceptance(affiliateId: string, context: EnrollmentContext) {
  const { error } = await supabaseAdmin.from("affiliate_terms_acceptances").insert([
    {
      affiliate_id: affiliateId,
      terms_version: PROGRAM_TERMS_VERSION,
      ip_fingerprint: context.ipFingerprint ?? null,
      user_agent: context.userAgent ? String(context.userAgent).slice(0, 400) : null,
    },
  ]);

  // Aceite duplicado da mesma versao nao e erro.
  if (error && error.code !== "23505") {
    console.error("[affiliates] falha ao registrar aceite dos termos:", error);
  }
}

export type AffiliateGate =
  | { ok: true; affiliate: AffiliateRecord }
  | { ok: false; status: number; code: string; message: string };

/**
 * Portao usado pelas rotas que exigem afiliado ativo. Distingue os casos para
 * que o front saiba o que mostrar: convite para aderir, tela de novos termos ou
 * aviso de suspensao.
 */
export async function requireActiveAffiliate(userId: number): Promise<AffiliateGate> {
  const affiliate = await findAffiliateByUserId(userId);

  if (!affiliate) {
    return {
      ok: false,
      status: 404,
      code: "not_enrolled",
      message: "Voce ainda nao faz parte do programa de afiliados.",
    };
  }

  if (affiliate.suspended_at) {
    return {
      ok: false,
      status: 403,
      code: "suspended",
      message:
        affiliate.suspension_reason ||
        "Sua participacao no programa esta suspensa. Fale com o suporte.",
    };
  }

  if (!affiliate.is_active) {
    return {
      ok: false,
      status: 403,
      code: "inactive",
      message: "Sua conta de afiliado esta inativa.",
    };
  }

  if (affiliate.terms_version !== PROGRAM_TERMS_VERSION) {
    return {
      ok: false,
      status: 409,
      code: "terms_outdated",
      message: "Os termos do programa mudaram. Aceite a nova versao para continuar.",
    };
  }

  return { ok: true, affiliate };
}
