"use client";

import { BookOpen, PauseCircle, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import { createEnrollment, getEnrollments, getPlans, getStudents, updateEnrollmentStatus } from "@/lib/api";
import type { Enrollment, EnrollmentStatus, Plan, Student } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const labels: Record<EnrollmentStatus, string> = { active: "Ativa", suspended: "Suspensa", cancelled: "Cancelada", expired: "Expirada" };
const tones: Record<EnrollmentStatus, "green" | "yellow" | "red" | "gray"> = { active: "green", suspended: "yellow", cancelled: "red", expired: "gray" };
const emptyForm = { student_id: "", plan_id: "", start_date: new Date().toISOString().slice(0, 10) };

export default function MatriculasPage() {
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    const [nextEnrollments, nextStudents, nextPlans] = await Promise.all([getEnrollments(), getStudents(), getPlans()]);
    setEnrollments(nextEnrollments);
    setStudents(nextStudents.filter((student) => student.status === "active"));
    setPlans(nextPlans.filter((plan) => plan.active));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return enrollments.filter((item) => !query || item.matricula_number.toLowerCase().includes(query) || item.student?.full_name.toLowerCase().includes(query));
  }, [enrollments, search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await createEnrollment(form);
      setOpen(false);
      setForm(emptyForm);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a matrícula.");
    }
  }

  async function setStatus(id: string, status: EnrollmentStatus) {
    await updateEnrollmentStatus(id, status);
    await load();
  }

  if (loading) return <LoadingState label="Carregando matrículas..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Ciclo comercial" title="Matrículas" description="Vincule alunos aos planos e acompanhe a vigência dos contratos." action={<button className="btn btn-primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova matrícula</button>} />
      <section className="card">
        <div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Buscar matrícula ou aluno..." /><StatusBadge tone="blue">{enrollments.length} registros</StatusBadge></div>
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
                  {item.status === "active" ? <button className="icon-btn" title="Suspender" onClick={() => void setStatus(item.id, "suspended")}><PauseCircle className="h-4 w-4" /></button> : <button className="icon-btn" title="Reativar" onClick={() => void setStatus(item.id, "active")}><RotateCcw className="h-4 w-4" /></button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <EmptyState icon={BookOpen} title="Nenhuma matrícula encontrada" description="Crie uma matrícula para gerar cobrança e contrato automaticamente." />}
      </section>

      <Modal open={open} onClose={() => setOpen(false)} title="Nova matrícula" description="A cobrança inicial e o contrato serão gerados automaticamente.">
        <form className="grid gap-4" onSubmit={submit}>
          <ErrorBanner message={error} />
          <label><FieldLabel required>Aluno</FieldLabel><select className="field" required value={form.student_id} onChange={(event) => setForm({ ...form, student_id: event.target.value })}><option value="">Selecione um aluno</option>{students.map((student) => <option value={student.id} key={student.id}>{student.full_name}</option>)}</select></label>
          <label><FieldLabel required>Plano</FieldLabel><select className="field" required value={form.plan_id} onChange={(event) => setForm({ ...form, plan_id: event.target.value })}><option value="">Selecione um plano</option>{plans.map((plan) => <option value={plan.id} key={plan.id}>{plan.name}</option>)}</select></label>
          <label><FieldLabel required>Data de início</FieldLabel><input className="field" type="date" required value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></label>
          <div className="form-actions"><button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancelar</button><button className="btn btn-primary" type="submit">Criar matrícula</button></div>
        </form>
      </Modal>
    </div>
  );
}
