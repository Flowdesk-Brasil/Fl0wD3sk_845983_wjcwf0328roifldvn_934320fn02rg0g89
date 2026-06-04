"use client";

import { CheckCircle2, FileCheck2, Loader2, ShieldCheck, FileText } from "lucide-react";
import { useEffect, useState, useRef, type FormEvent, type UIEvent } from "react";
import { ErrorBanner, FieldLabel } from "@/components/ui";
import { maskCPF, cn } from "@/lib/utils";

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
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contract && textRef.current) {
      const el = textRef.current;
      if (el.scrollHeight <= el.clientHeight + 10) {
        setScrolledToBottom(true);
      }
    }
  }, [contract]);

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop <= el.clientHeight + 10) {
      setScrolledToBottom(true);
    }
  }

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
            <div 
              ref={textRef}
              onScroll={handleScroll}
              className="h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border border-[#e3e8f0] bg-[#fbfcfe] p-5 text-[13px] leading-relaxed text-[#465168] shadow-inner"
            >
              {contract.documentText}
            </div>
          </div>
        </section>}
        {contract && <form className="card p-5 sm:p-7" onSubmit={submit}>
          <div className="grid gap-4">
            <label><FieldLabel required>CPF do titular</FieldLabel><input className="field" inputMode="numeric" required value={cpf} onChange={(event) => setCpf(maskCPF(event.target.value))} placeholder="000.000.000-00" /></label>
            <label><FieldLabel required>Assinatura (nome completo)</FieldLabel><input className="field" required minLength={3} value={signature} onChange={(event) => setSignature(event.target.value)} /></label>
            <label className={cn("flex items-start gap-3 rounded-xl border border-[#e3e8f0] p-4 text-sm text-[#465168]", !scrolledToBottom && "opacity-60 bg-[#f3f6fb]")}><input className="mt-1" type="checkbox" disabled={!scrolledToBottom} checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>{!scrolledToBottom ? "Role o contrato até o final para poder aceitar." : "Li o contrato e confirmo que os dados e condições apresentados estão corretos."}</span></label>
            <button className="btn btn-primary" disabled={sending || !accepted || !scrolledToBottom}>{sending ? "Registrando assinatura..." : "Assinar contrato"}</button>
          </div>
        </form>}
      </div>
    </main>
  );
}
