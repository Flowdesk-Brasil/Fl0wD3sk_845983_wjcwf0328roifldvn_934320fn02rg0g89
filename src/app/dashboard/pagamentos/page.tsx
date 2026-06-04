"use client";

import { useState } from "react";
import {
  CreditCard, Search, CheckCircle2, Clock, XCircle, AlertTriangle,
  RefreshCw, QrCode, Banknote, Eye, X, Copy
} from "lucide-react";
import { mockPayments, mockStudents, mockEnrollments, mockPlans } from "@/lib/mockData";
import { Payment, PaymentStatus, PaymentMethod } from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

const STATUS_CFG: Record<PaymentStatus, { label: string; badge: string; icon: React.ElementType; color: string }> = {
  pending:  { label: "Pendente",  badge: "badge-yellow", icon: Clock,         color: "#eab308" },
  paid:     { label: "Pago",      badge: "badge-green",  icon: CheckCircle2,  color: "#22c55e" },
  expired:  { label: "Expirado",  badge: "badge-gray",   icon: XCircle,       color: "#71717a" },
  cancelled:{ label: "Cancelado", badge: "badge-red",    icon: XCircle,       color: "#ef4444" },
  refunded: { label: "Estornado", badge: "badge-blue",   icon: RefreshCw,     color: "#3b82f6" },
};

const METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX", credit_card: "Crédito", debit_card: "Débito", cash: "Dinheiro",
};

