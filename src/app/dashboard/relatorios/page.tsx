"use client";

import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { monthlyRevenueData, newStudentsData, checkinsData, planDistributionData } from "@/lib/mockData";

const inadimplencia = [
  { month:"Jan",taxa:8 },{ month:"Fev",taxa:6 },{ month:"Mar",taxa:9 },
  { month:"Abr",taxa:7 },{ month:"Mai",taxa:5 },{ month:"Jun",taxa:6 },
];

const PERIODS = [{v:"week",l:"Semana"},{v:"month",l:"Mês"},{v:"year",l:"Ano"}];

const KPIS = [
  { label:"Ticket Médio",  value:"R$ 194,40", trend:"up",   delta:"+3%",  color:"#8b5cf6" },
  { label:"Taxa Retenção", value:"87%",        trend:"up",   delta:"+2%",  color:"#22c55e" },
  { label:"Inadimplência", value:"6%",         trend:"down", delta:"-1%",  color:"#ef4444" },
  { label:"LTV Médio",     value:"R$ 2.332",   trend:"up",   delta:"+8%",  color:"#f97316" },
];

function Tip({ active, payload, label, format }: { active?: boolean; payload?: { value: number; name?: string }[]; label?: string; format?:(v:number)=>string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card px-3 py-2">
      <p className="text-[10px] mb-1" style={{ color: "#52525b" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="text-xs font-bold text-white">{format ? format(p.value) : p.value}</div>
      ))}
    </div>
  );
}

export default function RelatoriosPage() {
  const [period, setPeriod] = useState("month");
  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 anim-fadeUp">
        <p className="text-sm" style={{ color: "#71717a" }}>Relatórios e análises</p>
        <div className="flex items-center gap-2">
          <div className="tab-bar">
            {PERIODS.map(p => (
              <button key={p.v} onClick={() => setPeriod(p.v)}
                className={`tab-item text-xs py-2 px-3 ${period === p.v ? "active" : ""}`}>{p.l}</button>
            ))}
          </div>
          <button className="btn btn-ghost text-xs py-2 px-3">
            <Download className="w-3.5 h-3.5" /> Exportar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {KPIS.map((k, i) => (
          <div key={k.label} className={`card p-4 anim-fadeUp stagger-${i+1}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="text-2xl font-black" style={{ color: k.color }}>{k.value}</div>
              <div className="flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{
                  background: k.trend === "up" ? "#22c55e18" : "#ef444415",
                  color: k.trend === "up" ? "#4ade80" : "#f87171",
                }}>
                {k.trend === "up" ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                {k.delta}
              </div>
            </div>
            <p className="text-xs" style={{ color: "#52525b" }}>{k.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue */}
      <div className="card p-5 anim-fadeUp stagger-1">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-sm font-bold text-white">Receita vs Meta Anual</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>Comparativo 2024</p>
          </div>
          <div className="flex items-center gap-4">
            {[{l:"Receita",c:"#8b5cf6"},{l:"Meta",c:"#22c55e"}].map(l => (
              <div key={l.l} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: l.c }} />
                <span className="text-xs" style={{ color: "#52525b" }}>{l.l}</span>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={monthlyRevenueData} margin={{ top:5, right:5, left:-10, bottom:0 }}>
            <defs>
              <linearGradient id="rg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={.25} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="mg2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#22c55e" stopOpacity={.1} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
            <XAxis dataKey="month" tick={{ fill:"#3f3f46",fontSize:11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill:"#3f3f46",fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v=>`R$${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<Tip format={formatCurrency} />} />
            <Area type="monotone" dataKey="meta" stroke="#22c55e" strokeWidth={1.5} fill="url(#mg2)" strokeDasharray="5 5" />
            <Area type="monotone" dataKey="receita" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#rg2)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* 3-col charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="card p-5 anim-fadeUp stagger-1">
          <h2 className="text-sm font-bold text-white mb-4">Novos Alunos / Mês</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={newStudentsData} margin={{ top:5,right:5,left:-20,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="month" tick={{ fill:"#3f3f46",fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:"#3f3f46",fontSize:10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background:"#111",border:"1px solid #222",borderRadius:12,fontSize:11,color:"#fff" }} />
              <Bar dataKey="alunos" fill="#8b5cf6" radius={[5,5,0,0]} fillOpacity={.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5 anim-fadeUp stagger-2">
          <h2 className="text-sm font-bold text-white mb-4">Frequência Semanal</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={checkinsData} margin={{ top:5,right:5,left:-20,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="day" tick={{ fill:"#3f3f46",fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:"#3f3f46",fontSize:10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background:"#111",border:"1px solid #222",borderRadius:12,fontSize:11,color:"#fff" }} />
              <Bar dataKey="checkins" fill="#3b82f6" radius={[5,5,0,0]} fillOpacity={.85} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card p-5 anim-fadeUp stagger-3">
          <h2 className="text-sm font-bold text-white mb-4">Inadimplência (%)</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={inadimplencia} margin={{ top:5,right:5,left:-20,bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
              <XAxis dataKey="month" tick={{ fill:"#3f3f46",fontSize:10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill:"#3f3f46",fontSize:10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background:"#111",border:"1px solid #222",borderRadius:12,fontSize:11,color:"#fff" }} />
              <Line type="monotone" dataKey="taxa" stroke="#ef4444" strokeWidth={2.5} dot={{ fill:"#ef4444",strokeWidth:0,r:4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Plan distribution */}
      <div className="card anim-fadeUp stagger-2">
        <div className="p-5" style={{ borderBottom:"1px solid #1a1a1a" }}>
          <h2 className="text-sm font-bold text-white">Distribuição por Plano</h2>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Plano</th>
                <th>Alunos</th>
                <th>Receita Mensal</th>
                <th>% do Total</th>
                <th>Distribuição</th>
              </tr>
            </thead>
            <tbody>
              {planDistributionData.map(item => {
                const total = planDistributionData.reduce((a,b) => a+b.value, 0);
                const pct   = (item.value/total*100).toFixed(0);
                return (
                  <tr key={item.name}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                        <span className="font-medium text-white">{item.name}</span>
                      </div>
                    </td>
                    <td>{item.value}</td>
                    <td className="font-semibold text-white">{formatCurrency(item.value * 150)}</td>
                    <td>{pct}%</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-32 rounded-full" style={{ background: "#1a1a1a" }}>
                          <div className="h-full rounded-full" style={{ width:`${pct}%`, background: item.color }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
