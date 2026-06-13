"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
  student?: StudentInfo | null;
  enrollment?: {
    id?: string;
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

    return {
      ...checkin,
      payment,
      studentName: student?.full_name || "Aluno nao identificado",
      photoUrl: student?.photo_url ?? null,
    };
  }, []);

  const showCheckin = useCallback(async (checkin: CheckinEvent, shouldAutoClose = true) => {
    const next = await normalizeCheckin(checkin);
    setRecentCheckin(next);
    setOpen(true);
    if (shouldAutoClose) scheduleAutoClose();
  }, [normalizeCheckin, scheduleAutoClose]);

  const loadCheckinById = useCallback(async (id: string) => {
    const { data } = await supabase
      .from("checkins")
      .select("*, student:students(id, full_name, photo_url), enrollment:enrollments(id, status, start_date, end_date, plan:plans(name))")
      .eq("id", id)
      .maybeSingle();

    if (data) void showCheckin(data as CheckinEvent);
  }, [showCheckin]);

  const loadLatest = useCallback(async () => {
    const { data } = await supabase
      .from("checkins")
      .select("*, student:students(id, full_name, photo_url), enrollment:enrollments(id, status, start_date, end_date, plan:plans(name))")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    setRecentCheckin(await normalizeCheckin(data as CheckinEvent));
  }, [normalizeCheckin]);

  useEffect(() => {
    void loadLatest();

    const checkinChannel = supabase.channel("checkins-sidebar")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins" }, (payload) => {
        const checkin = payload.new as CheckinEvent;
        if (checkin?.id) void loadCheckinById(checkin.id);
        else void showCheckin(checkin);
      })
      .on("broadcast", { event: "CHECKIN_CREATED" }, ({ payload }) => {
        void showCheckin(payload as CheckinEvent);
      })
      .subscribe();

    const manualChannel = supabase.channel("manual-checkin-sidebar")
      .on("broadcast", { event: "MANUAL_CHECKIN_APPROVED" }, ({ payload }) => {
        const name = typeof payload?.name === "string" ? payload.name : "Liberacao manual";
        void showCheckin({
          id: `manual-${Date.now()}`,
          student_id: "manual",
          status: "allowed",
          reason: "Acesso liberado manualmente pela recepcao.",
          unit: "Matriz",
          checked_at: new Date().toISOString(),
          student: { full_name: name },
        });
      })
      .subscribe();

    function handleLocalCheckin(event: Event) {
      const detail = (event as CustomEvent<CheckinEvent>).detail;
      if (detail?.id) void showCheckin(detail);
    }

    window.addEventListener("checkin:created", handleLocalCheckin);

    return () => {
      clearAutoClose();
      window.removeEventListener("checkin:created", handleLocalCheckin);
      supabase.removeChannel(checkinChannel);
      supabase.removeChannel(manualChannel);
    };
  }, [clearAutoClose, loadCheckinById, loadLatest, showCheckin]);

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
                {recentCheckin.payment && (
                  <div className={`rounded-lg border p-3 text-xs ${paymentTone(recentCheckin.payment.status)}`}>
                    <strong className="block text-[11px] uppercase tracking-[.08em]">
                      {paymentLabels[recentCheckin.payment.status ?? ""] ?? "Pagamento nao confirmado"}
                    </strong>
                    <span className="mt-1 block">
                      {recentCheckin.payment.due_date ? `Vencimento: ${formatDate(recentCheckin.payment.due_date)}` : "Sem vencimento informado"}
                    </span>
                    {recentCheckin.payment.total_amount != null && (
                      <span className="mt-1 block font-semibold">
                        Valor: {formatCurrency(Number(recentCheckin.payment.total_amount))}
                      </span>
                    )}
                  </div>
                )}

                {recentCheckin.enrollment && (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <strong className="block text-[11px] uppercase tracking-[.08em] text-slate-700">Matricula</strong>
                    <span className="mt-1 block">
                      {recentCheckin.enrollment.plan?.name ? `${recentCheckin.enrollment.plan.name} - ` : ""}
                      {recentCheckin.enrollment.status ?? "sem status"}
                    </span>
                    {recentCheckin.enrollment.end_date && (
                      <span className="mt-1 block">Expira em: {formatDate(recentCheckin.enrollment.end_date)}</span>
                    )}
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
