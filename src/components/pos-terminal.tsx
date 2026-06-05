"use client";

import { useEffect, useState, useRef } from "react";
import { getPayments } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import type { Payment } from "@/lib/types";
import { X, Mail } from "lucide-react";

export function PosTerminalListener({ email }: { email: string }) {
  const [activePayment, setActivePayment] = useState<any | null>(null);
  const [approvedStatus, setApprovedStatus] = useState(false);
  const [emailPrompt, setEmailPrompt] = useState(false);
  const [receiptEmail, setReceiptEmail] = useState("");
  const [sendingReceipt, setSendingReceipt] = useState(false);
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

    const fetchFullSale = async (id: string) => {
      try {
        const { data } = await supabase.from("sales").select("*").eq("id", id).single();
        return data;
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
          p.provider_status === "pending_admin" &&
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

          const justGeneratedPix = newData.status === "pending" && 
            newData.pix_qr_base64 && 
            newData.provider_status === "pending_admin" && 
            (newData.pix_qr_base64 !== oldData.pix_qr_base64 || newData.provider_payment_id !== oldData.provider_payment_id);
          
          if (justGeneratedPix) {
            ignoredIds.current.delete(newData.id);
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
      .on(
        "broadcast",
        { event: "SHOW_PIX" },
        async ({ payload }) => {
          if (payload.payment_id) {
            ignoredIds.current.delete(payload.payment_id);
            const fullPayment = await fetchFullPayment(payload.payment_id);
            if (fullPayment && fullPayment.status === "pending") {
              setActivePayment(fullPayment);
              activeIdRef.current = fullPayment.id;
              setApprovedStatus(false);
            }
          }
        }
      )
      .on(
        "broadcast",
        { event: "SHOW_PIX_SALE" },
        async ({ payload }) => {
          if (payload.sale_id) {
            ignoredIds.current.delete(payload.sale_id);
            // We use payload directly to be instant, bypass DB
            setActivePayment({ 
              id: payload.sale_id,
              total_amount: payload.total_amount || 0,
              pix_qr_base64: payload.pix_qr_base64,
              pix_code: payload.pix_code,
              status: "pending",
              is_sale: true, 
              reference: `Venda #${String(payload.sale_id).substring(0, 5)}` 
            });
            activeIdRef.current = payload.sale_id;
            setApprovedStatus(false);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "sales" },
        async (payload) => {
          const newData = payload.new as any;
          if (activeIdRef.current && newData.id === activeIdRef.current && newData.status === "completed") {
            setApprovedStatus(true);
            setTimeout(() => {
              setEmailPrompt(true);
            }, 2000);
          }
        }
      )
      .subscribe();

    // Fallback de ultra-segurança (Polling): Se o WebSocket falhar no celular (3G/4G instável), o polling garante 100% de entrega
    const fallbackInterval = setInterval(() => {
      void checkInitial();
      
      // Se tivermos um pagamento ativo, verificar se ele foi pago no background
      if (activeIdRef.current && !approvedStatus) {
        const checkStatus = async () => {
          try {
            let data = null;
            if (activePayment?.is_sale) {
              const res = await supabase.from("sales").select("status").eq("id", activeIdRef.current!).single();
              data = res.data;
              if (data && data.status === "completed") data.status = "paid";
            } else {
              const res = await supabase.from("payments").select("status").eq("id", activeIdRef.current!).single();
              data = res.data;
            }
            if (data && data.status === "paid") {
              setApprovedStatus(true);
              setTimeout(() => {
                setEmailPrompt(true);
              }, 2000);
            }
          } catch {
            // Ignora erros de rede no polling
          }
        };
        void checkStatus();
      }
    }, 3000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(fallbackInterval);
    };
  }, [email]);

  function handleClose() {
    if (activePayment) {
      ignoredIds.current.add(activePayment.id);
    }
    setActivePayment(null);
    activeIdRef.current = null;
    setApprovedStatus(false);
    setEmailPrompt(false);
    setReceiptEmail("");
  }

  const handleSendReceipt = async () => {
    if (!receiptEmail.includes("@")) return;
    setSendingReceipt(true);
    // Simulate API call for sending email
    await new Promise(r => setTimeout(r, 1000));
    setSendingReceipt(false);
    handleClose();
  };

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
        emailPrompt ? (
          <div className="space-y-6 animate-fadeIn flex flex-col w-full max-w-sm">
            <div className="text-center mb-4">
              <div className="h-20 w-20 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <Mail className="h-10 w-10" />
              </div>
              <h3 className="text-2xl font-bold text-slate-900">Enviar Comprovante?</h3>
              <p className="text-slate-500 mt-2">Deseja enviar a nota fiscal ou o comprovante da transação para o cliente?</p>
            </div>
            
            <input 
              type="email" 
              placeholder="E-mail do cliente" 
              value={receiptEmail}
              onChange={(e) => setReceiptEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-lg focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
            />
            
            <div className="flex gap-3 pt-2">
              <button 
                onClick={handleClose}
                className="flex-1 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
                disabled={sendingReceipt}
              >
                Pular
              </button>
              <button 
                onClick={handleSendReceipt}
                className="flex-[2] py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-700 transition"
                disabled={sendingReceipt || !receiptEmail.includes("@")}
              >
                {sendingReceipt ? "Enviando..." : "Enviar Email"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 text-center animate-fadeIn flex flex-col items-center">
            <div className="h-40 w-40 rounded-full bg-green-500 text-white flex items-center justify-center shadow-2xl mb-8">
              <span className="text-8xl">✅</span>
            </div>
            <p className="text-5xl font-extrabold text-green-600 mb-2 uppercase tracking-tight drop-shadow-sm">Pagamento Aprovado!</p>
            <p className="text-3xl font-bold text-slate-700 uppercase bg-slate-100 px-6 py-2 rounded-full inline-block">
              {activePayment.student?.full_name || activePayment.reference}
            </p>
          </div>
        )
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
