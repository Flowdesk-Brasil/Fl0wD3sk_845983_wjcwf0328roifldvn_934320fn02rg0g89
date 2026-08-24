import { getSupabaseAdminClientOrThrow } from "@/lib/supabaseAdmin";
import {
  calculateTimeclockMetrics,
  createDefaultScheduleDays,
  formatDuration,
  getAvailableActions,
  normalizeScheduleDay,
  normalizeTimezone,
  resolveTransition,
  resolveWorkday,
  type TimeclockAction,
  type TimeclockEventType,
  type TimeclockInterval,
  type TimeclockScheduleDay,
  type TimeclockSessionLike,
  type TimeclockSessionStatus,
  type TimeclockSource,
} from "@/lib/timeclock/core";
import {
  createTicketPanelComponentId,
  normalizeTicketPanelLayout,
  type TicketPanelLayout,
} from "@/lib/servers/ticketPanelBuilder";

const SETTINGS_TABLE = "guild_timeclock_settings";
const SCHEDULE_DAYS_TABLE = "timeclock_schedule_days";
const SESSIONS_TABLE = "timeclock_sessions";
const INTERVALS_TABLE = "timeclock_intervals";
const EVENTS_TABLE = "timeclock_events";
const HOUR_BANK_TABLE = "timeclock_hour_bank";
const APPROVALS_TABLE = "timeclock_approvals";

export type TimeclockSettings = {
  guildId: string;
  enabled: boolean;
  mainChannelId: string | null;
  logChannelId: string | null;
  panelMessageId: string | null;
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
  updatedAt: string | null;
};

export type TimeclockActor = {
  guildId: string;
  userId: string;
  actorId?: string | null;
  memberRoleIds?: string[];
  source: TimeclockSource;
  interactionId?: string | null;
  idempotencyKey?: string | null;
  now?: Date;
};

export type ApplyTimeclockActionInput = TimeclockActor & {
  action: TimeclockAction;
};

type SessionRecord = {
  id: string;
  guild_id: string;
  user_id: string;
  workday: string;
  timezone: string;
  status: TimeclockSessionStatus;
  approval_status: string;
  started_at: string | null;
  ended_at: string | null;
  active_interval_started_at: string | null;
  total_worked_seconds: number;
  total_paused_seconds: number;
  expected_work_seconds: number;
  balance_seconds: number;
  overtime_seconds: number;
  missing_seconds: number;
  early_start_seconds: number;
  late_start_seconds: number;
  early_leave_seconds: number;
  late_leave_seconds: number;
  created_at: string;
  updated_at: string;
};

type IntervalRecord = {
  id: string;
  session_id: string;
  guild_id: string;
  user_id: string;
  interval_type: "WORK" | "BREAK";
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
};

function isMissingTimeclockSchema(error: unknown) {
  const record = error as { code?: unknown; message?: unknown } | null;
  const code = typeof record?.code === "string" ? record.code : "";
  const message = typeof record?.message === "string" ? record.message.toLowerCase() : "";
  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("guild_timeclock_settings") ||
    message.includes("timeclock_sessions") ||
    message.includes("timeclock_schedule_days")
  );
}

function throwSchemaMissing(error: unknown): never {
  if (isMissingTimeclockSchema(error)) {
    throw new Error("Modulo Bate Ponto ainda sem schema. Rode a migration 142_timeclock_enterprise.sql.");
  }
  const record = error as { message?: unknown } | null;
  throw new Error(typeof record?.message === "string" ? record.message : "Erro no Bate Ponto.");
}

function normalizeSnowflakeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => /^\d{10,25}$/.test(item));
}

function normalizePolicy(value: unknown): "count" | "ignore" | "approval" | "limit" {
  return value === "ignore" || value === "approval" || value === "limit" ? value : "count";
}

function createDefaultTimeclockPanelLayout(): TicketPanelLayout {
  return [
    {
      id: createTicketPanelComponentId("container"),
      type: "container",
      accentColor: "#8AB6FF",
      children: [
        {
          id: createTicketPanelComponentId("content"),
          type: "content",
          markdown:
            "## Controle de Ponto\nUtilize o botao abaixo para acessar seu ponto.",
          accessory: null,
        },
        {
          id: createTicketPanelComponentId("separator"),
          type: "separator",
          spacing: "md",
        },
        {
          id: createTicketPanelComponentId("button"),
          type: "button",
          label: "Bater Ponto",
          style: "primary",
          disabled: false,
        },
      ],
    },
  ];
}

function buildDefaultSettings(guildId: string): TimeclockSettings {
  return {
    guildId,
    enabled: false,
    mainChannelId: null,
    logChannelId: null,
    panelMessageId: null,
    panelLayout: createDefaultTimeclockPanelLayout(),
    timezone: "America/Sao_Paulo",
    employeeRoleIds: [],
    viewHistoryRoleIds: [],
    editTimeclockRoleIds: [],
    approveHoursRoleIds: [],
    adminRoleIds: [],
    hourBankEnabled: true,
    earlyStartPolicy: "count",
    lateFinishPolicy: "count",
    overtimeApprovalEnabled: false,
    rankingPublic: false,
    maxSessionSeconds: 14 * 3600,
    alertsEnabled: true,
    scheduleDays: createDefaultScheduleDays(),
    updatedAt: null,
  };
}

