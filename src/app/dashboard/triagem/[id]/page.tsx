"use client";

import React, { useEffect, useState, useRef } from "react";
import { ArrowLeft, CheckCircle, Package, ScanLine, AlertTriangle, Search, Check, Save } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getReceivingById, getReceivingItems, getProducts, updateReceiving, createReceivingItem, updateReceivingItem } from "@/lib/api";
import type { Receiving, ReceivingItem, Product } from "@/lib/types";
import { ErrorBanner, StatusBadge } from "@/components/ui";

export default function TriagemInterfacePage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = React.use(params);

  const [receiving, setReceiving] = useState<Receiving | null>(null);
  const [items, setItems] = useState<ReceivingItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scanValue, setScanValue] = useState("");
  const [lastScanned, setLastScanned] = useState<{ product: Product, quantity: number } | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      getReceivingById(id),
      getReceivingItems(id),
      getProducts()
    ])
    .then(([rec, its, prods]) => {
      if (!rec) {
        router.push("/dashboard/triagem");
        return;
      }
      setReceiving(rec);
      setItems(its);
      setProducts(prods);
      
      // Auto update status
      if (rec.status === "Aguardando Chegada" || rec.status === "Recebido") {
        updateReceiving(rec.id, { status: "Em Triagem" }).catch(console.error);
      }
    })
    .catch(console.error)
    .finally(() => setLoading(false));
  }, [id, router]);

  // Keep focus on scan input for continuous scanning
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        scanInputRef.current?.focus();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanValue.trim() || !receiving) return;

    const barcode = scanValue.trim();
    setScanValue(""); // Clear immediately for next scan
    setError(null);

    // Find product in master catalog
    const product = products.find(p => p.barcode === barcode || p.sku === barcode || p.internal_code === barcode);

    if (!product) {
      setError(`Código não reconhecido: ${barcode}. Produto não cadastrado no sistema.`);
      return;
    }

    // Check if item is already in receiving_items
    let existingItem = items.find(i => i.product_id === product.id);

    try {
      if (existingItem) {
        const newCheckedQty = existingItem.checked_quantity + 1;
        const newStatus = newCheckedQty > existingItem.expected_quantity ? "Divergente" : (newCheckedQty === existingItem.expected_quantity ? "Conferido" : "Pendente");
        
        await updateReceivingItem(existingItem.id, {
          checked_quantity: newCheckedQty,
          status: newStatus
        });
        
        setItems(items.map(i => i.id === existingItem!.id ? { ...i, checked_quantity: newCheckedQty, status: newStatus } : i));
        setLastScanned({ product, quantity: newCheckedQty });
        
        if (newCheckedQty > existingItem.expected_quantity) {
          setError(`Aviso: Quantidade conferida de ${product.name} ultrapassou a quantidade esperada na Nota Fiscal.`);
        }
      } else {
        // Product belongs to another order or manual add
        const newItem = await createReceivingItem({
          receiving_id: receiving.id,
          product_id: product.id,
          expected_quantity: 0, // Not expected in invoice
          checked_quantity: 1,
          unit_cost: product.current_cost,
          total_cost: product.current_cost,
          status: "Divergente"
        });
        
        setItems([...items, { ...newItem, product }]);
        setLastScanned({ product, quantity: 1 });
        setError(`Atenção: Produto ${product.name} não estava listado nesta Nota Fiscal.`);
      }
    } catch (err) {
      console.error(err);
      setError("Erro ao registrar a bipagem no banco de dados.");
    }
  };

  const finishTriagem = async () => {
    if (!receiving) return;
    try {
      const hasDivergences = items.some(i => i.status === "Divergente" || i.checked_quantity !== i.expected_quantity);
      await updateReceiving(receiving.id, { status: hasDivergences ? "Divergência" : "Triagem Concluída" });
      router.push(`/dashboard/recebimentos/${receiving.id}`);
    } catch (err) {
      setError("Erro ao concluir a triagem.");
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Iniciando ambiente de triagem...</div>;
  if (!receiving) return null;

  const totalExpected = items.reduce((sum, i) => sum + i.expected_quantity, 0);
  const totalChecked = items.reduce((sum, i) => sum + i.checked_quantity, 0);
  const progress = totalExpected > 0 ? Math.min(100, Math.round((totalChecked / totalExpected) * 100)) : 0;

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/triagem" className="icon-btn bg-white" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Triagem Física</h1>
            <p className="text-sm text-slate-500">NF: {receiving.invoice_number || "S/N"} • {receiving.supplier?.trade_name}</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
          <div className="mr-4 text-right hidden sm:block">
            <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">Progresso</div>
            <div className="flex items-center gap-2">
              <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className={`h-full ${progress === 100 ? 'bg-emerald-500' : 'bg-blue-500'} transition-all duration-500`} style={{ width: `${progress}%` }}></div>
              </div>
              <span className="text-sm font-bold text-slate-700">{progress}%</span>
            </div>
          </div>
          <button onClick={finishTriagem} className="btn btn-primary" disabled={items.length === 0}>
            <CheckCircle className="h-4 w-4" /> Finalizar Triagem
          </button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Lado Esquerdo - Scanner e Último Produto */}
        <div className="space-y-6">
          <form onSubmit={handleScan} className="card p-6 bg-slate-900 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <ScanLine className="w-32 h-32" />
            </div>
            
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><ScanLine className="w-5 h-5 text-blue-400" /> Bipar Produto</h2>
            <p className="text-slate-400 text-sm mb-6">O sistema está aguardando a leitura do leitor de código de barras.</p>
            
            <div className="relative z-10">
              <input
                ref={scanInputRef}
                type="text"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                className="w-full bg-slate-800 border-2 border-slate-700 text-white rounded-xl px-4 py-4 font-mono text-xl focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/20 transition"
                placeholder="Escaneie o EAN/SKU..."
                autoFocus
              />
            </div>
            <button type="submit" className="hidden">Bipar</button>
          </form>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-xl">
              <div className="flex items-start">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
                <div className="ml-3">
                  <h3 className="text-sm font-bold text-red-800">Atenção Necessária</h3>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {lastScanned && (
            <div className="card p-6 border-2 border-blue-100 bg-blue-50/50 relative overflow-hidden animate-in fade-in slide-in-from-bottom-4">
              <div className="absolute top-0 right-0 p-3">
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wider">Último Leitura</span>
              </div>
              <div className="flex items-center gap-4">
                {lastScanned.product.photo_url ? (
                  <img src={lastScanned.product.photo_url} alt={lastScanned.product.name} className="w-16 h-16 rounded-xl object-cover border border-blue-200" />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-white border border-blue-200 flex items-center justify-center">
                    <Package className="w-8 h-8 text-blue-300" />
                  </div>
                )}
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 leading-tight">{lastScanned.product.name}</h3>
                  <div className="text-xs text-slate-500 mt-1 font-mono">{lastScanned.product.barcode || lastScanned.product.sku}</div>
                  <div className="text-2xl font-black text-blue-600 mt-2">{lastScanned.quantity} <span className="text-sm font-medium text-slate-500">{lastScanned.product.unit_measure} lidos</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lado Direito - Lista de Itens */}
        <div className="lg:col-span-2">
          <div className="card h-full flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">Produtos da Nota</h2>
              <div className="text-sm font-semibold text-slate-500">
                <span className="text-slate-900">{totalChecked}</span> / {totalExpected} un.
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-0">
              {items.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-500 text-sm">Nenhum item adicionado à nota ainda.<br/>Comece bipando os produtos para adicioná-los.</p>
                </div>
              ) : (
                <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0 z-10 text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Produto</th>
                      <th className="px-4 py-3 font-semibold text-center">Esperado</th>
                      <th className="px-4 py-3 font-semibold text-center">Conferido</th>
                      <th className="px-4 py-3 font-semibold text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => {
                      const isComplete = item.checked_quantity === item.expected_quantity && item.expected_quantity > 0;
                      const isOver = item.checked_quantity > item.expected_quantity;
                      const isZero = item.checked_quantity === 0;
                      
                      return (
                        <tr key={item.id} className={`transition-colors ${lastScanned?.product.id === item.product_id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3 min-w-[200px]">
                              {item.product?.photo_url ? (
                                <img src={item.product.photo_url} className="w-8 h-8 rounded border border-slate-200 object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded border border-slate-200 bg-slate-50 flex items-center justify-center">
                                  <Package className="w-4 h-4 text-slate-300" />
                                </div>
                              )}
                              <div className="truncate max-w-[250px]">
                                <strong className={`block text-xs ${isComplete ? 'text-slate-500' : 'text-slate-900'}`}>{item.product?.name}</strong>
                                <small className="text-[10px] text-slate-400 font-mono">{item.product?.barcode || item.product?.sku}</small>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-500 font-bold text-base">
                            {item.expected_quantity}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg font-bold text-base ${
                              isComplete ? 'bg-emerald-100 text-emerald-700' :
                              isOver ? 'bg-red-100 text-red-700' :
                              isZero ? 'bg-slate-100 text-slate-400' :
                              'bg-amber-100 text-amber-700'
                            }`}>
                              {item.checked_quantity}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isComplete && <StatusBadge tone="green">OK</StatusBadge>}
                            {isOver && <StatusBadge tone="red">Sobra</StatusBadge>}
                            {(!isComplete && !isOver && !isZero) && <StatusBadge tone="yellow">Em progresso</StatusBadge>}
                            {isZero && <StatusBadge tone="gray">Pendente</StatusBadge>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
