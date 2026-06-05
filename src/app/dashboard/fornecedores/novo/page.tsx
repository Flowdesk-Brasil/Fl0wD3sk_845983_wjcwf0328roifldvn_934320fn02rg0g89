"use client";

import { useState } from "react";
import { ArrowLeft, Save, Building2, MapPin } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupplier } from "@/lib/api";
import { FieldLabel, ErrorBanner } from "@/components/ui";

export default function NovoFornecedorPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    corporate_name: "",
    trade_name: "",
    cnpj: "",
    state_registration: "",
    email: "",
    phone: "",
    zip_code: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const addressParts = [
        formData.street,
        formData.number,
        formData.complement,
        formData.neighborhood,
        formData.city,
        formData.state ? `- ${formData.state}` : "",
        formData.zip_code ? `CEP: ${formData.zip_code}` : ""
      ].filter(Boolean).join(", ");

      const payload = {
        corporate_name: formData.corporate_name,
        trade_name: formData.trade_name,
        cnpj: formData.cnpj,
        email: formData.email,
        phone: formData.phone,
        address: addressParts || null
      };

      await createSupplier(payload);
      router.push("/dashboard/fornecedores");
    } catch (err) {
      console.error(err);
      setError("Ocorreu um erro ao cadastrar o fornecedor.");
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex items-center gap-4">
        <Link href="/dashboard/fornecedores" className="icon-btn bg-white" aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">Novo Fornecedor</h1>
          <p className="text-sm text-slate-500">Cadastre um novo distribuidor ou fabricante</p>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6">
        <ErrorBanner message={error} />

        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-blue-500" /> 
            Dados Empresariais
          </h2>

          <div className="form-grid">
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Razão Social <span>*</span></FieldLabel>
              <input
                required
                type="text"
                className="field"
                value={formData.corporate_name}
                onChange={(e) => setFormData({ ...formData, corporate_name: e.target.value })}
                placeholder="Ex: Fornecedor Comercial Ltda"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Nome Fantasia <span>*</span></FieldLabel>
              <input
                required
                type="text"
                className="field"
                value={formData.trade_name}
                onChange={(e) => setFormData({ ...formData, trade_name: e.target.value })}
                placeholder="Ex: Comercial TudoAqui"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>CNPJ <span>*</span></FieldLabel>
              <input
                required
                type="text"
                className="field font-mono"
                value={formData.cnpj}
                onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Inscrição Estadual</FieldLabel>
              <input
                type="text"
                className="field font-mono"
                value={formData.state_registration}
                onChange={(e) => setFormData({ ...formData, state_registration: e.target.value })}
                placeholder="Opcional"
              />
            </div>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-blue-500" /> 
            Contato e Endereço
          </h2>

          <div className="form-grid">
            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>E-mail</FieldLabel>
              <input
                type="email"
                className="field"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="contato@fornecedor.com.br"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Telefone / WhatsApp</FieldLabel>
              <input
                type="text"
                className="field"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="(00) 00000-0000"
              />
            </div>
            
            <div className="col-span-2 border-t border-slate-100 my-2 pt-4"></div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>CEP</FieldLabel>
              <input
                type="text"
                className="field"
                value={formData.zip_code}
                onChange={(e) => setFormData({ ...formData, zip_code: e.target.value })}
                placeholder="00000-000"
              />
            </div>

            <div className="col-span-2 sm:col-span-1"></div>

            <div className="col-span-2">
              <FieldLabel>Logradouro (Rua, Av.)</FieldLabel>
              <input
                type="text"
                className="field"
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Número</FieldLabel>
              <input
                type="text"
                className="field"
                value={formData.number}
                onChange={(e) => setFormData({ ...formData, number: e.target.value })}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Complemento</FieldLabel>
              <input
                type="text"
                className="field"
                value={formData.complement}
                onChange={(e) => setFormData({ ...formData, complement: e.target.value })}
                placeholder="Sala, Galpão..."
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <FieldLabel>Bairro</FieldLabel>
              <input
                type="text"
                className="field"
                value={formData.neighborhood}
                onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })}
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <FieldLabel>Cidade</FieldLabel>
                  <input
                    type="text"
                    className="field"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  />
                </div>
                <div className="col-span-1">
                  <FieldLabel>Estado</FieldLabel>
                  <input
                    type="text"
                    className="field uppercase"
                    value={formData.state}
                    maxLength={2}
                    onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    placeholder="UF"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={() => router.back()} className="btn btn-secondary px-6">
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary px-8" disabled={loading}>
            <Save className="h-4 w-4" /> {loading ? "Salvando..." : "Salvar Fornecedor"}
          </button>
        </div>
      </form>
    </div>
  );
}
