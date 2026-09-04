"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Crown, Medal, Trophy } from "lucide-react";
import { BatePontoMemberAvatar } from "@/components/servers/BatePontoMemberAvatar";
import { BatePontoUserDetailSheet } from "@/components/servers/BatePontoUserDetailSheet";
import {
  formatBatePontoHourBank,
  formatBatePontoWorkedDuration,
  resolveBatePontoMemberLabel,
} from "@/lib/servers/batePontoFormatting";

type RankingEntry = {
  userId: string;
  totalWorkedSeconds: number;
  sessionCount: number;
  hourBankSeconds: number;
  rank: number;
  displayName?: string;
  mentionLabel?: string;
  avatarUrl?: string | null;
};

type BatePontoRankingPanelProps = {
  guildId: string;
};

const PERIOD_OPTIONS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

function RankingSkeleton() {
  return (
    <div className="space-y-[24px]">
      <div className="flex items-end justify-center gap-[14px] sm:gap-[20px]">
        {[132, 188, 116].map((height, index) => (
          <div key={index} className="flex w-full max-w-[220px] flex-col items-center">
            <div className="mb-[12px] h-[72px] w-[72px] animate-pulse rounded-full bg-[#151515]" />
            <div className="mb-[8px] h-[14px] w-[120px] animate-pulse rounded-full bg-[#141414]" />
            <div className="mb-[6px] h-[18px] w-[72px] animate-pulse rounded-full bg-[#171717]" />
            <div
              className="mt-[10px] w-full animate-pulse rounded-t-[24px] bg-[#121212]"
              style={{ height }}
            />
          </div>
        ))}
      </div>
      <div className="space-y-[8px]">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-[14px] rounded-[18px] border border-[#141414] px-[16px] py-[14px]"
          >
            <div className="h-[28px] w-[28px] animate-pulse rounded-full bg-[#141414]" />
            <div className="h-[40px] w-[40px] animate-pulse rounded-full bg-[#151515]" />
            <div className="min-w-0 flex-1 space-y-[8px]">
              <div className="h-[14px] w-[42%] animate-pulse rounded-full bg-[#171717]" />
              <div className="h-[11px] w-[28%] animate-pulse rounded-full bg-[#121212]" />
            </div>
            <div className="h-[14px] w-[56px] animate-pulse rounded-full bg-[#171717]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function PodiumPlace({
  entry,
  place,
  onSelect,
}: {
  entry: RankingEntry | null;
  place: 1 | 2 | 3;
  onSelect: (userId: string) => void;
}) {
  const podiumHeight = place === 1 ? "h-[190px]" : place === 2 ? "h-[148px]" : "h-[124px]";
  const avatarSize = place === 1 ? 78 : place === 2 ? 64 : 56;
  const podiumTone =
    place === 1
      ? "from-[#3A2E0C]/90 via-[#171309] to-[#0A0A0A] border-[#4A3C16] shadow-[0_0_40px_rgba(245,215,110,0.08)]"
      : place === 2
        ? "from-[#23242A]/90 via-[#121218] to-[#0A0A0A] border-[#30323A] shadow-[0_0_30px_rgba(199,208,224,0.05)]"
        : "from-[#2A1C12]/90 via-[#140E09] to-[#0A0A0A] border-[#3A281A] shadow-[0_0_30px_rgba(216,160,110,0.05)]";
  const accentClass =
    place === 1 ? "text-[#F5D76E]" : place === 2 ? "text-[#C7D0E0]" : "text-[#D8A06E]";
  const ringClass =
    place === 1
      ? "border-[#F5D76E]/75 shadow-[0_0_24px_rgba(245,215,110,0.18)]"
      : place === 2
        ? "border-[#C7D0E0]/65"
        : "border-[#D8A06E]/65";
  const Icon = place === 1 ? Crown : place === 2 ? Medal : Trophy;

  if (!entry) {
    return (
      <div className="flex flex-1 flex-col items-center justify-end">
        <div
          className={`flex w-full max-w-[240px] flex-col items-center justify-end rounded-t-[26px] border bg-[#0A0A0A] px-[16px] pb-[18px] pt-[22px] ${podiumHeight}`}
        >
          <div className="flex h-[56px] w-[56px] items-center justify-center rounded-full border border-dashed border-[#252525] bg-[#101010] text-[#4A4A4A]">
            <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
          </div>
          <p className="mt-[14px] text-[13px] font-medium text-[#5A5A5A]">Sem dados</p>
          <p className={`mt-[10px] text-[11px] uppercase tracking-[0.18em] ${accentClass}`}>
            {place === 1 ? "Ouro" : place === 2 ? "Prata" : "Bronze"}
          </p>
        </div>
      </div>
    );
  }

  const label = resolveBatePontoMemberLabel(entry.userId, entry.displayName);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.userId)}
      className="group flex flex-1 flex-col items-center justify-end text-left transition-transform hover:-translate-y-[2px]"
    >
      <div className="mb-[12px] flex flex-col items-center text-center">
        <div className="relative">
          <BatePontoMemberAvatar
            userId={entry.userId}
            displayName={entry.displayName}
            avatarUrl={entry.avatarUrl}
            size={avatarSize}
            ringClassName={ringClass}
          />
          <span
            className={`absolute -bottom-[8px] left-1/2 inline-flex h-[26px] min-w-[26px] -translate-x-1/2 items-center justify-center rounded-full border border-[#202020] bg-[#0A0A0A] px-[8px] text-[11px] font-semibold ${accentClass}`}
          >
            #{entry.rank}
          </span>
        </div>
        <p className="mt-[16px] max-w-[190px] truncate text-[14px] font-medium text-[#E4E4E4] group-hover:text-white">
          {label}
        </p>
        <p className={`mt-[4px] text-[20px] font-semibold tracking-[-0.04em] ${accentClass}`}>
          {formatBatePontoWorkedDuration(entry.totalWorkedSeconds)}
        </p>
        <p className="mt-[4px] text-[11px] text-[#707070]">
          {entry.sessionCount} sessoes · banco {formatBatePontoHourBank(entry.hourBankSeconds)}
        </p>
      </div>

      <div
        className={`flex w-full max-w-[240px] flex-col items-center justify-end rounded-t-[26px] border bg-gradient-to-b px-[16px] pb-[18px] pt-[20px] ${podiumHeight} ${podiumTone}`}
      >
        <Icon className={`h-[24px] w-[24px] ${accentClass}`} aria-hidden="true" />
        <p className={`mt-[10px] text-[11px] uppercase tracking-[0.2em] ${accentClass}`}>
          {place === 1 ? "Ouro" : place === 2 ? "Prata" : "Bronze"}
        </p>
      </div>
    </button>
  );
}

