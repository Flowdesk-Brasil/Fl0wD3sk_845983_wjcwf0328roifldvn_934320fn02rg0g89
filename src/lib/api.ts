"use client";

import { localDB } from "@/lib/localDB";
import { shouldUseLocalData, supabase } from "@/lib/supabase";
import type {
  AuditLog, Checkin, ClassBooking, ClassSession, ClassType, Contract, DashboardStats, Enrollment, LocalTables, NewRow,
  Notification, Payment, Plan, Profile, RevenuePoint, Student, StudioSettings, TableName,
} from "@/lib/types";
import { generateMatriculaNumber } from "@/lib/utils";

const sortDesc = <T extends { created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
const relation = <T extends { id: string }>(rows: T[], id?: string | null) =>
  rows.find((row) => row.id === id) ?? null;

async function list<T extends TableName>(
  table: T,
  orderBy = "created_at",
): Promise<LocalTables[T][]> {
  if (shouldUseLocalData()) return localDB.get(table);
  const { data, error } = await supabase.from(table).select("*").order(orderBy, { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LocalTables[T][];
}

async function insert<T extends TableName>(table: T, values: NewRow<T>): Promise<LocalTables[T]> {
  if (shouldUseLocalData()) return localDB.insert(table, values);
  const { data, error } = await supabase.from(table).insert(values).select("*").single();
  if (error) throw new Error(error.message);
  return data as LocalTables[T];
}

async function update<T extends TableName>(
  table: T,
  id: string,
  values: Partial<LocalTables[T]>,
): Promise<LocalTables[T]> {
  if (shouldUseLocalData()) {
    const row = localDB.update(table, id, values);
    if (!row) throw new Error("Registro não encontrado.");
    return row;
  }
  const { data, error } = await supabase.from(table).update(values as never).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data as LocalTables[T];
}

async function remove<T extends TableName>(table: T, id: string) {
  if (shouldUseLocalData()) return localDB.delete(table, id);
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export async function getStudents(): Promise<Student[]> {
  return sortDesc(await list("students"));
}

export async function getStudentById(id: string): Promise<Student | null> {
  if (shouldUseLocalData()) return localDB.find("students", id);
  const { data, error } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Student | null;
}

export async function createStudent(
  values: Omit<NewRow<"students">, "qr_code" | "status" | "updated_at">,
): Promise<Student> {
  return insert("students", {
    ...values,
    status: "active",
    qr_code: `CE-${Date.now().toString(36).toUpperCase()}`,
    updated_at: new Date().toISOString(),
  });
}

export async function updateStudent(id: string, values: Partial<Student>) {
  return update("students", id, { ...values, updated_at: new Date().toISOString() });
}

export async function releaseStudentPortal(id: string) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/admin/students/${id}/portal`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const payload = await response.json() as { email?: string; profileId?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível liberar o portal.");
  return payload;
}

export async function resetStudentPassword(id: string) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/admin/students/${id}/reset-password`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const payload = await response.json() as { email?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível enviar o link de redefinição de senha.");
  return payload;
}

export async function getPlans(): Promise<Plan[]> {
  return (await list("plans")).sort((a, b) => Number(a.price) - Number(b.price));
}

export async function savePlan(values: Partial<Plan> & Pick<Plan, "name" | "price" | "duration_days">) {
  if (values.id) return update("plans", values.id, values);
  return insert("plans", {
    name: values.name,
    description: values.description ?? null,
    price: Number(values.price),
    duration_days: Number(values.duration_days),
    weekly_limit: Number(values.weekly_limit ?? 7),
    color: values.color ?? "#1a73e8",
    active: values.active ?? true,
  });
}

export async function getEnrollments(): Promise<Enrollment[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("enrollments")
      .select("*, student:students(id, full_name, status), plan:plans(id, name, color, price)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Enrollment[];
  }
  const students = localDB.get("students");
  const plans = localDB.get("plans");
  return sortDesc(localDB.get("enrollments")).map((row) => ({
    ...row,
    student: relation(students, row.student_id),
    plan: relation(plans, row.plan_id),
  }));
}

export async function createEnrollment(values: {
  student_id: string;
  plan_id: string;
  start_date: string;
}): Promise<Enrollment> {
  const plan = (await getPlans()).find((item) => item.id === values.plan_id);
  if (!plan) throw new Error("Plano não encontrado.");
  const end = new Date(`${values.start_date}T12:00:00`);
  end.setDate(end.getDate() + plan.duration_days);
  const plain = await insert("enrollments", {
    ...values,
    matricula_number: generateMatriculaNumber(),
    status: "active",
    end_date: end.toISOString().slice(0, 10),
  });
  await insert("payments", {
    reference: `MEN-${Date.now().toString().slice(-8)}`,
    student_id: values.student_id,
    enrollment_id: plain.id,
    amount: Number(plan.price),
    discount: 0,
    fine: 0,
    total_amount: Number(plan.price),
    status: "pending",
    method: null,
    due_date: values.start_date,
    paid_at: null,
  });
  await insert("contracts", {
    student_id: values.student_id,
    plan_id: values.plan_id,
    enrollment_id: plain.id,
    document_text: `Termo de adesão ao plano ${plan.name}.`,
    status: "pending",
    signed_at: null,
  });
  const student = (await getStudents()).find((item) => item.id === values.student_id) ?? null;
  return { ...plain, student, plan };
}

export async function updateEnrollmentStatus(id: string, status: LocalTables["enrollments"]["status"]) {
  return update("enrollments", id, { status });
}

export async function getPayments(): Promise<Payment[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("payments")
      .select("*, student:students(id, full_name)")
      .order("due_date", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Payment[];
  }
  const students = localDB.get("students");
  return sortDesc(localDB.get("payments")).map((row) => ({
    ...row,
    student: relation(students, row.student_id),
  }));
}

export async function markPaymentPaid(id: string, method: NonNullable<Payment["method"]>) {
  return update("payments", id, { status: "paid", method, paid_at: new Date().toISOString() });
}

export async function updatePaymentStatus(id: string, status: Payment["status"]) {
  return update("payments", id, {
    status,
    ...(status === "pending" ? { method: null, paid_at: null } : {}),
  });
}

export async function createPixPayment(id: string): Promise<Payment> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/payments/${id}/pix`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const payload = await response.json() as { payment?: Payment; error?: string };
  if (!response.ok || !payload.payment) throw new Error(payload.error ?? "Não foi possível gerar o PIX.");
  return payload.payment;
}

export async function getCheckins(): Promise<Checkin[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("checkins")
      .select("*, student:students(id, full_name)")
      .order("checked_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Checkin[];
  }
  const students = localDB.get("students");
  return [...localDB.get("checkins")]
    .sort((a, b) => b.checked_at.localeCompare(a.checked_at))
    .map((row) => ({ ...row, student: relation(students, row.student_id) }));
}

export async function processCheckin(code: string): Promise<Checkin & { student?: Student | null; duplicate?: boolean }> {
  if (!shouldUseLocalData()) {
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch("/api/checkins", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ code: code.trim(), unit: "Matriz" }),
    });
    if (response.ok) return await response.json() as Checkin & { student?: Student | null; duplicate?: boolean };
  }
  const students = await getStudents();
  const student = students.find((item) => item.qr_code === code.trim() || item.id === code.trim());
  const enrollment = student
    ? (await getEnrollments()).find((item) => item.student_id === student.id && item.status === "active")
    : null;
  const allowed = Boolean(student && student.status === "active" && enrollment);
  if (allowed && student) {
    const duplicateWindowStart = Date.now() - 5 * 60 * 1000;
    const recent = (await getCheckins()).find((item) =>
      item.student_id === student.id &&
      item.status === "allowed" &&
      new Date(item.checked_at).getTime() >= duplicateWindowStart
    );
    if (recent) {
      return {
        ...recent,
        student,
        duplicate: true,
        reason: "Check-in já confirmado nos últimos 5 minutos. Nenhum novo registro foi criado.",
      };
    }
  }
  const reason = !student
    ? "Código não encontrado."
    : student.status !== "active"
      ? "Aluno inativo ou bloqueado."
      : !enrollment
        ? "Aluno sem matrícula ativa."
        : null;
  const row = await insert("checkins", {
    student_id: student?.id ?? null,
    enrollment_id: enrollment?.id ?? null,
    status: allowed ? "allowed" : "denied",
    reason,
    unit: "Matriz",
    checked_at: new Date().toISOString(),
  });
  return { ...row, student };
}

export async function getContracts(): Promise<Contract[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("contracts")
      .select("*, student:students(id, full_name), plan:plans(id, name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Contract[];
  }
  const students = localDB.get("students");
  const plans = localDB.get("plans");
  return sortDesc(localDB.get("contracts")).map((row) => ({
    ...row,
    student: relation(students, row.student_id),
    plan: relation(plans, row.plan_id),
  }));
}

export async function signContract(id: string) {
  return update("contracts", id, { status: "signed", signed_at: new Date().toISOString() });
}

export async function updateContractStatus(id: string, status: Contract["status"]) {
  return update("contracts", id, {
    status,
    ...(status === "pending" ? { signed_at: null, ip_address: null } : {}),
  });
}

export async function sendContractForSignature(id: string) {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/contracts/${id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const payload = await response.json() as { sentTo?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível enviar o contrato.");
  return payload;
}

export async function getNotifications(): Promise<Notification[]> {
  return sortDesc(await list("notifications"));
}

export async function createNotification(values: Pick<Notification, "title" | "message" | "target_type">) {
  return insert("notifications", { ...values, target_id: null, read: false });
}

export async function deleteNotification(id: string) {
  return remove("notifications", id);
}

export async function getProfiles(): Promise<Profile[]> {
  return sortDesc(await list("profiles"));
}

export async function createProfile(values: Pick<Profile, "full_name" | "email" | "role"> & { password: string }) {
  if (shouldUseLocalData()) return insert("profiles", { ...values, active: true });

  const { data } = await supabase.auth.getSession();
  const response = await fetch("/api/admin/users", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session?.access_token ?? ""}`,
    },
    body: JSON.stringify(values),
  });
  const payload = (await response.json()) as { profile?: Profile; error?: string };
  if (!response.ok || !payload.profile) throw new Error(payload.error ?? "Não foi possível criar o usuário.");
  return payload.profile;
}

