"use client";

import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Users, DollarSign, QrCode, TrendingUp, AlertTriangle, BookOpen,
  Clock, UserCheck, ArrowUpRight, ArrowDownRight, CheckCircle2,
} from "lucide-react";
import {
  mockDashboardStats, monthlyRevenueData, newStudentsData,
  checkinsData, planDistributionData, mockCheckIns, mockStudents, mockPayments,
} from "@/lib/mockData";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import Link from "next/link";

/* ─── Types ─── */
interface StatCardProps {
  title: string; value: string | number; subtitle: string;
  icon: React.ElementType; color: string; glowClass: string;
  trend?: "up"|"down"; trendVal?: string;
}

/* ─── Custom Tooltip ─── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name?: string; color?: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2.5 shadow-xl">
      <p className="text-[11px] mb-1.5" style={{ color: "#71717a" }}>{label}</p>
      {payload.map((e, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: e.color || "#8b5cf6" }} />
          <span className="text-[11px]" style={{ color: "#a1a1aa" }}>
            {e.name === "receita" ? "Receita" : e.name === "meta" ? "Meta" : e.name}
          </span>
          <span className="text-[11px] font-bold ml-auto text-white pl-4">
            {["receita","meta"].includes(e.name ?? "") ? formatCurrency(e.value) : e.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Stat Card ─── */
