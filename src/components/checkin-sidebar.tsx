"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Clock3, PanelRightOpen, User, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/utils";

type StudentInfo = {
  id?: string;
  full_name?: string | null;
  photo_url?: string | null;
};

type CheckinEvent = {
  id: string;
  student_id?: string | null;
  status: "allowed" | "denied";
  reason?: string | null;
  unit?: string | null;
  checked_at: string;
  student?: StudentInfo | null;
};

type SidebarCheckin = CheckinEvent & {
  studentName: string;
  photoUrl?: string | null;
};

const AUTO_CLOSE_MS = 10000;

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

    if (!student && checkin.student_id && checkin.student_id !== "manual") {
      const { data } = await supabase
        .from("students")
        .select("id, full_name, photo_url")
        .eq("id", checkin.student_id)
        .maybeSingle();

      student = data as StudentInfo | null;
    }

    return {
      ...checkin,
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

  const loadLatest = useCallback(async () => {
    const { data } = await supabase
      .from("checkins")
      .select("*, student:students(id, full_name, photo_url)")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;

    const latest = data as CheckinEvent;
    setRecentCheckin({
      ...latest,
      studentName: latest.student?.full_name || "Aluno nao identificado",
      photoUrl: latest.student?.photo_url ?? null,
    });
  }, []);

  useEffect(() => {
    void loadLatest();

    const checkinChannel = supabase.channel("checkins-sidebar-broadcast")
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
  }, [clearAutoClose, loadLatest, showCheckin]);

  const allowed = recentCheckin?.status === "allowed";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          clearAutoClose();
          setOpen(true);
        }}
        className={`fixed right-0 top-28 z-[60] flex items-center gap-2 rounded-l-xl border border-r-0 border-[#dce3ee] bg-white px-3 py-2 text-xs font-bold text-[#172033] shadow-lg transition ${open ? "translate-x-full opacity-0" : "translate-x-0 opacity-100"}`}
        aria-label="Abrir painel de check-in"
      >
        {allowed ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : recentCheckin ? <AlertCircle className="h-4 w-4 text-red-600" /> : <PanelRightOpen className="h-4 w-4 text-blue-600" />}
        Check-in
      </button>

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
