"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, User, X, AlertCircle } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";
import Image from "next/image";

type CheckinEvent = {
  id: string;
  student_id: string;
  status: "allowed" | "denied";
  reason: string | null;
  checked_at: string;
};

export function CheckinSidebar() {
  const [recentCheckin, setRecentCheckin] = useState<(CheckinEvent & { studentName: string; photoUrl?: string | null }) | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const channel = supabase.channel("checkins-sidebar")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "checkins" }, async (payload) => {
        const newData = payload.new as CheckinEvent;
        
        // Fetch student info
        if (newData.student_id) {
          const { data: student } = await supabase.from("students").select("full_name").eq("id", newData.student_id).single();
          setRecentCheckin({
            ...newData,
            studentName: student?.full_name || "Aluno",
            photoUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/student-photos/${newData.student_id}.jpg?t=${Date.now()}`
          });
          setOpen(true);
          
          // Auto close after 10 seconds if not interacted with
          setTimeout(() => setOpen(false), 10000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  if (!recentCheckin) return null;

  return (
    <div className={`fixed inset-y-0 right-0 z-50 w-80 bg-white shadow-2xl border-l border-[#e3e8f0] transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"} flex flex-col`}>
      <header className="flex items-center justify-between p-4 border-b border-[#e3e8f0] bg-slate-50">
        <h3 className="font-bold text-[#172033] flex items-center gap-2">
          {recentCheckin.status === "allowed" ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <AlertCircle className="h-5 w-5 text-red-500" />}
          Novo Check-in
        </h3>
        <button onClick={() => setOpen(false)} className="p-2 text-slate-400 hover:bg-slate-200 rounded-full transition-colors">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 p-6 flex flex-col items-center text-center">
        <div className="relative w-24 h-24 mb-2">
          {recentCheckin.photoUrl && (
            <img 
              src={recentCheckin.photoUrl} 
              alt={recentCheckin.studentName} 
              className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 shadow-md absolute inset-0 z-10 bg-slate-100" 
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="w-24 h-24 rounded-full bg-slate-100 flex items-center justify-center border-4 border-white shadow-md absolute inset-0">
            <User className="h-10 w-10 text-slate-400" />
          </div>
        </div>

        <h4 className="mt-4 text-lg font-bold text-[#172033]">{recentCheckin.studentName}</h4>
        
        <div className={`mt-2 px-3 py-1 text-xs font-bold rounded-full ${recentCheckin.status === "allowed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {recentCheckin.status === "allowed" ? "ACESSO LIBERADO" : "ACESSO BLOQUEADO"}
        </div>
        
        {recentCheckin.reason && (
          <p className="mt-3 text-sm text-red-600 bg-red-50 p-2 rounded-lg w-full text-left">
            {recentCheckin.reason}
          </p>
        )}

        <p className="mt-4 text-xs text-slate-500">
          {formatDateTime(recentCheckin.checked_at)}
        </p>

        <div className="mt-auto w-full">
          <Link href={`/dashboard/alunos?q=${encodeURIComponent(recentCheckin.studentName)}`} onClick={() => setOpen(false)} className="btn btn-secondary w-full">
            Abrir informações do aluno
          </Link>
        </div>
      </div>
    </div>
  );
}
