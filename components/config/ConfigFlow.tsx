"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfigStepOne } from "@/components/config/ConfigStepOne";
import { ConfigStepTwo } from "@/components/config/ConfigStepTwo";
import { ConfigStepThree } from "@/components/config/ConfigStepThree";
import { ConfigStepFour } from "@/components/config/ConfigStepFour";
import { ConfigLogoutButton } from "@/components/config/ConfigLogoutButton";
import { ButtonLoader } from "@/components/login/ButtonLoader";
import type {
  ConfigDraft,
  ConfigStep,
  StepThreeDraft,
  StepTwoDraft,
  StoredConfigContext,
} from "@/lib/auth/configContext";
import {
  CONFIG_CONTEXT_STORAGE_KEY,
  LEGACY_GUILD_STORAGE_KEY,
  createEmptyConfigDraft,
  mergeConfigDraft,
  sanitizeStoredConfigContext,
} from "@/lib/auth/configContext";

type ConfigFlowProps = {
  displayName: string;
};

type ConfigContextPatch = {
  activeGuildId?: string | null;
  activeStep?: ConfigStep;
  draft?: ConfigDraft;
};

type ConfigContextApiResponse = {
  ok: boolean;
  activeGuildId?: string | null;
  activeStep?: ConfigStep;
  draft?: ConfigDraft;
  updatedAt?: string | null;
};

const STEP_TWO_HASH = "#/step/2";
const STEP_THREE_HASH = "#/step/3";
const STEP_FOUR_HASH = "#/step/4";
const CONTEXT_SYNC_DEBOUNCE_MS = 420;

function parseStepFromHash(hash: string): ConfigStep {
  if (hash === STEP_TWO_HASH) return 2;
  if (hash === STEP_THREE_HASH) return 3;
  if (hash === STEP_FOUR_HASH) return 4;
  return 1;
}

function hasStepHash(hash: string) {
  return hash === "#/step/1" || hash === STEP_TWO_HASH || hash === STEP_THREE_HASH || hash === STEP_FOUR_HASH;
}

function writeLocalConfigContext(context: StoredConfigContext) {
  try {
    window.sessionStorage.setItem(CONFIG_CONTEXT_STORAGE_KEY, JSON.stringify(context));
  } catch {
    // Ignora erro de armazenamento local.
  }

  if (context.activeGuildId) {
    window.sessionStorage.setItem(LEGACY_GUILD_STORAGE_KEY, context.activeGuildId);
  } else {
    window.sessionStorage.removeItem(LEGACY_GUILD_STORAGE_KEY);
  }
}

function readLocalConfigContext() {
  try {
    const raw = window.sessionStorage.getItem(CONFIG_CONTEXT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      const sanitized = sanitizeStoredConfigContext(parsed);
      if (sanitized) return sanitized;
    }
  } catch {
    // Ignora payload local invalido.
  }

  const legacyGuildId = window.sessionStorage.getItem(LEGACY_GUILD_STORAGE_KEY);
  if (!legacyGuildId) return null;

  return {
    activeGuildId: legacyGuildId,
    activeStep: 1 as ConfigStep,
    draft: createEmptyConfigDraft(),
    updatedAt: null,
  } satisfies StoredConfigContext;
}

function toStoredConfigContext(input: {
  activeGuildId: string | null;
  activeStep: ConfigStep;
  draft: ConfigDraft;
  updatedAt: string | null;
}) {
  return {
    activeGuildId: input.activeGuildId,
    activeStep: input.activeStep,
    draft: input.draft,
    updatedAt: input.updatedAt,
  } satisfies StoredConfigContext;
}

function mergeContextPatch(
  currentPatch: ConfigContextPatch | null,
  nextPatch: ConfigContextPatch,
) {
  if (!currentPatch) {
    return { ...nextPatch };
  }

  const merged: ConfigContextPatch = { ...currentPatch, ...nextPatch };
  if (Object.prototype.hasOwnProperty.call(nextPatch, "draft")) {
    merged.draft = nextPatch.draft;
  }

  return merged;
}

