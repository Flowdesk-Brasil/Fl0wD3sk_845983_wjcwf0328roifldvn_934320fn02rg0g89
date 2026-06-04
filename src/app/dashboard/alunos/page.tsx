"use client";

import { Download, Eye, Mail, Plus, RefreshCw, Send, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StudentQrCard } from "@/components/student-qr-card";
import { EmptyState, ErrorBanner, LoadingState, Modal, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import { getStudents, releaseStudentPortal, updateStudent } from "@/lib/api";
import type { Student, StudentStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

const statusLabel: Record<StudentStatus, string> = { active: "Ativo", inactive: "Inativo", blocked: "Bloqueado" };
const statusTone: Record<StudentStatus, "green" | "gray" | "red"> = { active: "green", inactive: "gray", blocked: "red" };

export default function AlunosPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | StudentStatus>("all");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setStudents(await getStudents());
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return students.filter((student) => {
      const matches = !query || [student.full_name, student.cpf, student.email, student.phone].some((value) => value?.toLowerCase().includes(query));
      return matches && (status === "all" || student.status === status);
    });
  }, [search, status, students]);

  function exportCsv() {
    const header = "Nome,CPF,E-mail,Telefone,Status\n";
    const content = filtered.map((student) => [student.full_name, student.cpf, student.email ?? "", student.phone, statusLabel[student.status]].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([header + content], { type: "text/csv;charset=utf-8" }));
    link.download = "alunos.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function changeStatus(nextStatus: StudentStatus) {
    if (!selected) return;
    const updated = await updateStudent(selected.id, { status: nextStatus });
    setStudents((current) => current.map((student) => student.id === updated.id ? updated : student));
    setSelected(updated);
  }

  async function releasePortal() {
    if (!selected) return;
    setWorking(true);
    setError(null);
    setMessage(null);
    try {
      const result = await releaseStudentPortal(selected.id);
      setMessage(`Acesso enviado para ${result.email}.`);
      await load();
      setSelected((current) => current ? { ...current, profile_id: result.profileId || current.profile_id } : current);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível liberar o portal.");
    } finally {
      setWorking(false);
    }
  }

  if (loading) return <LoadingState label="Carregando alunos..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Base de relacionamento" title="Alunos" description={`${students.length} pessoas cadastradas no workspace.`} action={<><button className="btn btn-secondary" onClick={exportCsv}><Download className="h-4 w-4" /> Exportar</button><Link href="/dashboard/alunos/novo" className="btn btn-primary"><Plus className="h-4 w-4" /> Novo aluno</Link></>} />
      <ErrorBanner message={error} />
      {message && <div className="success-banner"><Mail className="h-4 w-4" /> {message}</div>}
      <section className="card">
        <div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por nome, CPF ou contato..." /><div className="flex flex-wrap gap-1 rounded-xl bg-[#f3f6fb] p-1">{([["all", "Todos"], ["active", "Ativos"], ["inactive", "Inativos"], ["blocked", "Bloqueados"]] as const).map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${status === value ? "bg-white text-blue-600 shadow-sm" : "text-[#657085] hover:text-[#172033]"}`}>{label}</button>)}</div></div>
        {filtered.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Aluno</th><th className="hide-mobile">CPF</th><th className="hide-mobile">Telefone</th><th>Portal</th><th>Status</th><th>Ações</th></tr></thead>
          <tbody>{filtered.map((student) => <tr key={student.id}>
            <td><div className="flex items-center gap-3"><span className="avatar">{student.full_name[0]?.toUpperCase()}</span><span className="min-w-0"><strong className="block truncate text-xs text-[#172033]">{student.full_name}</strong><small className="mt-1 block truncate text-[10px] text-[#8d97aa]">{student.email || "Sem e-mail"}</small></span></div></td>
            <td className="hide-mobile">{student.cpf}</td><td className="hide-mobile">{student.phone}</td>
            <td><StatusBadge tone={student.profile_id ? "blue" : "gray"}>{student.profile_id ? "Liberado" : "Não liberado"}</StatusBadge></td>
            <td><StatusBadge tone={statusTone[student.status]}>{statusLabel[student.status]}</StatusBadge></td>
            <td><button className="icon-btn" onClick={() => { setSelected(student); setError(null); setMessage(null); }} title="Ver aluno"><Eye className="h-4 w-4" /></button></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon={Users} title="Nenhum aluno encontrado" description="Ajuste os filtros ou crie um novo cadastro para começar." />}
      </section>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.full_name ?? "Aluno"} description="QR Code, acesso ao portal e situação cadastral." size="lg">
        {selected && <div className="grid gap-5 lg:grid-cols-[250px_1fr]">
          <StudentQrCard code={selected.qr_code} name={selected.full_name} compact />
          <div className="grid content-start gap-5">
            <div className="grid grid-cols-2 gap-3 rounded-2xl bg-[#f7f9fc] p-4 text-xs"><div><span className="field-label">CPF</span><strong>{selected.cpf}</strong></div><div><span className="field-label">Nascimento</span><strong>{formatDate(selected.birth_date)}</strong></div><div><span className="field-label">Telefone</span><strong>{selected.phone}</strong></div><div><span className="field-label">E-mail</span><strong>{selected.email || "Não informado"}</strong></div></div>
            <div>
              <span className="field-label">Portal do aluno</span>
              <div className="flex flex-col gap-2">
                <button className="btn btn-primary w-fit" disabled={working || !selected.email} onClick={() => void releasePortal()}><Send className="h-4 w-4" /> {working ? "Enviando acesso..." : selected.profile_id ? "Reenviar acesso por e-mail" : "Liberar portal e enviar acesso"}</button>
                {selected.profile_id && <button className="btn btn-secondary w-fit" disabled={working || !selected.email} onClick={async () => {
                  setWorking(true);
                  setError(null);
                  setMessage(null);
                  try {
                    const { resetStudentPassword } = await import("@/lib/api");
                    const result = await resetStudentPassword(selected.id);
                    setMessage(`Link de redefinição de senha enviado para ${result.email}.`);
                  } catch (reason) {
                    setError(reason instanceof Error ? reason.message : "Erro ao enviar e-mail de redefinição.");
                  } finally {
                    setWorking(false);
                  }
                }}><Mail className="h-4 w-4" /> Enviar link para redefinir senha</button>}
              </div>
              {!selected.email && <p className="mt-2 text-xs text-red-600">Cadastre um e-mail para liberar o portal.</p>}
            </div>
            <div>
              <span className="field-label">Alterar situação</span>
              <div className="flex flex-wrap gap-2">
                {(["active", "inactive", "blocked"] as StudentStatus[]).map((nextStatus) => (
                  <button key={nextStatus} className={`btn ${selected.status === nextStatus ? "btn-primary" : "btn-secondary"}`} onClick={() => void changeStatus(nextStatus)}>
                    {selected.status === nextStatus && <RefreshCw className="h-3.5 w-3.5" />} {statusLabel[nextStatus]}
                  </button>
                ))}
              </div>
            </div>
            <div className="pt-2 border-t border-[#e3e8f0]">
              <Link href={`/dashboard/alunos/${selected.id}/editar`} className="btn btn-primary w-full justify-center">
                Editar Cadastro e Reconhecimento Facial
              </Link>
            </div>
          </div>
        </div>}
      </Modal>
    </div>
  );
}
