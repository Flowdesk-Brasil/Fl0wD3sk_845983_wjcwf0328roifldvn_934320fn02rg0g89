"use client";

import { useEffect, useState } from "react";
import { CreditCard, Search, CheckCircle2, Clock, XCircle, RefreshCw, QrCode, Banknote, Loader2 } from "lucide-react";
import { getPayments } from "@/lib/api";
import { formatCurrency, formatDate } from "@/lib/utils";

const STATUS_CFG: Record<string, { label: string; badge: string }> = {
  pending:  { label: "Pendente",  badge: "badge-yellow" },
  paid:     { label: "Pago",      badge: "badge-green" },
  expired:  { label: "Expirado",  badge: "badge-gray" },
  cancelled:{ label: "Cancelado", badge: "badge-red" },
  refunded: { label: "Estornado", badge: "badge-blue" },
};

const METHOD_LABEL: Record<string, string> = {
  pix: "PIX", credit_card: "Crédito", debit_card: "Débito", cash: "Dinheiro",
};

export default function PagamentosPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getPayments();
      setPayments(data);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center anim-fadeIn">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--brand-primary)] mb-4" />
        <p className="text-zinc-500 font-medium">Carregando pagamentos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 anim-fadeUp">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Financeiro</h1>
          <p className="text-zinc-500 text-sm mt-1">Controle de mensalidades e recebimentos</p>
        </div>
      </div>

      <div className="card anim-fadeUp stagger-1">
        
        <div className="p-4 border-b border-[var(--border-light)] flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-1 w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input type="text" placeholder="Buscar por referência ou aluno..." className="field pl-10" />
          </div>
        </div>

        <div className="tbl-container">
          <table className="tbl">
            <thead>
              <tr>
                <th>Referência</th>
                <th>Aluno</th>
                <th className="hide-mobile">Valor</th>
                <th className="hide-mobile">Vencimento</th>
                <th className="hide-mobile">Método</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => {
                const cfg = STATUS_CFG[p.status] || { label: p.status, badge: 'badge-gray' };
                const overdue = p.status === "pending" && new Date(p.due_date) < new Date();
                
                return (
                  <tr key={p.id}>
                    <td>
                      <code className="px-2 py-1 bg-zinc-100 text-zinc-700 rounded-md font-mono text-xs font-bold">
                        {p.reference}
                      </code>
                    </td>
                    <td>
                      <div className="font-bold text-zinc-900">{p.student?.full_name || "—"}</div>
                    </td>
                    <td className="hide-mobile">
                      <div className="font-bold text-zinc-900">{formatCurrency(p.total_amount)}</div>
                    </td>
                    <td className="hide-mobile">
                      <span className={`font-medium ${overdue ? 'text-red-500' : 'text-zinc-600'}`}>
                        {formatDate(p.due_date)} {overdue && "⚠️"}
                      </span>
                    </td>
                    <td className="hide-mobile text-sm text-zinc-600 font-medium">
                      {METHOD_LABEL[p.method] || "—"}
                    </td>
                    <td>
                      <div className={`badge ${cfg.badge}`}>
                        {cfg.label}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {payments.length === 0 && (
            <div className="p-16 flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-50 flex items-center justify-center mb-4">
                <CreditCard className="w-8 h-8 text-zinc-300" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-1">Sem registros financeiros</h3>
              <p className="text-zinc-500 text-sm max-w-sm">Os pagamentos gerados aparecerão aqui.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
