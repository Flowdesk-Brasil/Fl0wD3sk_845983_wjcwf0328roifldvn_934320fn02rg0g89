"use client";

import { Activity, BookOpen, CalendarDays, Check, CheckCircle2, Clock3, PauseCircle, Plus, RotateCcw, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import { createEnrollment, deleteEnrollment, editEnrollment, getClassSchedules, getClassTypes, getEnrollments, getPlans, getStudentClasses, getStudents, linkStudentToClasses, updateEnrollmentStatus } from "@/lib/api";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import type { ClassSchedule, ClassType, Enrollment, EnrollmentStatus, Plan, Student } from "@/lib/types";
import { todayInBrasilia } from "@/lib/brazil-date";
import { formatDate } from "@/lib/utils";

const labels: Record<EnrollmentStatus, string> = { active: "Ativa", suspended: "Suspensa", cancelled: "Cancelada", expired: "Expirada" };
const tones: Record<EnrollmentStatus, "green" | "yellow" | "red" | "gray"> = { active: "green", suspended: "yellow", cancelled: "red", expired: "gray" };
const emptyForm = { student_id: "", plan_id: [] as string[], start_date: todayInBrasilia() };
const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function scheduleTime(time?: string | null) {
  return time ? time.slice(0, 5) : "--:--";
}

export default function MatriculasPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<"all" | EnrollmentStatus>("all");

  const [classesModalOpen, setClassesModalOpen] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [availableSchedules, setAvailableSchedules] = useState<ClassSchedule[]>([]);
  const [availableClassTypes, setAvailableClassTypes] = useState<ClassType[]>([]);
  const [selectedSchedules, setSelectedSchedules] = useState<string[]>([]);
  const [savingClasses, setSavingClasses] = useState(false);
  const [classDayFilter, setClassDayFilter] = useState<"all" | number>("all");
  const [classTypeFilter, setClassTypeFilter] = useState("all");

  async function load() {
    const [nextEnrollments, nextStudents, nextPlans, nextSchedules, nextClassTypes] = await Promise.all([
      getEnrollments(),
      getStudents(),
      getPlans(),
      getClassSchedules(),
      getClassTypes(),
    ]);
    setEnrollments(nextEnrollments);
    setStudents(nextStudents.filter((student) => student.status === "active"));
    setPlans(nextPlans.filter((plan) => plan.active));
    setAvailableSchedules(nextSchedules.filter((schedule) => schedule.active));
    setAvailableClassTypes(nextClassTypes);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);
  useRealtimeSync(load);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return enrollments.filter((item) => {
      const matchSearch = !query || item.matricula_number.toLowerCase().includes(query) || item.student?.full_name.toLowerCase().includes(query);
      const matchStatus = statusFilter === "all" ? item.status !== "cancelled" : item.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [enrollments, search, statusFilter]);

  const selectedStudent = useMemo(
    () => students.find((student) => student.id === selectedStudentId) ?? null,
    [selectedStudentId, students],
  );
  const classTypesById = useMemo(
    () => new Map(availableClassTypes.map((type) => [type.id, type])),
    [availableClassTypes],
  );
  const activeClassTypes = useMemo(
    () => availableClassTypes.filter((type) => availableSchedules.some((schedule) => schedule.class_type_id === type.id)),
    [availableClassTypes, availableSchedules],
  );
  const filteredClassSchedules = useMemo(() => {
    return [...availableSchedules]
      .filter((schedule) => classDayFilter === "all" || schedule.day_of_week === classDayFilter)
      .filter((schedule) => classTypeFilter === "all" || schedule.class_type_id === classTypeFilter)
      .sort((a, b) => {
        const dayA = WEEKDAY_ORDER.indexOf(a.day_of_week);
        const dayB = WEEKDAY_ORDER.indexOf(b.day_of_week);
        if (dayA !== dayB) return dayA - dayB;
        return String(a.time || "").localeCompare(String(b.time || ""));
      });
  }, [availableSchedules, classDayFilter, classTypeFilter]);
  const schedulesByDay = useMemo(() => WEEKDAY_ORDER
    .map((day) => ({ day, schedules: filteredClassSchedules.filter((schedule) => schedule.day_of_week === day) }))
    .filter((group) => group.schedules.length > 0), [filteredClassSchedules]);
  const selectedScheduleSet = useMemo(() => new Set(selectedSchedules), [selectedSchedules]);
  const visibleScheduleIds = useMemo(() => filteredClassSchedules.map((schedule) => schedule.id), [filteredClassSchedules]);
  const visibleSelectedCount = visibleScheduleIds.filter((id) => selectedScheduleSet.has(id)).length;

  function openEdit(item: Enrollment) {
    setEditId(item.id);
    setForm({
      student_id: item.student_id,
      plan_id: [item.plan_id],
      start_date: item.start_date,
    });
    setOpen(true);
  }

  function openCreate() {
    setEditId(null);
    setForm(emptyForm);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      if (editId) {
        await editEnrollment(editId, form);
      } else {
        await createEnrollment(form);
      }
      setOpen(false);
      setForm(emptyForm);
      setEditId(null);
      setError(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a matrícula.");
    }
  }

  function handleCloseModal() {
    setOpen(false);
  }

  function handleCancel() {
    setOpen(false);
    setForm(emptyForm);
    setEditId(null);
    setError(null);
  }

  async function setStatus(id: string, status: EnrollmentStatus) {
    await updateEnrollmentStatus(id, status);
    await load();
  }

  async function remove(id: string) {
    if (!window.confirm("Deseja realmente cancelar esta matrícula? Os pagamentos futuros em aberto serão cancelados, mas o histórico e pagamentos já realizados serão mantidos.")) return;
    try {
      await deleteEnrollment(id);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao cancelar matrícula.");
    }
  }

  async function openManageClasses(studentId: string) {
    setSelectedStudentId(studentId);
    setClassDayFilter("all");
    setClassTypeFilter("all");
    setError(null);
    try {
      const studentClasses = await getStudentClasses(studentId);
      setSelectedSchedules(studentClasses.map((item) => item.class_schedule_id));
      setClassesModalOpen(true);
    } catch {
      setError("Erro ao carregar aulas do aluno.");
    }
  }

  function closeClassesModal() {
    setClassesModalOpen(false);
    setClassDayFilter("all");
    setClassTypeFilter("all");
    setError(null);
  }

  async function handleSaveClasses(event: FormEvent) {
    event.preventDefault();
    if (!selectedStudentId) return;
    setSavingClasses(true);
    setError(null);
    try {
      await linkStudentToClasses(selectedStudentId, selectedSchedules);
      setClassesModalOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Erro ao salvar aulas.");
    } finally {
      setSavingClasses(false);
    }
  }

  function updateClassSelection(ids: string[], checked: boolean) {
    const idSet = new Set(ids);
    setSelectedSchedules((current) => {
      if (checked) return [...new Set([...current, ...ids])];
      return current.filter((id) => !idSet.has(id));
    });
  }

  function toggleClassSchedule(scheduleId: string) {
    setSelectedSchedules((current) => current.includes(scheduleId)
      ? current.filter((id) => id !== scheduleId)
      : [...current, scheduleId]);
  }

  if (loading) return <LoadingState label="Carregando matrículas..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Ciclo comercial" title="Matrículas" description="Vincule alunos aos planos e acompanhe a vigência dos contratos." action={<button className="btn btn-primary" onClick={openCreate}><Plus className="h-4 w-4" /> Nova matrícula</button>} />
      <section className="card">
        <div className="table-toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Buscar matrícula ou aluno..." />
          <div className="flex flex-wrap gap-1 rounded-xl bg-[#f3f6fb] p-1">
            {([["all", "Ativas e Suspensas"], ["active", "Ativas"], ["suspended", "Suspensas"], ["cancelled", "Canceladas"], ["expired", "Expiradas"]] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${statusFilter === value ? "bg-white text-blue-600 shadow-sm" : "text-[#657085] hover:text-[#172033]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Matrícula</th><th>Aluno</th><th className="hide-mobile">Plano</th><th className="hide-mobile">Vigência</th><th>Status</th><th>Ações</th></tr></thead>
              <tbody>{filtered.map((item) => (
                <tr key={item.id}>
                  <td><code className="rounded-lg bg-[#f3f6fb] px-2 py-1 text-[10px] font-bold text-blue-600">{item.matricula_number}</code></td>
                  <td><strong className="text-xs text-[#172033]">{item.student?.full_name ?? "Aluno removido"}</strong></td>
                  <td className="hide-mobile"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: item.plan?.color }} />{item.plan?.name ?? "Plano removido"}</span></td>
                  <td className="hide-mobile">{formatDate(item.start_date)} até {formatDate(item.end_date)}</td>
                  <td><StatusBadge tone={tones[item.status]}>{labels[item.status]}</StatusBadge></td>
                  <td>
                    <div className="flex gap-2">
                      <button className="icon-btn" title="Editar" onClick={() => openEdit(item)}><BookOpen className="h-4 w-4 text-blue-600" /></button>
                      <button className="icon-btn" title="Gerenciar aulas" onClick={() => openManageClasses(item.student_id)}><Activity className="h-4 w-4 text-emerald-600" /></button>
                      {item.status === "active"
                        ? <button className="icon-btn" title="Suspender" onClick={() => void setStatus(item.id, "suspended")}><PauseCircle className="h-4 w-4" /></button>
                        : <button className="icon-btn" title="Reativar" onClick={() => void setStatus(item.id, "active")}><RotateCcw className="h-4 w-4" /></button>}
                      <button className="icon-btn" title="Cancelar" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4 text-red-600" /></button>
                    </div>
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <EmptyState icon={BookOpen} title="Nenhuma matrícula encontrada" description="Crie uma matrícula para gerar cobrança e contrato automaticamente." />}
      </section>

      <Modal open={open} onClose={handleCloseModal} title={editId ? "Editar matrícula" : "Nova matrícula"} description={editId ? "Atualize os planos e a vigência." : "A cobrança inicial e o contrato serão gerados automaticamente."}>
        <form className="grid gap-4" onSubmit={submit}>
          <ErrorBanner message={error} />
          <label><FieldLabel required>Aluno</FieldLabel><select className="field" required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })} disabled={!!editId}><option value="">Selecione um aluno</option>{students.map((student) => <option value={student.id} key={student.id}>{student.full_name}</option>)}</select></label>
          <div>
            <FieldLabel required>Planos (você pode selecionar mais de um)</FieldLabel>
            <div className="mt-2 grid max-h-48 gap-2 overflow-y-auto rounded-xl border border-[#e3e8f0] bg-[#fbfcfe] p-3">
              {plans.map((plan) => (
                <label key={plan.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-[#e3e8f0] hover:bg-white">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    checked={form.plan_id.includes(plan.id)}
                    onChange={(event) => {
                      const nextPlans = event.target.checked
                        ? [...form.plan_id, plan.id]
                        : form.plan_id.filter((id) => id !== plan.id);
                      setForm({ ...form, plan_id: nextPlans });
                    }}
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">{plan.name}</span>
                    <span className="text-xs font-bold text-blue-600">R$ {Number(plan.price).toFixed(2)}</span>
                  </div>
                </label>
              ))}
            </div>
            {form.plan_id.length > 0 && (
              <div className="mt-3 flex justify-between rounded-xl bg-blue-50 px-4 py-3 text-blue-800">
                <span className="text-sm font-semibold">Valor total:</span>
                <span className="text-sm font-black">R$ {form.plan_id.reduce((sum, id) => sum + Number(plans.find((plan) => plan.id === id)?.price || 0), 0).toFixed(2)}</span>
              </div>
            )}
          </div>
          <label><FieldLabel required>Data de início</FieldLabel><input className="field" type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label>
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancelar</button>
            <button className="btn btn-primary" type="submit" disabled={form.plan_id.length === 0}>{editId ? "Salvar matrícula" : "Criar matrícula"}</button>
          </div>
        </form>
      </Modal>

      <Modal open={classesModalOpen} onClose={closeClassesModal} title="Gerenciar aulas do aluno" description="Escolha a rotina semanal por dia, tipo de aula e horário." size="lg">
        <form onSubmit={handleSaveClasses} className="grid gap-4">
          <ErrorBanner message={error} />

          <section className="rounded-2xl border border-[#dbe3ef] bg-[#f8fafc] p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-blue-600 shadow-sm">
                  <UserRound className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[#172033]">{selectedStudent?.full_name || "Aluno selecionado"}</p>
                  <p className="mt-0.5 text-xs font-semibold text-[#657085]">{selectedSchedules.length} aula(s) vinculada(s)</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                  <span className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8d97aa]">Visíveis</span>
                  <strong className="text-sm text-[#172033]">{visibleSelectedCount}/{visibleScheduleIds.length}</strong>
                </div>
                <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
                  <span className="block text-[10px] font-bold uppercase tracking-[.1em] text-[#8d97aa]">Total</span>
                  <strong className="text-sm text-[#172033]">{selectedSchedules.length}</strong>
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setClassDayFilter("all")} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${classDayFilter === "all" ? "bg-[#172033] text-white" : "bg-white text-[#657085] hover:text-[#172033]"}`}>Todos</button>
                {WEEKDAY_ORDER.map((day) => (
                  <button key={day} type="button" onClick={() => setClassDayFilter(day)} className={`shrink-0 rounded-full px-4 py-2 text-xs font-black transition ${classDayFilter === day ? "bg-[#172033] text-white" : "bg-white text-[#657085] hover:text-[#172033]"}`}>
                    {WEEKDAY_SHORT[day]}
                  </button>
                ))}
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1">
                <button type="button" onClick={() => setClassTypeFilter("all")} className={`shrink-0 rounded-full border px-4 py-2 text-xs font-black transition ${classTypeFilter === "all" ? "border-blue-600 bg-blue-50 text-blue-700" : "border-[#e3e8f0] bg-white text-[#657085] hover:text-[#172033]"}`}>Todas as aulas</button>
                {activeClassTypes.map((classType) => (
                  <button key={classType.id} type="button" onClick={() => setClassTypeFilter(classType.id)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-xs font-black transition ${classTypeFilter === classType.id ? "border-blue-600 bg-blue-50 text-blue-700" : "border-[#e3e8f0] bg-white text-[#657085] hover:text-[#172033]"}`}>
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: classType.color || "#1a73e8" }} />
                    {classType.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className="rounded-xl border border-[#dbe3ef] bg-white px-3 py-2 text-xs font-black text-[#172033] transition hover:border-blue-300 disabled:opacity-50" onClick={() => updateClassSelection(visibleScheduleIds, true)} disabled={!visibleScheduleIds.length}>
                Marcar visíveis
              </button>
              <button type="button" className="rounded-xl border border-[#dbe3ef] bg-white px-3 py-2 text-xs font-black text-[#172033] transition hover:border-blue-300 disabled:opacity-50" onClick={() => updateClassSelection(visibleScheduleIds, false)} disabled={!visibleScheduleIds.length}>
                Limpar visíveis
              </button>
              <button type="button" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-700 transition hover:border-red-200 disabled:opacity-50" onClick={() => setSelectedSchedules([])} disabled={!selectedSchedules.length}>
                Limpar tudo
              </button>
            </div>
          </section>

          <div className="max-h-[48vh] overflow-y-auto rounded-2xl border border-[#e3e8f0] bg-white p-3">
            {schedulesByDay.length ? (
              <div className="grid gap-4">
                {schedulesByDay.map(({ day, schedules }) => {
                  const ids = schedules.map((schedule) => schedule.id);
                  const selectedInDay = ids.filter((id) => selectedScheduleSet.has(id)).length;
                  return (
                    <section key={day} className="grid gap-2">
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f8fafc] px-3 py-2">
                        <div className="flex items-center gap-2">
                          <CalendarDays className="h-4 w-4 text-blue-600" />
                          <strong className="text-sm text-[#172033]">{WEEKDAYS[day]}</strong>
                          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black text-[#657085]">{selectedInDay}/{ids.length}</span>
                        </div>
                        <button type="button" className="rounded-lg px-2 py-1 text-[11px] font-black text-blue-600 hover:bg-white" onClick={() => updateClassSelection(ids, selectedInDay !== ids.length)}>
                          {selectedInDay === ids.length ? "Limpar dia" : "Marcar dia"}
                        </button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {schedules.map((schedule) => {
                          const classType = classTypesById.get(schedule.class_type_id);
                          const isChecked = selectedScheduleSet.has(schedule.id);
                          return (
                            <button
                              type="button"
                              key={schedule.id}
                              aria-pressed={isChecked}
                              onClick={() => toggleClassSchedule(schedule.id)}
                              className={`flex min-h-[82px] items-center gap-3 rounded-2xl border p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0 ${isChecked ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200" : "border-[#e3e8f0] bg-white hover:border-blue-200"}`}
                            >
                              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${isChecked ? "bg-emerald-500 text-white" : "bg-[#f3f6fb] text-[#8d97aa]"}`}>
                                {isChecked ? <Check className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="flex items-center gap-2">
                                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: classType?.color || "#1a73e8" }} />
                                  <strong className={`truncate text-sm ${isChecked ? "text-emerald-950" : "text-[#172033]"}`}>{scheduleTime(schedule.time)}</strong>
                                  <span className="truncate text-xs font-bold text-[#657085]">{classType?.name || "Aula"}</span>
                                </span>
                                <span className="mt-1 block truncate text-xs font-semibold text-[#657085]">{schedule.instructor?.full_name || "Professor não definido"}</span>
                                <span className="mt-1 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8d97aa]">{Number(schedule.capacity || 0) ? `${schedule.capacity} vagas` : "Sem limite definido"}</span>
                              </span>
                              {isChecked && <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />}
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : (
              <div className="grid min-h-[220px] place-items-center rounded-xl bg-[#f8fafc] p-8 text-center">
                <div>
                  <CalendarDays className="mx-auto h-10 w-10 text-[#8d97aa]" />
                  <p className="mt-3 text-sm font-black text-[#172033]">Nenhum horário encontrado</p>
                  <p className="mt-1 text-xs text-[#657085]">Ajuste o dia ou tipo de aula para ver outros horários.</p>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e3e8f0] pt-4">
            <p className="text-xs font-semibold text-[#657085]">{selectedSchedules.length} aula(s) serão salvas para este aluno.</p>
            <div className="flex gap-2">
              <button type="button" className="btn btn-secondary" onClick={closeClassesModal}>Cancelar</button>
              <button className="btn btn-primary bg-emerald-600 hover:bg-emerald-700" type="submit" disabled={savingClasses}>
                {savingClasses ? "Salvando..." : "Salvar aulas"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
