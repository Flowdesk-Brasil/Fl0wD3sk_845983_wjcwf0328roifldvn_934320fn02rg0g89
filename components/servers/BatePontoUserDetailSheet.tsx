"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, X } from "lucide-react";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { BatePontoMemberAvatar } from "@/components/servers/BatePontoMemberAvatar";
import {
  formatBatePontoDetailedDuration,
  formatBatePontoHourBank,
  formatBatePontoTimestamp,
  formatBatePontoWorkedDuration,
  resolveBatePontoActionLabel,
  resolveBatePontoSessionStatusLabel,
} from "@/lib/servers/batePontoFormatting";

type UserProfile = {
  userId: string;
  displayName: string;
  mentionLabel: string;
  avatarUrl: string | null;
};

type UserSession = {
  id: number;
  status: string;
  startedAt: string;
  endedAt: string | null;
  workedSeconds: number;
  breakSeconds: number;
  lastActionAt: string;
};

type UserEvent = {
  id: number;
  sessionId: number | null;
  action: string;
  workedSeconds: number;
  breakSeconds: number;
  hourBankDeltaSeconds: number;
  note: string | null;
  createdAt: string;
};

type Props = {
  guildId: string;
  userId: string | null;
  periodDays?: number;
  onClose: () => void;
};

