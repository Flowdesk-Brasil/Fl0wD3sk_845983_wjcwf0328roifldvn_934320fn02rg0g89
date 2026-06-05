"use client";

import { localDB } from "@/lib/localDB";
import { shouldUseLocalData, supabase } from "@/lib/supabase";
import type {
  AuditLog, Checkin, ClassBooking, ClassSession, ClassType, Contract, DashboardStats, Enrollment, LocalTables, NewRow,
  Notification, Payment, Plan, Profile, RevenuePoint, Student, StudioSettings, TableName, Product, Supplier,
  Receiving, ReceivingItem, Sale, SaleItem, InventoryTransaction
} from "@/lib/types";
import { generateMatriculaNumber } from "@/lib/utils";

const sortDesc = <T extends { created_at: string }>(rows: T[]) =>
  [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
const relation = <T extends { id: string }>(rows: T[], id?: string | null) =>
  rows.find((row) => row.id === id) ?? null;

let syncChannel: any = null;
const notifyDbChange = () => {
  if (typeof window === "undefined") return;
  if (shouldUseLocalData()) return;
  if (!syncChannel) {
    syncChannel = supabase.channel("db-sync");
    syncChannel.subscribe((status: string) => {
      if (status === "SUBSCRIBED") {
        syncChannel.send({ type: "broadcast", event: "DB_CHANGED" });
      }
    });
  } else if (syncChannel.state === "joined") {
    syncChannel.send({ type: "broadcast", event: "DB_CHANGED" });
  }
};

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
  if (shouldUseLocalData()) {
    const row = localDB.insert(table, values);
    notifyDbChange();
    return row;
  }
  const { data, error } = await supabase.from(table).insert(values).select("*").single();
  if (error) throw new Error(error.message);
  notifyDbChange();
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
    notifyDbChange();
    return row;
  }
  const { data, error } = await supabase.from(table).update(values as never).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  notifyDbChange();
  return data as LocalTables[T];
}

