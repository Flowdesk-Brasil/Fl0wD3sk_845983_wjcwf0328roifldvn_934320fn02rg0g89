"use client";

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader } from "@/components/ui";
import { createClassSchedule, deleteClassSchedule, getClassSchedules, getClassTypes, getProfiles } from "@/lib/api";
import type { ClassSchedule, ClassType, Profile } from "@/lib/types";

const WEEKDAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

export default function CalendarioPage() {
  const [anchor, setAnchor] = useState(new Date());
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [types, setTypes] = useState<ClassType[]>([]);
  const [instructors, setInstructors] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ClassSchedule | null>(null);
  
  const [form, setForm] = useState({ class_type_id: "", instructor_id: "", day_of_week: "1", time: "18:00", capacity: "10" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [nextSchedules, nextTypes, profiles] = await Promise.all([getClassSchedules(), getClassTypes(), getProfiles()]);
    setSchedules(nextSchedules);
    setTypes(nextTypes.filter((item) => item.active));
    setInstructors(profiles.filter((item) => item.active && (item.role === "professor" || item.role === "admin")));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => eachDayOfInterval({ start: startDate, end: endDate }), [startDate, endDate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createClassSchedule({
        class_type_id: form.class_type_id,
        instructor_id: form.instructor_id || null,
        day_of_week: Number(form.day_of_week),
        time: form.time,
        capacity: Number(form.capacity),
      });
      setOpen(false);
      setForm({ class_type_id: "", instructor_id: "", day_of_week: "1", time: "18:00", capacity: "10" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a turma.");
    }
  }

  async function removeSchedule(id: string) {
    if (!window.confirm("Deseja realmente excluir este horário da grade? Todos os alunos matriculados neste horário perderão o vínculo.")) return;
    try {
      await deleteClassSchedule(id);
      setSelectedSchedule(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao remover horário.");
    }
  }

  if (loading) return <LoadingState label="Montando grade fixa..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Organização de aulas" title="Grade Fixa" description="Crie a grade de aulas da semana. O sistema aplicará essa grade para todos os meses do ano automaticamente." action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Novo Horário</button>} />
      <ErrorBanner message={error} />
      
      <section className="card">
        <div className="card-header border-b border-[#e3e8f0] pb-4">
          <div><h2 className="capitalize">{format(monthStart, "MMMM 'de' yyyy", { locale: ptBR })}</h2><p>Grade mensal dinâmica</p></div>
          <div className="flex gap-2">
            <button className="btn btn-secondary" onClick={() => setAnchor(new Date())}>Mês Atual</button>
            <button className="icon-btn" aria-label="Mês anterior" onClick={() => setAnchor(addMonths(anchor, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <button className="icon-btn" aria-label="Próximo mês" onClick={() => setAnchor(addMonths(anchor, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
        
        {/* Cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 bg-[#f7f9fc] text-center text-[11px] font-bold uppercase tracking-wider text-[#657085]">
          {WEEKDAYS.map(w => <div key={w.value} className="py-3 border-b border-r border-[#e3e8f0] last:border-r-0">{w.label.split("-")[0]}</div>)}
        </div>

        {/* Grid do mês */}
        <div className="grid grid-cols-7 bg-[#e3e8f0] gap-px">
          {days.map((day) => {
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());
            const dailySchedules = schedules.filter((s) => s.day_of_week === day.getDay());

            return (
              <div key={day.toISOString()} className={`min-h-[120px] p-1 sm:p-2 transition-colors ${isCurrentMonth ? "bg-white" : "bg-slate-50"} ${isToday ? "ring-2 ring-inset ring-blue-500" : ""}`}>
                <div className="flex justify-end mb-1">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isToday ? "bg-blue-600 text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-400"}`}>
                    {format(day, "d")}
                  </span>
                </div>
                
                <div className="grid gap-1">
                  {dailySchedules.map((schedule) => {
                    const booked = (schedule.student_classes || []).length;
                    return (
                      <button 
                        key={schedule.id} 
                        onClick={() => setSelectedSchedule(schedule)}
                        className={`text-left rounded p-1.5 border-l-4 text-[10px] hover:bg-slate-50 transition-colors ${!isCurrentMonth && 'opacity-50'}`}
                        style={{ borderLeftColor: schedule.class_type?.color || "#cbd5e1", backgroundColor: `${schedule.class_type?.color}15` }}
                      >
                        <strong className="block truncate text-slate-900">{schedule.time} - {schedule.class_type?.name}</strong>
                        <span className="text-slate-600 mt-0.5 flex items-center gap-1"><Users className="w-3 h-3" /> {booked}/{schedule.capacity}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {!schedules.length && <EmptyState icon={CalendarDays} title="Grade vazia" description="Crie o primeiro horário da semana para começar a preencher o calendário." />}

      {/* MODAL DE CRIAÇÃO */}
      <Modal open={open} onClose={() => setOpen(false)} title="Programar novo horário fixo" description="Este horário se repetirá toda semana neste mesmo dia." size="sm">
        <form className="grid gap-4" onSubmit={submit}>
          <label><FieldLabel required>Tipo de aula</FieldLabel><select className="field" required value={form.class_type_id} onChange={(event) => { const type = types.find((item) => item.id === event.target.value); setForm({ ...form, class_type_id: event.target.value, capacity: String(type?.capacity || 10) }); }}><option value="">Selecione</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
          <label><FieldLabel>Professor responsável</FieldLabel><select className="field" value={form.instructor_id} onChange={(event) => setForm({ ...form, instructor_id: event.target.value })}><option value="">Sem responsável definido</option>{instructors.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>
          
          <div className="grid grid-cols-2 gap-4">
            <label><FieldLabel required>Dia da semana</FieldLabel>
              <select className="field" required value={form.day_of_week} onChange={(event) => setForm({ ...form, day_of_week: event.target.value })}>
                {WEEKDAYS.map(w => <option key={w.value} value={w.value}>{w.label}</option>)}
              </select>
            </label>
            <label><FieldLabel required>Horário</FieldLabel><input className="field" type="time" required value={form.time} onChange={(event) => setForm({ ...form, time: event.target.value })} /></label>
          </div>

          <label><FieldLabel required>Capacidade de alunos</FieldLabel><input className="field" type="number" min={1} max={200} required value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></label>
          
          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary">Salvar Horário Fixo</button></div>
        </form>
      </Modal>

      {/* MODAL DE DETALHES DO HORÁRIO E ALUNOS */}
      {selectedSchedule && (
        <Modal open={!!selectedSchedule} onClose={() => setSelectedSchedule(null)} title={`Turma de ${selectedSchedule.class_type?.name}`} description={`${WEEKDAYS.find(w => w.value === selectedSchedule.day_of_week)?.label} às ${selectedSchedule.time}`} size="md">
          <div className="grid gap-6">
            <div className="flex justify-between items-center bg-[#f3f6fb] p-4 rounded-xl">
              <div>
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Professor</span>
                <strong className="text-sm">{selectedSchedule.instructor?.full_name || "Não definido"}</strong>
              </div>
              <div className="text-right">
                <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ocupação</span>
                <strong className="text-sm text-blue-600">{selectedSchedule.student_classes?.length || 0} / {selectedSchedule.capacity} vagas</strong>
              </div>
            </div>

            <div>
              <h3 className="font-bold text-sm mb-3">Alunos Fixos Matriculados</h3>
              {selectedSchedule.student_classes && selectedSchedule.student_classes.length > 0 ? (
                <ul className="divide-y divide-[#e3e8f0] border border-[#e3e8f0] rounded-xl overflow-hidden">
                  {selectedSchedule.student_classes.map((sc) => (
                    <li key={sc.id} className="p-3 text-sm flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-[10px]">
                        {sc.student?.full_name.substring(0, 2).toUpperCase()}
                      </div>
                      <span className="font-medium text-slate-700">{sc.student?.full_name}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center p-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                  <p className="text-sm text-slate-500">Nenhum aluno matriculado neste horário ainda.</p>
                  <p className="text-xs text-slate-400 mt-1">Vincule os alunos através da tela de cadastro de aluno.</p>
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 pt-4 flex justify-between">
              <button className="btn bg-red-50 text-red-600 hover:bg-red-100" onClick={() => void removeSchedule(selectedSchedule.id)}>
                <Trash2 className="w-4 h-4" /> Excluir Horário
              </button>
              <button className="btn btn-secondary" onClick={() => setSelectedSchedule(null)}>Fechar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
