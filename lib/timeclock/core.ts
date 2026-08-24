export type TimeclockSessionStatus =
  | "NOT_STARTED"
  | "WORKING"
  | "PAUSED"
  | "FINISHED"
  | "INCOMPLETE"
  | "ADJUSTED";

export type TimeclockApprovalStatus =
  | "NONE"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "REJECTED";

export type TimeclockAction = "START" | "PAUSE" | "RESUME" | "FINISH";

export type TimeclockEventType =
  | "CLOCK_STARTED"
  | "BREAK_STARTED"
  | "BREAK_ENDED"
  | "CLOCK_FINISHED"
  | "CLOCK_ADJUSTED"
  | "CLOCK_APPROVED"
  | "CLOCK_REJECTED"
  | "SCHEDULE_CHANGED"
  | "TIMECLOCK_CONFIG_UPDATED"
  | "TIMECLOCK_SCHEDULE_UPDATED";

export type TimeclockSource = "discord_button" | "discord_command" | "web" | "system";

export type TimeclockScheduleDay = {
  weekday: number;
  enabled: boolean;
  startTime: string;
  endTime: string;
  expectedWorkSeconds: number;
  expectedBreakSeconds: number;
  minBreakSeconds: number;
  maxBreakSeconds: number;
  entryToleranceSeconds: number;
  exitToleranceSeconds: number;
};

export type TimeclockInterval = {
  type: "WORK" | "BREAK";
  startedAt: string;
  endedAt: string | null;
  durationSeconds?: number | null;
};

export type TimeclockSessionLike = {
  status: TimeclockSessionStatus;
  startedAt: string | null;
  endedAt: string | null;
  timezone: string;
  workday: string;
};

export type TimeclockMetrics = {
  workedSeconds: number;
  pausedSeconds: number;
  expectedSeconds: number;
  balanceSeconds: number;
  overtimeSeconds: number;
  missingSeconds: number;
  earlyStartSeconds: number;
  lateStartSeconds: number;
  earlyLeaveSeconds: number;
  lateLeaveSeconds: number;
};

const DEFAULT_TIMEZONE = "America/Sao_Paulo";
const SECONDS_PER_DAY = 24 * 60 * 60;

export const TIMEclockWeekdays = [
  { weekday: 1, label: "Segunda-feira" },
  { weekday: 2, label: "Terca-feira" },
  { weekday: 3, label: "Quarta-feira" },
  { weekday: 4, label: "Quinta-feira" },
  { weekday: 5, label: "Sexta-feira" },
  { weekday: 6, label: "Sabado" },
  { weekday: 0, label: "Domingo" },
] as const;

export const VALID_TIMECLOCK_TRANSITIONS: Record<
  TimeclockAction,
  { from: TimeclockSessionStatus[]; to: TimeclockSessionStatus; event: TimeclockEventType }
> = {
  START: {
    from: ["NOT_STARTED"],
    to: "WORKING",
    event: "CLOCK_STARTED",
  },
  PAUSE: {
    from: ["WORKING"],
    to: "PAUSED",
    event: "BREAK_STARTED",
  },
  RESUME: {
    from: ["PAUSED"],
    to: "WORKING",
    event: "BREAK_ENDED",
  },
  FINISH: {
    from: ["WORKING"],
    to: "FINISHED",
    event: "CLOCK_FINISHED",
  },
};

export function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(numeric)));
}

export function parseClockTimeToSeconds(value: unknown, fallback = "09:00") {
  const raw = typeof value === "string" ? value.trim() : fallback;
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return parseClockTimeToSeconds(fallback, "09:00");

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return parseClockTimeToSeconds(fallback, "09:00");
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return parseClockTimeToSeconds(fallback, "09:00");
  }
  return hours * 3600 + minutes * 60;
}

