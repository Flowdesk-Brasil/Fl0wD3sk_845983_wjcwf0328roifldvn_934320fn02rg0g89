"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Minus } from "lucide-react";
import { animate } from "motion";
import { LandingActionButton } from "@/components/landing/LandingActionButton";
import { LandingGlowTag } from "@/components/landing/LandingGlowTag";
import { LandingReveal } from "@/components/landing/LandingReveal";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import type { AccountPlanUsageSnapshot } from "@/lib/plans/accountPlanUsage";
import {
  buildConfigCheckoutPath,
  formatPlanUsageLimit,
  getAllPlanPricingDefinitions,
  getAvailableBillingPeriodsForPlan,
  type PlanBillingPeriodCode,
  type PlanPricingDefinition,
} from "@/lib/plans/catalog";

type CurrentPlanSnapshot = {
  planCode: string;
  planName: string;
  status: "inactive" | "trial" | "active" | "expired";
  billingCycleDays: number;
  maxLicensedServers: number;
  expiresAt: string | null;
};

type Props = {
  displayName: string;
  currentPlan: CurrentPlanSnapshot | null;
  usage: AccountPlanUsageSnapshot;
  reason?: string | null;
};

const PLAN_FEATURE_ICON_SOURCES = [
  "/cdn/icons/discord-icon.svg",
  "/cdn/icons/ticket-icon.svg",
  "/cdn/icons/star-icon.svg",
  "/cdn/icons/plugin-icon.svg",
] as const;

function formatMoney(amount: number, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(amount * 100) / 100);
}

function formatDateLabel(value: string | null) {
  if (!value) return "Sem data definida";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Sem data definida";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(parsed));
}

function resolveInitialBillingPeriodCode(
  currentPlan: CurrentPlanSnapshot | null,
): PlanBillingPeriodCode {
  if (!currentPlan || currentPlan.planCode === "basic") return "monthly";
  if (currentPlan.billingCycleDays === 90) return "quarterly";
  if (currentPlan.billingCycleDays === 180) return "semiannual";
  if (currentPlan.billingCycleDays === 365) return "annual";
  return "monthly";
}

function resolveCycleLabel(currentPlan: CurrentPlanSnapshot | null) {
  if (!currentPlan) return "Escolha um plano";
  if (currentPlan.planCode === "basic") return "Teste de 7 dias";
  if (currentPlan.billingCycleDays === 90) return "Trimestral";
  if (currentPlan.billingCycleDays === 180) return "Semestral";
  if (currentPlan.billingCycleDays === 365) return "Anual";
  return "Mensal";
}

function resolveStatusLabel(status: CurrentPlanSnapshot["status"] | null) {
  if (status === "active") return "Ativo";
  if (status === "trial") return "Teste ativo";
  if (status === "expired") return "Expirado";
  return "Sem assinatura";
}

function resolveStatusClass(status: CurrentPlanSnapshot["status"] | null) {
  if (status === "active") return "border-[rgba(0,98,255,0.32)] bg-[rgba(0,98,255,0.12)] text-[#8CB7FF]";
  if (status === "trial") return "border-[rgba(70,166,110,0.28)] bg-[rgba(70,166,110,0.12)] text-[#98D7AF]";
  if (status === "expired") return "border-[rgba(242,200,35,0.28)] bg-[rgba(242,200,35,0.12)] text-[#E9D06B]";
  return "border-[#1A1A1A] bg-[#101010] text-[#8B8B8B]";
}

function matchesCurrentPlan(currentPlan: CurrentPlanSnapshot | null, plan: PlanPricingDefinition) {
  return Boolean(currentPlan && currentPlan.planCode === plan.code);
}

function isActiveCurrentPlan(currentPlan: CurrentPlanSnapshot | null, plan: PlanPricingDefinition) {
  return Boolean(
    currentPlan &&
      currentPlan.planCode === plan.code &&
      (currentPlan.status === "active" || currentPlan.status === "trial"),
  );
}

