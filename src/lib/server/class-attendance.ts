import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClassAttendance } from "@/lib/types";

type AttendanceStatus = ClassAttendance["status"];

const STATUS_WEIGHT: Record<AttendanceStatus, number> = {
  attended: 5,
  confirmed: 4,
  pending: 3,
  cancelled: 2,
  missed: 1,
};

function dayOfWeekFromDate(date: string) {
  return new Date(`${date}T12:00:00-03:00`).getDay();
}

function attendanceKey(row: Pick<ClassAttendance, "class_schedule_id" | "student_id" | "date">) {
  return `${row.class_schedule_id}:${row.student_id}:${row.date}`;
}

function pickBestAttendance(rows: ClassAttendance[]) {
  return [...rows].sort((a, b) => {
    const byStatus = STATUS_WEIGHT[b.status] - STATUS_WEIGHT[a.status];
    if (byStatus !== 0) return byStatus;
    return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
  })[0];
}

async function cleanupDuplicateAttendances(admin: SupabaseClient, rows: ClassAttendance[]) {
  const grouped = new Map<string, ClassAttendance[]>();
  for (const row of rows) {
    const key = attendanceKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  const deleteIds: string[] = [];
  for (const group of grouped.values()) {
    if (group.length <= 1) continue;
    const chosen = pickBestAttendance(group);
    deleteIds.push(...group.filter((row) => row.id !== chosen.id).map((row) => row.id));
  }

  if (deleteIds.length) {
    await admin.from("class_attendances").delete().in("id", deleteIds);
  }
}

export async function ensureAttendancesForDate(admin: SupabaseClient, date: string) {
  const dayOfWeek = dayOfWeekFromDate(date);
  const { data: schedules, error: scheduleError } = await admin
    .from("class_schedules")
    .select("id")
    .eq("day_of_week", dayOfWeek)
    .eq("active", true);
  if (scheduleError) throw new Error(scheduleError.message);

  const scheduleIds = (schedules ?? []).map((schedule: any) => schedule.id);
  if (!scheduleIds.length) return [] as ClassAttendance[];

  const { data: studentClasses, error: linkError } = await admin
    .from("student_classes")
    .select("student_id, class_schedule_id")
    .in("class_schedule_id", scheduleIds);
  if (linkError) throw new Error(linkError.message);

  const uniqueLinks = new Map<string, { student_id: string; class_schedule_id: string }>();
  for (const link of studentClasses ?? []) {
    uniqueLinks.set(`${link.student_id}:${link.class_schedule_id}`, link);
  }

  const links = [...uniqueLinks.values()];
  if (!links.length) return [] as ClassAttendance[];

  const { data: existing } = await admin
    .from("class_attendances")
    .select("id, class_schedule_id, student_id, date, status, created_at")
    .eq("date", date)
    .in("class_schedule_id", scheduleIds);

  const existingKeys = new Set((existing ?? []).map((row: any) => attendanceKey(row)));
  const missing = links
    .filter((link) => !existingKeys.has(`${link.class_schedule_id}:${link.student_id}:${date}`))
    .map((link) => ({
      class_schedule_id: link.class_schedule_id,
      student_id: link.student_id,
      date,
      status: "pending" as AttendanceStatus,
    }));

  if (missing.length) {
    await admin.from("class_attendances").upsert(missing, {
      onConflict: "class_schedule_id,student_id,date",
      ignoreDuplicates: true,
    });
  }

  const { data: rows, error } = await admin
    .from("class_attendances")
    .select("*, student:students(id, full_name, photo_url), class_schedule:class_schedules(*, class_type:class_types(*), instructor:profiles(id, full_name))")
    .eq("date", date)
    .in("class_schedule_id", scheduleIds);
  if (error) throw new Error(error.message);

  await cleanupDuplicateAttendances(admin, (rows ?? []) as ClassAttendance[]);
  return dedupeAttendances((rows ?? []) as ClassAttendance[]);
}

export async function ensureStudentAttendancesForDate(admin: SupabaseClient, studentId: string, date: string) {
  const dayOfWeek = dayOfWeekFromDate(date);
  const { data: links, error: linkError } = await admin
    .from("student_classes")
    .select("student_id, class_schedule_id, class_schedule:class_schedules(id, time, day_of_week, capacity, active, class_type:class_types(id, name, color, duration_minutes), instructor:profiles(id, full_name))")
    .eq("student_id", studentId);
  if (linkError) throw new Error(linkError.message);

  const todaysLinks = (links ?? []).filter((link: any) =>
    link.class_schedule?.day_of_week === dayOfWeek && link.class_schedule?.active !== false
  );
  if (!todaysLinks.length) return [] as ClassAttendance[];

  const scheduleIds = [...new Set(todaysLinks.map((link: any) => link.class_schedule_id))];
  const { data: existing } = await admin
    .from("class_attendances")
    .select("id, class_schedule_id, student_id, date, status, created_at")
    .eq("student_id", studentId)
    .eq("date", date)
    .in("class_schedule_id", scheduleIds);

  const existingKeys = new Set((existing ?? []).map((row: any) => attendanceKey(row)));
  const missing = todaysLinks
    .filter((link: any) => !existingKeys.has(`${link.class_schedule_id}:${studentId}:${date}`))
    .map((link: any) => ({
      class_schedule_id: link.class_schedule_id,
      student_id: studentId,
      date,
      status: "pending" as AttendanceStatus,
    }));

  if (missing.length) {
    await admin.from("class_attendances").upsert(missing, {
      onConflict: "class_schedule_id,student_id,date",
      ignoreDuplicates: true,
    });
  }

  const { data: rows, error } = await admin
    .from("class_attendances")
    .select("*, class_schedule:class_schedules(id, time, day_of_week, capacity, active, class_type:class_types(id, name, color, duration_minutes), instructor:profiles(id, full_name))")
    .eq("student_id", studentId)
    .eq("date", date)
    .in("class_schedule_id", scheduleIds);
  if (error) throw new Error(error.message);

  await cleanupDuplicateAttendances(admin, (rows ?? []) as ClassAttendance[]);
  return dedupeAttendances((rows ?? []) as ClassAttendance[]);
}

export function dedupeAttendances(rows: ClassAttendance[]) {
  const grouped = new Map<string, ClassAttendance[]>();
  for (const row of rows) {
    const key = attendanceKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }

  return [...grouped.values()]
    .map(pickBestAttendance)
    .sort((a, b) => {
      const timeA = a.class_schedule?.time ?? "00:00";
      const timeB = b.class_schedule?.time ?? "00:00";
      return timeA.localeCompare(timeB);
    });
}

export async function updateStudentAttendanceStatus(
  admin: SupabaseClient,
  studentId: string,
  payload: {
    attendanceId?: string | null;
    classScheduleId?: string | null;
    date?: string | null;
    status: AttendanceStatus;
  },
) {
  const status = payload.status;
  if (!["confirmed", "cancelled", "attended", "missed", "pending"].includes(status)) {
    throw new Error("Status de presenca invalido.");
  }

  let attendance: ClassAttendance | null = null;
  const attendanceId = payload.attendanceId && !payload.attendanceId.startsWith("virtual-")
    ? payload.attendanceId
    : null;

  if (attendanceId) {
    const { data, error } = await admin
      .from("class_attendances")
      .select("*")
      .eq("id", attendanceId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    attendance = data as ClassAttendance | null;
  }

  const classScheduleId = payload.classScheduleId ?? attendance?.class_schedule_id;
  const date = payload.date ?? attendance?.date;
  if (!classScheduleId || !date) throw new Error("Aula nao encontrada para confirmar presenca.");

  const { data: link } = await admin
    .from("student_classes")
    .select("id")
    .eq("student_id", studentId)
    .eq("class_schedule_id", classScheduleId)
    .maybeSingle();
  if (!link) throw new Error("Esta aula nao esta vinculada a sua matricula atual.");

  const { data: naturalRows } = await admin
    .from("class_attendances")
    .select("*")
    .eq("student_id", studentId)
    .eq("class_schedule_id", classScheduleId)
    .eq("date", date);

  const rows = (naturalRows ?? []) as ClassAttendance[];
  attendance = rows.find((row) => row.id === attendanceId) ?? (rows.length ? pickBestAttendance(rows) : null);

  if (status === "confirmed") {
    const { count, error } = await admin
      .from("class_attendances")
      .select("*", { count: "exact", head: true })
      .eq("student_id", studentId)
      .eq("date", date)
      .in("status", ["confirmed", "attended"])
      .neq("class_schedule_id", classScheduleId);
    if (error) throw new Error(error.message);
    if ((count ?? 0) >= 2) throw new Error("Voce atingiu o limite de 2 aulas confirmadas por dia.");
  }

  if (!attendance) {
    const { data, error } = await admin
      .from("class_attendances")
      .insert({ student_id: studentId, class_schedule_id: classScheduleId, date, status })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    attendance = data as ClassAttendance;
  } else {
    const { data, error } = await admin
      .from("class_attendances")
      .update({ status })
      .eq("id", attendance.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    attendance = data as ClassAttendance;
  }

  await cleanupDuplicateAttendances(admin, rows);

  const { data: full, error: fullError } = await admin
    .from("class_attendances")
    .select("*, student:students(id, full_name, photo_url), class_schedule:class_schedules(*, class_type:class_types(*), instructor:profiles(id, full_name))")
    .eq("id", attendance.id)
    .single();
  if (fullError) throw new Error(fullError.message);
  return full as ClassAttendance;
}
