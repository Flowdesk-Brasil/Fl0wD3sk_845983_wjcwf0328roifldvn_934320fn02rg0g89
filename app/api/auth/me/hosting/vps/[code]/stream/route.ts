// Trigger clean HMR rebuild
import { NextRequest } from "next/server";
import { getCurrentAuthSessionFromCookie } from "@/lib/auth/session";
import {
  getHostingProjectForUser,
  normalizeVpsCode,
  resolveRuntimeStatus,
} from "@/lib/hosting/vpsRuntime";
import { resolveRuntimeHealth } from "@/lib/hosting/vpsSettings";
import { resolveHostingRegion } from "@/lib/hosting/catalog";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { sendVpsProvisionedEmailSafe } from "@/lib/mail/transactional";

type RouteProps = {
  params: Promise<{ code: string }>;
};

type StreamLog = {
  id?: number;
  level?: "debug" | "info" | "warn" | "error" | "success";
  source?: string;
  message?: string;
  metadata?: Record<string, unknown> | null;
  emitted_at?: string;
};

type DaemonMetricPayload = {
  cpu?: number | null;
  cpu_percent?: number | null;
  ram_percent?: number | null;
  disk_percent?: number | null;
  network_rx_kbps?: number | null;
  network_tx_kbps?: number | null;
  process_count?: number | null;
  uptime_seconds?: number | null;
  temperature_c?: number | null;
  app_cpu_percent?: number | null;
  app_ram_mb?: number | null;
  memory?: number | null;
};

type DaemonMetricsResponse = {
  ok?: boolean;
  status?: string | null;
  host?: string | null;
  publicIp?: string | null;
  metric?: DaemonMetricPayload | null;
};

type DaemonLogsResponse = {
  ok?: boolean;
  logs?: unknown;
  message?: unknown;
};

type StreamMetricRecord = {
  sampled_at: string;
  cpu_percent?: number | null;
  ram_percent?: number | null;
  app_cpu_percent?: number | null;
  app_ram_mb?: number | null;
  [key: string]: unknown;
};

type PersistableProject = {
  id: number;
  vps_code: string;
};

type ParsedDaemonLog = {
  level: "error" | "info";
  source: string;
  message: string;
  metadata: Record<string, unknown>;
  emitted_at: string;
};

