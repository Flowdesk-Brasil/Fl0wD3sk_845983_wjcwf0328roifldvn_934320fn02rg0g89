"use client";

import { Activity, Eye, Fingerprint } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, LoadingState, Modal, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import { getAuditLogs } from "@/lib/api";
import type { AuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function summary(details: string) {
  try {
    const value = JSON.parse(details) as { before?: Record<string, unknown>; after?: Record<string, unknown>; new?: Record<string, unknown> };
    if (value.before && value.after) {
      const changed = Object.keys(value.after).filter((key) => JSON.stringify(value.before?.[key]) !== JSON.stringify(value.after?.[key]) && !["updated_at"].includes(key));
      return changed.length ? `Campos alterados: ${changed.slice(0, 5).join(", ")}${changed.length > 5 ? "..." : ""}` : "Registro atualizado sem alteraÃ§Ã£o material.";
    }
    if (value.new) return `Registro criado com ${Object.keys(value.new).length} campos.`;
  } catch {
    return details;
  }
  return details;
}

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { getAuditLogs().then((data) => { setLogs(data); setLoading(false); }); }, []);
  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return logs.filter((log) => !query || [log.action, log.entity, log.entity_id, log.details, log.profiles?.full_name, log.ip_address].some((value) => value?.toLowerCase().includes(query)));
  }, [logs, search]);
  if (loading) return <LoadingState label="Carregando trilha de auditoria..." />;
  return (
    <div className="page-stack">
      <PageHeader eyebrow="GovernanÃ§a" title="Auditoria" description="Rastreabilidade detalhada das alteraÃ§Ãµes, responsÃ¡veis e dados envolvidos." />
      <section className="card">
        <div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Buscar aÃ§Ã£o, entidade, usuÃ¡rio ou ID..." /><StatusBadge tone="blue">{logs.length} eventos</StatusBadge></div>
        {filtered.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>UsuÃ¡rio</th><th>AÃ§Ã£o</th><th>Entidade</th><th>Resumo</th><th className="hide-mobile">Data e hora</th><th>Detalhes</th></tr></thead>
          <tbody>{filtered.map((log) => <tr key={log.id}><td><strong className="text-xs text-[#172033]">{log.profiles?.full_name ?? "Sistema"}</strong><small className="mt-1 block text-[10px] text-[#8d97aa]">{log.ip_address || "IP nÃ£o registrado"}</small></td><td><StatusBadge tone={log.action === "DELETE" ? "red" : log.action === "UPDATE" ? "yellow" : "green"}>{log.action}</StatusBadge></td><td>{log.entity}<small className="mt-1 block max-w-40 truncate text-[10px] text-[#8d97aa]">{log.entity_id}</small></td><td className="max-w-sm">{summary(log.details)}</td><td className="hide-mobile">{formatDateTime(log.created_at)}</td><td><button className="icon-btn" aria-label="Ver detalhes" onClick={() => setSelected(log)}><Eye className="h-4 w-4" /></button></td></tr>)}</tbody>
        </table></div> : <EmptyState icon={Activity} title="Nenhum evento encontrado" description="As alteraÃ§Ãµes realizadas no sistema aparecerÃ£o aqui." />}
      </section>
      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Detalhes do evento" description={selected ? `${selected.action} em ${selected.entity}` : ""} size="lg">
        {selected && <div className="grid gap-4">
          <div className="grid gap-3 rounded-2xl bg-[#f7f9fc] p-4 text-xs sm:grid-cols-2"><div><span className="field-label">ResponsÃ¡vel</span><strong>{selected.profiles?.full_name || "Sistema"}</strong></div><div><span className="field-label">Data e hora</span><strong>{formatDateTime(selected.created_at)}</strong></div><div><span className="field-label">Entidade / ID</span><strong>{selected.entity} Â· {selected.entity_id || "Sem ID"}</strong></div><div><span className="field-label">EndereÃ§o IP</span><strong>{selected.ip_address || "NÃ£o registrado"}</strong></div></div>
          <div><span className="field-label">Carga registrada</span><pre className="max-h-[360px] overflow-auto rounded-2xl bg-[#111c2e] p-4 text-[11px] leading-5 text-blue-100">{(() => { try { return JSON.stringify(JSON.parse(selected.details), null, 2); } catch { return selected.details; } })()}</pre></div>
          <p className="flex items-center gap-2 text-[11px] text-[#657085]"><Fingerprint className="h-4 w-4 text-blue-600" /> Evento imutÃ¡vel registrado pela camada de auditoria.</p>
        </div>}
      </Modal>
    </div>
  );
}
