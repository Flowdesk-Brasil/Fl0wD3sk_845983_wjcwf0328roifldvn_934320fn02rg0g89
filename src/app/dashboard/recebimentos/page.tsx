"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Truck, FileText, CheckCircle, Clock, AlertTriangle, Eye } from "lucide-react";
import Link from "next/link";
import { getReceivings } from "@/lib/api";
import type { Receiving } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { EmptyState, SearchInput, StatusBadge } from "@/components/ui";

export default function RecebimentosPage() {
  const [receivings, setReceivings] = useState<Receiving[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "completed">("all");

  useEffect(() => {
    getReceivings()
      .then(setReceivings)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = receivings.filter((r) => {
    if (filter === "pending" && ["Finalizado", "Recebido"].includes(r.status)) return false;
    if (filter === "completed" && !["Finalizado", "Recebido"].includes(r.status)) return false;
    if (!search) return true;
    const term = search.toLowerCase();
    return r.invoice_number?.toLowerCase().includes(term) || 
           r.supplier?.corporate_name?.toLowerCase().includes(term) || 
           r.supplier?.trade_name?.toLowerCase().includes(term);
  });

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Carregando recebimentos...</div>;
  }

  return (
    <>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Recebimentos</h1>
          <p className="text-sm text-slate-500">Controle de entrada de mercadorias e notas fiscais</p>
        </div>
        <Link href="/dashboard/recebimentos/novo" className="btn btn-primary whitespace-nowrap">
          <Plus className="h-4 w-4" /> Novo Recebimento
        </Link>
      </header>

      <section className="card">
        <div className="table-toolbar flex-wrap gap-4">
          <div className="flex-1 min-w-[280px]">
            <SearchInput 
              value={search} 
              onChange={setSearch} 
              placeholder="Buscar por Fornecedor ou NFe..." 
            />
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                ["all", "Todos"],
                ["pending", "Pendentes"],
                ["completed", "Finalizados"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={`rounded-lg px-3 py-2 text-[11px] font-semibold transition ${
                  filter === value
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nota / Fornecedor</th>
                  <th className="hide-mobile">Datas</th>
                  <th className="text-right">Itens</th>
                  <th className="text-right">Valor Total</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                          <Truck className="w-5 h-5 text-slate-400" />
                        </div>
                        <span className="min-w-0">
                          <strong className="block truncate text-xs text-slate-900">{r.supplier?.trade_name || r.supplier?.corporate_name || "Fornecedor não informado"}</strong>
                          <small className="mt-1 flex items-center gap-2 truncate text-[10px] text-slate-500">
                            <span className="bg-slate-100 px-1.5 py-0.5 rounded font-mono">NFe: {r.invoice_number || "S/N"}</span>
                          </small>
                        </span>
                      </div>
                    </td>
                    <td className="hide-mobile text-xs text-slate-600">
                      <div><span className="font-semibold">Emissão:</span> {r.issue_date ? formatDate(r.issue_date) : "-"}</div>
                      <div className="text-slate-400"><span className="font-semibold">Previsão:</span> {r.expected_delivery_date ? formatDate(r.expected_delivery_date) : "-"}</div>
                    </td>
                    <td className="text-right font-medium text-slate-900">{r.total_items} un.</td>
                    <td className="text-right font-bold text-slate-900">{formatCurrency(r.total_amount)}</td>
                    <td>
                      <StatusBadge 
                        tone={
                          r.status === "Finalizado" ? "green" :
                          r.status === "Divergência" ? "red" :
                          r.status === "Aguardando Chegada" ? "gray" :
                          "blue"
                        }
                      >
                        {r.status}
                      </StatusBadge>
                    </td>
                    <td>
                      <Link href={`/dashboard/recebimentos/${r.id}`} className="icon-btn" title="Visualizar recebimento">
                        <Eye className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState 
            icon={FileText} 
            title="Nenhum recebimento" 
            description="Você ainda não registrou notas fiscais ou recebimentos de mercadorias." 
            action={{ label: "Novo Recebimento", href: "/dashboard/recebimentos/novo" }} 
          />
        )}
      </section>
    </>
  );
}
