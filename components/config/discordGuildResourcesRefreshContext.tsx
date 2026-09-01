"use client";

import { createContext, useContext } from "react";

type DiscordGuildResourcesRefreshContextValue = {
  refresh: () => void;
};

const DiscordGuildResourcesRefreshContext =
  createContext<DiscordGuildResourcesRefreshContextValue | null>(null);

export function DiscordGuildResourcesRefreshProvider({
  refresh,
  children,
}: {
  refresh: () => void;
  children: React.ReactNode;
}) {
  return (
    <DiscordGuildResourcesRefreshContext.Provider value={{ refresh }}>
      {children}
    </DiscordGuildResourcesRefreshContext.Provider>
  );
}

export function useDiscordGuildResourcesRefreshOnMenuOpen() {
  const context = useContext(DiscordGuildResourcesRefreshContext);
  return context?.refresh ?? null;
}
