"use client";

import { useState } from "react";
import Image from "next/image";
import { ButtonLoader } from "@/components/login/ButtonLoader";

type ConfigStepFourProps = {
  displayName: string;
};

export function ConfigStepFour({ displayName }: ConfigStepFourProps) {
  const [copied, setCopied] = useState(false);
  const [isQrLoading, setIsQrLoading] = useState(true);
  const [hasQrLoadError, setHasQrLoadError] = useState(false);

  const pixCode =
    "00020126580014BR.GOV.BCB.PIX0136flowdesk-pagamento-chave52040000530398654049.995802BR5922FLOWDESK SERVICOS LTDA6009SAO PAULO62070503***6304ABCD";

  async function handleCopyPixCode() {
    try {
      await navigator.clipboard.writeText(pixCode);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  }

  function renderQrAndCopySection(className: string) {
    return (
      <div className={className}>
        <div className="relative aspect-square w-full overflow-hidden border border-[#2E2E2E] bg-[#0A0A0A]">
          {isQrLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <ButtonLoader size={34} />
            </div>
          ) : null}

          {hasQrLoadError ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center px-4 text-center text-[12px] text-[#7A7A7A]">
              Falha ao carregar QR Code
            </div>
          ) : null}

          <Image
            src="/cdn/qr.png"
            alt="QR Code para pagamento PIX"
            fill
            sizes="(max-width: 1280px) 100vw, 536px"
            onLoad={() => {
              setIsQrLoading(false);
              setHasQrLoadError(false);
            }}
            onError={() => {
              setIsQrLoading(false);
              setHasQrLoadError(true);
            }}
            className={`object-cover transition-opacity duration-200 ${isQrLoading || hasQrLoadError ? "opacity-0" : "opacity-100"}`}
            priority
          />
        </div>

        <button
          type="button"
          onClick={() => {
            void handleCopyPixCode();
          }}
          className="mt-[16px] flex h-[51px] w-full items-center rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-6 text-left"
          aria-label="Copiar codigo PIX"
        >
          <span className="truncate pr-2 text-[16px] text-[#242424]">
            CODIGO COPIA E COLA DO PIX PARA O PAGAMENTO
          </span>
          <span className="ml-auto inline-flex items-center justify-center text-[#D8D8D8]">
            <svg
              viewBox="0 0 24 24"
              className="h-[23px] w-[23px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="9" y="9" width="10" height="10" rx="2" />
              <path d="M5 15V5a2 2 0 0 1 2-2h10" />
            </svg>
          </span>
        </button>

        {copied ? (
          <p className="mt-[11px] text-center text-[14px] text-[#D8D8D8]">
            Codigo copiado
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-6 py-8 pb-[72px] max-[1529px]:items-start max-[1529px]:justify-start max-[1529px]:pb-[132px]">
      <section className="w-full max-w-[1840px]">
        <div className="grid grid-cols-1 items-start gap-12 max-[1529px]:justify-items-center min-[1530px]:grid-cols-[815px_536px] min-[1530px]:justify-center min-[1530px]:gap-24">
          <div className="w-full max-[1529px]:max-w-[536px]">
            <div className="flex flex-col items-center">
              <div className="relative h-[112px] w-[112px] shrink-0">
                <Image
                  src="/cdn/logos/logotipo.png"
                  alt="Flowdesk"
                  fill
                  sizes="112px"
                  className="object-contain"
                  priority
                />
              </div>

              <h1 className="mt-[26px] whitespace-normal text-center text-[33px] font-medium text-[#D8D8D8] min-[960px]:whitespace-nowrap">
                Ultima etapa, Realize o pagamento para confirmacao
              </h1>
            </div>

            {renderQrAndCopySection("mt-[26px] w-full min-[1530px]:hidden")}

            <div className="mt-[36px] h-[2px] w-full bg-[#242424]" />

            <div className="mt-[26px] flex justify-center">
              <div className="flex h-[51px] w-[256px] items-center justify-center rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] text-[16px] text-[#D8D8D8]">
                Pedido: #95473
              </div>
            </div>

            <p className="mt-[26px] text-[16px] leading-[1.55] text-[#D8D8D8]">
              A assinatura possui cobranca mensal no valor de{" "}
              <span className="font-semibold text-white">R$ 9,99</span>, com
              pagamento feito exclusivamente por{" "}
              <span className="font-semibold text-white">PIX</span>.
            </p>

            <p className="mt-[16px] text-[16px] leading-[1.55] text-[#D8D8D8]">
              Apos a confirmacao do pagamento (que ocorre de forma imediata),
              seu acesso sera liberado automaticamente e voce recebera um e-mail
              com a confirmacao da compra e os detalhes do servico.
            </p>

            <div className="mt-[26px] flex h-[51px] w-full items-center justify-between rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-6">
              <span className="text-[16px] text-[#D8D8D8]">Pagamento pendente</span>
              <svg
                viewBox="0 0 256 256"
                className="h-[24px] w-[24px] animate-spin stroke-[#D8D8D8]"
                fill="none"
                aria-hidden="true"
              >
                <line x1="128" y1="32" x2="128" y2="64" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                <line x1="195.9" y1="60.1" x2="173.3" y2="82.7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                <line x1="224" y1="128" x2="192" y2="128" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                <line x1="195.9" y1="195.9" x2="173.3" y2="173.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                <line x1="128" y1="224" x2="128" y2="192" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                <line x1="60.1" y1="195.9" x2="82.7" y2="173.3" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                <line x1="32" y1="128" x2="64" y2="128" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
                <line x1="60.1" y1="60.1" x2="82.7" y2="82.7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="24" />
              </svg>
            </div>

            <div className="mt-[36px] h-[2px] w-full bg-[#242424]" />

            <p className="mt-[36px] text-[12px] leading-[1.6] text-[#949494]">
              Apos a confirmacao do pagamento, a aprovacao sera imediata,
              juntamente com a liberacao do sistema. Caso ocorra algum erro,
              entre em contato imediatamente em:{" "}
              <a
                href="https://discord.gg/j9V2UUmfYP"
                target="_blank"
                rel="noreferrer noopener"
                className="text-[#A8A8A8] underline decoration-[#A0A0A0] underline-offset-2 transition-colors hover:text-[#C7C7C7]"
              >
                Ajuda com meu pagamento
              </a>
              .
              O pagamento de R$ 9,99 e referente a validacao de apenas 1
              licenca, ou seja, o Flowdesk funcionara somente no servidor do
              Discord que foi configurado inicialmente.
            </p>
          </div>

          {renderQrAndCopySection("mx-auto hidden w-full max-w-[536px] min-[1530px]:block")}

          <span className="sr-only">{displayName}</span>
        </div>
      </section>
    </main>
  );
}
