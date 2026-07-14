import { NextRequest, NextResponse } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  normalizeVpsCode,
} from "@/lib/hosting/vpsRuntime";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { applyNoStoreHeaders } from "@/lib/security/http";

type RouteProps = {
  params: Promise<{ code: string }>;
};

type DaemonLog = {
  id?: number;
  level?: "debug" | "info" | "warn" | "error" | "success";
  source?: string;
  message?: string;
  emitted_at?: string;
};

type DaemonLogsResponse = {
  ok?: boolean;
  logs?: unknown;
  message?: unknown;
};

type ParsedDaemonLog = {
  level: "error" | "info";
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  emitted_at: string;
};

function daemonLogFingerprint(message: string, source = "daemon") {
  let hash = 0;
  for (let i = 0; i < message.length; i++) {
    hash = (Math.imul(31, hash) + message.charCodeAt(i)) | 0;
  }
  return `${source}:${Math.abs(hash).toString(36)}`;
}

function parseMinecraftLogTimestamp(message: string, fallback: string) {
  const full = message.match(/^\[(\d{2})([A-Za-z]{3})(\d{4})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?\]/);
  if (full) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(full[2].toLowerCase());
    if (month >= 0) {
      const date = new Date(Date.UTC(
        Number(full[3]),
        month,
        Number(full[1]),
        Number(full[4]),
        Number(full[5]),
        Number(full[6]),
        Number(String(full[7] || "0").padEnd(3, "0")),
      ));
      if (!Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  const timeOnly = message.match(/^\[(\d{2}):(\d{2}):(\d{2})\]/);
  if (timeOnly) {
    const date = new Date();
    date.setHours(Number(timeOnly[1]), Number(timeOnly[2]), Number(timeOnly[3]), 0);
    return date.toISOString();
  }
  return fallback;
}

function parseDaemonLogs(rawLogs: unknown, source = "bot"): ParsedDaemonLog[] {
  if (typeof rawLogs !== "string") return [];
  const rawLines = rawLogs.split("\n");
  const junkPatterns = [
    "realtimeService",
    "Subscription TIMED_OUT",
    "synced 1/1 mensagens",
    "MaxListenersExceededWarning",
  ];
  let lastMessage = "";

  return rawLines
    .map((rawLine, index): ParsedDaemonLog | null => {
      const line = rawLine.trim();
      if (!line || line === "[STDERR]") return null;
      if (junkPatterns.some((pattern) => line.includes(pattern))) return null;
      const cleanMsg = line.replace(/^\d+\|[^|]+\|\s*/, "").trim();
      if (!cleanMsg || (cleanMsg === lastMessage && cleanMsg.length > 5)) return null;
      lastMessage = cleanMsg;
      const isError = cleanMsg.toLowerCase().includes("error") ||
        cleanMsg.toLowerCase().includes("exception") ||
        cleanMsg.toLowerCase().includes("falha");
      return {
        level: isError ? "error" as const : "info" as const,
        source,
        message: cleanMsg,
        metadata: {
          source,
          fingerprint: daemonLogFingerprint(cleanMsg, source),
          lineIndex: index,
        },
        emitted_at: source === "minecraft"
          ? parseMinecraftLogTimestamp(cleanMsg, new Date(Date.now() - (rawLines.length - index) * 1000).toISOString())
          : new Date(Date.now() - (rawLines.length - index) * 1000).toISOString(),
      };
    })
    .filter((log): log is ParsedDaemonLog => Boolean(log))
    .slice(-500);
}

async function persistDaemonLogs(input: {
  projectId: number;
  logs: ParsedDaemonLog[];
}) {
  if (!input.logs.length) return [];
  const supabase = getSupabaseAdminClientOrThrow();
  const fingerprints = input.logs
    .map((log) => typeof log.metadata.fingerprint === "string" ? log.metadata.fingerprint : null)
    .filter((value): value is string => Boolean(value));
  const { data: existing } = await supabase
    .from("hosting_vps_logs")
    .select("metadata")
    .eq("hosting_project_id", input.projectId)
    .in("source", ["bot", "minecraft"])
    .in("metadata->>fingerprint", fingerprints)
    .limit(1000);
  const existingFingerprints = new Set(
    (existing || [])
      .map((row) => {
        const metadata = row.metadata as Record<string, unknown> | null;
        return typeof metadata?.fingerprint === "string" ? metadata.fingerprint : null;
      })
      .filter(Boolean),
  );
  const rows = input.logs
    .filter((log) => !existingFingerprints.has(String(log.metadata.fingerprint || "")))
    .map((log) => ({
      hosting_project_id: input.projectId,
      level: log.level,
      source: log.source,
      message: log.message,
      metadata: log.metadata,
      emitted_at: log.emitted_at,
    }));
  if (!rows.length) return [];
  const { data } = await supabase
    .from("hosting_vps_logs")
    .insert(rows)
    .select("*");
  return data || [];
}

async function load(code: string) {
  const session = await getCurrentAuthSessionFromCookie();
  const vpsCode = normalizeVpsCode(code);
  if (!session || !vpsCode) {
    return { ok: false as const, status: 401, message: "Login necessario." };
  }
  const project = await getHostingProjectForUser({ userId: session.user.id, vpsCode });
  if (!project) return { ok: false as const, status: 404, message: "VPS nao encontrada." };
  return { ok: true as const, project };
}

export async function GET(request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded.ok) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: loaded.message }, { status: loaded.status }),
    );
  }
  const search = request.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
  const level = request.nextUrl.searchParams.get("level")?.trim().toLowerCase() || "";
  let query = getSupabaseAdminClientOrThrow()
    .from("hosting_vps_logs")
    .select("*")
    .eq("hosting_project_id", loaded.project.id)
    .order("emitted_at", { ascending: false })
    .limit(500);
  if (["debug", "info", "warn", "error", "success"].includes(level)) {
    query = query.eq("level", level);
  }
  const { data, error } = await query;
  if (error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: error.message }, { status: 500 }),
    );
  }

  // Fetch logs directly from the VPS daemon
  let daemonLogs: DaemonLog[] = [];
  const isMinecraft = loaded.project.hosting_kind === "minecraft";
  try {
    const { requestVpsAgent } = await import("@/lib/hosting/vpsRuntime");
    const logsPayload = await requestVpsAgent({
      project: loaded.project,
      path: `/v1/vps/${loaded.project.vps_code}/logs?lines=500${isMinecraft ? "&kind=minecraft" : ""}`,
      method: "GET",
      timeoutMs: 3000
    }).catch(() => null) as DaemonLogsResponse | null;
    
    const parsedLogs = parseDaemonLogs(logsPayload?.logs, isMinecraft ? "minecraft" : "bot");
    if (isMinecraft) {
      daemonLogs = parsedLogs;
    } else if (parsedLogs.length) {
      const insertedLogs = await persistDaemonLogs({
        projectId: loaded.project.id,
        logs: parsedLogs,
      });
      daemonLogs = insertedLogs.length ? insertedLogs : parsedLogs;
    }
  } catch {}

  const supabaseLogs = data ? [...data].reverse() : [];
  const allLogs = isMinecraft ? daemonLogs : [...supabaseLogs, ...daemonLogs];

  const logs = allLogs.filter((log) =>
    search ? String(log.message || "").toLowerCase().includes(search) : true,
  );
  return applyNoStoreHeaders(NextResponse.json({ ok: true, logs }));
}

export async function DELETE(_request: NextRequest, { params }: RouteProps) {
  const { code } = await params;
  const loaded = await load(code);
  if (!loaded.ok) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: loaded.message }, { status: loaded.status }),
    );
  }

  const { error } = await getSupabaseAdminClientOrThrow()
    .from("hosting_vps_logs")
    .delete()
    .eq("hosting_project_id", loaded.project.id);

  if (error) {
    return applyNoStoreHeaders(
      NextResponse.json({ ok: false, message: error.message }, { status: 500 }),
    );
  }

  return applyNoStoreHeaders(NextResponse.json({ ok: true, logs: [] }));
}
