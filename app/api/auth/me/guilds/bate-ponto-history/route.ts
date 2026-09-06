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
  displayName?: string;
  mentionLabel?: string;
  avatarUrl?: string | null;
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

const HISTORY_CACHE_TTL_MS = 15_000;

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

    const access = await ensureDashboardModuleAccess(
      guildId,
      "server_manage_bate_ponto_history",
    );
    if (!access.ok) return applyNoStoreHeaders(access.response);

    const cacheKey = `bate-ponto-history:${guildId}:${userId}:${limit}:${offset}`;
    const cached = readPanelResponseCache<{
      ok: true;
      events: BatePontoHistoryEvent[];
      limit: number;
      offset: number;
    }>(cacheKey);
    if (cached) {
      return applyNoStoreHeaders(NextResponse.json(cached));
    }

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
    const profileMap = await enrichBatePontoMemberProfiles(
      guildId,
      events.map((event) => event.userId),
    );
    const payload = {
      ok: true as const,
      events: events.map((event) =>
        attachBatePontoMemberProfile(event, profileMap),
      ),
      limit,
      offset,
    };
    writePanelResponseCache(cacheKey, payload, HISTORY_CACHE_TTL_MS);

    return applyNoStoreHeaders(NextResponse.json(payload));
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
