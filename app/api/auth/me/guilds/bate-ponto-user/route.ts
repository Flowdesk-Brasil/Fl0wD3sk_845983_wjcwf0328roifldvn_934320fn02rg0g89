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
import { enrichBatePontoMemberProfiles } from "@/lib/servers/batePontoMemberSummaries";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

type SessionRow = {
  id: number;
  status: string;
  started_at: string;
  ended_at: string | null;
  worked_seconds: number | null;
  break_seconds: number | null;
  last_action_at: string;
};

type EventRow = {
  id: number;
  session_id: number | null;
  action: string;
  worked_seconds: number | null;
  break_seconds: number | null;
  hour_bank_delta_seconds: number | null;
  note: string | null;
  created_at: string;
};

async function ensureGuildAccess(
  guildId: string,
  requiredPermissions: TeamRolePermission[],
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
    dashboardPerms instanceof Set &&
    requiredPermissions.some((permission) => dashboardPerms.has(permission));
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

function normalizeSession(row: SessionRow) {
  return {
    id: Number(row.id),
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    workedSeconds: Number(row.worked_seconds || 0),
    breakSeconds: Number(row.break_seconds || 0),
    lastActionAt: row.last_action_at,
  };
}

function normalizeEvent(row: EventRow) {
  return {
    id: Number(row.id),
    sessionId: row.session_id === null ? null : Number(row.session_id),
    action: row.action,
    workedSeconds: Number(row.worked_seconds || 0),
    breakSeconds: Number(row.break_seconds || 0),
    hourBankDeltaSeconds: Number(row.hour_bank_delta_seconds || 0),
    note: row.note,
    createdAt: row.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const guildId = (url.searchParams.get("guildId") || "").trim();
    const userId = (url.searchParams.get("userId") || "").trim();
    const periodDays = Math.max(
      1,
      Math.min(365, Number(url.searchParams.get("periodDays") || 30) || 30),
    );

    if (!isGuildId(guildId) || !isGuildId(userId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID ou usuario invalido." },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(guildId, [
      "server_manage_bate_ponto_ranking",
      "server_manage_bate_ponto_history",
    ]);
    if (!access.ok) return access.response;

    const since = new Date(
      Date.now() - periodDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const supabase = getSupabaseAdminClientOrThrow();

    const [
      profileMap,
      hourBankResult,
      activeSessionResult,
      sessionsResult,
      eventsResult,
    ] = await Promise.all([
      enrichBatePontoMemberProfiles(guildId, [userId]),
      supabase
        .from("guild_bate_ponto_hour_bank")
        .select("balance_seconds")
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("guild_bate_ponto_sessions")
        .select(
          "id, status, started_at, ended_at, worked_seconds, break_seconds, last_action_at",
        )
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .in("status", ["active", "on_break"])
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("guild_bate_ponto_sessions")
        .select(
          "id, status, started_at, ended_at, worked_seconds, break_seconds, last_action_at",
        )
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .gte("started_at", since)
        .order("started_at", { ascending: false })
        .limit(30),
      supabase
        .from("guild_bate_ponto_events")
        .select(
          "id, session_id, action, worked_seconds, break_seconds, hour_bank_delta_seconds, note, created_at",
        )
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (hourBankResult.error) throw new Error(hourBankResult.error.message);
    if (activeSessionResult.error) {
      throw new Error(activeSessionResult.error.message);
    }
    if (sessionsResult.error) throw new Error(sessionsResult.error.message);
    if (eventsResult.error) throw new Error(eventsResult.error.message);

    const sessions = ((sessionsResult.data || []) as SessionRow[]).map(normalizeSession);
    const events = ((eventsResult.data || []) as EventRow[]).map(normalizeEvent);
    const totalWorkedSeconds = sessions.reduce(
      (total, session) => total + session.workedSeconds,
      0,
    );

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        periodDays,
        user: profileMap[userId] || {
          userId,
          displayName: userId,
          mentionLabel: `@${userId}`,
          avatarUrl: null,
        },
        summary: {
          totalWorkedSeconds,
          sessionCount: sessions.length,
          hourBankSeconds: Number(hourBankResult.data?.balance_seconds || 0),
          activeSession: activeSessionResult.data
            ? normalizeSession(activeSessionResult.data as SessionRow)
            : null,
        },
        sessions,
        events,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao carregar detalhes do usuario.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
