"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getDeviceId } from "@/lib/device-id";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type StudentInfo = {
  id?: string;
  full_name?: string | null;
  photo_url?: string | null;
};

type CheckinEvent = {
  id: string;
  student_id?: string | null;
  enrollment_id?: string | null;
  status: "allowed" | "denied";
  reason?: string | null;
  unit?: string | null;
  checked_at: string;
  sourceDeviceId?: string | null;
  manual?: boolean;
  student?: StudentInfo | null;
  enrollment?: {
    id?: string;
    matricula_number?: string | null;
    status?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    plan?: { name?: string | null } | null;
  } | null;
  payment?: {
    id?: string;
    status?: string | null;
    due_date?: string | null;
    total_amount?: number | string | null;
  } | null;
  stats?: {
    todayCheckins?: number;
    confirmedClasses?: number;
  } | null;
};

type SidebarCheckin = CheckinEvent & {
  studentName: string;
  photoUrl?: string | null;
};

const AUTO_CLOSE_MS = 10000;

const paymentLabels: Record<string, string> = {
  paid: "Pagamento pago",
  pending: "Pagamento pendente",
  expired: "Pagamento expirado",
  cancelled: "Pagamento cancelado",
  refunded: "Pagamento estornado",
};

function paymentTone(status?: string | null) {
  if (status === "paid") return "border-green-200 bg-green-50 text-green-700";
  if (status === "pending") return "border-yellow-200 bg-yellow-50 text-yellow-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export function CheckinSidebar() {
  const [recentCheckin, setRecentCheckin] = useState<SidebarCheckin | null>(null);
  const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoClose = useCallback(() => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
  }, []);

  const scheduleAutoClose = useCallback(() => {
    clearAutoClose();
    autoCloseRef.current = setTimeout(() => setOpen(false), AUTO_CLOSE_MS);
  }, [clearAutoClose]);

  const normalizeCheckin = useCallback(async (checkin: CheckinEvent): Promise<SidebarCheckin> => {
    let student = checkin.student ?? null;
    let payment = checkin.payment ?? null;

    if (!student && checkin.student_id && checkin.student_id !== "manual") {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, photo_url")
        .eq("id", checkin.student_id)
        .maybeSingle();

      student = data as StudentInfo | null;
    }

    if (!payment && checkin.enrollment_id) {
      const { data } = await supabase
        .from("payments")
        .select("id, status, due_date, total_amount")
        .eq("enrollment_id", checkin.enrollment_id)
        .order("due_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      payment = data;
    }

    let stats = checkin.stats ?? null;
    if (!stats && checkin.student_id && checkin.student_id !== "manual") {
      const today = new Date().toISOString().slice(0, 10);
      const [{ count: todayCheckins }, { count: confirmedClasses }] = await Promise.all([
        supabase
          .from("checkins")
          .select("*", { count: "exact", head: true })
          .eq("student_id", checkin.student_id)
          .eq("status", "allowed")
          .gte("checked_at", `${today}T00:00:00.000Z`)
          .lte("checked_at", `${today}T23:59:59.999Z`),
        supabase
          .from("class_attendances")
          .select("*", { count: "exact", head: true })
          .eq("student_id", checkin.student_id)
          .eq("date", today)
          .in("status", ["confirmed", "attended"]),
      ]);
      stats = {
        todayCheckins: todayCheckins ?? 0,
        confirmedClasses: confirmedClasses ?? 0,
      };
    }

    if (!student && checkin.student?.full_name) {
      student = checkin.student;
    }
    if (!student && !checkin.student_id) {
      const manualName = checkin.reason?.match(/^Liberacao manual para (.+?) pela recepcao\./)?.[1];
      if (manualName) student = { id: "manual", full_name: manualName };
    }

    return {
      ...checkin,
      stats,
      payment,
      studentName: student?.full_name || "Aluno nao identificado",
      photoUrl: student?.photo_url ?? null,
    };
  }, []);

  const showCheckin = useCallback(async (checkin: CheckinEvent, shouldAutoClose = true) => {
    if (cameraOpen) return;
    const next = await normalizeCheckin(checkin);
    setRecentCheckin(next);
    setOpen(true);
    if (shouldAutoClose) scheduleAutoClose();
  }, [cameraOpen, normalizeCheckin, scheduleAutoClose]);

  const loadCheckinById = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("checkins")
      .select("*, student:students(id, full_name, photo_url), enrollment:enrollments(id, matricula_number, status, start_date, end_date, plan:plans(name))")
      .eq("id", id)
      .maybeSingle();

    if (data) void showCheckin(data as CheckinEvent);
  }, [showCheckin]);

  const loadLatest = useCallback(async () => {
    const { data } = await supabase
      .from("checkins")
      .select("*, student:students(id, full_name, photo_url), enrollment:enrollments(id, matricula_number, status, start_date, end_date, plan:plans(name))")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    setRecentCheckin(await normalizeCheckin(data as CheckinEvent));
  }, [normalizeCheckin]);

  useEffect(() => {
    void loadLatest();

    const checkinChannel = supabase.channel("checkins-panel-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins" }, (payload) => {
        const checkin = payload.new as CheckinEvent;
        if (checkin?.id) void loadCheckinById(checkin.id);
        else void showCheckin(checkin);
      })
      .on("broadcast", { event: "CHECKIN_CREATED" }, ({ payload }) => {
        if (payload?.sourceDeviceId === getDeviceId() && cameraOpen) return;
        void showCheckin(payload as CheckinEvent);
      })
      .subscribe();

    function handleLocalCheckin(event: Event) {
      const detail = (event as CustomEvent<CheckinEvent>).detail;
      if (detail?.id) void showCheckin(detail);
    }

    function handleCameraState(event: Event) {
      const detail = (event as CustomEvent<{ open?: boolean }>).detail;
      setCameraOpen(Boolean(detail?.open));
      if (detail?.open) setOpen(false);
    }

    window.addEventListener("checkin:created", handleLocalCheckin);
    window.addEventListener("checkin:camera-state", handleCameraState);

    return () => {
      clearAutoClose();
      window.removeEventListener("checkin:created", handleLocalCheckin);
      window.removeEventListener("checkin:camera-state", handleCameraState);
      supabase.removeChannel(checkinChannel);
    };
  }, [cameraOpen, clearAutoClose, loadCheckinById, loadLatest, showCheckin]);

  const allowed = recentCheckin?.status === "allowed";

  return (
    <>
      <aside className={`fixed inset-y-0 right-0 z-[70] flex w-[min(360px,calc(100vw-24px))] flex-col border-l border-[#e3e8f0] bg-white shadow-2xl transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <header className="flex items-center justify-between border-b border-[#e3e8f0] bg-slate-50 p-4">
          <h3 className="flex items-center gap-2 font-bold text-[#172033]">
            {allowed ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
            Check-in do aluno
          </h3>
          <button
            onClick={() => {
              clearAutoClose();
              setOpen(false);
            }}
            className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-200"
            aria-label="Fechar painel de check-in"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex flex-1 flex-col items-center p-6 text-center">
          {!recentCheckin ? (
            <div className="grid h-full place-items-center">
              <div>
                <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                  <Clock3 className="h-7 w-7" />
                </div>
                <h4 className="mt-4 text-base font-bold text-[#172033]">Aguardando check-in</h4>
                <p className="mt-2 text-sm leading-6 text-[#657085]">Quando um aluno validar o acesso, os dados aparecem aqui em tempo real.</p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative mb-2 h-24 w-24">
                <div className="absolute inset-0 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-slate-100 shadow-md">
                  <User className="h-10 w-10 text-slate-400" />
                </div>
                {recentCheckin.photoUrl && (
                  <img
                    src={recentCheckin.photoUrl}
                    alt={recentCheckin.studentName}
                    className="absolute inset-0 z-10 h-24 w-24 rounded-full border-4 border-slate-100 bg-slate-100 object-cover shadow-md"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
              </div>

              <h4 className="mt-4 text-lg font-bold text-[#172033]">{recentCheckin.studentName}</h4>

              <div className={`mt-2 rounded-full px-3 py-1 text-xs font-bold ${allowed ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                {allowed ? "ACESSO LIBERADO" : "ACESSO BLOQUEADO"}
              </div>

              {recentCheckin.reason && (
                <p className={`mt-3 w-full rounded-lg p-2 text-left text-sm ${allowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  {recentCheckin.reason}
                </p>
              )}

              <div className="mt-4 grid w-full gap-2 text-left">
                {!recentCheckin.enrollment && !recentCheckin.payment && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                    <strong className="block text-[11px] uppercase tracking-[.08em]">Liberacao manual</strong>
                    <span className="mt-1 block">Registro feito pela recepcao sem vinculo automatico com matricula.</span>
                  </div>
                )}

                {recentCheckin.enrollment && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <strong className="block text-[11px] uppercase tracking-[.08em] text-slate-700">Matricula</strong>
                    <div className="mt-2 grid gap-1">
                      {recentCheckin.enrollment.matricula_number && (
                        <span className="font-bold text-slate-800">{recentCheckin.enrollment.matricula_number}</span>
                      )}
                      <span>
                        Plano: <b>{recentCheckin.enrollment.plan?.name ?? "Nao informado"}</b>
                      </span>
                      <span>
                        Status: <b>{recentCheckin.enrollment.status ?? "sem status"}</b>
                      </span>
                      {recentCheckin.enrollment.end_date && (
                        <span>
                          Validade: <b>{formatDate(recentCheckin.enrollment.end_date)}</b>
                        </span>
                      )}
                    </div>
                  </div>
                )}

                {recentCheckin.stats && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                      <strong className="block text-[11px] uppercase tracking-[.08em]">Check-ins hoje</strong>
                      <span className="mt-1 block text-xl font-black">{recentCheckin.stats.todayCheckins ?? 0}</span>
                    </div>
                    <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-700">
                      <strong className="block text-[11px] uppercase tracking-[.08em]">Aulas confirmadas</strong>
                      <span className="mt-1 block text-xl font-black">{recentCheckin.stats.confirmedClasses ?? 0}</span>
                    </div>
                  </div>
                )}

                {recentCheckin.payment && (
                  <div className={`rounded-lg border p-3 text-xs ${paymentTone(recentCheckin.payment.status)}`}>
                    <strong className="block text-[11px] uppercase tracking-[.08em]">
                      {paymentLabels[recentCheckin.payment.status ?? ""] ?? "Pagamento nao confirmado"}
                    </strong>
                    <div className="mt-2 grid gap-1">
                      <span>
                        Vencimento: <b>{recentCheckin.payment.due_date ? formatDate(recentCheckin.payment.due_date) : "Nao informado"}</b>
                      </span>
                      {recentCheckin.payment.total_amount != null && (
                        <span>
                          Valor: <b>{formatCurrency(Number(recentCheckin.payment.total_amount))}</b>
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <p className="mt-4 text-xs text-slate-500">
                {formatDateTime(recentCheckin.checked_at)}
              </p>

              <div className="mt-auto w-full">
                <Link href={`/dashboard/alunos?q=${encodeURIComponent(recentCheckin.studentName)}`} onClick={() => setOpen(false)} className="btn btn-secondary w-full">
                  Abrir informacoes do aluno
                </Link>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