function normalizeSettingsRecord(
  guildId: string,
  record: Record<string, unknown> | null,
  scheduleRows: Array<Record<string, unknown>>,
): TimeclockSettings {
  const fallback = buildDefaultSettings(guildId);
  const scheduleByWeekday = new Map(
    createDefaultScheduleDays().map((day) => [day.weekday, day]),
  );

  for (const row of scheduleRows) {
    scheduleByWeekday.set(
      Number(row.weekday),
      normalizeScheduleDay({
        weekday: Number(row.weekday),
        enabled: row.enabled !== false,
        startTime: typeof row.start_time === "string" ? row.start_time.slice(0, 5) : "09:00",
        endTime: typeof row.end_time === "string" ? row.end_time.slice(0, 5) : "18:00",
        expectedWorkSeconds: Number(row.expected_work_seconds),
        expectedBreakSeconds: Number(row.expected_break_seconds),
        minBreakSeconds: Number(row.min_break_seconds),
        maxBreakSeconds: Number(row.max_break_seconds),
        entryToleranceSeconds: Number(row.entry_tolerance_seconds),
        exitToleranceSeconds: Number(row.exit_tolerance_seconds),
      }),
    );
  }

  if (!record) {
    return {
      ...fallback,
      scheduleDays: [...scheduleByWeekday.values()],
    };
  }

  return {
    guildId,
    enabled: record.enabled === true,
    mainChannelId: typeof record.main_channel_id === "string" ? record.main_channel_id : null,
    logChannelId: typeof record.log_channel_id === "string" ? record.log_channel_id : null,
    panelMessageId: typeof record.panel_message_id === "string" ? record.panel_message_id : null,
    panelLayout: normalizeTicketPanelLayout(record.panel_layout, {
      panelTitle: "Controle de Ponto",
      panelDescription: "Utilize o botao abaixo para acessar seu ponto.",
      panelButtonLabel: "Bater Ponto",
    }),
    timezone: normalizeTimezone(record.timezone),
    employeeRoleIds: normalizeSnowflakeList(record.employee_role_ids),
    viewHistoryRoleIds: normalizeSnowflakeList(record.view_history_role_ids),
    editTimeclockRoleIds: normalizeSnowflakeList(record.edit_timeclock_role_ids),
    approveHoursRoleIds: normalizeSnowflakeList(record.approve_hours_role_ids),
    adminRoleIds: normalizeSnowflakeList(record.admin_role_ids),
    hourBankEnabled: record.hour_bank_enabled !== false,
    earlyStartPolicy: normalizePolicy(record.early_start_policy),
    lateFinishPolicy: normalizePolicy(record.late_finish_policy),
    overtimeApprovalEnabled: record.overtime_approval_enabled === true,
    rankingPublic: record.ranking_public === true,
    maxSessionSeconds: Math.max(3600, Math.min(172800, Number(record.max_session_seconds) || 14 * 3600)),
    alertsEnabled: record.alerts_enabled !== false,
    scheduleDays: [...scheduleByWeekday.values()].map(normalizeScheduleDay),
    updatedAt: typeof record.updated_at === "string" ? record.updated_at : null,
  };
}

export async function getTimeclockSettings(guildId: string) {
  const supabase = getSupabaseAdminClientOrThrow();
  const [settingsResult, scheduleResult] = await Promise.all([
    supabase.from(SETTINGS_TABLE).select("*").eq("guild_id", guildId).maybeSingle(),
    supabase
      .from(SCHEDULE_DAYS_TABLE)
      .select("*")
      .eq("guild_id", guildId)
      .order("weekday", { ascending: true }),
  ]);

  if (settingsResult.error) throwSchemaMissing(settingsResult.error);
  if (scheduleResult.error) throwSchemaMissing(scheduleResult.error);

  return normalizeSettingsRecord(
    guildId,
    (settingsResult.data as Record<string, unknown> | null) || null,
    (scheduleResult.data as Array<Record<string, unknown>>) || [],
  );
}

