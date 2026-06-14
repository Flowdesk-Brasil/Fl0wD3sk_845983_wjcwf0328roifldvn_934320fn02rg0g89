import { NextResponse } from "next/server";
import webpush from "web-push";
import { getAdminClient } from "@/lib/server/supabase-admin";
import { todayInBrasilia, dayOfWeekInBrasilia } from "@/lib/brazil-date";
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

async function sendPushDirect(targetIds: string[], title: string, body: string, url = "/portal?tab=classes") {
  const uniqueIds = [...new Set(targetIds.filter(Boolean))];
  if (!uniqueIds.length) return { sent: 0, subscriptions: 0, expired: 0 };

  const admin = getAdminClient();
  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .in("user_id", uniqueIds);

  if (error) throw new Error(`Erro ao buscar inscricoes push: ${error.message}`);
  if (!subs?.length) return { sent: 0, subscriptions: 0, expired: 0 };

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
  const deleteIds: string[] = [];

  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      );
      sent++;
    } catch (err: any) {
      if (err.statusCode === 404 || err.statusCode === 410) deleteIds.push(sub.id);
      else console.error("Push send error:", err?.message || err);
    }
  }));

  if (deleteIds.length) await admin.from("push_subscriptions").delete().in("id", deleteIds);
  return { sent, subscriptions: subs.length, expired: deleteIds.length };
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

    let sent = 0;
    let subscriptions = 0;
    let expired = 0;

    for (const target of targets) {
      const className = target.attendance.class_schedule?.class_type?.name || "aula";
      const time = target.attendance.class_schedule?.time || "hoje";
      const ids = [target.profileId, target.attendance.student_id].filter(Boolean) as string[];
      const result = await sendPushDirect(
        ids,
        "Voce tem aula hoje",
        `Verificamos que voce tem ${className} as ${time}. Clique aqui para confirmar.`,
      );
      sent += result.sent;
      subscriptions += result.subscriptions;
      expired += result.expired;
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      dayLabel: DIAS[dayOfWeek],
      totalAttendances: attendances.length,
      pendingStudents: pending.length,
      subscriptionsFound: subscriptions,
      pushSent: sent,
      expiredSubscriptions: expired,
      message: `${pending.length} aluno(s) pendente(s) verificados, ${sent} notificacao(oes) enviada(s).`,
    });
  } catch (error: any) {
    console.error("Notify today error:", error);
    return NextResponse.json({ error: error?.message || "Internal Server Error" }, { status: 500 });
  }
}