export function secondsToClockTime(seconds: number) {
  const normalized = ((Math.trunc(seconds) % SECONDS_PER_DAY) + SECONDS_PER_DAY) % SECONDS_PER_DAY;
  const hours = Math.floor(normalized / 3600);
  const minutes = Math.floor((normalized % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseDurationToSeconds(value: unknown, fallbackSeconds = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value !== "string") return fallbackSeconds;
  const raw = value.trim();
  const match = raw.match(/^(-)?(?:(\d{1,4}):)?(\d{1,2}):(\d{2})$/);
  if (!match) {
    const clockMatch = raw.match(/^(\d{1,4}):(\d{2})$/);
    if (!clockMatch) return fallbackSeconds;
    return Math.max(0, Number(clockMatch[1]) * 3600 + Number(clockMatch[2]) * 60);
  }
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  return Math.max(0, hours * 3600 + minutes * 60 + seconds);
}

export function formatDuration(seconds: number, compact = false) {
  const safeSeconds = Math.max(0, Math.trunc(Math.abs(seconds)));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (compact) {
    if (hours <= 0) return `${minutes}m`;
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
}

export function formatSignedDuration(seconds: number) {
  const sign = seconds > 0 ? "+" : seconds < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(seconds))}`;
}

export function normalizeTimezone(value: unknown) {
  const timezone = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function getZonedDateParts(dateInput: Date | string, timezoneInput: unknown) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  const timezone = normalizeTimezone(timezoneInput);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const year = Number(parts.get("year"));
  const month = Number(parts.get("month"));
  const day = Number(parts.get("day"));
  const hour = Number(parts.get("hour"));
  const minute = Number(parts.get("minute"));
  const second = Number(parts.get("second"));
  const dateString = [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateString,
    secondsOfDay: hour * 3600 + minute * 60 + second,
    weekday: getWeekdayFromDateString(dateString),
  };
}

export function getWeekdayFromDateString(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCDay();
}

export function addDaysToDateString(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function isOvernightSchedule(day: Pick<TimeclockScheduleDay, "startTime" | "endTime">) {
  return parseClockTimeToSeconds(day.endTime, "18:00") <= parseClockTimeToSeconds(day.startTime, "09:00");
}

export function normalizeScheduleDay(input: Partial<TimeclockScheduleDay> & { weekday: number }): TimeclockScheduleDay {
  const startTime = secondsToClockTime(parseClockTimeToSeconds(input.startTime || "09:00", "09:00"));
  const endTime = secondsToClockTime(parseClockTimeToSeconds(input.endTime || "18:00", "18:00"));
  const startSeconds = parseClockTimeToSeconds(startTime);
  const endSeconds = parseClockTimeToSeconds(endTime);
  const crossesMidnight = endSeconds <= startSeconds;
  const spanSeconds = crossesMidnight
    ? SECONDS_PER_DAY - startSeconds + endSeconds
    : Math.max(0, endSeconds - startSeconds);
  const expectedBreakSeconds = clampInteger(input.expectedBreakSeconds, 0, 8 * 3600, 3600);
  const fallbackExpectedWork = Math.max(0, spanSeconds - expectedBreakSeconds);

  return {
    weekday: clampInteger(input.weekday, 0, 6, 1),
    enabled: input.enabled !== false,
    startTime,
    endTime,
    expectedWorkSeconds: clampInteger(input.expectedWorkSeconds, 0, 24 * 3600, fallbackExpectedWork),
    expectedBreakSeconds,
    minBreakSeconds: clampInteger(input.minBreakSeconds, 0, 8 * 3600, 0),
    maxBreakSeconds: clampInteger(input.maxBreakSeconds, 0, 12 * 3600, 2 * 3600),
    entryToleranceSeconds: clampInteger(input.entryToleranceSeconds, 0, 3 * 3600, 5 * 60),
    exitToleranceSeconds: clampInteger(input.exitToleranceSeconds, 0, 3 * 3600, 5 * 60),
  };
}

export function createDefaultScheduleDays(): TimeclockScheduleDay[] {
  return TIMEclockWeekdays.map(({ weekday }) =>
    normalizeScheduleDay({
      weekday,
      enabled: weekday >= 1 && weekday <= 5,
      startTime: "09:00",
      endTime: "18:00",
      expectedWorkSeconds: 8 * 3600,
      expectedBreakSeconds: 3600,
      minBreakSeconds: 30 * 60,
      maxBreakSeconds: 2 * 3600,
      entryToleranceSeconds: 5 * 60,
      exitToleranceSeconds: 5 * 60,
    }),
  );
}

export function resolveWorkday(input: {
  at: Date | string;
  timezone: string;
  scheduleDays: TimeclockScheduleDay[];
}) {
  const parts = getZonedDateParts(input.at, input.timezone);
  const today = parts.dateString;
  const previousDay = addDaysToDateString(today, -1);
  const scheduleByWeekday = new Map(input.scheduleDays.map((day) => [day.weekday, normalizeScheduleDay(day)]));
  const previousSchedule = scheduleByWeekday.get(getWeekdayFromDateString(previousDay));

  if (
    previousSchedule?.enabled &&
    isOvernightSchedule(previousSchedule) &&
    parts.secondsOfDay <= parseClockTimeToSeconds(previousSchedule.endTime, "06:00")
  ) {
    return {
      workday: previousDay,
      scheduleDay: previousSchedule,
      localDate: today,
      isPreviousOvernightShift: true,
    };
  }

  const todaySchedule =
    scheduleByWeekday.get(parts.weekday) ||
    normalizeScheduleDay({ weekday: parts.weekday, enabled: false });

  return {
    workday: today,
    scheduleDay: todaySchedule,
    localDate: today,
    isPreviousOvernightShift: false,
  };
}

export function resolveTransition(currentStatus: TimeclockSessionStatus, action: TimeclockAction) {
  const transition = VALID_TIMECLOCK_TRANSITIONS[action];
  if (!transition.from.includes(currentStatus)) {
    throw new Error(
      `Transicao invalida: ${currentStatus} nao permite ${action}.`,
    );
  }
  return transition;
}

export function getAvailableActions(status: TimeclockSessionStatus) {
  return {
    canStart: status === "NOT_STARTED" || status === "PAUSED",
    canPause: status === "WORKING",
    canFinish: status === "WORKING",
  };
}

function intervalDurationSeconds(interval: TimeclockInterval, now: Date) {
  const startedAtMs = Date.parse(interval.startedAt);
  const endedAtMs = interval.endedAt ? Date.parse(interval.endedAt) : now.getTime();
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(endedAtMs)) return 0;
  return Math.max(0, Math.trunc((endedAtMs - startedAtMs) / 1000));
}

function localSecondsSinceWorkdayStart(input: {
  timestamp: string | null;
  timezone: string;
  workday: string;
  scheduleDay: TimeclockScheduleDay;
}) {
  if (!input.timestamp) return null;
  const parts = getZonedDateParts(input.timestamp, input.timezone);
  const dayOffset =
    parts.dateString === input.workday
      ? 0
      : parts.dateString === addDaysToDateString(input.workday, 1)
        ? 1
        : parts.dateString === addDaysToDateString(input.workday, -1)
          ? -1
          : 0;
  return dayOffset * SECONDS_PER_DAY + parts.secondsOfDay;
}

export function calculateTimeclockMetrics(input: {
  session: TimeclockSessionLike;
  intervals: TimeclockInterval[];
  scheduleDay: TimeclockScheduleDay;
  now?: Date;
}) {
  const now = input.now || new Date();
  const workedSeconds = input.intervals
    .filter((interval) => interval.type === "WORK")
    .reduce((sum, interval) => sum + intervalDurationSeconds(interval, now), 0);
  const pausedSeconds = input.intervals
    .filter((interval) => interval.type === "BREAK")
    .reduce((sum, interval) => sum + intervalDurationSeconds(interval, now), 0);
  const expectedSeconds = input.scheduleDay.enabled
    ? input.scheduleDay.expectedWorkSeconds
    : 0;
  const balanceSeconds = workedSeconds - expectedSeconds;
  const plannedStart = parseClockTimeToSeconds(input.scheduleDay.startTime);
  const plannedEndBase = parseClockTimeToSeconds(input.scheduleDay.endTime);
  const plannedEnd = plannedEndBase <= plannedStart
    ? plannedEndBase + SECONDS_PER_DAY
    : plannedEndBase;
  const actualStart = localSecondsSinceWorkdayStart({
    timestamp: input.session.startedAt,
    timezone: input.session.timezone,
    workday: input.session.workday,
    scheduleDay: input.scheduleDay,
  });
  const actualEnd = localSecondsSinceWorkdayStart({
    timestamp: input.session.endedAt,
    timezone: input.session.timezone,
    workday: input.session.workday,
    scheduleDay: input.scheduleDay,
  });
  const rawStartDiff = actualStart === null ? 0 : actualStart - plannedStart;
  const rawEndDiff = actualEnd === null ? 0 : actualEnd - plannedEnd;
  const earlyStartSeconds = Math.max(0, -rawStartDiff);
  const lateStartSeconds = Math.max(0, rawStartDiff - input.scheduleDay.entryToleranceSeconds);
  const earlyLeaveSeconds = Math.max(0, -rawEndDiff - input.scheduleDay.exitToleranceSeconds);
  const lateLeaveSeconds = Math.max(0, rawEndDiff);

  return {
    workedSeconds,
    pausedSeconds,
    expectedSeconds,
    balanceSeconds,
    overtimeSeconds: Math.max(0, balanceSeconds),
    missingSeconds: Math.max(0, -balanceSeconds),
    earlyStartSeconds,
    lateStartSeconds,
    earlyLeaveSeconds,
    lateLeaveSeconds,
  } satisfies TimeclockMetrics;
}
