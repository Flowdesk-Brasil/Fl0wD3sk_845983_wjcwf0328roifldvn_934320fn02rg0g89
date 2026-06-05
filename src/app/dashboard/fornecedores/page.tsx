"use client";

import { useEffect, useState } from "react";
import { Plus, Search, Building2, Eye, Truck, Phone, Mail } from "lucide-react";
import Link from "next/link";
import { getSuppliers } from "@/lib/api";
import { EmptyState, SearchInput, StatusBadge } from "@/components/ui";

export default function FornecedoresPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getSuppliers()
      .then((data) => setSuppliers(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = suppliers.filter((s) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return s.trade_name?.toLowerCase().includes(term) || 
           s.corporate_name?.toLowerCase().includes(term) || 
           s.cnpj?.includes(term);
  });

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Carregando fornecedores...</div>;
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900">Fornecedores</h1>
          <p className="text-sm text-slate-500 mt-1">Gerencie fabricantes e distribuidores de produtos e suprimentos.</p>
        </div>
        <Link href="/dashboard/fornecedores/novo" className="btn btn-primary whitespace-nowrap shadow-lg shadow-blue-600/20">
          <Plus className="h-4 w-4" /> Cadastrar Fornecedor
        </Link>
      </header>

      <section className="card">
        <div className="table-toolbar">
          <div className="flex-1 max-w-md">
            <SearchInput 
              value={search} 
              onChange={setSearch} 
              placeholder="Buscar por Fantasia, Razão Social ou CNPJ..." 
            />
          </div>
        </div>

        {filtered.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Contato</th>
                  <th className="hide-mobile">Localidade</th>
                  <th>Status</th>
                  <th className="text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 border border-slate-200">
                          <Building2 className="w-5 h-5 text-slate-400" />
                        </div>
                        <span className="min-w-0">
                          <strong className="block truncate text-sm text-slate-900">{s.trade_name || s.corporate_name}</strong>
                          <small className="mt-0.5 flex items-center gap-2 truncate text-[11px] text-slate-500 font-mono">
                            {s.cnpj}
                          </small>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="text-xs text-slate-600 space-y-1">
                        {s.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3 text-slate-400"/> {s.phone}</div>}
                        {s.email && <div className="flex items-center gap-1.5"><Mail className="w-3 h-3 text-slate-400"/> {s.email}</div>}
                        {!s.phone && !s.email && <span className="text-slate-400 italic">Nenhum contato</span>}
                      </div>
                    </td>
                    <td className="hide-mobile">
                      <span className="text-xs text-slate-600 font-medium">
                        {s.city ? `${s.city} - ${s.state}` : "Não informado"}
                      </span>
                    </td>
                    <td>
                      <StatusBadge tone={s.active !== false ? "green" : "gray"}>
                        {s.active !== false ? "Ativo" : "Inativo"}
                      </StatusBadge>
                    </td>
                    <td className="text-right">
                      <Link href={`/dashboard/fornecedores/${s.id}`} className="btn btn-secondary text-xs px-3 py-1.5">
                        <Eye className="h-3.5 w-3.5" /> Detalhes
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState 
            icon={Truck} 
            title="Nenhum fornecedor cadastrado" 
            description="Você ainda não possui fornecedores ou a busca não encontrou resultados." 
            action={
              <Link href="/dashboard/fornecedores/novo" className="btn btn-primary mt-4">
                Cadastrar Primeiro Fornecedor
              </Link>
            } 
          />
        )}
      </section>
    </div>
  );
}
