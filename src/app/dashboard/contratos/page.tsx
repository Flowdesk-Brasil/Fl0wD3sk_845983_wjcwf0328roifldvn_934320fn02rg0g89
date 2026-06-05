"use client";

import { FileSignature, Mail, RotateCcw, ScrollText } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorBanner, LoadingState, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import { getContracts, sendContractForSignature, signContract, updateContractStatus } from "@/lib/api";
import type { Contract } from "@/lib/types";
import { formatDate } from "@/lib/utils";

export default function ContratosPage() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setContracts(await getContracts());
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => contracts.filter((item) => !search || item.student?.full_name.toLowerCase().includes(search.toLowerCase())), [contracts, search]);

  async function run(id: string, action: () => Promise<unknown>, success?: string) {
    setWorking(id);
    setError(null);
    setMessage(null);
    try {
      await action();
      if (success) setMessage(success);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel concluir a aÃ§Ã£o.");
    } finally {
      setWorking(null);
    }
  }

  if (loading) return <LoadingState label="Carregando contratos..." />;

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Documentos digitais" title="Contratos" description="Envie contratos por e-mail, acompanhe assinaturas e corrija confirmaÃ§Ãµes acidentais." />
      <ErrorBanner message={error} />
      {message && <div className="success-banner"><Mail className="h-4 w-4" /> {message}</div>}
      <section className="card">
        <div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Buscar por aluno..." /><StatusBadge tone="blue">{contracts.length} documentos</StatusBadge></div>
        {filtered.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Aluno</th><th>Plano</th><th className="hide-mobile">Gerado em</th><th>Status</th><th>AÃ§Ã£o</th></tr></thead>
          <tbody>{filtered.map((contract) => <tr key={contract.id}>
            <td><div className="flex items-center gap-3"><span className="avatar"><ScrollText className="h-4 w-4" /></span><strong className="text-xs text-[#172033]">{contract.student?.full_name ?? "Aluno removido"}</strong></div></td>
            <td>{contract.plan?.name ?? "Plano removido"}</td>
            <td className="hide-mobile">{formatDate(contract.created_at)}</td>
            <td><StatusBadge tone={contract.status === "signed" ? "green" : contract.status === "cancelled" ? "red" : "yellow"}>{contract.status === "signed" ? "Assinado" : contract.status === "cancelled" ? "Cancelado" : "Pendente"}</StatusBadge></td>
            <td><div className="flex flex-wrap gap-2">
              {contract.status === "pending" && <button className="btn btn-primary min-h-8 px-3 py-1.5 text-[10px]" disabled={working === contract.id} onClick={() => void run(contract.id, () => sendContractForSignature(contract.id), "Contrato enviado para o e-mail cadastrado do aluno.")}><Mail className="h-3.5 w-3.5" /> Enviar por e-mail</button>}
              {contract.status === "pending" && <button className="btn btn-success min-h-8 px-3 py-1.5 text-[10px]" disabled={working === contract.id} onClick={() => void run(contract.id, () => signContract(contract.id))}><FileSignature className="h-3.5 w-3.5" /> Confirmar manualmente</button>}
              {contract.status === "signed" && <button className="btn btn-secondary min-h-8 px-3 py-1.5 text-[10px]" disabled={working === contract.id} onClick={() => { if (window.confirm("Voltar este contrato para pendente? A assinatura atual serÃ¡ removida.")) void run(contract.id, () => updateContractStatus(contract.id, "pending")); }}><RotateCcw className="h-3.5 w-3.5" /> Voltar para pendente</button>}
            </div></td>
          </tr>)}</tbody>
        </table></div> : <EmptyState icon={ScrollText} title="Nenhum contrato encontrado" description="Contratos sÃ£o gerados automaticamente ao criar matrÃ­culas." />}
      </section>
    </div>
  );
}
