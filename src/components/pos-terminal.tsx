"use client";

import { useEffect, useState, useRef } from "react";
import { getPayments } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Payment } from "@/lib/types";
import { X } from "lucide-react";

export function PosTerminalListener({ email }: { email: string }) {
  const [activePayment, setActivePayment] = useState<Payment | null>(null);
  const [approvedStatus, setApprovedStatus] = useState(false);
  const activeIdRef = useRef<string | null>(null);
  const ignoredIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (email !== "admin@admin.com") return;

    const fetchFullPayment = async (id: string) => {
      try {
        const { data } = await supabase
          .from("payments")
          .select("*, student:students(id, full_name)")
          .eq("id", id)
          .single();
        return data as Payment;
      } catch {
        return null;
      }
    };

    const checkInitial = async () => {
      try {
        const payments = await getPayments();
        const tenMinsAgo = Date.now() - 10 * 60 * 1000;
        // Se a cobrança foi CRIADA nos ultimos 10 mins e tá pendente
        const pendingPix = payments.find(p => 
          p.status === "pending" && 
          p.pix_qr_base64 && 
          new Date(p.created_at).getTime() >= tenMinsAgo &&
          !ignoredIds.current.has(p.id)
        );
        if (pendingPix && !activeIdRef.current) {
           setActivePayment(pendingPix);
           activeIdRef.current = pendingPix.id;
        }
      } catch (err) {}
    };

    void checkInitial();

    const channel = supabase.channel("pos-terminal-channel")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payments" },
        async (payload) => {
          const newData = payload.new as any;
          const oldData = payload.old as any;

          const justGeneratedPix = newData.pix_qr_base64 && newData.pix_qr_base64 !== oldData.pix_qr_base64 && newData.status === "pending";
          
          if (justGeneratedPix && !ignoredIds.current.has(newData.id)) {
            const fullPayment = await fetchFullPayment(newData.id);
            if (fullPayment) {
              setActivePayment(fullPayment);
              activeIdRef.current = fullPayment.id;
              setApprovedStatus(false);
            }
          }

          if (activeIdRef.current && newData.id === activeIdRef.current && newData.status === "paid") {
            setApprovedStatus(true);
            setTimeout(() => {
              setActivePayment(null);
              setApprovedStatus(false);
              activeIdRef.current = null;
            }, 5000);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [email]);

  function handleClose() {
    if (activePayment) {
      ignoredIds.current.add(activePayment.id);
    }
    setActivePayment(null);
    activeIdRef.current = null;
  }

  if (!activePayment) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white p-8">
      {!approvedStatus && (
        <button 
          onClick={handleClose}
          className="absolute top-6 right-6 p-3 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition"
          aria-label="Fechar"
        >
          <X className="h-8 w-8" />
        </button>
      )}

      {approvedStatus ? (
        <div className="space-y-6 text-center animate-fadeIn flex flex-col items-center">
          <div className="h-40 w-40 rounded-full bg-green-500 text-white flex items-center justify-center shadow-2xl mb-8">
            <span className="text-8xl">✅</span>
          </div>
          <p className="text-5xl font-extrabold text-green-600 mb-2 uppercase tracking-tight drop-shadow-sm">Pagamento Aprovado!</p>
          <p className="text-3xl font-bold text-slate-700 uppercase bg-slate-100 px-6 py-2 rounded-full inline-block">
            {activePayment.student?.full_name}
          </p>
        </div>
      ) : (
        <div className="space-y-8 text-center animate-fadeIn max-w-md w-full flex flex-col items-center">
          <div>
            <p className="text-4xl font-extrabold text-slate-900 tracking-tight">Pagamento PIX</p>
            <p className="text-xl font-medium text-blue-600 uppercase mt-2 tracking-widest">Aguardando Pagamento</p>
          </div>
          
          <div className="rounded-3xl border-4 border-slate-100 p-8 bg-white shadow-2xl flex justify-center w-full max-w-[320px]">
            {activePayment.pix_qr_base64 ? (
              <img src={activePayment.pix_qr_base64.startsWith('data:') ? activePayment.pix_qr_base64 : `data:image/png;base64,${activePayment.pix_qr_base64}`} alt="PIX QR Code" className="w-full h-auto object-contain" />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center bg-slate-50 text-slate-400 font-medium rounded-xl">
                Gerando QR Code...
              </div>
            )}
          </div>
          
          <div className="space-y-3 bg-slate-50 w-full py-6 rounded-2xl border border-slate-100">
            <p className="text-4xl font-black text-slate-800">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(activePayment.total_amount))}
            </p>
            {activePayment.student && (
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
                Aluno: {activePayment.student.full_name}
              </p>
            )}
          </div>
          
          <div className="mt-8 flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Aguardando confirmação do banco</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .animate-fadeIn { animation: fadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
      `}</style>
    </div>
  );
}