function AnimatedMoneyAmount({
  value,
  currency,
  className,
}: {
  value: number;
  currency: string;
  className?: string;
}) {
  const spanRef = useRef<HTMLSpanElement | null>(null);
  const currentValueRef = useRef(value);

  useEffect(() => {
    const node = spanRef.current;
    if (!node) return;
    const controls = animate(currentValueRef.current, value, {
      type: "spring",
      stiffness: 240,
      damping: 26,
      mass: 0.9,
      onUpdate: (latest) => {
        node.textContent = formatMoney(latest, currency);
      },
    });
    currentValueRef.current = value;
    return () => controls.stop();
  }, [currency, value]);

  return <span ref={spanRef} className={className}>{formatMoney(value, currency)}</span>;
}

function BillingPeriodSwitcher({ value, onChange }: { value: PlanBillingPeriodCode; onChange: (value: PlanBillingPeriodCode) => void; }) {
  const periods = getAvailableBillingPeriodsForPlan("pro");
  return (
    <div className="mx-auto inline-flex flex-wrap justify-center gap-[8px] rounded-full border border-[rgba(255,255,255,0.08)] bg-[rgba(10,10,10,0.92)] p-[6px] shadow-[0_20px_60px_rgba(0,0,0,0.26)]">
      {periods.map((period) => {
        const isSelected = period.code === value;
        return (
          <button
            key={period.code}
            type="button"
            onClick={() => onChange(period.code)}
            className={`inline-flex h-[42px] items-center justify-center rounded-full px-[16px] text-[13px] font-semibold transition-all duration-200 ${
              isSelected
                ? "bg-[linear-gradient(180deg,#0062FF_0%,#0150CA_100%)] text-white shadow-[0_12px_28px_rgba(0,98,255,0.28)]"
                : "bg-transparent text-[rgba(218,218,218,0.62)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[rgba(255,255,255,0.88)]"
            }`}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}

function PlanCta({
  plan,
  currentPlan,
  pendingKey,
  onStartNavigation,
}: {
  plan: PlanPricingDefinition;
  currentPlan: CurrentPlanSnapshot | null;
  pendingKey: string | null;
  onStartNavigation: (key: string) => void;
}) {
  const isCurrent = isActiveCurrentPlan(currentPlan, plan);
  const key = `${plan.code}:${plan.billingPeriodCode}`;
  const href = `${buildConfigCheckoutPath({ planCode: plan.code, billingPeriodCode: plan.billingPeriodCode })}?fresh=1&source=servers-plans`;
  return (
    <LandingActionButton
      href={isCurrent ? undefined : href}
      variant="light"
      className="mt-[20px] h-[50px] w-full rounded-[12px] px-6 text-[16px]"
      disabled={isCurrent}
      onClick={() => {
        if (!isCurrent) onStartNavigation(key);
      }}
    >
      {isCurrent ? "Plano atual" : pendingKey === key ? <ButtonLoader size={18} colorClassName="text-[#2B2B2B]" /> : "Escolher plano"}
    </LandingActionButton>
  );
}

function PlanCard({
  plan,
  currentPlan,
  pendingKey,
  onStartNavigation,
  compact = false,
}: {
  plan: PlanPricingDefinition;
  currentPlan: CurrentPlanSnapshot | null;
  pendingKey: string | null;
  onStartNavigation: (key: string) => void;
  compact?: boolean;
}) {
  const currentBadge = matchesCurrentPlan(currentPlan, plan)
    ? currentPlan?.status === "expired"
      ? "ULTIMO PLANO"
      : "PLANO ATUAL"
    : null;

  return (
    <article className={`relative overflow-hidden rounded-[24px] border ${matchesCurrentPlan(currentPlan, plan) ? "border-[rgba(0,98,255,0.26)] bg-[#090D14]" : "border-[#101010] bg-[#0A0A0A]"} px-[20px] pb-[18px] pt-[20px]`}>
      <div className="absolute right-[20px] top-[20px] flex items-center gap-[8px]">
        {currentBadge ? <span className="rounded-[8px] border border-[rgba(255,255,255,0.08)] bg-[#111111] px-[10px] py-[6px] text-[10px] font-semibold tracking-[0.08em] text-[#CFCFCF]">{currentBadge}</span> : null}
        <span className="rounded-[8px] bg-[#0062FF] px-[14px] py-[6px] text-[13px] font-medium text-white">{plan.badge}</span>
      </div>

      <div className="mt-[28px]">
        <h3 className="max-w-[220px] text-[22px] leading-none font-normal text-[rgba(218,218,218,0.92)]">{plan.name}</h3>
        <p className="mt-[14px] text-[16px] leading-none text-[rgba(255,255,255,0.2)] line-through">{formatMoney(plan.compareMonthlyAmount, plan.currency)}</p>
        <div className="mt-[10px] flex items-baseline gap-[4px] pb-[4px]">
          <AnimatedMoneyAmount value={plan.monthlyAmount} currency={plan.currency} className={`${compact ? "text-[30px]" : "text-[35px]"} leading-[1.02] font-semibold tracking-[-0.04em] text-[rgba(255,255,255,0.5)]`} />
          <span className={`${compact ? "text-[15px]" : "text-[17px]"} leading-[1.02] font-semibold text-[rgba(255,255,255,0.5)]`}>{plan.billingLabel}</span>
        </div>
      </div>

      <div className="mt-[14px] flex min-h-[24px] items-center justify-center rounded-[8px] bg-[#111111] px-[12px] text-center text-[12px] font-medium text-[#0062FF]">
        {plan.cycleBadge || plan.limitedOffer}
      </div>

      <PlanCta plan={plan} currentPlan={currentPlan} pendingKey={pendingKey} onStartNavigation={onStartNavigation} />

      {!compact ? (
        <>
          <p className="mt-[16px] min-h-[48px] text-[13px] leading-[1.22] text-[rgba(218,218,218,0.3)]">{plan.description}</p>
          <div className="mt-[18px] h-px w-full bg-[rgba(255,255,255,0.04)]" />
          <div className="mt-[18px] flex flex-col gap-[14px]">
            {plan.features.map((feature, featureIndex) => (
              <div key={`${plan.name}-${featureIndex}`} className="flex items-center gap-[10px]">
                <Image src={PLAN_FEATURE_ICON_SOURCES[featureIndex] ?? PLAN_FEATURE_ICON_SOURCES[0]} alt="" width={16} height={16} className="h-[16px] w-[16px] object-contain" draggable={false} />
                <span className="text-[14px] leading-none font-medium text-[rgba(218,218,218,0.34)]">{feature}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </article>
  );
}

function ComparisonCell({ value, highlighted }: { value: string | boolean; highlighted: boolean; }) {
  if (typeof value === "boolean") {
    return <div className="flex min-h-[72px] items-center justify-center px-[14px] py-[18px]">{value ? <Check className={`h-[18px] w-[18px] ${highlighted ? "text-[#8CB7FF]" : "text-[#6DA9FF]"}`} strokeWidth={2.35} /> : <Minus className="h-[18px] w-[18px] text-[#555555]" strokeWidth={2.2} />}</div>;
  }
  return <div className="flex min-h-[72px] items-center justify-center px-[14px] py-[18px] text-center"><span className={`text-[14px] leading-[1.5] ${highlighted ? "font-semibold text-[#E8F1FF]" : "text-[#AEB4BF]"}`}>{value}</span></div>;
}

export function ServersPlansUpgradePage({ displayName, currentPlan, usage, reason }: Props) {
  const [selectedBillingPeriodCode, setSelectedBillingPeriodCode] = useState<PlanBillingPeriodCode>(() => resolveInitialBillingPeriodCode(currentPlan));
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const plans = useMemo(() => getAllPlanPricingDefinitions(selectedBillingPeriodCode), [selectedBillingPeriodCode]);
  const limitReached = usage.hasReachedLicensedServersLimit;
  const heroTitle = currentPlan ? (limitReached || reason === "server-limit" ? "Seu plano atual chegou ao limite de servidores" : "Atualize os limites da sua conta quando precisar escalar") : "Escolha o plano ideal para ativar sua conta";

  const comparisonRows = [
    { label: "Servidores licenciados", helper: "Quantidade de servidores ativos por conta.", values: plans.map((plan) => formatPlanUsageLimit(plan.entitlements.maxLicensedServers)) },
    { label: "Tickets ativos", helper: "Capacidade simultanea de tickets.", values: plans.map((plan) => formatPlanUsageLimit(plan.entitlements.maxActiveTickets)) },
    { label: "Automacoes liberadas", helper: "Automacoes disponiveis no plano.", values: plans.map((plan) => formatPlanUsageLimit(plan.entitlements.maxAutomations)) },
    { label: "Acoes mensais", helper: "Volume mensal agregado da conta.", values: plans.map((plan) => formatPlanUsageLimit(plan.entitlements.maxMonthlyActions)) },
    { label: "Multi-servidor", helper: "Se o plano cresce bem para mais de um servidor.", values: plans.map((plan) => plan.entitlements.maxLicensedServers > 1) },
    { label: "Periodo do ciclo", helper: "Duracao da cobranca no checkout atual.", values: plans.map((plan) => plan.isTrial ? "Teste de 7 dias" : plan.billingPeriodLabel) },
    { label: "Valor do ciclo", helper: "Valor total desse checkout.", values: plans.map((plan) => formatMoney(plan.totalAmount, plan.currency)) },
    { label: "Melhor para", helper: "Perfil mais indicado para cada camada.", values: plans.map((plan) => plan.code === "basic" ? "Testes iniciais" : plan.code === "pro" ? "Operacao enxuta" : plan.code === "ultra" ? "Times multi-servidor" : "Escala maxima") },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(0,98,255,0.16)_0%,transparent_34%),radial-gradient(circle_at_top_right,rgba(255,255,255,0.06)_0%,transparent_30%)]" />
      <div className="relative z-10 mx-auto w-full max-w-[1582px] px-[18px] pb-[120px] pt-[28px] md:px-[28px] md:pt-[38px]">
        <LandingReveal delay={70}>
          <Link href="/servers" className="inline-flex items-center gap-[10px] rounded-full border border-[#151515] bg-[#0A0A0A] px-[16px] py-[12px] text-[13px] font-medium text-[#C8C8C8] transition-colors hover:border-[#232323] hover:bg-[#101010] hover:text-[#F1F1F1]">
            <ArrowLeft className="h-[16px] w-[16px]" strokeWidth={2.1} />
            Voltar para servidores
          </Link>
        </LandingReveal>

        <div className="mt-[24px] grid gap-[18px] xl:grid-cols-[minmax(0,1.2fr)_420px]">
          <LandingReveal delay={120}>
            <div className="rounded-[30px] border border-[#101010] bg-[rgba(10,10,10,0.92)] px-[24px] py-[28px] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
              <LandingGlowTag className="px-[20px]">{limitReached || reason === "server-limit" ? "Limite da conta atingido" : "Planos da conta"}</LandingGlowTag>
              <h1 className="mt-[18px] max-w-[860px] bg-[linear-gradient(90deg,#F2F2F2_0%,#BFC9D6_100%)] bg-clip-text text-[34px] leading-[1.04] font-normal tracking-[-0.05em] text-transparent md:text-[48px]">{heroTitle}</h1>
              <p className="mt-[16px] max-w-[820px] text-[15px] leading-[1.7] text-[#7E7E7E]">
                {currentPlan
                  ? limitReached || reason === "server-limit"
                    ? `Sua conta de ${displayName} ja usa ${usage.licensedServersCount} de ${usage.maxLicensedServers} servidor(es) liberados no ${currentPlan.planName}. Para adicionar outro servidor, primeiro atualize o plano da conta.`
                    : "O crescimento agora acontece na conta. Quando voce precisar de mais capacidade, escolha um plano acima e continue expandindo sem voltar para o onboarding inicial."
                  : "Escolha um plano para ativar a conta e centralizar os limites de todos os servidores no mesmo fluxo."}
              </p>
            </div>
          </LandingReveal>

          <LandingReveal delay={180}>
            <div className="rounded-[30px] border border-[#101010] bg-[rgba(10,10,10,0.92)] p-[22px] shadow-[0_28px_90px_rgba(0,0,0,0.42)]">
              <div className="flex items-start justify-between gap-[12px]">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#666666]">Seu plano atual</p>
                  <h2 className="mt-[10px] text-[28px] leading-none font-medium tracking-[-0.05em] text-[#EFEFEF]">{currentPlan?.planName || "Nenhum plano ativo"}</h2>
                </div>
                <span className={`inline-flex items-center justify-center rounded-full border px-[12px] py-[8px] text-[11px] font-semibold tracking-[0.08em] ${resolveStatusClass(currentPlan?.status || null)}`}>{resolveStatusLabel(currentPlan?.status || null)}</span>
              </div>
              <div className="mt-[18px] grid gap-[10px] sm:grid-cols-2">
                <div className="rounded-[18px] border border-[#131313] bg-[#080808] px-[16px] py-[16px]"><p className="text-[11px] uppercase tracking-[0.16em] text-[#666666]">Servidores em uso</p><p className="mt-[10px] text-[18px] leading-none font-medium tracking-[-0.04em] text-[#E6E6E6]">{usage.licensedServersCount}/{Math.max(usage.maxLicensedServers, 1)}</p></div>
                <div className="rounded-[18px] border border-[#131313] bg-[#080808] px-[16px] py-[16px]"><p className="text-[11px] uppercase tracking-[0.16em] text-[#666666]">Ciclo atual</p><p className="mt-[10px] text-[18px] leading-none font-medium tracking-[-0.04em] text-[#E6E6E6]">{resolveCycleLabel(currentPlan)}</p></div>
                <div className="rounded-[18px] border border-[#131313] bg-[#080808] px-[16px] py-[16px]"><p className="text-[11px] uppercase tracking-[0.16em] text-[#666666]">Expira em</p><p className="mt-[10px] text-[18px] leading-none font-medium tracking-[-0.04em] text-[#E6E6E6]">{formatDateLabel(currentPlan?.expiresAt || null)}</p></div>
                <div className="rounded-[18px] border border-[#131313] bg-[#080808] px-[16px] py-[16px]"><p className="text-[11px] uppercase tracking-[0.16em] text-[#666666]">Espaco restante</p><p className="mt-[10px] text-[18px] leading-none font-medium tracking-[-0.04em] text-[#E6E6E6]">{usage.remainingLicensedServers}</p></div>
              </div>
            </div>
          </LandingReveal>
        </div>

        <section className="mt-[62px]">
          <LandingReveal delay={220}>
            <h2 className="mx-auto max-w-[1124px] bg-[linear-gradient(90deg,#DADADA_0%,#C1C1C1_100%)] bg-clip-text text-center text-[34px] leading-[1.08] font-normal tracking-[-0.04em] text-transparent sm:text-[40px] md:text-[46px] lg:text-[50px]">Aproveite nossas maiores ofertas</h2>
          </LandingReveal>
          <LandingReveal delay={300}>
            <div className="relative z-40 mt-[28px] flex w-full justify-center">
              <BillingPeriodSwitcher value={selectedBillingPeriodCode} onChange={setSelectedBillingPeriodCode} />
            </div>
          </LandingReveal>
          <div className="mx-auto mt-[32px] grid w-full max-w-[372px] grid-cols-1 gap-x-[12px] gap-y-[26px] min-[900px]:max-w-[756px] min-[900px]:grid-cols-2 min-[1580px]:max-w-none min-[1580px]:grid-cols-4">
            {plans.map((plan) => <PlanCard key={`${plan.code}-${plan.billingPeriodCode}`} plan={plan} currentPlan={currentPlan} pendingKey={pendingKey} onStartNavigation={setPendingKey} />)}
          </div>
        </section>

        <section className="mt-[84px]">
          <LandingReveal delay={430}>
            <div className="max-w-[920px]">
              <LandingGlowTag className="px-[20px]">Compare os limites da conta</LandingGlowTag>
              <h2 className="mt-[18px] text-[30px] leading-[1.08] font-normal tracking-[-0.05em] text-[#EFEFEF] md:text-[40px]">Veja exatamente o que muda quando voce sobe de plano</h2>
              <p className="mt-[14px] text-[15px] leading-[1.7] text-[#7E7E7E]">Nesta tela os cards continuam no mesmo visual, e ao descer voce continua vendo a parte principal de cada plano enquanto compara os limites da conta.</p>
            </div>
          </LandingReveal>

          <div className="mt-[28px] overflow-x-auto pb-[8px]">
            <div className="min-w-[1220px]">
              <div className="sticky top-[18px] z-[40] grid grid-cols-[290px_repeat(4,minmax(0,1fr))] gap-[12px] bg-[linear-gradient(180deg,rgba(5,5,5,0.98)_0%,rgba(5,5,5,0.88)_100%)] pb-[16px] pt-[8px] backdrop-blur-[16px]">
                <div className="rounded-[24px] border border-[#101010] bg-[#090909] px-[18px] py-[18px]">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[#666666]">Resumo da conta</p>
                  <h3 className="mt-[10px] text-[24px] leading-none font-medium tracking-[-0.05em] text-[#ECECEC]">{usage.licensedServersCount}/{Math.max(usage.maxLicensedServers, 1)}</h3>
                  <p className="mt-[12px] text-[13px] leading-[1.6] text-[#7C7C7C]">Servidores licenciados em uso no plano atual. Quando o numero encosta no limite, o proximo servidor exige upgrade.</p>
                </div>
                {plans.map((plan) => <PlanCard key={`compact-${plan.code}-${plan.billingPeriodCode}`} plan={plan} currentPlan={currentPlan} pendingKey={pendingKey} onStartNavigation={setPendingKey} compact />)}
              </div>

              <div className="mt-[8px] overflow-hidden rounded-[28px] border border-[#111111] bg-[#090909]">
                {comparisonRows.map((row, rowIndex) => (
                  <div key={row.label} className={`grid grid-cols-[290px_repeat(4,minmax(0,1fr))] ${rowIndex === comparisonRows.length - 1 ? "" : "border-b border-[#111111]"}`}>
                    <div className="border-r border-[#111111] px-[24px] py-[18px]">
                      <p className="text-[15px] font-medium text-[#E7E7E7]">{row.label}</p>
                      <p className="mt-[8px] text-[12px] leading-[1.6] text-[#6F6F6F]">{row.helper}</p>
                    </div>
                    {row.values.map((value, index) => (
                      <div key={`${row.label}-${plans[index]?.code}`} className={`border-r border-[#111111] last:border-r-0 ${matchesCurrentPlan(currentPlan, plans[index]) ? "bg-[rgba(0,98,255,0.06)]" : ""}`}>
                        <ComparisonCell value={value} highlighted={matchesCurrentPlan(currentPlan, plans[index])} />
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
