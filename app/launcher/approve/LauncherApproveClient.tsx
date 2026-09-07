"use client";

import { useEffect, useState } from "react";
import { Check, LoaderCircle, ShieldCheck } from "lucide-react";

type Props = {
  attemptToken: string;
  alreadyAuthenticated: boolean;
  loginHref: string;
};

export function LauncherApproveClient({
  attemptToken,
  alreadyAuthenticated,
  loginHref,
}: Props) {
  const [state, setState] = useState<"idle" | "working" | "ok" | "error">(
    alreadyAuthenticated ? "working" : "idle",
  );
  const [message, setMessage] = useState(
    alreadyAuthenticated
      ? "Validando este computador e vinculando ao servidor..."
      : "Entre na Flowdesk. Sem codigo. O launcher reconhece sozinho.",
  );
  const [guildName, setGuildName] = useState<string | null>(null);

  useEffect(() => {
    if (!alreadyAuthenticated || !attemptToken) return;
    let cancelled = false;
    async function approve() {
      try {
        const response = await fetch("/api/launcher/login/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attemptToken }),
        });
        const payload = await response.json();
        if (cancelled) return;
        if (!response.ok || !payload.ok) {
          setState("error");
          setMessage(payload.message || "Nao foi possivel autorizar o launcher.");
          return;
        }
        setState("ok");
        setGuildName(payload.guildName || null);
        setMessage(
          payload.bound
            ? "Pronto. Este computador ja esta vinculado."
            : "Pronto. Volte ao launcher para escolher o servidor.",
        );
      } catch {
        if (!cancelled) {
          setState("error");
          setMessage("Falha ao autorizar o launcher.");
        }
      }
    }
    void approve();
    return () => {
      cancelled = true;
    };
  }, [alreadyAuthenticated, attemptToken]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] text-[#F4F4F5]">
      <div className="pointer-events-none absolute -left-24 top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.12),transparent_68%)] blur-2xl" />
      <div className="pointer-events-none absolute -right-16 bottom-24 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(134,239,172,0.1),transparent_70%)] blur-2xl" />
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col justify-center px-[24px]">
        <div className="rounded-[28px] border border-[rgba(255,255,255,0.06)] bg-[linear-gradient(180deg,#101010_0%,#0B0B0B_100%)] px-[28px] py-[32px] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
          <div className="mb-[18px] grid h-[48px] w-[48px] place-items-center rounded-[16px] border border-[rgba(255,255,255,0.06)] bg-[#141414]">
            <ShieldCheck className="h-[22px] w-[22px]" strokeWidth={1.7} />
          </div>
          <p className="text-[11px] font-medium tracking-[0.22em] text-[#7A7A7A] uppercase">
            Flowdesk
          </p>
          <h1 className="mt-[10px] font-[family-name:var(--font-geist-sans)] text-[34px] leading-[1] font-semibold tracking-[-0.05em]">
            {state === "ok" ? "Vinculado." : "Autorizar launcher"}
          </h1>
          <p className="mt-[12px] text-[14px] leading-[1.65] text-[#8F8F8F]">{message}</p>
          {guildName ? (
            <p className="mt-[8px] text-[13px] text-[#C8C8CC]">{guildName}</p>
          ) : null}
          {state === "working" ? (
            <div className="mt-[24px]">
              <div className="mb-[12px] flex items-center gap-[8px] text-[12px] text-[#8A8A8E]">
                <LoaderCircle className="h-[14px] w-[14px] animate-spin" />
                Sem codigo. Validando sessao...
              </div>
              <div className="h-[8px] overflow-hidden rounded-full bg-[#171717]">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-white" />
              </div>
            </div>
          ) : null}
          {state === "idle" ? (
            <a
              href={loginHref}
              className="mt-[24px] inline-flex h-[46px] items-center justify-center rounded-full bg-white px-[18px] text-[14px] font-semibold text-[#111] transition-transform duration-200 hover:-translate-y-px"
            >
              Entrar na Flowdesk
            </a>
          ) : null}
          {state === "ok" ? (
            <div className="mt-[22px] inline-flex h-[32px] items-center gap-[6px] rounded-full bg-[rgba(134,239,172,0.08)] px-[10px] text-[12px] font-semibold text-[#86EFAC]">
              <Check className="h-[13px] w-[13px]" strokeWidth={2.2} />
              Pode fechar esta janela
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
