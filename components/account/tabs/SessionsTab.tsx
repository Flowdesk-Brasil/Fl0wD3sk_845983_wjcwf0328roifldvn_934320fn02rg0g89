"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  Clock3,
  Globe2,
  Laptop,
  LogOut,
  MapPin,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Tablet,
} from "lucide-react";
import { useNotifications } from "@/components/notifications/NotificationsProvider";

type AccountSession = {
  id: string;
  current: boolean;
  deviceType: "desktop" | "mobile" | "tablet";
  browser: string;
  platform: string;
  ipAddress: string;
  authMethod: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

type SessionsResponse = {
  ok: boolean;
  currentSessionId?: string;
  sessions?: AccountSession[];
  message?: string;
};

const panelClassName =
  "rounded-[20px] border border-[#141414] bg-[#090909] p-[18px] sm:p-[22px]";
const buttonClassName =
  "inline-flex h-[40px] items-center justify-center gap-[8px] rounded-[12px] border border-[#1A1A1A] bg-[#111111] px-[14px] text-[13px] font-medium text-[#D8D8D8] transition-colors hover:border-[#282828] hover:bg-[#151515] disabled:cursor-not-allowed disabled:opacity-50";

async function fetchSessions(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const payload = (await response.json().catch(() => ({}))) as SessionsResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Nao foi possivel carregar suas sessoes.");
  }
  return payload;
}

async function revokeSessions(url: string) {
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({}),
  });
  const payload = (await response.json().catch(() => ({}))) as SessionsResponse;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.message || "Nao foi possivel desconectar esta sessao.");
  }
  return payload;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Horario indisponivel";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resolveAuthMethodLabel(method: string) {
  if (method === "discord") return "Discord";
  if (method === "google") return "Google";
  if (method === "microsoft") return "Microsoft";
  return "Email e senha";
}

function SessionDeviceIcon({ type }: { type: AccountSession["deviceType"] }) {
  if (type === "mobile") return <Smartphone className="h-[20px] w-[20px]" />;
  if (type === "tablet") return <Tablet className="h-[20px] w-[20px]" />;
  return <Laptop className="h-[20px] w-[20px]" />;
}

function SessionsSkeleton() {
  return (
    <div className="space-y-[12px]">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flowdesk-shimmer h-[132px] rounded-[18px] border border-[#141414] bg-[#090909]"
        />
      ))}
    </div>
  );
}

