"use client";

import React, { useEffect, useState } from "react";
import { ArrowLeft, Save, Tag, Barcode, DollarSign, Package, FileText, MapPin, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getProductById, updateProduct, deleteProduct } from "@/lib/api";
import { ErrorBanner, Label, NumberInput } from "@/components/ui";

export default function EditarProdutoPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const { id } = React.use(params);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    barcode: "",
    sku: "",
    internal_code: "",
    category: "",
    subcategory: "",
    brand: "",
    unit_measure: "UN",
    weight: "",
    volume: "",
    current_cost: "",
    selling_price: "",
    minimum_stock: "1",
    maximum_stock: "",
    current_stock: "0",
    physical_location: "",
    ncm: "",
    cfop: "",
    cest: "",
    active: true,
    photo_base64: "",
  });

  useEffect(() => {
    getProductById(id)
      .then((product) => {
        if (!product) {
          router.push("/dashboard/produtos");
          return;
        }
        setForm({
          name: product.name,
          barcode: product.barcode || "",
          sku: product.sku || "",
          internal_code: product.internal_code || "",
          category: product.category || "",
          subcategory: product.subcategory || "",
          brand: product.brand || "",
          unit_measure: product.unit_measure || "UN",
          weight: product.weight?.toString() || "",
          volume: product.volume?.toString() || "",
          current_cost: product.current_cost?.toString() || "",
          selling_price: product.selling_price?.toString() || "",
          minimum_stock: product.minimum_stock?.toString() || "0",
          maximum_stock: product.maximum_stock?.toString() || "0",
          current_stock: product.current_stock?.toString() || "0",
          physical_location: product.physical_location || "",
          ncm: product.ncm || "",
          cfop: product.cfop || "",
          cest: product.cest || "",
          active: product.active ?? true,
          photo_base64: product.photo_url || "",
        });
        
        if (product.photo_url) {
          const img = new Image();
          img.onload = () => setForm(prev => ({ ...prev, photo_base64: product.photo_url as string }));
          img.src = product.photo_url;
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id, router]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm(prev => ({ ...prev, photo_base64: reader.result as string }));
    reader.readAsDataURL(file);
  };

  const handleNumberChange = (name: string, value: number | null) => {
    setForm(prev => ({ ...prev, [name]: value?.toString() || "" }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.selling_price) {
      setError("O nome do produto e o preço de venda são obrigatórios.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await updateProduct(id, {
        name: form.name.trim(),
        barcode: form.barcode.trim() || null,
        sku: form.sku.trim() || null,
        internal_code: form.internal_code.trim() || null,
        category: form.category.trim() || null,
        subcategory: form.subcategory.trim() || null,
        brand: form.brand.trim() || null,
        unit_measure: form.unit_measure,
        weight: form.weight ? Number(form.weight) : null,
        volume: form.volume ? Number(form.volume) : null,
        current_cost: form.current_cost ? Number(form.current_cost) : 0,
        average_cost: form.current_cost ? Number(form.current_cost) : 0,
        selling_price: Number(form.selling_price),
        minimum_stock: Number(form.minimum_stock) || 0,
        maximum_stock: Number(form.maximum_stock) || 0,
        current_stock: Number(form.current_stock) || 0,
        physical_location: form.physical_location.trim() || null,
        ncm: form.ncm.trim() || null,
        cfop: form.cfop.trim() || null,
        cest: form.cest.trim() || null,
        active: form.active,
      });

      if (form.photo_base64 && form.photo_base64.startsWith("data:image")) {
        try {
          const { supabase } = await import("@/lib/supabase");
          const res = await fetch(form.photo_base64);
          const blob = await res.blob();
          await supabase.storage.from("product-photos").upload(`${id}.jpg`, blob, {
            contentType: "image/jpeg",
            upsert: true
          });
          const photo_url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-photos/${id}.jpg?t=${Date.now()}`;
          await supabase.from("products").update({ photo_url }).eq("id", id);
        } catch (err) {
          console.error("Failed to upload photo", err);
        }
      } else if (!form.photo_base64) {
        try {
          const { supabase } = await import("@/lib/supabase");
          await supabase.storage.from("product-photos").remove([`${id}.jpg`]);
          await supabase.from("products").update({ photo_url: null }).eq("id", id);
        } catch (err) {}
      }

      router.push("/dashboard/produtos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar o produto.");
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Tem certeza que deseja excluir este produto? Esta ação não pode ser desfeita e pode afetar o histórico de vendas.")) return;
    setDeleting(true);
    try {
      await deleteProduct(id);
      router.push("/dashboard/produtos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível excluir.");
      setDeleting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Carregando produto...</div>;
  }

  const margin = (Number(form.selling_price) && Number(form.current_cost))
    ? (((Number(form.selling_price) - Number(form.current_cost)) / Number(form.selling_price)) * 100).toFixed(1)
    : "0.0";

  return (
    <form onSubmit={submit} className="mx-auto max-w-5xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/produtos" className="icon-btn bg-white" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Editar Produto</h1>
            <p className="text-sm text-slate-500">Atualize as informações do item</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleDelete} className="btn bg-red-50 text-red-600 hover:bg-red-100 border-none" disabled={deleting || saving}>
            <Trash2 className="h-4 w-4" /> {deleting ? "Excluindo..." : "Excluir"}
          </button>
          <button type="submit" className="btn btn-primary" disabled={saving || deleting}>
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar Alterações"}
          </button>
        </div>
      </header>

      <ErrorBanner message={error} />

      <div className="grid gap-6 lg:grid-cols-3 mt-6">
        
        {/* Coluna Principal */}
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><Tag className="w-5 h-5 text-blue-500" /> Informações Básicas</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Nome do Produto *</Label>
                <input required type="text" name="name" value={form.name} onChange={handleChange} className="form-input" placeholder="Ex: Whey Protein Concentrado 900g" autoFocus />
              </div>
              <div>
                <Label>Marca</Label>
                <input type="text" name="brand" value={form.brand} onChange={handleChange} className="form-input" placeholder="Ex: Max Titanium" />
              </div>
              <div>
                <Label>Categoria</Label>
                <input type="text" name="category" value={form.category} onChange={handleChange} className="form-input" placeholder="Ex: Suplementos" />
              </div>
              <div className="sm:col-span-2 mt-2">
                <Label>Foto do Produto</Label>
                <div className="mt-2 flex items-center gap-4">
                  {form.photo_base64 ? (
                    <img src={form.photo_base64} alt="Preview" className="w-20 h-20 object-cover rounded-xl border-2 border-slate-200" />
                  ) : (
                    <div className="w-20 h-20 bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                      <Tag className="w-6 h-6" />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex gap-2">
                      <input type="file" accept="image/*" onChange={handleImageUpload} className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer" />
                      {form.photo_base64 && (
                        <button type="button" onClick={() => setForm(prev => ({ ...prev, photo_base64: "" }))} className="btn bg-red-50 text-red-600 hover:bg-red-100 text-xs px-3">Remover</button>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">Recomendado: 500x500px, fundo branco.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><Barcode className="w-5 h-5 text-blue-500" /> Códigos e Identificação</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Cód. Barras (EAN)</Label>
                <input type="text" name="barcode" value={form.barcode} onChange={handleChange} className="form-input font-mono text-sm" placeholder="Ex: 7891234567890" />
              </div>
              <div>
                <Label>SKU</Label>
                <input type="text" name="sku" value={form.sku} onChange={handleChange} className="form-input font-mono text-sm" placeholder="Ex: WHEY-MAX-900-MOR" />
              </div>
              <div>
                <Label>Cód. Interno</Label>
                <input type="text" name="internal_code" value={form.internal_code} onChange={handleChange} className="form-input font-mono text-sm" placeholder="Ex: 00125" />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><DollarSign className="w-5 h-5 text-emerald-500" /> Preço e Custos</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Custo Atual (R$)</Label>
                <NumberInput value={form.current_cost ? Number(form.current_cost) : null} onChange={(v) => handleNumberChange("current_cost", v)} placeholder="0,00" />
              </div>
              <div>
                <Label>Preço de Venda (R$) *</Label>
                <NumberInput value={form.selling_price ? Number(form.selling_price) : null} onChange={(v) => handleNumberChange("selling_price", v)} placeholder="0,00" required />
              </div>
              <div>
                <Label>Margem Bruta</Label>
                <div className={`flex h-10 items-center justify-center rounded-xl border border-dashed text-sm font-bold ${Number(margin) >= 30 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : Number(margin) >= 10 ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-red-50 text-red-700 border-red-200"}`}>
                  {margin}%
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Coluna Lateral */}
        <div className="space-y-6">
          <section className="card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><Package className="w-5 h-5 text-indigo-500" /> Estoque</h2>
            <div className="grid gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Unidade</Label>
                  <select name="unit_measure" value={form.unit_measure} onChange={handleChange} className="form-input">
                    <option value="UN">Unidade (UN)</option>
                    <option value="KG">Quilo (KG)</option>
                    <option value="CX">Caixa (CX)</option>
                    <option value="PCT">Pacote (PCT)</option>
                  </select>
                </div>
                <div>
                  <Label>Estoque Atual</Label>
                  <input type="number" name="current_stock" value={form.current_stock} onChange={handleChange} className="form-input font-bold text-blue-600" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Estoque Mínimo</Label>
                  <input type="number" name="minimum_stock" value={form.minimum_stock} onChange={handleChange} className="form-input" />
                </div>
                <div>
                  <Label>Estoque Máximo</Label>
                  <input type="number" name="maximum_stock" value={form.maximum_stock} onChange={handleChange} className="form-input" />
                </div>
              </div>
              <div>
                <Label className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Localização Física</Label>
                <input type="text" name="physical_location" value={form.physical_location} onChange={handleChange} className="form-input" placeholder="Ex: Prateleira A2" />
              </div>
            </div>
          </section>

          <section className="card p-6">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4 text-slate-800"><FileText className="w-5 h-5 text-orange-500" /> Fiscal</h2>
            <div className="grid gap-4">
              <div>
                <Label>NCM</Label>
                <input type="text" name="ncm" value={form.ncm} onChange={handleChange} className="form-input font-mono text-sm" placeholder="Ex: 2106.90.30" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>CFOP Padrão</Label>
                  <input type="text" name="cfop" value={form.cfop} onChange={handleChange} className="form-input font-mono text-sm" placeholder="Ex: 5102" />
                </div>
                <div>
                  <Label>CEST</Label>
                  <input type="text" name="cest" value={form.cest} onChange={handleChange} className="form-input font-mono text-sm" />
                </div>
              </div>
            </div>
          </section>

          <section className="card p-6">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" name="active" checked={form.active} onChange={handleChange} className="w-5 h-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="font-bold text-slate-800">Produto Ativo</span>
            </label>
            <p className="text-xs text-slate-500 mt-2 ml-8">Produtos inativos não aparecem no PDV para venda.</p>
          </section>

        </div>
      </div>
    </form>
  );
}
