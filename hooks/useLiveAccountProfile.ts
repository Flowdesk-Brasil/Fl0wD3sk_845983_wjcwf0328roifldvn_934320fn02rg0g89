"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type LiveAccountProfile = {
  authUserId: number;
  discordUserId?: string | null;
  displayName: string;
  username: string;
  avatarUrl: string | null;
};

type PersonalDataProfileResponse = {
  ok?: boolean;
  data?: {
    profile?: {
      authUserId?: number;
      displayName?: string | null;
      username?: string | null;
      avatarUrl?: string | null;
    };
  };
};

const ACCOUNT_PROFILE_UPDATED_EVENT = "flowdesk:account-profile-updated";
const ACCOUNT_PROFILE_STORAGE_KEY = "flowdesk_account_profile_snapshot_v1";

function normalizeProfileSnapshot(
  input: unknown,
  fallback?: LiveAccountProfile,
): LiveAccountProfile | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const record = input as Partial<LiveAccountProfile>;
  const authUserId =
    typeof record.authUserId === "number" && Number.isSafeInteger(record.authUserId)
      ? record.authUserId
      : fallback?.authUserId;
  if (!authUserId) return null;

  const displayName =
    typeof record.displayName === "string" && record.displayName.trim()
      ? record.displayName.trim()
      : fallback?.displayName || "";
  const username =
    typeof record.username === "string" && record.username.trim()
      ? record.username.trim()
      : fallback?.username || "";

  return {
    authUserId,
    discordUserId:
      typeof record.discordUserId === "string"
        ? record.discordUserId
        : fallback?.discordUserId ?? null,
    displayName,
    username,
    avatarUrl:
      typeof record.avatarUrl === "string" && record.avatarUrl.trim()
        ? record.avatarUrl.trim()
        : null,
  };
}

function shouldPersistAvatarUrl(avatarUrl: string | null) {
  return !avatarUrl || !avatarUrl.startsWith("blob:");
}

export function publishLiveAccountProfile(
  profile: LiveAccountProfile,
  options: { persist?: boolean } = {},
) {
  if (typeof window === "undefined") return;
  const snapshot = normalizeProfileSnapshot(profile);
  if (!snapshot) return;

  window.dispatchEvent(
    new CustomEvent(ACCOUNT_PROFILE_UPDATED_EVENT, { detail: snapshot }),
  );

  if (options.persist === false || !shouldPersistAvatarUrl(snapshot.avatarUrl)) return;
  try {
    window.localStorage.setItem(
      ACCOUNT_PROFILE_STORAGE_KEY,
      JSON.stringify({
        ...snapshot,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // localStorage indisponivel nao deve bloquear o perfil em memoria
  }
}

function readStoredLiveAccountProfile(authUserId: number) {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCOUNT_PROFILE_STORAGE_KEY);
    const snapshot = normalizeProfileSnapshot(raw ? JSON.parse(raw) : null);
    return snapshot?.authUserId === authUserId ? snapshot : null;
  } catch {
    return null;
  }
}

export function useLiveAccountProfile<T extends LiveAccountProfile>(initialProfile: T): T {
  const { authUserId, avatarUrl, discordUserId, displayName, username } = initialProfile;
  const fallbackProfile = useMemo<LiveAccountProfile>(
    () => ({
      authUserId,
      discordUserId,
      displayName,
      username,
      avatarUrl,
    }),
    [authUserId, avatarUrl, discordUserId, displayName, username],
  );
  const [profile, setProfile] = useState<LiveAccountProfile>(fallbackProfile);

  const mergeProfile = useCallback(
    (nextProfile: LiveAccountProfile | null) => {
      if (!nextProfile || nextProfile.authUserId !== authUserId) return;
      setProfile((current) => ({
        ...current,
        ...nextProfile,
        discordUserId: current.discordUserId ?? discordUserId ?? null,
      }));
    },
    [authUserId, discordUserId],
  );

  useEffect(() => {
    let cancelled = false;

    async function refreshProfile() {
      try {
        const response = await fetch("/api/auth/me/personal-data", {
          cache: "no-store",
          credentials: "same-origin",
        });
        const payload = (await response.json().catch(() => null)) as
          | PersonalDataProfileResponse
          | null;
        const apiProfile = payload?.data?.profile;
        if (!response.ok || payload?.ok === false || !apiProfile || cancelled) {
          return;
        }
        const nextProfile = normalizeProfileSnapshot(
          {
            authUserId: apiProfile.authUserId,
            displayName: apiProfile.displayName,
            username: apiProfile.username,
            avatarUrl: apiProfile.avatarUrl,
          },
          fallbackProfile,
        );
        mergeProfile(nextProfile);
        if (nextProfile) publishLiveAccountProfile(nextProfile);
      } catch {
        // Mantem o perfil server-rendered se a consulta em segundo plano falhar.
      }
    }

    function handleProfileUpdated(event: Event) {
      const customEvent = event as CustomEvent<unknown>;
      mergeProfile(normalizeProfileSnapshot(customEvent.detail, fallbackProfile));
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== ACCOUNT_PROFILE_STORAGE_KEY || !event.newValue) return;
      try {
        mergeProfile(normalizeProfileSnapshot(JSON.parse(event.newValue), fallbackProfile));
      } catch {
        // ignora snapshot de outra aba se estiver invalido
      }
    }

    function handleVisibilityRefresh() {
      if (document.visibilityState === "visible") {
        void refreshProfile();
      }
    }

    const storedRefreshTimer = window.setTimeout(() => {
      if (!cancelled) {
        mergeProfile(readStoredLiveAccountProfile(authUserId));
      }
    }, 0);
    void refreshProfile();
    window.addEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, handleProfileUpdated);
    window.addEventListener("storage", handleStorage);
    window.addEventListener("focus", refreshProfile);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);

    return () => {
      cancelled = true;
      window.clearTimeout(storedRefreshTimer);
      window.removeEventListener(ACCOUNT_PROFILE_UPDATED_EVENT, handleProfileUpdated);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("focus", refreshProfile);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
    };
  }, [authUserId, fallbackProfile, mergeProfile]);

  const visibleProfile = profile.authUserId === authUserId ? profile : fallbackProfile;

  return useMemo(
    () =>
      ({
        ...initialProfile,
        displayName: visibleProfile.displayName || displayName,
        username: visibleProfile.username || username,
        avatarUrl: visibleProfile.avatarUrl,
      }) as T,
    [
      displayName,
      initialProfile,
      username,
      visibleProfile.avatarUrl,
      visibleProfile.displayName,
      visibleProfile.username,
    ],
  );
}
