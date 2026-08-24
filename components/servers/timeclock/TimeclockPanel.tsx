"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Activity,
  BarChart3,
  CalendarClock,
  Check,
  ClipboardList,
  Clock3,
  History,
  Loader2,
  Send,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { ConfigStepMultiSelect } from "@/components/config/ConfigStepMultiSelect";
import { ConfigStepSelect } from "@/components/config/ConfigStepSelect";
import { TicketMessageBuilder } from "@/components/servers/TicketMessageBuilder";
import {
  createDefaultScheduleDays,
  formatDuration,
  formatSignedDuration,
  normalizeScheduleDay,
  secondsToClockTime,
  TIMEclockWeekdays,
  type TimeclockScheduleDay,
} from "@/lib/timeclock/core";
import {
  normalizeTicketPanelLayout,
  type TicketPanelLayout,
} from "@/lib/servers/ticketPanelBuilder";

type SelectOption = {
  id: string;
  name: string;
};

type TimeclockSettingsPayload = {
  guildId: string;
  enabled: boolean;
  mainChannelId: string | null;
  logChannelId: string | null;
  panelLayout: TicketPanelLayout;
  timezone: string;
  employeeRoleIds: string[];
  viewHistoryRoleIds: string[];
  editTimeclockRoleIds: string[];
  approveHoursRoleIds: string[];
  adminRoleIds: string[];
  hourBankEnabled: boolean;
  earlyStartPolicy: "count" | "ignore" | "approval" | "limit";
  lateFinishPolicy: "count" | "ignore" | "approval" | "limit";
  overtimeApprovalEnabled: boolean;
  rankingPublic: boolean;
  maxSessionSeconds: number;
  alertsEnabled: boolean;
  scheduleDays: TimeclockScheduleDay[];
};

type TimeclockSummaryPayload = {
  ok: boolean;
  workday: string;
  totals: {
    workingCount: number;
    pausedCount: number;
    finishedCount: number;
    workedSeconds: number;
    pausedSeconds: number;
    overtimeSeconds: number;
    bankSeconds: number;
  };
  active: TimeclockSessionItem[];
  history: {
    page: number;
    pageSize: number;
    total: number;
    items: TimeclockSessionItem[];
  };
  ranking: Array<{
    position: number;
    userId: string;
    user: TimeclockUser;
    totalWorkedSeconds: number;
    sessionCount: number;
    averageDailySeconds: number;
    bankSeconds: number;
  }>;
  audit: Array<{
    id: string;
    userId: string;
    user: TimeclockUser;
    sessionId: string | null;
    eventType: string;
    timestamp: string;
    source: string;
    previousState: string | null;
    newState: string | null;
  }>;
};

type TimeclockUser = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};

type TimeclockSessionItem = {
  id: string;
  userId: string;
  user: TimeclockUser;
  workday: string;
  status: string;
  approvalStatus: string;
  startedAt: string | null;
  endedAt: string | null;
  totalWorkedSeconds: number;
  totalPausedSeconds: number;
  expectedWorkSeconds: number;
  balanceSeconds: number;
  overtimeSeconds: number;
  missingSeconds: number;
  earlyStartSeconds: number;
  lateStartSeconds: number;
  earlyLeaveSeconds: number;
  lateLeaveSeconds: number;
};

type Props = {
  guildId: string;
  textChannelOptions: SelectOption[];
  roleOptions: SelectOption[];
  disabled?: boolean;
  controlHeightPx?: number;
  view?: TimeclockView;
};

type TimeclockView = "config" | "live" | "history" | "ranking" | "audit";

const DEFAULT_PANEL_LAYOUT = normalizeTicketPanelLayout([
  {
    id: "timeclock_container",
    type: "container",
    accentColor: "#8AB6FF",
    children: [
      {
        id: "timeclock_content",
        type: "content",
        markdown:
          "## Controle de Ponto\nUtilize o botao abaixo para acessar seu ponto.",
        accessory: null,
      },
      {
        id: "timeclock_separator",
        type: "separator",
        spacing: "md",
      },
      {
        id: "timeclock_button",
        type: "button",
        label: "Bater Ponto",
        style: "primary",
        disabled: false,
      },
    ],
  },
]);

const TIMEZONE_OPTIONS = [
  { id: "America/Sao_Paulo", name: "America/Sao_Paulo" },
  { id: "America/Manaus", name: "America/Manaus" },
  { id: "America/Fortaleza", name: "America/Fortaleza" },
  { id: "America/New_York", name: "America/New_York" },
  { id: "UTC", name: "UTC" },
];

const POLICY_OPTIONS = [
  { id: "count", name: "Contabilizar no banco" },
  { id: "ignore", name: "Ignorar" },
  { id: "approval", name: "Exigir aprovacao" },
  { id: "limit", name: "Limitar computavel" },
];

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || "Falha ao carregar Bate Ponto.");
  }
  return payload as T;
};

