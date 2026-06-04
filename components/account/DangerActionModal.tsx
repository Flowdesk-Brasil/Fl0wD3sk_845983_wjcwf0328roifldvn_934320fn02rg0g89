"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

type DangerActionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isProcessing: boolean;
  title: string;
  description: string;
  confirmText?: string;
  eyebrow?: string;
};

export function DangerActionModal({
  isOpen,
  onClose,
  onConfirm,
  isProcessing,
  title,
  description,
  confirmText = "Confirmar",
  eyebrow = "Acao irreversivel",
}: DangerActionModalProps) {
  useBodyScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isProcessing) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="flowdesk-account-modal-nui fixed inset-0 z-[2600] isolate overflow-y-auto overscroll-contain">
      <button
        type="button"
        aria-label="Fechar modal"
        className="absolute inset-0 bg-[rgba(0,0,0,0.86)] backdrop-blur-[9px]"
        onClick={isProcessing ? undefined : onClose}
      />

      <div className="relative z-10 flex min-h-full items-center justify-center p-[16px] sm:p-[24px]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="flowdesk-stage-fade w-full max-w-[560px] overflow-hidden rounded-[20px] border border-[#1B1B1B] bg-[#080808] shadow-[0_30px_110px_rgba(0,0,0,0.72)]"
        >
          <div className="flex items-start justify-between gap-[16px] border-b border-[#171717] px-[20px] py-[18px]">
            <div className="flex min-w-0 items-start gap-[12px]">
              <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] border border-[rgba(219,70,70,0.24)] bg-[rgba(219,70,70,0.08)] text-[#D68D8D]">
                <AlertTriangle className="h-[18px] w-[18px]" />
              </span>
              <div>
                <p className="text-[11px] font-medium text-[#9B6666]">{eyebrow}</p>
                <h2 className="mt-[4px] text-[15px] font-semibold text-[#EEEEEE]">
                  {title}
                </h2>
                <p className="mt-[5px] max-w-[440px] text-[12px] leading-[1.55] text-[#707070]">
                  {description}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[#777777] transition-colors hover:bg-[#111111] hover:text-white disabled:opacity-40"
              aria-label="Fechar modal"
            >
              <X className="h-[17px] w-[17px]" />
            </button>
          </div>

          <div className="flex flex-col-reverse gap-[8px] px-[20px] py-[18px] sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="inline-flex h-[40px] items-center justify-center rounded-[12px] border border-[#1A1A1A] bg-[#111111] px-[14px] text-[13px] font-medium text-[#D8D8D8] transition-colors hover:border-[#282828] hover:bg-[#151515] disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="button"
              onClick={onConfirm}
              disabled={isProcessing}
              aria-busy={isProcessing}
              className="inline-flex h-[40px] shrink-0 items-center justify-center gap-[8px] rounded-[12px] border border-[rgba(219,70,70,0.34)] bg-[#B53535] px-[15px] text-[13px] font-semibold text-white transition-colors hover:bg-[#C43D3D] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isProcessing ? <ButtonLoader size={16} colorClassName="text-white" /> : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
