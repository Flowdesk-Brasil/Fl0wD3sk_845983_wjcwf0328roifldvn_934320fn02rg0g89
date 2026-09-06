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
import {
  readCachedBatePontoRanking,
  writeCachedBatePontoRanking,
} from "@/lib/servers/batePontoPanelCache";

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

const PODIUM_META = {
  1: {
    label: "Ouro",
    Icon: Crown,
    accent: "text-[#F4D03F]",
    accentSoft: "text-[#F4D03F]/80",
    ring: "border-[#F4D03F]/70 shadow-[0_0_28px_rgba(244,208,63,0.22)]",
    chip: "border-[#F4D03F]/25 bg-[#F4D03F]/[0.07] text-[#F4D03F]",
    pillar:
      "border-[#F4D03F]/30 bg-[linear-gradient(180deg,rgba(244,208,63,0.14)_0%,rgba(244,208,63,0.04)_38%,rgba(13,13,13,0.95)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_18px_48px_rgba(244,208,63,0.08)]",
    badge: "border-[#F4D03F]/35 bg-[#F4D03F]/10 text-[#F4D03F]",
    watermark: "text-[#F4D03F]/[0.07]",
    glow: "bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(244,208,63,0.12)_0%,transparent_72%)]",
    height: "h-[208px]",
    width: "max-w-[280px]",
    avatar: 84,
    scale: "sm:scale-[1.02]",
  },
  2: {
    label: "Prata",
    Icon: Medal,
    accent: "text-[#C8D4E8]",
    accentSoft: "text-[#C8D4E8]/75",
    ring: "border-[#C8D4E8]/55 shadow-[0_0_20px_rgba(200,212,232,0.1)]",
    chip: "border-[#C8D4E8]/20 bg-[#C8D4E8]/[0.06] text-[#C8D4E8]",
    pillar:
      "border-[#C8D4E8]/22 bg-[linear-gradient(180deg,rgba(200,212,232,0.1)_0%,rgba(200,212,232,0.03)_36%,rgba(13,13,13,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_14px_36px_rgba(0,0,0,0.28)]",
    badge: "border-[#C8D4E8]/28 bg-[#C8D4E8]/8 text-[#C8D4E8]",
    watermark: "text-[#C8D4E8]/[0.06]",
    glow: "",
    height: "h-[158px]",
    width: "max-w-[228px]",
    avatar: 68,
    scale: "",
  },
  3: {
    label: "Bronze",
    Icon: Trophy,
    accent: "text-[#D4956A]",
    accentSoft: "text-[#D4956A]/75",
    ring: "border-[#D4956A]/55 shadow-[0_0_18px_rgba(212,149,106,0.08)]",
    chip: "border-[#D4956A]/22 bg-[#D4956A]/[0.06] text-[#D4956A]",
    pillar:
      "border-[#D4956A]/22 bg-[linear-gradient(180deg,rgba(212,149,106,0.1)_0%,rgba(212,149,106,0.03)_34%,rgba(13,13,13,0.96)_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_32px_rgba(0,0,0,0.24)]",
    badge: "border-[#D4956A]/28 bg-[#D4956A]/8 text-[#D4956A]",
    watermark: "text-[#D4956A]/[0.06]",
    glow: "",
    height: "h-[132px]",
    width: "max-w-[228px]",
    avatar: 60,
    scale: "",
  },
} as const;

