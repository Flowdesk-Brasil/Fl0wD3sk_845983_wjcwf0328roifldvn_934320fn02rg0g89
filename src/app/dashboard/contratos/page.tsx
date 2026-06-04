"use client";

import { useEffect, useState } from "react";
import { ScrollText, CheckCircle2, Clock, Search, Eye, PenLine, FileText, X, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";

export default function ContratosPage() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('contracts')
        .select('*, student:students(full_name), plan:plans(name)');
      setContracts(data || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center anim-fadeIn">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-zinc-500 font-medium">Carregando contratos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Contratos Digitais</h1>
          <p className="text-zinc-500 text-sm mt-1">Gerencie os termos assinados pelos alunos</p>
        </div>
      </div>

      <div className="card anim-fadeUp stagger-1">
        <div className="p-4 border-b border-[var(--border-light)] flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input type="text" placeholder="Buscar por aluno..." className="field pl-10" />
          </div>
        </div>

        <div className="tbl-container">
          <table className="tbl">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Plano</th>
                <th className="hide-mobile">Gerado em</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => (
                <tr key={c.id}>
                  <td>
                    <div className="font-bold text-zinc-900">{c.student?.full_name || "—"}</div>
                  </td>
                  <td>
                    <span className="font-medium text-zinc-700">{c.plan?.name || "—"}</span>
                  </td>
                  <td className="hide-mobile text-sm text-zinc-600">
                    {formatDate(c.created_at)}
                  </td>
                  <td>
                    {c.status === "signed" ? (
                      <span className="badge badge-green">Assinado</span>
                    ) : (
                      <span className="badge badge-yellow">Pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {contracts.length === 0 && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
                <ScrollText className="w-8 h-8 text-zinc-300" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-1">Nenhum contrato</h3>
              <p className="text-zinc-500 text-sm max-w-sm">Os contratos gerados via matrícula aparecerão aqui.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
