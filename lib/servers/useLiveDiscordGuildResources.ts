"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  mapDiscordCategoryOptions,
  mapDiscordRoleOptions,
  mapDiscordTextChannelOptions,
  mapDiscordVoiceChannelOptions,
  mergeDiscordResourceOptions,
  type DiscordResourceSelectOption,
} from "@/lib/servers/discordGuildResourceOptions";

const DEFAULT_POLL_INTERVAL_MS = 12_000;
const REFRESH_DEBOUNCE_MS = 700;

type GuildChannelsApiResponse = {
  ok: boolean;
  message?: string;
  channels?: {
    text: Array<{ id: string; name: string }>;
    voice?: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
  };
};

type GuildRolesApiResponse = {
  ok: boolean;
  message?: string;
  roles?: Array<{ id: string; name: string }>;
};

type ResourceSnapshot = {
  textChannelOptions: DiscordResourceSelectOption[];
  voiceChannelOptions: DiscordResourceSelectOption[];
  categoryOptions: DiscordResourceSelectOption[];
  roleOptions: DiscordResourceSelectOption[];
};

type PreserveResourceIds = {
  channelIds?: string[];
  categoryIds?: string[];
  roleIds?: string[];
};

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
}

export function useLiveDiscordGuildResources(
  guildId: string | null,
  options?: {
    enabled?: boolean;
    pollIntervalMs?: number;
    preserveResourceIds?: PreserveResourceIds;
  },
) {
  const enabled = options?.enabled ?? Boolean(guildId);
  const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const preserveResourceIdsRef = useRef<PreserveResourceIds>({});
  preserveResourceIdsRef.current = options?.preserveResourceIds ?? {};

  const [textChannelOptions, setTextChannelOptions] = useState<
    DiscordResourceSelectOption[]
  >([]);
  const [voiceChannelOptions, setVoiceChannelOptions] = useState<
    DiscordResourceSelectOption[]
  >([]);
  const [categoryOptions, setCategoryOptions] = useState<
    DiscordResourceSelectOption[]
  >([]);
  const [roleOptions, setRoleOptions] = useState<DiscordResourceSelectOption[]>(
    [],
  );
  const [isRefreshingResources, setIsRefreshingResources] = useState(false);
  const [hasLoadedResourcesOnce, setHasLoadedResourcesOnce] = useState(false);

  const inflightRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const lastForceFreshAtRef = useRef(0);

  const applyResourceSnapshot = useCallback((snapshot: Partial<ResourceSnapshot>) => {
    if (snapshot.textChannelOptions) {
      setTextChannelOptions(snapshot.textChannelOptions);
    }
    if (snapshot.voiceChannelOptions) {
      setVoiceChannelOptions(snapshot.voiceChannelOptions);
    }
    if (snapshot.categoryOptions) {
      setCategoryOptions(snapshot.categoryOptions);
    }
    if (snapshot.roleOptions) {
      setRoleOptions(snapshot.roleOptions);
    }
  }, []);

  const refreshResources = useCallback(
    async (input?: { forceFresh?: boolean; scope?: "all" | "channels" | "roles" }) => {
      if (!guildId || !enabled) return;

      const scope = input?.scope ?? "all";
      const forceFresh = input?.forceFresh === true;
      const now = Date.now();

      if (
        forceFresh &&
        now - lastForceFreshAtRef.current < REFRESH_DEBOUNCE_MS
      ) {
        return;
      }

      if (!forceFresh && now - lastRefreshAtRef.current < REFRESH_DEBOUNCE_MS) {
        return;
      }

      if (inflightRef.current) {
        await inflightRef.current.catch(() => undefined);
        if (
          forceFresh &&
          now - lastForceFreshAtRef.current < REFRESH_DEBOUNCE_MS
        ) {
          return;
        }
      }

      const request = (async () => {
        setIsRefreshingResources(true);

        try {
          const preserve = preserveResourceIdsRef.current;
          const requests: Array<Promise<void>> = [];

          if (scope === "all" || scope === "channels") {
            requests.push(
              (async () => {
                const response = await fetch(
                  `/api/auth/me/guilds/channels?guildId=${encodeURIComponent(guildId)}${forceFresh ? "&fresh=1" : ""}`,
                  { cache: "no-store" },
                );
                const payload =
                  (await response.json()) as GuildChannelsApiResponse;

                if (!response.ok || !payload.ok || !payload.channels) {
                  throw new Error(
                    payload.message || "Falha ao atualizar canais do servidor.",
                  );
                }

                const nextText = mergeDiscordResourceOptions(
                  mapDiscordTextChannelOptions(payload.channels.text),
                  uniqueIds(preserve.channelIds),
                  () => "Canal indisponivel",
                );
                const nextCategories = mergeDiscordResourceOptions(
                  mapDiscordCategoryOptions(payload.channels.categories),
                  uniqueIds(preserve.categoryIds),
                  () => "Categoria indisponivel",
                );

                const nextVoice = mergeDiscordResourceOptions(
                  mapDiscordVoiceChannelOptions(payload.channels.voice || []),
                  uniqueIds(preserve.channelIds),
                  () => "Call indisponivel",
                );

                setTextChannelOptions(nextText);
                setVoiceChannelOptions(nextVoice);
                setCategoryOptions(nextCategories);
              })(),
            );
          }

          if (scope === "all" || scope === "roles") {
            requests.push(
              (async () => {
                const response = await fetch(
                  `/api/auth/me/guilds/roles?guildId=${encodeURIComponent(guildId)}${forceFresh ? "&fresh=1" : ""}`,
                  { cache: "no-store" },
                );
                const payload = (await response.json()) as GuildRolesApiResponse;

                if (!response.ok || !payload.ok || !payload.roles) {
                  throw new Error(
                    payload.message || "Falha ao atualizar cargos do servidor.",
                  );
                }

                setRoleOptions(
                  mergeDiscordResourceOptions(
                    mapDiscordRoleOptions(payload.roles),
                    uniqueIds(preserve.roleIds),
                    () => "Cargo indisponivel",
                  ),
                );
              })(),
            );
          }

          await Promise.all(requests);
          setHasLoadedResourcesOnce(true);
          lastRefreshAtRef.current = Date.now();
          if (forceFresh) {
            lastForceFreshAtRef.current = Date.now();
          }
        } finally {
          setIsRefreshingResources(false);
        }
      })();

      inflightRef.current = request;

      try {
        await request;
      } catch {
        // Melhor esforco: mantem opcoes atuais se a atualizacao falhar.
      } finally {
        if (inflightRef.current === request) {
          inflightRef.current = null;
        }
      }
    },
    [enabled, guildId],
  );

  const refreshResourcesOnMenuOpen = useCallback(() => {
    void refreshResources({ forceFresh: true, scope: "all" });
  }, [refreshResources]);

  useEffect(() => {
    if (!guildId || !enabled) {
      setHasLoadedResourcesOnce(false);
      applyResourceSnapshot({
        textChannelOptions: [],
        voiceChannelOptions: [],
        categoryOptions: [],
        roleOptions: [],
      });
      return;
    }

    void refreshResources({ scope: "all" });
  }, [applyResourceSnapshot, enabled, guildId, refreshResources]);

  useEffect(() => {
    if (!guildId || !enabled || pollIntervalMs <= 0) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refreshResources({ scope: "all" });
    }, pollIntervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, guildId, pollIntervalMs, refreshResources]);

  useEffect(() => {
    if (!guildId || !enabled) return;

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      void refreshResources({ forceFresh: true, scope: "all" });
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, guildId, refreshResources]);

  return {
    textChannelOptions,
    voiceChannelOptions,
    categoryOptions,
    roleOptions,
    isRefreshingResources,
    hasLoadedResourcesOnce,
    applyResourceSnapshot,
    refreshResources,
    refreshResourcesOnMenuOpen,
  };
}