function RankingSkeleton() {
  return (
    <div className="space-y-[24px]">
      <div className="relative overflow-hidden rounded-[24px] border border-[#1C1C1C] bg-[#141414]/30 px-[12px] pb-[12px] pt-[28px] sm:px-[20px]">
        <div className="flex items-end justify-center gap-[8px] sm:gap-[14px]">
          {[158, 208, 132].map((height, index) => (
            <div key={index} className="flex w-full max-w-[228px] flex-col items-center">
              <div className="mb-[14px] h-[68px] w-[68px] animate-pulse rounded-full bg-[#171717]" />
              <div className="mb-[8px] h-[13px] w-[108px] animate-pulse rounded-full bg-[#141414]" />
              <div className="mb-[10px] h-[28px] w-[76px] animate-pulse rounded-full bg-[#1A1A1A]" />
              <div
                className="w-full animate-pulse rounded-t-[20px] border border-[#1C1C1C] bg-[#141414]"
                style={{ height }}
              />
            </div>
          ))}
        </div>
        <div className="mt-[10px] h-[3px] animate-pulse rounded-full bg-[#1C1C1C]" />
      </div>
      <div className="space-y-[8px]">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-[14px] rounded-[18px] border border-[#1C1C1C] bg-[#141414]/40 px-[16px] py-[14px]"
          >
            <div className="h-[28px] w-[28px] animate-pulse rounded-full bg-[#171717]" />
            <div className="h-[40px] w-[40px] animate-pulse rounded-full bg-[#1A1A1A]" />
            <div className="min-w-0 flex-1 space-y-[8px]">
              <div className="h-[14px] w-[42%] animate-pulse rounded-full bg-[#171717]" />
              <div className="h-[11px] w-[28%] animate-pulse rounded-full bg-[#141414]" />
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
  const meta = PODIUM_META[place];
  const { Icon } = meta;

  const pillar = (
    <div
      className={`relative flex w-full flex-col items-center justify-end overflow-hidden rounded-t-[20px] border px-[14px] pb-[16px] pt-[18px] ${meta.height} ${meta.width} ${meta.pillar}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-[10%] top-[8px] select-none text-[72px] font-bold leading-none tracking-[-0.06em] ${meta.watermark}`}
      >
        {place}
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)]"
      />
      <span
        className={`inline-flex h-[34px] w-[34px] items-center justify-center rounded-[11px] border ${meta.badge}`}
      >
        <Icon className="h-[16px] w-[16px]" strokeWidth={2} aria-hidden="true" />
      </span>
      <span
        className={`mt-[10px] inline-flex items-center rounded-full border px-[10px] py-[4px] text-[10px] font-semibold uppercase tracking-[0.2em] ${meta.badge}`}
      >
        {meta.label}
      </span>
    </div>
  );

  if (!entry) {
    return (
      <div className={`flex flex-1 flex-col items-center justify-end ${meta.scale}`}>
        <div className="mb-[14px] flex flex-col items-center text-center">
          <div
            className={`flex items-center justify-center rounded-full border border-dashed border-[#2A2A2A] bg-[#141414] ${place === 1 ? "h-[84px] w-[84px]" : place === 2 ? "h-[68px] w-[68px]" : "h-[60px] w-[60px]"}`}
          >
            <Icon className="h-[22px] w-[22px] text-[#4A4A4A]" aria-hidden="true" />
          </div>
          <p className="mt-[14px] text-[13px] font-medium text-[#5A5A5A]">Sem dados</p>
          <span className="mt-[8px] inline-flex rounded-full border border-[#1C1C1C] bg-[#141414] px-[10px] py-[4px] text-[11px] text-[#555555]">
            —
          </span>
        </div>
        <div className={`opacity-55 ${meta.width} w-full`}>{pillar}</div>
      </div>
    );
  }

  const label = resolveBatePontoMemberLabel(entry.userId, entry.displayName);

  return (
    <button
      type="button"
      onClick={() => onSelect(entry.userId)}
      className={`group flex flex-1 flex-col items-center justify-end text-left transition-transform duration-200 hover:-translate-y-[3px] ${meta.scale}`}
    >
      <div className="mb-[14px] flex flex-col items-center text-center">
        <div className="relative">
          <BatePontoMemberAvatar
            userId={entry.userId}
            displayName={entry.displayName}
            avatarUrl={entry.avatarUrl}
            size={meta.avatar}
            ringClassName={meta.ring}
          />
          <span
            className={`absolute -right-[4px] -top-[4px] inline-flex h-[28px] w-[28px] items-center justify-center rounded-[9px] border border-[#1C1C1C] bg-[#0D0D0D] ${meta.accent}`}
          >
            <Icon className="h-[14px] w-[14px]" strokeWidth={2.2} aria-hidden="true" />
          </span>
        </div>
        <p className="mt-[14px] max-w-[200px] truncate text-[14px] font-medium text-[#ECECEC] transition-colors group-hover:text-white">
          {label}
        </p>
        <span
          className={`mt-[8px] inline-flex items-center rounded-full border px-[12px] py-[5px] text-[18px] font-semibold tracking-[-0.04em] ${meta.chip}`}
        >
          {formatBatePontoWorkedDuration(entry.totalWorkedSeconds)}
        </span>
        <p className="mt-[8px] max-w-[210px] text-[11px] leading-[1.5] text-[#6E6E6E]">
          {entry.sessionCount} sessoes · banco {formatBatePontoHourBank(entry.hourBankSeconds)}
        </p>
      </div>
      {pillar}
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
    const cached = readCachedBatePontoRanking<RankingEntry[]>(guildId, periodDays);
    if (cached) {
      setRanking(cached);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }
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

      const nextRanking = Array.isArray(payload.ranking) ? payload.ranking : [];
      writeCachedBatePontoRanking(guildId, periodDays, nextRanking);
      setRanking(nextRanking);
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
        <div className="rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[18px] sm:px-[22px] sm:py-[22px]">
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

            <div className="inline-flex rounded-[14px] border border-[#1C1C1C] bg-[#141414] p-[4px]">
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
                        ? "bg-[#1A1A1A] text-[#F0F0F0] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
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

        <div className="rounded-[20px] border border-[#1C1C1C] bg-[#0D0D0D] px-[18px] py-[22px] sm:px-[24px] sm:py-[28px]">
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
              <div className="relative overflow-hidden rounded-[24px] border border-[#1C1C1C] bg-[#141414]/25 px-[8px] pb-[10px] pt-[26px] sm:px-[18px] sm:pt-[32px]">
                <div
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-x-0 top-0 h-[220px] ${PODIUM_META[1].glow}`}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-[8%] bottom-[10px] h-[3px] rounded-full bg-[linear-gradient(90deg,transparent,#2A2A2E_18%,#3A3A40_50%,#2A2A2E_82%,transparent)]"
                />
                <div className="relative flex items-end justify-center gap-[6px] sm:gap-[12px]">
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
              </div>

              {remainingEntries.length ? (
                <div className="mt-[28px] space-y-[8px]">
                  <p className="text-[12px] uppercase tracking-[0.18em] text-[#5F5F5F]">
                    Demais colocacoes
                  </p>
                  <div className="overflow-hidden rounded-[18px] border border-[#1C1C1C] bg-[#141414]/30">
                    {remainingEntries.map((entry, index) => (
                      <button
                        key={`${entry.userId}-${entry.rank}`}
                        type="button"
                        onClick={() => setSelectedUserId(entry.userId)}
                        className={`flex w-full items-center gap-[14px] px-[16px] py-[14px] text-left transition-colors hover:bg-[#171717] ${
                          index > 0 ? "border-t border-[#1C1C1C]" : ""
                        }`}
                      >
                        <span className="inline-flex h-[28px] w-[28px] items-center justify-center rounded-[8px] border border-[#1C1C1C] bg-[#0D0D0D] text-[12px] font-semibold tabular-nums text-[#9A9A9A]">
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
                          <p className="text-[14px] font-semibold tabular-nums text-[#EAEAEA]">
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
