"use client";

import { CalendarDays, Check, CheckCircle2, Copy, CreditCard, FileCheck2, LogOut, QrCode } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { StudentQrCard } from "@/components/student-qr-card";
import { ErrorBanner, LoadingState, Modal, StatusBadge } from "@/components/ui";
import { createPixPayment } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import type { Student } from "@/lib/types";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";

type PortalData = {
  student: Student;
  bookings: Array<{ id: string; status: string; session?: { start_at: string; end_at: string; class_type?: { name: string; color: string }; instructor?: { full_name: string } } }>;
  payments: Array<{ id: string; reference: string; total_amount: number; status: string; due_date: string; pix_code?: string; pix_qr_base64?: string }>;
  contracts: Array<{ id: string; status: string; signed_at?: string | null; created_at: string; plan?: { name: string } }>;
};

export default function StudentPortalPage() {
  const { user, isLoading, logout } = useAuth();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [pix, setPix] = useState<any | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user || user.app_role !== "student") return;
    supabase.auth.getSession().then(({ data: session }) => fetch("/api/student/portal", {
      headers: { Authorization: `Bearer ${session.session?.access_token ?? ""}` },
      cache: "no-store",
    })).then(async (response) => {
      const payload = await response.json() as PortalData & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar seu portal.");
      setData(payload);
    }).catch((reason: Error) => setError(reason.message));
  }, [user]);

  async function generatePix(paymentId: string) {
    setWorking(paymentId);
    setError(null);
    try {
      const generated = await createPixPayment(paymentId);
      setPix(generated);
      // Reload portal data to reflect status change
      if (user) {
        const { data: session } = await supabase.auth.getSession();
        const response = await fetch("/api/student/portal", {
          headers: { Authorization: `Bearer ${session?.session?.access_token ?? ""}` },
          cache: "no-store",
        });
        const payload = await response.json();
        if (response.ok) setData(payload);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível gerar o PIX.");
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

  if (isLoading) return <LoadingState label="Abrindo portal do aluno..." />;
  if (!user) return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><section className="card max-w-md p-7 text-center"><QrCode className="mx-auto h-10 w-10 text-blue-600" /><h1 className="mt-4 text-xl font-bold">Portal do aluno</h1><p className="mt-2 text-sm text-[#657085]">Use o link enviado ao seu e-mail ou entre com sua conta.</p><Link className="btn btn-primary mt-5" href="/">Entrar</Link></section></main>;
  if (user.app_role !== "student") return <main className="grid min-h-screen place-items-center bg-[#f7f9fc] p-5"><Link className="btn btn-primary" href="/dashboard">Voltar ao painel</Link></main>;
  if (!data && !error) return <LoadingState label="Carregando seus dados..." />;

  return (
    <main className="min-h-screen bg-[#f7f9fc] p-4 sm:p-8">
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="flex items-center justify-between gap-4"><div><p className="eyebrow">Portal do aluno</p><h1 className="page-title">{data?.student.full_name || user.full_name}</h1></div><button className="btn btn-secondary" onClick={() => void logout()}><LogOut className="h-4 w-4" /> Sair</button></header>
        <ErrorBanner message={error} />
        {data && <>
          <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <StudentQrCard code={data.student.qr_code} name={data.student.full_name} />
            <section className="card">
              <div className="card-header"><div><h2>Próximas aulas</h2><p>Seus horários confirmados</p></div><CalendarDays className="h-5 w-5 text-blue-600" /></div>
              <div className="card-body grid gap-3">{data.bookings.length ? data.bookings.map((booking) => <article className="rounded-xl border border-[#e3e8f0] p-4" key={booking.id}><div className="flex items-start justify-between gap-3"><div><strong className="text-sm">{booking.session?.class_type?.name || "Aula"}</strong><p className="mt-1 text-xs text-[#657085]">{booking.session ? formatDateTime(booking.session.start_at) : "Horário indisponível"}</p><p className="mt-1 text-[11px] text-blue-600">{booking.session?.instructor?.full_name || "Professor a definir"}</p></div><StatusBadge tone="green">Confirmado</StatusBadge></div></article>) : <p className="text-sm text-[#657085]">Você ainda não possui aulas agendadas.</p>}</div>
            </section>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="card"><div className="card-header"><div><h2>Financeiro</h2><p>Últimas cobranças</p></div><CreditCard className="h-5 w-5 text-blue-600" /></div><div className="table-wrap"><table className="data-table"><tbody>{data.payments.map((payment) => <tr key={payment.id}><td><strong>{payment.reference}</strong><small className="mt-1 block text-[#8d97aa]">Vence em {formatDate(payment.due_date)}</small></td><td>{formatCurrency(Number(payment.total_amount))}</td><td><StatusBadge tone={payment.status === "paid" ? "green" : payment.status === "cancelled" ? "red" : "yellow"}>{payment.status === "paid" ? "Pago" : payment.status === "cancelled" ? "Cancelado" : "Pendente"}</StatusBadge></td><td>{payment.status !== "paid" && <button className="btn btn-primary min-h-8 px-3 py-1.5 text-[10px]" disabled={working === payment.id} onClick={() => void generatePix(payment.id)}><QrCode className="mr-1.5 h-3.5 w-3.5" /> Pagar com PIX</button>}</td></tr>)}</tbody></table></div></section>
            <section className="card"><div className="card-header"><div><h2>Contratos</h2><p>Documentos vinculados</p></div><FileCheck2 className="h-5 w-5 text-blue-600" /></div><div className="table-wrap"><table className="data-table"><tbody>{data.contracts.map((contract) => <tr key={contract.id}><td><strong>{contract.plan?.name || "Contrato"}</strong><small className="mt-1 block text-[#8d97aa]">{formatDate(contract.created_at)}</small></td><td><StatusBadge tone={contract.status === "signed" ? "green" : "yellow"}>{contract.status === "signed" ? "Assinado" : "Pendente"}</StatusBadge></td></tr>)}</tbody></table></div></section>
          </div>
        </>}
      </div>

      <Modal open={Boolean(pix)} onClose={() => setPix(null)} title={pix?.status === "paid" ? "PIX aprovado" : "PIX pronto para pagamento"} description={pix ? `Valor: ${formatCurrency(Number(pix.total_amount))}` : ""} size="sm">
        {pix && <div className="grid gap-4 text-center">
          {pix.status === "paid" ? <div className="rounded-2xl bg-green-50 p-6 text-green-700"><CheckCircle2 className="mx-auto h-12 w-12" /><strong className="mt-3 block text-lg">Pagamento confirmado automaticamente</strong></div> : <>
            {pix.pix_qr_base64 && <Image unoptimized width={256} height={256} className="mx-auto rounded-2xl border border-[#e3e8f0] p-2" alt="QR Code PIX" src={`data:image/png;base64,${pix.pix_qr_base64}`} />}
            <p className="text-xs leading-5 text-[#657085]">Acesse o aplicativo do seu banco para ler o QR Code ou copie a chave abaixo.</p>
            <button className="btn btn-secondary" disabled={!pix.pix_code} onClick={() => void copyPix()}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Código copiado" : "Copiar PIX copia e cola"}</button>
          </>}
        </div>}
      </Modal>
    </main>
  );
}
