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

type CookieConsentManagerProps = {
  initialConsentValue?: string | null;
};

type CookieCategory = {
  key: "essential" | "preferences" | "analytics" | "marketing";
  title: string;
  description: string;
  locked?: boolean;
  helper: string;
};

const cookieCategories: CookieCategory[] = [
  {
    key: "essential",
    title: "Cookies obrigatorios",
    description:
      "Mantem login, seguranca da sessao, continuidade do checkout, protecao antifraude e o proprio registro desta escolha.",
    helper: "Sempre ativos para o sistema funcionar com seguranca.",
    locked: true,
  },
  {
    key: "preferences",
    title: "Cookies de preferencia",
    description:
      "Permitem lembrar ajustes opcionais de experiencia, como escolhas de interface e refinamentos nao essenciais quando estes recursos estiverem ativos.",
    helper: "Pode ser desativado sem impedir o uso principal da plataforma.",
  },
  {
    key: "analytics",
    title: "Cookies de analise",
    description:
      "Reservados para metricas tecnicas e leitura anonima de desempenho, sempre que a Flowdesk ativar esses recursos de forma opcional.",
    helper: "Desativado por padrao.",
  },
  {
    key: "marketing",
    title: "Cookies de comunicacao",
    description:
      "Reservados para campanhas, personalizacao comercial e acoes promocionais futuras, quando esse tipo de recurso existir.",
    helper: "Desativado por padrao.",
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
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
        checked
          ? "border-[#D8D8D8] bg-[#D8D8D8]"
          : "border-[#2E2E2E] bg-[#0A0A0A]"
      } ${
        disabled
          ? "cursor-not-allowed opacity-90"
          : "cursor-pointer hover:border-[#4A4A4A]"
      }`}
    >
      <span
        className={`block h-5 w-5 rounded-full transition ${
          checked ? "translate-x-6 bg-[#0A0A0A]" : "translate-x-1 bg-[#D8D8D8]"
        }`}
      />
    </button>
  );
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

  useEffect(() => {
    if (!isModalOpen || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isModalOpen]);

  const hasDecision = consent !== null;

  const bannerBottomClass = useMemo(() => {
    if (pathname.startsWith("/config") || pathname.startsWith("/servers")) {
      return "bottom-[74px] sm:bottom-[82px]";
    }

    return "bottom-5 sm:bottom-6";
  }, [pathname]);

  const persistConsent = useCallback((nextConsent: CookieConsentPreferences) => {
    const serialized = serializeCookieConsent(nextConsent);
    const secureAttribute =
      typeof window !== "undefined" && window.location.protocol === "https:"
        ? "; Secure"
        : "";

    document.cookie = `${COOKIE_CONSENT_COOKIE_NAME}=${serialized}; Path=/; Max-Age=${COOKIE_CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secureAttribute}`;

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

  const handleSaveCustomConsent = useCallback(() => {
    persistConsent(buildCookieConsentPreferences(draftConsent));
  }, [draftConsent, persistConsent]);

  const openModal = useCallback(() => {
    setDraftConsent(consent ?? REQUIRED_ONLY_COOKIE_CONSENT);
    setIsModalOpen(true);
  }, [consent]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  return (
    <>
      {!hasDecision ? (
        <div
          className={`pointer-events-none fixed left-1/2 z-50 w-[min(960px,calc(100vw-24px))] -translate-x-1/2 ${bannerBottomClass}`}
        >
          <div className="pointer-events-auto flowdesk-scale-in-soft rounded-[14px] border border-[#2E2E2E] bg-[#0A0A0A]/96 px-5 py-5 shadow-[0_18px_55px_rgba(0,0,0,0.38)] backdrop-blur-xl sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-[640px] space-y-2.5">
                <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#F3F3F3] sm:text-[18px]">
                  Cookies, sessao e preferencia da plataforma
                </div>
                <p className="text-[12px] leading-6 text-[#A8A8A8] sm:text-[13px]">
                  A Flowdesk utiliza cookies obrigatorios para login, seguranca,
                  continuidade do checkout e protecao antifraude. Os opcionais
                  podem ser configurados antes da confirmacao. Ao continuar, os
                  cookies obrigatorios seguem ativos por necessidade tecnica do
                  servico.
                </p>
                <p className="text-[11px] leading-5 text-[#6F6F6F] sm:text-[12px]">
                  Saiba mais em{" "}
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
                  </Link>
                  .
                </p>
              </div>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[260px] sm:flex-row">
                <button
                  type="button"
                  onClick={openModal}
                  className="h-[44px] rounded-[8px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[12px] font-medium text-[#D8D8D8] transition hover:border-[#444444] hover:text-white"
                >
                  Ver mais
                </button>
                <button
                  type="button"
                  onClick={handleConfirmRequiredOnly}
                  className="h-[44px] rounded-[8px] bg-[#D8D8D8] px-4 text-[12px] font-semibold text-black transition hover:bg-white"
                >
                  Confirmar cookies
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isModalOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/72 px-3 py-6 backdrop-blur-md sm:px-5">
          <div className="flowdesk-stage-fade thin-scrollbar max-h-[90vh] w-full max-w-[760px] overflow-y-auto rounded-[18px] border border-[#2E2E2E] bg-[#090909] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.48)] sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="text-[23px] font-semibold tracking-[-0.03em] text-[#F4F4F4] sm:text-[28px]">
                  Preferencias de cookies
                </div>
                <p className="max-w-[620px] text-[12px] leading-6 text-[#A7A7A7] sm:text-[13px]">
                  Os cookies obrigatorios permanecem ativos porque sustentam
                  autenticacao, seguranca, reconciliacao de pagamentos e
                  estabilidade do painel. Os demais podem ser ativados ou
                  mantidos desativados conforme a sua preferencia.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#232323] bg-[#0D0D0D] text-[18px] text-[#CFCFCF] transition hover:border-[#3A3A3A] hover:text-white"
                aria-label="Fechar configuracao de cookies"
              >
                ×
              </button>
            </div>

            <div className="mt-6 space-y-3">
              {cookieCategories.map((category) => {
                const checked =
                  category.key === "essential"
                    ? true
                    : draftConsent[category.key];

                return (
                  <div
                    key={category.key}
                    className="rounded-[12px] border border-[#222222] bg-[#0D0D0D] px-4 py-4 sm:px-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <div className="text-[14px] font-semibold text-[#E7E7E7]">
                            {category.title}
                          </div>
                          {category.locked ? (
                            <span className="rounded-full border border-[#3A3A3A] bg-[#111111] px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-[#9C9C9C]">
                              Sempre ativo
                            </span>
                          ) : null}
                        </div>
                        <p className="text-[12px] leading-6 text-[#A1A1A1]">
                          {category.description}
                        </p>
                        <p className="text-[11px] leading-5 text-[#717171]">
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

            <div className="mt-6 rounded-[12px] border border-[#1F1F1F] bg-[#0B0B0B] px-4 py-4">
              <div className="text-[12px] font-medium text-[#D9D9D9]">
                Informacoes importantes
              </div>
              <div className="mt-2 space-y-2 text-[11px] leading-6 text-[#8B8B8B] sm:text-[12px]">
                <p>
                  Os cookies obrigatorios suportam login, sessao autenticada,
                  fluxo de pagamentos, antifraude e estabilidade das paginas.
                </p>
                <p>
                  As categorias opcionais so devem ser ativadas se voce quiser
                  liberar recursos adicionais de preferencia, analise ou
                  comunicacao quando esses recursos estiverem disponiveis.
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
                  para detalhes sobre dados, provedores terceiros e operacao do
                  painel.
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={handleConfirmRequiredOnly}
                className="h-[46px] rounded-[8px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 text-[12px] font-medium text-[#D8D8D8] transition hover:border-[#444444] hover:text-white"
              >
                Somente obrigatorios
              </button>
              <button
                type="button"
                onClick={handleSaveCustomConsent}
                className="h-[46px] rounded-[8px] bg-[#D8D8D8] px-5 text-[12px] font-semibold text-black transition hover:bg-white"
              >
                Salvar personalizacao
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
