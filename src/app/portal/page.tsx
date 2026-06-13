"use client";

import { CalendarDays, Check, CheckCircle2, Copy, CreditCard, FileCheck2, FileSignature, LogOut, QrCode, Bell, XCircle } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { StudentQrCard } from "@/components/student-qr-card";
import { ErrorBanner, LoadingState, Modal, StatusBadge } from "@/components/ui";
import { createPixPayment, updateAttendanceStatus } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Student, ClassAttendance } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY";

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) { outputArray[i] = rawData.charCodeAt(i); }
  return outputArray;
}

type PortalData = {
  student: Student;
  attendances: ClassAttendance[];
  payments: Array<{ id: string; reference: string; total_amount: number; status: string; due_date: string; pix_code?: string; pix_qr_base64?: string }>;
  contracts: Array<{ id: string; status: string; signed_at?: string | null; created_at: string; plan?: { name: string } }>;
  requiredContract?: { id: string; created_at: string; signingUrl: string; plan?: { name: string } | null } | null;
};

export default function StudentPortalPage() {
  const { user, isLoading, logout } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [pix, setPix] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushChecking, setPushChecking] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  async function reloadData(token?: string) {
    const { data: session } = await supabase.auth.getSession();
    const accessToken = token ?? session.session?.access_token ?? "";
    const response = await fetch("/api/student/portal", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    const payload = await response.json() as PortalData & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seu portal.");
    setData(payload);
  }

  useEffect(() => {
    if (!user || user.app_role !== "student") return;
    reloadData().catch((reason: Error) => setError(reason.message));

    // Check Push status
    if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
      setPushSupported(true);
      if (Notification.permission === 'granted') {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          reg.pushManager.getSubscription().then(async (sub) => {
            try {
              if (sub) {
                await sub.unsubscribe();
              }
              const newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
              });
              await fetch('/api/push/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subscription: newSub, student_id: user.id })
              });
              setPushEnabled(true);
            } catch (err) {
              console.error("Auto-subscribe failed:", err);
              setPushEnabled(false);
            }
            setPushChecking(false);
          });
        });
      } else {
        setPushEnabled(false);
        setPushChecking(false);
      }
    } else {
      setPushSupported(false);
      setPushEnabled(true);
      setPushChecking(false);
    }
  }, [user]);

  const subscribePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Notificações não suportadas neste navegador.');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert('Você bloqueou as notificações.');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, student_id: user!.id })
      });
      setPushEnabled(true);
      // Reload portal data now that we are unlocked
      await reloadData();
    } catch (err) {
      console.error('Erro ao assinar push:', err);
      alert('Erro ao ativar notificações. Tente recarregar a página.');
    }
  };

  const answerAttendance = async (attendanceId: string, status: "confirmed" | "cancelled") => {
    setLoadingAction(attendanceId);
    try {
      await updateAttendanceStatus(attendanceId, status);
      // Reload from server to get fresh real IDs and status
      await reloadData();
    } catch (e: any) {
      alert(e.message || "Erro ao confirmar.");
    } finally {
      setLoadingAction(null);
    }
  };

  async function generatePix(paymentId: string) {
    setWorking(paymentId);
    setError(null);
    try {
      const generated = await createPixPayment(paymentId);
      setPix(generated);
      // Reload portal data to reflect status change
      if (user) {
        const { data: session } = await supabase.auth.getSession();
        const response = await fetch("/api/student/portal", {
          headers: { Authorization: `Bearer ${session?.session?.access_token ?? ""}` },
          cache: "no-store",
        });
        const payload = await response.json();
        if (response.ok) setData(payload);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o PIX.");
    } finally {
      setWorking(null);
    }
  }

  async function copyPix() {
    if (!pix?.pix_code) return;
    await navigator.clipboard.writeText(pix.pix_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (isLoading) return <LoadingState label="Abrindo portal do aluno..." />;
  if (!user) return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><section className="card max-w-md p-7 text-center"><QrCode className="mx-auto h-10 w-10 text-blue-600" /><h1 className="mt-4 text-xl font-bold">Portal do aluno</h1><p className="mt-2 text-sm text-[#657085]">Use o link enviado ao seu e-mail ou entre com sua conta.</p><Link className="btn btn-primary mt-5" href="/">Entrar</Link></section></main>;
  if (user.app_role !== "student") return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><Link className="btn btn-primary" href="/dashboard">Voltar ao painel</Link></main>;
  if (!data && !error) return <LoadingState label="Carregando seus dados..." />;

  return (
    <main className="min-h-screen bg-[#f7f9fc] p-4 sm:p-8">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex items-center justify-between gap-4"><div><p className="eyebrow">Portal do aluno</p><h1 className="page-title">{data?.student.full_name || user.full_name}</h1></div><button className="btn btn-secondary" onClick={() => void logout()}><LogOut className="h-4 w-4" /> Sair</button></header>
        <ErrorBanner message={error} />
        {data && <>
        {data.requiredContract ? (
          <section className="card overflow-hidden">
            <div className="grid gap-0 lg:grid-cols-[1fr_360px]">
              <div className="card-body grid gap-5 p-6 sm:p-8">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
                  <FileSignature className="h-7 w-7" />
                </div>
                <div>
                  <p className="eyebrow">Primeiro acesso</p>
                  <h2 className="mt-2 text-2xl font-black text-[#172033]">Assine seu contrato para liberar o portal</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-[#657085]">
                    Seu cadastro ja esta ativo, mas o QR Code, aulas, financeiro e demais recursos ficam bloqueados ate a assinatura digital do contrato pendente.
                  </p>
                </div>
                <div className="grid gap-3 rounded-2xl border border-[#e3e8f0] bg-[#fbfcfe] p-4 sm:grid-cols-2">
                  <div>
                    <span className="field-label">Plano</span>
                    <strong className="mt-1 block text-sm text-[#172033]">{data.requiredContract.plan?.name || "Plano contratado"}</strong>
                  </div>
                  <div>
                    <span className="field-label">Status</span>
                    <StatusBadge tone="yellow">Contrato pendente</StatusBadge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Link className="btn btn-primary" href={data.requiredContract.signingUrl}>
                    <FileCheck2 className="h-4 w-4" /> Revisar e assinar agora
                  </Link>
                  <button className="btn btn-secondary" onClick={() => void reloadData()}>
                    Ja assinei, atualizar portal
                  </button>
                </div>
              </div>
              <aside className="border-t border-[#e3e8f0] bg-[#f7f9fc] p-6 lg:border-l lg:border-t-0">
                <h3 className="text-sm font-bold text-[#172033]">O que acontece depois</h3>
                <div className="mt-4 grid gap-3 text-sm text-[#657085]">
                  <div className="rounded-xl bg-white p-4 shadow-sm"><strong className="block text-[#172033]">1. Leitura</strong><span>Leia o contrato completo e confirme os termos.</span></div>
                  <div className="rounded-xl bg-white p-4 shadow-sm"><strong className="block text-[#172033]">2. CPF</strong><span>Informe o CPF do titular para validar a assinatura.</span></div>
                  <div className="rounded-xl bg-white p-4 shadow-sm"><strong className="block text-[#172033]">3. Portal liberado</strong><span>Volte para o portal e acesse QR Code, aulas e cobranças.</span></div>
                </div>
              </aside>
            </div>
          </section>
        ) : (
        <>
        {pushChecking ? (
          <div className="bg-white rounded-3xl shadow-xl p-8 mb-6 flex flex-col items-center text-center mt-10 max-w-md mx-auto">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-600 font-semibold">Verificando segurança...</p>
          </div>
        ) : pushSupported && !pushEnabled ? (
          <div className="bg-white rounded-3xl shadow-xl p-8 mb-6 flex flex-col items-center text-center mt-10 max-w-md mx-auto">
            <div className="bg-blue-100 p-4 rounded-full mb-6">
              <Bell className="h-12 w-12 text-blue-600 animate-pulse" />
            </div>
            <h3 className="text-slate-900 text-2xl font-black mb-3">Acesso Protegido</h3>
            <p className="text-slate-600 mb-8 leading-relaxed text-sm font-medium">
              O seu QR Code e agendamento de aulas só serão liberados após você permitir o envio de notificações. 
              {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
                <strong className="block mt-4 text-red-600">Você bloqueou as notificações no seu navegador! Por favor, vá nas configurações do navegador/celular, permita as notificações para este site e recarregue a página.</strong>
              )}
            </p>
            <button onClick={subscribePush} className="bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/30 font-bold py-4 px-8 rounded-2xl transition w-full text-lg">
              {typeof Notification !== 'undefined' && Notification.permission === 'denied' ? 'Tentar novamente' : 'Permitir Notificações'}
            </button>
          </div>
        ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <StudentQrCard code={data.student.qr_code} name={data.student.full_name} />
            <section className="card">
              <div className="card-header"><div><h2>Próximas aulas</h2><p>Confirme sua presença</p></div><CalendarDays className="h-5 w-5 text-blue-600" /></div>
              <div className="card-body grid gap-3">
                {data.attendances.length ? data.attendances.map((att) => (
                  <article className="rounded-xl border border-[#e3e8f0] p-4 bg-white" key={att.id}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <strong className="text-sm">{att.class_schedule?.class_type?.name || "Aula"}</strong>
                        <p className="mt-1 text-xs text-[#657085]">Hoje às {att.class_schedule?.time || "Horário indisponível"}</p>
                        <p className="mt-1 text-[11px] text-blue-600">{att.class_schedule?.instructor?.full_name || "Professor a definir"}</p>
                      </div>
                      <StatusBadge tone={att.status === 'pending' ? 'yellow' : att.status === 'confirmed' ? 'green' : 'red'}>
                        {att.status === 'pending' ? 'Aguardando' : att.status === 'confirmed' ? 'Confirmado' : 'Cancelado'}
                      </StatusBadge>
                    </div>
                    {att.status === 'pending' && (
                      <div className="grid grid-cols-2 gap-3 mt-4 border-t pt-4">
                        <button onClick={() => answerAttendance(att.id, 'cancelled')} disabled={loadingAction === att.id} className="flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-600 font-semibold p-2 rounded-lg transition text-xs">
                          <XCircle className="h-4 w-4" /> Não irei
                        </button>
                        <button onClick={() => answerAttendance(att.id, 'confirmed')} disabled={loadingAction === att.id} className="flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold p-2 rounded-lg transition text-xs shadow-sm">
                          <CheckCircle2 className="h-4 w-4" /> Confirmar
                        </button>
                      </div>
                    )}
                  </article>
                )) : <p className="text-sm text-[#657085]">Você ainda não possui aulas agendadas para hoje.</p>}
              </div>
            </section>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card"><div className="card-header"><div><h2>Financeiro</h2><p>Últimas cobranças</p></div><CreditCard className="h-5 w-5 text-blue-600" /></div><div className="table-wrap"><table className="data-table"><tbody>{data.payments.map((payment) => <tr key={payment.id}><td><strong>{payment.reference}</strong><small className="mt-1 block text-[#8d97aa]">Vence em {formatDate(payment.due_date)}</small></td><td>{formatCurrency(Number(payment.total_amount))}</td><td><StatusBadge tone={payment.status === "paid" ? "green" : payment.status === "cancelled" ? "red" : "yellow"}>{payment.status === "paid" ? "Pago" : payment.status === "cancelled" ? "Cancelado" : "Pendente"}</StatusBadge></td><td>{payment.status !== "paid" && <button className="btn btn-primary min-h-8 px-3 py-1.5 text-[10px]" disabled={working === payment.id} onClick={() => void generatePix(payment.id)}><QrCode className="mr-1.5 h-3.5 w-3.5" /> Pagar com PIX</button>}</td></tr>)}</tbody></table></div></section>
            <section className="card"><div className="card-header"><div><h2>Contratos</h2><p>Documentos vinculados</p></div><FileCheck2 className="h-5 w-5 text-blue-600" /></div><div className="table-wrap"><table className="data-table"><tbody>{data.contracts.map((contract) => <tr key={contract.id}><td><strong>{contract.plan?.name || "Contrato"}</strong><small className="mt-1 block text-[#8d97aa]">{formatDate(contract.created_at)}</small></td><td><StatusBadge tone={contract.status === "signed" ? "green" : "yellow"}>{contract.status === "signed" ? "Assinado" : "Pendente"}</StatusBadge></td></tr>)}</tbody></table></div></section>
          </div>
        </>
        )}
        </>
        )}
        </>
        }
      </div>

      <Modal open={Boolean(pix)} onClose={() => setPix(null)} title={pix?.status === "paid" ? "PIX aprovado" : "PIX pronto para pagamento"} description={pix ? `Valor: ${formatCurrency(Number(pix.total_amount))}` : ""} size="sm">
        {pix && <div className="grid gap-4 text-center">
          {pix.status === "paid" ? <div className="rounded-2xl bg-green-50 p-6 text-green-700"><CheckCircle2 className="mx-auto h-12 w-12" /><strong className="mt-3 block text-lg">Pagamento confirmado automaticamente</strong></div> : <>
            {pix.pix_qr_base64 && <Image unoptimized width={256} height={256} className="mx-auto rounded-2xl border border-[#e3e8f0] p-2" alt="QR Code PIX" src={`data:image/png;base64,${pix.pix_qr_base64}`} />}
            <p className="text-xs leading-5 text-[#657085]">Acesse o aplicativo do seu banco para ler o QR Code ou copie a chave abaixo.</p>
            <button className="btn btn-secondary" disabled={!pix.pix_code} onClick={() => void copyPix()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Código copiado" : "Copiar PIX copia e cola"}</button>
          </>}
        </div>}
      </Modal>
    </main>
  );
}