export async function saveTimeclockSettings(input: {
  guildId: string;
  settings: Partial<TimeclockSettings>;
  configuredByUserId: number;
}) {
  const supabase = getSupabaseAdminClientOrThrow();
  const fallback = await getTimeclockSettings(input.guildId).catch(() => buildDefaultSettings(input.guildId));
  const nextScheduleDays = (input.settings.scheduleDays?.length
    ? input.settings.scheduleDays
    : fallback.scheduleDays
  ).map(normalizeScheduleDay);
  const nextPanelLayout = normalizeTicketPanelLayout(
    input.settings.panelLayout || fallback.panelLayout,
    {
      panelTitle: "Controle de Ponto",
      panelDescription: "Utilize o botao abaixo para acessar seu ponto.",
      panelButtonLabel: "Bater Ponto",
    },
  );

  const payload = {
    guild_id: input.guildId,
    enabled: input.settings.enabled ?? fallback.enabled,
    main_channel_id: input.settings.mainChannelId || null,
    log_channel_id: input.settings.logChannelId || null,
    panel_layout: nextPanelLayout,
    timezone: normalizeTimezone(input.settings.timezone || fallback.timezone),
    employee_role_ids: normalizeSnowflakeList(input.settings.employeeRoleIds),
    view_history_role_ids: normalizeSnowflakeList(input.settings.viewHistoryRoleIds),
    edit_timeclock_role_ids: normalizeSnowflakeList(input.settings.editTimeclockRoleIds),
    approve_hours_role_ids: normalizeSnowflakeList(input.settings.approveHoursRoleIds),
    admin_role_ids: normalizeSnowflakeList(input.settings.adminRoleIds),
    hour_bank_enabled: input.settings.hourBankEnabled ?? fallback.hourBankEnabled,
    early_start_policy: normalizePolicy(input.settings.earlyStartPolicy),
    late_finish_policy: normalizePolicy(input.settings.lateFinishPolicy),
    overtime_approval_enabled:
      input.settings.overtimeApprovalEnabled ?? fallback.overtimeApprovalEnabled,
    ranking_public: input.settings.rankingPublic ?? fallback.rankingPublic,
    max_session_seconds: Math.max(
      3600,
      Math.min(172800, Number(input.settings.maxSessionSeconds || fallback.maxSessionSeconds)),
    ),
    alerts_enabled: input.settings.alertsEnabled ?? fallback.alertsEnabled,
    configured_by_user_id: input.configuredByUserId,
  };

  const settingsResult = await supabase
    .from(SETTINGS_TABLE)
    .upsert(payload, { onConflict: "guild_id" })
    .select("*")
    .single();

  if (settingsResult.error) throwSchemaMissing(settingsResult.error);

  const schedulePayload = nextScheduleDays.map((day) => ({
    guild_id: input.guildId,
    weekday: day.weekday,
    enabled: day.enabled,
    start_time: day.startTime,
    end_time: day.endTime,
    expected_work_seconds: day.expectedWorkSeconds,
    expected_break_seconds: day.expectedBreakSeconds,
    min_break_seconds: day.minBreakSeconds,
    max_break_seconds: day.maxBreakSeconds,
    entry_tolerance_seconds: day.entryToleranceSeconds,
    exit_tolerance_seconds: day.exitToleranceSeconds,
  }));

  const scheduleResult = await supabase
    .from(SCHEDULE_DAYS_TABLE)
    .upsert(schedulePayload, { onConflict: "guild_id,weekday" })
    .select("*");

  if (scheduleResult.error) throwSchemaMissing(scheduleResult.error);

  await recordTimeclockEvent({
    guildId: input.guildId,
    userId: String(input.configuredByUserId),
    sessionId: null,
    eventType: "TIMECLOCK_CONFIG_UPDATED",
    timestamp: new Date().toISOString(),
    timezone: payload.timezone,
    source: "web",
    actorId: String(input.configuredByUserId),
    previousState: null,
    newState: payload.enabled ? "ENABLED" : "DISABLED",
    interactionId: null,
    idempotencyKey: `config:${input.configuredByUserId}:${Date.now()}`,
    metadata: { scheduleDays: nextScheduleDays.length },
  }).catch(() => null);

  return normalizeSettingsRecord(
    input.guildId,
    settingsResult.data as Record<string, unknown>,
    scheduleResult.data as Array<Record<string, unknown>>,
  );
}

export async function updateTimeclockPanelMessageId(input: {
  guildId: string;
  messageId: string | null;
}) {
  const result = await getSupabaseAdminClientOrThrow()
    .from(SETTINGS_TABLE)
    .update({ panel_message_id: input.messageId || null })
    .eq("guild_id", input.guildId);
  if (result.error) throwSchemaMissing(result.error);
}

function assertMemberCanUseTimeclock(settings: TimeclockSettings, memberRoleIds: string[] = []) {
  if (!settings.enabled) {
    throw new Error("Bate Ponto desativado neste servidor.");
  }
  if (!settings.employeeRoleIds.length) return;
  const roles = new Set(memberRoleIds);
  if (!settings.employeeRoleIds.some((roleId) => roles.has(roleId))) {
    throw new Error("Voce nao possui cargo autorizado para usar o Bate Ponto.");
  }
}

async function recordTimeclockEvent(input: {
  guildId: string;
  userId: string;
  sessionId: string | null;
  eventType: TimeclockEventType;
  timestamp: string;
  timezone: string;
  source: TimeclockSource | "web";
  actorId: string | null;
  previousState: string | null;
  newState: string | null;
  interactionId: string | null;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
}) {
  const result = await getSupabaseAdminClientOrThrow()
    .from(EVENTS_TABLE)
    .insert({
      guild_id: input.guildId,
      user_id: input.userId,
      session_id: input.sessionId,
      event_type: input.eventType,
      timestamp: input.timestamp,
      timezone: input.timezone,
      source: input.source,
      actor_id: input.actorId,
      previous_state: input.previousState,
      new_state: input.newState,
      interaction_id: input.interactionId,
      idempotency_key: input.idempotencyKey,
      metadata: input.metadata,
    })
    .select("*")
    .single();

  if (result.error) throwSchemaMissing(result.error);
  return result.data;
}

