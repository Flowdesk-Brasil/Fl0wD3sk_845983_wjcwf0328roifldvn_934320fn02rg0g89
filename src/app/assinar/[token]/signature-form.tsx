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
  const [fullScreenPdf, setFullScreenPdf] = useState(false);
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
        if (!response.ok || !payload.contract) throw new Error(payload.error || "NÃ£o foi possÃ­vel abrir o contrato.");
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
      if (!response.ok) throw new Error(payload.error || "NÃ£o foi possÃ­vel registrar a assinatura.");
      setSigned(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel registrar a assinatura.");
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#f7f9fc]"><Loader2 className="h-7 w-7 animate-spin text-blue-600" /></main>;
  if (signed) return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><section className="card max-w-lg p-8 text-center"><CheckCircle2 className="mx-auto h-14 w-14 text-green-600" /><h1 className="mt-5 text-2xl font-bold">Contrato assinado</h1><p className="mt-2 text-sm text-[#657085]">A confirmaÃ§Ã£o jÃ¡ foi registrada no painel do Studio Corpo & EvoluÃ§Ã£o.</p></section></main>;

  return (
    <main className="min-h-screen bg-[#f7f9fc] p-4 sm:p-8">
      <div className="mx-auto grid max-w-3xl gap-5">
        <header className="text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-600 text-white"><FileCheck2 className="h-6 w-6" /></div><h1 className="mt-4 text-2xl font-bold">{contract?.studioName || "Corpo & EvoluÃ§Ã£o"}</h1><p className="mt-1 text-sm text-[#657085]">Assinatura digital de contrato</p></header>
        <ErrorBanner message={error} />
        {contract && <section className="card overflow-hidden">
          <div className="card-header"><div><h2>{contract.studentName}</h2><p>Plano: {contract.planName}</p></div><ShieldCheck className="h-5 w-5 text-green-600" /></div>
          <div className="card-body grid gap-4 p-0 sm:p-0">
            {contract.documentUrl ? (
              <div className="relative h-[400px] sm:h-[500px] w-full bg-slate-100 group">
                <iframe 
                  src={`${contract.documentUrl}#toolbar=0&navpanes=0&scrollbar=0`} 
                  className="w-full h-full border-0 pointer-events-none"
                  title="Contrato PDF"
                />
                <button 
                  onClick={() => setFullScreenPdf(true)}
                  className="absolute inset-0 w-full h-full bg-black/5 hover:bg-black/20 transition-colors flex flex-col items-center justify-center gap-3 cursor-zoom-in"
                >
                  <div className="bg-white/90 backdrop-blur-sm text-blue-600 font-bold px-6 py-3 rounded-full shadow-lg flex items-center gap-2 transform group-hover:scale-105 transition-transform">
                    <FileText className="h-5 w-5" /> 
                    Toque para ler o contrato
                  </div>
                </button>
              </div>
            ) : (
              <div 
                ref={textRef}
                onScroll={handleScroll}
                className="h-80 overflow-y-auto whitespace-pre-wrap rounded-xl border-t border-b border-[#e3e8f0] bg-[#fbfcfe] p-5 text-[13px] leading-relaxed text-[#465168] shadow-inner m-5"
              >
                {contract.documentText}
              </div>
            )}
          </div>
        </section>}
        
        {contract && <form className="card p-5 sm:p-7 shadow-sm border-t-4 border-t-blue-600" onSubmit={submit}>
          <div className="grid gap-5">
            <h3 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-2">Assinatura Digital</h3>
            
            <label><FieldLabel required>CPF do titular</FieldLabel><input className="field" inputMode="numeric" required value={cpf} onChange={(event) => setCpf(maskCPF(event.target.value))} placeholder="000.000.000-00" /></label>
            <label><FieldLabel required>Nome completo igual ao documento</FieldLabel><input className="field" required minLength={3} value={signature} onChange={(event) => setSignature(event.target.value)} placeholder="Seu nome completo" /></label>
            
            <label className={cn("flex items-start gap-3 rounded-xl border p-4 text-sm transition-colors", !scrolledToBottom ? "border-slate-200 bg-slate-50 text-slate-400 opacity-70" : "border-blue-200 bg-blue-50/50 text-slate-700 cursor-pointer hover:bg-blue-50")}>
              <input className="mt-1 h-4 w-4 cursor-pointer accent-blue-600" type="checkbox" disabled={!scrolledToBottom} checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span className="font-medium leading-relaxed">
                {!scrolledToBottom ? (contract.documentUrl ? "VocÃª precisa abrir e ler o PDF do contrato antes de aceitar." : "Role o contrato atÃ© o final para poder aceitar.") : "Li o contrato, entendi todas as clÃ¡usulas e confirmo que os dados e condiÃ§Ãµes apresentados estÃ£o corretos."}
              </span>
            </label>
            
            <button className="btn btn-primary h-12 text-base font-bold tracking-wide shadow-md mt-2" disabled={sending || !accepted || !scrolledToBottom}>
              {sending ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Registrando com IP seguro...</> : "Assinar com valor legal"}
            </button>
          </div>
        </form>}
      </div>

      {/* Fullscreen PDF Modal */}
      {fullScreenPdf && contract?.documentUrl && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/95 backdrop-blur-sm flex flex-col animate-in fade-in duration-200">
          <header className="flex items-center justify-between p-4 bg-slate-900 text-white shadow-md z-10">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-blue-400" />
              <div>
                <h2 className="font-bold text-sm sm:text-base line-clamp-1">{contract.documentName || "Contrato"}</h2>
                <p className="text-xs text-slate-400">Deslize para ler atÃ© o fim</p>
              </div>
            </div>
            <button 
              onClick={() => {
                setFullScreenPdf(false);
                setScrolledToBottom(true); // Desbloqueia quando fechar o modal
              }}
              className="btn bg-blue-600 text-white border-none hover:bg-blue-500 font-bold px-6 shadow-lg"
            >
              Concluir leitura
            </button>
          </header>
          <div className="flex-1 w-full relative bg-slate-800">
            <iframe 
              src={`${contract.documentUrl}#toolbar=0`} 
              className="w-full h-full border-0 absolute inset-0"
              title="Contrato PDF"
            />
          </div>
        </div>
      )}
    </main>
  );
}
