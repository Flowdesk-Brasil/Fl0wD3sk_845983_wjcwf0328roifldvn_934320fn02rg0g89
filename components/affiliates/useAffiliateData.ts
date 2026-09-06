"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readClientDataCache,
  writeClientDataCache,
} from "@/lib/performance/clientData";
import type {
  AffiliateAIInsightCard,
  AffiliateCommission,
  AffiliateEnrollmentStatus,
  AffiliateLedgerEntry,
  AffiliateLink,
  AffiliateProfile,
  AffiliateProgramRules,
  AffiliateRankEntry,
  AffiliateStats,
  AffiliateWithdrawal,
} from "@/lib/affiliates/affiliateTypes";

export type AffiliateWorkspaceSettings = {
  notify_email?: boolean | null;
  notify_sms?: boolean | null;
  notify_push?: boolean | null;
  webhook_url?: string | null;
  webhook_enabled?: boolean | null;
  webhook_events?: string[] | null;
  webhook_secret_preview?: string | null;
  email_address?: string | null;
  sms_phone?: string | null;
};

export type AffiliateDataPayload = {
  /** false quando o usuario ainda nao aderiu ao programa. */
  enrolled: boolean;
  status: AffiliateEnrollmentStatus;
  /** Mensagem do servidor para os estados suspenso e termos vencidos. */
  statusMessage: string | null;
  rules: AffiliateProgramRules | null;
  profile: AffiliateProfile | null;
  stats: AffiliateStats | null;
  insight: AffiliateAIInsightCard | null;
  settings: AffiliateWorkspaceSettings | null;
  links: AffiliateLink[];
  conversions: AffiliateCommission[];
  withdrawals: AffiliateWithdrawal[];
  ranking: AffiliateRankEntry[];
  ledger: AffiliateLedgerEntry[];
};

const CACHE_KEY = "affiliate-workspace:v1";
const CACHE_TTL_MS = 90_000;
const RETRY_DELAYS_MS = [0, 400, 1100, 2200];
const REQUEST_TIMEOUT_MS = 14_000;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isRetryableStatus(status: number) {
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

const EMPTY_DATA: AffiliateDataPayload = {
  enrolled: false,
  status: "not_enrolled",
  statusMessage: null,
  rules: null,
  profile: null,
  stats: null,
  insight: null,
  settings: null,
  links: [],
  conversions: [],
  withdrawals: [],
  ranking: [],
  ledger: [],
};

async function fetchAffiliatePayload(signal: AbortSignal) {
  const response = await fetch("/api/affiliates/me", {
    credentials: "same-origin",
    signal,
    cache: "no-store",
  });
  const json = (await response.json()) as {
    ok?: boolean;
    enrolled?: boolean;
    status?: AffiliateEnrollmentStatus;
    message?: string;
    rules?: AffiliateProgramRules | null;
    profile?: AffiliateProfile | null;
    stats?: AffiliateStats | null;
    insight?: AffiliateAIInsightCard | null;
    settings?: AffiliateWorkspaceSettings | null;
    links?: AffiliateLink[];
    conversions?: AffiliateCommission[];
    withdrawals?: AffiliateWithdrawal[];
    ranking?: AffiliateRankEntry[];
    ledger?: AffiliateLedgerEntry[];
  };

  return { response, json };
}

function normalizePayload(json: Awaited<ReturnType<typeof fetchAffiliatePayload>>["json"]): AffiliateDataPayload | null {
  if (!json.ok) return null;

  return {
    enrolled: json.enrolled === true,
    status: json.status ?? (json.enrolled ? "active" : "not_enrolled"),
    statusMessage: json.message ?? null,
    rules: json.rules ?? null,
    profile: json.profile ?? null,
    stats: json.stats ?? null,
    insight: json.insight ?? null,
    settings: json.settings ?? null,
    links: json.links ?? [],
    conversions: json.conversions ?? [],
    withdrawals: json.withdrawals ?? [],
    ranking: json.ranking ?? [],
    ledger: json.ledger ?? [],
  };
}

export function useAffiliateData() {
  const [data, setData] = useState<AffiliateDataPayload | null>(() =>
    readClientDataCache<AffiliateDataPayload>(CACHE_KEY),
  );
  const [isLoading, setIsLoading] = useState(() => !readClientDataCache<AffiliateDataPayload>(CACHE_KEY));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const dataRef = useRef(data);

  // Escrever no ref durante o render faz o React reclamar e pode dessincronizar.
  // O ref so e lido dentro de load(), que roda em efeito ou evento, entao
  // atualizar depois do render e suficiente.
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const load = useCallback(async (options?: { force?: boolean }) => {
    const requestId = ++requestIdRef.current;
    const hasCachedData = Boolean(dataRef.current);
    const force = options?.force === true;

    if (hasCachedData && !force) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt > 0) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
      }
      if (requestId !== requestIdRef.current) return;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      try {
        const { response, json } = await fetchAffiliatePayload(controller.signal);
        window.clearTimeout(timeoutId);

        if (requestId !== requestIdRef.current) return;

        const payload = normalizePayload(json);
        if (payload) {
          setData(payload);
          writeClientDataCache(CACHE_KEY, payload, CACHE_TTL_MS);
          setErrorMessage(null);
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }

        if (!isRetryableStatus(response.status) || attempt === RETRY_DELAYS_MS.length - 1) {
          setErrorMessage("Não foi possível carregar os dados de afiliado.");
          if (!hasCachedData) {
            setData(EMPTY_DATA);
          }
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }
      } catch (error) {
        window.clearTimeout(timeoutId);
        if (requestId !== requestIdRef.current) return;

        const isAbort = error instanceof DOMException && error.name === "AbortError";
        if (!isAbort && attempt === RETRY_DELAYS_MS.length - 1) {
          setErrorMessage("Não foi possível carregar os dados de afiliado.");
          if (!hasCachedData) {
            setData(EMPTY_DATA);
          }
          setIsLoading(false);
          setIsRefreshing(false);
          return;
        }
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    ...(data ?? EMPTY_DATA),
    loading: isLoading,
    isRefreshing,
    errorMessage,
    reload: () => load({ force: true }),
  };
}
