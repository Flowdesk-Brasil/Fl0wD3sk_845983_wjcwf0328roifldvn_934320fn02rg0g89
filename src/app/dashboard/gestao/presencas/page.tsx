"use client";

import { addDays, format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertCircle, Bell, Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar, LoadingState, PageHeader } from "@/components/ui";
import { getAttendancesByDate } from "@/lib/api";
import type { ClassAttendance } from "@/lib/types";

export default function PresencasPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendances, setAttendances] = useState<ClassAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingPush, setSendingPush] = useState(false);

  async function loadData() {
    setLoading(true);
    const dateStr = format(currentDate, "yyyy-MM-dd");
    const data = await getAttendancesByDate(dateStr);
    setAttendances(data);
    setLoading(false);
  }

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => void loadData(), 30000);
    return () => clearInterval(interval);
  }, [currentDate]);

  async function handleNotifyToday() {
    setSendingPush(true);
    try {
      const res = await fetch("/api/cron/notify-today");
      const data = await res.json();
      alert(data.message || "Notificacoes enviadas.");
      await loadData();
    } catch {
      alert("Erro ao disparar notificacoes.");
    } finally {
      setSendingPush(false);
    }
  }

  const groupedBySchedule = attendances.reduce((acc, att) => {
    const key = att.class_schedule_id;
    if (!acc[key]) acc[key] = { schedule: att.class_schedule, attendances: [] };
    acc[key].attendances.push(att);
    return acc;
  }, {} as Record<string, { schedule: any; attendances: ClassAttendance[] }>);

  const schedulesArray = Object.values(groupedBySchedule).sort((a, b) => {
    return (a.schedule?.time || "").localeCompare(b.schedule?.time || "");
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Gestao"
        title="Controle de Presencas"
        description="Aulas do dia com alunos pendentes, confirmados e ausentes em tempo real."
        action={
          <button className="btn btn-primary bg-blue-600 hover:bg-blue-700" onClick={handleNotifyToday} disabled={sendingPush}>
            <Bell className="h-4 w-4" />
            {sendingPush ? "Enviando..." : "Notificar alunos de hoje"}
          </button>
        }
      />

      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <button className="btn btn-secondary" onClick={() => setCurrentDate((date) => subDays(date, 1))}>
          <ChevronLeft className="h-4 w-4" /> Anterior
        </button>
        <div className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <CalendarIcon className="h-5 w-5 text-blue-600" />
          {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </div>
        <button className="btn btn-secondary" onClick={() => setCurrentDate((date) => addDays(date, 1))}>
          Proximo <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <LoadingState label="Carregando presencas..." />
      ) : schedulesArray.length === 0 ? (
        <div className="card flex flex-col items-center p-12 text-center text-slate-500">
          <Clock className="mb-4 h-12 w-12 text-slate-300" />
          <h3 className="text-lg font-bold text-slate-700">Nenhuma aula encontrada</h3>
          <p className="mt-2 max-w-sm text-sm">Quando houver alunos vinculados a aulas deste dia, a lista sera montada automaticamente.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {schedulesArray.map((group) => {
            const confirmed = group.attendances.filter((att) => att.status === "confirmed" || att.status === "attended").length;
            const cancelled = group.attendances.filter((att) => att.status === "cancelled" || att.status === "missed").length;
            const pending = group.attendances.filter((att) => att.status === "pending").length;

            return (
              <section key={group.schedule?.id ?? group.attendances[0]?.class_schedule_id} className="card overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-1.5 rounded-full" style={{ backgroundColor: group.schedule?.class_type?.color || "#3b82f6" }} />
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">{group.schedule?.class_type?.name || "Turma"}</h2>
                      <p className="flex items-center gap-1 text-sm font-medium text-slate-500"><Clock className="h-3.5 w-3.5" /> {group.schedule?.time || "--:--"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2 text-sm font-medium">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-2 py-1 text-green-600"><CheckCircle2 className="h-4 w-4" /> {confirmed}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2 py-1 text-red-600"><XCircle className="h-4 w-4" /> {cancelled}</span>
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-yellow-50 px-2 py-1 text-yellow-700"><AlertCircle className="h-4 w-4" /> {pending}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="border-b border-slate-100 text-[11px] font-black uppercase tracking-[.12em] text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Aluno</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Horario</th>
                        <th className="px-4 py-3 text-right">Confirmacao</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {group.attendances.map((att) => (
                        <tr key={att.id} className={`${att.status === "pending" ? "opacity-45" : "opacity-100"} ${att.status === "confirmed" || att.status === "attended" ? "bg-green-50/40" : ""}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Avatar src={att.student?.photo_url} fallback={att.student?.full_name || "?"} size="sm" />
                              <div>
                                <p className="font-bold text-slate-900">{att.student?.full_name || "Aluno"}</p>
                                <p className="text-xs text-slate-400">Vinculado a turma</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3"><AttendanceBadge status={att.status} /></td>
                          <td className="px-4 py-3 text-slate-600">{group.schedule?.time || "--:--"}</td>
                          <td className="px-4 py-3 text-right">
                            {att.status === "confirmed" || att.status === "attended" ? (
                              <CheckCircle2 className="ml-auto h-6 w-6 text-green-600" />
                            ) : (
                              <span className="text-xs font-semibold text-slate-400">Aguardando</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AttendanceBadge({ status }: { status: ClassAttendance["status"] }) {
  if (status === "confirmed") return <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-700"><CheckCircle2 className="h-3.5 w-3.5" /> Confirmado</span>;
  if (status === "attended") return <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800"><CheckCircle2 className="h-3.5 w-3.5" /> Presente</span>;
  if (status === "cancelled") return <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600"><XCircle className="h-3.5 w-3.5" /> Nao vira</span>;
  if (status === "missed") return <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">Faltou</span>;
  return <span className="inline-flex items-center gap-1.5 rounded-full bg-yellow-50 px-2.5 py-1 text-xs font-bold text-yellow-700"><AlertCircle className="h-3.5 w-3.5" /> Pendente</span>;
}
