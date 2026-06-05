"use client";

import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader } from "@/components/ui";
import { createClassSession, getClassSessions, getClassTypes, getProfiles } from "@/lib/api";
import type { ClassSession, ClassType, Profile } from "@/lib/types";

function localInputValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return `${local.toISOString().slice(0, 10)}T08:00`;
}

export default function CalendarioPage() {
  const [anchor, setAnchor] = useState(new Date());
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [types, setTypes] = useState<ClassType[]>([]);
  const [instructors, setInstructors] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ class_type_id: "", instructor_id: "", start_at: localInputValue(), capacity: "10", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [nextSessions, nextTypes, profiles] = await Promise.all([getClassSessions(), getClassTypes(), getProfiles()]);
    setSessions(nextSessions);
    setTypes(nextTypes.filter((item) => item.active));
    setInstructors(profiles.filter((item) => item.active && (item.role === "professor" || item.role === "admin")));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const weekSessions = sessions.filter((session) => {
    const time = new Date(session.start_at).getTime();
    return time >= weekStart.getTime() && time < addDays(weekStart, 7).getTime();
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createClassSession({
        class_type_id: form.class_type_id,
        instructor_id: form.instructor_id || null,
        start_at: new Date(form.start_at).toISOString(),
        capacity: Number(form.capacity),
        notes: form.notes || null,
      });
      setOpen(false);
      setForm({ class_type_id: "", instructor_id: "", start_at: localInputValue(), capacity: "10", notes: "" });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel criar a aula.");
    }
  }

  if (loading) return <LoadingState label="Montando agenda do studio..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="OrganizaÃ§Ã£o de aulas" title="CalendÃ¡rio" description="Veja a semana completa, horÃ¡rios disponÃ­veis, responsÃ¡veis e alunos confirmados." action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova aula</button>} />
      <ErrorBanner message={error} />
      <section className="card">
        <div className="card-header">
          <div><h2>{format(weekStart, "MMMM 'de' yyyy", { locale: ptBR })}</h2><p>{weekSessions.length} aulas programadas nesta semana</p></div>
          <div className="flex gap-2"><button className="btn btn-secondary" onClick={() => setAnchor(new Date())}>Hoje</button><button className="icon-btn" aria-label="Semana anterior" onClick={() => setAnchor(addDays(anchor, -7))}><ChevronLeft className="h-4 w-4" /></button><button className="icon-btn" aria-label="PrÃ³xima semana" onClick={() => setAnchor(addDays(anchor, 7))}><ChevronRight className="h-4 w-4" /></button></div>
        </div>
        <div className="grid min-w-[980px] grid-cols-7 gap-px overflow-x-auto bg-[#e3e8f0]">
          {days.map((day) => {
            const daily = sessions.filter((session) => isSameDay(new Date(session.start_at), day));
            return <div key={day.toISOString()} className="min-h-[430px] bg-white p-3">
              <div className={`mb-3 rounded-xl p-3 ${isSameDay(day, new Date()) ? "bg-blue-600 text-white" : "bg-[#f7f9fc]"}`}>
                <span className="block text-[10px] font-bold uppercase tracking-wider">{format(day, "EEE", { locale: ptBR })}</span>
                <strong className="mt-1 block text-xl">{format(day, "dd")}</strong>
              </div>
              <div className="grid gap-2">
                {daily.map((session) => {
                  const booked = (session.bookings || []).filter((item) => item.status === "confirmed" || item.status === "attended").length;
                  return <article key={session.id} className="rounded-xl border border-[#e3e8f0] p-3" style={{ borderLeftColor: session.class_type?.color, borderLeftWidth: 3 }}>
                    <strong className="block text-xs">{session.class_type?.name || "Aula"}</strong>
                    <span className="mt-2 flex items-center gap-1.5 text-[10px] text-[#657085]"><Clock3 className="h-3 w-3" /> {format(new Date(session.start_at), "HH:mm")} - {format(new Date(session.end_at), "HH:mm")}</span>
                    <span className="mt-1 flex items-center gap-1.5 text-[10px] text-[#657085]"><Users className="h-3 w-3" /> {booked}/{session.capacity} confirmados</span>
                    {session.instructor?.full_name && <p className="mt-2 truncate text-[10px] font-semibold text-blue-600">{session.instructor.full_name}</p>}
                  </article>;
                })}
                {!daily.length && <p className="py-5 text-center text-[10px] text-[#a0a9b8]">Sem aulas</p>}
              </div>
            </div>;
          })}
        </div>
      </section>
      {!sessions.length && <EmptyState icon={CalendarDays} title="Nenhuma aula programada" description="Crie o primeiro horÃ¡rio para comeÃ§ar a organizar a agenda dos alunos." />}

      <Modal open={open} onClose={() => setOpen(false)} title="Programar nova aula" description="O horÃ¡rio ficarÃ¡ disponÃ­vel para vincular aos alunos." size="sm">
        <form className="grid gap-4" onSubmit={submit}>
          <label><FieldLabel required>Tipo de aula</FieldLabel><select className="field" required value={form.class_type_id} onChange={(event) => { const type = types.find((item) => item.id === event.target.value); setForm({ ...form, class_type_id: event.target.value, capacity: String(type?.capacity || 10) }); }}><option value="">Selecione</option>{types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
          <label><FieldLabel>Professor responsÃ¡vel</FieldLabel><select className="field" value={form.instructor_id} onChange={(event) => setForm({ ...form, instructor_id: event.target.value })}><option value="">Sem responsÃ¡vel definido</option>{instructors.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}</select></label>
          <label><FieldLabel required>Data e horÃ¡rio</FieldLabel><input className="field" type="datetime-local" required value={form.start_at} onChange={(event) => setForm({ ...form, start_at: event.target.value })} /></label>
          <label><FieldLabel required>Capacidade</FieldLabel><input className="field" type="number" min={1} max={200} required value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} /></label>
          <label><FieldLabel>ObservaÃ§Ãµes</FieldLabel><textarea className="field" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          <div className="form-actions"><button className="btn btn-secondary" type="button" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary">Criar aula</button></div>
        </form>
      </Modal>
    </div>
  );
}
