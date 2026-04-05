"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  buildCookieConsentPreferences,
  COOKIE_CONSENT_COOKIE_NAME,
  COOKIE_CONSENT_MAX_AGE_SECONDS,
  type CookieConsentPreferences,
  parseCookieConsent,
  REQUIRED_ONLY_COOKIE_CONSENT,
  serializeCookieConsent,
} from "@/lib/cookies/consent";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal/content";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

type CookieConsentManagerProps = {
  initialConsentValue?: string | null;
};

type CookieCategory = {
  key: "essential" | "preferences" | "analytics" | "marketing";
  title: string;
  shortLabel: string;
  description: string;
  helper: string;
  statusOnLabel: string;
  statusOffLabel?: string;
  locked?: boolean;
};

const cookieCategories: CookieCategory[] = [
  {
    key: "essential",
    title: "Cookies obrigatorios",
    shortLabel: "Essenciais",
    description:
      "Mantem login, seguranca da sessao, continuidade do checkout, antifraude, estabilidade do painel e o proprio registro desta escolha.",
    helper: "Base tecnica da plataforma. Sempre ativos.",
    statusOnLabel: "Sempre ativo",
    locked: true,
  },
  {
    key: "preferences",
    title: "Cookies de preferencia",
    shortLabel: "Preferencias",
    description:
      "Guardam escolhas opcionais de interface e pequenos refinamentos de experiencia quando esses recursos estiverem disponiveis.",
    helper: "Pode ser desligado sem bloquear o uso principal.",
    statusOnLabel: "Ativado",
    statusOffLabel: "Desativado",
  },
  {
    key: "analytics",
    title: "Cookies de analise",
    shortLabel: "Analise",
    description:
      "Reservados para metricas tecnicas anonimizadas e leitura de desempenho quando a Flowdesk ativar observabilidade opcional.",
    helper: "Mantido desligado por padrao.",
    statusOnLabel: "Ativado",
    statusOffLabel: "Desativado",
  },
  {
    key: "marketing",
    title: "Cookies de comunicacao",
    shortLabel: "Comunicacao",
    description:
      "Reservados para campanhas, personalizacao comercial e comunicacoes promocionais futuras, caso esses recursos sejam ativados.",
    helper: "Mantido desligado por padrao.",
    statusOnLabel: "Ativado",
    statusOffLabel: "Desativado",
  },
];

function CookieToggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (nextChecked: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      aria-disabled={disabled}
      disabled={disabled}
      onClick={() => {
        if (!disabled) {
          onChange?.(!checked);
        }
      }}
      className={`relative inline-flex h-8 w-[56px] shrink-0 items-center rounded-full border transition-all duration-200 ${
        checked
          ? "border-[#E8E8E8] bg-[#E8E8E8]"
          : "border-[#262626] bg-[#0A0A0A]"
      } ${
        disabled
          ? "cursor-not-allowed opacity-90"
          : "cursor-pointer hover:border-[#3B3B3B]"
      }`}
    >
      <span
        className={`block h-6 w-6 rounded-full transition-transform duration-200 ${
          checked ? "translate-x-[26px] bg-[#0A0A0A]" : "translate-x-1 bg-[#DEDEDE]"
        }`}
      />
    </button>
  );
}

function resolveOptionalCategoryCount(consent: CookieConsentPreferences | null) {
  if (!consent) return 0;

  return [consent.preferences, consent.analytics, consent.marketing].filter(
    Boolean,
  ).length;
}

function resolveConsentSummary(consent: CookieConsentPreferences | null) {
  const enabledOptionalCount = resolveOptionalCategoryCount(consent);

  if (!consent || enabledOptionalCount === 0) {
    return {
      badge: "Essenciais",
      title: "Somente o necessario",
      helper: "Apenas os cookies obrigatorios seguem ativos.",
    };
  }

  if (enabledOptionalCount === 3) {
    return {
      badge: "Completo",
      title: "Todas as categorias ativas",
      helper: "Preferencias, analise e comunicacao foram liberadas.",
    };
  }

  return {
    badge: "Personalizado",
    title: `${enabledOptionalCount} categoria${enabledOptionalCount > 1 ? "s" : ""} opcional${enabledOptionalCount > 1 ? "s" : ""} ativa${enabledOptionalCount > 1 ? "s" : ""}`,
    helper: "Sua escolha foi salva e pode ser ajustada a qualquer momento.",
  };
}