async function remove<T extends TableName>(table: T, id: string) {
  if (shouldUseLocalData()) {
    localDB.delete(table, id);
    notifyDbChange();
    return true;
  }
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  notifyDbChange();
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
  plan_id: string | string[];
  start_date: string;
}): Promise<Enrollment> {
  let finalPlanId = typeof values.plan_id === "string" ? values.plan_id : values.plan_id[0];
  let plan = (await getPlans()).find((item) => item.id === finalPlanId);
  
  if (Array.isArray(values.plan_id) && values.plan_id.length > 1) {
    const selectedPlans = (await getPlans()).filter(p => values.plan_id.includes(p.id));
    if (selectedPlans.length > 0) {
      const combinedName = selectedPlans.map(p => p.name).join(" + ");
      const combinedPrice = selectedPlans.reduce((sum, p) => sum + Number(p.price), 0);
      const maxDuration = Math.max(...selectedPlans.map(p => p.duration_days));
      const maxLimit = Math.max(...selectedPlans.map(p => p.weekly_limit));
      plan = await insert("plans", {
        name: combinedName,
        description: "Plano combinado",
        price: combinedPrice,
        duration_days: maxDuration,
        weekly_limit: maxLimit,
        color: selectedPlans[0].color,
        active: false,
      });
      finalPlanId = plan.id;
    }
  }

  if (!plan) throw new Error("Plano não encontrado.");
  const end = new Date(`${values.start_date}T12:00:00`);
  end.setDate(end.getDate() + plan.duration_days);
  const plain = await insert("enrollments", {
    student_id: values.student_id,
    plan_id: finalPlanId,
    start_date: values.start_date,
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
    plan_id: finalPlanId,
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

export async function editEnrollment(id: string, values: {
  plan_id: string | string[];
  start_date: string;
}): Promise<Enrollment> {
  let finalPlanId = typeof values.plan_id === "string" ? values.plan_id : values.plan_id[0];
  let plan = (await getPlans()).find((item) => item.id === finalPlanId);
  
  if (Array.isArray(values.plan_id) && values.plan_id.length > 1) {
    const selectedPlans = (await getPlans()).filter(p => values.plan_id.includes(p.id));
    if (selectedPlans.length > 0) {
      const combinedName = selectedPlans.map(p => p.name).join(" + ");
      const combinedPrice = selectedPlans.reduce((sum, p) => sum + Number(p.price), 0);
      const maxDuration = Math.max(...selectedPlans.map(p => p.duration_days));
      const maxLimit = Math.max(...selectedPlans.map(p => p.weekly_limit));
      plan = await insert("plans", {
        name: combinedName,
        description: "Plano combinado",
        price: combinedPrice,
        duration_days: maxDuration,
        weekly_limit: maxLimit,
        color: selectedPlans[0].color,
        active: false,
      });
      finalPlanId = plan.id;
    }
  }

  if (!plan) throw new Error("Plano não encontrado.");
  const end = new Date(`${values.start_date}T12:00:00`);
  end.setDate(end.getDate() + plan.duration_days);

  const plain = await update("enrollments", id, {
    plan_id: finalPlanId,
    start_date: values.start_date,
    end_date: end.toISOString().slice(0, 10),
  });

  // Atualizar pagamentos pendentes com o novo valor do plano e data
  if (!shouldUseLocalData()) {
    const { data: payments } = await supabase.from("payments").select("*").eq("enrollment_id", id).eq("status", "pending");
    if (payments) {
      for (const pay of payments) {
        await update("payments", pay.id, {
          amount: Number(plan.price),
          total_amount: Number(plan.price),
          due_date: values.start_date
        });
      }
    }
  } else {
    const payments = localDB.get("payments").filter((p) => p.enrollment_id === id && p.status === "pending");
    for (const pay of payments) {
      await update("payments", pay.id, {
        amount: Number(plan.price),
        total_amount: Number(plan.price),
        due_date: values.start_date
      });
    }
  }
  
  const student = (await getStudents()).find((item) => item.id === plain.student_id) ?? null;
  return { ...plain, student, plan };
}

export async function deleteEnrollment(id: string) {
  if (!shouldUseLocalData()) {
    const { data: paidPayments } = await supabase.from("payments").select("id").eq("enrollment_id", id).eq("status", "paid").limit(1);
    const hasPaid = paidPayments && paidPayments.length > 0;

    if (hasPaid) {
      const { data: payments } = await supabase.from("payments").select("*").eq("enrollment_id", id).eq("status", "pending");
      if (payments) {
        for (const pay of payments) {
          await update("payments", pay.id, { status: "cancelled" });
        }
      }
      return update("enrollments", id, { status: "cancelled" });
    } else {
      await supabase.from("payments").delete().eq("enrollment_id", id);
      return remove("enrollments", id);
    }
  } else {
    const payments = localDB.get("payments").filter(p => p.enrollment_id === id);
    const hasPaid = payments.some(p => p.status === "paid");
    if (hasPaid) {
      for (const pay of payments.filter(p => p.status === "pending")) {
        await update("payments", pay.id, { status: "cancelled" });
      }
      return update("enrollments", id, { status: "cancelled" });
    } else {
      for (const pay of payments) {
        await remove("payments", pay.id);
      }
      return remove("enrollments", id);
    }
  }
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

export async function processCheckin(code: string): Promise<Checkin & { student?: Student | null; duplicate?: boolean; enrollment?: Enrollment | null; payment?: Payment | null }> {
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
    if (response.ok) {
      const checkin = await response.json() as Checkin & { student?: Student | null; duplicate?: boolean; enrollment?: Enrollment | null; payment?: Payment | null };
      notifyCheckinCreated(checkin);
      return checkin;
    }
  }
  const students = await getStudents();
  const student = students.find((item) => item.qr_code === code.trim() || item.id === code.trim());
  const enrollment = student
    ? (await getEnrollments()).find((item) => item.student_id === student.id && item.status === "active")
    : null;
  const payments = student && enrollment ? await getPayments() : [];
  const payment = enrollment
    ? payments
      .filter((item) => item.enrollment_id === enrollment.id)
      .sort((a, b) => b.due_date.localeCompare(a.due_date))[0] ?? null
    : null;
  const today = new Date().toISOString().slice(0, 10);
  const enrollmentExpired = Boolean(enrollment?.end_date && enrollment.end_date < today);
  const effectivePayment = payment && payment.status === "pending" && payment.due_date < today
    ? { ...payment, status: "expired" as const }
    : payment;
  const allowed = Boolean(
    student &&
    student.status === "active" &&
    enrollment &&
    !enrollmentExpired &&
    effectivePayment &&
    effectivePayment.status === "paid"
  );
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
        enrollment,
        payment: effectivePayment,
        duplicate: true,
        reason: "Check-in já confirmado nos últimos 5 minutos. Nenhum novo registro foi criado.",
      };
    }
  }
  let reason = !student
    ? "Código não encontrado."
    : student.status !== "active"
      ? "Aluno inativo ou bloqueado."
      : !enrollment
        ? "Aluno sem matrícula ativa."
        : null;
  if (student?.status === "active" && enrollment) {
    reason = enrollmentExpired
      ? "Matricula expirada. Renove o plano antes de liberar a catraca."
      : !effectivePayment
        ? "Nenhum pagamento encontrado para esta matricula. Regularize na recepcao."
        : effectivePayment.status === "expired"
          ? "Pagamento expirado ou vencido. Acesso bloqueado ate regularizacao."
          : effectivePayment.status === "pending"
            ? "Pagamento pendente. Receba o pagamento na recepcao antes de liberar a catraca."
            : effectivePayment.status !== "paid"
              ? "Pagamento nao confirmado. Acesso bloqueado."
              : null;
  }

  const row = await insert("checkins", {
    student_id: student?.id ?? null,
    enrollment_id: enrollment?.id ?? null,
    status: allowed ? "allowed" : "denied",
    reason,
    unit: "Matriz",
    checked_at: new Date().toISOString(),
  });
  const checkin = { ...row, student, enrollment, payment: effectivePayment };
  notifyCheckinCreated(checkin);
  return checkin;
}

