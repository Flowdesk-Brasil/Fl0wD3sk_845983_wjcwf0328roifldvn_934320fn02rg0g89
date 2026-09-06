import { NextResponse } from "next/server";
import { isGuildId } from "@/lib/auth/discordGuildAccess";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { applyNoStoreHeaders } from "@/lib/security/http";
import { ensureDashboardModuleAccess } from "@/lib/servers/dashboardModuleAccess";
import {
  readPanelResponseCache,
  writePanelResponseCache,
} from "@/lib/servers/panelResponseCache";
import {
  attachBatePontoMemberProfile,
  enrichBatePontoMemberProfiles,
} from "@/lib/servers/batePontoMemberSummaries";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type SessionRow = {
  user_id: string;
  worked_seconds: number | null;
  status: string;
};

type HourBankRow = {
  user_id: string;
  balance_seconds: number | null;
};

type RankingEntry = {
  userId: string;
  totalWorkedSeconds: number;
  sessionCount: number;
  hourBankSeconds: number;
  rank: number;
  displayName?: string;
  mentionLabel?: string;
  avatarUrl?: string | null;
};

function isMissingBatePontoTableError(error: {
  code?: string | null;
  message?: string | null;
}) {
  const code = typeof error.code === "string" ? error.code : "";
  const message = String(error.message || "").toLowerCase();
  return (
    code === "42P01" ||
    message.includes("guild_bate_ponto_sessions") ||
    message.includes("guild_bate_ponto_hour_bank")
  );
}

const RANKING_CACHE_TTL_MS = 20_000;

function buildRankingEntries(
  sessions: SessionRow[],
  hourBankByUser: Map<string, number>,
): RankingEntry[] {
  const totalsByUser = new Map<string, { totalWorkedSeconds: number; sessionCount: number }>();

  for (const row of sessions) {
    const current = totalsByUser.get(row.user_id) || {
      totalWorkedSeconds: 0,
      sessionCount: 0,
    };
    current.totalWorkedSeconds += Number(row.worked_seconds || 0);
    current.sessionCount += 1;
    totalsByUser.set(row.user_id, current);
  }

  return [...totalsByUser.entries()]
    .map(([userId, totals]) => ({
      userId,
      totalWorkedSeconds: totals.totalWorkedSeconds,
      sessionCount: totals.sessionCount,
      hourBankSeconds: hourBankByUser.get(userId) || 0,
      rank: 0,
    }))
    .sort((a, b) => {
      if (b.totalWorkedSeconds !== a.totalWorkedSeconds) {
        return b.totalWorkedSeconds - a.totalWorkedSeconds;
      }
      return a.userId.localeCompare(b.userId);
    })
    .map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const guildId = (url.searchParams.get("guildId") || "").trim();
    const periodDays = Math.max(
      1,
      Math.min(365, Number(url.searchParams.get("periodDays") || 30) || 30),
    );

    if (!isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID invalido." },
          { status: 400 },
        ),
      );
    }

    const access = await ensureDashboardModuleAccess(
      guildId,
      "server_manage_bate_ponto_ranking",
    );
    if (!access.ok) return applyNoStoreHeaders(access.response);

    const cacheKey = `bate-ponto-ranking:${guildId}:${periodDays}`;
    const cached = readPanelResponseCache<{
      ok: true;
      periodDays: number;
      ranking: RankingEntry[];
    }>(cacheKey);
    if (cached) {
      return applyNoStoreHeaders(NextResponse.json(cached));
    }

    const since = new Date(
      Date.now() - periodDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const supabase = getSupabaseAdminClientOrThrow();

    const [finishedResult, openResult, hourBankResult] = await Promise.all([
      supabase
        .from("guild_bate_ponto_sessions")
        .select("user_id, worked_seconds, status")
        .eq("guild_id", guildId)
        .eq("status", "finished")
        .gte("ended_at", since),
      supabase
        .from("guild_bate_ponto_sessions")
        .select("user_id, worked_seconds, status")
        .eq("guild_id", guildId)
        .in("status", ["active", "on_break"])
        .gte("started_at", since),
      supabase
        .from("guild_bate_ponto_hour_bank")
        .select("user_id, balance_seconds")
        .eq("guild_id", guildId),
    ]);

    for (const result of [finishedResult, openResult, hourBankResult]) {
      if (result.error && !isMissingBatePontoTableError(result.error)) {
        throw new Error(result.error.message);
      }
    }

    const sessions = [
      ...((finishedResult.data || []) as SessionRow[]),
      ...((openResult.data || []) as SessionRow[]),
    ];

    const hourBankByUser = new Map<string, number>();
    for (const row of (hourBankResult.data || []) as HourBankRow[]) {
      hourBankByUser.set(row.user_id, Number(row.balance_seconds || 0));
    }

    const ranking = buildRankingEntries(sessions, hourBankByUser);
    const profileMap = await enrichBatePontoMemberProfiles(
      guildId,
      ranking.slice(0, 50).map((entry) => entry.userId),
    );
    const payload = {
      ok: true as const,
      periodDays,
      ranking: ranking.map((entry) =>
        attachBatePontoMemberProfile(entry, profileMap),
      ),
    };
    writePanelResponseCache(cacheKey, payload, RANKING_CACHE_TTL_MS);

    return applyNoStoreHeaders(NextResponse.json(payload));
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao carregar ranking de bate ponto.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
