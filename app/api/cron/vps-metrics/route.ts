import { NextResponse } from "next/server";
import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import { requestVpsAgent } from "@/lib/hosting/vpsRuntime";

export const maxDuration = 300;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET || "";
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdminClientOrThrow();

  try {
    // Buscar projetos ativos
    const { data: projects, error } = await supabase
      .from("hosting_projects")
      .select("id, vps_code, status")
      .eq("status", "active");

    if (error) throw error;
    if (!projects?.length) return NextResponse.json({ ok: true, count: 0 });

    let successCount = 0;

    // Fazer a coleta de métricas em lotes ou paralelamente.
    // Como podem haver muitos projetos, faremos paralelamente com Promise.allSettled
    const results = await Promise.allSettled(
      projects.map(async (project) => {
        const daemonPayload = await requestVpsAgent({
          project: project as any,
          path: `/v1/vps/${project.vps_code}/metrics`,
          method: "GET",
          timeoutMs: 5000,
        }).catch(() => null) as any;

        if (daemonPayload?.metric) {
          const metric = daemonPayload.metric;
          const sampledAt = new Date().toISOString();
          
          const numericMetric = (val: any, fallback = 0) => {
            if (typeof val === "number" && Number.isFinite(val)) return val;
            if (typeof val === "string") {
              const parsed = Number(val);
              return Number.isFinite(parsed) ? parsed : fallback;
            }
            return fallback;
          };

          const ram_mb = numericMetric(metric.memory) / (1024 * 1024);

          await supabase.from("hosting_vps_metrics").insert({
            hosting_project_id: project.id,
            cpu_percent: numericMetric(metric.cpu_percent ?? metric.cpu),
            ram_percent: numericMetric(metric.ram_percent),
            disk_percent: numericMetric(metric.disk_percent),
            network_rx_kbps: numericMetric(metric.network_rx_kbps),
            network_tx_kbps: numericMetric(metric.network_tx_kbps),
            process_count: numericMetric(metric.process_count),
            uptime_seconds: numericMetric(metric.uptime_seconds),
            temperature_c: typeof metric.temperature_c === "number" ? metric.temperature_c : null,
            app_cpu_percent: numericMetric(metric.app_cpu_percent ?? metric.cpu),
            app_ram_mb: numericMetric(metric.app_ram_mb, ram_mb),
            payload: { source: "cron", raw: metric },
            sampled_at: sampledAt,
          });
          
          successCount++;
        }
      })
    );

    return NextResponse.json({
      ok: true,
      total: projects.length,
      successCount,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Erro no cron" },
      { status: 500 }
    );
  }
}
