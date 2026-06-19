import { NextResponse } from "next/server";
import webpush from "web-push";
import { getAdminClient } from "@/lib/server/supabase-admin";

webpush.setVapidDetails(
  "mailto:contato@studio.com.br",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY",
  process.env.VAPID_PRIVATE_KEY || "3dO0XqBl8t69E1VevHLFlubTtixtEJeexYoXu4-7MLQ",
);

export async function POST(req: Request) {
  try {
    const { student_ids, title, body, url } = await req.json();
    const studentIds = Array.isArray(student_ids) ? student_ids.filter(Boolean) : [];

    if (!studentIds.length) {
      return NextResponse.json({ error: "Nenhum aluno especificado" }, { status: 400 });
    }

    const admin = getAdminClient();
    const { data: students } = await admin
      .from("students")
      .select("id, profile_id")
      .in("id", studentIds);

    const profileIds = (students ?? []).map((student: any) => student.profile_id).filter(Boolean);
    const subscriptionUserIds = [...new Set([...studentIds, ...profileIds])];

    const { error: notificationError } = await admin.from("notifications").insert(studentIds.map((studentId: string) => ({
      target_type: "student",
      target_id: studentId,
      title: title || "Corpo & Evolucao",
      message: body || "Voce tem um novo aviso no app.",
      read: false,
    })));

    if (notificationError) console.error("In-app notification error:", notificationError.message);

    const { data: subs, error } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .in("user_id", subscriptionUserIds);

    if (error) {
      return NextResponse.json({ error: `Erro ao buscar inscricoes: ${error.message}` }, { status: 500 });
    }

    if (!subs?.length) {
      return NextResponse.json({
        success: true,
        sent: 0,
        inAppNotifications: notificationError ? 0 : studentIds.length,
        message: "Nenhum dispositivo push encontrado. O aviso foi criado dentro do app do aluno.",
      });
    }

    const payload = JSON.stringify({
      title: title || "Corpo & Evolucao",
      body: body || "Nova mensagem",
      url: url || "/portal?tab=notifications",
      icon: "/icon-192x192.png",
      badge: "/icon-192x192.png",
      requireInteraction: true,
    });

    let sent = 0;
    let failed = 0;
    const deleteIds: string[] = [];

    await Promise.all(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (err: any) {
        failed++;
        if (err.statusCode === 404 || err.statusCode === 410) deleteIds.push(sub.id);
        else console.error("Subscription error:", err?.message || err);
      }
    }));

    if (deleteIds.length) await admin.from("push_subscriptions").delete().in("id", deleteIds);

    return NextResponse.json({
      success: true,
      sent,
      failed,
      expired: deleteIds.length,
      inAppNotifications: notificationError ? 0 : studentIds.length,
    });
  } catch (error: any) {
    console.error("Error sending push:", error);
    return NextResponse.json({ error: `Internal Server Error: ${error?.message || error}` }, { status: 500 });
  }
}
