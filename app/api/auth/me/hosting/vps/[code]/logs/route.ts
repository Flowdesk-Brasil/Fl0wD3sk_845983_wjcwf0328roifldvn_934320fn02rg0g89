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
  let daemonLogs: any[] = [];
  try {
    const { requestVpsAgent } = await import("@/lib/hosting/vpsRuntime");
    const logsPayload = await requestVpsAgent({
      project: loaded.project,
      path: `/v1/vps/${loaded.project.vps_code}/logs?lines=500`,
      method: "GET",
      timeoutMs: 3000
    }).catch(() => null) as Record<string, any> | null;
    
    if (logsPayload?.logs && typeof logsPayload.logs === 'string') {
      const rawLines = logsPayload.logs.split('\n');
      const junkPatterns = [
        "realtimeService",
        "Subscription TIMED_OUT",
        "synced 1/1 mensagens",
        "MaxListenersExceededWarning",
      ];
      
      let lastMessage = "";
      for (let i = 0; i < rawLines.length; i++) {
        const line = rawLines[i].trim();
        if (!line || line === "[STDERR]") continue;
        
        if (junkPatterns.some(p => line.includes(p))) continue;
        
        const cleanMsg = line.replace(/^\d+\|[^|]+\|\s*/, '').trim();
        if (cleanMsg === lastMessage && cleanMsg.length > 5) continue;
        lastMessage = cleanMsg;

        const isError = cleanMsg.toLowerCase().includes('error') || cleanMsg.toLowerCase().includes('exception') || cleanMsg.toLowerCase().includes('falha');
        daemonLogs.push({
          id: i,
          level: isError ? 'error' : 'info',
          source: 'bot',
          message: cleanMsg,
        });
      }
      daemonLogs = daemonLogs.slice(-200); // Last 200 logs
    }
  } catch(e) {}

  const allLogs = [...(data || []), ...daemonLogs];

  const logs = allLogs.filter((log) =>
    search ? String(log.message || "").toLowerCase().includes(search) : true,
  );
  return applyNoStoreHeaders(NextResponse.json({ ok: true, logs: logs.reverse() }));
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
