"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarClock,
  Check,
  Copy,
  CreditCard,
  Hash,
  Mail,
  Receipt,
  UserRound,
  X,
} from "lucide-react";

export type RecentChargeDetail = {
  id: string;
  code: string;
  customer: string;
  customerEmail: string | null;
  status: string;
  statusDetail: string;
  rawStatus: string;
  tone: "success" | "muted" | "info";
  amount: number;
  currency: string;
  createdAt: string | null;
  paidAt: string | null;
  expiresAt: string | null;
  paymentMethod: string;
  paymentMethodKey: string | null;
  provider: string | null;
  providerStatus: string | null;
  providerPaymentId: string | null;
  discountCode: string | null;
};

type Props = {
  charge: RecentChargeDetail | null;
  onClose: () => void;
};

const ease = [0.22, 1, 0.36, 1] as const;

function money(value: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneClasses(tone: RecentChargeDetail["tone"]) {
  if (tone === "success") {
    return {
      badge: "bg-[rgba(79,209,197,0.12)] text-[#7EE0D6] border-[rgba(79,209,197,0.22)]",
      glow: "bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(79,209,197,0.12)_0%,transparent_72%)]",
    };
  }
  if (tone === "muted") {
    return {
      badge: "bg-[#171717] text-[#9A9A9E] border-[#252528]",
      glow: "",
    };
  }
  return {
    badge: "bg-[rgba(91,141,239,0.14)] text-[#9BB6FF] border-[rgba(91,141,239,0.24)]",
    glow: "bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(91,141,239,0.1)_0%,transparent_72%)]",
  };
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono = false,
  copyValue,
}: {
  icon: typeof Hash;
  label: string;
  value: string;
  mono?: boolean;
  copyValue?: string;
}) {
  return (
    <div className="flex items-start gap-[12px] rounded-[14px] border border-[#1C1C1C] bg-[#141414] px-[14px] py-[12px]">
      <span className="mt-[2px] flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[10px] border border-[#1C1C1C] bg-[#0D0D0D] text-[#8B8B90]">
        <Icon className="h-[15px] w-[15px]" strokeWidth={1.85} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6F6F74]">
          {label}
        </p>
        <p
          className={`mt-[4px] break-all text-[13px] leading-[1.5] text-[#ECECEE] ${mono ? "font-mono text-[12px]" : ""}`}
        >
          {value}
        </p>
      </div>
      {copyValue ? (
        <CopyButton value={copyValue} />
      ) : null}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          // ignore clipboard failures
        }
      }}
      className="inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[10px] border border-[#1C1C1C] bg-[#0D0D0D] text-[#8B8B90] transition-colors hover:border-[#2A2A2E] hover:text-[#D4D4D8]"
      aria-label="Copiar"
      title="Copiar"
    >
      <Copy className="h-[14px] w-[14px]" />
    </button>
  );
}

