"use client";

import { useEffect, useState } from "react";
import {
  Users, DollarSign, QrCode, TrendingUp, AlertTriangle, BookOpen,
  Clock, UserCheck, ArrowUpRight, ArrowDownRight, CheckCircle2,
  Activity
} from "lucide-react";
import { getDashboardStats, getCheckins, getStudents } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import Link from "next/link";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface StatCardProps {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; color: string; animDelayClass: string;
  trend?: "up"|"down"; trendVal?: string;
}

function StatCard({ title, value, subtitle, icon: Icon, color, animDelayClass, trend, trendVal }: StatCardProps) {
  return (
    <div className={`card p-6 anim-fadeUp ${animDelayClass}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon className="w-6 h-6" style={{ color }} />
        </div>
        {trend && trendVal && (
          <div className={`flex items-center gap-1 text-[13px] font-bold px-2.5 py-1 rounded-full`}
            style={{
              background: trend === "up" ? "var(--status-success-bg)" : "var(--status-error-bg)",
              color: trend === "up" ? "var(--status-success)" : "var(--status-error)",
            }}>
            {trend === "up" ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {trendVal}
          </div>
        )}
      </div>
      <div className="text-[32px] font-bold text-zinc-900 tracking-tight leading-none mb-1">{value}</div>
      <div className="text-sm font-semibold text-zinc-600 mb-0.5">{title}</div>
      <div className="text-[13px] text-zinc-400">{subtitle}</div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<any>(null);
  const [recentCheckins, setRecentCheckins] = useState<any[]>([]);
  const [recentStudents, setRecentStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [dashboardStats, checkins, students] = await Promise.all([
          getDashboardStats(),
          getCheckins(),
          getStudents()
        ]);
        setStats(dashboardStats);
        setRecentCheckins(checkins.slice(0, 5));
        setRecentStudents(students.slice(0, 5));
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
        <div className="w-10 h-10 border-4 border-zinc-200 border-t-[var(--brand-primary)] rounded-full animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Carregando painel...</p>
      </div>
    );
  }

  const pendingCount = stats.pendingPayments || 0;

  const STAT_CARDS: StatCardProps[] = [
    { title: "Total de Alunos",      value: stats.totalStudents,          subtitle: "Cadastrados no sistema", icon: Users,      color: "#820ad1", animDelayClass: "stagger-1", trend: "up",   trendVal: "+12%" },
    { title: "Alunos Ativos",        value: stats.activeStudents,         subtitle: "Com matrícula regular",  icon: UserCheck,  color: "#34c759", animDelayClass: "stagger-2", trend: "up",   trendVal: "+5%"  },
    { title: "Receita Mensal",       value: formatCurrency(stats.monthlyRevenue), subtitle: "Este mês", icon: DollarSign, color: "#ff9500", animDelayClass: "stagger-3", trend: "up",   trendVal: "+8%"  },
    { title: "Acessos Hoje",         value: stats.todayCheckins,          subtitle: "Catraca / QR Code",      icon: QrCode,     color: "#007aff", animDelayClass: "stagger-4", trend: "up",   trendVal: "+15%" },
  ];

  const fakeChartData = [
    { name: "Seg", receita: 4000, meta: 2400 },
    { name: "Ter", receita: 3000, meta: 1398 },
    { name: "Qua", receita: 2000, meta: 9800 },
    { name: "Qui", receita: 2780, meta: 3908 },
    { name: "Sex", receita: 1890, meta: 4800 },
    { name: "Sáb", receita: 2390, meta: 3800 },
    { name: "Dom", receita: 3490, meta: 4300 },
  ];

  return (
    <div className="space-y-8">
      {/* Alert Component */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-4 p-5 rounded-2xl bg-orange-50 border border-orange-100 anim-fadeUp">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <h4 className="text-[15px] font-bold text-orange-800">Atenção Financeira</h4>
            <p className="text-[13px] text-orange-700 mt-0.5">Existem {pendingCount} pagamentos em atraso ou pendentes.</p>
          </div>
          <Link href="/dashboard/pagamentos" className="ml-auto px-4 py-2 bg-white text-orange-600 font-semibold text-sm rounded-xl shadow-sm hover:shadow transition-all border border-orange-200">
            Resolver
          </Link>
        </div>
      )}

      {/* Primary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {STAT_CARDS.map(c => <StatCard key={c.title} {...c} />)}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Chart */}
        <div className="card p-6 lg:col-span-2 anim-fadeUp stagger-2">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-lg font-bold text-zinc-900 tracking-tight">Receita vs Meta</h2>
              <p className="text-sm text-zinc-500 mt-1">Acompanhamento de faturamento da última semana</p>
            </div>
            <div className="badge badge-green px-3 py-1.5 text-sm">+8% acima da meta</div>
          </div>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={fakeChartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorReceita" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--brand-primary)" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="var(--brand-primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#a1a1aa', fontSize: 12}} tickFormatter={(v) => `R$${v}`} />
                <Tooltip 
                  contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }}
                  cursor={{ stroke: 'var(--brand-primary)', strokeWidth: 1, strokeDasharray: '4 4' }}
                />
                <Area type="monotone" dataKey="receita" stroke="var(--brand-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorReceita)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Activity lists */}
        <div className="flex flex-col gap-6">
          
          <div className="card p-6 flex-1 anim-fadeUp stagger-3">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-base font-bold text-zinc-900 tracking-tight">Últimos Acessos</h2>
              <span className="text-xs font-semibold text-[var(--brand-primary)] bg-[var(--brand-light)] px-2.5 py-1 rounded-full">Ao Vivo</span>
            </div>
            
            <div className="space-y-4">
              {recentCheckins.length === 0 ? (
                <div className="text-center py-6 text-sm text-zinc-500">Nenhum acesso hoje.</div>
              ) : recentCheckins.map(ci => (
                <div key={ci.id} className="flex items-center gap-4">
                  <div className={`w-2 h-2 rounded-full ${ci.status === 'allowed' ? 'bg-green-500' : 'bg-red-500'} ring-4 ${ci.status === 'allowed' ? 'ring-green-50' : 'ring-red-50'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-zinc-900 truncate">
                      {ci.student?.full_name?.split(" ").slice(0,2).join(" ") || "Aluno Desconhecido"}
                    </div>
                    <div className="text-[13px] text-zinc-500">
                      {formatDateTime(ci.checked_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
