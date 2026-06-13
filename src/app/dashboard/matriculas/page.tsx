"use client";

import { Activity, BookOpen, PauseCircle, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import { createEnrollment, editEnrollment, getEnrollments, getPlans, getStudents, updateEnrollmentStatus, deleteEnrollment, getClassSchedules, getStudentClasses, linkStudentToClasses, getClassTypes } from "@/lib/api";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import type { Enrollment, EnrollmentStatus, Plan, Student, ClassSchedule, ClassType } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { todayInBrasilia } from "@/lib/brazil-date";

const labels: Record<EnrollmentStatus, string> = { active: "Ativa", suspended: "Suspensa", cancelled: "Cancelada", expired: "Expirada" };
const tones: Record<EnrollmentStatus, "green" | "yellow" | "red" | "gray"> = { active: "green", suspended: "yellow", cancelled: "red", expired: "gray" };
const emptyForm = { student_id: "", plan_id: [] as string[], start_date: todayInBrasilia() };

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

  async function load() {
    const [nextEnrollments, nextStudents, nextPlans, nextSchedules, nextClassTypes] = await Promise.all([getEnrollments(), getStudents(), getPlans(), getClassSchedules(), getClassTypes()]);
    setEnrollments(nextEnrollments);
    setStudents(nextStudents.filter((student) => student.status === "active"));
    setPlans(nextPlans.filter((plan) => plan.active));
    setAvailableSchedules(nextSchedules.filter(s => s.active));
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

  function openEdit(item: Enrollment) {
    setEditId(item.id);
    setForm({
      student_id: item.student_id,
      plan_id: [item.plan_id], // Ideally, if it was a combo plan, we'd need to decompose it. But for now we just show the combo plan or single plan
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
    // Não reseta form/editId aqui para manter dados se o usuário reabrir
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
    setError(null);
    try {
      const studentClasses = await getStudentClasses(studentId);
      setSelectedSchedules(studentClasses.map(sc => sc.class_schedule_id));
      setClassesModalOpen(true);
    } catch (e) {
      setError("Erro ao carregar aulas do aluno.");
    }
  }

  async function handleSaveClasses(e: FormEvent) {
    e.preventDefault();
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

  const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

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
          <div className="table-wrap"><table className="data-table">
            <thead><tr><th>Matrícula</th><th>Aluno</th><th className="hide-mobile">Plano</th><th className="hide-mobile">Vigência</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>{filtered.map((item) => (
              <tr key={item.id}>
                <td><code className="rounded-lg bg-[#f3f6fb] px-2 py-1 text-[10px] font-bold text-blue-600">{item.matricula_number}</code></td>
                <td><strong className="text-xs text-[#172033]">{item.student?.full_name ?? "Aluno removido"}</strong></td>
                <td className="hide-mobile"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: item.plan?.color }} />{item.plan?.name ?? "Plano removido"}</span></td>
                <td className="hide-mobile">{formatDate(item.start_date)} até {formatDate(item.end_date)}</td>
                <td><StatusBadge tone={tones[item.status]}>{labels[item.status]}</StatusBadge></td>
                <td><div className="flex gap-2">
                  <button className="icon-btn" title="Editar" onClick={() => openEdit(item)}><BookOpen className="h-4 w-4 text-blue-600" /></button>
                  <button className="icon-btn" title="Gerenciar Aulas" onClick={() => openManageClasses(item.student_id)}><Activity className="h-4 w-4 text-emerald-600" /></button>
                  {item.status === "active" ? <button className="icon-btn" title="Suspender" onClick={() => void setStatus(item.id, "suspended")}><PauseCircle className="h-4 w-4" /></button> : <button className="icon-btn" title="Reativar" onClick={() => void setStatus(item.id, "active")}><RotateCcw className="h-4 w-4" /></button>}
                  <button className="icon-btn" title="Deletar" onClick={() => void remove(item.id)}><Trash2 className="h-4 w-4 text-red-600" /></button>
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState icon={BookOpen} title="Nenhuma matrícula encontrada" description="Crie uma matrícula para gerar cobrança e contrato automaticamente." />}
      </section>

      <Modal open={open} onClose={handleCloseModal} title={editId ? "Editar matrícula" : "Nova matrícula"} description={editId ? "Atualize os planos e a vigência." : "A cobrança inicial e o contrato serão gerados automaticamente."}>
        <form className="grid gap-4" onSubmit={submit}>
          <ErrorBanner message={error} />
          <label><FieldLabel required>Aluno</FieldLabel><select className="field" required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })} disabled={!!editId}><option value="">Selecione um aluno</option>{students.map((student) => <option value={student.id} key={student.id}>{student.full_name}</option>)}</select></label>
          <div>
            <FieldLabel required>Planos (você pode selecionar mais de um)</FieldLabel>
            <div className="grid gap-2 mt-2 max-h-48 overflow-y-auto rounded-xl border border-[#e3e8f0] bg-[#fbfcfe] p-3">
              {plans.map((plan) => (
                <label key={plan.id} className="flex items-center gap-3 rounded-lg border border-transparent p-2 hover:bg-white hover:border-[#e3e8f0] cursor-pointer transition-colors">
                  <input 
                    type="checkbox" 
                    className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    checked={form.plan_id.includes(plan.id)}
                    onChange={(e) => {
                      const newPlans = e.target.checked 
                        ? [...form.plan_id, plan.id]
                        : form.plan_id.filter(id => id !== plan.id);
                      setForm({ ...form, plan_id: newPlans });
                    }}
                  />
                  <div className="flex flex-1 justify-between items-center">
                    <span className="text-sm font-semibold text-slate-700">{plan.name}</span>
                    <span className="text-xs font-bold text-blue-600">R$ {Number(plan.price).toFixed(2)}</span>
                  </div>
                </label>
              ))}
            </div>
            {form.plan_id.length > 0 && (
              <div className="mt-3 flex justify-between rounded-xl bg-blue-50 px-4 py-3 text-blue-800">
                <span className="text-sm font-semibold">Valor Total:</span>
                <span className="text-sm font-black">
                  R$ {form.plan_id.reduce((sum, id) => sum + Number(plans.find(p => p.id === id)?.price || 0), 0).toFixed(2)}
                </span>
              </div>
            )}
          </div>
          <label><FieldLabel required>Data de início</FieldLabel><input className="field" type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label>
            <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={handleCancel}>Cancelar</button><button className="btn btn-primary" type="submit" disabled={form.plan_id.length === 0}>{editId ? "Salvar matrícula" : "Criar matrícula"}</button></div>
        </form>
      </Modal>

      {/* Modal para gerenciar aulas */}
      <Modal open={classesModalOpen} onClose={() => setClassesModalOpen(false)} title="Gerenciar Aulas do Aluno" description="Marque os dias e horários que o aluno irá frequentar." size="lg">
        <form onSubmit={handleSaveClasses} className="grid gap-6">
          <ErrorBanner message={error} />
          
          <div className="grid gap-6 max-h-[60vh] overflow-y-auto pr-2">
            {availableClassTypes.map(classType => {
              const schedulesForType = availableSchedules.filter(s => s.class_type_id === classType.id);
              if (schedulesForType.length === 0) return null;
              
              return (
                <div key={classType.id} className="rounded-xl border border-[#e3e8f0] overflow-hidden">
                  <div className="bg-[#f8fafc] px-4 py-3 border-b border-[#e3e8f0] flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: classType.color || '#3b82f6' }} />
                    <h3 className="font-bold text-slate-800">{classType.name}</h3>
                  </div>
                  <div className="p-4 grid gap-2 md:grid-cols-2">
                    {schedulesForType.map(schedule => {
                      const label = `${WEEKDAYS[schedule.day_of_week]} às ${schedule.time}`;
                      const isChecked = selectedSchedules.includes(schedule.id);
                      return (
                        <label key={schedule.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-[#f7f9fc] ${isChecked ? "border-emerald-500 bg-[#ecfdf5]" : "border-[#e3e8f0]"}`}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 accent-emerald-600"
                            checked={isChecked}
                            onChange={(e) => {
                              setSelectedSchedules(curr =>
                                e.target.checked ? [...curr, schedule.id] : curr.filter(id => id !== schedule.id)
                              );
                            }}
                          />
                          <div className="flex flex-col">
                            <span className={`text-sm font-semibold ${isChecked ? "text-emerald-900" : "text-slate-700"}`}>{label}</span>
                            <span className="text-xs text-slate-500">{schedule.instructor?.full_name || "Sem professor"}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            
            {availableClassTypes.length === 0 && (
              <p className="text-center text-slate-500 py-8">Nenhuma aula ou horário cadastrado no sistema.</p>
            )}
          </div>

          <div className="form-actions flex justify-end gap-2 pt-4 border-t border-[#e3e8f0]">
            <button type="button" className="btn btn-secondary" onClick={() => setClassesModalOpen(false)}>Cancelar</button>
            <button className="btn btn-primary bg-emerald-600 hover:bg-emerald-700" type="submit" disabled={savingClasses}>
              {savingClasses ? "Salvando..." : "Salvar aulas"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