function StatCard({ title, value, subtitle, icon: Icon, color, glowClass, trend, trendVal }: StatCardProps) {
  return (
    <div className={`card p-5 anim-fadeUp ${glowClass}`}>
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: color + "18" }}>
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        {trend && trendVal && (
          <div className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg`}
            style={{
              background: trend === "up" ? "#22c55e15" : "#ef444415",
              color: trend === "up" ? "#4ade80" : "#f87171",
            }}>
            {trend === "up" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trendVal}
          </div>
        )}
      </div>
      <div className="text-2xl font-black text-white tracking-tight">{value}</div>
      <div className="text-xs font-medium mt-0.5" style={{ color: "#71717a" }}>{title}</div>
      <div className="text-[11px] mt-1" style={{ color: "#3f3f46" }}>{subtitle}</div>
    </div>
  );
}

/* ─── Main ─── */
export default function DashboardPage() {
  const stats = mockDashboardStats;
  const pendingCount = mockPayments.filter(p => p.status === "pending").length;

  const STAT_CARDS: StatCardProps[] = [
    { title: "Total de Alunos",      value: stats.totalStudents,          subtitle: "Cadastrados",           icon: Users,      color: "#8b5cf6", glowClass: "stat-glow-purple stagger-1", trend: "up",   trendVal: "+12%" },
    { title: "Alunos Ativos",        value: stats.activeStudents,         subtitle: "Com matrícula ativa",   icon: UserCheck,  color: "#22c55e", glowClass: "stat-glow-green stagger-2",  trend: "up",   trendVal: "+5%"  },
    { title: "Receita Mensal",        value: formatCurrency(stats.monthlyRevenue), subtitle: "Junho 2024",   icon: DollarSign, color: "#eab308", glowClass: "stat-glow-yellow stagger-3", trend: "up",   trendVal: "+8%"  },
    { title: "Check-ins Hoje",        value: stats.todayCheckins,          subtitle: "Entradas registradas",  icon: QrCode,     color: "#3b82f6", glowClass: "stat-glow-blue stagger-4",   trend: "up",   trendVal: "+15%" },
    { title: "Matrículas Ativas",     value: stats.activeEnrollments,     subtitle: "Alunos matriculados",   icon: BookOpen,   color: "#f97316", glowClass: "stat-glow-orange stagger-1" },
    { title: "Pagamentos Pendentes",  value: stats.pendingPayments,        subtitle: "Aguardando pagamento",  icon: Clock,      color: "#eab308", glowClass: "stat-glow-yellow stagger-2" },
    { title: "Em Atraso",             value: stats.overduePayments,       subtitle: "Pagamentos atrasados",  icon: AlertTriangle, color: "#ef4444", glowClass: "stat-glow-red stagger-3", trend: "down", trendVal: "-3%"  },
    { title: "Receita Anual",         value: formatCurrency(stats.annualRevenue), subtitle: "Acumulado 2024", icon: TrendingUp, color: "#22c55e", glowClass: "stat-glow-green stagger-4", trend: "up",  trendVal: "+22%" },
  ];

  return (
    <div className="space-y-6 max-w-[1600px]">
      {/* Alert */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-2xl anim-fadeUp"
          style={{ background: "#eab30810", border: "1px solid #eab30828" }}>
          <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: "#fbbf24" }} />
          <p className="text-sm" style={{ color: "#fbbf24" }}>
            <strong>{pendingCount} pagamentos pendentes</strong>
            <span className="text-zinc-400 font-normal ml-1">— verifique a situação financeira dos alunos.</span>
          </p>
          <Link href="/dashboard/pagamentos" className="ml-auto text-xs font-semibold hover:opacity-80"
            style={{ color: "#fbbf24" }}>Ver →</Link>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.slice(0, 4).map(c => <StatCard key={c.title} {...c} />)}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {STAT_CARDS.slice(4).map(c => <StatCard key={c.title} {...c} />)}
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Revenue */}
        <div className="card p-5 lg:col-span-2 anim-fadeUp stagger-1">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold text-white">Receita Mensal</h2>
              <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>Receita vs Meta 2024</p>
            </div>
            <span className="badge badge-green">+8% vs meta</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={monthlyRevenueData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gMeta" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={.15} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="month" tick={{ fill: "#3f3f46", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#3f3f46", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="meta" stroke="#22c55e" strokeWidth={1.5} fill="url(#gMeta)" strokeDasharray="5 5" />
              <Area type="monotone" dataKey="receita" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gRev)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie */}
        <div className="card p-5 anim-fadeUp stagger-2">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-white">Por Plano</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>Alunos por modalidade</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={planDistributionData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
                {planDistributionData.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v, n) => [`${v} alunos`, n]}
                contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 12, fontSize: 12, color: "#fff" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5 mt-1">
            {planDistributionData.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
                  <span className="text-xs" style={{ color: "#71717a" }}>{item.name}</span>
                </div>
                <span className="text-xs font-semibold text-white">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5 anim-fadeUp stagger-1">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-white">Novos Alunos</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>Últimos 6 meses</p>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={newStudentsData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="month" tick={{ fill: "#3f3f46", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#3f3f46", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => [`${v} alunos`, "Novos"]}
                contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 12, fontSize: 12, color: "#fff" }} />
              <Bar dataKey="alunos" fill="#8b5cf6" radius={[5,5,0,0]} fillOpacity={.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5 anim-fadeUp stagger-2">
          <div className="mb-4">
            <h2 className="text-sm font-bold text-white">Frequência Semanal</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>Check-ins por dia</p>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={checkinsData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="day" tick={{ fill: "#3f3f46", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#3f3f46", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={v => [`${v}`, "Check-ins"]}
                contentStyle={{ background: "#111", border: "1px solid #222", borderRadius: 12, fontSize: 12, color: "#fff" }} />
              <Bar dataKey="checkins" radius={[5,5,0,0]}>
                {checkinsData.map((_, i) => (
                  <Cell key={i} fill={i === 5 ? "#22c55e" : "#3b82f6"} fillOpacity={.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Check-ins */}
        <div className="card anim-fadeUp stagger-1">
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid #1a1a1a" }}>
            <h2 className="text-sm font-bold text-white">Últimos Check-ins</h2>
            <span className="badge badge-green">Hoje</span>
          </div>
          <div className="p-3 space-y-1">
            {mockCheckIns.slice(0, 5).map(ci => {
              const student = mockStudents.find(s => s.id === ci.studentId);
              return (
                <div key={ci.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-colors">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: "#22c55e18", color: "#4ade80" }}>
                    {student?.fullName?.[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">
                      {student?.fullName?.split(" ").slice(0,2).join(" ")}
                    </div>
                    <div className="text-[11px]" style={{ color: "#52525b" }}>
                      {formatDateTime(ci.checkedAt)}
                    </div>
                  </div>
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" style={{ color: "#22c55e" }} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Students */}
        <div className="card anim-fadeUp stagger-2">
          <div className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: "1px solid #1a1a1a" }}>
            <h2 className="text-sm font-bold text-white">Alunos Recentes</h2>
            <Link href="/dashboard/alunos" className="text-xs font-semibold hover:opacity-80"
              style={{ color: "#8b5cf6" }}>Ver todos →</Link>
          </div>
          <div className="p-3 space-y-1">
            {mockStudents.map(s => (
              <div key={s.id}
                className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-zinc-900 transition-colors">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: s.status === "active" ? "#22c55e18" : "#52525b18",
                    color: s.status === "active" ? "#4ade80" : "#71717a",
                  }}>
                  {s.fullName[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-white truncate">
                    {s.fullName.split(" ").slice(0,2).join(" ")}
                  </div>
                  <div className="text-[11px] truncate" style={{ color: "#52525b" }}>{s.email}</div>
                </div>
                <span className={`badge ${s.status === "active" ? "badge-green" : s.status === "blocked" ? "badge-red" : "badge-gray"}`}>
                  {s.status === "active" ? "Ativo" : s.status === "blocked" ? "Bloqueado" : "Inativo"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
