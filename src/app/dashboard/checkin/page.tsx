"use client";

import { CheckCircle2, Clock3, QrCode, Search, ShieldAlert } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { IconInput } from "@/components/form-controls";
import { QrScanner } from "@/components/qr-scanner";
import { LoadingState, PageHeader, StatusBadge, Modal, FieldLabel } from "@/components/ui";
import { getCheckins, processCheckin } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Checkin, Student } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type Result = Checkin & { student?: Student | null; duplicate?: boolean };

export default function CheckinPage() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [history, setHistory] = useState<Checkin[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState("");

  const load = useCallback(async () => {
    setHistory((await getCheckins()).slice(0, 12));
    setLoading(false);
  }, []);

  useEffect(() => { 
    void load(); 
    
    // Escuta por check-ins manuais do desktop
    const channel = supabase.channel("manual-checkin")
      .on("broadcast", { event: "MANUAL_CHECKIN_APPROVED" }, ({ payload }) => {
        setResult({
          id: "manual-" + Date.now(),
          student_id: "manual",
          status: "allowed",
          reason: "Acesso liberado manualmente pela recepção.",
          checked_at: new Date().toISOString(),
          unit: "Matriz",
          student: { full_name: payload.name } as any
        });
        // Atualiza a lista após 2 segundos pra dar tempo de registrar
        setTimeout(() => load(), 2000);
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const validateCode = useCallback(async (value: string) => {
    if (!value.trim()) return null;
    setProcessing(true);
    try {
      const next = await processCheckin(value);
      setCode(value);
      setResult(next);
      await load();
      return next;
    } finally {
      setProcessing(false);
    }
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await validateCode(code);
  }

  async function handleManualRelease(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualName.trim()) return;
    
    // Mostra na tela atual
    setResult({
      id: "manual-" + Date.now(),
      student_id: "manual",
      status: "allowed",
      reason: "Acesso liberado manualmente pela recepção.",
      checked_at: new Date().toISOString(),
      unit: "Matriz",
      student: { full_name: manualName } as any
    });

    // Transmite para outros dispositivos (celular admin no modo câmera)
    supabase.channel("manual-checkin").send({
      type: "broadcast",
      event: "MANUAL_CHECKIN_APPROVED",
      payload: { name: manualName }
    });

    setManualOpen(false);
    setManualName("");
  }

  if (loading) return <LoadingState label="Preparando controle de acesso..." />;

  return (
    <div className="page-stack">
      <PageHeader 
        eyebrow="Operação em tempo real" 
        title="Check-in" 
        description="Valide o acesso por câmera, QR Code ou código manual."
        action={<button onClick={() => setManualOpen(true)} className="btn btn-primary">Liberar manualmente</button>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <section className="card p-5 sm:p-7">
          <div className="grid min-h-[360px] place-items-center text-center">
            <div className="w-full max-w-md">
              <div className="mx-auto grid h-20 w-20 place-items-center rounded-[24px] bg-blue-50 text-blue-600"><QrCode className="h-9 w-9" /></div>
              <h2 className="mt-5 text-xl font-bold tracking-[-.035em]">Validar entrada</h2>
              <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#657085]">Leia o QR Code exibido pelo aluno ou digite o código manualmente.</p>
              <form className="mt-6 flex gap-2" onSubmit={submit}>
                <label className="flex-1"><IconInput icon={Search} autoFocus value={code} onChange={(event) => setCode(event.target.value)} placeholder="Código do aluno" /></label>
                <button className="btn btn-primary" disabled={processing}>{processing ? "Validando..." : "Validar"}</button>
              </form>
              <div className="mt-3"><QrScanner disabled={processing} onRead={validateCode} /></div>
              <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#8d97aa]"><Clock3 className="h-3.5 w-3.5" /> Leituras repetidas em até 5 minutos não geram outro check-in.</p>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-7">
          <div className={`grid min-h-[360px] place-items-center rounded-2xl border border-dashed text-center ${result?.status === "allowed" ? "border-green-200 bg-green-50/50" : result?.status === "denied" ? "border-red-200 bg-red-50/50" : "border-[#dce3ee] bg-[#fbfcfe]"}`}>
            {!result ? <div><QrCode className="mx-auto h-10 w-10 text-[#c2cad7]" /><h3 className="mt-4 text-sm font-bold">Aguardando validação</h3><p className="mt-1 text-xs text-[#8d97aa]">O resultado da leitura aparecerá aqui.</p></div> : (
              <div className="max-w-sm px-5">
                <div className={`mx-auto grid h-20 w-20 place-items-center rounded-full ${result.status === "allowed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{result.status === "allowed" ? <CheckCircle2 className="h-9 w-9" /> : <ShieldAlert className="h-9 w-9" />}</div>
                <h2 className={`mt-5 text-2xl font-extrabold tracking-[-.04em] ${result.status === "allowed" ? "text-green-700" : "text-red-700"}`}>{result.duplicate ? "Check-in já realizado" : result.status === "allowed" ? "Acesso liberado" : "Acesso negado"}</h2>
                <p className="mt-2 text-sm font-semibold text-[#172033]">{result.student?.full_name ?? "Código não identificado"}</p>
                <p className="mt-1 text-xs text-[#657085]">{result.reason ?? "Matrícula ativa e acesso regular."}</p>
                <button className="btn btn-secondary mt-6" onClick={() => { setResult(null); setCode(""); }}>Nova leitura</button>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="card">
        <div className="card-header"><div><h2>Histórico recente</h2><p>Últimas tentativas de acesso</p></div><StatusBadge tone="blue">{history.length} registros</StatusBadge></div>
        <div className="table-wrap"><table className="data-table">
          <thead><tr><th>Aluno</th><th>Situação</th><th className="hide-mobile">Motivo</th><th>Data e hora</th></tr></thead>
          <tbody>{history.map((item) => <tr key={item.id}><td><strong className="text-xs text-[#172033]">{item.student?.full_name ?? "Não identificado"}</strong></td><td><StatusBadge tone={item.status === "allowed" ? "green" : "red"}>{item.status === "allowed" ? "Liberado" : "Negado"}</StatusBadge></td><td className="hide-mobile">{item.reason ?? "Acesso regular"}</td><td>{formatDateTime(item.checked_at)}</td></tr>)}</tbody>
        </table></div>
      </section>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="Liberação Manual" description="Libere a catraca/acesso registrando o nome do visitante ou aluno.">
        <form onSubmit={handleManualRelease} className="grid gap-4">
          <label>
            <FieldLabel required>Nome da pessoa</FieldLabel>
            <input 
              autoFocus
              required 
              type="text" 
              className="field" 
              placeholder="Ex: João Silva (Visitante)" 
              value={manualName} 
              onChange={(e) => setManualName(e.target.value)} 
            />
          </label>
          <div className="flex justify-end gap-2 mt-2">
            <button type="button" className="btn btn-secondary" onClick={() => setManualOpen(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!manualName.trim()}>Confirmar Liberação</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
