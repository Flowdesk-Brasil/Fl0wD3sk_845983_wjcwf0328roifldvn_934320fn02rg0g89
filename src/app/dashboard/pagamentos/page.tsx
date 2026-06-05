"use client";

import { Check, CheckCircle2, Copy, CreditCard, QrCode, RotateCcw, WalletCards } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorBanner, FieldLabel, LoadingState, Modal, PageHeader, SearchInput, StatusBadge } from "@/components/ui";
import { createPixPayment, getPayments, markPaymentPaid, updatePaymentStatus } from "@/lib/api";
import type { Payment, PaymentMethod, PaymentStatus } from "@/lib/types";
import { formatCurrency, formatDate } from "@/lib/utils";

const labels: Record<PaymentStatus, string> = { pending: "Pendente", paid: "Pago", expired: "Expirado", cancelled: "Cancelado", refunded: "Estornado" };
const tones: Record<PaymentStatus, "yellow" | "green" | "gray" | "red" | "blue"> = { pending: "yellow", paid: "green", expired: "gray", cancelled: "red", refunded: "blue" };
const methodLabels: Record<PaymentMethod, string> = { pix: "PIX", credit_card: "CartÃ£o de crÃ©dito", debit_card: "CartÃ£o de dÃ©bito", cash: "Dinheiro" };