export function BatePontoUserDetailSheet({
  guildId,
  userId,
  periodDays = 30,
  onClose,
}: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [summary, setSummary] = useState<{
    totalWorkedSeconds: number;
    sessionCount: number;
    hourBankSeconds: number;
    activeSession: UserSession | null;
  } | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [events, setEvents] = useState<UserEvent[]>([]);

  const loadDetails = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        guildId,
        userId,
        periodDays: String(periodDays),
      });
      const response = await fetch(
        `/api/auth/me/guilds/bate-ponto-user?${params.toString()}`,
      );
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Falha ao carregar detalhes do usuario.");
      }

      setUser(payload.user || null);
      setSummary(payload.summary || null);
      setSessions(Array.isArray(payload.sessions) ? payload.sessions : []);
      setEvents(Array.isArray(payload.events) ? payload.events : []);
    } catch (error) {
      setUser(null);
      setSummary(null);
      setSessions([]);
      setEvents([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Erro ao carregar detalhes do usuario.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [guildId, periodDays, userId]);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  useEffect(() => {
    if (!userId) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, userId]);

  if (!userId || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-[rgba(0,0,0,0.72)] p-[12px] sm:items-center sm:p-[24px]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <section className="relative z-[1] flex max-h-[92vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[28px] border border-[#1E1E1E] bg-[#090909] shadow-[0_30px_90px_rgba(0,0,0,0.55)]">
        <div className="flex items-start justify-between gap-[16px] border-b border-[#171717] px-[20px] py-[18px] sm:px-[24px]">
          <div className="flex min-w-0 items-center gap-[14px]">
            <BatePontoMemberAvatar
              userId={userId}
              displayName={user?.displayName}
              avatarUrl={user?.avatarUrl}
              size={52}
              ringClassName="border-[#303030]"
            />
            <div className="min-w-0">
              <p className="truncate text-[18px] font-medium tracking-[-0.03em] text-[#ECECEC]">
                {user?.displayName || userId}
              </p>
              <p className="mt-[4px] truncate text-[12px] text-[#707070]">
                {user?.mentionLabel || `@${userId}`} · ID {userId}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[40px] w-[40px] items-center justify-center rounded-[12px] border border-[#1E1E1E] bg-[#111111] text-[#B8B8B8] transition-colors hover:bg-[#171717] hover:text-[#F0F0F0]"
            aria-label="Fechar detalhes do usuario"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        <div className="overflow-y-auto px-[20px] py-[18px] sm:px-[24px]">
          {isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <ButtonLoader />
            </div>
          ) : errorMessage ? (
            <div className="rounded-[18px] border border-[#2A1717] bg-[#120909] px-[16px] py-[18px] text-[14px] text-[#D88484]">
              {errorMessage}
            </div>
          ) : (
            <div className="space-y-[18px]">
              {summary ? (
                <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    {
                      label: "Horas no periodo",
                      value: formatBatePontoWorkedDuration(summary.totalWorkedSeconds),
                    },
                    {
                      label: "Sessoes",
                      value: String(summary.sessionCount),
                    },
                    {
                      label: "Banco de horas",
                      value: formatBatePontoHourBank(summary.hourBankSeconds),
                    },
                    {
                      label: "Status atual",
                      value: summary.activeSession
                        ? resolveBatePontoSessionStatusLabel(summary.activeSession.status)
                        : "Sem ponto aberto",
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-[18px] border border-[#171717] bg-[#0D0D0D] px-[14px] py-[14px]"
                    >
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[#616161]">
                        {item.label}
                      </p>
                      <p className="mt-[8px] text-[16px] font-semibold tracking-[-0.03em] text-[#E8E8E8]">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="rounded-[22px] border border-[#171717] bg-[#0A0A0A]">
                <div className="border-b border-[#141414] px-[16px] py-[14px]">
                  <p className="text-[12px] uppercase tracking-[0.16em] text-[#616161]">
                    Marcacoes recentes
                  </p>
                </div>
                {events.length ? (
                  <div className="divide-y divide-[#141414]">
                    {events.map((event) => (
                      <div
                        key={event.id}
                        className="flex flex-col gap-[8px] px-[16px] py-[14px] sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-[8px]">
                            <span className="inline-flex rounded-full border border-[#1E1E1E] bg-[#111111] px-[10px] py-[4px] text-[12px] font-medium text-[#D8D8D8]">
                              {resolveBatePontoActionLabel(event.action)}
                            </span>
                            {event.sessionId ? (
                              <span className="text-[11px] text-[#666666]">
                                Sessao #{event.sessionId}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-[6px] text-[13px] text-[#9A9A9A]">
                            {formatBatePontoTimestamp(event.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-[8px] text-[13px] text-[#CFCFCF]">
                          <Clock3 className="h-[14px] w-[14px] text-[#666666]" />
                          {formatBatePontoDetailedDuration(event.workedSeconds)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-[16px] py-[18px] text-[13px] text-[#737373]">
                    Nenhuma marcacao encontrada neste periodo.
                  </p>
                )}
              </div>

              <div className="rounded-[22px] border border-[#171717] bg-[#0A0A0A]">
                <div className="border-b border-[#141414] px-[16px] py-[14px]">
                  <p className="text-[12px] uppercase tracking-[0.16em] text-[#616161]">
                    Sessoes do periodo
                  </p>
                </div>
                {sessions.length ? (
                  <div className="divide-y divide-[#141414]">
                    {sessions.map((session) => (
                      <div
                        key={session.id}
                        className="grid grid-cols-1 gap-[8px] px-[16px] py-[14px] lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
                      >
                        <div>
                          <p className="text-[14px] font-medium text-[#DDDDDD]">
                            Sessao #{session.id}
                          </p>
                          <p className="mt-[4px] text-[12px] text-[#737373]">
                            Inicio {formatBatePontoTimestamp(session.startedAt)}
                            {session.endedAt
                              ? ` · Fim ${formatBatePontoTimestamp(session.endedAt)}`
                              : ""}
                          </p>
                        </div>
                        <span className="inline-flex self-start rounded-full border border-[#1E1E1E] bg-[#111111] px-[10px] py-[4px] text-[12px] text-[#CFCFCF]">
                          {resolveBatePontoSessionStatusLabel(session.status)}
                        </span>
                        <span className="self-start text-[13px] text-[#B8B8B8]">
                          Trabalhado {formatBatePontoDetailedDuration(session.workedSeconds)}
                        </span>
                        <span className="self-start text-[13px] text-[#888888]">
                          Pausa {formatBatePontoDetailedDuration(session.breakSeconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-[16px] py-[18px] text-[13px] text-[#737373]">
                    Nenhuma sessao encontrada neste periodo.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
