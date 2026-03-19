"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { configStepScale } from "@/components/config/configStepScale";

type GuildItem = {
  id: string;
  name: string;
  icon_url: string | null;
  owner: boolean;
  admin: boolean;
};

type GuildSelectProps = {
  guilds: GuildItem[];
  selectedGuildId: string | null;
  onSelect: (guildId: string) => void;
  isOpen: boolean;
  onToggle: () => void;
  isLoading: boolean;
};

type GuildFavoritesApiResponse = {
  ok: boolean;
  favoriteGuildIds?: string[];
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isSubsequence(query: string, target: string) {
  if (!query) return true;

  let queryIndex = 0;
  for (let targetIndex = 0; targetIndex < target.length; targetIndex += 1) {
    if (target[targetIndex] === query[queryIndex]) {
      queryIndex += 1;
      if (queryIndex >= query.length) return true;
    }
  }

  return false;
}

function getGuildSearchScore(guildName: string, searchQuery: string) {
  if (!searchQuery) return 1;

  const normalizedName = normalizeSearchText(guildName);
  const compactName = normalizedName.replace(/\s+/g, "");
  const compactQuery = searchQuery.replace(/\s+/g, "");

  if (normalizedName === searchQuery) return 100;
  if (normalizedName.startsWith(searchQuery)) return 90;
  if (normalizedName.includes(searchQuery)) return 80;

  const queryTokens = searchQuery.split(/\s+/).filter(Boolean);
  if (queryTokens.length > 1 && queryTokens.every((token) => normalizedName.includes(token))) {
    return 65;
  }

  if (compactQuery && isSubsequence(compactQuery, compactName)) return 50;
  return 0;
}

function StarIcon({ active }: { active: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="shrink-0"
      fill={active ? "#F2D15B" : "none"}
      stroke={active ? "#F2D15B" : "#242424"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{
        width: `${configStepScale.starSize}px`,
        height: `${configStepScale.starSize}px`,
      }}
    >
      <path d="M12 3.5l2.7 5.47 6.03.88-4.37 4.26 1.03 6.02L12 17.3l-5.39 2.83 1.03-6.02-4.37-4.26 6.03-.88z" />
    </svg>
  );
}

function GuildAvatar({ guild }: { guild: GuildItem }) {
  if (guild.icon_url) {
    const isAnimated = guild.icon_url.includes(".gif");

    return (
      <Image
        src={guild.icon_url}
        alt={guild.name}
        width={configStepScale.avatarSize}
        height={configStepScale.avatarSize}
        unoptimized={isAnimated}
        className="object-cover"
        style={{
          width: `${configStepScale.avatarSize}px`,
          height: `${configStepScale.avatarSize}px`,
          borderRadius: `${configStepScale.avatarRadius}px`,
        }}
      />
    );
  }

  return (
    <div
      className="flex items-center justify-center bg-[#0F0F0F] font-medium text-[#D8D8D8]"
      style={{
        width: `${configStepScale.avatarSize}px`,
        height: `${configStepScale.avatarSize}px`,
        borderRadius: `${configStepScale.avatarRadius}px`,
        fontSize: `${configStepScale.guildNameSize}px`,
      }}
    >
      {guild.name.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function GuildSelect({
  guilds,
  selectedGuildId,
  onSelect,
  isOpen,
  onToggle,
  isLoading,
}: GuildSelectProps) {
  const [favoriteGuildIds, setFavoriteGuildIds] = useState<string[]>([]);
  const [hasLoadedFavorites, setHasLoadedFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const skipFirstPersistRef = useRef(true);

  useEffect(() => {
    let isMounted = true;

    async function loadFavorites() {
      try {
        const response = await fetch("/api/auth/me/guild-favorites", {
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("Falha ao carregar favoritos.");
        }

        const payload = (await response.json()) as GuildFavoritesApiResponse;
        if (!isMounted) return;

        const normalized = Array.isArray(payload.favoriteGuildIds)
          ? Array.from(
              new Set(
                payload.favoriteGuildIds.filter(
                  (guildId): guildId is string => typeof guildId === "string",
                ),
              ),
            )
          : [];

        setFavoriteGuildIds(normalized);
      } catch {
        if (!isMounted) return;
        setFavoriteGuildIds([]);
      } finally {
        if (!isMounted) return;
        setHasLoadedFavorites(true);
      }
    }

    loadFavorites();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedFavorites) return;

    if (skipFirstPersistRef.current) {
      skipFirstPersistRef.current = false;
      return;
    }

    async function persistFavorites() {
      try {
        const response = await fetch("/api/auth/me/guild-favorites", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ favoriteGuildIds }),
        });

        if (!response.ok) {
          throw new Error("Falha ao persistir favoritos.");
        }
      } catch {
        // Mantem a selecao local mesmo se falhar o salvamento.
      }
    }

    void persistFavorites();
  }, [favoriteGuildIds, hasLoadedFavorites]);

  const normalizedQuery = useMemo(
    () => normalizeSearchText(searchQuery),
    [searchQuery],
  );

  const orderedGuilds = useMemo(() => {
    const orderIndex = new Map(guilds.map((guild, index) => [guild.id, index]));
    const favoriteOrder = new Map(
      favoriteGuildIds.map((guildId, index) => [guildId, index]),
    );
    const hasSearch = normalizedQuery.length > 0;

    const mapped = guilds
      .map((guild) => ({
        guild,
        score: hasSearch ? getGuildSearchScore(guild.name, normalizedQuery) : 1,
      }))
      .filter((item) => item.score > 0);

    mapped.sort((itemA, itemB) => {
      if (hasSearch && itemA.score !== itemB.score) {
        return itemB.score - itemA.score;
      }

      const favIndexA = favoriteOrder.get(itemA.guild.id);
      const favIndexB = favoriteOrder.get(itemB.guild.id);
      const isFavA = favIndexA !== undefined;
      const isFavB = favIndexB !== undefined;

      if (isFavA && isFavB) {
        return (favIndexA || 0) - (favIndexB || 0);
      }

      if (isFavA) return -1;
      if (isFavB) return 1;

      return (orderIndex.get(itemA.guild.id) || 0) - (orderIndex.get(itemB.guild.id) || 0);
    });

    return mapped.map((item) => item.guild);
  }, [guilds, favoriteGuildIds, normalizedQuery]);

  function toggleFavorite(guildId: string) {
    if (!hasLoadedFavorites) return;

    setFavoriteGuildIds((current) => {
      if (current.includes(guildId)) {
        return current.filter((id) => id !== guildId);
      }

      return [...current, guildId];
    });
  }

  function isFavorite(guildId: string) {
    return favoriteGuildIds.includes(guildId);
  }

  const selectedGuild =
    guilds.find((guild) => guild.id === selectedGuildId) || null;
  const scrollClass = "guild-select-scroll";
  const controlValue = isOpen ? searchQuery : (selectedGuild?.name || searchQuery);

  function handleToggleList() {
    if (isOpen) {
      setSearchQuery("");
    }

    onToggle();
  }

  return (
    <div className="w-full">
      <div
        className="flex w-full items-center border border-[#2E2E2E] bg-[#0A0A0A]"
        style={{
          height: `${configStepScale.controlHeight}px`,
          borderRadius: `${configStepScale.controlRadius}px`,
          paddingLeft: `${configStepScale.sidePadding}px`,
          paddingRight: `${Math.max(8, configStepScale.sidePadding - 12)}px`,
        }}
      >
        <input
          type="text"
          value={controlValue}
          onFocus={() => {
            if (!isOpen) {
              setSearchQuery("");
              onToggle();
            }
          }}
          onChange={(event) => {
            if (!isOpen) {
              onToggle();
            }
            setSearchQuery(event.currentTarget.value);
          }}
          placeholder="Escolha um servidor para continuar"
          className="w-full bg-transparent text-[#D8D8D8] placeholder:text-[#242424] outline-none"
          style={{ fontSize: `${configStepScale.controlTextSize}px` }}
          aria-label="Pesquisar servidor"
        />

        <button
          type="button"
          onClick={handleToggleList}
          className="ml-3 inline-flex items-center justify-center"
          aria-label={isOpen ? "Fechar lista" : "Abrir lista"}
          style={{
            width: `${configStepScale.arrowSize}px`,
            height: `${configStepScale.arrowSize}px`,
          }}
        >
          <Image
            src="/icons/seta.png"
            alt="Abrir lista"
            width={configStepScale.arrowSize}
            height={configStepScale.arrowSize}
            className={
              isOpen
                ? "rotate-180 transition-transform duration-300 ease-out"
                : "rotate-0 transition-transform duration-300 ease-out"
            }
          />
        </button>
      </div>

      <div
        className={`${scrollClass} overflow-y-auto border bg-[#0A0A0A] transition-all duration-300 ease-out`}
        style={{
          marginTop: isOpen ? `${configStepScale.listTopSpacing}px` : "0px",
          height: isOpen ? `${configStepScale.listHeight}px` : "0px",
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "translateY(0)" : "translateY(-8px)",
          borderColor: isOpen ? "#2E2E2E" : "transparent",
          borderRadius: `${configStepScale.controlRadius}px`,
          paddingInline: "0px",
          pointerEvents: isOpen ? "auto" : "none",
        }}
      >
        {isLoading ? (
          <div
            className="flex h-full items-center justify-center text-[#D8D8D8]"
            style={{ fontSize: `${configStepScale.guildNameSize}px` }}
          >
            Carregando servidores...
          </div>
        ) : orderedGuilds.length ? (
          orderedGuilds.map((guild, index) => (
            <div
              key={guild.id}
              style={{
                height: `${configStepScale.rowHeight}px`,
                borderBottom:
                  index === orderedGuilds.length - 1
                    ? "none"
                    : `${configStepScale.rowDivider}px solid #161616`,
              }}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelect(guild.id);
                  setSearchQuery("");

                  if (isOpen) {
                    onToggle();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(guild.id);
                    setSearchQuery("");

                    if (isOpen) {
                      onToggle();
                    }
                  }
                }}
                className={`flex h-full w-full items-center border border-transparent px-[10px] transition-colors ${
                  selectedGuildId === guild.id
                    ? "rounded-[3px] border-[#2E2E2E] bg-[#111111]"
                    : "rounded-[3px] hover:border-[#2E2E2E] hover:bg-[#111111]"
                }`}
              >
                <GuildAvatar guild={guild} />
                <span
                  className="truncate font-medium text-[#D8D8D8]"
                  style={{
                    marginLeft: `${configStepScale.guildNameGap}px`,
                    fontSize: `${configStepScale.guildNameSize}px`,
                  }}
                >
                  {guild.name}
                </span>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavorite(guild.id);
                  }}
                  disabled={!hasLoadedFavorites}
                  aria-label={
                    isFavorite(guild.id)
                      ? `Remover ${guild.name} dos favoritos`
                      : `Favoritar ${guild.name}`
                  }
                  className="ml-auto inline-flex items-center justify-center disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <StarIcon active={isFavorite(guild.id)} />
                </button>
              </div>
            </div>
          ))
        ) : (
          <div
            className="flex h-full items-center justify-center text-[#D8D8D8]"
            style={{ fontSize: `${configStepScale.guildNameSize}px` }}
          >
            Nenhum servidor encontrado para essa pesquisa
          </div>
        )}
      </div>

      <style jsx>{`
        .${scrollClass} {
          scrollbar-width: thin;
          scrollbar-color: #2e2e2e #0a0a0a;
        }

        .${scrollClass}::-webkit-scrollbar {
          width: 6px;
        }

        .${scrollClass}::-webkit-scrollbar-track {
          background: #0a0a0a;
          border-radius: 999px;
        }

        .${scrollClass}::-webkit-scrollbar-thumb {
          background: #2e2e2e;
          border-radius: 999px;
          border: 1px solid #0a0a0a;
        }
      `}</style>
    </div>
  );
}
