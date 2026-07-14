"use client";

import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  BadgePercent,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Crown,
  PlusCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Star,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import confetti from "canvas-confetti";
import { useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { usePlanState } from "@/hooks/useAccountData";
import {
  buildPaymentCheckoutEntryHref,
  resolvePaymentBillingPeriodCodeFromCycleDays,
} from "@/lib/payments/paymentRouting";
import { buildBrowserRoutingTargetFromInternalPath } from "@/lib/routing/subdomains";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

type AccountPlan = {
  planCode: string;
  planName: string;
  status: string;
  amount: number | string;
  currency: string;
  billingCycleDays: number;
  maxLicensedServers: number;
  activatedAt: string | null;
  expiresAt: string | null;
};

type PlanUsage = {
  licensedServersCount: number;
  maxLicensedServers: number;
  remainingLicensedServers: number;
  hasReachedLicensedServersLimit: boolean;
  canAddMoreServers: boolean;
};

type PlanStatePayload = {
  plan: AccountPlan | null;
  usage: PlanUsage;
  totalLinkedServersCount: number;
};

const PLAN_CONFIGS: Record<
  string,
  {
    color: string;
    bg: string;
    icon: LucideIcon;
    description: string;
    features: string[];
  }
> = {
  basic: {
    color: "#A0A0A0",
    bg: "rgba(160,160,160,0.10)",
    icon: Star,
    description: "Plano gratuito para testar a estrutura antes da assinatura.",
    features: ["1 servidor licenciado", "2 tickets ativos", "50 acoes mensais"],
  },
  pro: {
    color: "#8AB6FF",
    bg: "rgba(0,98,255,0.12)",
    icon: Zap,
    description: "Plano principal para operacoes enxutas com automacao inicial.",
    features: ["1 servidor licenciado", "50 tickets ativos", "2 automacoes", "1.000 acoes mensais"],
  },
  ultra: {
    color: "#C4A9FF",
    bg: "rgba(125,59,255,0.13)",
    icon: Crown,
    description: "Escala multi-servidor com alto volume e automacoes profundas.",
    features: ["5 servidores licenciados", "1.000 tickets ativos", "15 automacoes", "20.000 acoes mensais"],
  },
  master: {
    color: "#FFB966",
    bg: "rgba(255,163,47,0.12)",
    icon: Crown,
    description: "Camada maxima para operacoes intensas e liberdade de escala.",
    features: ["10 servidores licenciados", "Tickets ilimitados", "Automacoes ilimitadas", "Uso ilimitado"],
  },
};

function normalizePlanCode(value: string | null | undefined) {
  return (value || "pro").trim().toLowerCase();
}

function toNumber(value: string | number | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(iso: string | null) {
  if (!iso) return "Nao informado";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "Nao informado";
  return new Date(timestamp).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "Sem vencimento registrado.";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "Sem vencimento registrado.";
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMoney(value: string | number, currency = "BRL") {
  return toNumber(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
  });
}

function formatLimit(value: number | null | undefined) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return "Nao definido";
  if (normalized >= 999_999) return "Ilimitado";
  return normalized.toLocaleString("pt-BR");
}

function getDaysUntil(iso: string | null) {
  if (!iso) return null;
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return null;
  return Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000));
}