export default function PagamentosPage() {
  const [search, setSearch]  = useState("");
  const [filter, setFilter]  = useState<PaymentStatus | "all">("all");
  const [detail, setDetail]  = useState<Payment | null>(null);
  const [copied, setCopied]  = useState(false);

  const enriched = mockPayments.map(p => ({
    ...p,
    student:    mockStudents.find(s => s.id === p.studentId),
    enrollment: mockEnrollments.find(e => e.id === p.enrollmentId),
    plan:       mockPlans.find(pl => pl.id === mockEnrollments.find(e => e.id === p.enrollmentId)?.planId),
  }));

  const filtered = enriched.filter(p => {
    const q = search.toLowerCase();
    const m = !q || p.student?.fullName.toLowerCase().includes(q) || p.reference.includes(q);
    return m && (filter === "all" || p.status === filter);
  });

  const totals = {
    paid:    mockPayments.filter(p => p.status === "paid").reduce((a,b) => a + b.totalAmount, 0),
    pending: mockPayments.filter(p => p.status === "pending").reduce((a,b) => a + b.totalAmount, 0),
    overdue: mockPayments.filter(p => p.status === "pending" && new Date(p.dueDate) < new Date()).length,
  };

  const copyPix = (code: string) => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const detailEnriched = detail ? enriched.find(p => p.id === detail.id) : null;

  return (
    <div className="space-y-5 max-w-[1400px]">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { l: "Recebido",      v: formatCurrency(totals.paid),    c: "#22c55e" },
          { l: "A Receber",     v: formatCurrency(totals.pending),  c: "#eab308" },
          { l: "Em Atraso",     v: `${totals.overdue} cobranças`,   c: "#ef4444" },
          { l: "Transações",    v: String(mockPayments.length),     c: "#8b5cf6" },
        ].map((s, i) => (
          <div key={s.l} className={`card p-4 anim-fadeUp stagger-${i+1}`}>
            <div className="text-xl font-black" style={{ color: s.c }}>{s.v}</div>
            <div className="text-xs mt-1" style={{ color: "#71717a" }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div className="card anim-fadeUp stagger-2">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5"
          style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div>
            <h2 className="text-sm font-bold text-white">Gestão de Pagamentos</h2>
            <p className="text-xs mt-0.5" style={{ color: "#52525b" }}>{filtered.length} cobranças</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4"
          style={{ borderBottom: "1px solid #1a1a1a" }}>
          <div className="relative flex-1 w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#52525b" }} />
            <input type="text" placeholder="Buscar..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="field pl-9 py-2 text-sm" id="pay-search" />
          </div>
          <div className="flex gap-1.5 overflow-x-auto">
            {(["all","pending","paid","expired","cancelled"] as const).map(s => (
              <button key={s} onClick={() => setFilter(s)}
                className={`tab-item text-xs py-1.5 px-3 flex-none ${filter === s ? "active" : ""}`}>
                {s === "all" ? "Todos" : STATUS_CFG[s].label}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="scroll-x">
          <table className="tbl">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Aluno</th>
                <th className="hide-mobile">Valor</th>
                <th className="hide-mobile">Vencimento</th>
                <th className="hide-mobile">Método</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const cfg = STATUS_CFG[p.status];
                const Icon = cfg.icon;
                const overdue = p.status === "pending" && new Date(p.dueDate) < new Date();
                return (
                  <tr key={p.id}>
                    <td>
                      <code className="text-xs px-2 py-1 rounded-md font-mono"
                        style={{ background: "#8b5cf618", color: "#a78bfa" }}>
                        {p.reference}
                      </code>
                    </td>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: "#3b82f618", color: "#60a5fa" }}>
                          {p.student?.fullName?.[0]}
                        </div>
                        <span className="text-sm font-medium text-white">
                          {p.student?.fullName?.split(" ").slice(0,2).join(" ")}
                        </span>
                      </div>
                    </td>
                    <td className="hide-mobile">
                      <div>
                        <div className="font-semibold text-sm text-white">{formatCurrency(p.totalAmount)}</div>
                        {p.discount > 0 && <div className="text-[11px]" style={{ color: "#22c55e" }}>-{formatCurrency(p.discount)} desc</div>}
                        {p.fine > 0 && <div className="text-[11px]" style={{ color: "#ef4444" }}>+{formatCurrency(p.fine)} multa</div>}
                      </div>
                    </td>
                    <td className="hide-mobile">
                      <span style={{ color: overdue ? "#f87171" : "#71717a" }}>
                        {formatDate(p.dueDate)}{overdue ? " ⚠️" : ""}
                      </span>
                    </td>
                    <td className="hide-mobile">
                      {p.method ? (
                        <div className="flex items-center gap-1.5">
                          {p.method === "pix" && <QrCode className="w-3.5 h-3.5" style={{ color: "#22c55e" }} />}
                          {(p.method === "credit_card" || p.method === "debit_card") && <CreditCard className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />}
                          {p.method === "cash" && <Banknote className="w-3.5 h-3.5" style={{ color: "#eab308" }} />}
                          <span className="text-xs">{METHOD_LABEL[p.method]}</span>
                        </div>
                      ) : "—"}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <Icon className="w-3 h-3" style={{ color: cfg.color }} />
                        <span className={`badge ${cfg.badge}`}>{cfg.label}</span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setDetail(p)} className="btn-icon"><Eye className="w-3.5 h-3.5" /></button>
                        {p.status === "pending" && (
                          <button className="btn-icon" style={{ color: "#22c55e" }} title="Confirmar pagamento">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {detail && detailEnriched && (
        <div className="modal-backdrop" onClick={() => setDetail(null)}>
          <div className="modal-box max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-base font-bold text-white">Detalhes do Pagamento</h3>
              <button className="btn-icon" onClick={() => setDetail(null)}><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="p-4 rounded-xl" style={{ background: "#0a0a0a", border: "1px solid #1a1a1a" }}>
                <code className="font-mono font-bold text-sm" style={{ color: "#a78bfa" }}>{detail.reference}</code>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { l: "Aluno",      v: detailEnriched.student?.fullName?.split(" ").slice(0,2).join(" ") },
                  { l: "Plano",      v: detailEnriched.plan?.name ?? "—" },
                  { l: "Valor",      v: formatCurrency(detail.amount) },
                  { l: "Desconto",   v: detail.discount > 0 ? formatCurrency(detail.discount) : "—" },
                  { l: "Total",      v: formatCurrency(detail.totalAmount) },
                  { l: "Vencimento", v: formatDate(detail.dueDate) },
                  { l: "Pago em",    v: detail.paidAt ? formatDate(detail.paidAt) : "—" },
                  { l: "Método",     v: detail.method ? METHOD_LABEL[detail.method] : "—" },
                ].map(f => (
                  <div key={f.l} className="p-3 rounded-xl" style={{ background: "#111", border: "1px solid #1a1a1a" }}>
                    <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#3f3f46" }}>{f.l}</div>
                    <div className="text-sm text-white font-medium">{f.v}</div>
                  </div>
                ))}
              </div>
              {detail.pixCode && (
                <div className="p-4 rounded-xl" style={{ background: "#22c55e08", border: "1px solid #22c55e20" }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <QrCode className="w-4 h-4" style={{ color: "#22c55e" }} />
                      <span className="text-xs font-semibold" style={{ color: "#22c55e" }}>PIX Copia e Cola</span>
                    </div>
                    <button onClick={() => copyPix(detail.pixCode!)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                      style={{ background: "#22c55e20", color: "#22c55e" }}>
                      <Copy className="w-3 h-3" />
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                  </div>
                  <code className="text-[10px] break-all" style={{ color: "#52525b" }}>{detail.pixCode}</code>
                </div>
              )}
              {detail.status === "pending" && (
                <button className="btn btn-success w-full text-sm">
                  <CheckCircle2 className="w-4 h-4" /> Confirmar Pagamento Manual
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
