"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Save, Truck, FileText, Calendar, Building2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createReceiving, getSuppliers } from "@/lib/api";
import type { Supplier } from "@/lib/types";
import { ErrorBanner, FieldLabel } from "@/components/ui";

export default function NovoRecebimentoPage() {
  const router = useRouter();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    getSuppliers().then(setSuppliers).catch(console.error);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
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
      const receiving = await createReceiving({
        supplier_id: form.supplier_id,
        invoice_number: form.invoice_number.trim() || null,
        invoice_key: form.invoice_key.trim() || null,
        issue_date: form.issue_date || null,
        expected_delivery_date: form.expected_delivery_date || null,
        total_amount: Number(form.total_amount) || 0,
        total_items: Number(form.total_items) || 0,
        status: "Aguardando Chegada",
        observations: form.observations.trim() || null,
      });

      router.push(`/dashboard/recebimentos/${receiving.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao registrar recebimento.");
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/recebimentos" className="icon-btn bg-white shadow-sm" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Novo Recebimento</h1>
            <p className="text-sm text-slate-500">Registrar entrada de mercadoria e vincular Nota Fiscal</p>
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

      <div className="space-y-6 mt-6">
        <section className="card p-8">
          <h2 className="text-xl font-black flex items-center gap-3 mb-6 text-slate-900 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5" />
            </div>
            Dados do Fornecedor
          </h2>
          <div>
            <FieldLabel>Selecione o Fornecedor <span>*</span></FieldLabel>
            <select name="supplier_id" value={form.supplier_id} onChange={handleChange} className="field text-lg font-medium" required>
              <option value="">-- Selecione na lista --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.corporate_name} {s.cnpj ? `(CNPJ: ${s.cnpj})` : ''}</option>
              ))}
            </select>
            {suppliers.length === 0 && <p className="text-sm text-amber-600 mt-2 font-medium">Nenhum fornecedor cadastrado. Cadastre um fornecedor primeiro no menu Fornecedores.</p>}
          </div>
        </section>

        <section className="card p-8">
          <h2 className="text-xl font-black flex items-center gap-3 mb-6 text-slate-900 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            Identificação da Nota Fiscal
          </h2>
          <div className="form-grid">
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Número da NFe</FieldLabel>
              <input type="text" name="invoice_number" value={form.invoice_number} onChange={handleChange} className="field font-bold text-lg" placeholder="Ex: 12345" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Chave de Acesso da NFe</FieldLabel>
              <input type="text" name="invoice_key" value={form.invoice_key} onChange={handleChange} className="field font-mono" placeholder="44 posições numéricas" maxLength={44} />
            </div>
            <div className="col-span-2 sm:col-span-1 mt-4">
              <FieldLabel>Quantidade Total de Itens Físicos</FieldLabel>
              <input type="number" name="total_items" value={form.total_items} onChange={handleChange} className="field" placeholder="Ex: 50" />
            </div>
            <div className="col-span-2 sm:col-span-1 mt-4">
              <FieldLabel>Valor Total da Nota (R$)</FieldLabel>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-bold">R$</div>
                <input type="number" step="0.01" name="total_amount" value={form.total_amount} onChange={handleChange} className="field pl-10 font-bold text-lg text-emerald-700" placeholder="0.00" />
              </div>
            </div>
          </div>
        </section>

        <section className="card p-8">
          <h2 className="text-xl font-black flex items-center gap-3 mb-6 text-slate-900 border-b border-slate-100 pb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            Datas e Prazos
          </h2>
          <div className="form-grid">
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Data de Emissão da Nota</FieldLabel>
              <input type="date" name="issue_date" value={form.issue_date} onChange={handleChange} className="field" />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Data Prevista de Entrega</FieldLabel>
              <input type="date" name="expected_delivery_date" value={form.expected_delivery_date} onChange={handleChange} className="field" />
            </div>
          </div>
        </section>

        <section className="card p-8">
          <FieldLabel>Observações Internas</FieldLabel>
          <textarea name="observations" value={form.observations} onChange={handleChange} className="field min-h-[120px] mt-2" placeholder="Anotações adicionais sobre a transportadora, volumes, condições de pagamento, pendências..." />
        </section>
      </div>
    </form>
  );
}
