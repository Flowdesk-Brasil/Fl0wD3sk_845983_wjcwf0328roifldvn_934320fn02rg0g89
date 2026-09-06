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
    monthConversionsResult,
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
    supabaseAdmin
      .from("affiliate_settings")
      .select("*")
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
    // Base do ranking: so as conversoes aprovadas do mes, de todos os afiliados.
    supabaseAdmin
      .from("affiliate_conversions")
      .select("affiliate_id, commission_amount")
      .eq("status", "approved")
      .is("reversed_at", null)
      .gte("conversion_date", monthStartIso),
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
    monthRows: monthConversionsResult.data || [],
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
      settings: settingsResult.data || null,
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
        pixKey: withdrawal.pix_key,
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
 * Monta o top do mes agregando as conversoes e carregando so os perfis do topo,
 * em vez de trazer a base inteira de afiliados.
 */
async function buildRanking(input: {
  monthRows: Array<{ affiliate_id: string; commission_amount: number | string | null }>;
  currentAffiliateRowId: string;
}) {
  const totals = new Map<string, { sales: number; commission: number }>();

  for (const row of input.monthRows) {
    const key = String(row.affiliate_id || "").trim();
    if (!key) continue;

    const current = totals.get(key) || { sales: 0, commission: 0 };
    current.sales += 1;
    current.commission += toNumber(row.commission_amount);
    totals.set(key, current);
  }

  const ordered = [...totals.entries()].sort(
    (left, right) =>
      right[1].commission - left[1].commission ||
      right[1].sales - left[1].sales ||
      left[0].localeCompare(right[0]),
  );

  const currentIndex = ordered.findIndex(([key]) => key === input.currentAffiliateRowId);
  const currentRank = currentIndex >= 0 ? currentIndex + 1 : null;

  const topIds = ordered.slice(0, RANKING_SIZE).map(([key]) => key);

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

  const ranking = topIds
    .map((id, index) => {
      const row = profilesById.get(id);
      if (!row) return null;

      const userInfo = pickRankingUser(row.user as RankingUser | RankingUser[] | null);
      const metrics = totals.get(id) || { sales: 0, commission: 0 };

      return {
        rank: index + 1,
        affiliateId: row.affiliate_id as string,
        displayName:
          userInfo?.display_name ||
          userInfo?.username ||
          `Afiliado ${String(row.affiliate_id || "").slice(-4)}`,
        avatarUrl: buildDiscordAvatarUrl(userInfo),
        level: ((row.level as AffiliateLevel) || "bronze") as AffiliateLevel,
        salesThisMonth: metrics.sales,
        commissionThisMonth: metrics.commission,
        // Vem da tabela unica de bonus, nao repetido a mao como na v1.
        bonusPct: index < 3 ? RANK_BONUS[(index + 1) as 1 | 2 | 3].bonusPct : 0,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return { ranking, currentRank };
}
