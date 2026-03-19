"use client";

type BotMissingModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onContinue: () => void;
  isChecking: boolean;
  title: string;
  description: string;
};

export function BotMissingModal({
  isOpen,
  onClose,
  onContinue,
  isChecking,
  title,
  description,
}: BotMissingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-6">
      <div className="w-full max-w-[560px] rounded-[5px] border border-[#2E2E2E] bg-[#0A0A0A] p-7">
        <div className="mb-5 flex items-start justify-between gap-5">
          <h2 className="text-[22px] font-medium text-[#D8D8D8]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center text-[#8A8A8A] transition-colors hover:text-[#D8D8D8]"
            aria-label="Fechar"
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-[18px] w-[18px]"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            >
              <path d="M6 6L18 18" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>

        <p className="text-[15px] leading-[1.5] text-[#C2C2C2]">{description}</p>

        <div className="mt-7 flex items-center justify-end gap-4">
          <button
            type="button"
            onClick={onClose}
            className="h-[46px] rounded-[3px] border border-[#2E2E2E] bg-[#0A0A0A] px-6 text-[14px] font-medium text-[#D8D8D8] transition-colors hover:bg-[#111111]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={isChecking}
            className="h-[46px] rounded-[3px] bg-[#D8D8D8] px-6 text-[14px] font-medium text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-65"
          >
            {isChecking ? "Verificando..." : "Continuar"}
          </button>
        </div>
      </div>
    </div>
  );
}
