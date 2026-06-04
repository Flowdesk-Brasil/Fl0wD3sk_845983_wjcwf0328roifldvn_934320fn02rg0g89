"use client";

import { useEffect, useState } from "react";
import { getPayments } from "@/lib/api";
import type { Payment } from "@/lib/types";

export function PosTerminalListener({ email }: { email: string }) {
  const [activePayment, setActivePayment] = useState<Payment | null>(null);
  const [approvedStatus, setApprovedStatus] = useState(false);

  useEffect(() => {
    if (email !== "admin@admin.com") return;

    let activeId: string | null = null;
    let isApproved = false;

    const interval = setInterval(async () => {
      try {
        const payments = await getPayments();
        
        // Se já temos um pagamento ativo e aprovado na tela, não faz nada até sumir
        if (isApproved) return;

        if (activeId) {
          // Checa se o ativo foi pago
          const current = payments.find(p => p.id === activeId);
          if (current?.status === "paid") {
            isApproved = true;
            setApprovedStatus(true);
            setTimeout(() => {
              setActivePayment(null);
              setApprovedStatus(false);
              activeId = null;
              isApproved = false;
            }, 5000); // Volta ao normal depois de 5s
          } else if (!current || current.status !== "pending") {
             // Cancelado ou excluido
             setActivePayment(null);
             activeId = null;
          }
        } else {
          // Procura um novo pagamento PIX pendente criado recentemente (nos ultimos 2 minutos)
          // Isso garante que se um funcionário gerar um PIX agora, a tela desse admin já puxe o QR code
          const twoMinsAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
          const pendingPix = payments.find(p => 
            p.status === "pending" && 
            p.pix_qr_base64 && 
            p.created_at >= twoMinsAgo
          );
          
          if (pendingPix) {
            setActivePayment(pendingPix);
            activeId = pendingPix.id;
          }
        }
      } catch (err) {
        // ignore silently to prevent logs filling up
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [email]);

  if (!activePayment) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white p-8">
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
              <img src={activePayment.pix_qr_base64} alt="PIX QR Code" className="w-full h-auto object-contain" />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center bg-slate-50 text-slate-400 font-medium rounded-xl">
                Gerando QR Code...
              </div>
            )}
          </div>
          
          <div className="space-y-3 bg-slate-50 w-full py-6 rounded-2xl border border-slate-100">
            <p className="text-4xl font-black text-slate-800">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(activePayment.total_amount)}
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