function statusLabel(status: string) {
  switch (status) {
    case "WORKING":
      return "Trabalhando";
    case "PAUSED":
      return "Pausado";
    case "FINISHED":
      return "Finalizado";
    case "INCOMPLETE":
      return "Pendente";
    case "ADJUSTED":
      return "Ajustado";
    default:
      return "Nao iniciado";
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "--";
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "--";
  }
}

function UserCell({ user }: { user: TimeclockUser }) {
  return (
    <div className="flex min-w-0 items-center gap-[10px]">
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#171717] bg-[#0D0D0D]">
        {user.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <UserRound className="h-[16px] w-[16px] text-[#777]" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-[#DCDCDC]">
          {user.displayName}
        </p>
        <p className="truncate text-[11px] text-[#666]">{user.userId}</p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-[18px] border border-[#161616] bg-[#090909] px-[16px] py-[14px]">
      <div className="flex items-center justify-between gap-[12px]">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#707070]">
          {label}
        </p>
        <Icon className="h-[17px] w-[17px] text-[#858585]" />
      </div>
      <p className="mt-[10px] text-[22px] leading-none font-medium text-[#E6E6E6]">
        {value}
      </p>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-[8px] sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="inline-flex items-center gap-[7px] rounded-full border border-[#1A1A1A] bg-[#0B0B0B] px-[10px] py-[5px] text-[10px] font-medium uppercase tracking-[0.14em] text-[#777]">
          <Icon className="h-[13px] w-[13px]" />
          Bate Ponto
        </div>
        <h3 className="mt-[10px] text-[21px] leading-none font-medium text-[#E1E1E1]">
          {title}
        </h3>
        <p className="mt-[8px] max-w-[760px] text-[13px] leading-[1.55] text-[#777]">
          {description}
        </p>
      </div>
    </div>
  );
}

function TimeclockInlineSwitch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={ariaLabel}
      className={`group relative inline-flex h-[30px] w-[54px] shrink-0 items-center rounded-full border p-[3px] transition-all duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-[rgba(255,255,255,0.14)] bg-[linear-gradient(180deg,#F3F3F3_0%,#D8D8D8_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.36),0_12px_26px_rgba(0,0,0,0.16)]"
          : "border-[#1F1F1F] bg-[linear-gradient(180deg,#141414_0%,#0D0D0D_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] hover:border-[#292929]"
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute inset-[3px] rounded-full transition-opacity duration-200 ${
          checked
            ? "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.24)_0%,rgba(255,255,255,0.05)_58%,transparent_100%)]"
            : "bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05)_0%,transparent_72%)]"
        }`}
      />
      <span
        aria-hidden="true"
        className={`relative z-10 h-[24px] w-[24px] rounded-full border transition-all duration-200 ease-out ${
          checked
            ? "translate-x-[24px] border-[#0B0B0B] bg-[linear-gradient(180deg,#111111_0%,#050505_100%)] shadow-[0_8px_18px_rgba(0,0,0,0.34)]"
            : "translate-x-0 border-[#252525] bg-[linear-gradient(180deg,#7D7D7D_0%,#5A5A5A_100%)] shadow-[0_8px_18px_rgba(0,0,0,0.26)]"
        }`}
      />
    </button>
  );
}

function normalizeTimeclockDraftForCompare(draft: TimeclockSettingsPayload | null) {
  if (!draft) return null;
  return {
    ...draft,
    panelLayout: normalizeTicketPanelLayout(draft.panelLayout || DEFAULT_PANEL_LAYOUT),
    scheduleDays: [...draft.scheduleDays].map(normalizeScheduleDay).sort((a, b) => a.weekday - b.weekday),
  };
}

export function TimeclockPanel({
  guildId,
  textChannelOptions,
  roleOptions,
  disabled,
  controlHeightPx = 56,
  view = "config",
}: Props) {
  const [activeView, setActiveView] = useState<TimeclockView>(view);
  const [draft, setDraft] = useState<TimeclockSettingsPayload | null>(null);
  const [savedDraft, setSavedDraft] = useState<TimeclockSettingsPayload | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const settingsKey = guildId
    ? `/api/auth/me/guilds/timeclock-settings?guildId=${encodeURIComponent(guildId)}`
    : null;
  const summaryKey = guildId
    ? `/api/auth/me/guilds/timeclock-summary?guildId=${encodeURIComponent(guildId)}&range=30d&pageSize=25`
    : null;
  const {
    data: settingsPayload,
    error: settingsError,
    isLoading: settingsLoading,
    mutate: mutateSettings,
  } = useSWR<{ ok: boolean; settings: TimeclockSettingsPayload }>(
    settingsKey,
    fetchJson,
    { revalidateOnFocus: false },
  );
  const {
    data: summary,
    error: summaryError,
    isLoading: summaryLoading,
    mutate: mutateSummary,
  } = useSWR<TimeclockSummaryPayload>(summaryKey, fetchJson, {
    refreshInterval: activeView === "live" ? 15000 : 30000,
    revalidateOnFocus: true,
  });

  useEffect(() => {
    setActiveView(view);
  }, [view]);

  useEffect(() => {
    if (!settingsPayload?.settings) return;
    const normalizedSettings = {
      ...settingsPayload.settings,
      panelLayout: normalizeTicketPanelLayout(
        settingsPayload.settings.panelLayout || DEFAULT_PANEL_LAYOUT,
      ),
      scheduleDays: (settingsPayload.settings.scheduleDays?.length
        ? settingsPayload.settings.scheduleDays
        : createDefaultScheduleDays()
      ).map(normalizeScheduleDay),
    };
    setDraft(normalizedSettings);
    setSavedDraft(normalizedSettings);
  }, [settingsPayload]);

  const moduleControlsDisabled = Boolean(disabled || saving || settingsLoading || !draft);
  const controlsDisabled = Boolean(moduleControlsDisabled || !draft?.enabled);
  const draftFingerprint = useMemo(
    () => JSON.stringify(normalizeTimeclockDraftForCompare(draft)),
    [draft],
  );
  const savedDraftFingerprint = useMemo(
    () => JSON.stringify(normalizeTimeclockDraftForCompare(savedDraft)),
    [savedDraft],
  );
  const hasUnsavedChanges = Boolean(draft && savedDraft && draftFingerprint !== savedDraftFingerprint);
  const canSave = Boolean(draft && hasUnsavedChanges && !saving && !disabled);
  const canReset = Boolean(savedDraft && hasUnsavedChanges && !saving && !disabled);
  const selectedMainChannelMissing = Boolean(
    draft?.mainChannelId &&
      !textChannelOptions.some((channel) => channel.id === draft.mainChannelId),
  );
  const selectedLogChannelMissing = Boolean(
    draft?.logChannelId &&
      !textChannelOptions.some((channel) => channel.id === draft.logChannelId),
  );

  const setScheduleDay = useCallback((weekday: number, patch: Partial<TimeclockScheduleDay>) => {
    setFeedback(null);
    setDraft((current) => {
      if (!current) return current;
      const scheduleDays = current.scheduleDays.map((day) =>
        day.weekday === weekday ? normalizeScheduleDay({ ...day, ...patch }) : day,
      );
      return { ...current, scheduleDays };
    });
  }, []);

  const updateDraft = useCallback(<K extends keyof TimeclockSettingsPayload>(
    key: K,
    value: TimeclockSettingsPayload[K],
  ) => {
    setFeedback(null);
    setDraft((current) => current ? { ...current, [key]: value } : current);
  }, []);

  const handleReset = useCallback(() => {
    if (!savedDraft || saving) return;
    setDraft(savedDraft);
    setFeedback(null);
  }, [savedDraft, saving]);

  const handleSave = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/me/guilds/timeclock-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || "Nao foi possivel salvar Bate Ponto.");
      }
      const savedSettings = {
        ...payload.settings,
        panelLayout: normalizeTicketPanelLayout(payload.settings.panelLayout || DEFAULT_PANEL_LAYOUT),
        scheduleDays: (payload.settings.scheduleDays?.length
          ? payload.settings.scheduleDays
          : createDefaultScheduleDays()
        ).map(normalizeScheduleDay),
      };
      setDraft(savedSettings);
      setSavedDraft(savedSettings);
      setFeedback({ tone: "success", text: "Configuracoes do Bate Ponto salvas." });
      await mutateSettings(payload, { revalidate: false });
      await mutateSummary();
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Nao foi possivel salvar Bate Ponto.",
      });
    } finally {
      setSaving(false);
    }
  }, [draft, mutateSettings, mutateSummary]);

  const handlePublish = useCallback(async () => {
    if (!draft?.mainChannelId) {
      setFeedback({ tone: "error", text: "Escolha o canal principal antes de publicar." });
      return;
    }
    setPublishing(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/auth/me/guilds/timeclock-panel-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guildId,
          mainChannelId: draft.mainChannelId,
          panelLayout: draft.panelLayout,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.message || "Nao foi possivel publicar a mensagem.");
      }
      setFeedback({
        tone: "success",
        text:
          payload.mode === "updated"
            ? "Mensagem do Bate Ponto atualizada no Discord."
            : "Mensagem do Bate Ponto enviada no Discord.",
      });
      await mutateSettings();
    } catch (error) {
      setFeedback({
        tone: "error",
        text: error instanceof Error ? error.message : "Nao foi possivel publicar a mensagem.",
      });
    } finally {
      setPublishing(false);
    }
  }, [draft, guildId, mutateSettings]);

  const scheduleDays = useMemo(() => {
    const byWeekday = new Map((draft?.scheduleDays || createDefaultScheduleDays()).map((day) => [day.weekday, day]));
    return TIMEclockWeekdays.map(({ weekday, label }) => ({
      label,
      day: byWeekday.get(weekday) || normalizeScheduleDay({ weekday }),
    }));
  }, [draft?.scheduleDays]);
  const showFloatingSaveBar = Boolean(draft && !disabled && (hasUnsavedChanges || saving));
  const saveBarHasError = feedback?.tone === "error" && hasUnsavedChanges;
  const saveBarTitle = saveBarHasError
    ? "Nao foi possivel salvar agora"
    : saving
      ? "Salvando alteracoes do Bate Ponto..."
      : "Cuidado - voce tem alteracoes que nao foram salvas!";
  const saveBarDescription = saveBarHasError
    ? feedback.text
    : saving
      ? "Estamos sincronizando canais, cargos, escala e regras deste modulo."
      : "Revise as configuracoes abaixo e confirme para manter o ponto do servidor atualizado.";

  if (settingsLoading && !draft) {
    return (
      <div className="flex min-h-[260px] items-center justify-center rounded-[22px] border border-[#151515] bg-[#080808]">
        <div className="flex items-center gap-[10px] text-[14px] text-[#8A8A8A]">
          <Loader2 className="h-[17px] w-[17px] animate-spin" />
          Carregando Bate Ponto
        </div>
      </div>
    );
  }

  if (settingsError) {
    return (
      <div className="rounded-[22px] border border-[#221414] bg-[#0A0606] px-[18px] py-[16px] text-[13px] leading-[1.6] text-[#E7A5A5]">
        {settingsError instanceof Error ? settingsError.message : "Nao foi possivel carregar Bate Ponto."}
      </div>
    );
  }

  if (!draft) return null;

  return (
    <section className={`space-y-[14px] ${showFloatingSaveBar ? "pb-[112px]" : ""}`}>
      <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px] shadow-[0_22px_60px_rgba(0,0,0,0.28)]">
        <SectionTitle
          icon={Clock3}
          title="Bate Ponto"
          description="Controle jornada, pausas, banco de horas, ranking e auditoria usando Discord e painel como interfaces da mesma fonte de verdade."
        />
      </div>

      {activeView === "config" ? (
        <div className="space-y-[14px]">
          <div className="rounded-[24px] border border-[#161616] bg-[linear-gradient(180deg,#0B0B0B_0%,#090909_100%)] px-[18px] py-[18px] sm:px-[22px] sm:py-[22px]">
            <div className="flex flex-col gap-[14px] lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-[12px] uppercase tracking-[0.18em] text-[#5F5F5F]">
                  Modulo Bate Ponto
                </p>
                <h3 className="mt-[10px] text-[22px] leading-none font-medium text-[#D1D1D1]">
                  Mantenha o controle de jornada em operacao
                </h3>
                <p className="mt-[10px] max-w-[760px] text-[14px] leading-[1.6] text-[#7B7B7B]">
                  O Flowdesk libera registro de ponto, pausas, historico e banco de horas quando o modulo estiver ativo.
                </p>
              </div>

              <TimeclockInlineSwitch
                checked={draft.enabled}
                onChange={() => {
                  if (moduleControlsDisabled) return;
                  updateDraft("enabled", !draft.enabled);
                }}
                disabled={moduleControlsDisabled}
                ariaLabel="Ativar ou desativar modulo de Bate Ponto"
              />
            </div>
          </div>

          <div className="grid items-start gap-[14px] xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="h-fit rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
              <SectionTitle
                icon={Send}
                title="Canal e mensagem"
                description="Configure o canal publico, logs privados e o embed principal que abre o ponto do funcionario."
              />
              <div className="mt-[18px] grid gap-[14px] md:grid-cols-2">
                <ConfigStepSelect
                  label="Canal principal"
                  placeholder="Escolha o canal"
                  options={textChannelOptions}
                  value={draft.mainChannelId}
                  onChange={(value) => updateDraft("mainChannelId", value)}
                  disabled={controlsDisabled}
                  controlHeightPx={controlHeightPx}
                />
                <ConfigStepSelect
                  label="Canal de logs"
                  placeholder="Escolha o canal"
                  options={textChannelOptions}
                  value={draft.logChannelId}
                  onChange={(value) => updateDraft("logChannelId", value)}
                  disabled={controlsDisabled}
                  controlHeightPx={controlHeightPx}
                />
              </div>
              {selectedMainChannelMissing || selectedLogChannelMissing ? (
                <div className="mt-[12px] rounded-[16px] border border-[#3A2E14] bg-[#120F07] px-[14px] py-[12px] text-[13px] text-[#E3C879]">
                  Um canal salvo nao foi encontrado. Escolha um canal disponivel antes de publicar.
                </div>
              ) : null}
            </div>

            <div className="h-fit rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
              <SectionTitle
                icon={ShieldCheck}
                title="Regras gerais"
                description="Timezone, limite de jornada esquecida e opcoes de banco de horas."
              />
              <div className="mt-[18px] space-y-[14px]">
                <ConfigStepSelect
                  label="Timezone"
                  placeholder="Timezone"
                  options={TIMEZONE_OPTIONS}
                  value={draft.timezone}
                  onChange={(value) => updateDraft("timezone", value || "America/Sao_Paulo")}
                  disabled={controlsDisabled}
                  controlHeightPx={controlHeightPx}
                />
                <label className="block">
                  <span className="text-[12px] font-medium text-[#8A8A8A]">Limite maximo da jornada</span>
                  <input
                    type="time"
                    value={secondsToClockTime(draft.maxSessionSeconds)}
                    onChange={(event) => {
                      const [hours, minutes] = event.target.value.split(":").map(Number);
                      updateDraft("maxSessionSeconds", Math.max(3600, hours * 3600 + minutes * 60));
                    }}
                    disabled={controlsDisabled}
                    className="mt-[8px] h-[48px] w-full rounded-[14px] border border-[#171717] bg-[#0B0B0B] px-[12px] text-[14px] text-[#DADADA] outline-none focus:border-[#2A2A2A] disabled:opacity-55"
                  />
                </label>
                <div className="grid gap-[10px]">
                  {[
                    ["hourBankEnabled", "Banco de horas"],
                    ["overtimeApprovalEnabled", "Aprovacao de horas extras"],
                    ["rankingPublic", "Ranking publico"],
                    ["alertsEnabled", "Alertas operacionais"],
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => updateDraft(key as keyof TimeclockSettingsPayload, !draft[key as keyof TimeclockSettingsPayload] as never)}
                      disabled={controlsDisabled}
                      className="flex items-center justify-between rounded-[15px] border border-[#151515] bg-[#0A0A0A] px-[13px] py-[12px] text-left text-[13px] text-[#CFCFCF] disabled:opacity-55"
                    >
                      {label}
                      <span className={`flex h-[20px] w-[20px] items-center justify-center rounded-[7px] border ${
                        draft[key as keyof TimeclockSettingsPayload]
                          ? "border-[#2B6E3A] bg-[#102416] text-[#94E8A4]"
                          : "border-[#2A2A2A] text-transparent"
                      }`}>
                        <Check className="h-[13px] w-[13px]" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <TicketMessageBuilder
            guildId={guildId}
            value={draft.panelLayout}
            onChange={(layout) => updateDraft("panelLayout", layout)}
            disabled={controlsDisabled}
            hideSendButton
            eyebrow="Mensagem principal"
            headline="Embed do Bate Ponto"
            description="Monte a mensagem publica do ponto. O botao funcional abre o painel privado do funcionario no Discord."
            thumbnailPreviewUrl={null}
          />

          <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[16px]">
            <div className="flex flex-col gap-[14px] md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-[12px] uppercase tracking-[0.16em] text-[#666]">
                  Publicacao
                </p>
                <p className="mt-[8px] text-[14px] leading-[1.5] text-[#7B7B7B]">
                  Envie ou atualize a mensagem publica de Bate Ponto no canal principal configurado.
                </p>
              </div>
              <button
                type="button"
                onClick={handlePublish}
                disabled={controlsDisabled || publishing || !draft.enabled || hasUnsavedChanges}
                className="inline-flex h-[42px] shrink-0 items-center justify-center gap-[8px] rounded-[13px] bg-[#E8E8E8] px-[16px] text-[13px] font-semibold text-[#111] transition-transform hover:scale-[1.015] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:scale-100"
              >
                {publishing ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <Send className="h-[15px] w-[15px]" />}
                Publicar no Discord
              </button>
            </div>
            {feedback ? (
              <div className={`mt-[12px] rounded-[16px] border px-[14px] py-[12px] text-[13px] ${
                feedback.tone === "success"
                  ? "border-[#1B3C24] bg-[#09140D] text-[#9DE6AE]"
                  : "border-[#3A1B1B] bg-[#120808] text-[#E7A5A5]"
              }`}>
                {feedback.text}
              </div>
            ) : null}
          </div>

          <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
            <SectionTitle
              icon={CalendarClock}
              title="Escala semanal"
              description="Cada dia possui entrada, saida, carga, intervalo e tolerancias proprias, inclusive jornadas atravessando meia-noite."
            />
            <div className="mt-[14px] overflow-x-auto">
              <div className="min-w-[940px] space-y-[8px]">
                {scheduleDays.map(({ label, day }) => (
                  <div
                    key={day.weekday}
                    className="grid grid-cols-[140px_84px_repeat(6,minmax(92px,1fr))] items-center gap-[8px] rounded-[16px] border border-[#151515] bg-[#090909] px-[11px] py-[9px]"
                  >
                    <p className="text-[13px] font-medium text-[#DCDCDC]">{label}</p>
                    <button
                      type="button"
                      onClick={() => setScheduleDay(day.weekday, { enabled: !day.enabled })}
                      disabled={controlsDisabled}
                      className={`h-[36px] rounded-[12px] text-[12px] font-medium ${
                        day.enabled
                          ? "bg-[#102416] text-[#94E8A4]"
                          : "bg-[#151515] text-[#777]"
                      }`}
                    >
                      {day.enabled ? "Trabalho" : "Folga"}
                    </button>
                    {[
                      ["startTime", "Entrada", day.startTime],
                      ["endTime", "Saida", day.endTime],
                    ].map(([key, aria, value]) => (
                      <input
                        key={key}
                        aria-label={`${aria} ${label}`}
                        type="time"
                        value={String(value)}
                        onChange={(event) => setScheduleDay(day.weekday, { [key]: event.target.value })}
                        disabled={controlsDisabled || !day.enabled}
                        className="h-[36px] rounded-[12px] border border-[#171717] bg-[#0B0B0B] px-[8px] text-[12px] text-[#D8D8D8] outline-none disabled:opacity-45"
                      />
                    ))}
                    {[
                      ["expectedWorkSeconds", day.expectedWorkSeconds],
                      ["expectedBreakSeconds", day.expectedBreakSeconds],
                      ["entryToleranceSeconds", day.entryToleranceSeconds],
                      ["exitToleranceSeconds", day.exitToleranceSeconds],
                    ].map(([key, value]) => (
                      <input
                        key={key}
                        aria-label={`${key} ${label}`}
                        type="time"
                        value={secondsToClockTime(Number(value))}
                        onChange={(event) => {
                          const [hours, minutes] = event.target.value.split(":").map(Number);
                          setScheduleDay(day.weekday, { [key]: hours * 3600 + minutes * 60 });
                        }}
                        disabled={controlsDisabled || !day.enabled}
                        className="h-[36px] rounded-[12px] border border-[#171717] bg-[#0B0B0B] px-[8px] text-[12px] text-[#D8D8D8] outline-none disabled:opacity-45"
                      />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid gap-[14px] xl:grid-cols-2">
            <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
              <SectionTitle
                icon={ShieldCheck}
                title="Permissoes e cargos"
                description="Controle quem pode usar, visualizar, editar e aprovar horas no servidor."
              />
              <div className="mt-[18px] grid gap-[14px]">
                <ConfigStepMultiSelect label="Cargos que podem bater ponto" placeholder="Vazio permite membros elegiveis" options={roleOptions} values={draft.employeeRoleIds} onChange={(values) => updateDraft("employeeRoleIds", values)} disabled={controlsDisabled} controlHeightPx={controlHeightPx} />
                <ConfigStepMultiSelect label="Visualizar historico" placeholder="Escolha cargos" options={roleOptions} values={draft.viewHistoryRoleIds} onChange={(values) => updateDraft("viewHistoryRoleIds", values)} disabled={controlsDisabled} controlHeightPx={controlHeightPx} />
                <ConfigStepMultiSelect label="Editar pontos" placeholder="Escolha cargos" options={roleOptions} values={draft.editTimeclockRoleIds} onChange={(values) => updateDraft("editTimeclockRoleIds", values)} disabled={controlsDisabled} controlHeightPx={controlHeightPx} />
                <ConfigStepMultiSelect label="Aprovar horas" placeholder="Escolha cargos" options={roleOptions} values={draft.approveHoursRoleIds} onChange={(values) => updateDraft("approveHoursRoleIds", values)} disabled={controlsDisabled} controlHeightPx={controlHeightPx} />
                <ConfigStepMultiSelect label="Administrar modulo" placeholder="Escolha cargos" options={roleOptions} values={draft.adminRoleIds} onChange={(values) => updateDraft("adminRoleIds", values)} disabled={controlsDisabled} controlHeightPx={controlHeightPx} />
              </div>
            </div>

            <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
              <SectionTitle
                icon={ClipboardList}
                title="Regras de banco"
                description="Parametrize entrada antecipada, saida apos expediente e aprovacao de horas adicionais."
              />
              <div className="mt-[18px] grid gap-[14px]">
                <ConfigStepSelect label="Entrada antecipada" placeholder="Politica" options={POLICY_OPTIONS} value={draft.earlyStartPolicy} onChange={(value) => updateDraft("earlyStartPolicy", (value || "count") as TimeclockSettingsPayload["earlyStartPolicy"])} disabled={controlsDisabled} controlHeightPx={controlHeightPx} />
                <ConfigStepSelect label="Saida apos expediente" placeholder="Politica" options={POLICY_OPTIONS} value={draft.lateFinishPolicy} onChange={(value) => updateDraft("lateFinishPolicy", (value || "count") as TimeclockSettingsPayload["lateFinishPolicy"])} disabled={controlsDisabled} controlHeightPx={controlHeightPx} />
                <div className="rounded-[18px] border border-[#151515] bg-[#090909] px-[14px] py-[14px] text-[13px] leading-[1.65] text-[#777]">
                  Ajustes manuais, aprovacoes parciais, rejeicoes e alteracoes de escala ficam registrados em eventos imutaveis no backend.
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeView === "live" ? (
        <div className="space-y-[14px]">
          {summaryError ? (
            <div className="rounded-[22px] border border-[#3A1B1B] bg-[#120808] px-[16px] py-[14px] text-[13px] text-[#E7A5A5]">
              {summaryError instanceof Error ? summaryError.message : "Nao foi possivel carregar acompanhamento."}
            </div>
          ) : null}
          <div className="grid gap-[12px] md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Trabalhando agora" value={String(summary?.totals.workingCount || 0)} icon={Activity} />
            <MetricCard label="Em pausa" value={String(summary?.totals.pausedCount || 0)} icon={Clock3} />
            <MetricCard label="Finalizados hoje" value={String(summary?.totals.finishedCount || 0)} icon={Check} />
            <MetricCard label="Horas hoje" value={formatDuration(summary?.totals.workedSeconds || 0)} icon={BarChart3} />
          </div>
          <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
            <SectionTitle icon={Activity} title="Acompanhamento em tempo real" description="Atualiza automaticamente enquanto o painel fica aberto." />
            <div className="mt-[18px] space-y-[8px]">
              {summaryLoading && !summary?.active.length ? (
                <div className="flex h-[120px] items-center justify-center text-[13px] text-[#777]">
                  <Loader2 className="mr-[8px] h-[15px] w-[15px] animate-spin" /> Carregando jornadas
                </div>
              ) : summary?.active.length ? summary.active.map((item) => (
                <div key={item.id} className="grid gap-[12px] rounded-[18px] border border-[#121212] bg-[#090909] px-[14px] py-[12px] md:grid-cols-[minmax(0,1.2fr)_120px_120px_120px] md:items-center">
                  <UserCell user={item.user} />
                  <span className="text-[13px] text-[#CFCFCF]">{statusLabel(item.status)}</span>
                  <span className="text-[13px] text-[#8A8A8A]">{formatDuration(item.totalWorkedSeconds)}</span>
                  <span className="text-[13px] text-[#8A8A8A]">{formatDateTime(item.startedAt)}</span>
                </div>
              )) : (
                <div className="rounded-[18px] border border-dashed border-[#181818] px-[16px] py-[24px] text-center text-[13px] text-[#777]">
                  Nenhuma jornada ativa hoje.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {activeView === "history" ? (
        <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
          <SectionTitle icon={History} title="Historico geral" description="Tabela server-side com jornadas, pausas, saldo e status." />
          <div className="mt-[18px] overflow-x-auto">
            <table className="w-full min-w-[920px] border-separate border-spacing-y-[8px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.14em] text-[#666]">
                  <th className="px-[12px] py-[8px]">Funcionario</th>
                  <th className="px-[12px] py-[8px]">Data</th>
                  <th className="px-[12px] py-[8px]">Entrada</th>
                  <th className="px-[12px] py-[8px]">Saida</th>
                  <th className="px-[12px] py-[8px]">Trabalhado</th>
                  <th className="px-[12px] py-[8px]">Previsto</th>
                  <th className="px-[12px] py-[8px]">Saldo</th>
                  <th className="px-[12px] py-[8px]">Status</th>
                </tr>
              </thead>
              <tbody>
                {(summary?.history.items || []).map((item) => (
                  <tr key={item.id} className="bg-[#090909] text-[13px] text-[#D6D6D6]">
                    <td className="rounded-l-[16px] px-[12px] py-[12px]"><UserCell user={item.user} /></td>
                    <td className="px-[12px] py-[12px]">{item.workday}</td>
                    <td className="px-[12px] py-[12px]">{formatDateTime(item.startedAt)}</td>
                    <td className="px-[12px] py-[12px]">{formatDateTime(item.endedAt)}</td>
                    <td className="px-[12px] py-[12px]">{formatDuration(item.totalWorkedSeconds)}</td>
                    <td className="px-[12px] py-[12px]">{formatDuration(item.expectedWorkSeconds)}</td>
                    <td className="px-[12px] py-[12px]">{formatSignedDuration(item.balanceSeconds)}</td>
                    <td className="rounded-r-[16px] px-[12px] py-[12px]">{statusLabel(item.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!summary?.history.items.length ? (
              <div className="rounded-[18px] border border-dashed border-[#181818] px-[16px] py-[24px] text-center text-[13px] text-[#777]">
                Nenhum historico encontrado.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeView === "ranking" ? (
        <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
          <SectionTitle icon={BarChart3} title="Ranking" description="Agregado no backend por periodo, sem trazer todas as sessoes para o navegador." />
          <div className="mt-[18px] space-y-[8px]">
            {(summary?.ranking || []).map((item) => (
              <div key={item.userId} className="grid gap-[12px] rounded-[18px] border border-[#121212] bg-[#090909] px-[14px] py-[12px] md:grid-cols-[52px_minmax(0,1fr)_130px_110px_120px] md:items-center">
                <span className="text-[18px] font-semibold text-[#E6E6E6]">{item.position}o</span>
                <UserCell user={item.user} />
                <span className="text-[13px] text-[#DCDCDC]">{formatDuration(item.totalWorkedSeconds)}</span>
                <span className="text-[13px] text-[#8A8A8A]">{item.sessionCount} jornadas</span>
                <span className="text-[13px] text-[#8A8A8A]">{formatSignedDuration(item.bankSeconds)}</span>
              </div>
            ))}
            {!summary?.ranking.length ? (
              <div className="rounded-[18px] border border-dashed border-[#181818] px-[16px] py-[24px] text-center text-[13px] text-[#777]">
                Ranking vazio para o periodo.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {activeView === "audit" ? (
        <div className="rounded-[22px] border border-[#151515] bg-[#080808] px-[18px] py-[18px]">
          <SectionTitle icon={ClipboardList} title="Auditoria" description="Timeline imutavel de eventos de ponto, ajustes, aprovacoes e configuracoes." />
          <div className="mt-[18px] space-y-[8px]">
            {(summary?.audit || []).map((event) => (
              <div key={event.id} className="rounded-[18px] border border-[#121212] bg-[#090909] px-[14px] py-[12px]">
                <div className="flex flex-col gap-[10px] md:flex-row md:items-center md:justify-between">
                  <UserCell user={event.user} />
                  <span className="text-[12px] text-[#777]">{formatDateTime(event.timestamp)}</span>
                </div>
                <div className="mt-[10px] grid gap-[8px] text-[13px] text-[#AFAFAF] md:grid-cols-4">
                  <span>{event.eventType}</span>
                  <span>{`${event.previousState || "--"} -> ${event.newState || "--"}`}</span>
                  <span>{event.source}</span>
                  <span className="truncate">{event.sessionId || "sem sessao"}</span>
                </div>
              </div>
            ))}
            {!summary?.audit.length ? (
              <div className="rounded-[18px] border border-dashed border-[#181818] px-[16px] py-[24px] text-center text-[13px] text-[#777]">
                Nenhum evento de auditoria encontrado.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showFloatingSaveBar ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-[18px] z-[120] px-[18px]">
          <div className="mx-auto w-full max-w-[940px] pointer-events-auto">
            <div className="relative overflow-hidden rounded-[26px] shadow-[0_24px_90px_rgba(0,0,0,0.52)]">
              <span
                aria-hidden="true"
                className={`pointer-events-none absolute inset-[-1px] rounded-[26px] ${
                  saveBarHasError ? "flowdesk-tag-border-core-danger" : "flowdesk-tag-border-core"
                }`}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-[1px] rounded-[25px] bg-[#070707]"
              />
              <div className="relative z-10 flex flex-col gap-[16px] px-[18px] py-[16px] sm:px-[22px] sm:py-[18px] xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] leading-[1.2] font-medium text-[#D8D8D8]">
                    {saveBarTitle}
                  </p>
                  <p className="mt-[8px] max-w-[680px] text-[13px] leading-[1.55] text-[#7F7F7F]">
                    {saveBarDescription}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col-reverse gap-[10px] sm:flex-row sm:items-center">
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={!canReset}
                    className={`group relative inline-flex h-[46px] items-center justify-center overflow-hidden whitespace-nowrap rounded-[12px] px-6 text-[15px] leading-none font-semibold transition-colors ${
                      canReset ? "" : "cursor-not-allowed"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 rounded-[12px] border transition-colors ${
                        canReset
                          ? "border-[#1B1B1B] bg-[#111111]"
                          : "border-[#151515] bg-[#0E0E0E]"
                      }`}
                    />
                    <span className={`relative z-10 ${canReset ? "text-[#D0D0D0]" : "text-[#666666]"}`}>
                      Redefinir
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleSave();
                    }}
                    disabled={!canSave}
                    className={`group relative inline-flex h-[46px] items-center justify-center overflow-hidden whitespace-nowrap rounded-[12px] px-6 text-[15px] leading-none font-semibold ${
                      canSave ? "" : "cursor-not-allowed"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute inset-0 rounded-[12px] transition-transform duration-150 ease-out ${
                        canSave || saving
                          ? "bg-[linear-gradient(180deg,#FFFFFF_0%,#D1D1D1_100%)] group-hover:scale-[1.02] group-active:scale-[0.985]"
                          : "bg-[#111111]"
                      }`}
                    />
                    <span className={`relative z-10 text-[#282828] transition-opacity ${saving ? "opacity-0" : "opacity-100"}`}>
                      Salvar alteracoes
                    </span>
                    {saving ? (
                      <span className="absolute inset-0 z-20 inline-flex items-center justify-center">
                        <Loader2 className="h-[20px] w-[20px] animate-spin text-[#282828]" />
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