export function SessionsTab() {
  const notifications = useNotifications();
  const [busySessionId, setBusySessionId] = useState<string | null>(null);
  const { data, error, isLoading, isValidating, mutate } = useSWR<SessionsResponse>(
    "/api/auth/me/sessions",
    fetchSessions,
    {
      refreshInterval: 4_000,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      keepPreviousData: true,
    },
  );

  const sessions = data?.sessions || [];
  const otherSessions = sessions.filter((session) => !session.current);

  async function disconnectSession(sessionId: string) {
    if (busySessionId) return;
    setBusySessionId(sessionId);
    const previous = data;
    await mutate(
      (current) =>
        current
          ? {
              ...current,
              sessions: (current.sessions || []).filter(
                (session) => session.id !== sessionId,
              ),
            }
          : current,
      { revalidate: false },
    );

    try {
      await revokeSessions(`/api/auth/me/sessions/${encodeURIComponent(sessionId)}`);
      notifications.success("Sessao desconectada.", { title: "Sessoes" });
      await mutate();
    } catch (disconnectError) {
      await mutate(previous, { revalidate: false });
      notifications.error(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Nao foi possivel desconectar a sessao.",
        { title: "Sessoes" },
      );
    } finally {
      setBusySessionId(null);
    }
  }

  async function disconnectOtherSessions() {
    if (busySessionId || !otherSessions.length) return;
    setBusySessionId("all");
    const previous = data;
    await mutate(
      (current) =>
        current
          ? {
              ...current,
              sessions: (current.sessions || []).filter(
                (session) => session.current,
              ),
            }
          : current,
      { revalidate: false },
    );

    try {
      const payload = await revokeSessions("/api/auth/me/sessions");
      notifications.success(payload.message || "Outras sessoes desconectadas.", {
        title: "Sessoes",
      });
      await mutate();
    } catch (disconnectError) {
      await mutate(previous, { revalidate: false });
      notifications.error(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Nao foi possivel desconectar as sessoes.",
        { title: "Sessoes" },
      );
    } finally {
      setBusySessionId(null);
    }
  }

  return (
    <div className="space-y-[16px]">
      <section className={panelClassName}>
        <div className="flex flex-col gap-[16px] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-[12px]">
            <span className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] border border-[#1A1A1A] bg-[#101010] text-[#BDBDBD]">
              <MonitorSmartphone className="h-[20px] w-[20px]" />
            </span>
            <div>
              <h2 className="text-[16px] font-semibold text-[#EEEEEE]">
                Dispositivos conectados
              </h2>
              <p className="mt-[4px] text-[13px] leading-[1.55] text-[#777777]">
                {sessions.length === 1
                  ? "1 sessao ativa na sua conta."
                  : `${sessions.length} sessoes ativas na sua conta.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-[8px]">
            <button
              type="button"
              onClick={() => void mutate()}
              disabled={isValidating || Boolean(busySessionId)}
              className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border border-[#1A1A1A] bg-[#111111] text-[#AFAFAF] transition-colors hover:border-[#282828] hover:bg-[#151515] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Atualizar sessoes"
              title="Atualizar sessoes"
            >
              <RefreshCw
                className={`h-[16px] w-[16px] ${isValidating ? "animate-spin" : ""}`}
              />
            </button>
            <button
              type="button"
              onClick={() => void disconnectOtherSessions()}
              disabled={!otherSessions.length || Boolean(busySessionId)}
              className={buttonClassName}
            >
              <LogOut className="h-[16px] w-[16px]" />
              Desconectar outras
            </button>
          </div>
        </div>
      </section>

      {isLoading && !data ? <SessionsSkeleton /> : null}

      {error && !data ? (
        <section className={panelClassName}>
          <p className="text-[14px] text-[#D6A0A0]">
            {error instanceof Error
              ? error.message
              : "Nao foi possivel carregar suas sessoes."}
          </p>
        </section>
      ) : null}

      {!isLoading && data && !sessions.length ? (
        <section className={`${panelClassName} text-center`}>
          <ShieldCheck className="mx-auto h-[24px] w-[24px] text-[#777777]" />
          <p className="mt-[10px] text-[14px] font-medium text-[#D7D7D7]">
            Nenhuma sessao ativa encontrada
          </p>
        </section>
      ) : null}

      <div className="space-y-[10px]">
        {sessions.map((session) => (
          <article
            key={session.id}
            className="rounded-[18px] border border-[#141414] bg-[#090909] p-[17px] sm:p-[20px]"
          >
            <div className="flex flex-col gap-[16px] lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-[13px]">
                <span className="inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px] border border-[#1A1A1A] bg-[#101010] text-[#BDBDBD]">
                  <SessionDeviceIcon type={session.deviceType} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-[8px]">
                    <h3 className="truncate text-[14px] font-semibold text-[#E8E8E8]">
                      {session.browser} em {session.platform}
                    </h3>
                    {session.current ? (
                      <span className="rounded-[7px] border border-[rgba(42,163,92,0.28)] bg-[rgba(42,163,92,0.10)] px-[7px] py-[3px] text-[10px] font-semibold text-[#74D59A]">
                        Sessao atual
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-[10px] flex flex-wrap gap-x-[16px] gap-y-[7px] text-[12px] text-[#777777]">
                    <span className="inline-flex items-center gap-[6px]">
                      <MapPin className="h-[13px] w-[13px]" />
                      {session.ipAddress}
                    </span>
                    <span className="inline-flex items-center gap-[6px]">
                      <Globe2 className="h-[13px] w-[13px]" />
                      {resolveAuthMethodLabel(session.authMethod)}
                    </span>
                    <span className="inline-flex items-center gap-[6px]">
                      <Clock3 className="h-[13px] w-[13px]" />
                      Ativa em {formatDateTime(session.lastSeenAt)}
                    </span>
                  </div>
                  <p className="mt-[7px] text-[11px] text-[#565656]">
                    Login em {formatDateTime(session.createdAt)}
                  </p>
                </div>
              </div>

              {session.current ? (
                <span className="inline-flex h-[38px] items-center gap-[7px] self-start rounded-[11px] border border-[#171717] bg-[#0D0D0D] px-[12px] text-[12px] font-medium text-[#777777] lg:self-center">
                  <ShieldCheck className="h-[15px] w-[15px]" />
                  Protegida
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => void disconnectSession(session.id)}
                  disabled={Boolean(busySessionId)}
                  className={`${buttonClassName} self-start text-[#D8A0A0] lg:self-center`}
                >
                  <LogOut className="h-[15px] w-[15px]" />
                  Desconectar
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
