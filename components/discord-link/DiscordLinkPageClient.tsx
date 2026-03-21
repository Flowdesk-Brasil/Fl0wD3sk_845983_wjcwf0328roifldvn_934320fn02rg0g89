"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import {
  buildOfficialDiscordChannelUrl,
  OFFICIAL_DISCORD_INVITE_URL,
  OFFICIAL_DISCORD_LINK_PATH,
  OFFICIAL_DISCORD_LINKED_ROLE_NAME,
} from "@/lib/discordLink/config";
import { PRIVACY_PATH, TERMS_PATH } from "@/lib/legal/content";

type LinkSyncResponse = {
  ok: boolean;
  authenticated?: boolean;
  status?: "pending" | "pending_member" | "linked" | "failed";
  linked?: boolean;
  message?: string;
  alreadyLinked?: boolean;
  roleName?: string;
  openDiscordUrl?: string;
  inviteUrl?: string;
  pollAfterMs?: number | null;
};

type ViewState =
  | {
      phase: "checking" | "redirecting" | "syncing";
      title: string;
      description: string;
      helperHref?: string | null;
      helperLabel?: string | null;
    }
  | {
      phase: "success";
      title: string;
      description: string;
      actionHref: string;
      actionLabel: string;
      roleName: string;
    }
  | {
      phase: "error";
      title: string;
      description: string;
      requestId: string | null;
    };

function SuccessIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[78px] w-[78px] text-[#6AE25A]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.2" />
      <path d="m8 12.3 2.7 2.7L16.4 9.6" />
    </svg>
  );
}

const INITIAL_CHECKING_STATE: ViewState = {
  phase: "checking",
  title: "Validando vinculacao da conta",
  description:
    "Estamos confirmando o login seguro e sincronizando sua conta com o Discord oficial.",
};