function getExpirationSummary(plan: AccountPlan) {
  const days = getDaysUntil(plan.expiresAt);
  if (days === null) return "Sem vencimento registrado";
  if (days < 0) return `Vencido ha ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "Vence hoje";
  return `Vence em ${days} dia${days === 1 ? "" : "s"}`;
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const map: Record<string, { label: string; className: string }> = {
    active: {
      label: "Ativo",
      className: "border-[rgba(52,168,83,0.28)] bg-[rgba(52,168,83,0.10)] text-[#7BD88F]",
    },
    trial: {
      label: "Teste",
      className: "border-[rgba(242,200,35,0.28)] bg-[rgba(242,200,35,0.10)] text-[#E7CF62]",
    },
    expired: {
      label: "Expirado",
      className: "border-[rgba(219,70,70,0.30)] bg-[rgba(219,70,70,0.10)] text-[#E99999]",
    },
    inactive: {
      label: "Inativo",
      className: "border-[#202020] bg-[#111111] text-[#8F8F8F]",
    },
  };
  const resolved = map[normalized] || map.inactive;
  return (
    <span className={`inline-flex h-[26px] items-center rounded-full border px-[10px] text-[11px] font-semibold ${resolved.className}`}>
      {resolved.label}
    </span>
  );
}

function ModalShell({
  isOpen,
  title,
  children,
  onClose,
  zIndexClassName = "z-[2600]",
}: {
  isOpen: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  zIndexClassName?: string;
}) {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className={`flowdesk-account-modal-nui fixed inset-0 ${zIndexClassName} isolate overflow-y-auto overscroll-contain`}>
      <button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 bg-[rgba(0,0,0,0.86)] backdrop-blur-[9px]"
        onClick={onClose}
      />
      <div className="relative z-10 flex min-h-full items-center justify-center p-[16px] sm:p-[24px]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flowdesk-stage-fade w-full max-w-[560px] overflow-hidden rounded-[20px] border border-[#1B1B1B] bg-[#080808] shadow-[0_34px_120px_rgba(0,0,0,0.72)]"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function RenewalInfoRow({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-[12px] rounded-[15px] border border-[#171717] bg-[#0B0B0B] px-[14px] py-[13px]">
      <span className="mt-[1px] inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] border border-[#202020] bg-[#111111] text-[#A8A8A8]">
        <Icon className="h-[17px] w-[17px]" />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[#E7E7E7]">{title}</span>
        <span className="mt-[4px] block text-[12px] leading-[1.55] text-[#747474]">{description}</span>
      </span>
    </div>
  );
}

function RenewalModal({
  isOpen,
  plan,
  config,
  renewalHref,
  isRedirecting,
  error,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  plan: AccountPlan;
  config: (typeof PLAN_CONFIGS)[string];
  renewalHref: string | null;
  isRedirecting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const Icon = config.icon;

  return (
    <ModalShell isOpen={isOpen} title="Renovar Plano" onClose={isRedirecting ? () => null : onClose}>
      <div className="border-b border-[#171717] px-[22px] pt-[24px] pb-[18px] text-center">
        <div
          className="mx-auto flex h-[64px] w-[64px] items-center justify-center rounded-full border border-[rgba(255,255,255,0.06)]"
          style={{ backgroundColor: config.bg }}
        >
          <Icon className="h-[30px] w-[30px]" style={{ color: config.color }} />
        </div>
        <h2 className="mt-[16px] text-[20px] font-semibold tracking-[-0.03em] text-[#F1F1F1]">
          Renovar {plan.planName}
        </h2>
        <p className="mx-auto mt-[7px] max-w-[440px] text-[13px] leading-[1.6] text-[#777777]">
          Voce esta renovando o plano atual da conta. O pagamento cria uma renovacao vinculada a esta assinatura.
        </p>
      </div>

      <div className="space-y-[10px] px-[22px] py-[20px]">
        <RenewalInfoRow
          icon={CalendarClock}
          title="Vencimento exato"
          description={formatDateTime(plan.expiresAt)}
        />
        <RenewalInfoRow
          icon={PlusCircle}
          title="Dias preservados"
          description="Renovando antes do vencimento, os novos dias pagos sao somados ao periodo restante."
        />
        <RenewalInfoRow
          icon={ShieldCheck}
          title="Acesso protegido"
          description="Renovar antes do vencimento evita perda de beneficios, acesso e recursos vinculados ao plano."
        />
        {error ? (
          <div className="flex items-start gap-[10px] rounded-[13px] border border-[rgba(219,70,70,0.24)] bg-[rgba(219,70,70,0.08)] px-[13px] py-[11px] text-[12px] leading-[1.5] text-[#E0AAAA]">
            <AlertCircle className="mt-[1px] h-[15px] w-[15px] shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-[8px] border-t border-[#171717] px-[22px] py-[18px] sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={onClose}
          disabled={isRedirecting}
          className="inline-flex h-[42px] items-center justify-center rounded-[12px] border border-[#1A1A1A] bg-[#101010] px-[15px] text-[13px] font-medium text-[#9A9A9A] transition-colors hover:border-[#262626] hover:bg-[#131313] hover:text-[#DADADA] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!renewalHref || isRedirecting}
          aria-busy={isRedirecting}
          className="inline-flex h-[42px] items-center justify-center gap-[9px] rounded-[12px] bg-[#0062FF] px-[16px] text-[13px] font-semibold text-white transition-colors hover:bg-[#146FFF] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isRedirecting ? <ButtonLoader size={16} colorClassName="text-white" /> : <RefreshCcw className="h-[16px] w-[16px]" />}
          {isRedirecting ? "Abrindo pagamento" : "Renovar Plano"}
        </button>
      </div>
    </ModalShell>
  );
}

function RenewalSuccessModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const intervalIdsRef = useRef<number[]>([]);
  const timeoutIdsRef = useRef<number[]>([]);

  useEffect(() => {
    if (!isOpen || typeof window === "undefined") return;

    let cancelled = false;
    const clearTimers = () => {
      intervalIdsRef.current.forEach((id) => window.clearInterval(id));
      timeoutIdsRef.current.forEach((id) => window.clearTimeout(id));
      intervalIdsRef.current = [];
      timeoutIdsRef.current = [];
    };

    const randomInRange = (min: number, max: number) =>
      Math.random() * (max - min) + min;

    const fire = () => {
      if (cancelled) return;
      const duration = 5 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = {
        startVelocity: 30,
        spread: 360,
        ticks: 60,
        zIndex: 4600,
        disableForReducedMotion: true,
      };

      const intervalId = window.setInterval(() => {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) {
          window.clearInterval(intervalId);
          return;
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        });
      }, 250);
      intervalIdsRef.current.push(intervalId);

      const repeatTimeoutId = window.setTimeout(fire, duration + 15_000);
      timeoutIdsRef.current.push(repeatTimeoutId);
    };

    fire();

    return () => {
      cancelled = true;
      clearTimers();
      confetti.reset();
    };
  }, [isOpen]);

  return (
    <ModalShell isOpen={isOpen} title="Plano renovado" onClose={onClose} zIndexClassName="z-[4500]">
      <div className="relative px-[22px] py-[24px] text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-[16px] top-[16px] inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] text-[#777777] transition-colors hover:bg-[#111111] hover:text-white"
        >
          <X className="h-[17px] w-[17px]" />
        </button>
        <div className="mx-auto flex h-[66px] w-[66px] items-center justify-center rounded-full border border-[rgba(52,168,83,0.24)] bg-[rgba(52,168,83,0.10)] text-[#7BD88F]">
          <CheckCircle2 className="h-[31px] w-[31px]" />
        </div>
        <h2 className="mt-[17px] text-[21px] font-semibold tracking-[-0.03em] text-[#F3F3F3]">
          Plano renovado com sucesso
        </h2>
        <p className="mx-auto mt-[8px] max-w-[430px] text-[13px] leading-[1.65] text-[#777777]">
          O pagamento foi validado e a validade do plano foi atualizada na sua conta.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="mt-[22px] inline-flex h-[42px] items-center justify-center rounded-[12px] bg-[#0062FF] px-[18px] text-[13px] font-semibold text-white transition-colors hover:bg-[#146FFF]"
        >
          Ver plano
        </button>
      </div>
    </ModalShell>
  );
}

export function PlansTab() {
  const { planState: rawPlanState, loading, error, mutate } = usePlanState();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRenewalModalOpen, setIsRenewalModalOpen] = useState(false);
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [isRedirectingRenewal, setIsRedirectingRenewal] = useState(false);
  const [renewalError, setRenewalError] = useState<string | null>(null);

  const planState = rawPlanState as PlanStatePayload | null;
  const plan = planState?.plan || null;
  const usage = planState?.usage || null;
  const planCode = normalizePlanCode(plan?.planCode);
  const config = PLAN_CONFIGS[planCode] || PLAN_CONFIGS.pro;
  const PlanIcon = config.icon;
  const canRenewPlan = Boolean(
    plan &&
      plan.planCode !== "basic" &&
      plan.billingCycleDays > 0 &&
      plan.status !== "inactive",
  );
  const usagePercent =
    usage && usage.maxLicensedServers > 0
      ? Math.min(100, Math.round((usage.licensedServersCount / usage.maxLicensedServers) * 100))
      : 0;

  const renewalHref = useMemo(() => {
    if (!plan || !canRenewPlan) return null;
    return buildPaymentCheckoutEntryHref({
      planCode: plan.planCode,
      billingPeriodCode: resolvePaymentBillingPeriodCodeFromCycleDays(
        plan.billingCycleDays,
      ),
      searchParams: {
        renew: 1,
        return: "account",
        returnPath: "/account/plans",
      },
    });
  }, [canRenewPlan, plan]);

  useEffect(() => {
    const renewed = searchParams.get("renewed") === "1";
    const paymentApproved = searchParams.get("paymentApproved") === "1";
    if (!renewed && !paymentApproved) return;
    const timeoutId = window.setTimeout(() => {
      setIsSuccessModalOpen(true);
      void mutate();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [mutate, searchParams]);

  const navigateToPlans = useCallback(() => {
    const target = buildBrowserRoutingTargetFromInternalPath("/servers/plans");
    if (!target.sameOrigin) {
      window.location.assign(target.href);
      return;
    }
    router.push(target.path);
  }, [router]);

  const openRenewalModal = useCallback(() => {
    setRenewalError(null);
    setIsRenewalModalOpen(true);
  }, []);

  const closeRenewalModal = useCallback(() => {
    if (isRedirectingRenewal) return;
    setIsRenewalModalOpen(false);
    setRenewalError(null);
  }, [isRedirectingRenewal]);

  const confirmRenewal = useCallback(() => {
    if (!renewalHref) {
      setRenewalError("Nao foi possivel montar o checkout de renovacao para este plano.");
      return;
    }
    setIsRedirectingRenewal(true);
    window.location.assign(renewalHref);
  }, [renewalHref]);

  const closeSuccessModal = useCallback(() => {
    setIsSuccessModalOpen(false);
    router.replace("/account/plans", { scroll: false });
  }, [router]);

  if (loading) {
    return (
      <div className="mt-[28px] space-y-[16px]">
        <div className="flowdesk-shimmer h-[238px] w-full rounded-[24px] border border-[#141414] bg-[#0A0A0A]" />
        <div className="grid gap-[14px] lg:grid-cols-2">
          <div className="flowdesk-shimmer h-[220px] rounded-[22px] border border-[#141414] bg-[#0A0A0A]" />
          <div className="flowdesk-shimmer h-[220px] rounded-[22px] border border-[#141414] bg-[#0A0A0A]" />
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="mt-[28px] flex flex-col items-center justify-center rounded-[20px] border border-[#141414] bg-[#090909] px-[20px] py-[42px] text-center">
        <div className="flex h-[48px] w-[48px] items-center justify-center rounded-full bg-[#111111]">
          <BadgePercent className="h-[23px] w-[23px] text-[#888888]" />
        </div>
        <p className="mt-[16px] text-[15px] font-medium text-[#E5E5E5]">
          {error ? "Nao foi possivel carregar seu plano" : "Nenhum plano encontrado"}
        </p>
        {error ? (
          <p className="mt-[7px] max-w-[520px] text-[13px] leading-[1.5] text-[#777777]">
            {String(error)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="mt-[28px] space-y-[18px]">
        <section className="overflow-hidden rounded-[24px] border border-[#141414] bg-[#0A0A0A]">
          <div className="flex flex-col gap-[22px] px-[22px] py-[22px] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-[18px]">
              <div
                className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-[20px] border border-[rgba(255,255,255,0.05)]"
                style={{ backgroundColor: config.bg }}
              >
                <PlanIcon className="h-[32px] w-[32px]" style={{ color: config.color }} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-[10px]">
                  <h2 className="truncate text-[26px] font-semibold tracking-[-0.04em] text-white">
                    {plan.planName}
                  </h2>
                  <StatusBadge status={plan.status} />
                </div>
                <p className="mt-[7px] max-w-[540px] text-[14px] leading-[1.55] text-[#838383]">
                  {config.description}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-[8px] sm:flex-row">
              <button
                type="button"
                onClick={navigateToPlans}
                className="inline-flex h-[44px] items-center justify-center gap-[9px] rounded-[13px] border border-[#1A1A1A] bg-[#111111] px-[15px] text-[13px] font-semibold text-[#E8E8E8] transition-colors hover:border-[#262626] hover:bg-[#151515]"
              >
                <ArrowRightLeft className="h-[16px] w-[16px]" />
                Gerenciar Plano
              </button>
              <button
                type="button"
                onClick={openRenewalModal}
                disabled={!canRenewPlan}
                className="inline-flex h-[44px] items-center justify-center gap-[9px] rounded-[13px] bg-[#0062FF] px-[15px] text-[13px] font-semibold text-white transition-colors hover:bg-[#146FFF] disabled:cursor-not-allowed disabled:opacity-45"
                title={canRenewPlan ? "Renovar plano atual" : "Apenas planos pagos ativos ou expirados podem ser renovados."}
              >
                <RefreshCcw className="h-[16px] w-[16px]" />
                Renovar Plano
              </button>
            </div>
          </div>

          <div className="grid border-t border-[#141414] md:grid-cols-4">
            <div className="border-b border-[#141414] px-[22px] py-[17px] md:border-b-0 md:border-r">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5E5E5E]">Vencimento</p>
              <p className={`mt-[8px] text-[15px] font-semibold ${plan.status === "expired" ? "text-[#E99999]" : "text-[#EFEFEF]"}`}>
                {formatDate(plan.expiresAt)}
              </p>
              <p className="mt-[4px] text-[12px] text-[#707070]">{getExpirationSummary(plan)}</p>
            </div>
            <div className="border-b border-[#141414] px-[22px] py-[17px] md:border-b-0 md:border-r">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5E5E5E]">Assinatura</p>
              <p className="mt-[8px] text-[15px] font-semibold text-[#EFEFEF]">{formatDate(plan.activatedAt)}</p>
              <p className="mt-[4px] text-[12px] text-[#707070]">Data original preservada</p>
            </div>
            <div className="border-b border-[#141414] px-[22px] py-[17px] md:border-b-0 md:border-r">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5E5E5E]">Ciclo</p>
              <p className="mt-[8px] text-[15px] font-semibold text-[#EFEFEF]">
                {plan.billingCycleDays > 0 ? `${plan.billingCycleDays} dias` : "Sem ciclo"}
              </p>
              <p className="mt-[4px] text-[12px] text-[#707070]">{formatMoney(plan.amount, plan.currency)}</p>
            </div>
            <div className="px-[22px] py-[17px]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5E5E5E]">Servidores</p>
              <p className="mt-[8px] text-[15px] font-semibold text-[#EFEFEF]">
                {usage ? `${usage.licensedServersCount} de ${formatLimit(usage.maxLicensedServers)}` : formatLimit(plan.maxLicensedServers)}
              </p>
              <p className="mt-[4px] text-[12px] text-[#707070]">
                {usage?.canAddMoreServers ? "Ainda ha cota disponivel" : "Cota atual atingida"}
              </p>
            </div>
          </div>
        </section>

        <div className="grid gap-[18px] lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <section className="rounded-[22px] border border-[#141414] bg-[#0A0A0A] p-[22px]">
            <div className="flex items-center gap-[11px]">
              <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px] bg-[#111111] text-[#BDBDBD]">
                <Activity className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-[16px] font-semibold text-[#F0F0F0]">Uso do plano</h3>
                <p className="mt-[3px] text-[12px] text-[#6D6D6D]">Cota vinculada a sua assinatura atual.</p>
              </div>
            </div>

            <div className="mt-[20px]">
              <div className="mb-[9px] flex items-center justify-between gap-[12px]">
                <span className="text-[13px] font-medium text-[#A6A6A6]">Servidores licenciados</span>
                <span className="text-[13px] font-semibold text-[#EDEDED]">
                  {usage ? `${usage.licensedServersCount}/${formatLimit(usage.maxLicensedServers)}` : "0"}
                </span>
              </div>
              <div className="h-[8px] overflow-hidden rounded-full bg-[#141414]">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${usagePercent}%`, backgroundColor: config.color }}
                />
              </div>
            </div>

            <div className="mt-[18px] grid gap-[10px] sm:grid-cols-2">
              <div className="rounded-[16px] border border-[#151515] bg-[#080808] px-[14px] py-[13px]">
                <div className="flex items-center gap-[8px] text-[#A6A6A6]">
                  <Clock3 className="h-[15px] w-[15px]" />
                  <span className="text-[12px] font-medium">Restante</span>
                </div>
                <p className="mt-[7px] text-[15px] font-semibold text-[#EFEFEF]">
                  {usage ? formatLimit(usage.remainingLicensedServers) : "Nao definido"}
                </p>
              </div>
              <div className="rounded-[16px] border border-[#151515] bg-[#080808] px-[14px] py-[13px]">
                <div className="flex items-center gap-[8px] text-[#A6A6A6]">
                  <Sparkles className="h-[15px] w-[15px]" />
                  <span className="text-[12px] font-medium">Status</span>
                </div>
                <p className="mt-[7px] text-[15px] font-semibold text-[#EFEFEF]">
                  {usage?.hasReachedLicensedServersLimit ? "No limite" : "Operacional"}
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-[22px] border border-[#141414] bg-[#0A0A0A] p-[22px]">
            <div className="flex items-center gap-[11px]">
              <span className="flex h-[36px] w-[36px] items-center justify-center rounded-[11px] bg-[#111111] text-[#BDBDBD]">
                <CheckCircle2 className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-[16px] font-semibold text-[#F0F0F0]">Beneficios incluidos</h3>
                <p className="mt-[3px] text-[12px] text-[#6D6D6D]">Recursos liberados no seu nivel atual.</p>
              </div>
            </div>

            <div className="mt-[18px] grid gap-[9px]">
              {config.features.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-[12px] rounded-[15px] border border-[#151515] bg-[#080808] px-[14px] py-[12px]"
                >
                  <span className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[rgba(52,168,83,0.10)] text-[#7BD88F]">
                    <CheckCircle2 className="h-[14px] w-[14px]" />
                  </span>
                  <span className="text-[13px] font-medium text-[#D8D8D8]">{feature}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <RenewalModal
        isOpen={isRenewalModalOpen}
        plan={plan}
        config={config}
        renewalHref={renewalHref}
        isRedirecting={isRedirectingRenewal}
        error={renewalError}
        onClose={closeRenewalModal}
        onConfirm={confirmRenewal}
      />
      <RenewalSuccessModal isOpen={isSuccessModalOpen} onClose={closeSuccessModal} />
    </>
  );
}
