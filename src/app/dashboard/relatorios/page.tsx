"use client";

import { BarChart3, CreditCard, DollarSign, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { LoadingState, PageHeader, StatusBadge } from "@/components/ui";
import { getDashboardStats, getPayments, getPlans } from "@/lib/api";
import type { DashboardStats, Payment, Plan } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function RelatoriosPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  useEffect(() => { Promise.all([getDashboardStats(), getPayments(), getPlans()]).then(([a, b, c]) => { setStats(a); setPayments(b); setPlans(c); }); }, []);
  if (!stats) return <LoadingState label="Consolidando indicadores..." />;
  const total = payments.reduce((sum, item) => sum + Number(item.total_amount), 0);
  const paid = payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.total_amount), 0);
  const defaultRate = total ? Math.round(((total - paid) / total) * 100) : 0;
  const metrics = [
    { label: "Receita no mÃªs", value: formatCurrency(stats.monthlyRevenue), icon: DollarSign, tone: "green" },
    { label: "ConversÃ£o em matrÃ­cula", value: `${stats.conversionRate}%`, icon: TrendingUp, tone: "blue" },
    { label: "InadimplÃªncia potencial", value: `${defaultRate}%`, icon: CreditCard, tone: "yellow" },
    { label: "Alunos ativos", value: stats.activeStudents, icon: Users, tone: "purple" },
  ];
  return (
    <div className="page-stack">
      <PageHeader eyebrow="InteligÃªncia operacional" title="RelatÃ³rios" description="Indicadores consolidados para apoiar decisÃµes comerciais e financeiras." />
      <div className="metric-grid">{metrics.map(({ label, value, icon: Icon, tone }) => <article className="card metric-card" key={label}><div className="metric-top"><div className={`metric-icon badge-${tone}`}><Icon className="h-5 w-5" /></div></div><strong>{value}</strong><p>{label}</p></article>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card"><div className="card-header"><div><h2>Resumo financeiro</h2><p>Valores consolidados da base atual</p></div><BarChart3 className="h-5 w-5 text-blue-600" /></div><div className="grid gap-3 p-5">{[["Valor total gerado", formatCurrency(total)], ["Valor recebido", formatCurrency(paid)], ["Saldo em aberto", formatCurrency(total - paid)]].map(([label, value]) => <div className="flex items-center justify-between rounded-xl bg-[#f7f9fc] p-4" key={label}><span className="text-xs text-[#657085]">{label}</span><strong className="text-sm">{value}</strong></div>)}</div></section>
        <section className="card"><div className="card-header"><div><h2>PortfÃ³lio de planos</h2><p>Produtos disponÃ­veis no workspace</p></div><StatusBadge tone="blue">{plans.length} planos</StatusBadge></div><div className="grid gap-3 p-5">{plans.map((plan) => <div className="flex items-center gap-3 rounded-xl border border-[#e3e8f0] p-4" key={plan.id}><i className="h-3 w-3 rounded-full" style={{ background: plan.color }} /><span className="flex-1 text-xs font-semibold">{plan.name}</span><strong className="text-xs">{formatCurrency(Number(plan.price))}</strong></div>)}</div></section>
      </div>
    </div>
  );
}
