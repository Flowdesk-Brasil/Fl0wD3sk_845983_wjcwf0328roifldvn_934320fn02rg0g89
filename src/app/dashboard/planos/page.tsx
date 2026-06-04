"use client";

import { useState } from "react";
import { Package, Plus, Edit, X, CheckCircle2, Calendar, Clock } from "lucide-react";
import { mockPlans } from "@/lib/mockData";
import { Plan } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export default function PlanosPage() {
  const [plans, setPlans]   = useState<Plan[]>(mockPlans);
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm]     = useState({ name:"", price:"", desc:"", days:"30", weekly:"5", color:"#8b5cf6" });

  const openNew = () => {
    setEditing(null);
    setForm({ name:"", price:"", desc:"", days:"30", weekly:"5", color:"#8b5cf6" });
    setModal(true);
  };
  const openEdit = (p: Plan) => {
    setEditing(p);
    setForm({ name: p.name, price: String(p.price), desc: p.description, days: String(p.durationDays), weekly: String(p.weeklyLimit), color: p.color });
    setModal(true);
  };
  const save = () => {
    if (editing) {
      setPlans(prev => prev.map(p => p.id === editing.id
        ? { ...p, name: form.name, price: +form.price, description: form.desc, durationDays: +form.days, weeklyLimit: +form.weekly, color: form.color }
        : p));
    } else {
      setPlans(prev => [...prev, {
        id: `plan-${Date.now()}`, name: form.name, price: +form.price, description: form.desc,
        durationDays: +form.days, weeklyLimit: +form.weekly, allowedHours: [],
        color: form.color, active: true, createdAt: new Date().toISOString(),
      }]);
    }
    setModal(false);
  };
  const toggle = (id: string) => setPlans(prev => prev.map(p => p.id === id ? { ...p, active: !p.active } : p));
  const upd = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Header */}
      <div className="flex items-center justify-between anim-fadeUp">
        <p className="text-sm" style={{ color: "#71717a" }}>
          {plans.filter(p => p.active).length} planos ativos de {plans.length} total
        </p>
        <button onClick={openNew} className="btn btn-primary text-sm">
          <Plus className="w-4 h-4" /> Novo Plano
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((p, i) => (
          <div key={p.id}
            className={`card p-5 relative overflow-hidden card-interactive anim-fadeUp stagger-${(i%8)+1} ${!p.active ? "opacity-40" : ""}`}>
            {/* Top accent line */}
            <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: p.color }} />

            <div className="flex items-start justify-between mb-4 mt-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: p.color + "18" }}>
                  <Package className="w-5 h-5" style={{ color: p.color }} />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-white">{p.name}</h3>
                  <span className={`badge mt-0.5 ${p.active ? "badge-green" : "badge-gray"}`}>
                    {p.active ? "Ativo" : "Inativo"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openEdit(p)} className="btn-icon"><Edit className="w-3.5 h-3.5" /></button>
                <button onClick={() => toggle(p.id)} className="btn-icon"
                  style={{ color: p.active ? "#ef4444" : "#22c55e" }}>
                  {p.active ? <X className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-3xl font-black text-white">{formatCurrency(p.price)}</div>
              <div className="text-xs mt-0.5" style={{ color: "#52525b" }}>por mês</div>
            </div>

            <p className="text-sm mb-4 line-clamp-2" style={{ color: "#71717a" }}>{p.description}</p>

            <div className="space-y-1.5 pt-3" style={{ borderTop: "1px solid #1a1a1a" }}>
              {[
                { icon: Calendar, label: `${p.durationDays} dias de duração` },
                { icon: Clock,    label: `${p.weeklyLimit} aulas por semana` },
              ].map((item, j) => {
                const Icon = item.icon;
                return (
                  <div key={j} className="flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" style={{ color: p.color }} />
                    <span className="text-xs" style={{ color: "#52525b" }}>{item.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Add card */}
        <button onClick={openNew}
          className="card p-5 flex flex-col items-center justify-center min-h-[280px] anim-fadeUp hover:border-zinc-600 transition-all"
          style={{ borderStyle: "dashed", borderColor: "#222" }}>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: "#111" }}>
            <Plus className="w-6 h-6" style={{ color: "#3f3f46" }} />
          </div>
          <p className="text-sm font-semibold" style={{ color: "#52525b" }}>Adicionar Plano</p>
          <p className="text-xs mt-1" style={{ color: "#3f3f46" }}>Clique para criar</p>
        </button>
      </div>

      {/* Modal */}
      {modal && (
        <div className="modal-backdrop" onClick={() => setModal(false)}>
          <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-white">{editing ? "Editar Plano" : "Novo Plano"}</h3>
              <button className="btn-icon" onClick={() => setModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Nome do Plano *</label>
                <input type="text" className="field" placeholder="Ex: Pilates, FitDance..." id="p-name"
                  value={form.name} onChange={e => upd("name", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Valor (R$)</label>
                  <input type="number" className="field" placeholder="129.90" id="p-price"
                    value={form.price} onChange={e => upd("price", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Duração (dias)</label>
                  <input type="number" className="field" placeholder="30" id="p-days"
                    value={form.days} onChange={e => upd("days", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Limite Semanal</label>
                  <input type="number" className="field" placeholder="5" id="p-weekly"
                    value={form.weekly} onChange={e => upd("weekly", e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Cor de Destaque</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={form.color} onChange={e => upd("color", e.target.value)}
                      className="w-10 h-10 rounded-lg border-0 cursor-pointer p-0.5"
                      style={{ background: "#111" }} id="p-color" />
                    <input type="text" className="field text-xs" value={form.color}
                      onChange={e => upd("color", e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#52525b" }}>Descrição</label>
                <textarea className="field text-sm" rows={3} placeholder="Descrição do plano..." id="p-desc"
                  style={{ resize: "vertical" }}
                  value={form.desc} onChange={e => upd("desc", e.target.value)} />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={save} className="btn btn-primary flex-1 text-sm">
                  {editing ? "Salvar Alterações" : "Criar Plano"}
                </button>
                <button onClick={() => setModal(false)} className="btn btn-ghost text-sm">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
