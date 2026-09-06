import { NextResponse } from "next/server";
import {
  assertUserAdminInGuildOrNull,
  isGuildId,
  resolveSessionAccessToken,
} from "@/lib/auth/discordGuildAccess";
import {
  getEffectiveDashboardPermissions,
  type TeamRolePermission,
} from "@/lib/teams/userTeams";
import { sanitizeErrorMessage } from "@/lib/security/errors";
import { applyNoStoreHeaders } from "@/lib/security/http";
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

async function ensureGuildAccess(
  guildId: string,
  requiredPermission: TeamRolePermission,
) {
  const sessionData = await resolveSessionAccessToken();
  if (!sessionData?.authSession) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Nao autenticado." },
        { status: 401 },
      ),
    };
  }

  if (!sessionData.accessToken) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { ok: false, message: "Token OAuth ausente na sessao." },
        { status: 401 },
      ),
    };
  }

  const { permissions: dashboardPerms, isTeamServer } =
    await getEffectiveDashboardPermissions({
      authUserId: sessionData.authSession.user.id,
      guildId,
    });

  const accessibleGuild = await assertUserAdminInGuildOrNull(
    {
      authSession: sessionData.authSession,
      accessToken: sessionData.accessToken,
    },
    guildId,
  );

  const hasFullAccess = dashboardPerms === "full";
  const hasSpecificPerm =
    dashboardPerms instanceof Set && dashboardPerms.has(requiredPermission);
  const canManage =
    hasFullAccess || hasSpecificPerm || (!isTeamServer && accessibleGuild);

  if (!canManage) {
    return {
      ok: false as const,
      response: NextResponse.json(
        {
          ok: false,
          message: "Voce nao possui permissao para gerenciar este modulo.",
        },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const };
}

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

    const access = await ensureGuildAccess(
      guildId,
      "server_manage_bate_ponto_ranking",
    );
    if (!access.ok) return access.response;

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
    const enrichedRanking = ranking.map((entry) =>
      attachBatePontoMemberProfile(entry, profileMap),
    );

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        periodDays,
        ranking: enrichedRanking,
      }),
    );
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