function setStepHash(step: ConfigStep) {
  const normalizedPath = window.location.pathname.endsWith("/")
    ? window.location.pathname
    : `${window.location.pathname}/`;

  if (normalizedPath !== window.location.pathname) {
    window.history.replaceState(
      null,
      "",
      `${normalizedPath}${window.location.search}${window.location.hash}`,
    );
  }

  window.location.hash = `/step/${step}`;
}

export function ConfigFlow({ displayName }: ConfigFlowProps) {
  const [currentStep, setCurrentStep] = useState<ConfigStep>(1);
  const [isTransitioningStep, setIsTransitioningStep] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [selectedGuildId, setSelectedGuildId] = useState<string | null>(null);
  const [configDraft, setConfigDraft] = useState<ConfigDraft>(createEmptyConfigDraft());
  const [isConfigContextLoading, setIsConfigContextLoading] = useState(true);
  const [isContextHydrated, setIsContextHydrated] = useState(false);

  const contextSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingContextPatchRef = useRef<ConfigContextPatch | null>(null);
  const contextRef = useRef<StoredConfigContext>(
    toStoredConfigContext({
      activeGuildId: null,
      activeStep: 1,
      draft: createEmptyConfigDraft(),
      updatedAt: null,
    }),
  );

  const flushPendingContextSync = useCallback(async () => {
    const patch = pendingContextPatchRef.current;
    if (!patch) return;

    pendingContextPatchRef.current = null;

    try {
      const response = await fetch("/api/auth/me/config-context", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
      });

      if (!response.ok) {
        throw new Error("Falha ao sincronizar contexto.");
      }
    } catch {
      pendingContextPatchRef.current = mergeContextPatch(
        pendingContextPatchRef.current,
        patch,
      );
    }
  }, []);

  const scheduleContextSync = useCallback(
    (patch: ConfigContextPatch, immediate = false) => {
      if (!isContextHydrated) return;

      pendingContextPatchRef.current = mergeContextPatch(
        pendingContextPatchRef.current,
        patch,
      );

      if (contextSyncTimerRef.current) {
        clearTimeout(contextSyncTimerRef.current);
        contextSyncTimerRef.current = null;
      }

      if (immediate) {
        void flushPendingContextSync();
        return;
      }

      contextSyncTimerRef.current = setTimeout(() => {
        contextSyncTimerRef.current = null;
        void flushPendingContextSync();
      }, CONTEXT_SYNC_DEBOUNCE_MS);
    },
    [flushPendingContextSync, isContextHydrated],
  );

  const updateLocalContext = useCallback((patch: ConfigContextPatch) => {
    const previous = contextRef.current;
    const next = toStoredConfigContext({
      activeGuildId: Object.prototype.hasOwnProperty.call(patch, "activeGuildId")
        ? patch.activeGuildId || null
        : previous.activeGuildId,
      activeStep: Object.prototype.hasOwnProperty.call(patch, "activeStep")
        ? patch.activeStep || previous.activeStep
        : previous.activeStep,
      draft: Object.prototype.hasOwnProperty.call(patch, "draft")
        ? patch.draft || createEmptyConfigDraft()
        : previous.draft,
      updatedAt: new Date().toISOString(),
    });

    contextRef.current = next;
    writeLocalConfigContext(next);

    return next;
  }, []);

  const setAndSyncContext = useCallback(
    (patch: ConfigContextPatch, immediate = false) => {
      const next = updateLocalContext(patch);

      if (Object.prototype.hasOwnProperty.call(patch, "activeGuildId")) {
        setSelectedGuildId(next.activeGuildId);
      }

      if (Object.prototype.hasOwnProperty.call(patch, "activeStep")) {
        setCurrentStep(next.activeStep);
      }

      if (Object.prototype.hasOwnProperty.call(patch, "draft")) {
        setConfigDraft(next.draft);
      }

      scheduleContextSync(patch, immediate);
    },
    [scheduleContextSync, updateLocalContext],
  );

  useEffect(() => {
    function syncStepFromHash() {
      setCurrentStep(parseStepFromHash(window.location.hash));
    }

    let isMounted = true;

    async function loadConfigContext() {
      const localContext = readLocalConfigContext();
      const localDraft = localContext?.draft || createEmptyConfigDraft();
      const initialHashStep = parseStepFromHash(window.location.hash);
      const shouldRespectHash = hasStepHash(window.location.hash);

      let mergedGuildId = localContext?.activeGuildId || null;
      let mergedStep = shouldRespectHash ? initialHashStep : localContext?.activeStep || 1;
      let mergedDraft = localDraft;
      let mergedUpdatedAt = localContext?.updatedAt || null;

      try {
        const response = await fetch("/api/auth/me/config-context", {
          cache: "no-store",
        });
        const payload = (await response.json()) as ConfigContextApiResponse;

        if (response.ok && payload.ok) {
          const serverContext = sanitizeStoredConfigContext({
            activeGuildId: payload.activeGuildId,
            activeStep: payload.activeStep,
            draft: payload.draft,
            updatedAt: payload.updatedAt,
          });

          if (serverContext) {
            mergedGuildId = localContext?.activeGuildId || serverContext.activeGuildId;
            mergedDraft = localContext
              ? mergeConfigDraft(serverContext.draft, localContext.draft)
              : serverContext.draft;
            mergedUpdatedAt = localContext?.updatedAt || serverContext.updatedAt;

            if (!shouldRespectHash) {
              mergedStep = localContext?.activeStep || serverContext.activeStep;
            }
          }
        }
      } catch {
        // Usa apenas contexto local em caso de falha de rede.
      } finally {
        if (!isMounted) return;

        const hydratedContext = toStoredConfigContext({
          activeGuildId: mergedGuildId,
          activeStep: mergedStep,
          draft: mergedDraft,
          updatedAt: mergedUpdatedAt,
        });

        contextRef.current = hydratedContext;
        setSelectedGuildId(hydratedContext.activeGuildId);
        setConfigDraft(hydratedContext.draft);

        if (shouldRespectHash) {
          setCurrentStep(initialHashStep);
        } else {
          setCurrentStep(hydratedContext.activeStep);
          if (hydratedContext.activeStep !== 1) {
            setStepHash(hydratedContext.activeStep);
          }
        }

        writeLocalConfigContext(hydratedContext);
        setIsContextHydrated(true);
        setIsConfigContextLoading(false);
      }
    }

    syncStepFromHash();
    void loadConfigContext();
    window.addEventListener("hashchange", syncStepFromHash);

    return () => {
      isMounted = false;
      window.removeEventListener("hashchange", syncStepFromHash);
    };
  }, []);

  useEffect(() => {
    if (!isTransitioningStep) return;

    const timeoutId = window.setTimeout(() => {
      setIsTransitioningStep(false);
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [currentStep, isTransitioningStep]);

  useEffect(() => {
    if (!isContextHydrated) return;

    const previousStep = contextRef.current.activeStep;
    if (previousStep === currentStep) return;

    const next = updateLocalContext({ activeStep: currentStep });
    setSelectedGuildId(next.activeGuildId);
    setConfigDraft(next.draft);
    scheduleContextSync({ activeStep: currentStep });
  }, [currentStep, isContextHydrated, scheduleContextSync, updateLocalContext]);

  useEffect(() => {
    return () => {
      if (contextSyncTimerRef.current) {
        clearTimeout(contextSyncTimerRef.current);
        contextSyncTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    function flushOnPageHide() {
      const patch = pendingContextPatchRef.current;
      if (!patch) return;

      pendingContextPatchRef.current = null;

      void fetch("/api/auth/me/config-context", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
        keepalive: true,
      }).catch(() => {
        pendingContextPatchRef.current = mergeContextPatch(
          pendingContextPatchRef.current,
          patch,
        );
      });
    }

    window.addEventListener("pagehide", flushOnPageHide);
    return () => {
      window.removeEventListener("pagehide", flushOnPageHide);
    };
  }, []);

  const handleGuildSelectionChange = useCallback(
    (guildId: string | null) => {
      setAndSyncContext(
        {
          activeGuildId: guildId,
          activeStep: 1,
        },
        false,
      );
    },
    [setAndSyncContext],
  );

  const handleProceedToStepTwo = useCallback(
    (guildId: string) => {
      setAndSyncContext(
        {
          activeGuildId: guildId,
          activeStep: 2,
        },
        true,
      );

      setIsTransitioningStep(true);
      setStepHash(2);
    },
    [setAndSyncContext],
  );

  const handleProceedToStepThree = useCallback(() => {
    setAndSyncContext({ activeStep: 3 }, true);
    setIsTransitioningStep(true);
    setStepHash(3);
  }, [setAndSyncContext]);

  const handleProceedToStepFour = useCallback(() => {
    setAndSyncContext({ activeStep: 4 }, true);
    setIsTransitioningStep(true);
    setStepHash(4);
  }, [setAndSyncContext]);

  const handleGoBackToStepOne = useCallback(() => {
    setAndSyncContext({ activeStep: 1 }, true);
    setStepHash(1);
  }, [setAndSyncContext]);

  const handleStepTwoDraftChange = useCallback(
    (guildId: string, draft: StepTwoDraft) => {
      const nextDraft = {
        ...contextRef.current.draft,
        stepTwoByGuild: {
          ...contextRef.current.draft.stepTwoByGuild,
          [guildId]: draft,
        },
      } satisfies ConfigDraft;

      setAndSyncContext({ draft: nextDraft }, false);
    },
    [setAndSyncContext],
  );

  const handleStepThreeDraftChange = useCallback(
    (guildId: string, draft: StepThreeDraft) => {
      const nextDraft = {
        ...contextRef.current.draft,
        stepThreeByGuild: {
          ...contextRef.current.draft.stepThreeByGuild,
          [guildId]: draft,
        },
      } satisfies ConfigDraft;

      setAndSyncContext({ draft: nextDraft }, false);
    },
    [setAndSyncContext],
  );

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      });
    } finally {
      window.sessionStorage.removeItem(CONFIG_CONTEXT_STORAGE_KEY);
      window.sessionStorage.removeItem(LEGACY_GUILD_STORAGE_KEY);
      window.location.assign("/login");
    }
  }, [isLoggingOut]);

  const stepTwoDraft = useMemo(() => {
    if (!selectedGuildId) return null;

    const draft = configDraft.stepTwoByGuild[selectedGuildId];
    return draft || null;
  }, [configDraft.stepTwoByGuild, selectedGuildId]);

  const stepThreeDraft = useMemo(() => {
    if (!selectedGuildId) return null;

    const draft = configDraft.stepThreeByGuild[selectedGuildId];
    return draft || null;
  }, [configDraft.stepThreeByGuild, selectedGuildId]);

  const stepContent = useMemo(() => {
    if (isConfigContextLoading && currentStep !== 1) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-black">
          <ButtonLoader size={36} />
        </main>
      );
    }

    if (currentStep === 4) {
      return <ConfigStepFour displayName={displayName} />;
    }

    if (currentStep === 3) {
      return (
        <ConfigStepThree
          displayName={displayName}
          guildId={selectedGuildId}
          initialDraft={stepThreeDraft}
          onDraftChange={handleStepThreeDraftChange}
          onProceedToStepFour={handleProceedToStepFour}
          onGoBackToStepOne={handleGoBackToStepOne}
        />
      );
    }

    if (currentStep === 2) {
      return (
        <ConfigStepTwo
          displayName={displayName}
          guildId={selectedGuildId}
          initialDraft={stepTwoDraft}
          onDraftChange={handleStepTwoDraftChange}
          onProceedToStepThree={handleProceedToStepThree}
          onGoBackToStepOne={handleGoBackToStepOne}
        />
      );
    }

    return (
      <ConfigStepOne
        displayName={displayName}
        initialSelectedGuildId={selectedGuildId}
        onSelectedGuildChange={handleGuildSelectionChange}
        onProceedToStepTwo={handleProceedToStepTwo}
      />
    );
  }, [
    currentStep,
    displayName,
    handleGoBackToStepOne,
    handleGuildSelectionChange,
    handleProceedToStepFour,
    handleProceedToStepThree,
    handleProceedToStepTwo,
    handleStepThreeDraftChange,
    handleStepTwoDraftChange,
    isConfigContextLoading,
    selectedGuildId,
    stepThreeDraft,
    stepTwoDraft,
  ]);

  return (
    <>
      {stepContent}

      <ConfigLogoutButton
        onClick={() => {
          void handleLogout();
        }}
        disabled={isLoggingOut}
      />

      {isTransitioningStep ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
          <ButtonLoader size={36} />
        </div>
      ) : null}
    </>
  );
}
