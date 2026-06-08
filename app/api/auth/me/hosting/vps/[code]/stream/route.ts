import { NextRequest } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  normalizeVpsCode,
} from "@/lib/hosting/vpsRuntime";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { sendVpsProvisionedEmailSafe } from "@/lib/mail/transactional";

type RouteProps = {
  params: Promise<{ code: string }>;
};

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function GET(_request: NextRequest, { params }: RouteProps) {
  const session = await getCurrentAuthSessionFromCookie();
  const { code } = await params;
  const vpsCode = normalizeVpsCode(code);
  if (!session || !vpsCode) {
    return new Response(sse("error", { message: "Nao autorizado." }), {
      status: 401,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  }

  const project = await getHostingProjectForUser({
    userId: session.user.id,
    vpsCode,
  });
  if (!project) {
    return new Response(sse("error", { message: "VPS nao encontrada." }), {
      status: 404,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
      },
    });
  }

  let closed = false;
  let interval: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let lastLogId = 0;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sse(event, data)));
        } catch {
          closed = true;
          if (interval) clearInterval(interval);
        }
      };

      const tick = async () => {
        if (closed) return;
        const supabase = getSupabaseAdminClientOrThrow();
        const [projectResult, metricsResult, logsResult, actionsResult] = await Promise.all([
          supabase
            .from("hosting_projects")
            .select("runtime_status, runtime_status_payload, runtime_last_seen_at, status, updated_at")
            .eq("id", project.id)
            .maybeSingle(),
          supabase
            .from("hosting_vps_metrics")
            .select("*")
            .eq("hosting_project_id", project.id)
            .order("sampled_at", { ascending: false })
            .limit(1),
          supabase
            .from("hosting_vps_logs")
            .select("*")
            .eq("hosting_project_id", project.id)
            .gt("id", lastLogId)
            .order("id", { ascending: true })
            .limit(50),
          supabase
            .from("hosting_vps_action_events")
            .select("*")
            .eq("hosting_project_id", project.id)
            .order("created_at", { ascending: false })
            .limit(8),
        ]);

        const logs = logsResult.data || [];
        if (logs.length) {
          lastLogId = Math.max(...logs.map((log) => Number(log.id) || 0));
        }

        let currentMetric = metricsResult.data?.[0] || null;
        const isMetricOld = !currentMetric || (Date.now() - new Date(currentMetric.sampled_at).getTime()) > 15000 || project.status === "provisioning" || project.status === "pending_provision";
        let daemonLogs: any[] = [];

        try {
          const { requestVpsAgent } = await import("@/lib/hosting/vpsRuntime");
          
          // Request metrics and logs concurrently from daemon
          const [daemonPayload, logsPayload] = await Promise.all([
            isMetricOld ? requestVpsAgent({
              project, path: `/v1/vps/${project.vps_code}/metrics`, method: "GET", timeoutMs: 3000
            }).catch(() => null) : null,
            
            requestVpsAgent({
              project, path: `/v1/vps/${project.vps_code}/logs?lines=20`, method: "GET", timeoutMs: 3000
            }).catch(() => null)
          ]) as [Record<string, any> | null, Record<string, any> | null];
          
          if (daemonPayload?.metric) {
            currentMetric = {
               id: Date.now(),
               cpu_percent: daemonPayload.metric.cpu || 0, // Máquina
               app_cpu_percent: daemonPayload.metric.cpu || 0, // App
               ram_percent: (daemonPayload.metric.memory || 0) / (1024 * 1024 * 1024), // Approx % para uso total 
               app_ram_mb: (daemonPayload.metric.memory || 0) / (1024 * 1024), // Em MB para o painel
               sampled_at: new Date().toISOString()
            };
          }

          // Auto-heal status if daemon responds and project is stuck in provisioning
          if (
             daemonPayload &&
             daemonPayload.status && 
             daemonPayload.status !== "unknown" &&
             daemonPayload.metric &&
             (project.status === "provisioning" || project.status === "pending_provision")
          ) {
             const { data: updatedRows } = await supabase
               .from("hosting_projects")
               .update({ status: "active", runtime_status: daemonPayload.status })
               .eq("id", project.id)
               .in("status", ["provisioning", "pending_provision"])
               .select("id");
             
             projectResult.data.status = "active";
             projectResult.data.runtime_status = daemonPayload.status;

             if (updatedRows && updatedRows.length > 0) {
               void sendVpsProvisionedEmailSafe({
                 userId: project.user_id,
                 vpsCode: project.vps_code,
                 repoName: project.github_repo || "Seu projeto",
                 planName: "Hospedagem Flowdesk",
                 dashboardUrl: `https://www.flwdesk.com/vps/${project.vps_code}`,
               });
             }
          }

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
              if (cleanMsg === lastMessage && cleanMsg.length > 5) continue; // Deduplicate
              lastMessage = cleanMsg;

              const isError = cleanMsg.toLowerCase().includes('error') || cleanMsg.toLowerCase().includes('exception') || cleanMsg.toLowerCase().includes('falha');
              daemonLogs.push({
                id: i, // Fake ID based on PM2 absolute file position/chunk index
                level: isError ? 'error' : 'info',
                source: 'bot',
                message: cleanMsg,
              });
            }
            daemonLogs = daemonLogs.slice(-100); // Keep UI fast, last 100 useful logs
          }
        } catch(e) {}

        if (closed) return;
        send("snapshot", {
          project: projectResult.data,
          metric: currentMetric,
          logs: [...logs, ...daemonLogs],
          actions: actionsResult.data || [],
          at: new Date().toISOString(),
        });
      };

      await tick().catch((error) => send("error", { message: String(error) }));
      interval = setInterval(() => {
        void tick().catch((error) => send("error", { message: String(error) }));
      }, 1500);
    },
    cancel() {
      closed = true;
      if (interval) clearInterval(interval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
