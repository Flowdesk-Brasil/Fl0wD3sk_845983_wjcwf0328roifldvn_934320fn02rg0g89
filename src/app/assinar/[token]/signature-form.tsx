"use client";

import { CheckCircle2, FileCheck2, Loader2, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { ErrorBanner, FieldLabel } from "@/components/ui";
import { maskCPF } from "@/lib/utils";

type ContractView = {
  studentName: string;
  planName: string;
  documentText: string;
  documentUrl?: string | null;
  documentName?: string | null;
  studioName: string;
  expiresAt: string;
};

export function SignatureForm({ token }: { token: string }) {
  const [contract, setContract] = useState<ContractView | null>(null);
  const [cpf, setCpf] = useState("");
  const [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [signed, setSigned] = useState(false);

  useEffect(() => {
    fetch(`/api/public/contracts/${token}`, { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json() as { contract?: ContractView; error?: string };
        if (!response.ok || !payload.contract) throw new Error(payload.error || "Não foi possível abrir o contrato.");
        setContract(payload.contract);
        setSignature(payload.contract.studentName);
      })
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/public/contracts/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cpf, signature, accepted }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível registrar a assinatura.");
      setSigned(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível registrar a assinatura.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f7f9fc]"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></main>;
  if (signed) return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><section className="card max-w-lg p-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-green-600" /><h1 className="mt-5 text-2xl font-bold">Contrato assinado</h1><p className="mt-2 text-sm text-[#657085]">A confirmação já foi registrada no painel do Studio Corpo & Evolução.</p></section></main>;

  return (
    <main className="min-h-screen bg-[#f7f9fc] p-4 sm:p-8">
      <div className="mx-auto grid max-w-3xl gap-5">
        <header className="text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><FileCheck2 className="h-6 w-6" /></div><h1 className="mt-4 text-2xl font-bold">{contract?.studioName || "Corpo & Evolução"}</h1><p className="mt-1 text-sm text-[#657085]">Assinatura digital de contrato</p></header>
        <ErrorBanner message={error} />
        {contract && <section className="card overflow-hidden">
          <div className="card-header"><div><h2>{contract.studentName}</h2><p>Plano: {contract.planName}</p></div><ShieldCheck className="h-5 w-5 text-green-600" /></div>
          <div className="card-body grid gap-4">
            <div className="rounded-xl border border-[#e3e8f0] bg-[#fbfcfe] p-4 text-sm leading-7 text-[#465168]">{contract.documentText}</div>
            {contract.documentUrl && <a className="btn btn-secondary" href={contract.documentUrl} target="_blank" rel="noreferrer">Abrir PDF do contrato</a>}
          </div>
        </section>}
        {contract && <form className="card p-5 sm:p-7" onSubmit={submit}>
          <div className="grid gap-4">
            <label><FieldLabel required>CPF do titular</FieldLabel><input className="field" inputMode="numeric" required value={cpf} onChange={(event) => setCpf(maskCPF(event.target.value))} placeholder="000.000.000-00" /></label>
            <label><FieldLabel required>Assinatura (nome completo)</FieldLabel><input className="field" required minLength={3} value={signature} onChange={(event) => setSignature(event.target.value)} /></label>
            <label className="flex items-start gap-3 rounded-xl border border-[#e3e8f0] p-4 text-sm text-[#465168]"><input className="mt-1" type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Li o contrato e confirmo que os dados e condições apresentados estão corretos.</span></label>
            <button className="btn btn-primary" disabled={sending || !accepted}>{sending ? "Registrando assinatura..." : "Assinar contrato"}</button>
          </div>
        </form>}
      </div>
    </main>
  );
}
