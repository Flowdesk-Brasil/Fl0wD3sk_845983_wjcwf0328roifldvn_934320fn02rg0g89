"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  FolderKanban,
  Receipt,
  Ticket,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fetchClientData } from "@/lib/performance/clientData";
import {
  useWorkspaceOverview,
  type WorkspaceOverviewPayload,
} from "@/lib/servers/useWorkspaceOverview";
import {
  RecentChargeDetailSheet,
  type RecentChargeDetail,
} from "@/components/servers/RecentChargeDetailSheet";
import type { ManagedServer } from "@/lib/servers/managedServersShared";

type OverviewCharge = RecentChargeDetail;

type OverviewPayload = WorkspaceOverviewPayload & {
  charges: OverviewCharge[];
};

type ServerHomeOverviewProps = {
  guildId: string;
  guildName: string;
  displayName: string;
  servers: ManagedServer[];
  onOpenSales: () => void;
  onOpenTickets: () => void;
};

const ease = [0.22, 1, 0.36, 1] as const;

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number.isFinite(value) ? value : 0);
}

function greeting(displayName: string) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const firstName = displayName.trim().split(/\s+/)[0] || "por aqui";
  return `${hello}, ${firstName}`;
}

function relativeTime(value: string | null) {
  if (!value) return "agora";
  const delta = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(delta) || delta < 60_000) return "agora";
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `ha ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `ha ${hours} h`;
  const days = Math.floor(hours / 24);
  return `ha ${days} d`;
}

function statusTone(status: ManagedServer["status"]) {
  if (status === "paid") return { label: "Em dia", className: "text-[#8AB6FF]" };
  if (status === "pending_payment") return { label: "Pendente", className: "text-[#F2C823]" };
  if (status === "expired") return { label: "Expirada", className: "text-[#F2C823]" };
  return { label: "Desligado", className: "text-[#DB4646]" };
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[168px] rounded-[14px] border border-[#2A2A2E] bg-[#141414] px-[12px] py-[10px] shadow-[0_18px_40px_rgba(0,0,0,0.35)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#8B8B90]">{label}</p>
      <div className="mt-[8px] space-y-[6px]">
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-[16px] text-[12px]">
            <span className="inline-flex items-center gap-[6px] text-[#C4C4C8]">
              <span className="h-[6px] w-[6px] rounded-full" style={{ background: entry.color }} />
              {entry.name}
            </span>
            <span className="font-medium text-[#F2F2F3]">{money(Number(entry.value || 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ServerHomeOverview({
  guildId,
  guildName,
  displayName,
  servers,
  onOpenSales,
  onOpenTickets,
}: ServerHomeOverviewProps) {
  const { data, isLoading, isRefreshing, errorMessage, reload } = useWorkspaceOverview(guildId);
  const [selectedCharge, setSelectedCharge] = useState<OverviewCharge | null>(null);
  const overview = data as OverviewPayload | null;
  const stats = overview?.stats;
  const activeServers = useMemo(
    () => servers.filter((server) => server.status === "paid"),
    [servers],
  );

  const cards = [
    {
      label: "A receber",
      value: money(stats?.receivable || 0),
      hint: `${stats?.receivableCount || 0} cobranca${(stats?.receivableCount || 0) === 1 ? "" : "s"} em aberto`,
      icon: Wallet,
      onClick: onOpenSales,
    },
    {
      label: "Recebido no mes",
      value: money(stats?.receivedThisMonth || 0),
      hint: `${money(stats?.received || 0)} no historico`,
      icon: TrendingUp,
      onClick: onOpenSales,
    },
    {
      label: "Em atraso",
      value: money(stats?.overdue || 0),
      hint: `${stats?.overdueCount || 0} pedido${(stats?.overdueCount || 0) === 1 ? "" : "s"} vencido${(stats?.overdueCount || 0) === 1 ? "" : "s"}`,
      icon: AlertTriangle,
      onClick: onOpenSales,
    },
    {
      label: "Tickets abertos",
      value: String(stats?.openTickets || 0),
      hint: `${activeServers.length} projeto${activeServers.length === 1 ? "" : "s"} em dia`,
      icon: Ticket,
      onClick: onOpenTickets,
    },
  ];

  return (
    <div className="pb-[28px]">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease }}
      >
        <p className="text-[12px] font-medium tracking-[0.04em] text-[#8B8B90] uppercase">
          Visao geral
        </p>
        <h1 className="mt-[10px] text-[32px] leading-[1.05] font-semibold tracking-[-0.045em] text-[#F2F2F3] md:text-[40px]">
          {greeting(displayName)}
        </h1>
        <p className="mt-[12px] max-w-[720px] text-[14px] leading-[1.6] text-[#8B8B90] md:text-[15px]">
          Panorama financeiro e operacional de {guildName}. Vendas, cobrancas e tickets abertos no mesmo lugar.
        </p>
      </motion.div>

      {errorMessage ? (
        <div className="mt-[22px] flex flex-col gap-[12px] rounded-[18px] border border-[#2A1717] bg-[rgba(219,70,70,0.08)] px-[16px] py-[14px] sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[13px] leading-[1.55] text-[#E8B4B4]">{errorMessage}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="inline-flex h-[38px] shrink-0 items-center justify-center rounded-[12px] border border-[#3A2222] bg-[#141414] px-[14px] text-[13px] font-medium text-[#F0D0D0] transition-colors hover:bg-[#171717]"
          >
            Tentar novamente
          </button>
        </div>
      ) : null}

      {isRefreshing && overview ? (
        <div className="mt-[14px] inline-flex items-center gap-[8px] rounded-full border border-[#1C1C1C] bg-[#141414] px-[12px] py-[6px] text-[11px] font-medium text-[#8B8B90]">
          <span className="h-[6px] w-[6px] animate-pulse rounded-full bg-[#5B8DEF]" />
          Atualizando visao geral...
        </div>
      ) : null}

      <div className="mt-[26px] grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.label}
              type="button"
              onClick={card.onClick}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.42, delay: 0.06 + index * 0.05, ease }}
              whileHover={{ y: -3 }}
              className="group rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[16px] text-left transition-colors hover:border-[#2A2A2E] hover:bg-[#111111]"
            >
              <div className="flex items-start justify-between gap-[12px]">
                <p className="text-[12px] font-medium tracking-[0.02em] text-[#8B8B90]">{card.label}</p>
                <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#C4C4C8]">
                  <Icon className="h-[16px] w-[16px]" strokeWidth={1.85} />
                </span>
              </div>
              <p className="mt-[14px] text-[26px] leading-none font-semibold tracking-[-0.04em] text-[#F2F2F3]">
                {isLoading ? "—" : card.value}
              </p>
              <div className="mt-[10px] flex items-end justify-between gap-[10px]">
                <p className="text-[12px] text-[#6F6F74]">{isLoading ? "Carregando..." : card.hint}</p>
                <ArrowUpRight className="h-[15px] w-[15px] text-[#5A5A5E] transition-transform group-hover:translate-x-[1px] group-hover:-translate-y-[1px] group-hover:text-[#D4D4D8]" strokeWidth={2} />
              </div>
            </motion.button>
          );
        })}
      </div>

      <div className="mt-[14px] grid gap-[14px] xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-[14px]">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.18, ease }}
            className="rounded-[22px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[18px] md:px-[22px]"
          >
            <div className="flex flex-col gap-[12px] md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
                  Receita dos ultimos 12 meses
                </h2>
                <p className="mt-[6px] text-[13px] text-[#8B8B90]">
                  Recebido comparado com o previsto das cobrancas em aberto.
                </p>
              </div>
              <div className="flex items-center gap-[14px] text-[12px] text-[#C4C4C8]">
                <span className="inline-flex items-center gap-[6px]">
                  <span className="h-[7px] w-[7px] rounded-full bg-[#8B7CFF]" />
                  Recebido
                </span>
                <span className="inline-flex items-center gap-[6px]">
                  <span className="h-[7px] w-[7px] rounded-full bg-[#4FD1C5]" />
                  Previsto
                </span>
              </div>
            </div>
            <div className="mt-[18px] h-[280px] w-full">
                {isLoading ? (
                <div className="space-y-[12px] pt-[18px]">
                  <div className="flowdesk-shimmer h-[12px] w-full rounded-full bg-[#171717]" />
                  <div className="flowdesk-shimmer h-[12px] w-[86%] rounded-full bg-[#171717]" />
                  <div className="flowdesk-shimmer h-[12px] w-[72%] rounded-full bg-[#171717]" />
                  <div className="flowdesk-shimmer h-[12px] w-[64%] rounded-full bg-[#171717]" />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overview?.chart || []} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="#1C1C1C" strokeDasharray="4 6" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#6F6F74", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6F6F74", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(value) =>
                        Number(value) >= 1000 ? `${Math.round(Number(value) / 1000)}k` : String(value)
                      }
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ stroke: "#2A2A2E" }} />
                    <Line
                      type="monotone"
                      dataKey="received"
                      name="Recebido"
                      stroke="#8B7CFF"
                      strokeWidth={2.4}
                      dot={false}
                      activeDot={{ r: 5, fill: "#8B7CFF", stroke: "#0D0D0D", strokeWidth: 3 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      name="Previsto"
                      stroke="#4FD1C5"
                      strokeWidth={2}
                      strokeDasharray="6 6"
                      dot={false}
                      activeDot={{ r: 5, fill: "#4FD1C5", stroke: "#0D0D0D", strokeWidth: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.24, ease }}
            className="rounded-[22px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[18px] md:px-[22px]"
          >
            <div className="flex items-center justify-between gap-[12px]">
              <h2 className="text-[18px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
                Cobrancas recentes
              </h2>
              <button
                type="button"
                onClick={onOpenSales}
                className="text-[13px] font-medium text-[#9AA4FF] transition-colors hover:text-[#C6CBFF]"
              >
                Ver todas
              </button>
            </div>
            <div className="mt-[16px] overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-left">
                <thead>
                  <tr className="text-[11px] font-medium tracking-[0.08em] text-[#6F6F74] uppercase">
                    <th className="pb-[10px] font-medium">Cobranca</th>
                    <th className="pb-[10px] font-medium">Cliente</th>
                    <th className="pb-[10px] font-medium">Status</th>
                    <th className="pb-[10px] text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {(overview?.charges || []).length || isLoading ? (
                    (isLoading ? Array.from({ length: 4 }) : overview?.charges || []).map((charge, index) => {
                      const row = charge as OverviewCharge | undefined;
                      return (
                        <tr
                          key={row?.id || index}
                          role={row ? "button" : undefined}
                          tabIndex={row ? 0 : undefined}
                          onClick={() => {
                            if (row) setSelectedCharge(row);
                          }}
                          onKeyDown={(event) => {
                            if (!row) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedCharge(row);
                            }
                          }}
                          className={`border-t border-[#1C1C1C] transition-colors ${
                            row
                              ? "cursor-pointer hover:bg-[#141414] focus-visible:bg-[#141414] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2A2A2E]"
                              : ""
                          }`}
                        >
                          <td className="py-[13px] pr-[12px]">
                            <p className="text-[13px] font-medium text-[#F2F2F3]">
                              {row?.code || "Carregando"}
                            </p>
                            <p className="mt-[3px] text-[12px] text-[#6F6F74]">{row?.id || "—"}</p>
                          </td>
                          <td className="py-[13px] pr-[12px] text-[13px] text-[#C4C4C8]">
                            {row?.customer || "—"}
                          </td>
                          <td className="py-[13px] pr-[12px]">
                            <span
                              className={`inline-flex items-center gap-[6px] rounded-full px-[8px] py-[4px] text-[11px] font-medium ${
                                row?.tone === "success"
                                  ? "bg-[rgba(79,209,197,0.12)] text-[#7EE0D6]"
                                  : row?.tone === "muted"
                                    ? "bg-[#171717] text-[#9A9A9E]"
                                    : "bg-[rgba(91,141,239,0.14)] text-[#9BB6FF]"
                              }`}
                            >
                              <span className="h-[6px] w-[6px] rounded-full bg-current" />
                              {row?.status || "—"}
                            </span>
                          </td>
                          <td className="py-[13px] text-right text-[13px] font-medium text-[#F2F2F3]">
                            {row ? money(row.amount) : "—"}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={4} className="py-[28px] text-center text-[13px] text-[#6F6F74]">
                        Nenhuma cobranca recente neste servidor.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </motion.section>
        </div>

        <div className="space-y-[14px]">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.22, ease }}
            className="rounded-[22px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[18px]"
          >
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
              Proximos vencimentos
            </h2>
            <div className="mt-[14px] space-y-[12px]">
              {(overview?.upcoming || []).length ? (
                overview?.upcoming.map((item) => (
                  <div key={item.id} className="flex items-center gap-[12px]">
                    <span className="flex h-[36px] w-[36px] items-center justify-center rounded-full bg-[#171717] text-[11px] font-semibold text-[#D4D4D8]">
                      {item.initials}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[#F2F2F3]">{item.name}</p>
                      <p className="truncate text-[12px] text-[#6F6F74]">{item.detail}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[13px] text-[#6F6F74]">
                  {isLoading ? "Carregando vencimentos..." : "Nenhum vencimento proximo."}
                </p>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.26, ease }}
            className="rounded-[22px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[18px]"
          >
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
              Saude dos projetos
            </h2>
            <div className="mt-[14px] space-y-[12px]">
              {servers.slice(0, 4).map((server) => {
                const tone = statusTone(server.status);
                return (
                  <div key={server.guildId} className="flex items-start justify-between gap-[12px]">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-[#F2F2F3]">{server.guildName}</p>
                      <p className="truncate text-[12px] text-[#6F6F74]">ID {server.guildId}</p>
                    </div>
                    <span className={`shrink-0 text-[12px] font-medium ${tone.className}`}>{tone.label}</span>
                  </div>
                );
              })}
              {!servers.length ? (
                <p className="text-[13px] text-[#6F6F74]">Nenhum projeto vinculado.</p>
              ) : null}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.3, ease }}
            className="rounded-[22px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[18px]"
          >
            <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
              Atividade recente
            </h2>
            <div className="relative mt-[16px] space-y-[14px] pl-[8px]">
              <span className="absolute top-[8px] bottom-[8px] left-[16px] w-px bg-[#1C1C1C]" />
              {(overview?.activity || []).length ? (
                overview?.activity.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="relative flex gap-[12px] pl-[28px]">
                    <span className="absolute left-[4px] flex h-[24px] w-[24px] items-center justify-center rounded-[8px] border border-[#1C1C1C] bg-[#141414] text-[#C4C4C8]">
                      {index % 2 === 0 ? (
                        <CircleDollarSign className="h-[12px] w-[12px]" />
                      ) : (
                        <Receipt className="h-[12px] w-[12px]" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium capitalize text-[#F2F2F3]">{item.title}</p>
                      <p className="mt-[3px] text-[12px] text-[#6F6F74]">
                        {relativeTime(item.at)} · {item.meta}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="pl-[28px] text-[13px] text-[#6F6F74]">
                  {isLoading ? "Carregando atividade..." : "Nenhuma atividade recente."}
                </p>
              )}
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.48, delay: 0.34, ease }}
            className="rounded-[22px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[18px]"
          >
            <div className="flex items-center gap-[10px]">
              <FolderKanban className="h-[16px] w-[16px] text-[#8B8B90]" />
              <h2 className="text-[16px] font-semibold tracking-[-0.03em] text-[#F2F2F3]">
                Tickets em aberto
              </h2>
            </div>
            <div className="mt-[14px] space-y-[10px]">
              {(overview?.tickets || []).length ? (
                overview?.tickets.map((ticket) => (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={onOpenTickets}
                    className="flex w-full items-center justify-between rounded-[12px] px-[4px] py-[4px] text-left transition-colors hover:bg-[#111111]"
                  >
                    <span>
                      <p className="text-[13px] font-medium text-[#F2F2F3]">{ticket.title}</p>
                      <p className="text-[12px] text-[#6F6F74]">{ticket.meta}</p>
                    </span>
                    <ArrowUpRight className="h-[14px] w-[14px] text-[#6F6F74]" />
                  </button>
                ))
              ) : (
                <p className="text-[13px] text-[#6F6F74]">
                  {isLoading ? "Carregando tickets..." : "Nenhum ticket aberto agora."}
                </p>
              )}
            </div>
          </motion.section>
        </div>
      </div>

      <RecentChargeDetailSheet
        charge={selectedCharge}
        onClose={() => setSelectedCharge(null)}
      />
    </div>
  );
}
