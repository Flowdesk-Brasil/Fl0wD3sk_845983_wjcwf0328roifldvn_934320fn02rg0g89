"use client";

import { BarChart3, TrendingUp, DollarSign } from "lucide-react";

export default function RelatoriosPage() {
  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Relatórios</h1>
          <p className="text-zinc-500 text-sm mt-1">Análises financeiras e operacionais</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { l:"Receita Mensal", v:"R$ 0,00", i:DollarSign, c:"#34c759" },
          { l:"Novos Alunos", v:"0", i:TrendingUp, c:"#820ad1" },
          { l:"Inadimplência", v:"0%", i:BarChart3, c:"#ff3b30" }
        ].map((s, idx) => (
          <div key={s.l} className={`card p-6 anim-fadeUp stagger-${idx+1}`}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${s.c}15` }}>
              <s.i className="w-6 h-6" style={{ color: s.c }} />
            </div>
            <div className="text-[32px] font-bold text-zinc-900 tracking-tight leading-none mb-1">{s.v}</div>
            <div className="text-sm font-semibold text-zinc-600 mb-0.5">{s.l}</div>
          </div>
        ))}
      </div>
      
      <div className="card p-16 flex flex-col items-center justify-center text-center anim-fadeUp stagger-4">
        <div className="w-20 h-20 rounded-full bg-zinc-50 flex items-center justify-center mb-6">
          <BarChart3 className="w-10 h-10 text-zinc-300" />
        </div>
        <h3 className="text-xl font-bold text-zinc-900 mb-2">Painel Analítico Completo</h3>
        <p className="text-zinc-500 max-w-md">Os gráficos detalhados de faturamento, retenção e previsibilidade estarão disponíveis quando houver dados suficientes no Supabase.</p>
      </div>
    </div>
  );
}