export function DiscordLinkPageClient() {
  const [state, setState] = useState<ViewState>({
    ...INITIAL_CHECKING_STATE,
  });
  const redirectTimerRef = useRef<number | null>(null);
  const syncRetryTimerRef = useRef<number | null>(null);
  const syncLinkRef = useRef<((resetState?: boolean) => Promise<void>) | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (syncRetryTimerRef.current) {
      window.clearTimeout(syncRetryTimerRef.current);
      syncRetryTimerRef.current = null;
    }
  }, []);

  const syncLink = useCallback(async (resetState = true) => {
    if (resetState) {
      setState(INITIAL_CHECKING_STATE);
    }

    clearRetryTimer();

    const response = await fetch("/api/auth/me/discord-link", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body: JSON.stringify({
        source: "official_link_page",
      }),
    });

    const requestId = response.headers.get("X-Request-Id");
    const payload = (await response.json().catch(() => null)) as LinkSyncResponse | null;

    if (response.status === 401) {
      setState({
        phase: "redirecting",
        title: "Abrindo login seguro",
        description:
          "Sua sessao nao foi encontrada. Vamos abrir o login do Flowdesk para continuar a vinculacao automaticamente.",
      });

      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }

      redirectTimerRef.current = window.setTimeout(() => {
        window.location.assign(
          `/api/auth/discord?next=${encodeURIComponent(OFFICIAL_DISCORD_LINK_PATH)}`,
        );
      }, 500);

      return;
    }

    if (!response.ok || !payload?.ok) {
      setState({
        phase: "error",
        title: "Nao foi possivel concluir a vinculacao",
        description:
          payload?.message ||
          "O Flowdesk nao conseguiu sincronizar sua conta agora. Tente novamente em instantes.",
        requestId,
      });
      return;
    }

    if (payload.status === "pending" || payload.status === "pending_member") {
      setState({
        phase: "syncing",
        title: "Sincronizando sua conta com o Discord",
        description:
          payload.message ||
          "Estamos validando a sua conta no servidor oficial e liberando o cargo automaticamente.",
        helperHref:
          payload.openDiscordUrl ||
          payload.inviteUrl ||
          buildOfficialDiscordChannelUrl() ||
          OFFICIAL_DISCORD_INVITE_URL,
        helperLabel: "Abrir Discord oficial",
      });

      syncRetryTimerRef.current = window.setTimeout(() => {
        void syncLinkRef.current?.(false);
      }, Math.max(1800, payload.pollAfterMs || 2500));

      return;
    }

    setState({
      phase: "success",
      title: payload.alreadyLinked
        ? "Conta ja vinculada e sincronizada"
        : "Conta vinculada com sucesso",
      description:
        payload.message ||
        "Sua conta foi vinculada com sucesso. Voce ja pode voltar ao Discord e continuar usando o Flowdesk normalmente.",
      actionHref: payload.openDiscordUrl || buildOfficialDiscordChannelUrl(),
      actionLabel: "Voltar ao Discord oficial",
      roleName: payload.roleName || OFFICIAL_DISCORD_LINKED_ROLE_NAME,
    });
  }, [clearRetryTimer]);

  useEffect(() => {
    syncLinkRef.current = syncLink;
  }, [syncLink]);

  useEffect(() => {
    const bootTimer = window.setTimeout(() => {
      void syncLink(false);
    }, 0);

    return () => {
      window.clearTimeout(bootTimer);
      clearRetryTimer();
      if (redirectTimerRef.current) {
        window.clearTimeout(redirectTimerRef.current);
      }
    };
  }, [clearRetryTimer, syncLink]);

  useEffect(() => {
    function handleForegroundReturn() {
      if (document.visibilityState !== "visible") {
        return;
      }

      void syncLink(false);
    }

    window.addEventListener("pageshow", handleForegroundReturn);
    document.addEventListener("visibilitychange", handleForegroundReturn);
    window.addEventListener("focus", handleForegroundReturn);

    return () => {
      window.removeEventListener("pageshow", handleForegroundReturn);
      document.removeEventListener("visibilitychange", handleForegroundReturn);
      window.removeEventListener("focus", handleForegroundReturn);
    };
  }, [syncLink]);

  const footerLinks = useMemo(
    () => ({
      termsUrl: process.env.NEXT_PUBLIC_TERMS_URL || TERMS_PATH,
      privacyUrl: process.env.NEXT_PUBLIC_PRIVACY_URL || PRIVACY_PATH,
    }),
    [],
  );

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-black px-6 py-10">
      <section className="w-full max-w-[880px]">
        <div className="mx-auto flex w-full max-w-[760px] flex-col items-center gap-7">
          <div className="relative h-[68px] w-[68px] shrink-0">
            <Image
              src="/cdn/logos/logotipo.png"
              alt="Flowdesk"
              fill
              sizes="68px"
              className="object-contain"
              priority
            />
          </div>

          <div className="flex w-full flex-col items-center gap-3 text-center">
            <h1 className="text-[32px] leading-[1.1] font-medium text-[#D8D8D8] sm:text-[44px]">
              Vincule sua conta com o Discord
            </h1>
            <p className="max-w-[720px] text-[14px] leading-[1.6] text-[#A2A2A2] sm:text-[15px]">
              O Flowdesk usa o mesmo login Discord para validar sua identidade, sincronizar
              o acesso ao painel e liberar automaticamente o cargo oficial no servidor de
              suporte.
            </p>
          </div>

          <div className="h-px w-full bg-[#242424]" />

          <div className="flex w-full flex-col items-center gap-6 lg:flex-row lg:items-stretch lg:justify-between">
            <div className="flex w-full max-w-[420px] flex-1 flex-col gap-5 text-center lg:max-w-[330px] lg:justify-center lg:text-left">
              <h2 className="text-[22px] leading-[1.2] font-medium text-[#D8D8D8]">
                {state.title}
              </h2>
              <p className="text-[14px] leading-[1.7] text-[#A8A8A8]">
                {state.description}
              </p>

              {state.phase === "success" ? (
                <div className="rounded-[18px] border border-[rgba(106,226,90,0.22)] bg-[rgba(106,226,90,0.08)] px-4 py-3 text-left">
                  <p className="text-[13px] font-medium text-[#6AE25A]">
                    Cargo liberado
                  </p>
                  <p className="mt-1 text-[13px] leading-[1.6] text-[#CDE9C8]">
                    O cargo <span className="font-medium text-[#DFF6DA]">{state.roleName}</span>{" "}
                    foi sincronizado. Agora voce pode voltar ao Discord oficial.
                  </p>
                </div>
              ) : null}

              {state.phase === "error" && state.requestId ? (
                <p className="text-[12px] leading-[1.6] text-[#7E7E7E]">
                  Protocolo tecnico: <span className="text-[#B8B8B8]">{state.requestId}</span>
                </p>
              ) : null}

              <div className="flex flex-col gap-3 pt-1">
                {state.phase === "success" ? (
                  <a
                    href={state.actionHref}
                    className="inline-flex h-[52px] items-center justify-center rounded-[14px] bg-[#F3F3F3] px-5 text-[15px] font-medium text-black transition hover:bg-white"
                  >
                    {state.actionLabel}
                  </a>
                ) : null}

                {state.phase === "syncing" && state.helperHref && state.helperLabel ? (
                  <a
                    href={state.helperHref}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] font-medium text-[#8E8E8E] underline-offset-4 hover:text-[#D4D4D4] hover:underline"
                  >
                    {state.helperLabel}
                  </a>
                ) : null}

                {state.phase === "error" ? (
                  <button
                    type="button"
                    onClick={() => {
                      void syncLink();
                    }}
                    className="inline-flex h-[52px] items-center justify-center rounded-[14px] bg-[#F3F3F3] px-5 text-[15px] font-medium text-black transition hover:bg-white"
                  >
                    Tentar novamente
                  </button>
                ) : null}
              </div>
            </div>

            <div
              className={`flex w-full max-w-[390px] shrink-0 items-center justify-center rounded-[26px] border border-[#242424] bg-[#080808] p-8 ${
                state.phase === "success" ? "flowdesk-success-glow" : "flowdesk-panel-glow"
              }`}
            >
              <div className="flex min-h-[290px] w-full flex-col items-center justify-center gap-6 text-center">
                {state.phase === "success" ? (
                  <>
                    <SuccessIcon />
                    <div className="space-y-2">
                      <p className="text-[20px] font-medium text-[#DFF6DA]">
                        Vinculacao concluida
                      </p>
                      <p className="mx-auto max-w-[280px] text-[13px] leading-[1.7] text-[#94B58F]">
                        Sua conta foi validada com seguranca e o acesso ja esta sincronizado no
                        Discord oficial.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <ButtonLoader size={46} colorClassName="text-[#D8D8D8]" />
                    <div className="space-y-2">
                      <p className="text-[20px] font-medium text-[#D8D8D8]">
                        {state.phase === "redirecting"
                          ? "Abrindo login seguro"
                          : state.phase === "error"
                              ? "Falha ao sincronizar"
                              : "Sincronizando sua conta"}
                      </p>
                      <p className="mx-auto max-w-[280px] text-[13px] leading-[1.7] text-[#8F8F8F]">
                        {state.phase === "redirecting"
                          ? "Em instantes voce sera levado ao login do Flowdesk para continuar a vinculacao."
                          : state.phase === "error"
                              ? "Voce pode tentar novamente agora. Se persistir, compartilhe o protocolo tecnico com o suporte."
                              : "Deixe esta pagina aberta enquanto o Flowdesk valida a conta, verifica sua presenca no servidor oficial e libera o cargo automaticamente."}
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="h-px w-full bg-[#242424]" />

          <p className="max-w-[760px] text-center text-[12px] leading-[1.8] text-[#727272]">
            Ao continuar, voce concorda com nossos{" "}
            <Link href={footerLinks.termsUrl} className="text-[#BDBDBD] hover:underline">
              Termos de Uso
            </Link>{" "}
            e{" "}
            <Link href={footerLinks.privacyUrl} className="text-[#BDBDBD] hover:underline">
              Politica de Privacidade
            </Link>
            . O Flowdesk vincula apenas a conta autenticada no login para manter a
            sincronizacao segura entre site e Discord.
          </p>
        </div>
      </section>
    </main>
  );
}
