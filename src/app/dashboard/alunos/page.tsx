"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Plus, Search, Eye, Edit, Download, X } from "lucide-react";
import { getStudents } from "@/lib/api";
import { formatDate } from "@/lib/utils";

export default function AlunosPage() {
  const [students, setStudents] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getStudents();
      setStudents(data);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const match = !q || s.full_name?.toLowerCase().includes(q) || s.cpf?.includes(q);
    return match && (status === "all" || s.status === status);
  });

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center anim-fadeIn">
        <div className="w-10 h-10 border-4 border-zinc-200 border-t-[var(--brand-primary)] rounded-full animate-spin mb-4" />
        <p className="text-zinc-500 font-medium">Carregando alunos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Alunos</h1>
          <p className="text-zinc-500 text-sm mt-1">Gerencie os cadastros do seu Studio</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <Link href="/dashboard/alunos/novo" className="btn btn-primary">
            <Plus className="w-4 h-4" /> Novo Aluno
          </Link>
        </div>
      </div>

      {/* Main Card */}
      <div className="card anim-fadeUp stagger-1">
        
        {/* Filters */}
        <div className="p-4 border-b border-[var(--border-light)] flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input type="text" placeholder="Buscar por nome ou CPF..." 
              value={search} onChange={e => setSearch(e.target.value)}
              className="field pl-10" 
            />
          </div>
          
          <div className="flex bg-zinc-100 p-1 rounded-xl w-full sm:w-auto">
            {(["all", "active", "inactive"].map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className={`flex-1 sm:flex-none px-4 py-2 text-sm font-semibold rounded-lg transition-all capitalize
                  ${status === s ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
              >
                {s === "all" ? "Todos" : s === "active" ? "Ativos" : "Inativos"}
              </button>
            )))}
          </div>
        </div>

        {/* Table */}
        <div className="tbl-container">
          <table className="tbl">
            <thead>
              <tr>
                <th>Aluno</th>
                <th className="hide-mobile">CPF</th>
                <th className="hide-mobile">Contato</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[var(--brand-primary)] bg-[var(--brand-light)]">
                        {s.full_name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div className="font-bold text-zinc-900">{s.full_name}</div>
                        <div className="text-[13px] text-zinc-500">{s.email || "Sem e-mail"}</div>
                      </div>
                    </div>
                  </td>
                  <td className="hide-mobile font-medium text-zinc-600">{s.cpf}</td>
                  <td className="hide-mobile text-zinc-600">{s.phone}</td>
                  <td>
                    <span className={`badge ${s.status === 'active' ? 'badge-green' : 'badge-gray'}`}>
                      {s.status === 'active' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button className="btn-icon bg-zinc-50 hover:bg-zinc-100 text-zinc-600"><Eye className="w-4 h-4" /></button>
                      <button className="btn-icon bg-zinc-50 hover:bg-zinc-100 text-[var(--brand-primary)]"><Edit className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filtered.length === 0 && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-zinc-300" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-1">Nenhum aluno encontrado</h3>
              <p className="text-zinc-500 text-sm max-w-sm">Tente ajustar seus filtros de busca ou cadastre um novo aluno no sistema.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
