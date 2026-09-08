"use client";

/**
 * Portao de adesao ao programa.
 *
 * Antes, abrir o painel ja criava o perfil de afiliado no banco, sem pedido e
 * sem aceite. Agora quem ainda nao aderiu ve este convite e decide.
 *
 * Tambem cobre os outros estados possiveis: termos atualizados (precisa aceitar
 * de novo) e participacao suspensa.
 */

import { useState } from "react";
import { motion } from "motion/react";
import { CircleCheck, ShieldAlert, Sparkles } from "lucide-react";
import { AFF_CARD, AFF_CARD_INNER } from "@/components/affiliates/affiliateUi";
import { AFFILIATE_LEVELS } from "@/lib/affiliates/affiliateLevels";
import type {
  AffiliateEnrollmentStatus,
  AffiliateProgramRules,
} from "@/lib/affiliates/affiliateTypes";

export function AffiliateEnrollmentGate({
  status,
  statusMessage,
  rules,
  onEnrolled,
}: {
  status: AffiliateEnrollmentStatus;
  statusMessage: string | null;
  rules: AffiliateProgramRules | null;
  onEnrolled: () => void;
}) {
  const [accepted, setAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "suspended" || status === "inactive") {
    return (
      <div className={`${AFF_CARD} p-[28px]`}>
        <div className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-[14px] border border-[#1C1C1C] bg-[#141414] text-[#EB6A5C]">
          <ShieldAlert className="h-[22px] w-[22px]" strokeWidth={1.8} />
        </div>
        <h2 className="mt-[16px] text-[20px] font-semibold tracking-[-0.02em] text-[#F2F2F3]">
          Participação suspensa
        </h2>
        <p className="mt-[8px] max-w-[60ch] text-[14px] leading-[1.6] text-[#8B8B90]">
          {statusMessage ||
            "Sua participação no programa está suspensa. Fale com o suporte para entender os próximos passos."}
        </p>
      </div>
    );
  }

  const isRenewal = status === "terms_outdated";

  const handleEnroll = async () => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/affiliates/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          acceptTerms: true,
          termsVersion: rules?.termsVersion,
        }),
      });

      const json = await response.json();

      if (json.ok) {
        onEnrolled();
      } else {
        setError(json.message || "Não foi possível concluir sua adesão.");
      }
    } catch {
      setError("Falha de conexão. Verifique sua internet e tente de novo.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const highlights = [
    {
      label: "Comissão",
      value: `${AFFILIATE_LEVELS.bronze.commissionPct}% a ${AFFILIATE_LEVELS.diamond.commissionPct}%`,
      detail: "Sobe conforme suas vendas aprovadas no mês",
    },
    {
      label: "Carência",
      value: `${rules?.holdingPeriodDays ?? 7} dias`,
      detail: "Prazo até a comissão virar saldo sacável",
    },
    {
      label: "Saque mínimo",
      value: rules
        ? rules.withdrawalMinimum.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })
        : "R$ 50,00",
      detail: "Via PIX, após conferência",
    },
    {
      label: "Atribuição",
      value: `${rules?.attributionWindowDays ?? 30} dias`,
      detail:
        rules?.attributionModel === "first"
          ? "Vale o primeiro link clicado"
          : "Vale o último link clicado",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      className={`${AFF_CARD} p-[28px]`}
    >
      <div className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-[14px] border border-[#1C1C1C] bg-[#141414] text-[#8B8B90]">
        <Sparkles className="h-[22px] w-[22px]" strokeWidth={1.8} />
      </div>

      <h2 className="mt-[16px] text-[22px] font-semibold tracking-[-0.02em] text-[#F2F2F3]">
        {isRenewal ? "Os termos do programa mudaram" : "Participe do programa de afiliados"}
      </h2>

      <p className="mt-[8px] max-w-[62ch] text-[14px] leading-[1.6] text-[#8B8B90]">
        {isRenewal
          ? "Revise e aceite a nova versão dos termos para continuar usando seus links e solicitar saques."
          : "Indique a Flowdesk e receba comissão por cada venda aprovada. A entrada é gratuita e você pode sair quando quiser."}
      </p>

      <div className="mt-[22px] grid gap-[1px] overflow-hidden rounded-[16px] border border-[#1C1C1C] bg-[#1C1C1C] sm:grid-cols-2 lg:grid-cols-4">
        {highlights.map((item) => (
          <div key={item.label} className="bg-[#0F0F0F] px-[18px] py-[16px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">{item.label}</p>
            <p className="mt-[6px] text-[18px] font-semibold tracking-[-0.02em] text-[#ECECEE]">
              {item.value}
            </p>
            <p className="mt-[4px] text-[12px] leading-[1.5] text-[#737373]">{item.detail}</p>
          </div>
        ))}
      </div>

      {rules?.blockSelfReferral ? (
        <p className={`mt-[18px] rounded-[12px] px-[16px] py-[12px] text-[13px] text-[#8B8B90] ${AFF_CARD_INNER}`}>
          Compras feitas com o seu próprio link não geram comissão.
          {rules.recurrenceMode === "first"
            ? " A comissão vale para a primeira compra de cada cliente indicado."
            : rules.recurrenceMode === "all"
              ? " A comissão vale para todas as renovações do cliente indicado."
              : ` A comissão vale para as ${rules.recurrenceMaxCharges} primeiras cobranças de cada cliente.`}
        </p>
      ) : null}

      <label className="mt-[20px] flex cursor-pointer items-start gap-[10px] text-[13px] leading-[1.6] text-[#C4C4C8]">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-[3px] h-[16px] w-[16px] shrink-0 accent-[#2D7FF9]"
        />
        <span>
          Li e aceito os{" "}
          <a
            href={rules?.termsUrl || "/terms"}
            target="_blank"
            rel="noreferrer"
            className="text-[#ECECEE] underline underline-offset-2"
          >
            termos do programa de afiliados
          </a>
          {rules?.termsVersion ? (
            <span className="text-[#737373]"> (versão {rules.termsVersion})</span>
          ) : null}
          .
        </span>
      </label>

      <button
        type="button"
        onClick={handleEnroll}
        disabled={!accepted || isSubmitting}
        className="mt-[18px] inline-flex h-[42px] items-center justify-center gap-[8px] rounded-[12px] border border-[#2A2A2A] bg-[#1A1A1A] px-[22px] text-[13px] font-medium text-[#ECECEE] transition-colors duration-150 hover:border-[#3A3A3A] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isSubmitting ? (
          "Confirmando..."
        ) : (
          <>
            <CircleCheck className="h-[16px] w-[16px]" strokeWidth={1.8} />
            {isRenewal ? "Aceitar e continuar" : "Quero participar"}
          </>
        )}
      </button>

      {error ? (
        <p role="alert" className="mt-[12px] text-[13px] text-[#EB6A5C]">
          {error}
        </p>
      ) : null}
    </motion.div>
  );
}
