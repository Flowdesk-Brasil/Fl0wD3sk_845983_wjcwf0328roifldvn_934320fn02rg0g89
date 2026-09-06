/**
 * Painel do afiliado: um unico GET que devolve tudo que o workspace precisa.
 *
 * Mudancas em relacao a v1:
 *   - Nao cria mais perfil sozinho. Quem nao aderiu recebe enrolled: false e o
 *     painel mostra o convite, em vez de virar afiliado sem pedir.
 *   - clicksToday e clicksThisMonth vinham fixos em zero; agora saem de
 *     affiliate_clicks.
 *   - O ranking buscava todos os afiliados da base com join em auth_users, sem
 *     limite, e cortava os 10 primeiros em memoria. Agora agrega as conversoes
 *     do mes e so carrega os perfis do topo.
 */

import { NextResponse } from "next/server";
import { generateAffiliateInsight } from "@/lib/affiliates/intelligence";
import { getCurrentUserFromSessionCookie } from "@/lib/auth/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { findAffiliateByUserId } from "@/lib/affiliates/account";
import { listLedgerEntries } from "@/lib/affiliates/ledger";
import { RANK_BONUS } from "@/lib/affiliates/affiliateLevels";
import {
  fetchMonthlyRanking,
  type MonthlyRankingRow,
} from "@/lib/affiliates/ranking";
import { maskPixKey } from "@/lib/affiliates/withdrawals";
import {
  PROGRAM_TERMS_VERSION,
  getProgramRulesSummary,
} from "@/lib/affiliates/programRules";
import { applyNoStoreHeaders } from "@/lib/security/http";
import type { AffiliateLevel } from "@/lib/affiliates/affiliateTypes";

export const dynamic = "force-dynamic";

const RANKING_SIZE = 10;

type RankingUser = {
  username?: string | null;
  display_name?: string | null;
  avatar?: string | null;
  discord_user_id?: string | null;
};

function toNumber(value: unknown) {
  const numeric =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? "0"));
  return Number.isFinite(numeric) ? numeric : 0;
}

function pickRankingUser(user: RankingUser | RankingUser[] | null | undefined) {
  if (Array.isArray(user)) return user[0] ?? null;
  return user ?? null;
}

function buildDiscordAvatarUrl(user: RankingUser | null) {
  const avatar = String(user?.avatar || "").trim();
  const discordUserId = String(user?.discord_user_id || "").trim();

  if (!avatar || !discordUserId) return null;

  return `https://cdn.discordapp.com/avatars/${discordUserId}/${avatar}.png`;
}

/**
 * Devolve as preferencias sem o segredo do webhook.
 *
 * O segredo completo so e mostrado no momento em que e gerado ou rotacionado,
 * pela rota de configuracoes. Em qualquer outra leitura vai mascarado.
 */
function shapeSettings(row: Record<string, unknown> | null) {
  if (!row) return null;

  const secret = String(row.webhook_secret ?? "");

  return {
    webhook_url: row.webhook_url ?? null,
    webhook_enabled: row.webhook_enabled === true,
    webhook_events: Array.isArray(row.webhook_events) ? row.webhook_events : [],
    webhook_secret_preview: secret ? `${secret.slice(0, 10)}...${secret.slice(-4)}` : null,
    notify_email: row.notify_email === true,
    notify_sms: row.notify_sms === true,
    notify_push: row.notify_push === true,
    email_address: row.email_address ?? null,
    sms_phone: row.sms_phone ?? null,
    updated_at: row.updated_at ?? null,
  };
}