export default function PagamentosPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [pix, setPix] = useState<Payment | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("pix");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const data = await getPayments();
    setPayments(data);
    setPix((current) => current ? data.find((item) => item.id === current.id) || current : current);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  
  useEffect(() => {
    if (!pix || pix.status === "paid") return;
    
    const { supabase } = require("@/lib/supabase");
    const channel = supabase.channel(`pix-listener-${pix.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "payments", filter: `id=eq.${pix.id}` },
        (payload: any) => {
          if (payload.new && payload.new.status === "paid") {
            setPix((current) => current ? { ...current, status: "paid" } : current);
            void load(); // Refresh the full list silently
          }
        }
      )
      .subscribe();

    // MantÃ©m o polling como fallback de seguranÃ§a
    const timer = window.setInterval(() => void load(), 5000);
    return () => {
      window.clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [load, pix?.id, pix?.status]);

  const filtered = useMemo(() => {
    const query = search.toLowerCase();
    return payments.filter((item) => !query || item.reference.toLowerCase().includes(query) || item.student?.full_name.toLowerCase().includes(query));
  }, [payments, search]);

  async function receive() {
    if (!selected) return;
    setWorking(selected.id);
    setError(null);
    try {
      await markPaymentPaid(selected.id, method);
      setSelected(null);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel confirmar o recebimento.");
    } finally {
      setWorking(null);
    }
  }

  async function reopen(payment: Payment) {
    if (!window.confirm(`Voltar ${payment.reference} para pendente? O recebimento atual serÃ¡ removido.`)) return;
    setWorking(payment.id);
    setError(null);
    try {
      await updatePaymentStatus(payment.id, "pending");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel voltar a cobranÃ§a.");
    } finally {
      setWorking(null);
    }
  }

  async function generatePix(payment: Payment) {
    setWorking(payment.id);
    setError(null);
    try {
      const generated = await createPixPayment(payment.id);
      setPix({ ...payment, ...generated });
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "NÃ£o foi possÃ­vel gerar o PIX.");
    } finally {
      setWorking(null);
    }
  }

  async function copyPix() {
    if (!pix?.pix_code) return;
    await navigator.clipboard.writeText(pix.pix_code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (loading) return <LoadingState label="Carregando financeiro..." />;
  const receivable = payments.filter((item) => item.status === "pending").reduce((sum, item) => sum + Number(item.total_amount), 0);
  const received = payments.filter((item) => item.status === "paid").reduce((sum, item) => sum + Number(item.total_amount), 0);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Controle financeiro" title="Financeiro" description="Gere PIX, acompanhe aprovaÃ§Ãµes automÃ¡ticas e corrija recebimentos quando necessÃ¡rio." />
      <ErrorBanner message={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <article className="card metric-card"><div className="metric-top"><div className="metric-icon badge-green"><CheckCircle2 className="h-5 w-5" /></div></div><strong>{formatCurrency(received)}</strong><p>Total recebido</p></article>
        <article className="card metric-card"><div className="metric-top"><div className="metric-icon badge-yellow"><WalletCards className="h-5 w-5" /></div></div><strong>{formatCurrency(receivable)}</strong><p>Saldo pendente</p></article>
      </div>
      <section className="card">
        <div className="table-toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Buscar referÃªncia ou aluno..." /><StatusBadge tone="blue">{payments.length} cobranÃ§as</StatusBadge></div>
        {filtered.length ? <div className="table-wrap"><table className="data-table">
          <thead><tr><th>ReferÃªncia</th><th>Aluno</th><th>Valor</th><th className="hide-mobile">Vencimento</th><th className="hide-mobile">MÃ©todo</th><th>Status</th><th>AÃ§Ã£o</th></tr></thead>
          <tbody>{filtered.map((payment) => (
            <tr key={payment.id}>
              <td><code className="rounded-lg bg-[#f3f6fb] px-2 py-1 text-[10px] font-bold text-blue-600">{payment.reference}</code></td>
              <td><strong className="text-xs text-[#172033]">{payment.student?.full_name ?? "Aluno removido"}</strong></td>
              <td><strong className="text-xs text-[#172033]">{formatCurrency(Number(payment.total_amount))}</strong></td>
              <td className="hide-mobile">{formatDate(payment.due_date)}</td>
              <td className="hide-mobile">{payment.method ? methodLabels[payment.method] : "NÃ£o informado"}</td>
              <td><StatusBadge tone={tones[payment.status]}>{labels[payment.status]}</StatusBadge></td>
              <td><div className="flex flex-wrap gap-2">
                {payment.status !== "paid" && <button className="btn btn-primary min-h-8 px-3 py-1.5 text-[10px]" disabled={working === payment.id} onClick={() => void generatePix(payment)}><QrCode className="h-3.5 w-3.5" /> Gerar PIX</button>}
                {payment.status === "pending" && <button className="btn btn-success min-h-8 px-3 py-1.5 text-[10px]" disabled={working === payment.id} onClick={() => setSelected(payment)}>Receber manualmente</button>}
                {payment.status !== "pending" && <button className="btn btn-secondary min-h-8 px-3 py-1.5 text-[10px]" disabled={working === payment.id} onClick={() => void reopen(payment)}><RotateCcw className="h-3.5 w-3.5" /> Pendente</button>}
              </div></td>
            </tr>
          ))}</tbody>
        </table></div> : <EmptyState icon={CreditCard} title="Nenhuma cobranÃ§a encontrada" description="CobranÃ§as sÃ£o geradas automaticamente ao criar uma matrÃ­cula." />}
      </section>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Confirmar recebimento" description={selected ? `${selected.student?.full_name} Â· ${formatCurrency(Number(selected.total_amount))}` : ""} size="sm">
        <div className="grid gap-4">
          <label><FieldLabel>MÃ©todo de pagamento</FieldLabel><select className="field" value={method} onChange={(event) => setMethod(event.target.value as PaymentMethod)}>{Object.entries(methodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <div className="form-actions"><button className="btn btn-secondary" onClick={() => setSelected(null)}>Cancelar</button><button className="btn btn-primary" onClick={() => void receive()}>Confirmar recebimento</button></div>
        </div>
      </Modal>

      <Modal open={Boolean(pix)} onClose={() => setPix(null)} title={pix?.status === "paid" ? "PIX aprovado" : "PIX pronto para pagamento"} description={pix ? `${pix.student?.full_name} Â· ${formatCurrency(Number(pix.total_amount))}` : ""} size="sm">
        {pix && <div className="grid gap-4 text-center">
          {pix.status === "paid" ? <div className="rounded-2xl bg-green-50 p-6 text-green-700"><CheckCircle2 className="mx-auto h-12 w-12" /><strong className="mt-3 block text-lg">Pagamento confirmado automaticamente</strong></div> : <>
            {pix.pix_qr_base64 && <Image unoptimized width={256} height={256} className="mx-auto rounded-2xl border border-[#e3e8f0] p-2" alt="QR Code PIX" src={`data:image/png;base64,${pix.pix_qr_base64}`} />}
            <p className="text-xs leading-5 text-[#657085]">A tela atualiza automaticamente quando o Mercado Pago confirmar o pagamento.</p>
            <div className="flex flex-col gap-2 w-full mt-2">
              <button className="btn btn-secondary w-full justify-center" disabled={!pix.pix_code} onClick={() => void copyPix()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "CÃ³digo copiado" : "Copiar PIX copia e cola"}</button>
              <button className="btn btn-primary w-full justify-center bg-indigo-600 hover:bg-indigo-700 border-indigo-600 text-white" onClick={() => {
                const { supabase } = require("@/lib/supabase");
                const channelName = "pos-terminal-channel";
                
                // Get existing channel if any
                let channel = supabase.getChannels().find((c: any) => c.topic === `realtime:${channelName}`);
                if (!channel) {
                  channel = supabase.channel(channelName);
                }

                // If already joined, just send
                if (channel.state === "joined") {
                  channel.send({ type: "broadcast", event: "SHOW_PIX", payload: { payment_id: pix.id } });
                  alert("Sinal re-enviado para o celular admin!");
                } else {
                  // Otherwise subscribe and wait for SUBSCRIBED
                  channel.subscribe((status: string) => {
                    if (status === "SUBSCRIBED") {
                      channel.send({ type: "broadcast", event: "SHOW_PIX", payload: { payment_id: pix.id } });
                      alert("Sinal enviado para o celular admin!");
                    }
                  });
                }
              }}>Espelhar na MÃ¡quina / Celular</button>
            </div>
          </>}
        </div>}
      </Modal>
    </div>
  );
}
