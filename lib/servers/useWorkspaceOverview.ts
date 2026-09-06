"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readClientDataCache,
  writeClientDataCache,
} from "@/lib/performance/clientData";

export type WorkspaceOverviewPayload = {
  ok: boolean;
  message?: string;
  stats: {
    receivable: number;
    receivableCount: number;
    received: number;
    receivedCount: number;
    receivedThisMonth: number;
    overdue: number;
    overdueCount: number;
    cancelledCount: number;
    openTickets: number;
  };
  chart: Array<{ key: string; label: string; received: number; forecast: number }>;
  charges: Array<Record<string, unknown>>;
  upcoming: Array<{ id: string; name: string; detail: string; initials: string }>;
  tickets: Array<{ id: string; title: string; meta: string }>;
  activity: Array<{ title: string; meta: string; at: string | null }>;
};

const RETRY_DELAYS_MS = [0, 400, 1100, 2200];
const REQUEST_TIMEOUT_MS = 14_000;
const CACHE_TTL_MS = 90_000;

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function cacheKeyForGuild(guildId: string) {
  return `workspace-overview:${guildId}`;
}

function isRetryableStatus(status: number) {
  return status === 401 || status === 408 || status === 429 || status >= 500;
}

async function fetchOverviewPayload(guildId: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/auth/me/guilds/workspace-overview?guildId=${encodeURIComponent(guildId)}`,
    {
      credentials: "same-origin",
      signal,
      cache: "no-store",
    },
  );

  const payload = (await response.json()) as WorkspaceOverviewPayload;
  return { response, payload };
}

export function useWorkspaceOverview(guildId: string) {
  const key = cacheKeyForGuild(guildId);
  const [data, setData] = useState<WorkspaceOverviewPayload | null>(() =>
    readClientDataCache<WorkspaceOverviewPayload>(key),
  );
  const [isLoading, setIsLoading] = useState(() => !readClientDataCache<WorkspaceOverviewPayload>(key));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const load = useCallback(
    async (options?: { force?: boolean }) => {
      const requestId = ++requestIdRef.current;
      const hasCachedData = Boolean(dataRef.current);
      const force = options?.force === true;

      if (hasCachedData && !force) {
        setIsRefreshing(true);
      } else {
        setIsLoading(true);
      }
      setErrorMessage(null);

      let lastMessage = "Nao foi possivel carregar a visao geral.";

      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
        if (requestId !== requestIdRef.current) return;

        if (RETRY_DELAYS_MS[attempt] > 0) {
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
        if (requestId !== requestIdRef.current) return;

        const controller = new AbortController();
        const timeoutId = window.setTimeout(
          () => controller.abort("workspace_overview_timeout"),
          REQUEST_TIMEOUT_MS,
        );

        try {
          const { response, payload } = await fetchOverviewPayload(guildId, controller.signal);

          if (requestId !== requestIdRef.current) return;

          if (payload?.ok) {
            setData(payload);
            writeClientDataCache(key, payload, CACHE_TTL_MS, "session");
            setErrorMessage(null);
            return;
          }

          lastMessage = payload?.message || lastMessage;

          if (isRetryableStatus(response.status) && attempt < RETRY_DELAYS_MS.length - 1) {
            continue;
          }

          if (!dataRef.current) {
            setErrorMessage(lastMessage);
          }
          return;
        } catch (error) {
          if (requestId !== requestIdRef.current) return;

          if (error instanceof DOMException && error.name === "AbortError") {
            lastMessage = "A visao geral demorou para responder. Tente novamente.";
          } else if (error instanceof Error && error.message) {
            lastMessage = error.message;
          }

          if (attempt < RETRY_DELAYS_MS.length - 1) {
            continue;
          }

          if (!dataRef.current) {
            setErrorMessage(lastMessage);
          }
          return;
        } finally {
          window.clearTimeout(timeoutId);
          if (requestId === requestIdRef.current) {
            setIsLoading(false);
            setIsRefreshing(false);
          }
        }
      }
    },
    [guildId, key],
  );

  useEffect(() => {
    const cached = readClientDataCache<WorkspaceOverviewPayload>(key);
    setData(cached);
    setIsLoading(!cached);
    setErrorMessage(null);
    requestIdRef.current += 1;
    void load({ force: Boolean(cached) });
    return () => {
      requestIdRef.current += 1;
    };
  }, [guildId, key, load]);

  return {
    data,
    isLoading,
    isRefreshing,
    errorMessage,
    reload: () => load({ force: true }),
  };
}
