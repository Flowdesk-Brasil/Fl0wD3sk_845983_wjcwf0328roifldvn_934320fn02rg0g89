"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Medal, Trophy } from "lucide-react";
import { ButtonLoader } from "@/components/login/ButtonLoader";

type RankingEntry = {
  userId: string;
  totalWorkedSeconds: number;
  sessionCount: number;
  hourBankSeconds: number;
  rank: number;
};

type BatePontoRankingPanelProps = {
  guildId: string;
};

const PERIOD_OPTIONS = [
  { days: 7, label: "7 dias" },
  { days: 30, label: "30 dias" },
  { days: 90, label: "90 dias" },
] as const;

function resolveDefaultAvatarUrl(userId: string) {
  try {
    const index = Number((BigInt(userId) >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

function formatWorkedDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours >= 1) {
    return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
  }

  return `${minutes}m`;
}

function formatHourBank(totalSeconds: number) {
  const safeSeconds = Number(totalSeconds) || 0;
  const sign = safeSeconds < 0 ? "-" : "+";
  const absolute = Math.abs(safeSeconds);
  const hours = Math.floor(absolute / 3600);
  const minutes = Math.floor((absolute % 3600) / 60);
  return `${sign}${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

function truncateUserId(userId: string) {
  if (userId.length <= 10) return userId;
  return `${userId.slice(0, 6)}…${userId.slice(-4)}`;
}

function PodiumPlace({
  entry,
  place,
}: {
  entry: RankingEntry | null;
  place: 1 | 2 | 3;
}) {
  const heightClass =
    place === 1 ? "h-[168px]" : place === 2 ? "h-[132px]" : "h-[108px]";
  const avatarSize = place === 1 ? 72 : place === 2 ? 60 : 52;
  const podiumTone =
    place === 1
      ? "from-[#2A2208] via-[#15120A] to-[#0A0A0A] border-[#3A3218]"
      : place === 2
        ? "from-[#1A1A1F] via-[#101015] to-[#0A0A0A] border-[#2A2A32]"
        : "from-[#22170F] via-[#120D09] to-[#0A0A0A] border-[#35261A]";
  const accentClass =
    place === 1 ? "text-[#F5D76E]" : place === 2 ? "text-[#C7D0E0]" : "text-[#D8A06E]";
  const Icon = place === 1 ? Crown : place === 2 ? Medal : Trophy;

  if (!entry) {
    return (
      <div className="flex flex-1 flex-col items-center justify-end">
        <div
          className={`flex w-full max-w-[220px] flex-col items-center justify-end rounded-[22px] border bg-[#0A0A0A] px-[14px] pb-[16px] pt-[18px] ${heightClass}`}
        >
          <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full border border-[#1E1E1E] bg-[#111111] text-[#555555]">
            <Icon className="h-[20px] w-[20px]" aria-hidden="true" />
          </div>
          <p className="mt-[12px] text-[13px] font-medium text-[#666666]">Sem dados</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-end">
      <div className="mb-[10px] flex flex-col items-center text-center">
        <div className="relative">
          <Image
            src={resolveDefaultAvatarUrl(entry.userId)}
            alt=""
            width={avatarSize}
            height={avatarSize}
            unoptimized
            className={`rounded-full border-2 ${
              place === 1
                ? "border-[#F5D76E]/70"
                : place === 2
                  ? "border-[#C7D0E0]/60"
                  : "border-[#D8A06E]/60"
            } bg-[#111111]`}
          />
          <span
            className={`absolute -bottom-[8px] left-1/2 inline-flex h-[24px] min-w-[24px] -translate-x-1/2 items-center justify-center rounded-full border border-[#202020] bg-[#0A0A0A] px-[7px] text-[11px] font-semibold ${accentClass}`}
          >
            #{entry.rank}
          </span>
        </div>
        <p className="mt-[14px] max-w-[180px] truncate text-[13px] font-medium text-[#D8D8D8]">
          {truncateUserId(entry.userId)}
        </p>
        <p className={`mt-[4px] text-[18px] font-semibold tracking-[-0.03em] ${accentClass}`}>
          {formatWorkedDuration(entry.totalWorkedSeconds)}
        </p>
        <p className="mt-[2px] text-[11px] text-[#6E6E6E]">
          {entry.sessionCount} sessoes · banco {formatHourBank(entry.hourBankSeconds)}
        </p>
      </div>

      <div
        className={`flex w-full max-w-[220px] flex-col items-center justify-end rounded-t-[22px] border bg-gradient-to-b px-[14px] pb-[16px] pt-[18px] ${heightClass} ${podiumTone}`}
      >
        <Icon className={`h-[22px] w-[22px] ${accentClass}`} aria-hidden="true" />
        <p className={`mt-[8px] text-[12px] uppercase tracking-[0.18em] ${accentClass}`}>
          {place === 1 ? "Ouro" : place === 2 ? "Prata" : "Bronze"}
        </p>
      </div>
    </div>
  );
}

export function BatePontoRankingPanel({ guildId }: BatePontoRankingPanelProps) {
  const [periodDays, setPeriodDays] = useState(30);
  const [ranking, setRanking] = useState<RankingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
              Acompanhe quem mais registrou expediente no periodo selecionado, com destaque para o top 3.
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
          <div className="flex min-h-[280px] items-center justify-center">
            <ButtonLoader />
          </div>
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
            <div className="flex items-end justify-center gap-[12px] sm:gap-[18px]">
              <PodiumPlace entry={podiumEntries.second} place={2} />
              <PodiumPlace entry={podiumEntries.first} place={1} />
              <PodiumPlace entry={podiumEntries.third} place={3} />
            </div>

            {remainingEntries.length ? (
              <div className="mt-[24px] space-y-[8px]">
                <p className="text-[12px] uppercase tracking-[0.18em] text-[#5F5F5F]">
                  Demais colocacoes
                </p>
                <div className="overflow-hidden rounded-[18px] border border-[#171717]">
                  {remainingEntries.map((entry, index) => (
                    <div
                      key={`${entry.userId}-${entry.rank}`}
                      className={`flex items-center gap-[14px] px-[16px] py-[14px] ${
                        index > 0 ? "border-t border-[#141414]" : ""
                      }`}
                    >
                      <span className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#121212] text-[12px] font-semibold text-[#9A9A9A]">
                        {entry.rank}
                      </span>
                      <Image
                        src={resolveDefaultAvatarUrl(entry.userId)}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="rounded-full border border-[#1E1E1E] bg-[#111111]"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium text-[#D8D8D8]">
                          {truncateUserId(entry.userId)}
                        </p>
                        <p className="mt-[2px] text-[12px] text-[#6E6E6E]">
                          {entry.sessionCount} sessoes · banco {formatHourBank(entry.hourBankSeconds)}
                        </p>
                      </div>
                      <p className="text-[14px] font-semibold text-[#EAEAEA]">
                        {formatWorkedDuration(entry.totalWorkedSeconds)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