export function BatePontoRankingPanel({ guildId }: BatePontoRankingPanelProps) {
  const [periodDays, setPeriodDays] = useState(30);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const loadRanking = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const params = new URLSearchParams({
        guildId,
        periodDays: String(periodDays),
      });
      const response = await fetch(
        `/api/auth/me/guilds/bate-ponto-ranking?${params.toString()}`,
      );
      const payload = await response.json();

      if (!response.ok || !payload.ok) {
        throw new Error(payload.message || "Falha ao carregar ranking de bate ponto.");
      }

      setRanking(Array.isArray(payload.ranking) ? payload.ranking : []);
    } catch (error) {
      setRanking([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Erro ao carregar ranking de bate ponto.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [guildId, periodDays]);

  useEffect(() => {
    void loadRanking();
  }, [loadRanking]);

  const podiumEntries = useMemo(() => {
    const topThree = ranking.slice(0, 3);
    return {
      first: topThree[0] ?? null,
      second: topThree[1] ?? null,
      third: topThree[2] ?? null,
    };
  }, [ranking]);

  const remainingEntries = useMemo(() => ranking.slice(3), [ranking]);

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
                Ranking de horas trabalhadas
              </h3>
              <p className="mt-[10px] max-w-[760px] text-[14px] leading-[1.6] text-[#7B7B7B]">
                Acompanhe quem mais registrou expediente no periodo selecionado. Clique em um membro para ver as marcacoes dele.
              </p>
            </div>

            <div className="inline-flex rounded-[14px] border border-[#171717] bg-[#080808] p-[4px]">
              {PERIOD_OPTIONS.map((option) => {
                const isActive = option.days === periodDays;
                return (
                  <button
                    key={option.days}
                    type="button"
                    onClick={() => setPeriodDays(option.days)}
                    disabled={isLoading}
                    className={`rounded-[10px] px-[12px] py-[8px] text-[12px] font-medium transition-colors ${
                      isActive
                        ? "bg-[#1A1A1A] text-[#F0F0F0]"
                        : "text-[#8A8A8A] hover:text-[#D0D0D0]"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-[#161616] bg-[#0A0A0A] px-[18px] py-[22px] sm:px-[24px] sm:py-[28px]">
          {isLoading ? (
            <RankingSkeleton />
          ) : errorMessage ? (
            <div className="rounded-[18px] border border-[#2A1717] bg-[#120909] px-[16px] py-[18px] text-[14px] text-[#D88484]">
              {errorMessage}
            </div>
          ) : ranking.length === 0 ? (
            <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <Trophy className="h-[28px] w-[28px] text-[#4A4A4A]" aria-hidden="true" />
              <p className="mt-[12px] text-[16px] font-medium text-[#CFCFCF]">
                Nenhum registro no periodo
              </p>
              <p className="mt-[6px] max-w-[420px] text-[13px] leading-[1.6] text-[#737373]">
                Quando membros comecarem a bater ponto, o ranking aparecera aqui automaticamente.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-end justify-center gap-[10px] sm:gap-[16px]">
                <PodiumPlace
                  entry={podiumEntries.second}
                  place={2}
                  onSelect={setSelectedUserId}
                />
                <PodiumPlace
                  entry={podiumEntries.first}
                  place={1}
                  onSelect={setSelectedUserId}
                />
                <PodiumPlace
                  entry={podiumEntries.third}
                  place={3}
                  onSelect={setSelectedUserId}
                />
              </div>

              {remainingEntries.length ? (
                <div className="mt-[28px] space-y-[8px]">
                  <p className="text-[12px] uppercase tracking-[0.18em] text-[#5F5F5F]">
                    Demais colocacoes
                  </p>
                  <div className="overflow-hidden rounded-[18px] border border-[#171717]">
                    {remainingEntries.map((entry, index) => (
                      <button
                        key={`${entry.userId}-${entry.rank}`}
                        type="button"
                        onClick={() => setSelectedUserId(entry.userId)}
                        className={`flex w-full items-center gap-[14px] px-[16px] py-[14px] text-left transition-colors hover:bg-[#101010] ${
                          index > 0 ? "border-t border-[#141414]" : ""
                        }`}
                      >
                        <span className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#121212] text-[12px] font-semibold text-[#9A9A9A]">
                          {entry.rank}
                        </span>
                        <BatePontoMemberAvatar
                          userId={entry.userId}
                          displayName={entry.displayName}
                          avatarUrl={entry.avatarUrl}
                          size={40}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14px] font-medium text-[#D8D8D8]">
                            {resolveBatePontoMemberLabel(entry.userId, entry.displayName)}
                          </p>
                          <p className="mt-[2px] text-[12px] text-[#6E6E6E]">
                            {entry.sessionCount} sessoes · banco{" "}
                            {formatBatePontoHourBank(entry.hourBankSeconds)}
                          </p>
                        </div>
                        <div className="flex items-center gap-[8px]">
                          <p className="text-[14px] font-semibold text-[#EAEAEA]">
                            {formatBatePontoWorkedDuration(entry.totalWorkedSeconds)}
                          </p>
                          <ChevronRight className="h-[16px] w-[16px] text-[#555555]" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      <BatePontoUserDetailSheet
        guildId={guildId}
        userId={selectedUserId}
        periodDays={periodDays}
        onClose={() => setSelectedUserId(null)}
      />
    </>
  );
}
