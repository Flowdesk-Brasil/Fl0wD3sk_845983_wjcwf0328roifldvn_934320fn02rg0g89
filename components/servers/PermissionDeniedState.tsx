"use client";

import { LandingGlowTag } from "@/components/landing/LandingGlowTag";

type PermissionDeniedStateProps = {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction: () => void;
};

export function PermissionDeniedState({
  title = "Voce nao tem permissao para acessar esta sessao",
  description = "A conta vinculada definiu que seu cargo nao pode visualizar ou editar estas configuracoes. Entre em contato com o dono do plano para solicitar acesso.",
  actionLabel = "Voltar para o inicio",
  onAction,
}: PermissionDeniedStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-[120px] md:py-[180px] text-center min-h-[65vh]">
      <div className="mx-auto flex w-fit justify-center">
        <LandingGlowTag className="px-[26px]">Acesso Restrito</LandingGlowTag>
      </div>

      <h1 className="mt-[22px] bg-[linear-gradient(90deg,#DADADA_0%,#C1C1C1_100%)] bg-clip-text text-[30px] leading-[1.15] font-normal tracking-[-0.05em] text-transparent md:text-[38px]">
        {title.split("acessar").map((part, index) => (
          <span key={index}>
            {part}
            {index === 0 && <br className="hidden md:block" />}
            {index === 0 && "acessar"}
          </span>
        ))}
      </h1>

      <p className="mx-auto mt-[16px] max-w-[500px] text-[14px] leading-[1.65] text-[#7D7D7D] md:text-[15px]">
        {description}
      </p>

      <button
        type="button"
        onClick={onAction}
        className="group relative mt-[28px] inline-flex h-[46px] items-center justify-center overflow-hidden rounded-[12px] px-8 text-[15px] leading-none font-semibold"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-[12px] bg-[linear-gradient(180deg,#FFFFFF_0%,#D1D1D1_100%)] transition-transform duration-150 ease-out group-hover:scale-[1.02] group-active:scale-[0.985]"
        />
        <span className="relative z-10 text-[#282828]">{actionLabel}</span>
      </button>
    </div>
  );
}
