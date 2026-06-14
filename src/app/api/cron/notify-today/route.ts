import { NextResponse } from "next/server";
import webpush from "web-push";
import { getAdminClient } from "@/lib/server/supabase-admin";
import { dayOfWeekInBrasilia, todayInBrasilia } from "@/lib/brazil-date";
import { ensureAttendancesForDate } from "@/lib/server/class-attendance";
import type { ClassAttendance } from "@/lib/types";

webpush.setVapidDetails(
  "mailto:contato@studio.com.br",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY",
  process.env.VAPID_PRIVATE_KEY || "3dO0XqBl8t69E1VevHLFlubTtixtEJeexYoXu4-7MLQ",
);

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

type PushTarget = {
  attendance: ClassAttendance;
  profileId?: string | null;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

function classLabel(attendance: ClassAttendance) {
  return attendance.class_schedule?.class_type?.name || "aula";
}

function timeLabel(attendance: ClassAttendance) {
  return attendance.class_schedule?.time || "hoje";
}

async function createInAppAlerts(targets: PushTarget[]) {
  if (!targets.length) return 0;
  const admin = getAdminClient();
  const rows = targets.map((target) => ({
    target_type: "student",
    target_id: target.attendance.student_id,
    title: "Voce tem aula hoje",
    message: `Verificamos que voce tem ${classLabel(target.attendance)} as ${timeLabel(target.attendance)}. Abra o app e confirme sua presenca.`,
    read: false,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) {
    console.error("In-app notification error:", error.message);
    return 0;
  }
  return rows.length;
}

async function loadSubscriptions(targets: PushTarget[]) {
  const userIds = [
    ...new Set(
      targets
        .flatMap((target) => [target.profileId, target.attendance.student_id])
        .filter(Boolean) as string[],
    ),
  ];
  if (!userIds.length) return { byUserId: new Map<string, SubscriptionRow[]>(), total: 0 };

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth")
    .in("user_id", userIds);

  if (error) throw new Error(`Erro ao buscar dispositivos push: ${error.message}`);

  const byUserId = new Map<string, SubscriptionRow[]>();
  for (const subscription of data ?? []) {
    const current = byUserId.get(subscription.user_id) ?? [];
    current.push(subscription as SubscriptionRow);
    byUserId.set(subscription.user_id, current);
  }
  return { byUserId, total: data?.length ?? 0 };
}

function subscriptionsForTarget(target: PushTarget, byUserId: Map<string, SubscriptionRow[]>) {
  const ids = [target.profileId, target.attendance.student_id].filter(Boolean) as string[];
  const unique = new Map<string, SubscriptionRow>();
  for (const id of ids) {
    for (const subscription of byUserId.get(id) ?? []) unique.set(subscription.id, subscription);
  }
  return [...unique.values()];
}

async function sendPushToSubscriptions(
  subscriptions: SubscriptionRow[],
  title: string,
  body: string,
  deleteIds: Set<string>,
  url = "/portal?tab=classes",
) {
  if (!subscriptions.length) return { sent: 0, attempted: 0, failed: 0 };

  const payload = JSON.stringify({
    title,
    body,
    url,
    icon: "/icon-192x192.png",
    badge: "/icon-192x192.png",
    tag: "class-attendance-today",
    requireInteraction: true,
    actions: [{ action: "open", title: "Confirmar aula" }],
  });

  let sent = 0;
  let failed = 0;

  await Promise.all(subscriptions.map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
      );
      sent++;
    } catch (err: any) {
      failed++;
      if (err.statusCode === 404 || err.statusCode === 410) deleteIds.add(subscription.id);
      else console.error("Push send error:", err?.message || err);
    }
  }));

  return { sent, attempted: subscriptions.length, failed };
}

export async function GET() {
  try {
    const admin = getAdminClient();
    const dateStr = todayInBrasilia();
    const dayOfWeek = dayOfWeekInBrasilia();
    const attendances = await ensureAttendancesForDate(admin, dateStr);
    const pending = attendances.filter((attendance) => attendance.status === "pending");

    if (!attendances.length) {
      return NextResponse.json({
        success: true,
        date: dateStr,
        dayOfWeek,
        pushSent: 0,
        pendingStudents: 0,
        message: `Nenhum aluno vinculado as turmas de hoje (${DIAS[dayOfWeek]}).`,
      });
    }

    if (!pending.length) {
      return NextResponse.json({
        success: true,
        date: dateStr,
        dayOfWeek,
        pushSent: 0,
        pendingStudents: 0,
        totalAttendances: attendances.length,
        message: "Todas as presencas de hoje ja foram respondidas. Nenhum aluno pendente para notificar.",
      });
    }

    const studentIds = [...new Set(pending.map((attendance) => attendance.student_id))];
    const { data: students } = await admin
      .from("students")
      .select("id, profile_id")
      .in("id", studentIds);

    const profileByStudent = new Map((students ?? []).map((student: any) => [student.id, student.profile_id]));
    const targets: PushTarget[] = pending.map((attendance) => ({
      attendance,
      profileId: profileByStudent.get(attendance.student_id),
    }));

    const inAppCreated = await createInAppAlerts(targets);
    const { byUserId, total: registeredDevices } = await loadSubscriptions(targets);
    const expiredIds = new Set<string>();

    let pushSent = 0;
    let pushAttempted = 0;
    let pushFailed = 0;
    let targetsWithoutDevice = 0;

    for (const target of targets) {
      const subscriptions = subscriptionsForTarget(target, byUserId);
      if (!subscriptions.length) targetsWithoutDevice++;

      const result = await sendPushToSubscriptions(
        subscriptions,
        "Voce tem aula hoje",
        `Verificamos que voce tem ${classLabel(target.attendance)} as ${timeLabel(target.attendance)}. Clique aqui para confirmar.`,
        expiredIds,
      );

      pushSent += result.sent;
      pushAttempted += result.attempted;
      pushFailed += result.failed;
    }

    if (expiredIds.size) {
      await admin.from("push_subscriptions").delete().in("id", [...expiredIds]);
    }

    const message = pushSent > 0
      ? `${pending.length} aluno(s) pendente(s), ${pushSent} push enviado(s) e ${inAppCreated} aviso(s) no app.`
      : registeredDevices === 0
        ? `${pending.length} aluno(s) pendente(s), nenhum dispositivo push registrado. ${inAppCreated} aviso(s) foram criados dentro do app do aluno.`
        : `${pending.length} aluno(s) pendente(s), 0 push enviado por falha dos provedores. ${inAppCreated} aviso(s) ficaram disponiveis dentro do app.`;

    return NextResponse.json({
      success: true,
      date: dateStr,
      dayLabel: DIAS[dayOfWeek],
      totalAttendances: attendances.length,
      pendingStudents: pending.length,
      inAppNotifications: inAppCreated,
      registeredDevices,
      targetsWithoutDevice,
      pushAttempted,
      pushSent,
      pushFailed,
      expiredSubscriptions: expiredIds.size,
      message,
    });
  } catch (error: any) {
    console.error("Notify today error:", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
