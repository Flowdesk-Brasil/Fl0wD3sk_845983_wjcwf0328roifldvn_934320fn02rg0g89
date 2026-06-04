"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { mockAuditLogs } from "@/lib/mockData";
import { formatDateTime } from "@/lib/utils";

const ACTION_CFG: Record<string, { badge: string; color: string }> = {
  CREATE: { badge:"badge-green",  color:"#22c55e" },
  UPDATE: { badge:"badge-orange", color:"#f97316" },
  DELETE: { badge:"badge-red",    color:"#ef4444" },
  CHECKIN:{ badge:"badge-purple", color:"#8b5cf6" },
  LOGIN:  { badge:"badge-blue",   color:"#3b82f6" },
  LOGOUT: { badge:"badge-gray",   color:"#71717a" },
};

const EXTRA = [
  { id:"l4", userId:"user-1", userName:"Admin Master",  action:"CREATE", entity:"Plan",    entityId:"plan-6",    details:"Criou plano Spinning — R$ 139,90/mês",                     ip:"192.168.1.100", createdAt:"2024-01-01T10:00:00Z" },
  { id:"l5", userId:"user-2", userName:"Maria Santos",  action:"CHECKIN",entity:"CheckIn", entityId:"checkin-1", details:"Check-in de Ana Carolina Silva — Acesso liberado",          ip:"192.168.1.101", createdAt:"2024-06-04T07:15:00Z" },
  { id:"l6", userId:"user-1", userName:"Admin Master",  action:"UPDATE", entity:"Student", entityId:"student-4", details:"Alterou status de Carlos Eduardo Souza para Inativo",       ip:"192.168.1.100", createdAt:"2024-03-01T10:00:00Z" },
];

const ALL_LOGS = [...mockAuditLogs, ...EXTRA].sort((a,b) =>
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
);

export default function AuditoriaPage() {
  const [search, setSearch] = useState("");
  const filtered = ALL_LOGS.filter(l => {
    const q = search.toLowerCase();
    return !q || l.userName.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.details.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-5 max-w-[1200px]">
      <div className="card anim-fadeUp">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5"
          style={{ borderBottom:"1px solid #1a1a1a" }}>
          <div>
            <h2 className="text-sm font-bold text-white">Logs de Auditoria</h2>
            <p className="text-xs mt-0.5" style={{ color:"#52525b" }}>{filtered.length} registros</p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color:"#52525b" }} />
            <input type="text" placeholder="Buscar..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="field pl-9 py-2 text-sm" id="audit-search" />
          </div>
        </div>
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Ação</th>
                <th className="hide-mobile">Entidade</th>
                <th>Detalhes</th>
                <th className="hide-mobile">IP</th>
                <th>Data/Hora</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(log => {
                const cfg = ACTION_CFG[log.action] ?? { badge:"badge-gray", color:"#71717a" };
                return (
                  <tr key={log.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background:"#8b5cf618", color:"#a78bfa" }}>
                          {log.userName[0]}
                        </div>
                        <span className="text-sm font-medium text-white">{log.userName}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${cfg.badge} font-mono`}>{log.action}</span>
                    </td>
                    <td className="hide-mobile">{log.entity}</td>
                    <td>
                      <span className="text-xs max-w-[200px] truncate block" style={{ color:"#71717a" }}>{log.details}</span>
                    </td>
                    <td className="hide-mobile">
                      <code className="text-[11px]" style={{ color:"#3f3f46" }}>{log.ip}</code>
                    </td>
                    <td>
                      <span className="text-[11px]" style={{ color:"#52525b" }}>{formatDateTime(log.createdAt)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