function sse(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function numericMetric(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

function shouldKeepDaemonLog(message: string) {
  const junkPatterns = [
    "realtimeService",
    "Subscription TIMED_OUT",
    "synced 1/1 mensagens",
    "MaxListenersExceededWarning",
  ];
  return Boolean(message.trim()) && !junkPatterns.some((pattern) => message.includes(pattern));
}

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
  let lastMessage = "";
  return rawLines
    .map((rawLine, index): ParsedDaemonLog | null => {
      const line = rawLine.trim();
      if (!line || line === "[STDERR]") return null;
      const cleanMsg = line.replace(/^\d+\|[^|]+\|\s*/, "").trim();
      if (!shouldKeepDaemonLog(cleanMsg)) return null;
      if (cleanMsg === lastMessage && cleanMsg.length > 5) return null;
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
    .slice(-200);
}

async function persistDaemonLogs(input: {
  supabase: ReturnType<typeof getSupabaseAdminClientOrThrow>;
  project: PersistableProject;
  logs: ParsedDaemonLog[];
}) {
  if (!input.logs.length) return [];
  const fingerprints = input.logs
    .map((log) => typeof log.metadata?.fingerprint === "string" ? log.metadata.fingerprint : null)
    .filter((value): value is string => Boolean(value));
  const { data: existing } = await input.supabase
    .from("hosting_vps_logs")
    .select("metadata")
    .eq("hosting_project_id", input.project.id)
    .in("source", ["bot", "minecraft"])
    .in("metadata->>fingerprint", fingerprints)
    .limit(500);
  const existingFingerprints = new Set(
    (existing || [])
      .map((row) => {
        const metadata = row.metadata as Record<string, unknown> | null;
        return typeof metadata?.fingerprint === "string" ? metadata.fingerprint : null;
      })
      .filter(Boolean),
  );
  const rows = input.logs
    .filter((log) => {
      const fingerprint = typeof log.metadata?.fingerprint === "string" ? log.metadata.fingerprint : "";
      return fingerprint && !existingFingerprints.has(fingerprint);
    })
    .map((log) => ({
      hosting_project_id: input.project.id,
      level: log.level,
      source: log.source,
      message: log.message,
      metadata: log.metadata,
      emitted_at: log.emitted_at,
    }));
  if (!rows.length) return [];
  const { data } = await input.supabase
    .from("hosting_vps_logs")
    .insert(rows)
    .select("*");
  return data || [];
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
            .limit(720),
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
        let daemonLogs: StreamLog[] = [];
        const regionLabel =
          resolveHostingRegion(project.hosting_region_id)?.name ||
          "Boston, United States";
        let agentHealth = resolveRuntimeHealth({
          runtimePayload: projectResult.data?.runtime_status_payload,
          regionLabel,
          lastSeenAt: projectResult.data?.runtime_last_seen_at,
        });

        try {
          const { requestVpsAgent } = await import("@/lib/hosting/vpsRuntime");
          
          // Request live runtime state and logs concurrently from daemon. Minecraft
          // projects are not PM2 apps, so their status must come from the Minecraft
          // control-plane endpoint instead of the generic VPS metrics endpoint.
          const metricsStartedAt = Date.now();
          const isMinecraftProject = project.hosting_kind === "minecraft";
          const [daemonPayload, logsPayload] = await Promise.all([
            (isMetricOld || isMinecraftProject) ? requestVpsAgent({
              project,
              path: isMinecraftProject
                ? `/v1/minecraft/servers/${project.vps_code}/status`
                : `/v1/vps/${project.vps_code}/metrics`,
              method: "GET",
              timeoutMs: 3000,
            }).catch(() => null) : null,
            
            requestVpsAgent({
              project,
              path: `/v1/vps/${project.vps_code}/logs?lines=20${project.hosting_kind === "minecraft" ? "&kind=minecraft" : ""}`,
              method: "GET",
              timeoutMs: 3000,
            }).catch(() => null)
          ]) as [DaemonMetricsResponse | null, DaemonLogsResponse | null];

          if (daemonPayload?.metric) {
            const metric = daemonPayload.metric;
            const sampledAt = new Date().toISOString();
            currentMetric = {
              id: Date.now(),
              cpu_percent: numericMetric(metric.cpu_percent ?? metric.cpu),
              ram_percent: numericMetric(metric.ram_percent),
              disk_percent: numericMetric(metric.disk_percent),
              network_rx_kbps: numericMetric(metric.network_rx_kbps),
              network_tx_kbps: numericMetric(metric.network_tx_kbps),
              process_count: numericMetric(metric.process_count),
              uptime_seconds: numericMetric(metric.uptime_seconds),
              temperature_c: typeof metric.temperature_c === "number" ? metric.temperature_c : null,
              app_cpu_percent: numericMetric(metric.app_cpu_percent ?? metric.cpu),
              app_ram_mb: numericMetric(metric.app_ram_mb, numericMetric(metric.memory) / (1024 * 1024)),
              sampled_at: sampledAt,
            };
            await supabase
              .from("hosting_vps_metrics")
              .insert({
                hosting_project_id: project.id,
                cpu_percent: currentMetric.cpu_percent,
                ram_percent: currentMetric.ram_percent,
                disk_percent: currentMetric.disk_percent,
                network_rx_kbps: currentMetric.network_rx_kbps,
                network_tx_kbps: currentMetric.network_tx_kbps,
                process_count: currentMetric.process_count,
                uptime_seconds: currentMetric.uptime_seconds,
                temperature_c: currentMetric.temperature_c,
                app_cpu_percent: currentMetric.app_cpu_percent,
                app_ram_mb: currentMetric.app_ram_mb,
                payload: { source: "agent_stream", raw: metric },
                sampled_at: sampledAt,
              });
          }

          if (daemonPayload) {
            const checkedAt = new Date().toISOString();
            const runtimePayload = {
              ...(projectResult.data?.runtime_status_payload && typeof projectResult.data.runtime_status_payload === "object"
                ? projectResult.data.runtime_status_payload as Record<string, unknown>
                : {}),
              agentHealth: {
                connected: true,
                latencyMs: Date.now() - metricsStartedAt,
                checkedAt,
                regionLabel,
                host: typeof daemonPayload.host === "string" ? daemonPayload.host : null,
                publicIp: typeof daemonPayload.publicIp === "string" ? daemonPayload.publicIp : null,
              },
            };
            agentHealth = resolveRuntimeHealth({
              runtimePayload,
              regionLabel,
              lastSeenAt: checkedAt,
            });
            const runtimeStatus = resolveRuntimeStatus(daemonPayload.status);
            if (runtimeStatus !== "unknown") {
              const nextRuntimePayload = project.hosting_kind === "minecraft"
                ? { ...runtimePayload, minecraft: daemonPayload }
                : runtimePayload;
              await supabase
                .from("hosting_projects")
                .update({
                  runtime_status: runtimeStatus,
                  runtime_status_payload: nextRuntimePayload,
                  runtime_last_seen_at: checkedAt,
                })
                .eq("id", project.id);
              if (projectResult.data) {
                projectResult.data.runtime_status = runtimeStatus;
                projectResult.data.runtime_status_payload = nextRuntimePayload;
                projectResult.data.runtime_last_seen_at = checkedAt;
              }
            }
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
             
             if (projectResult.data) {
               projectResult.data.status = "active";
               projectResult.data.runtime_status = daemonPayload.status;
             }

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

          const parsedDaemonLogs = parseDaemonLogs(
            logsPayload?.logs,
            project.hosting_kind === "minecraft" ? "minecraft" : "bot",
          );
          if (parsedDaemonLogs.length) {
            if (project.hosting_kind === "minecraft") {
              daemonLogs = parsedDaemonLogs;
            } else {
              const insertedLogs = await persistDaemonLogs({
                supabase,
                project: { id: project.id, vps_code: project.vps_code },
                logs: parsedDaemonLogs,
              });
              daemonLogs = insertedLogs.length ? insertedLogs : parsedDaemonLogs;
            }
          }
        } catch {}

        let rawMetrics = (metricsResult.data || []) as StreamMetricRecord[];
        if (currentMetric && isMetricOld) {
           rawMetrics = [currentMetric as StreamMetricRecord, ...rawMetrics];
        }
        const metricsHistory = rawMetrics
          .filter((metric) => Number.isFinite(Date.parse(metric.sampled_at || "")))
          .sort((a, b) => Date.parse(a.sampled_at || "") - Date.parse(b.sampled_at || ""))
          .slice(-720);

        if (closed) return;
        send("snapshot", {
          project: {
            ...projectResult.data,
            runtimeHealth: agentHealth,
          },
          metric: currentMetric,
          metricsHistory,
          logs: project.hosting_kind === "minecraft" ? daemonLogs : [...logs, ...daemonLogs],
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