export function CookieConsentManager({
  initialConsentValue,
}: CookieConsentManagerProps) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<CookieConsentPreferences | null>(() =>
    parseCookieConsent(initialConsentValue),
  );
  const [draftConsent, setDraftConsent] = useState<CookieConsentPreferences>(() =>
    parseCookieConsent(initialConsentValue) ?? REQUIRED_ONLY_COOKIE_CONSENT,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  useBodyScrollLock(isModalOpen);

  const hasDecision = consent !== null;
  const isDashboardRoute =
    pathname.startsWith("/config") || pathname.startsWith("/servers");

  const bannerBottomClass = useMemo(() => {
    if (isDashboardRoute) {
      return "bottom-[74px] sm:bottom-[82px]";
    }

    return "bottom-5 sm:bottom-6";
  }, [isDashboardRoute]);

  const floatingButtonBottomClass = bannerBottomClass;

  const consentSummary = useMemo(() => resolveConsentSummary(consent), [consent]);

  const lastUpdatedLabel = useMemo(() => {
    if (!consent?.updatedAt) {
      return "Ainda nao definido";
    }

    const parsedDate = new Date(consent.updatedAt);
    if (Number.isNaN(parsedDate.getTime())) {
      return "Ainda nao definido";
    }

    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(parsedDate);
  }, [consent]);

  const persistConsent = useCallback((nextConsent: CookieConsentPreferences) => {
    const serialized = serializeCookieConsent(nextConsent);
    const secureAttribute =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : "";

    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${serialized}; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax; Priority=Low${secureAttribute}`;

    setConsent(nextConsent);
    setDraftConsent(nextConsent);
    setIsModalOpen(false);

    window.dispatchEvent(
      new CustomEvent("flowdesk:cookie-consent-updated", {
        detail: nextConsent,
      }),
    );
  }, []);

  const handleConfirmRequiredOnly = useCallback(() => {
    persistConsent(buildCookieConsentPreferences(REQUIRED_ONLY_COOKIE_CONSENT));
  }, [persistConsent]);

  const handleAcceptAll = useCallback(() => {
    persistConsent(
      buildCookieConsentPreferences({
        essential: true,
        preferences: true,
        analytics: true,
        marketing: true,
      }),
    );
  }, [persistConsent]);

  const handleSaveCustomConsent = useCallback(() => {
    persistConsent(buildCookieConsentPreferences(draftConsent));
  }, [draftConsent, persistConsent]);

  const openModal = useCallback(() => {
    setDraftConsent(consent ?? REQUIRED_ONLY_COOKIE_CONSENT);
    setIsModalOpen(true);
  }, [consent]);

  const closeModal = useCallback(() => {
    setDraftConsent(consent ?? REQUIRED_ONLY_COOKIE_CONSENT);
    setIsModalOpen(false);
  }, [consent]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeModal, isModalOpen]);

  return (
    <>
      {!hasDecision ? (
        <div
          className={`pointer-events-none fixed left-1/2 z-50 w-[min(1040px,calc(100vw-24px))] -translate-x-1/2 ${bannerBottomClass}`}
        >
          <div className="pointer-events-auto flowdesk-scale-in-soft relative overflow-hidden rounded-[28px] shadow-[0_28px_90px_rgba(0,0,0,0.42)] backdrop-blur-[18px]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[28px] border border-[#0E0E0E]"
            />
            <span
              aria-hidden="true"
              className="flowdesk-tag-border-glow pointer-events-none absolute inset-[-2px] rounded-[28px]"
            />
            <span
              aria-hidden="true"
              className="flowdesk-tag-border-core pointer-events-none absolute inset-[-1px] rounded-[28px]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[1px] rounded-[27px] bg-[linear-gradient(180deg,rgba(9,9,9,0.985)_0%,rgba(5,5,5,0.985)_100%)]"
            />

            <div className="relative z-10 px-5 py-5 sm:px-6 sm:py-6">
              <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
                <div className="max-w-[700px]">
                  <div className="inline-flex rounded-full border border-[#171717] bg-[#0D0D0D] px-[14px] py-[8px] text-[11px] font-medium tracking-[0.18em] uppercase text-[#8B8B8B]">
                    Privacidade e cookies
                  </div>

                  <h2 className="mt-4 bg-[linear-gradient(90deg,#EFEFEF_0%,#C9C9C9_100%)] bg-clip-text text-[28px] leading-[0.98] font-normal tracking-[-0.06em] text-transparent sm:text-[34px]">
                    Escolha como a Flowdesk pode lembrar sua experiencia
                  </h2>

                  <p className="mt-4 text-[13px] leading-[1.75] text-[#8D8D8D] sm:text-[14px]">
                    Os cookies obrigatorios mantem login, seguranca, checkout e
                    antifraude. As demais categorias continuam desligadas ate
                    voce liberar manualmente. Sua escolha pode ser revista
                    depois nas preferencias de cookies.
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {cookieCategories.map((category) => {
                      const isActive =
                        category.key === "essential"
                          ? true
                          : Boolean(draftConsent[category.key]);

                      return (
                        <span
                          key={category.key}
                          className={`inline-flex items-center gap-2 rounded-full border px-[12px] py-[7px] text-[11px] font-medium ${
                            isActive
                              ? "border-[rgba(126,196,255,0.18)] bg-[rgba(18,26,39,0.92)] text-[#DCEEFF]"
                              : "border-[#171717] bg-[#0D0D0D] text-[#808080]"
                          }`}
                        >
                          <span className="text-[10px] uppercase tracking-[0.16em]">
                            {category.shortLabel}
                          </span>
                          <span className="text-[10px]">
                            {isActive
                              ? category.statusOnLabel
                              : category.statusOffLabel || "Desativado"}
                          </span>
                        </span>
                      );
                    })}
                  </div>

                  <p className="mt-4 text-[11px] leading-6 text-[#666666] sm:text-[12px]">
                    Saiba mais em{" "}
                    <Link
                      href={TERMS_PATH}
                      className="text-[#D9D9D9] underline underline-offset-4 transition hover:text-white"
                    >
                      termos
                    </Link>{" "}
                    e{" "}
                    <Link
                      href={PRIVACY_PATH}
                      className="text-[#D9D9D9] underline underline-offset-4 transition hover:text-white"
                    >
                      politica de privacidade
                    </Link>
                    .
                  </p>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[330px]">
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="group relative inline-flex h-[48px] items-center justify-center overflow-hidden rounded-[14px] px-5 text-[13px] font-semibold"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-[14px] bg-[linear-gradient(180deg,#FFFFFF_0%,#D4D4D4_100%)] transition-transform duration-150 ease-out group-hover:scale-[1.01] group-active:scale-[0.99]"
                    />
                    <span className="relative z-10 text-[#111111]">
                      Aceitar todas as categorias
                    </span>
                  </button>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleConfirmRequiredOnly}
                      className="inline-flex h-[46px] items-center justify-center rounded-[14px] border border-[#181818] bg-[#0D0D0D] px-4 text-[12px] font-medium text-[#D2D2D2] transition-colors hover:border-[#252525] hover:bg-[#111111] hover:text-white"
                    >
                      Somente essenciais
                    </button>
                    <button
                      type="button"
                      onClick={openModal}
                      className="inline-flex h-[46px] items-center justify-center rounded-[14px] border border-[#181818] bg-[#0A0A0A] px-4 text-[12px] font-medium text-[#D2D2D2] transition-colors hover:border-[#252525] hover:bg-[#111111] hover:text-white"
                    >
                      Personalizar categorias
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : !isModalOpen ? (
        <div
          className={`pointer-events-none fixed left-4 z-40 w-[min(340px,calc(100vw-32px))] ${floatingButtonBottomClass}`}
        >
          <button
            type="button"
            onClick={openModal}
            className="pointer-events-auto flowdesk-scale-in-soft relative w-full overflow-hidden rounded-[22px] text-left shadow-[0_22px_70px_rgba(0,0,0,0.32)] backdrop-blur-[18px]"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[22px] border border-[#121212]"
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-[1px] rounded-[21px] bg-[linear-gradient(180deg,rgba(10,10,10,0.98)_0%,rgba(6,6,6,0.98)_100%)]"
            />

            <div className="relative z-10 flex items-start gap-3 px-4 py-4">
              <div className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border border-[#171717] bg-[#0D0D0D] text-[11px] font-semibold uppercase tracking-[0.16em] text-[#CFCFCF]">
                CK
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6C6C6C]">
                    Cookies
                  </span>
                  <span className="rounded-full border border-[#181818] bg-[#0D0D0D] px-[8px] py-[3px] text-[10px] font-medium text-[#CFCFCF]">
                    {consentSummary.badge}
                  </span>
                </div>

                <p className="mt-[8px] text-[14px] font-medium tracking-[-0.03em] text-[#ECECEC]">
                  {consentSummary.title}
                </p>
                <p className="mt-[6px] text-[12px] leading-[1.6] text-[#7E7E7E]">
                  {consentSummary.helper}
                </p>
                <p className="mt-[8px] text-[11px] leading-none text-[#616161]">
                  Atualizado em {lastUpdatedLabel}
                </p>
              </div>
            </div>
          </button>
        </div>
      ) : null}

      {isModalOpen ? (
        <div
          className="fixed inset-0 z-[70] overflow-y-auto overscroll-contain bg-black/78 px-3 py-6 backdrop-blur-md sm:px-5"
          onClick={closeModal}
        >
          <div className="flex min-h-full items-center justify-center">
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Preferencias de cookies"
              className="flowdesk-stage-fade relative w-full max-w-[920px] overflow-hidden rounded-[32px] shadow-[0_32px_120px_rgba(0,0,0,0.52)]"
              onClick={(event) => event.stopPropagation()}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[32px] border border-[#0F0F0F]"
              />
              <span
                aria-hidden="true"
                className="flowdesk-tag-border-glow pointer-events-none absolute inset-[-2px] rounded-[32px]"
              />
              <span
                aria-hidden="true"
                className="flowdesk-tag-border-core pointer-events-none absolute inset-[-1px] rounded-[32px]"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-[1px] rounded-[31px] bg-[linear-gradient(180deg,rgba(9,9,9,0.985)_0%,rgba(5,5,5,0.985)_100%)]"
              />

              <div className="thin-scrollbar relative z-10 max-h-[calc(100vh-48px)] overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="max-w-[640px]">
                    <div className="inline-flex rounded-full border border-[#171717] bg-[#0D0D0D] px-[14px] py-[8px] text-[11px] font-medium tracking-[0.18em] uppercase text-[#8B8B8B]">
                      Centro de preferencias
                    </div>

                    <h2 className="mt-4 bg-[linear-gradient(90deg,#EFEFEF_0%,#C9C9C9_100%)] bg-clip-text text-[32px] leading-[0.98] font-normal tracking-[-0.06em] text-transparent sm:text-[40px]">
                      Preferencias de cookies
                    </h2>

                    <p className="mt-4 text-[13px] leading-[1.75] text-[#8C8C8C] sm:text-[14px]">
                      Os cookies obrigatorios continuam ativos porque sustentam
                      autenticacao, seguranca, pagamentos e estabilidade do
                      painel. As outras categorias so ficam ligadas quando voce
                      autoriza explicitamente.
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="rounded-[18px] border border-[#171717] bg-[#0D0D0D] px-4 py-3 text-right">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-[#666666]">
                        Ultima atualizacao
                      </p>
                      <p className="mt-[6px] text-[12px] text-[#D0D0D0]">
                        {lastUpdatedLabel}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={closeModal}
                      className="inline-flex h-[42px] w-[42px] items-center justify-center rounded-[14px] border border-[#171717] bg-[#0D0D0D] text-[#9C9C9C] transition-colors hover:border-[#252525] hover:text-white"
                      aria-label="Fechar configuracao de cookies"
                    >
                      X
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 lg:grid-cols-2">
                  {cookieCategories.map((category) => {
                    const checked =
                      category.key === "essential"
                        ? true
                        : draftConsent[category.key];

                    return (
                      <div
                        key={category.key}
                        className={`rounded-[24px] border px-5 py-5 shadow-[0_18px_54px_rgba(0,0,0,0.2)] ${
                          checked
                            ? "border-[rgba(126,196,255,0.18)] bg-[linear-gradient(180deg,rgba(14,20,31,0.95)_0%,rgba(7,10,16,0.98)_100%)]"
                            : "border-[#171717] bg-[linear-gradient(180deg,rgba(12,12,12,0.98)_0%,rgba(7,7,7,0.98)_100%)]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[16px] font-medium tracking-[-0.03em] text-[#EEEEEE]">
                                {category.title}
                              </span>
                              <span
                                className={`rounded-full border px-[10px] py-[4px] text-[10px] font-medium uppercase tracking-[0.16em] ${
                                  checked
                                    ? "border-[rgba(126,196,255,0.18)] bg-[rgba(18,26,39,0.92)] text-[#DCEEFF]"
                                    : "border-[#1D1D1D] bg-[#0D0D0D] text-[#8A8A8A]"
                                }`}
                              >
                                {checked
                                  ? category.statusOnLabel
                                  : category.statusOffLabel || "Desativado"}
                              </span>
                            </div>

                            <p className="mt-3 text-[13px] leading-[1.75] text-[#9B9B9B]">
                              {category.description}
                            </p>
                            <p className="mt-3 text-[11px] leading-[1.7] text-[#6D6D6D]">
                              {category.helper}
                            </p>
                          </div>

                          <CookieToggle
                            checked={checked}
                            disabled={category.locked}
                            onChange={(nextChecked) => {
                              setDraftConsent((current) =>
                                buildCookieConsentPreferences({
                                  ...current,
                                  [category.key]: nextChecked,
                                }),
                              );
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 rounded-[24px] border border-[#171717] bg-[linear-gradient(180deg,rgba(12,12,12,0.98)_0%,rgba(7,7,7,0.98)_100%)] px-5 py-5">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="max-w-[580px]">
                      <p className="text-[12px] font-medium uppercase tracking-[0.18em] text-[#707070]">
                        O que isso muda na pratica
                      </p>
                      <div className="mt-3 space-y-2 text-[12px] leading-[1.75] text-[#898989]">
                        <p>
                          Os cookies obrigatorios mantem login, sessao
                          autenticada, fluxo de pagamentos e protecao basica
                          contra abuso.
                        </p>
                        <p>
                          Categorias opcionais permanecem desligadas ate que
                          voce as aprove. Assim a plataforma continua funcional
                          sem ativar recursos extras desnecessarios.
                        </p>
                        <p>
                          Consulte{" "}
                          <Link
                            href={TERMS_PATH}
                            className="text-[#D8D8D8] underline underline-offset-4 transition hover:text-white"
                          >
                            termos
                          </Link>{" "}
                          e{" "}
                          <Link
                            href={PRIVACY_PATH}
                            className="text-[#D8D8D8] underline underline-offset-4 transition hover:text-white"
                          >
                            politica de privacidade
                          </Link>{" "}
                          para detalhes sobre tratamento de dados e provedores
                          terceiros.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[18px] border border-[#171717] bg-[#0C0C0C] px-4 py-4">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-[#666666]">
                        Resumo atual
                      </p>
                      <p className="mt-2 text-[15px] font-medium tracking-[-0.03em] text-[#ECECEC]">
                        {resolveConsentSummary(draftConsent).title}
                      </p>
                      <p className="mt-2 text-[12px] leading-[1.6] text-[#7C7C7C]">
                        {resolveConsentSummary(draftConsent).helper}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-2 lg:flex-row lg:justify-end">
                  <button
                    type="button"
                    onClick={handleConfirmRequiredOnly}
                    className="inline-flex h-[48px] items-center justify-center rounded-[14px] border border-[#181818] bg-[#0D0D0D] px-5 text-[12px] font-medium text-[#D2D2D2] transition-colors hover:border-[#252525] hover:bg-[#111111] hover:text-white"
                  >
                    Somente essenciais
                  </button>
                  <button
                    type="button"
                    onClick={handleAcceptAll}
                    className="inline-flex h-[48px] items-center justify-center rounded-[14px] border border-[#181818] bg-[#0D0D0D] px-5 text-[12px] font-medium text-[#D2D2D2] transition-colors hover:border-[#252525] hover:bg-[#111111] hover:text-white"
                  >
                    Aceitar tudo
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveCustomConsent}
                    className="group relative inline-flex h-[48px] items-center justify-center overflow-hidden rounded-[14px] px-5 text-[12px] font-semibold"
                  >
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-[14px] bg-[linear-gradient(180deg,#FFFFFF_0%,#D4D4D4_100%)] transition-transform duration-150 ease-out group-hover:scale-[1.01] group-active:scale-[0.99]"
                    />
                    <span className="relative z-10 text-[#111111]">
                      Salvar preferencias
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
