"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, Save, FileText, Calendar, Building2, Package, Search, Plus, Trash2, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createReceiving, getSuppliers, getProducts, createReceivingItem } from "@/lib/api";
import type { Supplier, Product } from "@/lib/types";
import { ErrorBanner, FieldLabel } from "@/components/ui";
import { formatCurrency } from "@/lib/utils";

type SelectedItem = {
  product: Product;
  expected_quantity: number;
  unit_cost: number;
};

export default function NovoRecebimentoPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Items for the invoice
  const [items, setItems] = useState<SelectedItem[]>([]);
  const [scanValue, setScanValue] = useState("");

  const [form, setForm] = useState({
    supplier_id: "",
    invoice_number: "",
    invoice_key: "",
    issue_date: "",
    expected_delivery_date: "",
    total_amount: "",
    total_items: "",
    observations: "",
  });

  useEffect(() => {
    Promise.all([getSuppliers(), getProducts()])
      .then(([supps, prods]) => {
        setSuppliers(supps);
        setProducts(prods);
      })
      .catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanValue.trim()) return;
    
    const code = scanValue.trim();
    const product = products.find(p => p.barcode === code || p.sku === code || p.internal_code === code);
    
    if (!product) {
      setError(`Produto não encontrado com o código: ${code}`);
      return;
    }

    if (items.find(i => i.product.id === product.id)) {
      setError(`O produto ${product.name} já foi adicionado à lista. Você pode alterar a quantidade abaixo.`);
      setScanValue("");
      return;
    }

    setItems([...items, { product, expected_quantity: 1, unit_cost: product.current_cost || 0 }]);
    setScanValue("");
    setError(null);
  };

  const updateItemQty = (productId: string, qty: number) => {
    if (qty < 1) return;
    setItems(items.map(i => i.product.id === productId ? { ...i, expected_quantity: qty } : i));
  };

  const updateItemCost = (productId: string, cost: number) => {
    if (cost < 0) return;
    setItems(items.map(i => i.product.id === productId ? { ...i, unit_cost: cost } : i));
  };

  const removeItem = (productId: string) => {
    setItems(items.filter(i => i.product.id !== productId));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.supplier_id) {
      setError("Selecione um fornecedor.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Calculate totals if not provided manually
      const calculatedTotalAmount = items.reduce((sum, item) => sum + (item.expected_quantity * item.unit_cost), 0);
      const calculatedTotalItems = items.reduce((sum, item) => sum + item.expected_quantity, 0);

      const finalAmount = Number(form.total_amount) || calculatedTotalAmount;
      const finalItems = Number(form.total_items) || calculatedTotalItems;

      const receiving = await createReceiving({
        supplier_id: form.supplier_id,
        invoice_number: form.invoice_number.trim() || null,
        invoice_key: form.invoice_key.trim() || null,
        issue_date: form.issue_date || null,
        expected_delivery_date: form.expected_delivery_date || null,
        total_amount: finalAmount,
        total_items: finalItems,
        status: "Aguardando Chegada",
        observations: form.observations.trim() || null,
      });

      // Create all the items associated with this receiving
      for (const item of items) {
        await createReceivingItem({
          receiving_id: receiving.id,
          product_id: item.product.id,
          expected_quantity: item.expected_quantity,
          checked_quantity: 0, // Not checked yet
          unit_cost: item.unit_cost,
          total_cost: item.expected_quantity * item.unit_cost,
          status: "Pendente"
        });
      }

      router.push(`/dashboard/recebimentos/${receiving.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar recebimento.");
      setSaving(false);
    }
  };

  const sumTotalCost = items.reduce((sum, item) => sum + (item.expected_quantity * item.unit_cost), 0);
  const sumTotalQty = items.reduce((sum, item) => sum + item.expected_quantity, 0);

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/recebimentos" className="icon-btn bg-white shadow-sm" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Novo Recebimento</h1>
            <p className="text-sm text-slate-500">Registrar entrada de mercadoria e vincular produtos</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/recebimentos" className="btn btn-secondary px-6">Cancelar</Link>
          <button type="submit" className="btn btn-primary px-8 shadow-lg shadow-blue-600/20" disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Recebimento"}
          </button>
        </div>
      </header>

      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-3 mt-6">
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-black flex items-center gap-2 mb-6 text-slate-900 border-b border-slate-100 pb-3">
              <Building2 className="w-6 h-6 shrink-0 text-blue-600" />
              Fornecedor e NFe
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <FieldLabel>Selecione o Fornecedor <span>*</span></FieldLabel>
                <select name="supplier_id" value={form.supplier_id} onChange={handleChange} className="field text-lg font-medium" required>
                  <option value="">-- Selecione na lista --</option>
                  {suppliers.map(s => (
                    <option key={s.id} value={s.id}>{s.corporate_name} {s.cnpj ? `(CNPJ: ${s.cnpj})` : ''}</option>
                  ))}
                </select>
                {suppliers.length === 0 && <p className="text-sm text-amber-600 mt-2 font-medium">Nenhum fornecedor cadastrado.</p>}
              </div>

              <div>
                <FieldLabel>Número da NFe</FieldLabel>
                <input type="text" name="invoice_number" value={form.invoice_number} onChange={handleChange} className="field font-bold text-lg" placeholder="Ex: 12345" />
              </div>
              <div>
                <FieldLabel>Chave de Acesso da NFe</FieldLabel>
                <input type="text" name="invoice_key" value={form.invoice_key} onChange={handleChange} className="field font-mono" placeholder="44 posições numéricas" maxLength={44} />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-6">
              <h2 className="text-lg font-black flex items-center gap-2 text-slate-900">
                <Package className="w-6 h-6 shrink-0 text-indigo-600" />
                Produtos da Nota (Opcional)
              </h2>
            </div>
            
            <div className="mb-6 flex gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none shrink-0">
                  <Search className="h-5 w-5 text-slate-400" />
                </div>
                <input 
                  type="text" 
                  value={scanValue}
                  onChange={(e) => setScanValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleScan(e)}
                  className="field pl-12 bg-slate-50" 
                  placeholder="Escaneie o código de barras ou digite o SKU..." 
                />
              </div>
              <button type="button" onClick={handleScan} className="btn bg-slate-900 text-white hover:bg-slate-800">
                <Plus className="w-4 h-4" /> Adicionar
              </button>
            </div>

            {items.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs font-bold uppercase text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">Produto</th>
                      <th className="px-4 py-3 w-32">Qtd. NFe</th>
                      <th className="px-4 py-3 w-32">Custo Un.</th>
                      <th className="px-4 py-3 w-16 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map((item) => (
                      <tr key={item.product.id}>
                        <td className="px-4 py-3">
                          <div className="font-bold text-slate-900">{item.product.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">{item.product.barcode || item.product.sku}</div>
                        </td>
                        <td className="px-4 py-3">
                          <input 
                            type="number" 
                            min="1" 
                            value={item.expected_quantity} 
                            onChange={(e) => updateItemQty(item.product.id, Number(e.target.value))}
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-bold"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="relative">
                            <span className="absolute inset-y-0 left-0 pl-2 flex items-center text-xs text-slate-400">R$</span>
                            <input 
                              type="number" 
                              step="0.01"
                              min="0"
                              value={item.unit_cost} 
                              onChange={(e) => updateItemCost(item.product.id, Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-300 pl-7 pr-2 py-1.5 text-sm"
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button type="button" onClick={() => removeItem(item.product.id)} className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
                <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-500">Nenhum produto listado</p>
                <p className="text-xs text-slate-400 mt-1">Adicione produtos pelo código de barras acima</p>
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-black flex items-center gap-2 mb-4 text-slate-900 border-b border-slate-100 pb-3">
              <FileText className="w-6 h-6 shrink-0 text-emerald-600" />
              Resumo da NFe
            </h2>
            <div className="space-y-4">
              <div>
                <FieldLabel>Quantidade Total da NFe (Opcional)</FieldLabel>
                <input type="number" name="total_items" value={form.total_items} onChange={handleChange} className="field bg-slate-50" placeholder={sumTotalQty > 0 ? String(sumTotalQty) : "Ex: 50"} />
              </div>
              <div>
                <FieldLabel>Valor Total da Nota (R$)</FieldLabel>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-bold shrink-0">R$</div>
                  <input type="number" step="0.01" name="total_amount" value={form.total_amount} onChange={handleChange} className="field pl-12 font-bold text-lg text-emerald-700 bg-emerald-50/50" placeholder={sumTotalCost > 0 ? sumTotalCost.toFixed(2) : "0.00"} />
                </div>
              </div>
              
              {items.length > 0 && (
                <div className="pt-4 border-t border-slate-100">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-slate-500">Soma dos Itens:</span>
                    <span className="font-bold text-slate-900">{sumTotalQty} und.</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Custo Total:</span>
                    <span className="font-bold text-emerald-600">{formatCurrency(sumTotalCost)}</span>
                  </div>
                  <div className="mt-3 p-3 bg-blue-50 text-blue-700 text-xs rounded-xl flex gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <p>Se você deixar os campos da nota vazios, os valores serão calculados pela soma dos produtos acima.</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-black flex items-center gap-2 mb-4 text-slate-900 border-b border-slate-100 pb-3">
              <Calendar className="w-6 h-6 shrink-0 text-orange-600" />
              Datas e Prazos
            </h2>
            <div className="space-y-4">
              <div>
                <FieldLabel>Data de Emissão</FieldLabel>
                <input type="date" name="issue_date" value={form.issue_date} onChange={handleChange} className="field" />
              </div>
              <div>
                <FieldLabel>Data Prev. Entrega</FieldLabel>
                <input type="date" name="expected_delivery_date" value={form.expected_delivery_date} onChange={handleChange} className="field" />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <FieldLabel>Observações</FieldLabel>
            <textarea name="observations" value={form.observations} onChange={handleChange} className="field min-h-[100px] mt-2" placeholder="Anotações adicionais..." />
          </section>
        </div>
      </div>
    </form>
  );
}