function notifyCheckinCreated(checkin: Checkin & { student?: Student | null; duplicate?: boolean; enrollment?: Enrollment | null; payment?: Payment | null }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("checkin:created", { detail: checkin }));
  
  // REALTIME: Notifica outros dispositivos para abrir o modal
  supabase.channel("checkins-sync", { config: { broadcast: { self: false } } }).send({
    type: "broadcast",
    event: "CHECKIN_CREATED",
    payload: checkin
  });
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
export async function getClassSchedules(): Promise<ClassSchedule[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("class_schedules")
      .select("*, plan:plans(*), instructor:profiles(id, full_name), student_classes(id, student_id, student:students(id, full_name))")
      .order("day_of_week", { ascending: true })
      .order("time", { ascending: true });
    if (error) return [];
    return (data ?? []) as ClassSchedule[];
  }
  const plans = localDB.get("plans");
  const profiles = localDB.get("profiles");
  const students = localDB.get("students");
  const studentClasses = localDB.get("student_classes");
  return localDB.get("class_schedules")
    .sort((a, b) => a.day_of_week === b.day_of_week ? a.time.localeCompare(b.time) : a.day_of_week - b.day_of_week)
    .map((schedule) => ({
      ...schedule,
      plan: relation(plans, schedule.plan_id),
      instructor: relation(profiles, schedule.instructor_id),
      student_classes: studentClasses.filter((sc) => sc.class_schedule_id === schedule.id).map((sc) => ({
        ...sc,
        student: relation(students, sc.student_id),
      })),
    }));
}

export async function createClassSchedule(values: {
  plan_id: string;
  instructor_id?: string | null;
  day_of_week: number;
  time: string;
  capacity: number;
}) {
  return insert("class_schedules", {
    ...values,
    instructor_id: values.instructor_id || null,
    active: true,
  });
}

export async function deleteClassSchedule(id: string) {
  return remove("class_schedules", id);
}

