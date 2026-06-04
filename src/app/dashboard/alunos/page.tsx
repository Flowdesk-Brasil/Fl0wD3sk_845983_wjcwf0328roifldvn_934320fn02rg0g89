"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Users, Plus, Search, Eye, Edit, Download,
  Phone, Mail, MapPin, X, Calendar, Activity,
  ChevronRight
} from "lucide-react";
import { mockStudents } from "@/lib/mockData";
import { Student, StudentStatus } from "@/lib/types";
import { formatDate, maskCPF, maskPhone, getIMCClassification } from "@/lib/utils";

const STATUS_MAP: Record<StudentStatus, { label: string; badge: string }> = {
  active:   { label: "Ativo",      badge: "badge-green"  },
  inactive: { label: "Inativo",    badge: "badge-gray"   },
  blocked:  { label: "Bloqueado",  badge: "badge-red"    },
};

export default function AlunosPage() {
  const [students] = useState<Student[]>(mockStudents);
  const [search, setSearch]       = useState("");
  const [status, setStatus]       = useState<StudentStatus | "all">("all");
  const [detail, setDetail]       = useState<Student | null>(null);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const match = !q || s.fullName.toLowerCase().includes(q)
      || s.cpf.includes(q) || s.email.toLowerCase().includes(q)
      || s.phone.includes(q);
    return match && (status === "all" || s.status === status);
  });

  const counts = {
    total:    students.length,
    active:   students.filter(s => s.status === "active").length,
    inactive: students.filter(s => s.status === "inactive").length,
    blocked:  students.filter(s => s.status === "blocked").length,
  };

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total",      val: counts.total,    color: "#8b5cf6" },
          { label: "Ativos",     val: counts.active,   color: "#22c55e" },
          { label: "Inativos",   val: counts.inactive, color: "#71717a" },
          { label: "Bloqueados", val: counts.blocked,  color: "#ef4444" },
        ].map((s, i) => (
          <div key={s.label} className={`card p-4 anim-fadeUp stagger-${i+1}`}>
            <div className="text-2xl font-black" style={{ color: s.color }}>{s.val}</div>
            <div className="text-xs mt-1" style={{ color: "#71717a" }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="card anim-fadeUp stagger-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5"
          style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div>
            <h2 className="text-sm font-bold text-white">Cadastro de Alunos</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>{filtered.length} alunos</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost text-xs py-2 px-3">
              <Download className="w-3.5 h-3.5" /> Exportar
            </button>
            <Link href="/dashboard/alunos/novo" className="btn btn-primary text-xs py-2 px-3">
              <Plus className="w-3.5 h-3.5" /> Novo Aluno
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4"
          style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#52525b" }} />
            <input type="text" placeholder="Buscar..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="field pl-9 py-2 text-sm" id="student-search" />
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {(["all","active","inactive","blocked"] as const).map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`tab-item text-xs py-1.5 px-3 flex-none ${status === s ? "active" : ""}`}>
                {s === "all" ? "Todos" : STATUS_MAP[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Aluno</th>
                <th className="hide-mobile">CPF</th>
                <th className="hide-mobile">Contato</th>
                <th className="hide-mobile">Cidade</th>
                <th>Status</th>
                <th className="hide-mobile">Cadastro</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const sc = STATUS_MAP[s.status];
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{
                            background: s.status === "active" ? "#22c55e18" : "#52525b18",
                            color: s.status === "active" ? "#4ade80" : "#71717a",
                          }}>
                          {s.fullName[0]}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-white truncate max-w-[160px]">{s.fullName}</div>
                          <div className="text-[11px] truncate max-w-[160px]" style={{ color: "#52525b" }}>{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="hide-mobile">{maskCPF(s.cpf)}</td>
                    <td className="hide-mobile">{maskPhone(s.phone)}</td>
                    <td className="hide-mobile">{s.city}/{s.state}</td>
                    <td><span className={`badge ${sc.badge}`}>{sc.label}</span></td>
                    <td className="hide-mobile">{formatDate(s.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetail(s)} className="btn-icon" title="Ver">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <Link href={`/dashboard/alunos/${s.id}/editar`} className="btn-icon" title="Editar">
                          <Edit className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!filtered.length && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Users className="w-10 h-10" style={{ color: "#27272a" }} />
              <p className="text-sm font-medium" style={{ color: "#52525b" }}>Nenhum aluno encontrado</p>
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {detail && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal-box max-w-2xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-black"
                  style={{ background: "#8b5cf620", color: "#a78bfa" }}>
                  {detail.fullName[0]}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{detail.fullName}</h3>
                  <span className={`badge mt-1 ${STATUS_MAP[detail.status].badge}`}>
                    {STATUS_MAP[detail.status].label}
                  </span>
                </div>
              </div>
              <button className="btn-icon" onClick={() => setDetail(null)}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tabs content */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              {[
                { label: "CPF",        val: maskCPF(detail.cpf) },
                { label: "RG",         val: detail.rg || "—" },
                { label: "Nascimento", val: formatDate(detail.birthDate) },
                { label: "Sexo",       val: detail.gender === "M" ? "Masculino" : detail.gender === "F" ? "Feminino" : "Outro" },
                { label: "Telefone",   val: maskPhone(detail.phone) },
                { label: "WhatsApp",   val: maskPhone(detail.whatsapp) },
                { label: "E-mail",     val: detail.email },
                { label: "Endereço",   val: `${detail.street}, ${detail.number}${detail.complement ? ` – ${detail.complement}` : ""}` },
                { label: "Cidade",     val: `${detail.city} / ${detail.state}` },
                { label: "CEP",        val: detail.cep },
              ].map(f => (
                <div key={f.label} className="p-3 rounded-xl" style={{ background: "#111", border: "1px solid #1a1a1a" }}>
                  <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#3f3f46" }}>{f.label}</div>
                  <div className="text-sm text-white font-medium">{f.val}</div>
                </div>
              ))}
            </div>

            {/* Physical */}
            {(detail.weight || detail.height) && (
              <div className="p-4 rounded-xl mb-4" style={{ background: "#8b5cf608", border: "1px solid #8b5cf620" }}>
                <p className="text-[10px] uppercase tracking-wide font-semibold mb-3" style={{ color: "#8b5cf6" }}>Dados Físicos</p>
                <div className="flex gap-6">
                  {[
                    { l: "Peso", v: detail.weight ? `${detail.weight} kg` : "—" },
                    { l: "Altura", v: detail.height ? `${detail.height} cm` : "—" },
                    { l: "IMC", v: detail.imc ? detail.imc.toFixed(1) : "—" },
                  ].map(f => (
                    <div key={f.l}>
                      <div className="text-xl font-black text-white">{f.v}</div>
                      <div className="text-xs" style={{ color: "#52525b" }}>{f.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Emergency */}
            {detail.emergencyContact && (
              <div className="p-3 rounded-xl mb-4" style={{ background: "#111", border: "1px solid #1a1a1a" }}>
                <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#3f3f46" }}>Contato de Emergência</div>
                <div className="text-sm text-white">{detail.emergencyContact} · {maskPhone(detail.emergencyPhone ?? "")}</div>
              </div>
            )}

            <div className="flex gap-2 mt-2">
              <Link href={`/dashboard/alunos/${detail.id}/editar`}
                className="btn btn-primary flex-1 text-sm">
                <Edit className="w-4 h-4" /> Editar Aluno
              </Link>
              <button onClick={() => setDetail(null)} className="btn btn-ghost text-sm">Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
