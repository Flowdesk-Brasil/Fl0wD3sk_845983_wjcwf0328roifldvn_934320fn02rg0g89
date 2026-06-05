"use client";

import { CalendarDays, Edit3, Package, Plus, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, StatusBadge } from "@/components/ui";
import { getPlans, savePlan } from "@/lib/api";
import type { Plan } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

type PlanForm = Pick<Plan, "name" | "description" | "price" | "duration_days" | "weekly_limit" | "color" | "active"> & { id?: string };
const emptyPlan: PlanForm = { name: "", description: "", price: 0, duration_days: 30, weekly_limit: 7, color: "#1a73e8", active: true };

export default function PlanosPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [form, setForm] = useState<PlanForm>(emptyPlan);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() { setPlans(await getPlans()); setLoading(false); }
  useEffect(() => { void load(); }, []);

  function show(plan?: Plan) {
    setForm(plan ? { ...plan } : emptyPlan);
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await savePlan(form);
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel salvar o plano.");
    }
  }

  if (loading) return <LoadingState label="Carregando planos..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="CatÃ¡logo comercial" title="Planos" description="Configure produtos claros e consistentes para sua equipe vender." action={<button className="btn btn-primary" onClick={() => show()}><Plus className="h-4 w-4" /> Novo plano</button>} />
      {plans.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <article className="card overflow-hidden" key={plan.id}>
              <div className="h-1.5" style={{ background: plan.color }} />
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${plan.color}18`, color: plan.color }}><Package className="h-5 w-5" /></div>
                  <button className="icon-btn" onClick={() => show(plan)} aria-label="Editar plano"><Edit3 className="h-4 w-4" /></button>
                </div>
                <div className="mt-5 flex items-center gap-2"><h2 className="text-base font-bold tracking-[-.02em]">{plan.name}</h2><StatusBadge tone={plan.active ? "green" : "gray"}>{plan.active ? "Ativo" : "Inativo"}</StatusBadge></div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-[#657085]">{plan.description || "Plano sem descriÃ§Ã£o."}</p>
                <strong className="mt-6 block text-3xl tracking-[-.05em]">{formatCurrency(Number(plan.price))}</strong>
                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#e3e8f0] pt-4 text-[11px] text-[#657085]">
                  <span className="flex items-center gap-2"><CalendarDays className="h-3.5 w-3.5 text-blue-600" /> {plan.duration_days} dias</span>
                  <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-blue-600" /> {plan.weekly_limit}x / semana</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <section className="card"><EmptyState icon={Package} title="Nenhum plano cadastrado" description="Crie seu primeiro produto para iniciar matrÃ­culas." action={<button className="btn btn-primary" onClick={() => show()}>Criar plano</button>} /></section>}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? "Editar plano" : "Novo plano"} description="Defina preÃ§o, duraÃ§Ã£o e disponibilidade.">
        <form className="form-grid" onSubmit={submit}>
          <div className="col-span-full"><ErrorBanner message={error} /></div>
          <label><FieldLabel required>Nome</FieldLabel><input className="field" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label><FieldLabel required>PreÃ§o</FieldLabel><input className="field" type="number" min="0" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} /></label>
          <label><FieldLabel required>DuraÃ§Ã£o (dias)</FieldLabel><input className="field" type="number" min="1" required value={form.duration_days} onChange={(event) => setForm({ ...form, duration_days: Number(event.target.value) })} /></label>
          <label><FieldLabel required>Limite semanal</FieldLabel><input className="field" type="number" min="1" max="7" required value={form.weekly_limit} onChange={(event) => setForm({ ...form, weekly_limit: Number(event.target.value) })} /></label>
          <label><FieldLabel>Cor de identificaÃ§Ã£o</FieldLabel><input className="field h-[42px] p-1" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
          <label><FieldLabel>SituaÃ§Ã£o</FieldLabel><select className="field" value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === "true" })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
          <label className="col-span-full"><FieldLabel>DescriÃ§Ã£o</FieldLabel><textarea className="field" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="form-actions col-span-full"><button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary" type="submit">Salvar plano</button></div>
        </form>
      </Modal>
    </div>
  );
}