function startOfCurrentMonth() {
  const date = new Date();
  date.setUTCDate(1);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function startOfToday() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export async function GET() {
  const user = await getCurrentUserFromSessionCookie();

  if (!user) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: "Faca login para continuar." }, { status: 401 }),
    );
  }

  const profile = await findAffiliateByUserId(user.id);
  const rules = getProgramRulesSummary();

  // Nao e afiliado: o painel usa isso para mostrar o convite de adesao.
  if (!profile) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        enrolled: false,
        status: "not_enrolled",
        termsVersion: PROGRAM_TERMS_VERSION,
        rules,
      }),
    );
  }

  if (profile.suspended_at) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        enrolled: true,
        status: "suspended",
        message:
          profile.suspension_reason ||
          "Sua participacao no programa esta suspensa. Fale com o suporte.",
        rules,
      }),
    );
  }

  if (profile.terms_version !== PROGRAM_TERMS_VERSION) {
    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        enrolled: true,
        status: "terms_outdated",
        termsVersion: PROGRAM_TERMS_VERSION,
        acceptedTermsVersion: profile.terms_version,
        rules,
      }),
    );
  }

  const monthStartIso = startOfCurrentMonth().toISOString();
  const todayStartIso = startOfToday().toISOString();

  const [
    linksResult,
    conversionsResult,
    withdrawalsResult,
    settingsResult,
    clicksTotalResult,
    clicksTodayResult,
    clicksMonthResult,
    monthlyRanking,
    ledgerEntries,
  ] = await Promise.all([
    supabaseAdmin
      .from("affiliate_links")
      .select("*")
      .eq("affiliate_id", profile.id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("affiliate_conversions")
      .select("*")
      .eq("affiliate_id", profile.id)
      .order("conversion_date", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("affiliate_withdrawals")
      .select("*")
      .eq("affiliate_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(100),
    // Colunas explicitas em vez de "*": com select("*") o webhook_secret vinha
    // junto e era devolvido inteiro no payload. O segredo so aparece uma vez,
    // quando e gerado em /api/affiliates/settings; aqui vai so o prefixo.
    supabaseAdmin
      .from("affiliate_settings")
      .select(
        "webhook_url, webhook_enabled, webhook_events, webhook_secret, notify_email, notify_sms, notify_push, email_address, sms_phone, updated_at",
      )
      .eq("affiliate_id", profile.id)
      .maybeSingle(),
    supabaseAdmin
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("affiliate_id", profile.id)
      .eq("is_counted", true),
    supabaseAdmin
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("affiliate_id", profile.id)
      .eq("is_counted", true)
      .gte("clicked_at", todayStartIso),
    supabaseAdmin
      .from("affiliate_clicks")
      .select("id", { count: "exact", head: true })
      .eq("affiliate_id", profile.id)
      .eq("is_counted", true)
      .gte("clicked_at", monthStartIso),
    // Ranking agregado no banco: devolve so o topo, em vez de trazer todas as
    // conversoes do mes para somar aqui.
    fetchMonthlyRanking(monthStartIso, RANKING_SIZE),
    listLedgerEntries(profile.id, { limit: 50 }),
  ]);

  const links = linksResult.data || [];
  const conversions = conversionsResult.data || [];
  const withdrawals = withdrawalsResult.data || [];
  const linksById = new Map(links.map((link) => [link.id, link]));

  const totalClicks = clicksTotalResult.count ?? 0;
  const clicksToday = clicksTodayResult.count ?? 0;
  const clicksThisMonth = clicksMonthResult.count ?? 0;

  const approvedSales = conversions.filter(
    (conversion) => conversion.status === "approved" && !conversion.reversed_at,
  );
  const salesThisMonth = approvedSales.filter((conversion) => {
    const date = new Date(conversion.conversion_date);
    return !Number.isNaN(date.getTime()) && date.toISOString() >= monthStartIso;
  });

  const totalCommissionWithdrawn = withdrawals.reduce((total, withdrawal) => {
    const status = String(withdrawal.status || "").toLowerCase();
    return status === "paid" || status === "processed"
      ? total + toNumber(withdrawal.amount)
      : total;
  }, 0);

  const { ranking, currentRank } = await buildRanking({
    rows: monthlyRanking,
    currentAffiliateRowId: profile.id,
  });

  const insight = await generateAffiliateInsight({
    affiliateId: profile.affiliate_id || profile.id,
    affiliateLevel: profile.level,
    links,
    conversions,
  });

  const stats = {
    totalClicks,
    clicksToday,
    clicksThisMonth,
    totalSales: approvedSales.length,
    salesThisMonth: salesThisMonth.length,
    availableBalance: toNumber(profile.balance_available),
    totalCommissionPending: toNumber(profile.balance_pending),
    totalCommissionEarned: toNumber(profile.total_earned),
    totalCommissionWithdrawn,
    conversionRate: totalClicks > 0 ? (approvedSales.length / totalClicks) * 100 : 0,
    rankThisMonth:
      currentRank === 1 || currentRank === 2 || currentRank === 3 ? currentRank : null,
  };

  return applyNoStoreHeaders(
    NextResponse.json({
      ok: true,
      enrolled: true,
      status: "active",
      rules,
      profile: {
        id: profile.id,
        affiliateId: profile.affiliate_id,
        userId: profile.user_id,
        level: profile.level,
        highestLevel: profile.highest_level,
        couponCode: profile.coupon_code,
        whatsappGroupUrl: profile.whatsapp_group_url,
        isActive: profile.is_active,
        createdAt: profile.created_at,
        enrolledAt: profile.enrolled_at,
      },
      stats,
      settings: shapeSettings(settingsResult.data),
      insight,
      links: links.map((link) => ({
        linkId: link.id,
        affiliateId: link.affiliate_id,
        plan: link.plan_slug,
        period: link.period,
        url: link.target_url,
        shortUrl: link.short_url,
        clicks: Math.max(0, Math.round(toNumber(link.clicks_count))),
        conversions: Math.max(0, Math.round(toNumber(link.conversions_count))),
        conversionRate:
          toNumber(link.clicks_count) > 0
            ? (toNumber(link.conversions_count) / toNumber(link.clicks_count)) * 100
            : 0,
        createdAt: link.created_at,
      })),
      conversions: conversions.map((conversion) => {
        const link = linksById.get(conversion.link_id);
        const saleAmount = toNumber(conversion.amount_total);
        const commissionAmount = toNumber(conversion.commission_amount);

        return {
          commissionId: conversion.id,
          affiliateId: conversion.affiliate_id,
          plan: conversion.plan_slug,
          period: conversion.period || link?.period || "monthly",
          saleAmount,
          commissionAmount,
          commissionPct:
            toNumber(conversion.commission_pct) ||
            (saleAmount > 0 ? (commissionAmount / saleAmount) * 100 : 0),
          status: conversion.reversed_at ? "cancelled" : conversion.status,
          availableAt: conversion.available_at,
          reversalReason: conversion.reversal_reason,
          approvedAt: conversion.status === "approved" ? conversion.conversion_date : null,
          createdAt: conversion.conversion_date,
        };
      }),
      withdrawals: withdrawals.map((withdrawal) => ({
        withdrawalId: withdrawal.id,
        affiliateId: withdrawal.affiliate_id,
        amount: toNumber(withdrawal.amount),
        fee: toNumber(withdrawal.fee_amount),
        net: toNumber(withdrawal.net_amount ?? withdrawal.amount),
        pixKey: maskPixKey(String(withdrawal.pix_key ?? ""), withdrawal.pix_key_type),
        pixKeyType: withdrawal.pix_key_type,
        status: withdrawal.status === "processed" ? "paid" : withdrawal.status,
        requestedAt: withdrawal.created_at,
        paidAt:
          withdrawal.status === "processed" || withdrawal.status === "paid"
            ? withdrawal.processed_at || withdrawal.created_at
            : null,
        receiptUrl: withdrawal.receipt_url ?? null,
        notes: withdrawal.rejection_reason || withdrawal.notes || null,
      })),
      ledger: ledgerEntries.map((entry) => ({
        entryId: entry.id,
        type: entry.entry_type,
        pendingDelta: toNumber(entry.pending_delta),
        availableDelta: toNumber(entry.available_delta),
        description: entry.description,
        createdAt: entry.created_at,
      })),
      ranking,
    }),
  );
}

/**
 * Monta o top do mes a partir do agregado do banco, carregando apenas os
 * perfis que aparecem no topo.
 */
async function buildRanking(input: {
  rows: MonthlyRankingRow[];
  currentAffiliateRowId: string;
}) {
  const ordered = input.rows;
  const currentIndex = ordered.findIndex(
    (row) => row.affiliateRowId === input.currentAffiliateRowId,
  );
  const currentRank = currentIndex >= 0 ? currentIndex + 1 : null;
  const topIds = ordered.map((row) => row.affiliateRowId);

  if (topIds.length === 0) {
    return { ranking: [], currentRank };
  }

  const { data, error } = await supabaseAdmin
    .from("affiliates")
    .select(
      "id, affiliate_id, level, user:auth_users(username, display_name, avatar, discord_user_id)",
    )
    .in("id", topIds);

  if (error) {
    console.error("[affiliates] falha ao montar ranking:", error);
    return { ranking: [], currentRank };
  }

  const profilesById = new Map((data || []).map((row) => [row.id as string, row]));

  const ranking = ordered
    .map((entry, index) => {
      const row = profilesById.get(entry.affiliateRowId);
      if (!row) return null;

      const userInfo = pickRankingUser(row.user as RankingUser | RankingUser[] | null);

      return {
        rank: index + 1,
        affiliateId: row.affiliate_id as string,
        displayName:
          userInfo?.display_name ||
          userInfo?.username ||
          `Afiliado ${String(row.affiliate_id || "").slice(-4)}`,
        avatarUrl: buildDiscordAvatarUrl(userInfo),
        level: ((row.level as AffiliateLevel) || "bronze") as AffiliateLevel,
        salesThisMonth: entry.salesCount,
        commissionThisMonth: entry.commissionTotal,
        // Vem da tabela unica de bonus, nao repetido a mao como na v1.
        bonusPct: index < 3 ? RANK_BONUS[(index + 1) as 1 | 2 | 3].bonusPct : 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return { ranking, currentRank };
}
