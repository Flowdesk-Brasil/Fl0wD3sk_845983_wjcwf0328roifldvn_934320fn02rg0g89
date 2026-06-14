"use client";

import { Bell, CalendarDays, Check, CheckCircle2, Copy, CreditCard, FileCheck2, FileSignature, Home, LogOut, QrCode, Settings, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StudentQrCard } from "@/components/student-qr-card";
import { ErrorBanner, LoadingState, Modal, StatusBadge } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { createPixPayment, updateAttendanceStatus } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { ClassAttendance, Student } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type PortalTab = "home" | "payments" | "qr" | "classes" | "settings";

type PortalData = {
  student: Student;
  attendances: ClassAttendance[];
  payments: Array<{ id: string; reference: string; total_amount: number; status: string; due_date: string; pix_code?: string; pix_qr_base64?: string }>;
  contracts: Array<{ id: string; status: string; signed_at?: string | null; created_at: string; plan?: { name: string } }>;
  requiredContract?: { id: string; created_at: string; signingUrl: string; plan?: { name: string } | null } | null;
};

function statusTone(status: string) {
  if (status === "paid" || status === "confirmed" || status === "attended") return "green";
  if (status === "cancelled" || status === "missed") return "red";
  return "yellow";
}

export default function StudentPortalPage() {
  const { user, isLoading, logout } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>("home");
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
    const response = await fetch("/api/student/portal", {
      headers: { Authorization: `Bearer ${token ?? session.session?.access_token ?? ""}` },
      cache: "no-store",
    });
    const payload = await response.json() as PortalData & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Nao foi possivel carregar seu portal.");
    setData(payload);
  }

  useEffect(() => {
    if (!user || user.app_role !== "student") return;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "qr" || tab === "payments" || tab === "classes" || tab === "settings" || tab === "home") {
      setActiveTab(tab);
    }
    reloadData().catch((reason: Error) => setError(reason.message));

    if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
      setPushSupported(true);
      if (Notification.permission === "granted") {
        navigator.serviceWorker.register("/sw.js").then((reg) => {
          reg.pushManager.getSubscription().then(async (sub) => {
            try {
              if (sub) await sub.unsubscribe();
              const newSub = await reg.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
              });
              await fetch("/api/push/subscribe", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ subscription: newSub, student_id: user.id }),
              });
              setPushEnabled(true);
            } catch {
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

  async function subscribePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      alert("Notificacoes nao suportadas neste navegador.");
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("Voce bloqueou as notificacoes.");
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription, student_id: user!.id }),
      });
      setPushEnabled(true);
      await reloadData();
    } catch {
      alert("Erro ao ativar notificacoes. Tente recarregar a pagina.");
    }
  }

  async function answerAttendance(attendance: ClassAttendance, status: "confirmed" | "cancelled") {
    setLoadingAction(attendance.id);
    try {
      const updated = await updateAttendanceStatus(attendance, status);
      setData((current) => current
        ? { ...current, attendances: current.attendances.map((item) => item.id === attendance.id ? { ...item, ...updated } : item) }
        : current);
      await reloadData();
    } catch (reason: any) {
      alert(reason.message || "Erro ao confirmar.");
    } finally {
      setLoadingAction(null);
    }
  }

  async function generatePix(paymentId: string) {
    setWorking(paymentId);
    setError(null);
    try {
      const generated = await createPixPayment(paymentId);
      setPix(generated);
      await reloadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nao foi possivel gerar o PIX.");
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

  const nextClass = useMemo(() => data?.attendances.find((item) => item.status === "pending") ?? data?.attendances[0], [data]);
  const pendingPayments = data?.payments.filter((payment) => payment.status !== "paid" && payment.status !== "cancelled") ?? [];

  if (isLoading) return <LoadingState label="Abrindo portal do aluno..." />;
  if (!user) return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><section className="card max-w-md p-7 text-center"><QrCode className="mx-auto h-10 w-10 text-blue-600" /><h1 className="mt-4 text-xl font-bold">Portal do aluno</h1><p className="mt-2 text-sm text-[#657085]">Use o link enviado ao seu e-mail ou entre com sua conta.</p><Link className="btn btn-primary mt-5" href="/">Entrar</Link></section></main>;
  if (user.app_role !== "student") return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><Link className="btn btn-primary" href="/dashboard">Voltar ao painel</Link></main>;
  if (!data && !error) return <LoadingState label="Carregando seus dados..." />;

  if (data?.requiredContract) {
    return (
      <main className="min-h-screen bg-[#f7f9fc] p-5">
        <section className="mx-auto max-w-md overflow-hidden rounded-[28px] border border-[#e3e8f0] bg-white shadow-xl">
          <div className="p-7">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
              <FileSignature className="h-7 w-7" />
            </div>
            <p className="eyebrow mt-6">Primeiro acesso</p>
            <h1 className="mt-2 text-2xl font-black text-[#172033]">Assine seu contrato para liberar o app</h1>
            <p className="mt-3 text-sm leading-6 text-[#657085]">Seu QR Code, aulas e financeiro ficam bloqueados ate a assinatura digital do contrato pendente.</p>
            <div className="mt-5 rounded-2xl border border-[#e3e8f0] bg-[#fbfcfe] p-4">
              <span className="field-label">Plano</span>
              <strong className="mt-1 block text-sm text-[#172033]">{data.requiredContract.plan?.name || "Plano contratado"}</strong>
            </div>
            <Link className="btn btn-primary mt-5 w-full" href={data.requiredContract.signingUrl}>
              <FileCheck2 className="h-4 w-4" /> Revisar e assinar agora
            </Link>
            <button className="btn btn-secondary mt-3 w-full" onClick={() => void reloadData()}>Ja assinei, atualizar</button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f6f8fb] pb-28">
      <div className="mx-auto min-h-screen max-w-md px-4 pb-6 pt-4">
        <header className="flex items-center justify-between rounded-[28px] bg-[#101827] p-5 text-white shadow-xl">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-blue-200">Portal do aluno</p>
            <h1 className="mt-1 max-w-[250px] truncate text-2xl font-black">{data?.student.full_name || user.full_name}</h1>
          </div>
          <button className="grid h-11 w-11 place-items-center rounded-2xl bg-white/10" onClick={() => void logout()} aria-label="Sair">
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <ErrorBanner message={error} />

        {pushChecking ? (
          <section className="mt-5 rounded-[28px] bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-b-2 border-blue-600" />
            <p className="text-sm font-semibold text-slate-600">Verificando seguranca...</p>
          </section>
        ) : pushSupported && !pushEnabled ? (
          <section className="mt-5 rounded-[28px] bg-white p-6 text-center shadow-sm">
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-3xl bg-blue-50">
              <Bell className="h-8 w-8 text-blue-600" />
            </div>
            <h2 className="text-xl font-black text-slate-950">Ative as notificacoes</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Elas liberam avisos de aulas e confirmacoes direto no app.</p>
            <button onClick={subscribePush} className="mt-5 min-h-12 w-full rounded-2xl bg-blue-600 px-5 font-black text-white shadow-lg shadow-blue-600/20">Permitir notificacoes</button>
          </section>
        ) : (
          <div className="mt-5">
            {activeTab === "home" && (
              <div className="grid gap-4">
                <section className="rounded-[28px] bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase tracking-[.14em] text-slate-400">Resumo de hoje</p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-blue-50 p-4">
                      <span className="text-xs font-bold text-blue-700">Aulas</span>
                      <strong className="mt-1 block text-2xl text-slate-950">{data?.attendances.length ?? 0}</strong>
                    </div>
                    <div className="rounded-2xl bg-amber-50 p-4">
                      <span className="text-xs font-bold text-amber-700">Faturas</span>
                      <strong className="mt-1 block text-2xl text-slate-950">{pendingPayments.length}</strong>
                    </div>
                  </div>
                </section>
                {nextClass && <ClassCard attendance={nextClass} loadingAction={loadingAction} onAnswer={answerAttendance} featured />}
                <button className="rounded-[28px] bg-[#101827] p-5 text-left text-white shadow-xl" onClick={() => setActiveTab("qr")}>
                  <QrCode className="h-7 w-7 text-blue-300" />
                  <strong className="mt-4 block text-xl">Abrir QR Code</strong>
                  <span className="mt-1 block text-sm text-slate-300">Use para acessar a catraca rapidamente.</span>
                </button>
              </div>
            )}

            {activeTab === "qr" && data && (
              <section className="rounded-[32px] bg-white p-5 shadow-sm">
                <StudentQrCard code={data.student.qr_code} name={data.student.full_name} />
              </section>
            )}

            {activeTab === "classes" && (
              <section className="grid gap-3">
                <SectionTitle title="Aulas de hoje" subtitle="Confirme sua presenca ou avise se nao vai." />
                {data?.attendances.length ? data.attendances.map((attendance) => (
                  <ClassCard key={attendance.id} attendance={attendance} loadingAction={loadingAction} onAnswer={answerAttendance} />
                )) : <EmptyAppCard text="Voce ainda nao possui aulas agendadas para hoje." />}
              </section>
            )}

            {activeTab === "payments" && (
              <section className="grid gap-3">
                <SectionTitle title="Faturas" subtitle="Acompanhe vencimentos e gere PIX." />
                {data?.payments.length ? data.payments.map((payment) => (
                  <article key={payment.id} className="rounded-[24px] bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <strong className="text-sm text-slate-950">{payment.reference}</strong>
                        <p className="mt-1 text-xs text-slate-500">Vence em {formatDate(payment.due_date)}</p>
                      </div>
                      <StatusBadge tone={statusTone(payment.status) as any}>{payment.status === "paid" ? "Pago" : payment.status === "cancelled" ? "Cancelado" : "Pendente"}</StatusBadge>
                    </div>
                    <div className="mt-4 flex items-center justify-between">
                      <strong className="text-xl text-slate-950">{formatCurrency(Number(payment.total_amount))}</strong>
                      {payment.status !== "paid" && (
                        <button className="rounded-2xl bg-blue-600 px-4 py-2 text-xs font-black text-white" disabled={working === payment.id} onClick={() => void generatePix(payment.id)}>
                          PIX
                        </button>
                      )}
                    </div>
                  </article>
                )) : <EmptyAppCard text="Nenhuma fatura encontrada." />}
              </section>
            )}

            {activeTab === "settings" && (
              <section className="grid gap-3">
                <SectionTitle title="Configuracoes" subtitle="Dados da conta e documentos." />
                <article className="rounded-[24px] bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Aluno</span>
                  <strong className="mt-2 block text-lg text-slate-950">{data?.student.full_name}</strong>
                  <p className="mt-1 text-sm text-slate-500">{data?.student.email || user.email}</p>
                </article>
                <article className="rounded-[24px] bg-white p-5 shadow-sm">
                  <span className="text-xs font-bold uppercase tracking-[.14em] text-slate-400">Contratos</span>
                  <div className="mt-3 grid gap-2">
                    {data?.contracts.map((contract) => (
                      <div key={contract.id} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
                        <span className="text-sm font-bold text-slate-700">{contract.plan?.name || "Contrato"}</span>
                        <StatusBadge tone={contract.status === "signed" ? "green" : "yellow"}>{contract.status === "signed" ? "Assinado" : "Pendente"}</StatusBadge>
                      </div>
                    ))}
                  </div>
                </article>
                <button className="min-h-12 rounded-2xl bg-slate-900 px-5 font-black text-white" onClick={() => void logout()}>Sair da conta</button>
              </section>
            )}
          </div>
        )}
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      <Modal open={Boolean(pix)} onClose={() => setPix(null)} title={pix?.status === "paid" ? "PIX aprovado" : "PIX pronto para pagamento"} description={pix ? `Valor: ${formatCurrency(Number(pix.total_amount))}` : ""} size="sm">
        {pix && <div className="grid gap-4 text-center">
          {pix.status === "paid" ? <div className="rounded-2xl bg-green-50 p-6 text-green-700"><CheckCircle2 className="mx-auto h-12 w-12" /><strong className="mt-3 block text-lg">Pagamento confirmado automaticamente</strong></div> : <>
            {pix.pix_qr_base64 && <Image unoptimized width={256} height={256} className="mx-auto rounded-2xl border border-[#e3e8f0] p-2" alt="QR Code PIX" src={`data:image/png;base64,${pix.pix_qr_base64}`} />}
            <p className="text-xs leading-5 text-[#657085]">Acesse o aplicativo do seu banco para ler o QR Code ou copie a chave abaixo.</p>
            <button className="btn btn-secondary" disabled={!pix.pix_code} onClick={() => void copyPix()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Codigo copiado" : "Copiar PIX copia e cola"}</button>
          </>}
        </div>}
      </Modal>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-xl font-black text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div>;
}

function EmptyAppCard({ text }: { text: string }) {
  return <div className="rounded-[24px] bg-white p-6 text-center text-sm font-semibold text-slate-500 shadow-sm">{text}</div>;
}

function ClassCard({ attendance, loadingAction, onAnswer, featured = false }: {
  attendance: ClassAttendance;
  loadingAction: string | null;
  onAnswer: (attendance: ClassAttendance, status: "confirmed" | "cancelled") => void;
  featured?: boolean;
}) {
  const confirmed = attendance.status === "confirmed" || attendance.status === "attended";
  return (
    <article className={`rounded-[24px] bg-white p-4 shadow-sm ${featured ? "border border-blue-100" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <strong className="text-base text-slate-950">{attendance.class_schedule?.class_type?.name || "Aula"}</strong>
          <p className="mt-1 text-sm font-semibold text-slate-500">Hoje as {attendance.class_schedule?.time || "--:--"}</p>
          <p className="mt-1 text-xs text-blue-600">{attendance.class_schedule?.instructor?.full_name || "Professor a definir"}</p>
        </div>
        <StatusBadge tone={statusTone(attendance.status) as any}>{attendance.status === "pending" ? "Pendente" : confirmed ? "Confirmado" : "Cancelado"}</StatusBadge>
      </div>
      {attendance.status === "pending" && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={() => onAnswer(attendance, "cancelled")} disabled={loadingAction === attendance.id} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-red-50 text-xs font-black text-red-600">
            <XCircle className="h-4 w-4" /> Nao irei
          </button>
          <button onClick={() => onAnswer(attendance, "confirmed")} disabled={loadingAction === attendance.id} className="flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-green-600 text-xs font-black text-white">
            <CheckCircle2 className="h-4 w-4" /> Confirmar
          </button>
        </div>
      )}
    </article>
  );
}

function BottomNav({ activeTab, onChange }: { activeTab: PortalTab; onChange: (tab: PortalTab) => void }) {
  const itemClass = (tab: PortalTab) => `flex flex-col items-center gap-1 text-[10px] font-black ${activeTab === tab ? "text-blue-600" : "text-slate-400"}`;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-4 pb-[max(14px,env(safe-area-inset-bottom))]">
      <div className="relative grid grid-cols-5 items-end rounded-[28px] border border-slate-200 bg-white/95 px-3 py-3 shadow-[0_18px_60px_rgba(15,23,42,.18)] backdrop-blur">
        <button className={itemClass("home")} onClick={() => onChange("home")}><Home className="h-5 w-5" /> Inicio</button>
        <button className={itemClass("payments")} onClick={() => onChange("payments")}><CreditCard className="h-5 w-5" /> Faturas</button>
        <button className="relative -mt-8 flex flex-col items-center gap-1 text-[10px] font-black text-blue-600" onClick={() => onChange("qr")}>
          <span className="grid h-16 w-16 place-items-center rounded-full border-4 border-white bg-blue-600 text-white shadow-xl shadow-blue-600/30"><QrCode className="h-8 w-8" /></span>
          QR Code
        </button>
        <button className={itemClass("classes")} onClick={() => onChange("classes")}><CalendarDays className="h-5 w-5" /> Aulas</button>
        <button className={itemClass("settings")} onClick={() => onChange("settings")}><Settings className="h-5 w-5" /> Ajustes</button>
      </div>
    </nav>
  );
}
