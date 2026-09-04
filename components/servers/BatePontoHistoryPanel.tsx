"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Filter, History } from "lucide-react";
import { ButtonLoader } from "@/components/login/ButtonLoader";

type BatePontoHistoryEvent = {
  id: number;
  guildId: string;
  userId: string;
  sessionId: number | null;
  action: string;
  workedSeconds: number;
  breakSeconds: number;
  hourBankDeltaSeconds: number;
  note: string | null;
  createdAt: string;
};

type BatePontoHistoryPanelProps = {
  guildId: string;
};

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, string> = {
  start: "Iniciar",
  pause: "Pausar",
  resume: "Retomar",
  finish: "Finalizar",
};

function resolveDefaultAvatarUrl(userId: string) {
  try {
    const index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }

  return `${seconds}s`;
}

function formatTimestamp(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function truncateUserId(userId: string) {
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 6)}…${userId.slice(-4)}`;
}

function resolveActionLabel(action: string) {
  return ACTION_LABELS[action] || action;
}

export function BatePontoHistoryPanel({ guildId }: BatePontoHistoryPanelProps) {
  const [events, setEvents] = useState<BatePontoHistoryEvent[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState("");
  const [appliedUserFilter, setAppliedUserFilter] = useState("");

  const loadHistory = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const params = new URLSearchParams({
          guildId,
          limit: String(PAGE_SIZE),
          offset: String(nextOffset),
        });

        const trimmedFilter = appliedUserFilter.trim();
        if (trimmedFilter) {
          params.set("userId", trimmedFilter);
        }

        const response = await fetch(
          `/api/auth/me/guilds/bate-ponto-history?${params.toString()}`,
        );
        const payload = await response.json();

        if (!response.ok || !payload.ok) {
          throw new Error(payload.message || "Falha ao carregar historico de bate ponto.");
        }

        const nextEvents = Array.isArray(payload.events)
          ? (payload.events as BatePontoHistoryEvent[])
          : [];

        setEvents((current) => (append ? [...current, ...nextEvents] : nextEvents));
        setOffset(nextOffset + nextEvents.length);
        setHasMore(nextEvents.length >= PAGE_SIZE);
      } catch (error) {
        if (!append) {
          setEvents([]);
        }
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Erro ao carregar historico de bate ponto.",
        );
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [appliedUserFilter, guildId],
  );

  useEffect(() => {
    setOffset(0);
    void loadHistory(0, false);
  }, [loadHistory]);

  const totalLabel = useMemo(() => {
    if (!events.length) return "0 eventos";
    return `${events.length}${hasMore ? "+" : ""} eventos`;
  }, [events.length, hasMore]);

  return (
    <div className="space-y-[14px]">
      <div className="rounded-[24px] border border-[#161616] bg-[linear-gradient(180deg,#0B0B0B_0%,#090909_100%)] px-[18px] py-[18px] sm:px-[22px] sm:py-[22px]">
        <div className="flex flex-col gap-[14px] lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[12px] uppercase tracking-[0.18em] text-[#5F5F5F]">
              Bate Ponto
            </p>
            <h3 className="mt-[10px] text-[22px] leading-none font-medium tracking-[-0.04em] text-[#D1D1D1]">
              Historico de acoes
            </h3>
            <p className="mt-[10px] max-w-[760px] text-[14px] leading-[1.6] text-[#7B7B7B]">
              Revise inicios, pausas, retomadas e finalizacoes registrados pelo modulo.
            </p>
          </div>

          <span className="inline-flex h-[30px] items-center justify-center rounded-full border border-[#151515] bg-[#0B0B0B] px-[12px] text-[11px] uppercase tracking-[0.16em] text-[#686868]">
            {totalLabel}
          </span>
        </div>

        <div className="mt-[18px] flex flex-col gap-[10px] sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Filtrar por ID do usuario</span>
            <Filter
              className="pointer-events-none absolute left-[14px] top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#5A5A5A]"
              aria-hidden="true"
            />
            <input
              type="text"
              value={userFilter}
              onChange={(event) => setUserFilter(event.currentTarget.value)}
              placeholder="Filtrar por ID do usuario (opcional)"
              className="h-[48px] w-full rounded-[14px] border border-[#171717] bg-[#080808] pl-[42px] pr-[14px] text-[14px] text-[#D1D1D1] outline-none transition-all placeholder:text-[#3B3B3B] focus:border-[#262626]"
            />
          </label>
          <button
            type="button"
            onClick={() => setAppliedUserFilter(userFilter.trim())}
            disabled={isLoading}
            className="inline-flex h-[48px] items-center justify-center rounded-[14px] border border-[#1C1C1C] bg-[#111111] px-[18px] text-[14px] font-medium text-[#D8D8D8] transition-colors hover:bg-[#161616] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Aplicar filtro
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-[#161616] bg-[#0A0A0A]">
        {isLoading ? (
          <div className="flex min-h-[280px] items-center justify-center">
            <ButtonLoader />
          </div>
        ) : errorMessage ? (
          <div className="px-[18px] py-[24px]">
            <div className="rounded-[18px] border border-[#2A1717] bg-[#120909] px-[16px] py-[18px] text-[14px] text-[#D88484]">
              {errorMessage}
            </div>
          </div>
        ) : events.length === 0 ? (
          <div className="flex min-h-[280px] flex-col items-center justify-center px-[18px] py-[24px] text-center">
            <History className="h-[28px] w-[28px] text-[#4A4A4A]" aria-hidden="true" />
            <p className="mt-[12px] text-[16px] font-medium text-[#CFCFCF]">
              Nenhum evento encontrado
            </p>
            <p className="mt-[6px] max-w-[420px] text-[13px] leading-[1.6] text-[#737373]">
              Os registros de bate ponto aparecerao aqui assim que membros comecarem a usar o modulo.
            </p>
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] gap-[12px] border-b border-[#141414] px-[18px] py-[14px] text-[11px] uppercase tracking-[0.16em] text-[#5F5F5F] lg:grid">
              <span>Usuario</span>
              <span>Acao</span>
              <span>Duracao</span>
              <span>Data</span>
            </div>

            <div className="divide-y divide-[#141414]">
              {events.map((event) => (
                <article
                  key={event.id}
                  className="px-[18px] py-[14px]"
                >
                  <div className="grid grid-cols-1 gap-[12px] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] lg:items-center">
                    <div className="flex min-w-0 items-center gap-[12px]">
                      <Image
                        src={resolveDefaultAvatarUrl(event.userId)}
                        alt=""
                        width={36}
                        height={36}
                        unoptimized
                        className="rounded-full border border-[#1E1E1E] bg-[#111111]"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-[14px] font-medium text-[#D8D8D8]">
                          {truncateUserId(event.userId)}
                        </p>
                        {event.note ? (
                          <p className="mt-[2px] truncate text-[12px] text-[#6E6E6E]">
                            {event.note}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <span className="inline-flex items-center rounded-full border border-[#1A1A1A] bg-[#101010] px-[10px] py-[5px] text-[12px] font-medium text-[#CFCFCF]">
                        {resolveActionLabel(event.action)}
                      </span>
                    </div>

                    <div className="flex items-center gap-[8px] text-[13px] text-[#B8B8B8]">
                      <Clock3 className="h-[14px] w-[14px] text-[#666666]" aria-hidden="true" />
                      {formatDuration(event.workedSeconds)}
                    </div>

                    <div className="text-[13px] text-[#9A9A9A]">
                      {formatTimestamp(event.createdAt)}
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {hasMore ? (
              <div className="border-t border-[#141414] px-[18px] py-[16px]">
                <button
                  type="button"
                  onClick={() => void loadHistory(offset, true)}
                  disabled={isLoadingMore}
                  className="inline-flex h-[44px] w-full items-center justify-center rounded-[14px] border border-[#1C1C1C] bg-[#111111] text-[14px] font-medium text-[#D8D8D8] transition-colors hover:bg-[#161616] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoadingMore ? <ButtonLoader /> : "Carregar mais"}
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
