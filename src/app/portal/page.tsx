"use client";

import { Activity, Bell, CalendarDays, Check, CheckCircle2, ChevronRight, Copy, CreditCard, Expand, FileCheck2, FileSignature, Flame, Home, Loader2, LogOut, QrCode, Timer, UserRound, XCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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
  notifications?: Array<{ id: string; title: string; message: string; created_at: string }>;
  requiredContract?: { id: string; created_at: string; signingUrl: string; plan?: { name: string } | null } | null;
};

const weekLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const orderedWeek = [1, 2, 3, 4, 5, 6, 0];
const paymentIntentStorageKey = "corpoevolucao:portal-payment-intent";
const paidNoticeStorageKey = "corpoevolucao:portal-paid-notice";

type PaymentIntent = {
  studentId: string;
  paymentId: string;
  reference: string;
  totalAmount: number;
  expiresAt: number;
};
type PaidNotice = PaymentIntent;

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function bufferSourceToUint8Array(value?: BufferSource | null) {
  if (!value) return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

function samePushApplicationKey(subscription: PushSubscription) {
  const currentKey = bufferSourceToUint8Array(subscription.options.applicationServerKey);
  if (!currentKey) return true;
  const configuredKey = urlBase64ToUint8Array(publicVapidKey);
  if (currentKey.length !== configuredKey.length) return false;
  return currentKey.every((value, index) => value === configuredKey[index]);
}

function pushErrorMessage(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason || "");
  const normalized = message.toLowerCase();
  if (normalized.includes("permission") || normalized.includes("notallowed") || normalized.includes("denied")) {
    return "As notificacoes estao bloqueadas para este app. Libere nas configuracoes do navegador/celular e toque em Ativar novamente.";
  }
  if (normalized.includes("invalidaccess") || normalized.includes("applicationserverkey") || normalized.includes("vapid")) {
    return "A chave de notificacao do app mudou. Atualize o app, abra novamente e toque em Ativar para recriar o dispositivo.";
  }
  if (normalized.includes("service worker") || normalized.includes("registration") || normalized.includes("abort")) {
    return "O app atualizou o servico de notificacoes. Feche e abra o app uma vez; se continuar, toque em Ativar novamente.";
  }
  if (normalized.includes("banco") || normalized.includes("database") || normalized.includes("relation") || normalized.includes("constraint")) {
    return `${message} A migration de push precisa estar aplicada no Supabase.`;
  }
  return message || "Nao foi possivel ativar notificacoes agora. Abra o portal instalado, confira a internet e toque em Ativar novamente.";
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

function readPortalStorage<T>(key: string) {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) as T : null;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function writePortalStorage(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
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
  const [pushSuccess, setPushSuccess] = useState(false);
  const [pushIssue, setPushIssue] = useState<string | null>(null);
  const [paidNotice, setPaidNotice] = useState<PaidNotice | null>(null);
  const [appAlert, setAppAlert] = useState<{ title: string; message: string } | null>(null);
  const appAlertTimeoutRef = useRef<number | null>(null);
  const pushRequestRef = useRef(false);

  useEffect(() => () => {
    if (appAlertTimeoutRef.current) window.clearTimeout(appAlertTimeoutRef.current);
  }, []);

  useEffect(() => {
    if (!paidNotice) return;
    const remaining = Math.max(0, paidNotice.expiresAt - Date.now());
    const timeout = window.setTimeout(() => {
      window.localStorage.removeItem(paidNoticeStorageKey);
      setPaidNotice(null);
    }, remaining);
    return () => window.clearTimeout(timeout);
  }, [paidNotice]);

  async function reloadData(token?: string) {
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch("/api/student/portal", {
      headers: { Authorization: `Bearer ${token ?? session.session?.access_token ?? ""}` },
      cache: "no-store",
    });
    const payload = await response.json() as PortalData & { error?: string };
    if (!response.ok) throw new Error(payload.error || "Nao foi possivel carregar seu portal.");
    syncPaidNotice(payload);
    setData(payload);
  }

  function syncPaidNotice(payload: PortalData) {
    const now = Date.now();
    const storedNotice = readPortalStorage<PaidNotice>(paidNoticeStorageKey);
    if (storedNotice?.expiresAt && storedNotice.expiresAt > now && storedNotice.studentId === payload.student.id) {
      setPaidNotice(storedNotice);
    } else if (storedNotice) {
      window.localStorage.removeItem(paidNoticeStorageKey);
      setPaidNotice(null);
    }

    const intent = readPortalStorage<PaymentIntent>(paymentIntentStorageKey);
    if (!intent || intent.studentId !== payload.student.id || intent.expiresAt <= now) {
      if (intent) window.localStorage.removeItem(paymentIntentStorageKey);
      return;
    }

    const stillPending = payload.payments.some((payment) =>
      payment.id === intent.paymentId && (payment.status === "pending" || payment.status === "expired")
    );
    if (stillPending) return;

    const notice = { ...intent, expiresAt: now + 60_000 };
    writePortalStorage(paidNoticeStorageKey, notice);
    window.localStorage.removeItem(paymentIntentStorageKey);
    setPaidNotice(notice);
  }

  useEffect(() => {
    if (!user || user.app_role !== "student") return;
    let notificationPermissionStatus: PermissionStatus | null = null;
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "qr" || tab === "payments" || tab === "classes" || tab === "settings" || tab === "home") setActiveTab(tab);
    reloadData().catch((reason: Error) => setError(reason.message));

    function requestPortalFullscreen() {
      const requestFullscreen = document.documentElement.requestFullscreen;
      if (!document.fullscreenElement && requestFullscreen) void requestFullscreen.call(document.documentElement).catch(() => {});
    }

    window.addEventListener("pointerdown", requestPortalFullscreen, { once: true });
    window.addEventListener("touchstart", requestPortalFullscreen, { once: true });

    if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
      setPushSupported(true);
      navigator.serviceWorker.register("/sw.js").then(async (reg) => {
        try {
          await reg.update().catch(() => {});
          const readyRegistration = await navigator.serviceWorker.ready;
          if (Notification.permission === "granted") {
            await ensurePushSubscription(readyRegistration);
            setPushEnabled(true);
            setPushSuccess(false);
            setPushIssue(null);
          } else {
            setPushEnabled(false);
            setPushSuccess(false);
          }
        } catch (reason) {
          setPushIssue(pushErrorMessage(reason));
          setPushEnabled(false);
        } finally {
          setPushChecking(false);
        }
      }).catch(() => {
        setPushEnabled(false);
        setPushChecking(false);
      });
    } else {
      setPushSupported(false);
      setPushEnabled(true);
      setPushChecking(false);
    }

    if ("permissions" in navigator && "Notification" in window) {
      navigator.permissions.query({ name: "notifications" as PermissionName }).then((status) => {
        notificationPermissionStatus = status;
        status.onchange = () => {
          setPushSuccess(false);
          if (Notification.permission !== "granted") {
            setPushEnabled(false);
            setPushChecking(false);
            setPushIssue(Notification.permission === "denied"
              ? "As notificacoes foram bloqueadas no aparelho. Libere nas configuracoes do navegador/celular para ativar de novo."
              : null);
          }
        };
      }).catch(() => {});
    }

    return () => {
      if (notificationPermissionStatus) notificationPermissionStatus.onchange = null;
      window.removeEventListener("pointerdown", requestPortalFullscreen);
      window.removeEventListener("touchstart", requestPortalFullscreen);
    };
  }, [user]);

  async function savePushSubscription(subscription: PushSubscription) {
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        subscription,
        permission: "Notification" in window ? Notification.permission : "unsupported",
        profile_id: user?.id,
        student_id: data?.student.id,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "Nao foi possivel registrar notificacoes.");
    }
  }

  async function ensurePushSubscription(registration: ServiceWorkerRegistration, forceRenew = false) {
    let subscription = await registration.pushManager.getSubscription();
    if (subscription && (forceRenew || !samePushApplicationKey(subscription))) {
      await subscription.unsubscribe().catch(() => {});
      subscription = null;
    }
    if (!subscription) {
      subscription = await createPushSubscription(registration, forceRenew);
    }
    await savePushSubscription(subscription);
    return subscription;
  }

  async function createPushSubscription(registration: ServiceWorkerRegistration, allowRecovery: boolean) {
    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });
    } catch (reason) {
      if (!allowRecovery) throw reason;

      const rootScope = `${window.location.origin}/`;
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations
        .filter((item) => item.scope === rootScope)
        .map((item) => item.unregister().catch(() => false)));

      const freshRegistration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await freshRegistration.update().catch(() => {});
      const readyRegistration = await navigator.serviceWorker.ready;
      return readyRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey),
      });
    }
  }

  async function showLocalNotification(title: string, message: string) {
    setAppAlert({ title, message });
    if (appAlertTimeoutRef.current) window.clearTimeout(appAlertTimeoutRef.current);
    appAlertTimeoutRef.current = window.setTimeout(() => setAppAlert(null), 6500);
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        body: message,
        icon: "/icon-192x192.png",
        badge: "/icon-192x192.png",
        tag: "class-attendance-today",
        data: { url: "/portal?tab=classes" },
      });
    } catch {
      new Notification(title, { body: message, icon: "/icon-192x192.png" });
    }
  }

  useEffect(() => {
    if (!data?.student.id) return;
    function handleNotification(payload: { new: Record<string, unknown> }) {
      const notification = payload.new as { id?: string; title?: string; message?: string; created_at?: string };
      setData((current) => current
        ? {
            ...current,
            notifications: [
              {
                id: notification.id || `local-${Date.now()}`,
                title: notification.title || "Corpo & Evolucao",
                message: notification.message || "Voce tem um novo aviso.",
                created_at: notification.created_at || new Date().toISOString(),
              },
              ...(current.notifications ?? []),
            ].slice(0, 8),
          }
        : current);
      void showLocalNotification(notification.title || "Corpo & Evolucao", notification.message || "Voce tem um novo aviso.");
    }

    const studentChannel = supabase.channel(`student-notifications-${data.student.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `target_id=eq.${data.student.id}` }, handleNotification)
      .subscribe();
    const globalChannel = supabase.channel(`student-global-notifications-${data.student.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "target_type=eq.all" }, handleNotification)
      .subscribe();

    return () => {
      supabase.removeChannel(studentChannel);
      supabase.removeChannel(globalChannel);
    };
  }, [data?.student.id]);

  async function subscribePush() {
    if (pushRequestRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setPushSupported(false);
      setPushIssue("Este navegador nao suporta push nativo. No iPhone, instale o portal na tela inicial e abra pelo icone do app.");
      return;
    }
    pushRequestRef.current = true;
    setPushIssue(null);
    setPushSuccess(false);
    setPushChecking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushIssue("Voce bloqueou as notificacoes. Libere nas configuracoes do navegador/celular e toque em Ativar novamente.");
        setPushEnabled(false);
        return;
      }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await registration.update().catch(() => {});
      const readyRegistration = await navigator.serviceWorker.ready;
      await ensurePushSubscription(readyRegistration, true);
      setPushIssue(null);
      setPushSuccess(true);
      await reloadData();
      window.setTimeout(() => {
        setPushEnabled(true);
        setPushSuccess(false);
      }, 850);
    } catch (reason) {
      setPushEnabled(false);
      setPushSuccess(false);
      setPushIssue(pushErrorMessage(reason));
    } finally {
      setPushChecking(false);
      pushRequestRef.current = false;
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
      const payment = data?.payments.find((item) => item.id === paymentId);
      if (data?.student.id && payment) {
        writePortalStorage(paymentIntentStorageKey, {
          studentId: data.student.id,
          paymentId,
          reference: payment.reference,
          totalAmount: Number(payment.total_amount),
          expiresAt: Date.now() + 20 * 60_000,
        } satisfies PaymentIntent);
      }
      const generated = await createPixPayment(paymentId);
      setPix(generated);
      if (data?.student.id && generated?.status === "paid") {
        const notice: PaidNotice = {
          studentId: data.student.id,
          paymentId,
          reference: payment?.reference || "Fatura",
          totalAmount: Number(payment?.total_amount || generated.total_amount || 0),
          expiresAt: Date.now() + 60_000,
        };
        writePortalStorage(paidNoticeStorageKey, notice);
        window.localStorage.removeItem(paymentIntentStorageKey);
        setPaidNotice(notice);
      }
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

        {appAlert && (
          <div className="mt-4 rounded-[24px] border border-blue-300/25 bg-blue-500/20 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white text-black"><Bell className="h-5 w-5" /></div>
              <div>
                <strong className="block text-sm">{appAlert.title}</strong>
                <p className="mt-1 text-xs leading-5 text-white/65">{appAlert.message}</p>
              </div>
            </div>
          </div>
        )}

        <ErrorBanner message={error} />

        {(pushChecking || pushSuccess) ? (
          <GlassCard className="mt-5 text-center">
            <div className={`mx-auto grid h-12 w-12 place-items-center rounded-full border transition-all duration-300 ${pushSuccess ? "border-emerald-300 bg-emerald-400 text-black" : "border-white/15 bg-white/8 text-white"}`}>
              {pushSuccess ? <Check className="h-6 w-6 animate-in zoom-in duration-300" /> : <Loader2 className="h-6 w-6 animate-spin" />}
            </div>
            <p className="mt-3 text-sm font-bold text-white/70">{pushSuccess ? "Notificacoes ativadas" : "Validando notificacoes..."}</p>
            <p className="mt-1 text-xs text-white/40">{pushSuccess ? "Dispositivo salvo com seguranca." : "Aguarde, estamos preparando este aparelho."}</p>
          </GlassCard>
        ) : pushSupported && !pushEnabled ? (
          <GlassCard className="mt-5">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-500/20 text-blue-200"><Bell className="h-6 w-6" /></div>
              <div className="flex-1">
                <h2 className="font-black">Ative alertas push</h2>
                <p className="mt-1 text-xs leading-5 text-white/50">Receba aviso de aula na tela do celular. Se o aparelho bloquear, o aviso ainda aparece dentro do app.</p>
              </div>
            </div>
            {pushIssue && (
              <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-xs font-bold leading-5 text-red-100">
                {pushIssue}
              </div>
            )}
            <button onClick={subscribePush} disabled={pushRequestRef.current} className="mt-5 min-h-12 w-full rounded-full bg-white font-black text-black disabled:opacity-60">Permitir notificacoes</button>
          </GlassCard>
        ) : !pushSupported ? (
          <GlassCard className="mt-5">
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white/10 text-white"><Bell className="h-6 w-6" /></div>
              <div className="flex-1">
                <h2 className="font-black">Avisos internos ativos</h2>
                <p className="mt-1 text-xs leading-5 text-white/50">Este navegador nao liberou push nativo, mas o portal mostra avisos em tempo real quando estiver aberto.</p>
              </div>
            </div>
            {pushIssue && <p className="mt-4 text-xs font-bold leading-5 text-white/60">{pushIssue}</p>}
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

            {data?.notifications?.[0] && (
              <GlassCard>
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-blue-500/25 text-blue-100"><Bell className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-[.14em] text-white/40">Ultimo aviso</p>
                    <strong className="mt-1 block text-sm">{data.notifications[0].title}</strong>
                    <p className="mt-1 text-xs leading-5 text-white/55">{data.notifications[0].message}</p>
                  </div>
                </div>
              </GlassCard>
            )}

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
            {paidNotice && <PaidNoticeCard notice={paidNotice} />}
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
            )) : paidNotice ? null : <EmptyDark text="Nenhuma fatura pendente." />}
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
                <div><strong>Notificacoes</strong><p className="mt-1 text-xs text-white/50">{pushEnabled ? "Push do aparelho e avisos internos ativos" : pushSupported ? "Avisos internos ativos. Falta liberar push do aparelho." : "Avisos internos ativos neste navegador."}</p></div>
                {!pushEnabled && pushSupported && <button onClick={subscribePush} className="rounded-full bg-white px-4 py-2 text-xs font-black text-black">Ativar</button>}
              </div>
            </GlassCard>
            <GlassCard>
              <div className="flex items-center justify-between">
                <div><strong>Tela cheia</strong><p className="mt-1 text-xs text-white/50">Oculta controles do navegador quando permitido.</p></div>
                <button onClick={() => {
                  const requestFullscreen = document.documentElement.requestFullscreen;
                  if (requestFullscreen) void requestFullscreen.call(document.documentElement).catch(() => {});
                }} className="grid h-11 w-11 place-items-center rounded-full bg-white text-black" aria-label="Ativar tela cheia">
                  <Expand className="h-5 w-5" />
                </button>
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

function PaidNoticeCard({ notice }: { notice: PaidNotice }) {
  return (
    <article className="rounded-[30px] border border-emerald-300/25 bg-emerald-400/12 p-5 text-center shadow-[0_22px_70px_rgba(16,185,129,.14)] backdrop-blur-xl">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-400 text-black shadow-[0_0_38px_rgba(52,211,153,.36)]">
        <CheckCircle2 className="h-9 w-9" />
      </div>
      <h3 className="mt-4 text-2xl font-black tracking-[-.04em]">Sua fatura foi paga</h3>
      <p className="mt-2 text-sm font-bold text-white/60">{notice.reference} - {formatCurrency(Number(notice.totalAmount))}</p>
      <p className="mt-3 text-xs leading-5 text-white/45">Confirmacao salva. Em instantes esta area volta para o resumo sem faturas pendentes.</p>
    </article>
  );
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
