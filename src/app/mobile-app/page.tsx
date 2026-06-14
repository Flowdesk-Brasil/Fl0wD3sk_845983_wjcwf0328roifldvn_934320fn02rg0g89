"use client";

import { Download, Share2, Copy, Check, Bell, CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { getTodayAttendances, updateAttendanceStatus } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { ClassAttendance } from "@/lib/types";

const publicVapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY";

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function MobileAppPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported, setPushSupported] = useState(true);
  const [pushChecking, setPushChecking] = useState(true);
  const [attendances, setAttendances] = useState<ClassAttendance[]>([]);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  async function savePushSubscription(subscription: PushSubscription) {
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({
        subscription,
        permission: typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
        profile_id: user?.id,
        student_id: user?.id,
      }),
    });
    if (!response.ok) throw new Error('Nao foi possivel registrar este dispositivo.');
  }

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }

    // Load today's attendances
    const dateStr = new Date().toISOString().split('T')[0];
    getTodayAttendances(user.id, dateStr).then(setAttendances);

    // Check Push status
    if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
      setPushSupported(true);
      if (Notification.permission === 'granted') {
        navigator.serviceWorker.register('/sw.js').then(reg => {
          reg.update().catch(() => {});
          reg.pushManager.getSubscription().then(async sub => {
            if (sub) {
              try {
                await savePushSubscription(sub);
                setPushEnabled(true);
              } catch {
                setPushEnabled(false);
              }
            } else {
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
      setPushEnabled(true); // Bypass se não suportar nativamente (ex: iOS antigo)
      setPushChecking(false);
    }

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, [user, router]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  };

  const handleCopyQRCode = () => {
    const qrCodeUrl = `${window.location.origin}/api/student/qrcode/${user?.id}`;
    navigator.clipboard.writeText(qrCodeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
      await registration.update().catch(() => {});
      const existing = await registration.pushManager.getSubscription();
      if (existing) await existing.unsubscribe();
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
      });

      await savePushSubscription(subscription);

      setPushEnabled(true);
      alert('Notificações ativadas com sucesso!');
    } catch (err) {
      console.error('Erro ao assinar push:', err);
      alert('Erro ao ativar notificações. Tente adicionar o site à tela de início primeiro.');
    }
  };

  const answerAttendance = async (attendanceId: string, status: "confirmed" | "cancelled") => {
    setLoadingAction(attendanceId);
    try {
      const attendance = attendances.find((item) => item.id === attendanceId);
      await updateAttendanceStatus(attendance ?? attendanceId, status);
      setAttendances(current => current.map(a => a.id === attendanceId ? { ...a, status } : a));
    } catch (e: any) {
      alert(e.message || "Erro ao confirmar.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-600 to-blue-800 p-4">
      <div className="max-w-md mx-auto pb-10">
        {/* Header */}
        <div className="text-center mt-8 mb-8">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-3xl bg-white/20 backdrop-blur mb-4">
            <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Corpo & Evolução</h1>
          <p className="text-blue-100">Portal do Aluno</p>
        </div>

        {/* Notifications & Action Items */}
        {pushChecking ? (
          <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6 flex flex-col items-center text-center mt-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-slate-600 font-semibold">Verificando segurança...</p>
          </div>
        ) : pushSupported && !pushEnabled ? (
          <div className="bg-white rounded-3xl shadow-2xl p-8 mb-6 flex flex-col items-center text-center mt-10">
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
            {attendances.length > 0 && (
              <div className="mb-6 space-y-4">
            <h2 className="text-white font-bold text-lg flex items-center gap-2"><CalendarClock className="h-5 w-5" /> Suas aulas de hoje</h2>
            {attendances.map(att => (
              <div key={att.id} className="bg-white rounded-2xl p-5 shadow-lg">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900 text-lg">{att.class_schedule?.class_type?.name || "Aula"}</h3>
                    <p className="text-slate-500 font-medium">Hoje às {att.class_schedule?.time}</p>
                  </div>
                  <div className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-sm font-bold border border-blue-100">
                    {att.status === 'pending' ? 'Aguardando' : att.status === 'confirmed' ? 'Confirmado' : att.status === 'cancelled' ? 'Cancelado' : 'Registrado'}
                  </div>
                </div>

                {att.status === 'pending' && (
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <button 
                      onClick={() => answerAttendance(att.id, 'cancelled')} 
                      disabled={loadingAction === att.id}
                      className="flex flex-col items-center justify-center gap-1 bg-red-50 hover:bg-red-100 text-red-600 font-semibold p-3 rounded-xl border border-red-200 transition"
                    >
                      <XCircle className="h-6 w-6" />
                      Não irei
                    </button>
                    <button 
                      onClick={() => answerAttendance(att.id, 'confirmed')} 
                      disabled={loadingAction === att.id}
                      className="flex flex-col items-center justify-center gap-1 bg-green-500 hover:bg-green-600 text-white font-semibold p-3 rounded-xl shadow-md transition"
                    >
                      <CheckCircle2 className="h-6 w-6" />
                      Confirmar
                    </button>
                  </div>
                )}
                
                {att.status === 'confirmed' && <p className="text-sm text-green-600 font-medium mt-2 text-center bg-green-50 p-2 rounded-lg">Sua presença está confirmada!</p>}
                {att.status === 'cancelled' && <p className="text-sm text-red-600 font-medium mt-2 text-center bg-red-50 p-2 rounded-lg">Você avisou que não irá.</p>}
              </div>
            ))}
          </div>
        )}

        {/* QR Code Display */}
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-3xl p-6 mb-6">
          <p className="text-center text-sm font-semibold text-blue-100 mb-4">Seu QR Code de Acesso</p>
          <div className="aspect-square bg-white rounded-2xl flex items-center justify-center mb-4 p-4 shadow-inner">
            <img
              src={`/api/student/qrcode/${user?.id}`}
              alt="QR Code"
              className="h-full w-full object-contain"
            />
          </div>
          <button
            onClick={handleCopyQRCode}
            className="w-full flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 text-white font-semibold py-3 rounded-xl transition"
          >
            {copied ? <><Check className="h-5 w-5" /> Copiado!</> : <><Copy className="h-5 w-5" /> Copiar link de acesso</>}
          </button>
        </div>

        {/* User Info */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-6 mb-6 text-white border border-white/10">
          <p className="text-sm text-blue-200 mb-1">Logado como</p>
          <p className="text-xl font-bold">{user?.full_name}</p>
        </div>

        {/* Installation */}
        {isInstallable && (
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 bg-white text-blue-600 font-bold py-4 rounded-2xl mb-4 hover:bg-blue-50 transition shadow-lg"
          >
            <Download className="h-5 w-5" />
            Instalar app no celular
          </button>
        )}
          </>
        )}
      </div>
    </div>
  );
}
