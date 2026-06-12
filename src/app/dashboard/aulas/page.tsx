"use strict";
"use client";

import { Activity, Clock, Edit3, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, StatusBadge } from "@/components/ui";
import { getClassTypes, saveClassType, deleteClassType } from "@/lib/api";
import type { ClassType } from "@/lib/types";

type ClassTypeForm = Pick<ClassType, "name" | "description" | "duration_minutes" | "capacity" | "color" | "active"> & { id?: string };
const emptyClassType: ClassTypeForm = { name: "", description: "", duration_minutes: 60, capacity: 20, color: "#e81a73", active: true };

export default function AulasPage() {
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [form, setForm] = useState<ClassTypeForm>(emptyClassType);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() { setClassTypes(await getClassTypes()); setLoading(false); }
  useEffect(() => { void load(); }, []);

  function show(type?: ClassType) {
    setForm(type ? { ...type } : emptyClassType);
    setError(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await saveClassType(form);
      setOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a modalidade.");
    }
  }

  async function removeClassType() {
    if (!form.id || !window.confirm("Deseja realmente excluir esta aula?")) return;
    try {
      await deleteClassType(form.id);
      setOpen(false);
      await load();
    } catch (reason: any) {
      const msg = reason?.message || String(reason);
      setError(msg);
    }
  }

  if (loading) return <LoadingState label="Carregando modalidades..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Gestão de Modalidades" title="Aulas" description="Cadastre as aulas oferecidas (ex: Fitdance, Pilates, Jump)." action={<button className="btn btn-primary" onClick={() => show()}><Plus className="h-4 w-4" /> Nova aula</button>} />
      {classTypes.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {classTypes.map((type) => (
            <article className="card overflow-hidden" key={type.id}>
              <div className="h-1.5" style={{ background: type.color }} />
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: `${type.color}18`, color: type.color }}><Activity className="h-5 w-5" /></div>
                  <button className="icon-btn" onClick={() => show(type)} aria-label="Editar aula"><Edit3 className="h-4 w-4" /></button>
                </div>
                <div className="mt-5 flex items-center gap-2"><h2 className="text-base font-bold tracking-[-.02em]">{type.name}</h2><StatusBadge tone={type.active ? "green" : "gray"}>{type.active ? "Ativa" : "Inativa"}</StatusBadge></div>
                <p className="mt-2 min-h-10 text-xs leading-5 text-[#657085]">{type.description || "Aula sem descrição."}</p>
                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-[#e3e8f0] pt-4 text-[11px] text-[#657085]">
                  <span className="flex items-center gap-2"><Clock className="h-3.5 w-3.5 text-blue-600" /> {type.duration_minutes} min</span>
                  <span className="flex items-center gap-2"><Users className="h-3.5 w-3.5 text-blue-600" /> Max {type.capacity} alunos</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : <section className="card"><EmptyState icon={Activity} title="Nenhuma modalidade cadastrada" description="Crie a sua primeira aula (ex: Musculação, Fitdance)." action={<button className="btn btn-primary" onClick={() => show()}>Criar aula</button>} /></section>}

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? "Editar aula" : "Nova aula"} description="Defina as características desta modalidade.">
        <form className="form-grid" onSubmit={submit}>
          <div className="col-span-full"><ErrorBanner message={error} /></div>
          <label><FieldLabel required>Nome da Aula</FieldLabel><input className="field" required placeholder="Ex: Fitdance" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label><FieldLabel required>Duração (minutos)</FieldLabel><input className="field" type="number" min="1" required value={form.duration_minutes} onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })} /></label>
          <label><FieldLabel required>Lotação Máxima</FieldLabel><input className="field" type="number" min="1" required value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} /></label>
          <label><FieldLabel>Cor de identificação</FieldLabel><input className="field h-[42px] p-1" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
          <label><FieldLabel>Situação</FieldLabel><select className="field" value={String(form.active)} onChange={(event) => setForm({ ...form, active: event.target.value === "true" })}><option value="true">Ativa</option><option value="false">Inativa</option></select></label>
          <label className="col-span-full"><FieldLabel>Descrição</FieldLabel><textarea className="field" value={form.description ?? ""} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="form-actions col-span-full flex justify-between items-center w-full">
            <div>
              {form.id && (
                <button className="btn bg-red-50 text-red-600 hover:bg-red-100" type="button" onClick={removeClassType}>
                  <Trash2 className="h-4 w-4" /> Excluir
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" type="submit">Salvar aula</button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