async function findIdempotentEvent(guildId: string, idempotencyKey: string | null | undefined) {
  if (!idempotencyKey) return null;
  const result = await getSupabaseAdminClientOrThrow()
    .from(EVENTS_TABLE)
    .select("session_id")
    .eq("guild_id", guildId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (result.error) throwSchemaMissing(result.error);
  return result.data as { session_id: string | null } | null;
}

async function loadSessionById(sessionId: string) {
  const result = await getSupabaseAdminClientOrThrow()
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (result.error) throwSchemaMissing(result.error);
  return result.data as SessionRecord | null;
}

async function loadCurrentSession(input: { guildId: string; userId: string; workday: string }) {
  const result = await getSupabaseAdminClientOrThrow()
    .from(SESSIONS_TABLE)
    .select("*")
    .eq("guild_id", input.guildId)
    .eq("user_id", input.userId)
    .eq("workday", input.workday)
    .maybeSingle();
  if (result.error) throwSchemaMissing(result.error);
  return result.data as SessionRecord | null;
}

async function loadSessionIntervals(sessionId: string) {
  const result = await getSupabaseAdminClientOrThrow()
    .from(INTERVALS_TABLE)
    .select("*")
    .eq("session_id", sessionId)
    .order("started_at", { ascending: true });
  if (result.error) throwSchemaMissing(result.error);
  return (result.data || []) as IntervalRecord[];
}

async function closeOpenInterval(input: {
  session: SessionRecord;
  expectedType: "WORK" | "BREAK";
  endedAt: string;
}) {
  const supabase = getSupabaseAdminClientOrThrow();
  const openResult = await supabase
    .from(INTERVALS_TABLE)
    .select("*")
    .eq("session_id", input.session.id)
    .is("ended_at", null)
    .maybeSingle();
  if (openResult.error) throwSchemaMissing(openResult.error);
  const openInterval = openResult.data as IntervalRecord | null;
  if (!openInterval) {
    throw new Error("Nenhum intervalo aberto encontrado para esta jornada.");
  }
  if (openInterval.interval_type !== input.expectedType) {
    throw new Error("Estado interno inconsistente: intervalo aberto nao corresponde a acao.");
  }
  const durationSeconds = Math.max(
    0,
    Math.trunc((Date.parse(input.endedAt) - Date.parse(openInterval.started_at)) / 1000),
  );
  const updateResult = await supabase
    .from(INTERVALS_TABLE)
    .update({
      ended_at: input.endedAt,
      duration_seconds: durationSeconds,
    })
    .eq("id", openInterval.id)
    .select("*")
    .single();
  if (updateResult.error) throwSchemaMissing(updateResult.error);
  return updateResult.data as IntervalRecord;
}

function toCoreInterval(interval: IntervalRecord): TimeclockInterval {
  return {
    type: interval.interval_type,
    startedAt: interval.started_at,
    endedAt: interval.ended_at,
    durationSeconds: interval.duration_seconds,
  };
}

function toSessionLike(session: SessionRecord): TimeclockSessionLike {
  return {
    status: session.status,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    timezone: session.timezone,
    workday: session.workday,
  };
}

async function recomputeAndPersistMetrics(input: {
  session: SessionRecord;
  scheduleDay: TimeclockScheduleDay;
  now: Date;
  endedAt?: string | null;
  nextStatus?: TimeclockSessionStatus;
  approvalStatus?: string;
}) {
  const intervals = await loadSessionIntervals(input.session.id);
  const sessionLike = {
    ...toSessionLike(input.session),
    status: input.nextStatus || input.session.status,
    endedAt: input.endedAt === undefined ? input.session.ended_at : input.endedAt,
  } satisfies TimeclockSessionLike;
  const metrics = calculateTimeclockMetrics({
    session: sessionLike,
    intervals: intervals.map(toCoreInterval),
    scheduleDay: input.scheduleDay,
    now: input.now,
  });
  const updateResult = await getSupabaseAdminClientOrThrow()
    .from(SESSIONS_TABLE)
    .update({
      status: input.nextStatus || input.session.status,
      approval_status: input.approvalStatus || input.session.approval_status,
      ended_at: input.endedAt === undefined ? input.session.ended_at : input.endedAt,
      total_worked_seconds: metrics.workedSeconds,
      total_paused_seconds: metrics.pausedSeconds,
      expected_work_seconds: metrics.expectedSeconds,
      balance_seconds: metrics.balanceSeconds,
      overtime_seconds: metrics.overtimeSeconds,
      missing_seconds: metrics.missingSeconds,
      early_start_seconds: metrics.earlyStartSeconds,
      late_start_seconds: metrics.lateStartSeconds,
      early_leave_seconds: metrics.earlyLeaveSeconds,
      late_leave_seconds: metrics.lateLeaveSeconds,
    })
    .eq("id", input.session.id)
    .select("*")
    .single();
  if (updateResult.error) throwSchemaMissing(updateResult.error);
  return {
    session: updateResult.data as SessionRecord,
    metrics,
  };
}

async function createHourBankLedger(input: {
  settings: TimeclockSettings;
  session: SessionRecord;
  balanceSeconds: number;
}) {
  if (!input.settings.hourBankEnabled) return;
  const supabase = getSupabaseAdminClientOrThrow();
  const previousResult = await supabase
    .from(HOUR_BANK_TABLE)
    .select("delta_seconds")
    .eq("guild_id", input.session.guild_id)
    .eq("user_id", input.session.user_id);
  if (previousResult.error) throwSchemaMissing(previousResult.error);
  const previousBalance = (previousResult.data || []).reduce(
    (sum: number, row: { delta_seconds?: number }) => sum + Number(row.delta_seconds || 0),
    0,
  );
  const approvalStatus =
    input.settings.overtimeApprovalEnabled && input.balanceSeconds > 0
      ? "PENDING_APPROVAL"
      : "NONE";
  const insertResult = await supabase.from(HOUR_BANK_TABLE).insert({
    guild_id: input.session.guild_id,
    user_id: input.session.user_id,
    session_id: input.session.id,
    workday: input.session.workday,
    delta_seconds: input.balanceSeconds,
    balance_after_seconds: previousBalance + input.balanceSeconds,
    approval_status: approvalStatus,
  });
  if (insertResult.error) throwSchemaMissing(insertResult.error);
}

async function createApprovalIfNeeded(input: {
  settings: TimeclockSettings;
  session: SessionRecord;
}) {
  if (!input.settings.overtimeApprovalEnabled || input.session.overtime_seconds <= 0) {
    return "NONE";
  }
  const result = await getSupabaseAdminClientOrThrow().from(APPROVALS_TABLE).insert({
    guild_id: input.session.guild_id,
    session_id: input.session.id,
    user_id: input.session.user_id,
    detected_seconds: input.session.overtime_seconds,
    status: "PENDING_APPROVAL",
  });
  if (result.error) throwSchemaMissing(result.error);
  return "PENDING_APPROVAL";
}

export async function applyTimeclockAction(input: ApplyTimeclockActionInput) {
  const now = input.now || new Date();
  const timestamp = now.toISOString();
  const settings = await getTimeclockSettings(input.guildId);
  assertMemberCanUseTimeclock(settings, input.memberRoleIds);

  const idempotentEvent = await findIdempotentEvent(input.guildId, input.idempotencyKey);
  if (idempotentEvent?.session_id) {
    const session = await loadSessionById(idempotentEvent.session_id);
    return buildActionResult({
      settings,
      session,
      scheduleDay: resolveWorkday({
        at: now,
        timezone: settings.timezone,
        scheduleDays: settings.scheduleDays,
      }).scheduleDay,
      idempotent: true,
    });
  }

  const workdayResolution = resolveWorkday({
    at: now,
    timezone: settings.timezone,
    scheduleDays: settings.scheduleDays,
  });
  const currentSession = await loadCurrentSession({
    guildId: input.guildId,
    userId: input.userId,
    workday: workdayResolution.workday,
  });
  const currentStatus = currentSession?.status || "NOT_STARTED";
  const transition = resolveTransition(currentStatus, input.action);
  let nextSession: SessionRecord;

  if (input.action === "START" && !currentSession) {
    const insertResult = await getSupabaseAdminClientOrThrow()
      .from(SESSIONS_TABLE)
      .insert({
        guild_id: input.guildId,
        user_id: input.userId,
        workday: workdayResolution.workday,
        timezone: settings.timezone,
        status: "WORKING",
        approval_status: "NONE",
        started_at: timestamp,
        active_interval_started_at: timestamp,
        expected_work_seconds: workdayResolution.scheduleDay.enabled
          ? workdayResolution.scheduleDay.expectedWorkSeconds
          : 0,
        source: input.source,
      })
      .select("*")
      .single();
    if (insertResult.error) throwSchemaMissing(insertResult.error);
    nextSession = insertResult.data as SessionRecord;

    const intervalResult = await getSupabaseAdminClientOrThrow()
      .from(INTERVALS_TABLE)
      .insert({
        session_id: nextSession.id,
        guild_id: input.guildId,
        user_id: input.userId,
        interval_type: "WORK",
        started_at: timestamp,
      });
    if (intervalResult.error) throwSchemaMissing(intervalResult.error);
  } else {
    if (!currentSession) {
      throw new Error("Nao existe jornada aberta para esta acao.");
    }

    if (input.action === "PAUSE") {
      await closeOpenInterval({ session: currentSession, expectedType: "WORK", endedAt: timestamp });
      const intervalResult = await getSupabaseAdminClientOrThrow()
        .from(INTERVALS_TABLE)
        .insert({
          session_id: currentSession.id,
          guild_id: input.guildId,
          user_id: input.userId,
          interval_type: "BREAK",
          started_at: timestamp,
        });
      if (intervalResult.error) throwSchemaMissing(intervalResult.error);
      nextSession = (
        await recomputeAndPersistMetrics({
          session: currentSession,
          scheduleDay: workdayResolution.scheduleDay,
          now,
          nextStatus: "PAUSED",
        })
      ).session;
    } else if (input.action === "RESUME") {
      await closeOpenInterval({ session: currentSession, expectedType: "BREAK", endedAt: timestamp });
      const intervalResult = await getSupabaseAdminClientOrThrow()
        .from(INTERVALS_TABLE)
        .insert({
          session_id: currentSession.id,
          guild_id: input.guildId,
          user_id: input.userId,
          interval_type: "WORK",
          started_at: timestamp,
        });
      if (intervalResult.error) throwSchemaMissing(intervalResult.error);
      nextSession = (
        await recomputeAndPersistMetrics({
          session: currentSession,
          scheduleDay: workdayResolution.scheduleDay,
          now,
          nextStatus: "WORKING",
        })
      ).session;
    } else {
      await closeOpenInterval({ session: currentSession, expectedType: "WORK", endedAt: timestamp });
      const recomputed = await recomputeAndPersistMetrics({
        session: currentSession,
        scheduleDay: workdayResolution.scheduleDay,
        now,
        endedAt: timestamp,
        nextStatus: "FINISHED",
      });
      nextSession = recomputed.session;
      const approvalStatus = await createApprovalIfNeeded({ settings, session: nextSession });
      if (approvalStatus === "PENDING_APPROVAL") {
        nextSession = (
          await recomputeAndPersistMetrics({
            session: nextSession,
            scheduleDay: workdayResolution.scheduleDay,
            now,
            endedAt: timestamp,
            nextStatus: "FINISHED",
            approvalStatus,
          })
        ).session;
      }
      await createHourBankLedger({
        settings,
        session: nextSession,
        balanceSeconds: nextSession.balance_seconds,
      });
    }
  }

  await recordTimeclockEvent({
    guildId: input.guildId,
    userId: input.userId,
    sessionId: nextSession.id,
    eventType: transition.event,
    timestamp,
    timezone: settings.timezone,
    source: input.source,
    actorId: input.actorId || input.userId,
    previousState: currentStatus,
    newState: transition.to,
    interactionId: input.interactionId || null,
    idempotencyKey: input.idempotencyKey || null,
    metadata: {
      workday: nextSession.workday,
      scheduleEnabled: workdayResolution.scheduleDay.enabled,
      workedSeconds: nextSession.total_worked_seconds,
      pausedSeconds: nextSession.total_paused_seconds,
      balanceSeconds: nextSession.balance_seconds,
    },
  });

  return buildActionResult({
    settings,
    session: nextSession,
    scheduleDay: workdayResolution.scheduleDay,
    idempotent: false,
  });
}

export async function getTimeclockStatus(input: TimeclockActor) {
  const settings = await getTimeclockSettings(input.guildId);
  assertMemberCanUseTimeclock(settings, input.memberRoleIds);
  const now = input.now || new Date();
  const workdayResolution = resolveWorkday({
    at: now,
    timezone: settings.timezone,
    scheduleDays: settings.scheduleDays,
  });
  const session = await loadCurrentSession({
    guildId: input.guildId,
    userId: input.userId,
    workday: workdayResolution.workday,
  });
  return buildActionResult({
    settings,
    session,
    scheduleDay: workdayResolution.scheduleDay,
    idempotent: false,
  });
}

async function buildActionResult(input: {
  settings: TimeclockSettings;
  session: SessionRecord | null;
  scheduleDay: TimeclockScheduleDay;
  idempotent: boolean;
}) {
  const intervals = input.session ? await loadSessionIntervals(input.session.id) : [];
  const status = input.session?.status || "NOT_STARTED";
  const metrics = input.session
    ? calculateTimeclockMetrics({
        session: toSessionLike(input.session),
        intervals: intervals.map(toCoreInterval),
        scheduleDay: input.scheduleDay,
      })
    : {
        workedSeconds: 0,
        pausedSeconds: 0,
        expectedSeconds: input.scheduleDay.enabled ? input.scheduleDay.expectedWorkSeconds : 0,
        balanceSeconds: 0,
        overtimeSeconds: 0,
        missingSeconds: 0,
        earlyStartSeconds: 0,
        lateStartSeconds: 0,
        earlyLeaveSeconds: 0,
        lateLeaveSeconds: 0,
      };
  const actions = getAvailableActions(status);

  return {
    ok: true,
    idempotent: input.idempotent,
    status,
    actions,
    settings: {
      timezone: input.settings.timezone,
      hourBankEnabled: input.settings.hourBankEnabled,
      rankingPublic: input.settings.rankingPublic,
    },
    session: input.session
      ? {
          id: input.session.id,
          workday: input.session.workday,
          status: input.session.status,
          approvalStatus: input.session.approval_status,
          startedAt: input.session.started_at,
          endedAt: input.session.ended_at,
          totalWorkedSeconds: metrics.workedSeconds,
          totalPausedSeconds: metrics.pausedSeconds,
          expectedWorkSeconds: metrics.expectedSeconds,
          balanceSeconds: metrics.balanceSeconds,
          overtimeSeconds: metrics.overtimeSeconds,
          missingSeconds: metrics.missingSeconds,
          earlyStartSeconds: metrics.earlyStartSeconds,
          lateStartSeconds: metrics.lateStartSeconds,
          earlyLeaveSeconds: metrics.earlyLeaveSeconds,
          lateLeaveSeconds: metrics.lateLeaveSeconds,
          intervals: intervals.map((interval) => ({
            id: interval.id,
            type: interval.interval_type,
            startedAt: interval.started_at,
            endedAt: interval.ended_at,
            durationSeconds: interval.duration_seconds,
          })),
        }
      : null,
    labels: {
      worked: formatDuration(metrics.workedSeconds),
      paused: formatDuration(metrics.pausedSeconds),
      bank: metrics.balanceSeconds >= 0
        ? `+${formatDuration(metrics.balanceSeconds)}`
        : `-${formatDuration(Math.abs(metrics.balanceSeconds))}`,
    },
  };
}

function getRangePreset(value: string | null) {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (value === "today") return { from: today, to: today };
  const days = value === "7d" ? 7 : value === "month" ? 31 : 30;
  const from = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  return { from, to: today };
}

type DashboardQueryResult<TData = unknown> = {
  data: TData | null;
  error: unknown;
  count?: number | null;
};

const TIMECLOCK_DASHBOARD_QUERY_TIMEOUT_MS = 4500;

async function runDashboardQuery<TData>(
  label: string,
  query: PromiseLike<DashboardQueryResult<TData>>,
): Promise<DashboardQueryResult<TData>> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutResult = new Promise<DashboardQueryResult<TData>>((resolve) => {
    timeoutId = setTimeout(() => {
      resolve({
        data: null,
        error: new Error(`Consulta ${label} excedeu o tempo limite.`),
        count: 0,
      });
    }, TIMECLOCK_DASHBOARD_QUERY_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(query), timeoutResult]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function getDashboardQueryErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  const record = error as { message?: unknown } | null;
  return typeof record?.message === "string" && record.message.trim()
    ? record.message.trim()
    : "consulta indisponivel";
}

function markDashboardQueryFailure(
  input: {
    guildId: string;
    label: string;
    result: DashboardQueryResult;
    warnings: string[];
  },
) {
  if (!input.result.error) return false;
  if (isMissingTimeclockSchema(input.result.error)) {
    throwSchemaMissing(input.result.error);
  }

  console.warn("[timeclock-dashboard] bloco indisponivel:", {
    guildId: input.guildId,
    block: input.label,
    message: getDashboardQueryErrorMessage(input.result.error),
  });
  input.warnings.push(`Dados de ${input.label} indisponiveis temporariamente.`);
  return true;
}

export async function getTimeclockDashboard(input: {
  guildId: string;
  range?: string | null;
  userId?: string | null;
  page?: number;
  pageSize?: number;
}) {
  const settings = await getTimeclockSettings(input.guildId);
  const now = new Date();
  const workday = resolveWorkday({
    at: now,
    timezone: settings.timezone,
    scheduleDays: settings.scheduleDays,
  }).workday;
  const range = getRangePreset(input.range || "30d");
  const page = Math.max(1, Math.trunc(input.page || 1));
  const pageSize = Math.max(10, Math.min(100, Math.trunc(input.pageSize || 25)));
  const supabase = getSupabaseAdminClientOrThrow();

  let historyQuery = supabase
    .from(SESSIONS_TABLE)
    .select("*", { count: "exact" })
    .eq("guild_id", input.guildId)
    .gte("workday", range.from)
    .lte("workday", range.to);

  if (input.userId && /^\d{10,25}$/.test(input.userId)) {
    historyQuery = historyQuery.eq("user_id", input.userId);
  }

  const [totalsResult, activeResult, historyResult, eventsResult, rankingResult] =
    await Promise.all([
      runDashboardQuery(
        "totais",
        supabase.rpc("get_timeclock_dashboard_totals", {
          p_guild_id: input.guildId,
          p_workday: workday,
        }),
      ),
      runDashboardQuery(
        "acompanhamento",
        supabase
          .from(SESSIONS_TABLE)
          .select("*")
          .eq("guild_id", input.guildId)
          .eq("workday", workday)
          .in("status", ["WORKING", "PAUSED", "FINISHED"])
          .order("started_at", { ascending: true })
          .limit(80),
      ),
      runDashboardQuery(
        "historico",
        historyQuery
          .order("workday", { ascending: false })
          .range((page - 1) * pageSize, page * pageSize - 1),
      ),
      runDashboardQuery(
        "auditoria",
        supabase
          .from(EVENTS_TABLE)
          .select("*")
          .eq("guild_id", input.guildId)
          .order("timestamp", { ascending: false })
          .limit(80),
      ),
      runDashboardQuery(
        "ranking",
        supabase.rpc("get_timeclock_ranking", {
          p_guild_id: input.guildId,
          p_from: range.from,
          p_to: range.to,
          p_limit: 25,
          p_offset: 0,
        }),
      ),
    ]);

  const warnings: string[] = [];
  const totalsFailed = markDashboardQueryFailure({
    guildId: input.guildId,
    label: "totais",
    result: totalsResult,
    warnings,
  });
  const activeFailed = markDashboardQueryFailure({
    guildId: input.guildId,
    label: "acompanhamento",
    result: activeResult,
    warnings,
  });
  const historyFailed = markDashboardQueryFailure({
    guildId: input.guildId,
    label: "historico",
    result: historyResult,
    warnings,
  });
  const eventsFailed = markDashboardQueryFailure({
    guildId: input.guildId,
    label: "auditoria",
    result: eventsResult,
    warnings,
  });
  const rankingFailed = markDashboardQueryFailure({
    guildId: input.guildId,
    label: "ranking",
    result: rankingResult,
    warnings,
  });

  const totals = !totalsFailed && Array.isArray(totalsResult.data)
    ? totalsResult.data[0] || {}
    : !totalsFailed
      ? totalsResult.data || {}
      : {};
  const sessions = (!activeFailed && activeResult.data || []) as SessionRecord[];
  const history = (!historyFailed && historyResult.data || []) as SessionRecord[];
  const rankingRows = (!rankingFailed && rankingResult.data || []) as Array<Record<string, unknown>>;
  const events = (!eventsFailed && eventsResult.data || []) as Array<Record<string, unknown>>;
  const userIds = [
    ...new Set([
      ...sessions.map((session) => session.user_id),
      ...history.map((session) => session.user_id),
      ...rankingRows.map((row) => String(row.user_id || "")),
      ...events.map((row) => String(row.user_id || "")),
    ].filter(Boolean)),
  ];
  const users = await loadDiscordUserProfiles(userIds);

  return {
    ok: true,
    degraded: warnings.length > 0,
    warnings,
    settings,
    workday,
    range,
    totals: {
      workingCount: Number(totals.working_count || 0),
      pausedCount: Number(totals.paused_count || 0),
      finishedCount: Number(totals.finished_count || 0),
      workedSeconds: Number(totals.worked_seconds || 0),
      pausedSeconds: Number(totals.paused_seconds || 0),
      overtimeSeconds: Number(totals.overtime_seconds || 0),
      bankSeconds: Number(totals.bank_seconds || 0),
    },
    active: sessions.map((session) => mapSessionForApi(session, users)),
    history: {
      page,
      pageSize,
      total: historyFailed ? 0 : historyResult.count || 0,
      items: history.map((session) => mapSessionForApi(session, users)),
    },
    ranking: rankingRows.map((row, index) => ({
      position: index + 1,
      userId: String(row.user_id || ""),
      user: users.get(String(row.user_id || "")) || buildFallbackUser(String(row.user_id || "")),
      totalWorkedSeconds: Number(row.total_worked_seconds || 0),
      totalPausedSeconds: Number(row.total_paused_seconds || 0),
      sessionCount: Number(row.session_count || 0),
      averageDailySeconds: Number(row.average_daily_seconds || 0),
      bankSeconds: Number(row.bank_seconds || 0),
    })),
    audit: events.map((event) => ({
      id: event.id,
      userId: event.user_id,
      user: users.get(String(event.user_id || "")) || buildFallbackUser(String(event.user_id || "")),
      sessionId: event.session_id,
      eventType: event.event_type,
      timestamp: event.timestamp,
      source: event.source,
      actorId: event.actor_id,
      previousState: event.previous_state,
      newState: event.new_state,
      metadata: event.metadata || {},
    })),
  };
}

function buildFallbackUser(userId: string) {
  return {
    userId,
    displayName: userId ? `Discord ${userId}` : "Usuario",
    avatarUrl: null as string | null,
  };
}

async function loadDiscordUserProfiles(userIds: string[]) {
  const profiles = new Map<string, ReturnType<typeof buildFallbackUser>>();
  userIds.forEach((userId) => profiles.set(userId, buildFallbackUser(userId)));
  if (!userIds.length) return profiles;

  const result = await getSupabaseAdminClientOrThrow()
    .from("auth_users")
    .select("discord_user_id, display_name, username, avatar_url, discord_avatar_url")
    .in("discord_user_id", userIds);
  if (result.error) return profiles;

  for (const row of result.data || []) {
    const userId = typeof row.discord_user_id === "string" ? row.discord_user_id : "";
    if (!userId) continue;
    profiles.set(userId, {
      userId,
      displayName:
        (typeof row.display_name === "string" && row.display_name.trim()) ||
        (typeof row.username === "string" && row.username.trim()) ||
        `Discord ${userId}`,
      avatarUrl:
        (typeof row.avatar_url === "string" && row.avatar_url.trim()) ||
        (typeof row.discord_avatar_url === "string" && row.discord_avatar_url.trim()) ||
        null,
    });
  }

  return profiles;
}

function mapSessionForApi(
  session: SessionRecord,
  users: Map<string, ReturnType<typeof buildFallbackUser>>,
) {
  return {
    id: session.id,
    userId: session.user_id,
    user: users.get(session.user_id) || buildFallbackUser(session.user_id),
    workday: session.workday,
    status: session.status,
    approvalStatus: session.approval_status,
    startedAt: session.started_at,
    endedAt: session.ended_at,
    totalWorkedSeconds: Number(session.total_worked_seconds || 0),
    totalPausedSeconds: Number(session.total_paused_seconds || 0),
    expectedWorkSeconds: Number(session.expected_work_seconds || 0),
    balanceSeconds: Number(session.balance_seconds || 0),
    overtimeSeconds: Number(session.overtime_seconds || 0),
    missingSeconds: Number(session.missing_seconds || 0),
    earlyStartSeconds: Number(session.early_start_seconds || 0),
    lateStartSeconds: Number(session.late_start_seconds || 0),
    earlyLeaveSeconds: Number(session.early_leave_seconds || 0),
    lateLeaveSeconds: Number(session.late_leave_seconds || 0),
  };
}
