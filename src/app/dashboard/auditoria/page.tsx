"use client";

import { useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/utils";

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('audit_logs').select('*, profiles(full_name)').order('created_at', { ascending: false });
      setLogs(data || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="p-8 text-center"><Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--brand-primary)]" /></div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="card anim-fadeUp">
        <div className="p-6 border-b border-[var(--border-light)] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Auditoria</h1>
            <p className="text-zinc-500 text-sm mt-1">Histórico completo de ações no sistema</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input type="text" placeholder="Buscar..." className="field pl-10" />
          </div>
        </div>
        
        <div className="tbl-container">
          <table className="tbl">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Entidade</th>
                <th>Detalhes</th>
                <th className="hide-mobile">Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>
                    <div className="font-bold text-zinc-900">{l.profiles?.full_name || "Sistema"}</div>
                  </td>
                  <td><span className="badge badge-gray font-mono">{l.action}</span></td>
                  <td>{l.entity}</td>
                  <td className="text-sm text-zinc-600 max-w-xs truncate">{l.details}</td>
                  <td className="hide-mobile text-xs text-zinc-500">{formatDateTime(l.created_at)}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center p-8 text-zinc-500">Nenhum log de auditoria encontrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