export async function deleteProfile(id: string) {
  if (shouldUseLocalData()) return remove("profiles", id);
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/admin/users/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível remover o usuário.");
  return true;
}

export async function getAuditLogs(): Promise<AuditLog[]> {
  if (shouldUseLocalData()) return sortDesc(localDB.get("audit_logs"));
  const { data, error } = await supabase
    .from("audit_logs")
    .select("*, profiles(full_name)")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AuditLog[];
}

export async function getSettings(): Promise<StudioSettings> {
  if (shouldUseLocalData()) return localDB.get("settings")[0];
  const { data, error } = await supabase.from("settings").select("*").eq("id", "studio").single();
  if (error) throw new Error(error.message);
  return data as StudioSettings;
}

export async function saveSettings(values: StudioSettings): Promise<StudioSettings> {
  if (shouldUseLocalData()) {
    return localDB.update("settings", values.id, {
      ...values,
      updated_at: new Date().toISOString(),
    }) as StudioSettings;
  }
  const { data, error } = await supabase.from("settings").upsert(values).select("*").single();
  if (error) throw new Error(error.message);
  return data as StudioSettings;
}

export async function uploadContractTemplate(file: File) {
  const { data } = await supabase.auth.getSession();
  const body = new FormData();
  body.append("file", file);
  const response = await fetch("/api/settings/contract-template", {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
    body,
  });
  const payload = await response.json() as { path?: string; name?: string; error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Não foi possível enviar o PDF.");
  return payload;
}

export async function getClassTypes(): Promise<ClassType[]> {
  try {
    return (await list("class_types")).sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export async function getClassSessions(): Promise<ClassSession[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("class_sessions")
      .select("*, class_type:class_types(*), instructor:profiles(id, full_name), bookings:class_bookings(id, session_id, student_id, status, created_at, student:students(id, full_name))")
      .order("start_at", { ascending: true });
    if (error) return [];
    return (data ?? []) as ClassSession[];
  }
  const types = localDB.get("class_types");
  const profiles = localDB.get("profiles");
  const students = localDB.get("students");
  const bookings = localDB.get("class_bookings");
  return localDB.get("class_sessions")
    .sort((a, b) => a.start_at.localeCompare(b.start_at))
    .map((session) => ({
      ...session,
      class_type: relation(types, session.class_type_id),
      instructor: relation(profiles, session.instructor_id),
      bookings: bookings.filter((booking) => booking.session_id === session.id).map((booking) => ({
        ...booking,
        student: relation(students, booking.student_id),
      })),
    }));
}

export async function createClassSession(values: {
  class_type_id: string;
  instructor_id?: string | null;
  start_at: string;
  capacity: number;
  notes?: string | null;
}) {
  const type = (await getClassTypes()).find((item) => item.id === values.class_type_id);
  if (!type) throw new Error("Tipo de aula não encontrado.");
  const start = new Date(values.start_at);
  const end = new Date(start.getTime() + type.duration_minutes * 60 * 1000);
  return insert("class_sessions", {
    ...values,
    instructor_id: values.instructor_id || null,
    end_at: end.toISOString(),
    status: "scheduled",
    notes: values.notes || null,
  });
}

export async function createClassBooking(sessionId: string, studentId: string): Promise<ClassBooking> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase.rpc("book_class_session", {
      p_session_id: sessionId,
      p_student_id: studentId,
    });
    if (!error && data) return data as ClassBooking;
    if (error && !error.message.toLowerCase().includes("function")) throw new Error(error.message);
  }
  const sessions = await getClassSessions();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("Horário não encontrado.");
  const occupied = (session.bookings || []).filter((item) => item.status === "confirmed" || item.status === "attended").length;
  if (occupied >= session.capacity) throw new Error(`A aula ${session.class_type?.name || ""} está lotada.`);
  return insert("class_bookings", {
    session_id: sessionId,
    student_id: studentId,
    status: "confirmed",
  });
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [students, enrollments, payments, checkins] = await Promise.all([
    getStudents(), getEnrollments(), getPayments(), getCheckins(),
  ]);
  const month = new Date().toISOString().slice(0, 7);
  const currentDate = new Date().toISOString().slice(0, 10);
  const activeEnrollments = enrollments.filter((item) => item.status === "active").length;
  return {
    totalStudents: students.length,
    activeStudents: students.filter((student) => student.status === "active").length,
    activeEnrollments,
    pendingPayments: payments.filter((payment) => payment.status === "pending").length,
    monthlyRevenue: payments
      .filter((payment) => payment.status === "paid" && (payment.paid_at ?? payment.created_at).startsWith(month))
      .reduce((total, payment) => total + Number(payment.total_amount), 0),
    todayCheckins: checkins.filter((checkin) => checkin.checked_at.startsWith(currentDate)).length,
    overduePayments: payments.filter((payment) => payment.status === "pending" && payment.due_date < currentDate).length,
    conversionRate: students.length ? Math.round((activeEnrollments / students.length) * 100) : 0,
  };
}

export async function getRevenueSeries(): Promise<RevenuePoint[]> {
  const payments = await getPayments();
  const formatter = new Intl.DateTimeFormat("pt-BR", { weekday: "short" });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    const key = date.toISOString().slice(0, 10);
    return {
      name: formatter.format(date).replace(".", ""),
      receita: payments
        .filter((payment) => payment.status === "paid" && (payment.paid_at ?? "").startsWith(key))
        .reduce((total, payment) => total + Number(payment.total_amount), 0),
    };
  });
}
