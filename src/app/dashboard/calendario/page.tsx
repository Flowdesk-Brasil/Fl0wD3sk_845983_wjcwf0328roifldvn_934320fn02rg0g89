"use client";

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BellRing, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, FileJson, Loader2, Plus, Trash2, Upload, UserRound, Users } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader } from "@/components/ui";
import { createClassSchedule, deleteAllClassSchedules, deleteClassSchedule, getClassSchedules, getClassTypes, getProfiles, saveClassType, updateClassSchedule } from "@/lib/api";
import { importColorForName, normalizeImportedName, parseClassScheduleImport } from "@/lib/class-schedule-import";
import type { ClassSchedule, ClassType, Profile } from "@/lib/types";

type NotifyResult = {
  message?: string;
  pendingStudents?: number;
  registeredDevices?: number;
  targetsWithoutDevice?: number;
  pushSent?: number;
  inAppNotifications?: number;
};

type ImportResult = {
  imported: number;
  updated: number;
  skipped: number;
  createdTypes: number;
  unmatchedProfessors: string[];
};

const WEEKDAYS = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function displayScheduleTime(value?: string | null) {
  return value ? value.slice(0, 5) : "--:--";
}

export default function CalendarioPage() {
  const [anchor, setAnchor] = useState(new Date());
  const [schedules, setSchedules] = useState<ClassSchedule[]>([]);
  const [classTypes, setClassTypes] = useState<ClassType[]>([]);
  const [instructors, setInstructors] = useState<Profile[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<ClassSchedule | null>(null);
  
  const [form, setForm] = useState({ class_type_id: "", instructor_id: "", day_of_week: "1", time: "18:00", capacity: "10" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [notifyResult, setNotifyResult] = useState<NotifyResult | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

  async function load() {
    const [nextSchedules, nextClassTypes, profiles] = await Promise.all([getClassSchedules(), getClassTypes(), getProfiles()]);
    setSchedules(nextSchedules);
    setClassTypes(nextClassTypes.filter((item) => item.active));
    setInstructors(profiles.filter((item) => item.active && (item.role === "professor" || item.role === "admin")));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = useMemo(() => eachDayOfInterval({ start: startDate, end: endDate }), [startDate, endDate]);
  const weeklyScheduleGroups = useMemo(() => WEEKDAYS.map((weekday) => ({
    ...weekday,
    schedules: schedules
      .filter((schedule) => schedule.day_of_week === weekday.value)
      .sort((a, b) => a.time.localeCompare(b.time)),
  })), [schedules]);

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

  async function importSchedules() {
    setError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const rows = parseClassScheduleImport(importText);
      const typeConfigs = new Map<string, { name: string; durationMinutes: number; capacity: number }>();

      for (const row of rows) {
        const key = normalizeImportedName(row.className);
        const current = typeConfigs.get(key);
        if (current && current.durationMinutes !== row.durationMinutes) {
          throw new Error(`A modalidade "${row.className}" possui duracoes diferentes no mesmo arquivo.`);
        }
        typeConfigs.set(key, {
          name: current?.name || row.className,
          durationMinutes: row.durationMinutes,
          capacity: Math.max(current?.capacity || 0, row.capacity),
        });
      }

      const [allTypes, profiles, currentSchedules] = await Promise.all([
        getClassTypes(),
        getProfiles(),
        getClassSchedules(),
      ]);

      const typesByName = new Map(allTypes.map((type) => [normalizeImportedName(type.name), type]));
      let createdTypes = 0;

      for (const [key, config] of typeConfigs) {
        const existing = typesByName.get(key);
        if (existing) {
          if (!existing.active) {
            const activated = await saveClassType({ id: existing.id, active: true }) as ClassType;
            typesByName.set(key, activated);
          }
          continue;
        }

        const created = await saveClassType({
          name: config.name,
          description: "Modalidade criada automaticamente pela importacao da grade.",
          duration_minutes: config.durationMinutes,
          capacity: config.capacity,
          color: importColorForName(config.name),
          active: true,
        }) as ClassType;
        typesByName.set(key, created);
        createdTypes += 1;
      }

      const availableInstructors = profiles.filter((profile) =>
        profile.active && (profile.role === "professor" || profile.role === "admin")
      );
      const unmatchedProfessors = new Set<string>();

      function resolveInstructor(name: string | null) {
        if (!name) return null;
        const query = normalizeImportedName(name);
        const exact = availableInstructors.find((profile) => normalizeImportedName(profile.full_name) === query);
        if (exact) return exact.id;

        const candidates = availableInstructors.filter((profile) => {
          const fullName = normalizeImportedName(profile.full_name);
          const firstName = normalizeImportedName(profile.full_name.split(/\s+/)[0] || "");
          return firstName === query || fullName.startsWith(query);
        });
        if (candidates.length === 1) return candidates[0].id;
        unmatchedProfessors.add(name);
        return null;
      }

      const schedulesByKey = new Map(currentSchedules.map((schedule) => [
        `${schedule.class_type_id}|${schedule.day_of_week}|${schedule.time.slice(0, 5)}`,
        schedule,
      ]));
      const pending: Array<{
        class_type_id: string;
        instructor_id: string | null;
        day_of_week: number;
        time: string;
        capacity: number;
      }> = [];
      const updates: Array<{
        id: string;
        instructor_id?: string | null;
        capacity?: number;
        active?: boolean;
      }> = [];
      let skipped = 0;

      for (const row of rows) {
        const type = typesByName.get(normalizeImportedName(row.className));
        if (!type) throw new Error(`Nao foi possivel preparar a modalidade "${row.className}".`);

        const instructorId = resolveInstructor(row.instructorName);
        const key = `${type.id}|${row.dayOfWeek}|${row.startTime}`;
        const existingSchedule = schedulesByKey.get(key);
        if (existingSchedule) {
          const changes: { id: string; instructor_id?: string | null; capacity?: number; active?: boolean } = { id: existingSchedule.id };
          if (instructorId && existingSchedule.instructor_id !== instructorId) changes.instructor_id = instructorId;
          if (existingSchedule.capacity !== row.capacity) changes.capacity = row.capacity;
          if (!existingSchedule.active) changes.active = true;

          if (Object.keys(changes).length > 1) updates.push(changes);
          else skipped += 1;
          continue;
        }

        pending.push({
          class_type_id: type.id,
          instructor_id: instructorId,
          day_of_week: row.dayOfWeek,
          time: row.startTime,
          capacity: row.capacity,
        });
      }

      for (let index = 0; index < updates.length; index += 10) {
        await Promise.all(updates.slice(index, index + 10).map(({ id, ...values }) => updateClassSchedule(id, values)));
      }
      for (let index = 0; index < pending.length; index += 10) {
        await Promise.all(pending.slice(index, index + 10).map((schedule) => createClassSchedule(schedule)));
      }

      setImportResult({
        imported: pending.length,
        updated: updates.length,
        skipped,
        createdTypes,
        unmatchedProfessors: [...unmatchedProfessors].sort(),
      });
      setImportText("");
      setImportOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel importar a grade.");
    } finally {
      setImporting(false);
    }
  }

  async function readImportFile(file?: File) {
    if (!file) return;
    setError(null);
    try {
      setImportText(await file.text());
    } catch {
      setError("Nao foi possivel ler o arquivo JSON.");
    }
  }

  async function removeAllSchedules() {
    if (!schedules.length || deletingAll) return;
    const confirmation = window.prompt(
      `Esta acao excluira os ${schedules.length} horarios da grade, os vinculos dos alunos e as presencas relacionadas. Digite EXCLUIR para confirmar.`,
    );
    if (confirmation?.trim().toUpperCase() !== "EXCLUIR") return;

    setDeletingAll(true);
    setError(null);
    try {
      const result = await deleteAllClassSchedules();
      setSelectedSchedule(null);
      setImportResult(null);
      await load();
      window.alert(`${result.deleted} horario(s) excluido(s) da grade.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel excluir toda a grade.");
    } finally {
      setDeletingAll(false);
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

  async function triggerNotifications() {
    if (!window.confirm("Isso verificará todas as aulas de hoje e enviará notificações Push para os alunos matriculados que ainda não foram notificados. Deseja continuar?")) return;
    setTriggering(true);
    try {
      const res = await fetch("/api/cron/notify-today");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao disparar notificações.");
      setNotifyResult(data);
    } catch (e: any) {
      setNotifyResult({ message: e.message || "Erro ao disparar notificacoes." });
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader 
        eyebrow="Organização de aulas" 
        title="Grade Fixa" 
        description="Crie a grade de aulas da semana. O sistema aplicará essa grade para todos os meses do ano automaticamente." 
        action={
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button className="btn whitespace-nowrap bg-orange-100 text-orange-600 hover:bg-orange-200" disabled={triggering} onClick={triggerNotifications}>
              <BellRing className="h-4 w-4" /> {triggering ? "Verificando..." : "Alertar alunos"}
            </button>
            <button className="btn btn-secondary whitespace-nowrap" onClick={() => { setError(null); setImportOpen(true); }}>
              <Upload className="h-4 w-4" /> Importar
            </button>
            <button className="btn whitespace-nowrap bg-red-50 text-red-600 hover:bg-red-100" disabled={deletingAll || !schedules.length} onClick={() => void removeAllSchedules()}>
              {deletingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {deletingAll ? "Excluindo..." : "Excluir tudo"}
            </button>
            <button className="btn btn-primary whitespace-nowrap" onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> Novo Horário
            </button>
          </div>
        } 
      />
      <ErrorBanner message={error} />

      {importResult && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <strong className="block text-sm">Grade importada</strong>
              <p className="mt-1 text-xs leading-5">
                {importResult.imported} horario(s) criado(s), {importResult.updated} atualizado(s), {importResult.skipped} duplicado(s) sem alteracao e {importResult.createdTypes} modalidade(s) criada(s).
              </p>
              {importResult.unmatchedProfessors.length > 0 && (
                <p className="mt-1 text-xs leading-5">
                  Sem perfil de professor correspondente: {importResult.unmatchedProfessors.join(", ")}. Cadastre esses nomes em Usuários e importe novamente para atualizar os horários.
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      {notifyResult && (
        <section className="rounded-2xl border border-orange-100 bg-orange-50 p-4 text-orange-950 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[.14em] text-orange-500">Resultado do alerta</p>
              <strong className="mt-1 block text-sm">{notifyResult.message || "Verificacao concluida."}</strong>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <span className="rounded-xl bg-white px-3 py-2 font-bold shadow-sm">Push: {notifyResult.pushSent ?? 0}</span>
              <span className="rounded-xl bg-white px-3 py-2 font-bold shadow-sm">App: {notifyResult.inAppNotifications ?? 0}</span>
              <span className="rounded-xl bg-white px-3 py-2 font-bold shadow-sm">Dispositivos: {notifyResult.registeredDevices ?? 0}</span>
              <span className="rounded-xl bg-white px-3 py-2 font-bold shadow-sm">Sem aparelho: {notifyResult.targetsWithoutDevice ?? 0}</span>
            </div>
          </div>
        </section>
      )}
      
      <section className="card overflow-hidden lg:hidden">
        <div className="border-b border-[#e3e8f0] px-4 py-4 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-black text-[#172033]">Agenda semanal</h2>
              <p className="mt-1 text-xs text-[#657085]">{schedules.length} horário(s) recorrente(s)</p>
            </div>
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <CalendarDays className="h-5 w-5" />
            </div>
          </div>
        </div>

        <div className="grid gap-5 p-3 sm:p-4">
          {weeklyScheduleGroups.map((group) => (
            <section key={group.value} className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-3 px-1">
                <strong className="text-sm text-[#172033]">{group.label}</strong>
                <span className="rounded-full bg-[#f3f6fb] px-2.5 py-1 text-[10px] font-black text-[#657085]">{group.schedules.length}</span>
              </div>

              {group.schedules.length ? (
                <div className="grid gap-2">
                  {group.schedules.map((schedule) => {
                    const booked = (schedule.student_classes || []).length;
                    return (
                      <button
                        key={schedule.id}
                        onClick={() => setSelectedSchedule(schedule)}
                        className="grid min-w-0 grid-cols-[54px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-2xl border border-[#e3e8f0] bg-white p-3 text-left shadow-[0_8px_28px_rgba(23,32,51,.05)] transition active:scale-[.99]"
                      >
                        <span
                          className="grid h-12 w-[54px] place-items-center rounded-xl text-xs font-black tabular-nums"
                          style={{ color: schedule.class_type?.color || "#1a73e8", backgroundColor: `${schedule.class_type?.color || "#1a73e8"}14` }}
                        >
                          {displayScheduleTime(schedule.time)}
                        </span>
                        <span className="min-w-0">
                          <strong className="block truncate text-sm text-[#172033]">{schedule.class_type?.name || "Aula"}</strong>
                          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-[#657085]">
                            <UserRound className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{schedule.instructor?.full_name || "Professor indefinido"}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#f3f6fb] px-2.5 py-1.5 text-[10px] font-black text-[#657085]">
                          <Users className="h-3.5 w-3.5" /> {booked}/{schedule.capacity}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-[#dbe3ef] bg-[#f8fafc] px-4 py-5 text-center text-xs font-semibold text-[#8d97aa]">
                  Nenhum horário
                </div>
              )}
            </section>
          ))}
        </div>
      </section>

      <section className="card hidden min-w-0 overflow-hidden lg:block">
        <div className="card-header min-w-0 border-b border-[#e3e8f0] pb-4">
          <div className="min-w-0">
            <h2 className="truncate capitalize">{format(monthStart, "MMMM 'de' yyyy", { locale: ptBR })}</h2>
            <p>Grade mensal dinâmica</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn btn-secondary whitespace-nowrap" onClick={() => setAnchor(new Date())}>Mês atual</button>
            <button className="icon-btn" aria-label="Mês anterior" onClick={() => setAnchor(addMonths(anchor, -1))}><ChevronLeft className="h-4 w-4" /></button>
            <button className="icon-btn" aria-label="Próximo mês" onClick={() => setAnchor(addMonths(anchor, 1))}><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-7 bg-[#f7f9fc] text-center text-[10px] font-bold uppercase tracking-wider text-[#657085]">
          {WEEKDAYS.map((weekday) => (
            <div key={weekday.value} className="min-w-0 truncate border-b border-r border-[#e3e8f0] px-1 py-3 last:border-r-0">
              {weekday.label.split("-")[0]}
            </div>
          ))}
        </div>

        <div className="grid min-w-0 grid-cols-7 gap-px bg-[#e3e8f0]">
          {days.map((day) => {
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isToday = isSameDay(day, new Date());
            const dailySchedules = schedules
              .filter((schedule) => schedule.day_of_week === day.getDay())
              .sort((a, b) => a.time.localeCompare(b.time));

            return (
              <div
                key={day.toISOString()}
                className={`min-w-0 overflow-hidden p-1.5 transition-colors xl:p-2 ${isCurrentMonth ? "bg-white" : "bg-slate-50"} ${isToday ? "ring-2 ring-inset ring-blue-500" : ""}`}
              >
                <div className="mb-1.5 flex justify-end">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${isToday ? "bg-blue-600 text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-400"}`}>
                    {format(day, "d")}
                  </span>
                </div>

                <div className="grid min-w-0 gap-1.5">
                  {dailySchedules.map((schedule) => {
                    const booked = (schedule.student_classes || []).length;
                    const color = schedule.class_type?.color || "#1a73e8";
                    return (
                      <button
                        key={schedule.id}
                        title={`${displayScheduleTime(schedule.time)} - ${schedule.class_type?.name || "Aula"} - ${schedule.instructor?.full_name || "Professor indefinido"}`}
                        onClick={() => setSelectedSchedule(schedule)}
                        className={`w-full min-w-0 overflow-hidden rounded-lg border border-transparent border-l-[3px] p-1.5 text-left transition hover:border-slate-200 hover:shadow-sm ${!isCurrentMonth ? "opacity-45" : ""}`}
                        style={{ borderLeftColor: color, backgroundColor: `${color}12` }}
                      >
                        <span className="flex min-w-0 items-baseline gap-1">
                          <strong className="shrink-0 text-[10px] font-black tabular-nums text-slate-900">{displayScheduleTime(schedule.time)}</strong>
                          <span className="min-w-0 truncate text-[10px] font-bold text-slate-700">{schedule.class_type?.name || "Aula"}</span>
                        </span>
                        <span className="mt-1 flex min-w-0 items-center justify-between gap-1 text-[9px] text-slate-500">
                          <span className="min-w-0 truncate">{schedule.instructor?.full_name || "Sem professor"}</span>
                          <span className="flex shrink-0 items-center gap-0.5 font-bold tabular-nums"><Users className="h-2.5 w-2.5" />{booked}/{schedule.capacity}</span>
                        </span>
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

      <Modal
        open={importOpen}
        onClose={() => { if (!importing) setImportOpen(false); }}
        title="Importar grade em JSON"
        description="Selecione um arquivo ou cole a lista de horários no formato informado."
        size="md"
      >
        <div className="grid gap-4">
          <ErrorBanner message={error} />

          <label className="flex min-h-24 cursor-pointer items-center justify-center gap-3 rounded-2xl border border-dashed border-[#cfd7e4] bg-[#f8fafc] px-4 text-center transition hover:border-blue-400 hover:bg-blue-50">
            <FileJson className="h-6 w-6 text-blue-600" />
            <span>
              <strong className="block text-sm text-[#172033]">Selecionar arquivo JSON</strong>
              <span className="mt-1 block text-xs text-[#657085]">O conteúdo será validado antes da importação.</span>
            </span>
            <input
              className="sr-only"
              type="file"
              accept=".json,application/json,text/json"
              disabled={importing}
              onChange={(event) => void readImportFile(event.target.files?.[0])}
            />
          </label>

          <label>
            <FieldLabel required>Conteúdo JSON</FieldLabel>
            <textarea
              className="field min-h-64 resize-y font-mono text-xs leading-5"
              value={importText}
              disabled={importing}
              onChange={(event) => setImportText(event.target.value)}
              placeholder='[{"diaSemana":"Segunda","horarioInicio":"07:00","horarioFim":"07:45","modalidade":"Pilates","capacidade":15,"professor":"Taty"}]'
            />
          </label>

          <div className="form-actions">
            <button className="btn btn-secondary" type="button" disabled={importing} onClick={() => setImportOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" type="button" disabled={importing || !importText.trim()} onClick={() => void importSchedules()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {importing ? "Importando..." : "Importar grade"}
            </button>
          </div>
        </div>
      </Modal>

      {/* MODAL DE CRIAÇÃO */}
      <Modal open={open} onClose={() => setOpen(false)} title="Programar novo horário fixo" description="Este horário se repetirá toda semana neste mesmo dia." size="sm">
        <form className="grid gap-4" onSubmit={submit}>
          <label><FieldLabel required>Modalidade / Aula</FieldLabel><select className="field" required value={form.class_type_id} onChange={(event) => { setForm({ ...form, class_type_id: event.target.value }); }}><option value="">Selecione uma aula</option>{classTypes.map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}</select></label>
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
        <Modal open={!!selectedSchedule} onClose={() => setSelectedSchedule(null)} title={`Turma de ${selectedSchedule.class_type?.name}`} description={`${WEEKDAYS.find(w => w.value === selectedSchedule.day_of_week)?.label} às ${displayScheduleTime(selectedSchedule.time)}`} size="md">
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
