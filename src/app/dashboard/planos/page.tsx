"use client";

import { useEffect, useState } from "react";
import { Package, Plus, Edit, X, CheckCircle2, Calendar, Clock, Loader2 } from "lucide-react";
import { getPlans } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

export default function PlanosPage() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getPlans();
      setPlans(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center anim-fadeIn">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-zinc-500 font-medium">Carregando planos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Planos</h1>
          <p className="text-zinc-500 text-sm mt-1">Configure os pacotes do seu Studio</p>
        </div>
        <button className="btn btn-primary">
          <Plus className="w-4 h-4" /> Criar Plano
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {plans.map((p, i) => (
          <div key={p.id} className={`card card-hover p-6 relative overflow-hidden anim-fadeUp stagger-${(i%4)+1} ${!p.active && 'opacity-60 grayscale'}`}>
            
            {/* Top color accent */}
            <div className="absolute top-0 left-0 right-0 h-1.5" style={{ backgroundColor: p.color || 'var(--brand-primary)' }} />
            
            <div className="flex justify-between items-start mb-6 mt-2">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ backgroundColor: `${p.color}15` || 'var(--brand-light)' }}>
                <Package className="w-6 h-6" style={{ color: p.color || 'var(--brand-primary)' }} />
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-icon bg-zinc-50 hover:bg-zinc-100"><Edit className="w-4 h-4 text-zinc-600" /></button>
              </div>
            </div>

            <div className="mb-2">
              <h3 className="text-lg font-bold text-zinc-900">{p.name}</h3>
              <p className="text-[13px] text-zinc-500 line-clamp-2 mt-1 h-10">{p.description || "Sem descrição definida"}</p>
            </div>

            <div className="my-6">
              <div className="flex items-baseline gap-1">
                <span className="text-[32px] font-bold tracking-tight text-zinc-900">{formatCurrency(p.price)}</span>
                <span className="text-sm font-medium text-zinc-500">/mês</span>
              </div>
            </div>

            <div className="space-y-3 pt-6 border-t border-[var(--border-light)]">
              <div className="flex items-center gap-3">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-600">Duração: {p.duration_days} dias</span>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-4 h-4 text-zinc-400" />
                <span className="text-sm font-medium text-zinc-600">Limite: {p.weekly_limit}x por semana</span>
              </div>
            </div>
            
          </div>
        ))}

        {/* Add New Card */}
        <button className="card card-hover p-6 flex flex-col items-center justify-center min-h-[340px] anim-fadeUp group border-dashed border-2 border-zinc-200 bg-transparent hover:border-[var(--brand-primary)] hover:bg-[var(--brand-light)] transition-all">
          <div className="w-16 h-16 rounded-full bg-zinc-100 group-hover:bg-white flex items-center justify-center mb-4 shadow-sm transition-all group-hover:scale-110">
            <Plus className="w-8 h-8 text-zinc-400 group-hover:text-[var(--brand-primary)]" />
          </div>
          <h3 className="text-lg font-bold text-zinc-900 mb-1 group-hover:text-[var(--brand-primary)]">Novo Plano</h3>
          <p className="text-sm text-zinc-500">Clique para adicionar um novo pacote</p>
        </button>
      </div>

    </div>
  );
}
