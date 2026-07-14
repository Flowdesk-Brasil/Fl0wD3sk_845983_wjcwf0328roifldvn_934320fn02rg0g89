"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";

type VpsMetric = {
  sampled_at?: string | null;
  cpu_percent?: number | null;
  ram_percent?: number | null;
  disk_percent?: number | null;
  app_cpu_percent?: number | null;
};

const METRICS_WINDOW_HOURS = 24;
const METRICS_BUCKET_MS = 60 * 60 * 1000;

function metricValue(metric: VpsMetric | null, key: keyof VpsMetric) {
  const value = metric?.[key];
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatMetricTime(value?: string | null, options?: { seconds?: boolean }) {
  if (!value) return "--:--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(options?.seconds ? { second: "2-digit" } : {}),
  }).format(date);
}

function buildHourlyMetrics(metrics: VpsMetric[]) {
  const now = Date.now();
  const currentHour = Math.floor(now / METRICS_BUCKET_MS) * METRICS_BUCKET_MS;
  const sortedMetrics = [...metrics]
    .filter((metric) => {
      const sampledAt = Date.parse(metric.sampled_at || "");
      return Number.isFinite(sampledAt);
    })
    .sort((a, b) => Date.parse(a.sampled_at || "") - Date.parse(b.sampled_at || ""));

  let lastKnown: VpsMetric | null = sortedMetrics[0] || null;

  return Array.from({ length: METRICS_WINDOW_HOURS }, (_, index) => {
    const bucketStart = currentHour - (METRICS_WINDOW_HOURS - 1 - index) * METRICS_BUCKET_MS;
    const bucketEnd = bucketStart + METRICS_BUCKET_MS;
    const bucketMetrics = sortedMetrics.filter((metric) => {
      const sampledAt = Date.parse(metric.sampled_at || "");
      return sampledAt >= bucketStart && sampledAt < bucketEnd;
    });

    const sample = bucketMetrics.length
      ? {
        sampled_at: new Date(bucketStart).toISOString(),
        cpu_percent: bucketMetrics.reduce((sum, metric) => sum + metricValue(metric, "cpu_percent"), 0) / bucketMetrics.length,
        ram_percent: bucketMetrics.reduce((sum, metric) => sum + metricValue(metric, "ram_percent"), 0) / bucketMetrics.length,
        disk_percent: bucketMetrics.reduce((sum, metric) => sum + metricValue(metric, "disk_percent"), 0) / bucketMetrics.length,
        app_cpu_percent: bucketMetrics.reduce((sum, metric) => sum + metricValue(metric, "app_cpu_percent"), 0) / bucketMetrics.length,
      }
      : lastKnown
        ? { ...lastKnown, sampled_at: new Date(bucketStart).toISOString() }
        : { sampled_at: new Date(bucketStart).toISOString() };

    if (bucketMetrics.length) lastKnown = bucketMetrics[bucketMetrics.length - 1] || lastKnown;

    return sample;
  });
}

export function VpsMetricsChart({
  metrics,
  variant = "full",
  className = "h-full",
}: {
  metrics: VpsMetric[];
  variant?: "compact" | "full";
  className?: string;
}) {
  const data = buildHourlyMetrics(metrics).map((item, index) => ({
    index,
    time: item.sampled_at,
    CPU: metricValue(item, "cpu_percent"),
    RAM: metricValue(item, "ram_percent"),
    Disco: metricValue(item, "disk_percent"),
    ...(variant === "full" ? { AppCPU: metricValue(item, "app_cpu_percent") } : {}),
  }));

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data}>
          {variant === "full" ? (
            <defs>
              <linearGradient id="metricCpuFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#0F62FE" stopOpacity={0.24} />
                <stop offset="95%" stopColor="#0F62FE" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="metricRamFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#34A853" stopOpacity={0.18} />
                <stop offset="95%" stopColor="#34A853" stopOpacity={0.01} />
              </linearGradient>
            </defs>
          ) : null}
          <CartesianGrid stroke="#141414" vertical={false} />
          <XAxis
            dataKey="time"
            tickFormatter={(value) => formatMetricTime(String(value))}
            tick={{ fill: "#6F6F6F", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={variant === "full" ? 26 : 24}
          />
          <YAxis
            tick={{ fill: "#6F6F6F", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={variant === "full" ? 36 : 34}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <RechartsTooltip
            cursor={{ stroke: variant === "full" ? "#303030" : "#2A2A2A", strokeWidth: 1 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="rounded-[12px] border border-[#242424] bg-[#080808] px-[12px] py-[10px] shadow-[0_18px_60px_rgba(0,0,0,0.45)]">
                  <p className="mb-[8px] font-mono text-[11px] text-[#8A8A8A]">
                    {formatMetricTime(String(payload[0]?.payload?.time), { seconds: true })}
                  </p>
                  {payload.map((item) => (
                    <div
                      key={item.name}
                      className="flex min-w-[170px] items-center justify-between gap-[18px] text-[12px]"
                    >
                      <span style={{ color: item.color }}>{item.name}</span>
                      <span className="font-mono font-semibold text-white">
                        {Number(item.value || 0).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              ) : null
            }
          />
          <Area
            type="monotone"
            dataKey="CPU"
            stroke="#0F62FE"
            fill={variant === "full" ? "url(#metricCpuFill)" : "#0F62FE"}
            fillOpacity={variant === "full" ? undefined : 0.16}
            strokeWidth={variant === "full" ? 2.2 : 2}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="RAM"
            stroke="#34A853"
            fill={variant === "full" ? "url(#metricRamFill)" : "#34A853"}
            fillOpacity={variant === "full" ? undefined : 0.09}
            strokeWidth={variant === "full" ? 2.2 : 2}
            isAnimationActive={false}
          />
          <Area
            type="monotone"
            dataKey="Disco"
            stroke="#FFB020"
            fill="#FFB020"
            fillOpacity={variant === "full" ? 0.04 : 0.06}
            strokeWidth={variant === "full" ? 1.9 : 2}
            isAnimationActive={false}
          />
          {variant === "full" ? (
            <Area
              type="monotone"
              dataKey="AppCPU"
              stroke="#C084FC"
              fill="#C084FC"
              fillOpacity={0.04}
              strokeWidth={1.6}
              isAnimationActive={false}
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
