"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import {
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { SensitiveAccountAction } from "@/lib/auth/sensitiveAction";
import { getFriendlyWebAuthnError } from "@/lib/auth/webauthnClient";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

type SensitiveActionModalProps = {
  isOpen: boolean;
  action: SensitiveAccountAction;
  title: string;
  description: string;
  onClose: () => void;
  onVerified: (proof: string | null) => void | Promise<void>;
};

type TwoFactorMethod = "totp" | "passkey";

type StartResponse = {
  ok?: boolean;
  message?: string;
  required?: boolean;
  challengeId?: string | null;
  methods?: TwoFactorMethod[];
};

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    message?: string;
    [key: string]: unknown;
  };
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Nao foi possivel confirmar esta acao.");
  }
  return payload;
}

export function SensitiveActionModal({
  isOpen,
  action,
  title,
  description,
  onClose,
  onVerified,
}: SensitiveActionModalProps) {
  const onVerifiedRef = useRef(onVerified);
  const onCloseRef = useRef(onClose);
  const [challengeId, setChallengeId] = useState("");
  const [methods, setMethods] = useState<TwoFactorMethod[]>([]);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useBodyScrollLock(isOpen);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
    onCloseRef.current = onClose;
  }, [onClose, onVerified]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setStarting(true);
    setChallengeId("");
    setMethods([]);
    setCode("");
    setError(null);

    void postJson("/api/auth/me/security-verification/start", { action })
      .then(async (payload) => {
        if (cancelled) return;
        const response = payload as StartResponse;
        if (response.required === false) {
          await onVerifiedRef.current(null);
          return;
        }
        if (!response.challengeId || !response.methods?.length) {
          throw new Error("Nenhum metodo de confirmacao esta disponivel.");
        }
        setChallengeId(response.challengeId);
        setMethods(response.methods);
      })
      .catch((startError) => {
        if (!cancelled) {
          setError(
            startError instanceof Error
              ? startError.message
              : "Nao foi possivel iniciar a confirmacao.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [action, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading) onCloseRef.current();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, loading]);

  async function verifyTotp() {
    if (!challengeId || code.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const payload = await postJson("/api/auth/me/security-verification/totp", {
        challengeId,
        code,
        action,
      });
      await onVerifiedRef.current(String(payload.proof));
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : "Codigo invalido.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function verifyPasskey() {
    if (!challengeId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const optionsPayload = await postJson(
        "/api/auth/me/security-verification/passkey/options",
        { challengeId },
      );
      const credential = await startAuthentication({
        optionsJSON: optionsPayload.options as Parameters<
          typeof startAuthentication
        >[0]["optionsJSON"],
      });
      const verifyPayload = await postJson(
        "/api/auth/me/security-verification/passkey/verify",
        { challengeId, response: credential, action },
      );
      await onVerifiedRef.current(String(verifyPayload.proof));
    } catch (verifyError) {
      setError(getFriendlyWebAuthnError(verifyError));
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div className="flowdesk-account-modal-nui fixed inset-0 z-[4200] isolate overflow-y-auto overscroll-contain">
      <button
        type="button"
        aria-label="Fechar confirmacao"
        onClick={() => {
          if (!loading) onClose();
        }}
        className="absolute inset-0 bg-[rgba(0,0,0,0.86)] backdrop-blur-[9px]"
      />
      <div className="relative z-10 flex min-h-full items-center justify-center p-[16px] sm:p-[24px]">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="w-full max-w-[500px] overflow-hidden rounded-[20px] border border-[#1D1D1D] bg-[#080808] shadow-[0_34px_120px_rgba(0,0,0,0.72)]"
        >
          <div className="flex items-start justify-between gap-[16px] border-b border-[#171717] px-[20px] py-[18px]">
            <div className="flex min-w-0 items-start gap-[12px]">
              <span className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] border border-[rgba(0,98,255,0.28)] bg-[rgba(0,98,255,0.1)] text-[#74A7FF]">
                <ShieldCheck className="h-[18px] w-[18px]" />
              </span>
              <div>
                <h3 className="text-[15px] font-semibold text-[#EEEEEE]">{title}</h3>
                <p className="mt-[5px] text-[12px] leading-[1.55] text-[#707070]">
                  {description}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] text-[#777777] transition-colors hover:bg-[#111111] hover:text-white disabled:opacity-40"
              aria-label="Fechar"
            >
              <X className="h-[17px] w-[17px]" />
            </button>
          </div>

          <div className="p-[20px]">
            {starting ? (
              <div className="flex min-h-[120px] items-center justify-center text-[#777777]">
                <LoaderCircle className="h-[22px] w-[22px] animate-spin" />
              </div>
            ) : (
              <div className="space-y-[12px]">
                {methods.includes("totp") ? (
                  <div className="rounded-[14px] border border-[#181818] bg-[#0D0D0D] p-[14px]">
                    <div className="flex items-center gap-[10px]">
                      <LockKeyhole className="h-[16px] w-[16px] text-[#999999]" />
                      <p className="text-[13px] font-medium text-[#D8D8D8]">
                        Codigo do aplicativo autenticador
                      </p>
                    </div>
                    <div className="mt-[12px] flex gap-[8px]">
                      <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        value={code}
                        onChange={(event) =>
                          setCode(event.target.value.replace(/\D+/g, "").slice(0, 6))
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") void verifyTotp();
                        }}
                        placeholder="000000"
                        className="h-[42px] min-w-0 flex-1 rounded-[11px] border border-[#202020] bg-[#090909] px-[12px] text-center font-mono text-[17px] text-[#EEEEEE] outline-none transition-colors placeholder:text-[#454545] focus:border-[#383838]"
                      />
                      <button
                        type="button"
                        onClick={() => void verifyTotp()}
                        disabled={code.length !== 6 || loading}
                        className="inline-flex h-[42px] items-center justify-center rounded-[11px] bg-[#0062FF] px-[15px] text-[13px] font-semibold text-white transition-colors hover:bg-[#146FFF] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        Confirmar
                      </button>
                    </div>
                  </div>
                ) : null}

                {methods.includes("passkey") ? (
                  <button
                    type="button"
                    onClick={() => void verifyPasskey()}
                    disabled={loading}
                    className="flex w-full items-center gap-[12px] rounded-[14px] border border-[#181818] bg-[#0D0D0D] p-[14px] text-left transition-colors hover:border-[#292929] hover:bg-[#111111] disabled:opacity-45"
                  >
                    <span className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[11px] border border-[#202020] bg-[#121212] text-[#BDBDBD]">
                      <KeyRound className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-[#D8D8D8]">
                        Confirmar com Passkey
                      </span>
                      <span className="mt-[3px] block text-[11px] text-[#666666]">
                        Windows Hello, biometria ou dispositivo conectado.
                      </span>
                    </span>
                    {loading ? (
                      <LoaderCircle className="h-[16px] w-[16px] animate-spin text-[#777777]" />
                    ) : null}
                  </button>
                ) : null}

                {error ? (
                  <p className="rounded-[11px] border border-[rgba(219,70,70,0.22)] bg-[rgba(219,70,70,0.07)] px-[12px] py-[10px] text-[12px] leading-[1.5] text-[#D99B9B]">
                    {error}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
