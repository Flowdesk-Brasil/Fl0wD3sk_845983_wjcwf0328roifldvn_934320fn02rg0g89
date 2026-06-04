"use client";

import { useEffect, useState } from "react";
import { BookOpen, Plus, Search, Eye, AlertTriangle, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { getEnrollments } from "@/lib/api";
import { formatDate } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; badge: string; icon: React.ElementType }> = {
  active:    { label: "Ativa",      badge: "badge-green",  icon: CheckCircle2 },
  suspended: { label: "Suspensa",   badge: "badge-orange", icon: AlertTriangle },
  cancelled: { label: "Cancelada",  badge: "badge-red",    icon: XCircle },
  expired:   { label: "Expirada",   badge: "badge-gray",   icon: Clock },
};

export default function MatriculasPage() {
  const [enrollments, setEnrollments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getEnrollments();
      setEnrollments(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center anim-fadeIn">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-zinc-500 font-medium">Carregando matrículas...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Matrículas</h1>
          <p className="text-zinc-500 text-sm mt-1">Gerencie os vínculos dos alunos com os planos</p>
        </div>
        <button className="btn btn-primary">
          <Plus className="w-4 h-4" /> Nova Matrícula
        </button>
      </div>

      <div className="card anim-fadeUp stagger-1">
        
        <div className="p-4 border-b border-[var(--border-light)] flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input type="text" placeholder="Buscar por número ou aluno..." className="field pl-10" />
          </div>
        </div>

        <div className="tbl-container">
          <table className="tbl">
            <thead>
              <tr>
                <th>Matrícula</th>
                <th>Aluno</th>
                <th className="hide-mobile">Plano</th>
                <th className="hide-mobile">Período</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.map(e => {
                const cfg = STATUS_CFG[e.status] || { label: e.status, badge: 'badge-gray', icon: Clock };
                const Icon = cfg.icon;
                return (
                  <tr key={e.id}>
                    <td>
                      <code className="px-2 py-1 bg-zinc-100 text-zinc-700 rounded-md font-mono text-xs font-bold">
                        {e.matricula_number}
                      </code>
                    </td>
                    <td>
                      <div className="font-bold text-zinc-900">{e.student?.full_name || "—"}</div>
                    </td>
                    <td className="hide-mobile">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: e.plan?.color || '#ccc' }} />
                        <span className="font-medium text-zinc-700">{e.plan?.name || "—"}</span>
                      </div>
                    </td>
                    <td className="hide-mobile text-sm text-zinc-600">
                      {formatDate(e.start_date)} até {formatDate(e.end_date)}
                    </td>
                    <td>
                      <div className={`badge ${cfg.badge}`}>
                        {cfg.label}
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center justify-end">
                        <button className="btn-icon bg-zinc-50 hover:bg-zinc-100"><Eye className="w-4 h-4 text-zinc-600" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {enrollments.length === 0 && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-zinc-300" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-1">Nenhuma matrícula registrada</h3>
              <p className="text-zinc-500 text-sm max-w-sm">Os vínculos dos alunos com os planos aparecerão aqui.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