export async function getStudentClasses(studentId: string): Promise<StudentClass[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("student_classes")
      .select("*, class_schedule:class_schedules(*, plan:plans(*))")
      .eq("student_id", studentId);
    if (error) return [];
    return (data ?? []) as StudentClass[];
  }
  const schedules = await getClassSchedules();
  return localDB.get("student_classes")
    .filter((sc) => sc.student_id === studentId)
    .map((sc) => ({
      ...sc,
      class_schedule: relation(schedules, sc.class_schedule_id),
    }));
}

export async function linkStudentToClasses(studentId: string, classScheduleIds: string[]) {
  if (!shouldUseLocalData()) {
    // Delete existing
    await supabase.from("student_classes").delete().eq("student_id", studentId);
    // Insert new
    if (classScheduleIds.length > 0) {
      await supabase.from("student_classes").insert(
        classScheduleIds.map(id => ({ student_id: studentId, class_schedule_id: id }))
      );
    }
    return;
  }
  
  // Local logic
  const existing = localDB.get("student_classes").filter(sc => sc.student_id === studentId);
  for (const sc of existing) {
    localDB.delete("student_classes", sc.id);
  }
  for (const id of classScheduleIds) {
    localDB.insert("student_classes", { student_id: studentId, class_schedule_id: id });
  }
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

// ==========================================
// MÓDULO ERP (ESTOQUE E PDV)
// ==========================================

export async function getSuppliers() {
  return sortDesc(await list("suppliers"));
}

export async function getProducts(): Promise<Product[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("products")
      .select("*, supplier:suppliers(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Product[];
  }
  const products = localDB.get("products");
  const suppliers = localDB.get("suppliers");
  return sortDesc(products).map(p => ({
    ...p,
    supplier: relation(suppliers, p.supplier_id)
  }));
}

export async function getProductById(id: string): Promise<Product | null> {
  if (shouldUseLocalData()) return localDB.find("products", id);
  const { data, error } = await supabase.from("products").select("*, supplier:suppliers(*)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Product | null;
}

export async function createProduct(values: Omit<NewRow<"products">, "updated_at">): Promise<Product> {
  return insert("products", {
    ...values,
    updated_at: new Date().toISOString(),
  });
}

export async function updateProduct(id: string, values: Partial<Product>) {
  return update("products", id, { ...values, updated_at: new Date().toISOString() });
}

export async function deleteProduct(id: string) {
  if (shouldUseLocalData()) {
    const rItems = localDB.get("receiving_items").filter(i => i.product_id === id);
    for (const item of rItems) localDB.delete("receiving_items", item.id);
    const sItems = localDB.get("sale_items").filter(i => i.product_id === id);
    for (const item of sItems) localDB.delete("sale_items", item.id);
    const trans = localDB.get("inventory_transactions").filter(i => i.product_id === id);
    for (const t of trans) localDB.delete("inventory_transactions", t.id);
    return remove("products", id);
  }
  await supabase.from("receiving_items").delete().eq("product_id", id);
  await supabase.from("sale_items").delete().eq("product_id", id);
  await supabase.from("inventory_transactions").delete().eq("product_id", id);
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
export async function getReceivings(): Promise<Receiving[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("receivings")
      .select("*, supplier:suppliers(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as Receiving[];
  }
  const receivings = localDB.get("receivings");
  const suppliers = localDB.get("suppliers");
  return sortDesc(receivings).map(r => ({
    ...r,
    supplier: relation(suppliers, r.supplier_id)
  }));
}

export async function getReceivingById(id: string): Promise<Receiving | null> {
  if (shouldUseLocalData()) return localDB.find("receivings", id);
  const { data, error } = await supabase.from("receivings").select("*, supplier:suppliers(*)").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Receiving | null;
}

export async function createReceiving(values: Omit<NewRow<"receivings">, "updated_at">): Promise<Receiving> {
  return insert("receivings", {
    ...values,
    updated_at: new Date().toISOString(),
  });
}

export async function updateReceiving(id: string, values: Partial<Receiving>) {
  return update("receivings", id, { ...values, updated_at: new Date().toISOString() });
}

export async function deleteReceiving(id: string) {
  if (shouldUseLocalData()) {
    const items = localDB.get("receiving_items").filter(i => i.receiving_id === id);
    for (const item of items) localDB.delete("receiving_items", item.id);
    const trans = localDB.get("inventory_transactions").filter(i => i.reference_id === id);
    for (const t of trans) localDB.delete("inventory_transactions", t.id);
    return remove("receivings", id);
  }
  await supabase.from("inventory_transactions").delete().eq("reference_id", id);
  await supabase.from("receiving_items").delete().eq("receiving_id", id);
  const { error } = await supabase.from("receivings").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}

export async function getReceivingItems(receiving_id: string): Promise<ReceivingItem[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("receiving_items")
      .select("*, product:products(*)")
      .eq("receiving_id", receiving_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as ReceivingItem[];
  }
  const items = localDB.get("receiving_items").filter(i => i.receiving_id === receiving_id);
  const products = localDB.get("products");
  return items.map(i => ({
    ...i,
    product: relation(products, i.product_id)
  }));
}

export async function getInventoryTransactions(): Promise<any[]> {
  if (!shouldUseLocalData()) {
    const { data, error } = await supabase
      .from("inventory_transactions")
      .select("*, product:products(*)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  }
  const transactions = localDB.get("inventory_transactions");
  const products = localDB.get("products");
  return sortDesc(transactions).map(t => ({
    ...t,
    product: relation(products, t.product_id)
  })).slice(0, 100);
}

export async function createReceivingItem(values: NewRow<"receiving_items">): Promise<ReceivingItem> {
  if (shouldUseLocalData()) return localDB.insert("receiving_items", values);
  const { data, error } = await supabase.from("receiving_items").insert(values).select("*").single();
  if (error) throw new Error(error.message);
  return data as ReceivingItem;
}

export async function deleteReceivingItem(id: string) {
  if (shouldUseLocalData()) return localDB.delete("receiving_items", id);
  const { error } = await supabase.from("receiving_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateReceivingItem(id: string, values: Partial<NewRow<"receiving_items">>) {
  if (shouldUseLocalData()) return localDB.update("receiving_items", id, values);
  const { data, error } = await supabase.from("receiving_items").update(values).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createInventoryTransaction(values: any) {
  return insert("inventory_transactions", values);
}

export async function createSale(values: NewRow<"sales">) {
  return insert("sales", values);
}

export async function createPixSale(id: string): Promise<Sale> {
  const { data } = await supabase.auth.getSession();
  const response = await fetch(`/api/sales/${id}/pix`, {
    method: "POST",
    headers: { Authorization: `Bearer ${data.session?.access_token ?? ""}` },
  });
  const payload = await response.json() as { sale?: Sale; error?: string };
  if (!response.ok || !payload.sale) throw new Error(payload.error ?? "Não foi possível gerar o PIX da venda.");
  return payload.sale;
}

export async function createSaleItem(values: NewRow<"sale_items">) {
  return insert("sale_items", values);
}

export async function createSupplier(values: any): Promise<any> {
  return insert("suppliers", values);
}

export async function updatePlan(id: string, values: Partial<Plan>) {
  return update("plans", id, values);
}

export async function deletePlan(id: string) {
  return remove("plans", id);
}

export async function updateSupplier(id: string, values: any) {
  return update("suppliers", id, values);
}

export async function deleteSupplier(id: string) {
  if (shouldUseLocalData()) {
    const products = localDB.get("products").filter(p => p.supplier_id === id);
    for (const p of products) await deleteProduct(p.id);
    const receivings = localDB.get("receivings").filter(r => r.supplier_id === id);
    for (const r of receivings) await deleteReceiving(r.id);
    return remove("suppliers", id);
  }
  
  const { data: prods } = await supabase.from("products").select("id").eq("supplier_id", id);
  if (prods) {
    for (const p of prods) await deleteProduct(p.id);
  }
  
  const { data: recs } = await supabase.from("receivings").select("id").eq("supplier_id", id);
  if (recs) {
    for (const r of recs) await deleteReceiving(r.id);
  }
  
  const { error } = await supabase.from("suppliers").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
