"use client";

import { useState } from "react";
import {
  BookOpen, Plus, Search, Eye, X,
  CheckCircle2, XCircle, Clock, AlertTriangle,
  Calendar, User
} from "lucide-react";
import { mockEnrollments, mockStudents, mockPlans } from "@/lib/mockData";
import { Enrollment, EnrollmentStatus } from "@/lib/types";
import { formatDate } from "@/lib/utils";

type StatusKey = EnrollmentStatus | "all";

const STATUS_CFG: Record<EnrollmentStatus, { label: string; badge: string; icon: React.ElementType; color: string }> = {
  active:    { label: "Ativa",      badge: "badge-green",  icon: CheckCircle2,  color: "#22c55e" },
  suspended: { label: "Suspensa",   badge: "badge-orange", icon: AlertTriangle, color: "#f97316" },
  cancelled: { label: "Cancelada",  badge: "badge-red",    icon: XCircle,       color: "#ef4444" },
  expired:   { label: "Expirada",   badge: "badge-gray",   icon: Clock,         color: "#71717a" },
};

export default function MatriculasPage() {
  const [search, setSearch]   = useState("");
  const [filter, setFilter]   = useState<StatusKey>("all");
  const [newModal, setNew]     = useState(false);
  const [detail, setDetail]   = useState<Enrollment | null>(null);
  const [selStudent, setSelSt] = useState("");
  const [selPlan,   setSelPl] = useState("");
  const [selStart,  setStart]  = useState("");

  const enriched = mockEnrollments.map(e => ({
    ...e,
    student: mockStudents.find(s => s.id === e.studentId),
    plan:    mockPlans.find(p => p.id === e.planId),
  }));

  const filtered = enriched.filter(e => {
    const q = search.toLowerCase();
    const match = !q || e.student?.fullName.toLowerCase().includes(q) || e.matriculaNumber.includes(q);
    return match && (filter === "all" || e.status === filter);
  });

  const counts = {
    total:     mockEnrollments.length,
    active:    mockEnrollments.filter(e => e.status === "active").length,
    suspended: mockEnrollments.filter(e => e.status === "suspended").length,
    cancelled: mockEnrollments.filter(e => e.status === "cancelled").length,
  };

  const detailEnriched = detail ? enriched.find(e => e.id === detail.id) : null;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { l: "Total",      v: counts.total,     c: "#8b5cf6" },
          { l: "Ativas",     v: counts.active,    c: "#22c55e" },
          { l: "Suspensas",  v: counts.suspended, c: "#f97316" },
          { l: "Canceladas", v: counts.cancelled, c: "#ef4444" },
        ].map((s, i) => (
          <div key={s.l} className={`card p-4 anim-fadeUp stagger-${i+1}`}>
            <div className="text-2xl font-black" style={{ color: s.c }}>{s.v}</div>
            <div className="text-xs mt-1" style={{ color: "#71717a" }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div className="card anim-fadeUp stagger-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5"
          style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div>
            <h2 className="text-sm font-bold text-white">Matrículas</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>{filtered.length} matrículas</p>
          </div>
          <button onClick={() => setNew(true)} className="btn btn-primary text-xs py-2 px-3">
            <Plus className="w-3.5 h-3.5" /> Nova Matrícula
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4"
          style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#52525b" }} />
            <input type="text" placeholder="Buscar..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="field pl-9 py-2 text-sm" id="enroll-search" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {(["all","active","suspended","cancelled","expired"] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`tab-item text-xs py-1.5 px-3 flex-none ${filter === s ? "active" : ""}`}>
                {s === "all" ? "Todas" : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Nº Matrícula</th>
                <th>Aluno</th>
                <th className="hide-mobile">Plano</th>
                <th className="hide-mobile">Início</th>
                <th className="hide-mobile">Vencimento</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const cfg = STATUS_CFG[e.status];
                const Icon = cfg.icon;
                return (
                  <tr key={e.id}>
                    <td>
                      <code className="text-xs px-2 py-1 rounded-md font-mono"
                        style={{ background: "#8b5cf618", color: "#a78bfa" }}>
                        {e.matriculaNumber}
                      </code>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "#8b5cf618", color: "#a78bfa" }}>
                          {e.student?.fullName?.[0]}
                        </div>
                        <span className="text-sm font-medium text-white">
                          {e.student?.fullName?.split(" ").slice(0,2).join(" ")}
                        </span>
                      </div>
                    </td>
                    <td className="hide-mobile">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: e.plan?.color ?? "#8b5cf6" }} />
                        <span>{e.plan?.name}</span>
                      </div>
                    </td>
                    <td className="hide-mobile">{formatDate(e.startDate)}</td>
                    <td className="hide-mobile">{formatDate(e.endDate)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3 h-3" style={{ color: cfg.color }} />
                        <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
                      </div>
                    </td>
                    <td>
                      <button onClick={() => setDetail(e)} className="btn-icon">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Enrollment Modal */}
      {newModal && (
        <div className="modal-backdrop" onClick={() => setNew(false)}>
          <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-white">Nova Matrícula</h3>
              <button className="btn-icon" onClick={() => setNew(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#52525b" }}>
                  Aluno *
                </label>
                <select className="field" id="ne-student" value={selStudent} onChange={e => setSelSt(e.target.value)}>
                  <option value="">Selecione um aluno...</option>
                  {mockStudents.map(s => <option key={s.id} value={s.id}>{s.fullName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#52525b" }}>
                  Plano *
                </label>
                <select className="field" id="ne-plan" value={selPlan} onChange={e => setSelPl(e.target.value)}>
                  <option value="">Selecione um plano...</option>
                  {mockPlans.map(p => <option key={p.id} value={p.id}>{p.name} — R$ {p.price.toFixed(2)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "#52525b" }}>
                  Data de Início
                </label>
                <input type="date" className="field" id="ne-start" value={selStart} onChange={e => setStart(e.target.value)} />
              </div>
              <div className="flex gap-2 pt-2">
                <button className="btn btn-primary flex-1 text-sm">
                  <Plus className="w-4 h-4" /> Criar Matrícula
                </button>
                <button onClick={() => setNew(false)} className="btn btn-ghost text-sm">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detail && detailEnriched && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal-box max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-white">Detalhes da Matrícula</h3>
              <button className="btn-icon" onClick={() => setDetail(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-xl" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
                <code className="text-lg font-mono font-bold" style={{ color: "#a78bfa" }}>
                  {detailEnriched.matriculaNumber}
                </code>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: "Aluno",      v: detailEnriched.student?.fullName },
                  { l: "Plano",      v: detailEnriched.plan?.name },
                  { l: "Início",     v: formatDate(detail.startDate) },
                  { l: "Vencimento", v: formatDate(detail.endDate) },
                ].map(f => (
                  <div key={f.l} className="p-3 rounded-xl" style={{ background: "#111", border: "1px solid #1a1a1a" }}>
                    <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#3f3f46" }}>{f.l}</div>
                    <div className="text-sm text-white font-medium">{f.v}</div>
                  </div>
                ))}
              </div>
              {(() => {
                const cfg = STATUS_CFG[detail.status];
                const Icon = cfg.icon;
                return (
                  <div className="flex items-center justify-between p-4 rounded-xl"
                    style={{ background: cfg.color + "10", border: `1px solid ${cfg.color}28` }}>
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                      <span className="text-sm font-medium" style={{ color: "#a1a1aa" }}>Status</span>
                    </div>
                    <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {["Suspender", "Cancelar", "Reativar"].map(a => (
                  <button key={a} onClick={() => setDetail(null)}
                    className="btn btn-ghost text-xs py-2">{a}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
