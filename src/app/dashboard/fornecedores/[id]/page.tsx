"use client";

import { useEffect, useState, use } from "react";
import { getSuppliers } from "@/lib/api";
import { Building2, ChevronLeft, MapPin, Phone, Mail, FileText, CheckCircle, Clock, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui";
import { deleteSupplier } from "@/lib/api";

export default function SupplierDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const handleDelete = async () => {
    if (!supplier || !confirm("Tem certeza que deseja excluir este fornecedor? Essa ação não pode ser desfeita.")) return;
    try {
      await deleteSupplier(supplier.id);
      router.push("/dashboard/fornecedores");
    } catch (err) {
      alert("Erro ao excluir fornecedor.");
    }
  };

  useEffect(() => {
    getSuppliers()
      .then(data => {
        const found = data.find(s => s.id === resolvedParams.id);
        setSupplier(found);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [resolvedParams.id]);

  if (loading) return <div className="p-8 text-center text-slate-500">Carregando detalhes...</div>;
  if (!supplier) return <div className="p-8 text-center text-slate-500">Fornecedor não encontrado.</div>;

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/dashboard/fornecedores" className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-blue-600 mb-6 transition-colors">
        <ChevronLeft className="w-4 h-4 mr-1" /> Voltar para Fornecedores
      </Link>

      <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200">
        <div className="flex items-start justify-between border-b border-slate-100 pb-8 mb-8">
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Building2 className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-3xl font-black text-slate-900 mb-1">{supplier.trade_name || supplier.corporate_name}</h1>
              <p className="text-slate-500 font-medium">{supplier.corporate_name}</p>
              <div className="mt-3">
                <StatusBadge tone={supplier.active !== false ? "green" : "gray"}>
                  {supplier.active !== false ? "Ativo" : "Inativo"}
                </StatusBadge>
              </div>
            </div>
          </div>
          <button onClick={handleDelete} className="btn bg-red-50 text-red-600 hover:bg-red-100 border-none">
            <Trash2 className="w-4 h-4" /> Excluir Fornecedor
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-500" /> Dados Cadastrais
            </h3>
            
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">CNPJ</p>
                <p className="font-medium text-slate-900">{supplier.cnpj || "Não informado"}</p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail</p>
                <p className="font-medium text-slate-900 flex items-center gap-2">
                  <Mail className="w-4 h-4 text-slate-400" /> {supplier.email || "Não informado"}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Telefone</p>
                <p className="font-medium text-slate-900 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-slate-400" /> {supplier.phone || "Não informado"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-blue-500" /> Localização
            </h3>
            
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <p className="text-slate-700 leading-relaxed">
                {supplier.address ? supplier.address : "Endereço não cadastrado."}
              </p>
            </div>
            
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mt-8">
              <Clock className="w-5 h-5 text-blue-500" /> Registro
            </h3>
            
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Cadastrado em</p>
              <p className="font-medium text-slate-900">{new Date(supplier.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
