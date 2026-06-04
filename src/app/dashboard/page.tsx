"use client";

import { useEffect, useState } from "react";
import {
  Users, DollarSign, QrCode, TrendingUp, AlertTriangle,
  UserCheck, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { getDashboardStats, getCheckins, getStudents } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface StatCardProps {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; animDelayClass: string;
  trend?: "up"|"down"; trendVal?: string;
}

function StatCard({ title, value, subtitle, icon: Icon, animDelayClass, trend, trendVal }: StatCardProps) {
  return (
    <div className={`card p-6 anim-fadeUp ${animDelayClass}`}>
      <div className="flex items-start justify-between mb-6">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[#111] border border-[#222]">
          <Icon className="w-5 h-5 text-white" />
        </div>
        {trend && trendVal && (
          <div className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded bg-[#111] border border-[#222]
            ${trend === "up" ? "text-[#10b981]" : "text-[#ef4444]"}`}>
            {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trendVal}
          </div>
        )}
      </div>
      <div className="text-[28px] font-bold text-white tracking-tight leading-none mb-2">{value}</div>
      <div className="text-[13px] font-medium text-[#888] mb-0.5">{title}</div>
      <div className="text-[11px] text-[#555] uppercase tracking-wider">{subtitle}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [recentCheckins, setRecentCheckins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [dashboardStats, checkins] = await Promise.all([
          getDashboardStats(),
          getCheckins(),
        ]);
        setStats(dashboardStats);
        setRecentCheckins(checkins.slice(0, 5));
      } catch (e) {
        console.error("Erro ao carregar dados", e);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading || !stats) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center anim-fadeIn">
        <div className="w-8 h-8 border-2 border-[#333] border-t-white rounded-full animate-spin mb-4" />
        <p className="text-[#888] text-sm font-medium">Carregando painel...</p>
      </div>
    );
  }

  const pendingCount = stats.pendingPayments || 0;

  const STAT_CARDS: StatCardProps[] = [
    { title: "Total de Alunos",      value: stats.totalStudents,          subtitle: "Cadastrados no sistema", icon: Users,      animDelayClass: "stagger-1", trend: "up",   trendVal: "+12%" },
    { title: "Alunos Ativos",        value: stats.activeStudents,         subtitle: "Com matrícula regular",  icon: UserCheck,  animDelayClass: "stagger-2", trend: "up",   trendVal: "+5%"  },
    { title: "Receita Mensal",       value: formatCurrency(stats.monthlyRevenue), subtitle: "Este mês", icon: DollarSign, animDelayClass: "stagger-3", trend: "up",   trendVal: "+8%"  },
    { title: "Acessos Hoje",         value: stats.todayCheckins,          subtitle: "Catraca / QR Code",      icon: QrCode,     animDelayClass: "stagger-4", trend: "up",   trendVal: "+15%" },
  ];

  const fakeChartData = [
    { name: "Seg", receita: 4000 },
    { name: "Ter", receita: 3000 },
    { name: "Qua", receita: 2000 },
    { name: "Qui", receita: 2780 },
    { name: "Sex", receita: 1890 },
    { name: "Sáb", receita: 2390 },
    { name: "Dom", receita: 3490 },
  ];

  return (
    <div className="space-y-6">
      {/* Alert Component */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-xl bg-[#1a0505] border border-[#ef4444]/20 anim-fadeUp">
          <div className="w-10 h-10 rounded-lg bg-[#ef4444]/10 flex items-center justify-center flex-shrink-0 border border-[#ef4444]/20">
            <AlertTriangle className="w-5 h-5 text-[#ef4444]" />
          </div>
          <div>
            <h4 className="text-[13px] font-bold text-[#ff8888]">Atenção Financeira</h4>
            <p className="text-[12px] text-[#cc6666] mt-0.5">Existem {pendingCount} pagamentos em atraso ou pendentes.</p>
          </div>
          <Link href="/dashboard/pagamentos" className="ml-auto px-4 py-2 bg-[#ef4444]/10 hover:bg-[#ef4444]/20 text-[#ef4444] font-semibold text-xs rounded-lg transition-all border border-[#ef4444]/20">
            Ver detalhes
          </Link>
        </div>
      )}

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.map(c => <StatCard key={c.title} {...c} />)}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        
        {/* Main Chart */}
        <div className="card p-6 lg:col-span-2 anim-fadeUp stagger-2">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-[15px] font-bold text-white tracking-wide">Faturamento Semanal</h2>
              <p className="text-[12px] text-[#666] mt-1">Análise de receita dos últimos 7 dias</p>
            </div>
            <div className="badge badge-gray px-3 py-1.5 text-[11px]">+8% vs Semana Anterior</div>
          </div>
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fakeChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ffffff" stopOpacity={0.15}/>
                    <stop offset="95%" stopColor="#ffffff" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1f1f22" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#666', fontSize: 11}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#666', fontSize: 11}} tickFormatter={(v) => `R$${v}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000', borderRadius: '8px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', color: '#fff', fontSize: '12px' }}
                  itemStyle={{ color: '#fff' }}
                  cursor={{ stroke: '#333', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area type="monotone" dataKey="receita" stroke="#ffffff" strokeWidth={2} fillOpacity={1} fill="url(#colorReceita)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card p-6 anim-fadeUp stagger-3 flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-[15px] font-bold text-white tracking-wide">Últimos Acessos</h2>
            <div className="w-2 h-2 rounded-full bg-[#10b981] shadow-[0_0_8px_#10b981] animate-pulse" title="Ao vivo" />
          </div>
          
          <div className="space-y-4 flex-1">
            {recentCheckins.length === 0 ? (
              <div className="text-center py-10 text-[13px] text-[#555]">Nenhum acesso registrado hoje.</div>
            ) : recentCheckins.map(ci => (
              <div key={ci.id} className="flex items-center gap-3">
                <div className={`w-1.5 h-1.5 rounded-full ${ci.status === 'allowed' ? 'bg-[#10b981] shadow-[0_0_5px_#10b981]' : 'bg-[#ef4444] shadow-[0_0_5px_#ef4444]'}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-[#ddd] truncate">
                    {ci.student?.full_name?.split(" ").slice(0,2).join(" ") || "Aluno Desconhecido"}
                  </div>
                  <div className="text-[11px] text-[#666]">
                    {formatDateTime(ci.checked_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <Link href="/dashboard/checkin" className="mt-4 pt-4 border-t border-[#1f1f22] text-[12px] font-medium text-[#888] hover:text-white transition-colors flex items-center justify-center gap-1">
            Ver controle de acesso <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>

      </div>
    </div>
  );
}
