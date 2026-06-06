"use client";

import { useEffect, useState } from "react";
import { format, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell, Calendar as CalendarIcon, CheckCircle2, ChevronLeft, ChevronRight, Clock, UserX, XCircle, AlertCircle } from "lucide-react";
import { PageHeader, LoadingState, Avatar } from "@/components/ui";
import { getAttendancesByDate } from "@/lib/api";
import type { ClassAttendance } from "@/lib/types";

export default function PresencasPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [attendances, setAttendances] = useState<ClassAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingPush, setSendingPush] = useState(false);

  async function loadData() {
    setLoading(true);
    const dateStr = currentDate.toISOString().split('T')[0];
    const data = await getAttendancesByDate(dateStr);
    setAttendances(data);
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    // Refresh a cada 30 segundos
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [currentDate]);

  async function handleNotifyToday() {
    setSendingPush(true);
    try {
      const res = await fetch('/api/cron/notify-today');
      const data = await res.json();
      alert(data.message || 'Notificações enviadas (ou processo concluído).');
      loadData();
    } catch (e) {
      alert("Erro ao disparar notificações.");
    } finally {
      setSendingPush(false);
    }
  }

  const groupedBySchedule = attendances.reduce((acc, att) => {
    const key = att.class_schedule_id;
    if (!acc[key]) {
      acc[key] = {
        schedule: att.class_schedule,
        attendances: []
      };
    }
    acc[key].attendances.push(att);
    return acc;
  }, {} as Record<string, { schedule: any, attendances: ClassAttendance[] }>);

  const schedulesArray = Object.values(groupedBySchedule).sort((a, b) => {
    return (a.schedule?.time || "").localeCompare(b.schedule?.time || "");
  });

  return (
    <div className="page-stack">
      <PageHeader 
        eyebrow="Gestão" 
        title="Controle de Presenças" 
        description="Acompanhe quem confirmou presença nas aulas e dispare notificações." 
        action={
          <button 
            className="btn btn-primary bg-blue-600 hover:bg-blue-700" 
            onClick={handleNotifyToday} 
            disabled={sendingPush}
          >
            <Bell className="h-4 w-4" /> 
            {sendingPush ? 'Enviando...' : 'Notificar Alunos de Hoje'}
          </button>
        }
      />

      <div className="flex items-center justify-between bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
        <button className="btn btn-secondary" onClick={() => setCurrentDate(d => subDays(d, 1))}><ChevronLeft className="h-4 w-4" /> Anterior</button>
        <div className="flex items-center gap-2 font-bold text-lg text-slate-800">
          <CalendarIcon className="h-5 w-5 text-blue-600" />
          {format(currentDate, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        </div>
        <button className="btn btn-secondary" onClick={() => setCurrentDate(d => addDays(d, 1))}>Próximo <ChevronRight className="h-4 w-4" /></button>
      </div>

      {loading ? (
        <LoadingState label="Carregando presenças..." />
      ) : schedulesArray.length === 0 ? (
        <div className="card p-12 text-center flex flex-col items-center text-slate-500">
          <Clock className="h-12 w-12 text-slate-300 mb-4" />
          <h3 className="text-lg font-bold text-slate-700">Nenhuma ocorrência registrada</h3>
          <p className="text-sm max-w-sm mt-2">
            As presenças são geradas automaticamente quando as notificações são disparadas ou quando um aluno confirma pelo app.
          </p>
        </div>
      ) : (
        <div className="grid gap-6">
          {schedulesArray.map((group) => {
            const confirmed = group.attendances.filter(a => a.status === 'confirmed' || a.status === 'attended').length;
            const cancelled = group.attendances.filter(a => a.status === 'cancelled' || a.status === 'missed').length;
            const pending = group.attendances.filter(a => a.status === 'pending').length;

            return (
              <div key={group.schedule.id} className="card overflow-hidden">
                <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-8 rounded-full" style={{ backgroundColor: group.schedule.class_type?.color || '#3b82f6' }} />
                    <div>
                      <h2 className="font-bold text-lg text-slate-900">{group.schedule.class_type?.name || "Turma"}</h2>
                      <p className="text-sm font-medium text-slate-500 flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {group.schedule.time}</p>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm font-medium">
                    <span className="flex items-center gap-1.5 text-green-600 bg-green-50 px-2 py-1 rounded-lg"><CheckCircle2 className="h-4 w-4" /> {confirmed} Confirmados</span>
                    <span className="flex items-center gap-1.5 text-red-600 bg-red-50 px-2 py-1 rounded-lg"><XCircle className="h-4 w-4" /> {cancelled} Ausentes</span>
                    <span className="flex items-center gap-1.5 text-yellow-600 bg-yellow-50 px-2 py-1 rounded-lg"><AlertCircle className="h-4 w-4" /> {pending} Pendentes</span>
                  </div>
                </div>
                
                <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {group.attendances.map(att => (
                    <div key={att.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 shadow-sm hover:shadow-md transition">
                      <Avatar src={att.student?.photo_url} fallback={att.student?.full_name || '?'} size="sm" />
                      <div className="flex-1 overflow-hidden">
                        <p className="text-sm font-bold text-slate-900 truncate">{att.student?.full_name}</p>
                        {att.status === 'pending' && <p className="text-xs text-yellow-600 font-medium">Aguardando...</p>}
                        {att.status === 'confirmed' && <p className="text-xs text-green-600 font-medium">Confirmado</p>}
                        {att.status === 'attended' && <p className="text-xs text-green-700 font-medium">Presente (Catraca)</p>}
                        {att.status === 'cancelled' && <p className="text-xs text-red-500 font-medium">Não virá</p>}
                        {att.status === 'missed' && <p className="text-xs text-slate-500 font-medium">Faltou</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
