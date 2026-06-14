"use client";

import { Activity, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, Copy, CreditCard, FileCheck2, FileSignature, Flame, Home, LogOut, QrCode, Timer, UserRound, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { StudentQrCard } from "@/components/student-qr-card";
import { ErrorBanner, LoadingState, Modal } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { createPixPayment, updateAttendanceStatus } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { ClassAttendance, Student } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY";

type PortalTab = "home" | "payments" | "qr" | "classes" | "settings";
type StudentClassLink = {
  id: string;
  class_schedule_id: string;
  class_schedule?: {
    id: string;
    time: string;
    day_of_week: number;
    active?: boolean;
    class_type?: { id?: string; name?: string; color?: string; duration_minutes?: number | null } | null;
    instructor?: { id?: string; full_name?: string | null } | null;
  } | null;
};

type PortalData = {
  student: Student;
  attendances: ClassAttendance[];
  weeklyClasses: StudentClassLink[];
  payments: Array<{ id: string; reference: string; total_amount: number; status: string; due_date: string; pix_code?: string; pix_qr_base64?: string }>;
  contracts: Array<{ id: string; status: string; signed_at?: string | null; created_at: string; plan?: { name: string } }>;
  requiredContract?: { id: string; created_at: string; signingUrl: string; plan?: { name: string } | null } | null;
};

const weekLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const orderedWeek = [1, 2, 3, 4, 5, 6, 0];

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function classMet(name?: string | null) {
  const text = (name || "").toLowerCase();
  if (text.includes("jump")) return 7.5;
  if (text.includes("fit") || text.includes("dance") || text.includes("danca")) return 6.5;
  if (text.includes("funcional") || text.includes("cross")) return 6.2;
  if (text.includes("muscul")) return 5;
  if (text.includes("pilates") || text.includes("yoga")) return 3.2;
  return 5.5;
}

function estimateCalories(weightKg: number, minutes: number, className?: string | null) {
  return Math.round((classMet(className) * 3.5 * weightKg * minutes) / 200);
}

function initials(name?: string | null) {
  return (name || "Aluno").split(" ").slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

export default function StudentPortalPage() {
  const { user, isLoading, logout } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [activeTab, setActiveTab] = useState<PortalTab>("home");
  const [error, setError] = useState<string | null>(null);
  const [pix, setPix] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushChecking, setPushChecking] = useState(true);

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
    if (tab === "qr" || tab === "payments" || tab === "classes" || tab === "settings" || tab === "home") setActiveTab(tab);
    reloadData().catch((reason: Error) => setError(reason.message));

    if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
      setPushSupported(true);
      navigator.serviceWorker.register("/sw.js").then((reg) => {
        reg.pushManager.getSubscription().then((sub) => {
          setPushEnabled(Boolean(sub && Notification.permission === "granted"));
          setPushChecking(false);
        });
      }).catch(() => {
        setPushEnabled(false);
        setPushChecking(false);
      });
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
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
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
      alert("Erro ao ativar notificacoes. Reinstale/abra o app e tente novamente.");
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

  const stats = useMemo(() => {
    const weight = Number(data?.student.weight || 70);
    const weekly = data?.weeklyClasses ?? [];
    const totalMinutes = weekly.reduce((sum, item) => sum + Number(item.class_schedule?.class_type?.duration_minutes || 60), 0);
    const kcal = weekly.reduce((sum, item) => {
      const minutes = Number(item.class_schedule?.class_type?.duration_minutes || 60);
      return sum + estimateCalories(weight, minutes, item.class_schedule?.class_type?.name);
    }, 0);
    return { workouts: weekly.length, totalMinutes, kcal };
  }, [data]);

  const classDays = useMemo(() => new Set((data?.weeklyClasses ?? []).map((item) => item.class_schedule?.day_of_week)), [data]);
  const nextClass = data?.attendances.find((item) => item.status === "pending") ?? data?.attendances[0] ?? null;
  const pendingPayments = (data?.payments ?? []).filter((payment) => payment.status === "pending" || payment.status === "expired");

  if (isLoading) return <LoadingState label="Abrindo portal do aluno..." />;
  if (!user) return <main className="grid min-h-screen place-items-center bg-black p-5 text-white"><section className="max-w-sm rounded-[32px] border border-white/10 bg-white/10 p-7 text-center"><QrCode className="mx-auto h-10 w-10 text-blue-300" /><h1 className="mt-4 text-xl font-black">Portal do aluno</h1><p className="mt-2 text-sm text-white/60">Use o link enviado ao seu e-mail ou entre com sua conta.</p><Link className="mt-5 inline-flex rounded-full bg-white px-5 py-3 text-sm font-black text-black" href="/">Entrar</Link></section></main>;
  if (user.app_role !== "student") return <main className="grid min-h-screen place-items-center bg-black p-5"><Link className="rounded-full bg-white px-5 py-3 text-sm font-black text-black" href="/dashboard">Voltar ao painel</Link></main>;
  if (!data && !error) return <LoadingState label="Carregando seus dados..." />;

  if (data?.requiredContract) {
    return (
      <main className="min-h-screen bg-black p-5 text-white">
        <section className="mx-auto max-w-md overflow-hidden rounded-[34px] border border-white/10 bg-[linear-gradient(160deg,#1b1f2a,#050505)] p-7 shadow-2xl">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-black"><FileSignature className="h-7 w-7" /></div>
          <p className="mt-7 text-xs font-black uppercase tracking-[.18em] text-blue-300">Primeiro acesso</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em]">Assine seu contrato para liberar o app</h1>
          <p className="mt-3 text-sm leading-6 text-white/60">QR Code, aulas e financeiro ficam bloqueados ate a assinatura digital.</p>
          <div className="mt-5 rounded-3xl border border-white/10 bg-white/10 p-4">
            <span className="text-xs font-bold text-white/50">Plano</span>
            <strong className="mt-1 block text-sm">{data.requiredContract.plan?.name || "Plano contratado"}</strong>
          </div>
          <Link className="mt-5 flex min-h-14 items-center justify-center gap-2 rounded-full bg-white font-black text-black" href={data.requiredContract.signingUrl}>
            <FileCheck2 className="h-4 w-4" /> Revisar e assinar agora
          </Link>
          <button className="mt-3 min-h-12 w-full rounded-full border border-white/15 font-bold text-white/80" onClick={() => void reloadData()}>Ja assinei, atualizar</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,.26),transparent_34%),radial-gradient(circle_at_top_left,rgba(255,255,255,.10),transparent_28%)]" />
      <div className="relative mx-auto min-h-screen max-w-md px-5 pb-32 pt-4">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-white/10 text-sm font-black backdrop-blur-xl">{initials(data?.student.full_name)}</div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[.16em] text-white/40">Corpo & Evolucao</p>
              <h1 className="max-w-[245px] truncate text-xl font-black tracking-[-.03em]">{data?.student.full_name || user.full_name}</h1>
            </div>
          </div>
          <button className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/10 backdrop-blur-xl" onClick={() => void logout()} aria-label="Sair">
            <LogOut className="h-5 w-5" />
          </button>
        </header>

        <ErrorBanner message={error} />

        {pushChecking ? (
          <GlassCard className="mt-5 text-center"><div className="mx-auto h-9 w-9 animate-spin rounded-full border-b-2 border-white" /><p className="mt-3 text-sm text-white/60">Verificando notificacoes...</p></GlassCard>
        ) : pushSupported && !pushEnabled ? (
          <GlassCard className="mt-5">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/20 text-blue-200"><Bell className="h-6 w-6" /></div>
              <div className="flex-1">
                <h2 className="font-black">Ative alertas push</h2>
                <p className="mt-1 text-xs leading-5 text-white/50">Receba aviso de aula como notificacao de banco e confirme com um toque.</p>
              </div>
            </div>
            <button onClick={subscribePush} className="mt-5 min-h-12 w-full rounded-full bg-white font-black text-black">Permitir notificacoes</button>
          </GlassCard>
        ) : null}

        {activeTab === "home" && (
          <div className="mt-6 grid gap-5">
            <section className="rounded-[38px] border border-white/10 bg-[linear-gradient(155deg,rgba(255,255,255,.13),rgba(255,255,255,.04))] p-5 shadow-2xl backdrop-blur-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-white/50">Report</p>
                  <h2 className="mt-1 text-3xl font-black tracking-[-.05em]">Sua semana</h2>
                </div>
                <div className="rounded-full border border-white/10 bg-white px-4 py-2 text-xs font-black text-black">Hoje</div>
              </div>

              <div className="mt-6 grid grid-cols-7 gap-2">
                {orderedWeek.map((day) => {
                  const active = classDays.has(day);
                  const today = new Date().getDay() === day;
                  return (
                    <div key={day} className="text-center">
                      <span className="text-[11px] font-bold text-white/50">{weekLabels[day]}</span>
                      <div className={`mt-2 grid h-11 place-items-center rounded-full text-sm font-black ${today ? "bg-white text-black" : active ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-white/8 text-white/45"}`}>
                        {active ? "A" : "-"}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 grid grid-cols-3 gap-3">
                <MetricCard icon={Activity} label="Workout" value={String(stats.workouts)} />
                <MetricCard icon={Flame} label="Kcal" value={String(stats.kcal)} highlight />
                <MetricCard icon={Timer} label="Time" value={`${Math.floor(stats.totalMinutes / 60)}:${String(stats.totalMinutes % 60).padStart(2, "0")}`} />
              </div>
            </section>

            {nextClass ? <ClassCard attendance={nextClass} loadingAction={loadingAction} onAnswer={answerAttendance} featured /> : <EmptyDark text="Nenhuma aula pendente para hoje." />}

            <button onClick={() => setActiveTab("qr")} className="flex items-center justify-between rounded-[30px] border border-white/10 bg-white p-5 text-left text-black shadow-2xl">
              <div>
                <p className="text-xs font-black uppercase tracking-[.16em] text-black/40">Acesso rapido</p>
                <strong className="mt-1 block text-2xl tracking-[-.04em]">Abrir QR Code</strong>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-full bg-black text-white"><QrCode className="h-6 w-6" /></div>
            </button>
          </div>
        )}

        {activeTab === "classes" && (
          <SectionShell title="Aulas" subtitle="Confirme sua presenca nas aulas de hoje.">
            {data?.attendances.length ? data.attendances.map((attendance) => (
              <ClassCard key={attendance.id} attendance={attendance} loadingAction={loadingAction} onAnswer={answerAttendance} />
            )) : <EmptyDark text="Voce ainda nao possui aulas agendadas para hoje." />}
            <WeeklyList classes={data?.weeklyClasses ?? []} />
          </SectionShell>
        )}

        {activeTab === "qr" && data && (
          <SectionShell title="QR Code" subtitle="Use para liberar sua entrada na catraca.">
            <div className="rounded-[34px] bg-white p-4 text-black shadow-2xl">
              <StudentQrCard code={data.student.qr_code} name={data.student.full_name} />
            </div>
          </SectionShell>
        )}

        {activeTab === "payments" && (
          <SectionShell title="Faturas" subtitle="Somente cobrancas pendentes aparecem aqui.">
            {pendingPayments.length ? pendingPayments.map((payment) => (
              <article key={payment.id} className="rounded-[28px] border border-white/10 bg-white/10 p-4 backdrop-blur-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-white/45">{payment.reference}</p>
                    <strong className="mt-1 block text-xl">{formatCurrency(Number(payment.total_amount))}</strong>
                    <p className="mt-1 text-xs text-white/50">Vence em {formatDate(payment.due_date)}</p>
                  </div>
                  <span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-black text-blue-100">{payment.status === "expired" ? "Vencida" : "Pendente"}</span>
                </div>
                <button className="mt-4 min-h-12 w-full rounded-full bg-white font-black text-black" disabled={working === payment.id} onClick={() => void generatePix(payment.id)}>Pagar com PIX</button>
              </article>
            )) : <EmptyDark text="Nenhuma fatura pendente." />}
          </SectionShell>
        )}

        {activeTab === "settings" && (
          <SectionShell title="Configuracoes" subtitle="Conta, notificacoes e documentos.">
            <GlassCard>
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-black font-black">{initials(data?.student.full_name)}</div>
                <div>
                  <strong className="block">{data?.student.full_name}</strong>
                  <p className="text-sm text-white/50">{data?.student.email || user.email}</p>
                </div>
              </div>
            </GlassCard>
            <GlassCard>
              <div className="flex items-center justify-between">
                <div><strong>Notificacoes push</strong><p className="mt-1 text-xs text-white/50">{pushEnabled ? "Ativas neste dispositivo" : "Nao ativadas"}</p></div>
                {!pushEnabled && <button onClick={subscribePush} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">Ativar</button>}
              </div>
            </GlassCard>
            <GlassCard>
              <strong>Contratos</strong>
              <div className="mt-3 grid gap-2">
                {data?.contracts.map((contract) => (
                  <div key={contract.id} className="flex items-center justify-between rounded-2xl bg-white/8 p-3">
                    <span className="text-sm font-bold text-white/80">{contract.plan?.name || "Contrato"}</span>
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-black text-white/70">{contract.status === "signed" ? "Assinado" : "Pendente"}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </SectionShell>
        )}
      </div>

      <BottomNav activeTab={activeTab} onChange={setActiveTab} />

      <Modal open={Boolean(pix)} onClose={() => setPix(null)} title={pix?.status === "paid" ? "PIX aprovado" : "PIX pronto para pagamento"} description={pix ? `Valor: ${formatCurrency(Number(pix.total_amount))}` : ""} size="sm">
        {pix && <div className="grid gap-4 text-center">
          {pix.status === "paid" ? <div className="rounded-2xl bg-green-50 p-6 text-green-700"><CheckCircle2 className="mx-auto h-12 w-12" /><strong className="mt-3 block text-lg">Pagamento confirmado automaticamente</strong></div> : <>
            {pix.pix_qr_base64 && <Image unoptimized width={256} height={256} className="mx-auto rounded-2xl border border-[#e3e8f0] p-2" alt="QR Code PIX" src={`data:image/png;base64,${pix.pix_qr_base64}`} />}
            <p className="text-xs leading-5 text-[#657085]">Leia o QR Code no app do banco ou copie o codigo.</p>
            <button className="btn btn-secondary" disabled={!pix.pix_code} onClick={() => void copyPix()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Codigo copiado" : "Copiar PIX"}</button>
          </>}
        </div>}
      </Modal>
    </main>
  );
}

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-[28px] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur-xl ${className}`}>{children}</section>;
}

function MetricCard({ icon: Icon, label, value, highlight = false }: { icon: any; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-[22px] p-4 ${highlight ? "bg-blue-500 text-white" : "border border-white/10 bg-black/35 text-white"}`}>
      <Icon className="h-5 w-5" />
      <p className={`mt-5 text-xs font-medium ${highlight ? "text-white/80" : "text-white/55"}`}>{label}</p>
      <strong className="mt-1 block text-2xl tracking-[-.04em]">{value}</strong>
    </div>
  );
}

function SectionShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="mt-7 grid gap-4"><div><h2 className="text-3xl font-black tracking-[-.05em]">{title}</h2><p className="mt-1 text-sm text-white/45">{subtitle}</p></div>{children}</section>;
}

function EmptyDark({ text }: { text: string }) {
  return <div className="rounded-[28px] border border-white/10 bg-white/8 p-6 text-center text-sm font-bold text-white/45">{text}</div>;
}

function ClassCard({ attendance, loadingAction, onAnswer, featured = false }: {
  attendance: ClassAttendance;
  loadingAction: string | null;
  onAnswer: (attendance: ClassAttendance, status: "confirmed" | "cancelled") => void;
  featured?: boolean;
}) {
  const confirmed = attendance.status === "confirmed" || attendance.status === "attended";
  const duration = attendance.class_schedule?.class_type?.duration_minutes || 60;
  return (
    <article className={`rounded-[30px] border p-5 backdrop-blur-xl ${featured ? "border-blue-400/30 bg-blue-500/15" : "border-white/10 bg-white/10"}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[.14em] text-blue-200">{attendance.class_schedule?.time || "--:--"} · {duration} min</p>
          <strong className="mt-2 block text-2xl tracking-[-.04em]">{attendance.class_schedule?.class_type?.name || "Aula"}</strong>
          <p className="mt-1 text-sm text-white/50">{attendance.class_schedule?.instructor?.full_name || "Professor a definir"}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${confirmed ? "bg-white text-black" : attendance.status === "pending" ? "bg-blue-500/25 text-blue-100" : "bg-red-500/20 text-red-100"}`}>
          {attendance.status === "pending" ? "Pendente" : confirmed ? "Confirmado" : "Cancelado"}
        </span>
      </div>
      {attendance.status === "pending" && (
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button onClick={() => onAnswer(attendance, "cancelled")} disabled={loadingAction === attendance.id} className="flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/10 bg-white/8 text-xs font-black text-white/70"><XCircle className="h-4 w-4" /> Nao irei</button>
          <button onClick={() => onAnswer(attendance, "confirmed")} disabled={loadingAction === attendance.id} className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-white text-xs font-black text-black"><CheckCircle2 className="h-4 w-4" /> Confirmar</button>
        </div>
      )}
    </article>
  );
}

function WeeklyList({ classes }: { classes: StudentClassLink[] }) {
  if (!classes.length) return null;
  const sorted = [...classes].sort((a, b) => {
    const dayA = a.class_schedule?.day_of_week ?? 9;
    const dayB = b.class_schedule?.day_of_week ?? 9;
    return dayA === dayB ? String(a.class_schedule?.time || "").localeCompare(String(b.class_schedule?.time || "")) : dayA - dayB;
  });
  return (
    <GlassCard>
      <div className="flex items-center justify-between">
        <strong>Grade semanal</strong>
        <CalendarDays className="h-5 w-5 text-white/45" />
      </div>
      <div className="mt-4 grid gap-2">
        {sorted.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-2xl bg-white/8 p-3">
            <div>
              <p className="text-sm font-black">{item.class_schedule?.class_type?.name || "Aula"}</p>
              <p className="text-xs text-white/45">{weekLabels[item.class_schedule?.day_of_week ?? 0]} as {item.class_schedule?.time || "--:--"}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-white/35" />
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function BottomNav({ activeTab, onChange }: { activeTab: PortalTab; onChange: (tab: PortalTab) => void }) {
  const itemClass = (tab: PortalTab) => `flex flex-col items-center gap-1 text-[10px] font-black ${activeTab === tab ? "text-white" : "text-white/35"}`;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 mx-auto max-w-md px-5 pb-[max(14px,env(safe-area-inset-bottom))]">
      <div className="relative grid grid-cols-5 items-end rounded-[32px] border border-white/12 bg-black/72 px-4 py-3 shadow-[0_18px_70px_rgba(0,0,0,.7)] backdrop-blur-2xl">
        <button className={itemClass("home")} onClick={() => onChange("home")}><Home className="h-5 w-5" /> Inicio</button>
        <button className={itemClass("payments")} onClick={() => onChange("payments")}><CreditCard className="h-5 w-5" /> Faturas</button>
        <button className="relative -mt-9 flex flex-col items-center gap-1 text-[10px] font-black text-white" onClick={() => onChange("qr")}>
          <span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[6px] border-black bg-white text-black shadow-2xl"><QrCode className="h-8 w-8" /></span>
          QR Code
        </button>
        <button className={itemClass("classes")} onClick={() => onChange("classes")}><Activity className="h-5 w-5" /> Aulas</button>
        <button className={itemClass("settings")} onClick={() => onChange("settings")}><UserRound className="h-5 w-5" /> Perfil</button>
      </div>
    </nav>
  );
}
