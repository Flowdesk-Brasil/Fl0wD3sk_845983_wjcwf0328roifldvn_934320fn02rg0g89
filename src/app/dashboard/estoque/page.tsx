"use client";

import { useEffect, useState } from "react";
import { Package, ArrowDownRight, ArrowUpRight, AlertTriangle, Search, Activity, DollarSign } from "lucide-react";
import { getProducts, getInventoryTransactions } from "@/lib/api";
import type { Product } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";
import { StatusBadge } from "@/components/ui";

export default function EstoquePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getProducts(),
      getInventoryTransactions()
    ]).then(([prods, trans]) => {
      setProducts(prods);
      setTransactions(trans);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando painel de estoque...</div>;

  const totalValue = products.reduce((acc, p) => acc + (p.current_stock * p.current_cost), 0);
  const potentialRevenue = products.reduce((acc, p) => acc + (p.current_stock * p.selling_price), 0);
  const outOfStock = products.filter(p => p.current_stock <= 0).length;
  const lowStock = products.filter(p => p.current_stock > 0 && p.current_stock <= p.minimum_stock).length;

  const criticalProducts = products.filter(p => p.current_stock <= p.minimum_stock).sort((a, b) => a.current_stock - b.current_stock);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-900">Visão Geral do Estoque</h1>
        <p className="text-sm text-slate-500 mt-1">Monitore o patrimônio, nível de ruptura e histórico de movimentações</p>
      </header>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="card p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-blue-50 rounded-full opacity-50"></div>
          <div className="flex items-center gap-3 mb-2 text-slate-500 font-semibold relative z-10">
            <DollarSign className="w-5 h-5 text-blue-500" />
            Valor em Custo
          </div>
          <div className="text-2xl font-black text-slate-900 relative z-10">{formatCurrency(totalValue)}</div>
        </div>

        <div className="card p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-emerald-50 rounded-full opacity-50"></div>
          <div className="flex items-center gap-3 mb-2 text-slate-500 font-semibold relative z-10">
            <Activity className="w-5 h-5 text-emerald-500" />
            Potencial de Venda
          </div>
          <div className="text-2xl font-black text-slate-900 relative z-10">{formatCurrency(potentialRevenue)}</div>
        </div>

        <div className="card p-5 relative overflow-hidden">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-amber-50 rounded-full opacity-50"></div>
          <div className="flex items-center gap-3 mb-2 text-slate-500 font-semibold relative z-10">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            Estoque Baixo
          </div>
          <div className="text-2xl font-black text-slate-900 relative z-10">{lowStock} <span className="text-sm font-medium text-slate-500">produtos</span></div>
        </div>

        <div className="card p-5 relative overflow-hidden bg-red-50/30 border-red-100">
          <div className="absolute top-0 right-0 -mt-4 -mr-4 w-24 h-24 bg-red-50 rounded-full opacity-50"></div>
          <div className="flex items-center gap-3 mb-2 text-red-600 font-semibold relative z-10">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Ruptura (Sem Estoque)
          </div>
          <div className="text-2xl font-black text-red-700 relative z-10">{outOfStock} <span className="text-sm font-medium text-red-500">produtos</span></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Produtos em Alerta */}
        <section className="card p-0 flex flex-col h-[500px]">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-xl">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Alerta de Reposição
            </h2>
            <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">{criticalProducts.length} itens</span>
          </div>
          <div className="overflow-y-auto p-0 flex-1">
            {criticalProducts.length === 0 ? (
              <div className="p-8 text-center text-emerald-600 font-medium">Todos os produtos estão com estoque saudável!</div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500 text-xs uppercase tracking-wider sticky top-0">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Produto</th>
                    <th className="px-5 py-3 font-semibold text-center">Atual</th>
                    <th className="px-5 py-3 font-semibold text-center">Mínimo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {criticalProducts.map(p => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <strong className={`block text-xs ${p.current_stock <= 0 ? 'text-red-700' : 'text-slate-900'}`}>{p.name}</strong>
                        <small className="text-[10px] text-slate-500 font-mono">{p.barcode || p.sku}</small>
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center justify-center px-2 py-1 rounded font-bold text-xs ${p.current_stock <= 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {p.current_stock}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-center text-slate-500 font-medium">{p.minimum_stock}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Últimas Movimentações */}
        <section className="card p-0 flex flex-col h-[500px]">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-xl">
            <h2 className="font-bold text-slate-800 flex items-center gap-2">
              <Activity className="w-5 h-5 text-blue-500" />
              Últimas Movimentações
            </h2>
          </div>
          <div className="overflow-y-auto p-0 flex-1">
            {transactions.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-medium">Nenhuma movimentação registrada.</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {transactions.map(t => (
                  <div key={t.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center gap-4">
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${t.transaction_type === 'IN' ? 'bg-emerald-100 text-emerald-600' : t.transaction_type === 'OUT' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                      {t.transaction_type === 'IN' ? <ArrowDownRight className="w-5 h-5" /> : t.transaction_type === 'OUT' ? <ArrowUpRight className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <strong className="text-sm text-slate-900 truncate pr-2">{t.product?.name || "Produto excluído"}</strong>
                        <span className={`text-sm font-bold whitespace-nowrap ${t.transaction_type === 'IN' ? 'text-emerald-600' : t.transaction_type === 'OUT' ? 'text-red-600' : 'text-blue-600'}`}>
                          {t.transaction_type === 'IN' ? '+' : t.transaction_type === 'OUT' ? '-' : ''}{t.quantity}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-slate-500">
                        <span className="truncate pr-2">{t.reason || (t.transaction_type === 'IN' ? 'Entrada' : 'Saída')}</span>
                        <span className="whitespace-nowrap">{t.created_at ? formatDate(t.created_at) : ''}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
