"use client";

import {
  Activity, ArrowRight, BookOpen, CreditCard, DollarSign, QrCode, TrendingUp, UserCheck, Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { getCheckins, getDashboardStats, getRevenueSeries } from "@/lib/api";
import type { Checkin, DashboardStats, RevenuePoint } from "@/lib/types";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [series, setSeries] = useState<RevenuePoint[]>([]);

  useEffect(() => {
    Promise.all([getDashboardStats(), getCheckins(), getRevenueSeries()]).then(([nextStats, nextCheckins, nextSeries]) => {
      setStats(nextStats);
      setCheckins(nextCheckins.slice(0, 6));
      setSeries(nextSeries);
    });
  }, []);

  if (!stats) return <LoadingState label="Montando visão geral..." />;

  const metrics = [
    { label: "Alunos ativos", value: stats.activeStudents, detail: `${stats.totalStudents} cadastros totais`, icon: Users, color: "blue" },
    { label: "Matrículas ativas", value: stats.activeEnrollments, detail: `${stats.conversionRate}% de conversão`, icon: BookOpen, color: "purple" },
    { label: "Receita no mês", value: formatCurrency(stats.monthlyRevenue), detail: `${stats.pendingPayments} cobranças pendentes`, icon: DollarSign, color: "green" },
    { label: "Check-ins hoje", value: stats.todayCheckins, detail: "Acessos registrados", icon: QrCode, color: "yellow" },
  ];

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Performance operacional"
        title="Visão geral"
        description="Acompanhe os indicadores essenciais e as ações que precisam da sua atenção."
        action={<Link href="/dashboard/alunos/novo" className="btn btn-primary"><UserCheck className="h-4 w-4" /> Novo aluno</Link>}
      />

      <div className="metric-grid">
        {metrics.map(({ label, value, detail, icon: Icon, color }) => (
          <article className="card metric-card" key={label}>
            <div className="metric-top">
              <div className={`metric-icon badge-${color}`}><Icon className="h-5 w-5" /></div>
              <TrendingUp className="h-4 w-4 text-[#0f9d58]" />
            </div>
            <strong>{value}</strong>
            <p>{label} · {detail}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <section className="card">
          <div className="card-header">
            <div><h2>Receita recebida</h2><p>Movimentação dos últimos sete dias</p></div>
            <StatusBadge tone="blue">Atualizado agora</StatusBadge>
          </div>
          <div className="card-body h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 10, right: 10, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a73e8" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#1a73e8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="#edf1f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#8d97aa", fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: "#8d97aa", fontSize: 11 }} />
                <Tooltip formatter={(value) => formatCurrency(Number(value))} contentStyle={{ border: "1px solid #e3e8f0", borderRadius: 12, boxShadow: "0 12px 30px rgba(30,42,62,.1)", fontSize: 12 }} />
                <Area type="monotone" dataKey="receita" stroke="#1a73e8" strokeWidth={2.5} fill="url(#revenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div><h2>Acessos recentes</h2><p>Últimas validações de entrada</p></div>
            <Activity className="h-4 w-4 text-[#0f9d58]" />
          </div>
          <div className="divide-y divide-[#e3e8f0] px-5">
            {checkins.length ? checkins.map((checkin) => (
              <div className="flex items-center gap-3 py-4" key={checkin.id}>
                <div className="avatar">{checkin.student?.full_name?.[0] ?? "?"}</div>
                <div className="min-w-0 flex-1">
                  <strong className="block truncate text-xs text-[#172033]">{checkin.student?.full_name ?? "Código não identificado"}</strong>
                  <span className="mt-1 block text-[10px] text-[#8d97aa]">{formatDateTime(checkin.checked_at)}</span>
                </div>
                <StatusBadge tone={checkin.status === "allowed" ? "green" : "red"}>
                  {checkin.status === "allowed" ? "Liberado" : "Negado"}
                </StatusBadge>
              </div>
            )) : <p className="py-16 text-center text-xs text-[#8d97aa]">Nenhum acesso registrado.</p>}
          </div>
          <Link href="/dashboard/checkin" className="flex items-center justify-center gap-2 border-t border-[#e3e8f0] p-4 text-xs font-semibold text-blue-600 hover:bg-blue-50">
            Abrir controle de acesso <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>

      {(stats.pendingPayments > 0 || stats.overduePayments > 0) && (
        <section className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#fef7e0] text-[#b06000]"><CreditCard className="h-5 w-5" /></div>
          <div className="flex-1">
            <h3 className="text-sm font-bold">Financeiro requer atenção</h3>
            <p className="mt-1 text-xs text-[#657085]">{stats.pendingPayments} cobranças pendentes e {stats.overduePayments} vencidas.</p>
          </div>
          <Link href="/dashboard/pagamentos" className="btn btn-secondary">Revisar cobranças <ArrowRight className="h-4 w-4" /></Link>
        </section>
      )}
    </div>
  );
}
