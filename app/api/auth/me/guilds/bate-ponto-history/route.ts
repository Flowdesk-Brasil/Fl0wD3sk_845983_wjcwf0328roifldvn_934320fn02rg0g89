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
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";

const BATE_PONTO_HISTORY_SELECT =
  "id, guild_id, user_id, session_id, action, worked_seconds, break_seconds, hour_bank_delta_seconds, note, created_at, session:guild_bate_ponto_sessions(id, status, started_at, ended_at, worked_seconds, break_seconds)";

type BatePontoHistoryEvent = {
  id: number;
  guildId: string;
  userId: string;
  sessionId: number | null;
  action: string;
  workedSeconds: number;
  breakSeconds: number;
  hourBankDeltaSeconds: number;
  note: string | null;
  createdAt: string;
  session: {
    id: number;
    status: string;
    startedAt: string;
    endedAt: string | null;
    workedSeconds: number;
    breakSeconds: number;
  } | null;
};

function isMissingBatePontoTableError(error: {
  code?: string | null;
  message?: string | null;
}) {
  const code = typeof error.code === "string" ? error.code : "";
  const message = String(error.message || "").toLowerCase();
  return (
    code === "42P01" ||
    message.includes("guild_bate_ponto_events") ||
    message.includes("guild_bate_ponto_sessions")
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

function normalizeHistoryRow(row: Record<string, unknown>): BatePontoHistoryEvent {
  const sessionValue = row.session;
  const sessionRecord =
    sessionValue && typeof sessionValue === "object"
      ? (sessionValue as Record<string, unknown>)
      : null;

  return {
    id: Number(row.id || 0),
    guildId: typeof row.guild_id === "string" ? row.guild_id : "",
    userId: typeof row.user_id === "string" ? row.user_id : "",
    sessionId:
      row.session_id === null || row.session_id === undefined
        ? null
        : Number(row.session_id),
    action: typeof row.action === "string" ? row.action : "",
    workedSeconds: Number(row.worked_seconds || 0),
    breakSeconds: Number(row.break_seconds || 0),
    hourBankDeltaSeconds: Number(row.hour_bank_delta_seconds || 0),
    note: typeof row.note === "string" ? row.note : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    session: sessionRecord
      ? {
          id: Number(sessionRecord.id || 0),
          status: typeof sessionRecord.status === "string" ? sessionRecord.status : "",
          startedAt:
            typeof sessionRecord.started_at === "string"
              ? sessionRecord.started_at
              : "",
          endedAt:
            typeof sessionRecord.ended_at === "string"
              ? sessionRecord.ended_at
              : null,
          workedSeconds: Number(sessionRecord.worked_seconds || 0),
          breakSeconds: Number(sessionRecord.break_seconds || 0),
        }
      : null,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const guildId = (url.searchParams.get("guildId") || "").trim();
    const userId = (url.searchParams.get("userId") || "").trim();
    const limit = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get("limit") || 50) || 50),
    );
    const offset = Math.max(0, Number(url.searchParams.get("offset") || 0) || 0);

    if (!isGuildId(guildId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "Guild ID invalido." },
          { status: 400 },
        ),
      );
    }

    if (userId && !isGuildId(userId)) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { ok: false, message: "User ID invalido." },
          { status: 400 },
        ),
      );
    }

    const access = await ensureGuildAccess(
      guildId,
      "server_manage_bate_ponto_history",
    );
    if (!access.ok) return access.response;

    const supabase = getSupabaseAdminClientOrThrow();
    let query = supabase
      .from("guild_bate_ponto_events")
      .select(BATE_PONTO_HISTORY_SELECT)
      .eq("guild_id", guildId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) {
      query = query.eq("user_id", userId);
    }

    const result = await query;

    if (result.error) {
      if (isMissingBatePontoTableError(result.error)) {
        return applyNoStoreHeaders(
          NextResponse.json({
            ok: true,
            events: [] as BatePontoHistoryEvent[],
            limit,
            offset,
          }),
        );
      }
      throw new Error(result.error.message);
    }

    const events = (result.data || []).map((row) =>
      normalizeHistoryRow(row as Record<string, unknown>),
    );

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        events,
        limit,
        offset,
      }),
    );
  } catch (error) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: false,
          message: sanitizeErrorMessage(
            error,
            "Erro ao carregar historico de bate ponto.",
          ),
        },
        { status: 500 },
      ),
    );
  }
}
