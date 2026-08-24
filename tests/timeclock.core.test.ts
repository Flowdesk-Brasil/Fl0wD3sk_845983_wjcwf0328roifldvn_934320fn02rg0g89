import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateTimeclockMetrics,
  createDefaultScheduleDays,
  normalizeScheduleDay,
  resolveTransition,
  resolveWorkday,
} from "@/lib/timeclock/core";

test("timeclock state machine rejects invalid transitions", () => {
  assert.throws(() => resolveTransition("NOT_STARTED", "PAUSE"), /Transicao invalida/);
  assert.throws(() => resolveTransition("PAUSED", "FINISH"), /Transicao invalida/);
  assert.equal(resolveTransition("NOT_STARTED", "START").to, "WORKING");
  assert.equal(resolveTransition("WORKING", "PAUSE").to, "PAUSED");
  assert.equal(resolveTransition("PAUSED", "RESUME").to, "WORKING");
  assert.equal(resolveTransition("WORKING", "FINISH").to, "FINISHED");
});

test("timeclock metrics sum working intervals without counting pauses", () => {
  const scheduleDay = normalizeScheduleDay({
    weekday: 2,
    enabled: true,
    startTime: "09:00",
    endTime: "21:00",
    expectedWorkSeconds: 11 * 3600,
    expectedBreakSeconds: 3600,
  });

  const metrics = calculateTimeclockMetrics({
    session: {
      status: "FINISHED",
      startedAt: "2026-08-25T11:45:00.000Z",
      endedAt: "2026-08-26T00:20:00.000Z",
      timezone: "America/Sao_Paulo",
      workday: "2026-08-25",
    },
    scheduleDay,
    intervals: [
      {
        type: "WORK",
        startedAt: "2026-08-25T11:45:00.000Z",
        endedAt: "2026-08-25T16:00:00.000Z",
      },
      {
        type: "BREAK",
        startedAt: "2026-08-25T16:00:00.000Z",
        endedAt: "2026-08-25T17:00:00.000Z",
      },
      {
        type: "WORK",
        startedAt: "2026-08-25T17:00:00.000Z",
        endedAt: "2026-08-26T00:20:00.000Z",
      },
    ],
  });

  assert.equal(metrics.workedSeconds, 11 * 3600 + 35 * 60);
  assert.equal(metrics.pausedSeconds, 3600);
  assert.equal(metrics.balanceSeconds, 35 * 60);
  assert.equal(metrics.overtimeSeconds, 35 * 60);
});

test("timeclock workday resolves previous day for overnight shifts", () => {
  const scheduleDays = createDefaultScheduleDays().map((day) =>
    day.weekday === 1
      ? normalizeScheduleDay({
          ...day,
          enabled: true,
          startTime: "22:00",
          endTime: "06:00",
          expectedWorkSeconds: 8 * 3600,
          expectedBreakSeconds: 0,
        })
      : day,
  );

  const resolved = resolveWorkday({
    at: "2026-08-25T08:30:00.000Z",
    timezone: "America/Sao_Paulo",
    scheduleDays,
  });

  assert.equal(resolved.workday, "2026-08-24");
  assert.equal(resolved.isPreviousOvernightShift, true);
});

test("timeclock tolerances only count delay after configured grace", () => {
  const scheduleDay = normalizeScheduleDay({
    weekday: 2,
    enabled: true,
    startTime: "09:00",
    endTime: "18:00",
    expectedWorkSeconds: 8 * 3600,
    expectedBreakSeconds: 3600,
    entryToleranceSeconds: 5 * 60,
    exitToleranceSeconds: 5 * 60,
  });

  const metrics = calculateTimeclockMetrics({
    session: {
      status: "FINISHED",
      startedAt: "2026-08-25T12:08:00.000Z",
      endedAt: "2026-08-25T20:34:00.000Z",
      timezone: "America/Sao_Paulo",
      workday: "2026-08-25",
    },
    scheduleDay,
    intervals: [
      {
        type: "WORK",
        startedAt: "2026-08-25T12:08:00.000Z",
        endedAt: "2026-08-25T20:34:00.000Z",
      },
    ],
  });

  assert.equal(metrics.lateStartSeconds, 3 * 60);
  assert.equal(metrics.earlyLeaveSeconds, 21 * 60);
});
