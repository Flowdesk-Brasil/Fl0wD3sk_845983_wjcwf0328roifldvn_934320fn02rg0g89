"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ButtonLoader } from "@/components/login/ButtonLoader";

export type ConfigGuildItem = {
  id: string;
  name: string;
  icon_url: string | null;
};

type ConfigServerSwitcherProps = {
  guilds: ConfigGuildItem[];
  selectedGuildId: string | null;
  isLoading?: boolean;
  isSwitching?: boolean;
  onSelectGuild: (guildId: string) => void;
};

function FallbackIcon() {
  return (
    <span className="inline-flex h-full w-full items-center justify-center rounded-[3px] bg-[#151515] text-[12px] text-[#8A8A8A]">
      S
    </span>
  );
}

export function ConfigServerSwitcher({
  guilds,
  selectedGuildId,
  isLoading = false,
  isSwitching = false,
  onSelectGuild,
}: ConfigServerSwitcherProps) {
  const [isOpen, setIsOpen] = useState(false);
  const scrollClass = "config-switcher-scroll";
  const rootRef = useRef<HTMLDivElement | null>(null);

  const selectedGuild = useMemo(
    () => guilds.find((guild) => guild.id === selectedGuildId) || null,
    [guilds, selectedGuildId],
  );

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!rootRef.current || !target) return;
      if (!rootRef.current.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="fixed left-1/2 top-6 z-40 w-[min(620px,calc(100vw-28px))] -translate-x-1/2"
    >
      <div className="rounded-[4px] border border-[#2E2E2E] bg-[#0A0A0A] px-4 py-[10px]">
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          disabled={isLoading || isSwitching || guilds.length === 0}
          className="flex w-full items-center gap-4 text-left disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="relative block h-[28px] w-[28px] shrink-0 overflow-hidden rounded-[3px] bg-[#151515]">
            {selectedGuild?.icon_url ? (
              <Image
                src={selectedGuild.icon_url}
                alt={selectedGuild.name}
                fill
                sizes="28px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <FallbackIcon />
            )}
          </span>

          <span className="truncate text-[13px] text-[#D8D8D8]">
            {selectedGuild ? selectedGuild.name : "Selecione um servidor"}
          </span>

          <span className="ml-auto inline-flex items-center justify-center text-[#777777]">
            {isSwitching ? (
              <ButtonLoader size={16} colorClassName="text-[#D8D8D8]" />
            ) : (
              <svg
                viewBox="0 0 24 24"
                className={`h-[18px] w-[18px] transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            )}
          </span>
        </button>
      </div>

      {isOpen ? (
        <div
          className={`${scrollClass} mt-2 max-h-[292px] overflow-y-auto rounded-[4px] border border-[#2E2E2E] bg-[#0A0A0A] py-[6px]`}
        >
          {guilds.map((guild) => {
            const isActive = guild.id === selectedGuildId;
            return (
              <button
                key={guild.id}
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onSelectGuild(guild.id);
                }}
                disabled={isSwitching}
                className={`flex w-full items-center gap-4 px-4 py-[10px] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  isActive ? "bg-[#131313]" : "hover:bg-[#121212]"
                }`}
              >
                <span className="relative block h-[28px] w-[28px] shrink-0 overflow-hidden rounded-[3px] bg-[#151515]">
                  {guild.icon_url ? (
                    <Image
                      src={guild.icon_url}
                      alt={guild.name}
                      fill
                      sizes="28px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <FallbackIcon />
                  )}
                </span>
                <span className="truncate text-[13px] text-[#D8D8D8]">{guild.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}

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
