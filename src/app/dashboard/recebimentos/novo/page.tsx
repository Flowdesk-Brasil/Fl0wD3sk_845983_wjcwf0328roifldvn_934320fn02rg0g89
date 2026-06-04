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
          <Link href="/dashboard/recebimentos" className="icon-btn bg-white" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Novo Recebimento</h1>
            <p className="text-sm text-slate-500">Registrar entrada de mercadoria / Nota Fiscal</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/recebimentos" className="btn btn-secondary">Cancelar</Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Recebimento"}
          </button>
        </div>
      </header>

      <ErrorBanner message={error} />

      <div className="space-y-6 mt-6">
        <section className="card p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><Building2 className="w-5 h-5 text-blue-500" /> Fornecedor</h2>
          <div>
            <FieldLabel>Selecione o Fornecedor *</FieldLabel>
            <select name="supplier_id" value={form.supplier_id} onChange={handleChange} className="form-input" required>
              <option value="">-- Selecione --</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.corporate_name} {s.cnpj ? `(${s.cnpj})` : ''}</option>
              ))}
            </select>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><FileText className="w-5 h-5 text-orange-500" /> Dados da Nota Fiscal</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Número da NFe</FieldLabel>
              <input type="text" name="invoice_number" value={form.invoice_number} onChange={handleChange} className="form-input" placeholder="Ex: 12345" />
            </div>
            <div>
              <FieldLabel>Chave de Acesso da NFe</FieldLabel>
              <input type="text" name="invoice_key" value={form.invoice_key} onChange={handleChange} className="form-input font-mono text-sm" placeholder="44 posições" maxLength={44} />
            </div>
            <div>
              <FieldLabel>Quantidade Total de Itens</FieldLabel>
              <input type="number" name="total_items" value={form.total_items} onChange={handleChange} className="form-input" placeholder="Ex: 50" />
            </div>
            <div>
              <FieldLabel>Valor Total da Nota (R$)</FieldLabel>
              <input type="number" step="0.01" name="total_amount" value={form.total_amount} onChange={handleChange} className="form-input" placeholder="0.00" />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><Calendar className="w-5 h-5 text-indigo-500" /> Datas e Prazos</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Data de Emissão</FieldLabel>
              <input type="date" name="issue_date" value={form.issue_date} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <FieldLabel>Data Prevista de Entrega</FieldLabel>
              <input type="date" name="expected_delivery_date" value={form.expected_delivery_date} onChange={handleChange} className="form-input" />
            </div>
          </div>
        </section>

        <section className="card p-6">
          <FieldLabel>Observações Internas</FieldLabel>
          <textarea name="observations" value={form.observations} onChange={handleChange} className="form-input min-h-[100px] mt-2" placeholder="Anotações sobre a transportadora, condições de pagamento, etc." />
        </section>
      </div>
    </form>
  );
}