export function RecentChargeDetailSheet({ charge, onClose }: Props) {
  useEffect(() => {
    if (!charge) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [charge, onClose]);

  if (typeof document === "undefined") return null;

  const tone = charge ? toneClasses(charge.tone) : null;

  return createPortal(
    <AnimatePresence>
      {charge ? (
        <>
          <motion.button
            type="button"
            aria-label="Fechar detalhes da cobranca"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease }}
            className="fixed inset-0 z-[120] bg-[rgba(0,0,0,0.62)] backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="recent-charge-sheet-title"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.32, ease }}
            className="fixed inset-y-0 right-0 z-[130] flex w-full max-w-[440px] flex-col border-l border-[#1C1C1C] bg-[#0D0D0D] shadow-[-28px_0_90px_rgba(0,0,0,0.48)]"
          >
            <div className="relative overflow-hidden border-b border-[#1C1C1C] px-[20px] py-[20px]">
              {tone?.glow ? (
                <div aria-hidden="true" className={`pointer-events-none absolute inset-0 ${tone.glow}`} />
              ) : null}
              <div className="relative flex items-start justify-between gap-[14px]">
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#6F6F74]">
                    Detalhes da transacao
                  </p>
                  <h2
                    id="recent-charge-sheet-title"
                    className="mt-[8px] truncate text-[20px] font-semibold tracking-[-0.04em] text-[#F2F2F3]"
                  >
                    {charge.code}
                  </h2>
                  <span
                    className={`mt-[10px] inline-flex items-center gap-[6px] rounded-full border px-[10px] py-[5px] text-[11px] font-medium ${tone?.badge}`}
                  >
                    <span className="h-[6px] w-[6px] rounded-full bg-current" />
                    {charge.status}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[12px] border border-[#1C1C1C] bg-[#141414] text-[#B8B8BC] transition-colors hover:bg-[#171717] hover:text-[#F0F0F2]"
                  aria-label="Fechar painel"
                >
                  <X className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-[20px] py-[20px]">
              <div className="rounded-[18px] border border-[#1C1C1C] bg-[#141414] px-[16px] py-[16px]">
                <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6F6F74]">
                  Valor da cobranca
                </p>
                <p className="mt-[8px] text-[32px] font-semibold tracking-[-0.05em] text-[#F2F2F3]">
                  {money(charge.amount, charge.currency)}
                </p>
                <p className="mt-[6px] text-[13px] text-[#8B8B90]">{charge.statusDetail}</p>
              </div>

              <p className="mt-[22px] text-[11px] font-medium uppercase tracking-[0.12em] text-[#6F6F74]">
                Cliente
              </p>
              <div className="mt-[10px] space-y-[8px]">
                <DetailRow icon={UserRound} label="Nome" value={charge.customer} />
                <DetailRow
                  icon={Mail}
                  label="E-mail"
                  value={charge.customerEmail || "Nao informado"}
                  copyValue={charge.customerEmail || undefined}
                />
              </div>

              <p className="mt-[22px] text-[11px] font-medium uppercase tracking-[0.12em] text-[#6F6F74]">
                Pagamento
              </p>
              <div className="mt-[10px] space-y-[8px]">
                <DetailRow icon={CreditCard} label="Metodo" value={charge.paymentMethod} />
                <DetailRow
                  icon={Receipt}
                  label="Status interno"
                  value={charge.statusDetail}
                />
                {charge.providerStatus ? (
                  <DetailRow
                    icon={Check}
                    label="Status do provedor"
                    value={String(charge.providerStatus).replace(/_/g, " ")}
                  />
                ) : null}
                {charge.providerPaymentId ? (
                  <DetailRow
                    icon={Hash}
                    label="ID do pagamento"
                    value={charge.providerPaymentId}
                    mono
                    copyValue={charge.providerPaymentId}
                  />
                ) : null}
                {charge.discountCode ? (
                  <DetailRow icon={Receipt} label="Cupom aplicado" value={charge.discountCode} />
                ) : null}
              </div>

              <p className="mt-[22px] text-[11px] font-medium uppercase tracking-[0.12em] text-[#6F6F74]">
                Datas
              </p>
              <div className="mt-[10px] space-y-[8px]">
                <DetailRow
                  icon={CalendarClock}
                  label="Criada em"
                  value={formatDateTime(charge.createdAt)}
                />
                <DetailRow
                  icon={CalendarClock}
                  label="Paga em"
                  value={formatDateTime(charge.paidAt)}
                />
                <DetailRow
                  icon={CalendarClock}
                  label="Vencimento"
                  value={formatDateTime(charge.expiresAt)}
                />
              </div>

              <p className="mt-[22px] text-[11px] font-medium uppercase tracking-[0.12em] text-[#6F6F74]">
                Identificadores
              </p>
              <div className="mt-[10px] space-y-[8px]">
                <DetailRow icon={Hash} label="ID da cobranca" value={charge.id} mono copyValue={charge.id} />
                <DetailRow icon={Hash} label="Codigo da fatura" value={charge.code} copyValue={charge.code} />
                {charge.provider ? (
                  <DetailRow icon={CreditCard} label="Provedor" value={charge.provider} />
                ) : null}
              </div>
            </div>

            <div className="border-t border-[#1C1C1C] px-[20px] py-[16px]">
              <p className="text-[12px] leading-[1.55] text-[#6F6F74]">
                Transacao registrada no servidor. Use os identificadores acima para suporte ou conciliacao.
              </p>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
