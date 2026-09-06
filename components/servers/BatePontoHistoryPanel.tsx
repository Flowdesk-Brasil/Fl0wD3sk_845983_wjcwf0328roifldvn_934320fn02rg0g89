"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Filter, History } from "lucide-react";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import { BatePontoMemberAvatar } from "@/components/servers/BatePontoMemberAvatar";
import { BatePontoUserDetailSheet } from "@/components/servers/BatePontoUserDetailSheet";
import {
  formatBatePontoDetailedDuration,
  formatBatePontoTimestamp,
  resolveBatePontoActionLabel,
  resolveBatePontoMemberLabel,
} from "@/lib/servers/batePontoFormatting";

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
  displayName?: string;
  mentionLabel?: string;
  avatarUrl?: string | null;
};

type BatePontoHistoryPanelProps = {
  guildId: string;
};

const PAGE_SIZE = 50;
const SNOWFLAKE_REGEX = /^\d{17,20}$/;

function HistorySkeleton() {
  return (
    <div className="divide-y divide-[#141414]">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="px-[18px] py-[14px]">
          <div className="grid grid-cols-1 gap-[12px] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] lg:items-center">
            <div className="flex items-center gap-[12px]">
              <div className="h-[36px] w-[36px] animate-pulse rounded-full bg-[#151515]" />
              <div className="min-w-0 flex-1 space-y-[8px]">
                <div className="h-[14px] w-[38%] animate-pulse rounded-full bg-[#171717]" />
                <div className="h-[11px] w-[24%] animate-pulse rounded-full bg-[#121212]" />
              </div>
            </div>
            <div className="h-[28px] w-[88px] animate-pulse rounded-full bg-[#121212]" />
            <div className="h-[14px] w-[72px] animate-pulse rounded-full bg-[#141414]" />
            <div className="h-[14px] w-[110px] animate-pulse rounded-full bg-[#141414]" />
          </div>
        </div>
      ))}
    </div>
  );
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

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
        if (trimmedFilter && SNOWFLAKE_REGEX.test(trimmedFilter)) {
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

  const visibleEvents = useMemo(() => {
    const trimmedFilter = appliedUserFilter.trim();
    if (!trimmedFilter || SNOWFLAKE_REGEX.test(trimmedFilter)) {
      return events;
    }

    const query = trimmedFilter.toLowerCase();
    return events.filter((event) => {
      const label = resolveBatePontoMemberLabel(
        event.userId,
        event.displayName,
      ).toLowerCase();
      return label.includes(query) || event.userId.includes(trimmedFilter);
    });
  }, [appliedUserFilter, events]);

  const totalLabel = useMemo(() => {
    if (!visibleEvents.length) return "0 eventos";
    return `${visibleEvents.length}${hasMore ? "+" : ""} eventos`;
  }, [hasMore, visibleEvents.length]);

  return (
    <>
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
                Revise inicios, pausas, retomadas e finalizacoes. Clique em um membro para abrir o painel completo de marcacoes.
              </p>
            </div>

            <span className="inline-flex h-[30px] items-center justify-center rounded-full border border-[#151515] bg-[#0B0B0B] px-[12px] text-[11px] uppercase tracking-[0.16em] text-[#686868]">
              {totalLabel}
            </span>
          </div>

          <div className="mt-[18px] flex flex-col gap-[10px] sm:flex-row">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Filtrar por nome ou ID do usuario</span>
              <Filter
                className="pointer-events-none absolute left-[14px] top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#5A5A5A]"
                aria-hidden="true"
              />
              <input
                type="text"
                value={userFilter}
                onChange={(event) => setUserFilter(event.currentTarget.value)}
                placeholder="Filtrar por nome ou ID do usuario"
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
            <>
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] gap-[12px] border-b border-[#141414] px-[18px] py-[14px] text-[11px] uppercase tracking-[0.16em] text-[#5F5F5F] lg:grid">
                <span>Usuario</span>
                <span>Acao</span>
                <span>Duracao</span>
                <span>Data</span>
              </div>
              <HistorySkeleton />
            </>
          ) : errorMessage ? (
            <div className="px-[18px] py-[24px]">
              <div className="rounded-[18px] border border-[#2A1717] bg-[#120909] px-[16px] py-[18px] text-[14px] text-[#D88484]">
                {errorMessage}
              </div>
            </div>
          ) : visibleEvents.length === 0 ? (
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
                {visibleEvents.map((event) => (
                  <article key={event.id} className="px-[18px] py-[14px]">
                    <div className="grid grid-cols-1 gap-[12px] lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_minmax(0,0.9fr)] lg:items-center">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(event.userId)}
                        className="flex min-w-0 items-center gap-[12px] rounded-[14px] text-left transition-colors hover:bg-[#101010] lg:-ml-[8px] lg:px-[8px] lg:py-[6px]"
                      >
                        <BatePontoMemberAvatar
                          userId={event.userId}
                          displayName={event.displayName}
                          avatarUrl={event.avatarUrl}
                          size={36}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-medium text-[#D8D8D8]">
                            {resolveBatePontoMemberLabel(
                              event.userId,
                              event.displayName,
                            )}
                          </p>
                          {event.note ? (
                            <p className="mt-[2px] truncate text-[12px] text-[#6E6E6E]">
                              {event.note}
                            </p>
                          ) : (
                            <p className="mt-[2px] truncate text-[12px] text-[#555555]">
                              Ver marcacoes completas
                            </p>
                          )}
                        </div>
                      </button>

                      <div>
                        <span className="inline-flex items-center rounded-full border border-[#1A1A1A] bg-[#101010] px-[10px] py-[5px] text-[12px] font-medium text-[#CFCFCF]">
                          {resolveBatePontoActionLabel(event.action)}
                        </span>
                      </div>

                      <div className="flex items-center gap-[8px] text-[13px] text-[#B8B8B8]">
                        <Clock3 className="h-[14px] w-[14px] text-[#666666]" aria-hidden="true" />
                        {formatBatePontoDetailedDuration(event.workedSeconds)}
                      </div>

                      <div className="text-[13px] text-[#9A9A9A]">
                        {formatBatePontoTimestamp(event.createdAt)}
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

      <BatePontoUserDetailSheet
        guildId={guildId}
        userId={selectedUserId}
        onClose={() => setSelectedUserId(null)}
      />
    </>
  );
}
