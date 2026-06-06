import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { getAdminClient } from '@/lib/server/supabase-admin';
import { todayInBrasilia, dayOfWeekInBrasilia } from '@/lib/brazil-date';

// Setup VAPID once
webpush.setVapidDetails(
  'mailto:contato@studio.com.br',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BE8FMu1NZtQh2QVULUShurqQlruZMOECnnw2HuHmx2X63Iv0jxuDLquhVva4lERZmuMsUE5OjzKRbWi1As0ZQlY',
  process.env.VAPID_PRIVATE_KEY || '3dO0XqBl8t69E1VevHLFlubTtixtEJeexYoXu4-7MLQ'
);

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Sends push notification directly via web-push (no internal HTTP fetch).
 * Returns number of successful sends.
 */
async function sendPushDirect(
  admin: ReturnType<typeof getAdminClient>,
  studentIds: string[],
  title: string,
  body: string,
  url: string = '/portal'
): Promise<number> {
  if (!studentIds.length) return 0;

  // Fetch push subscriptions from DB
  const { data: subs, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', studentIds);

  if (error || !subs || subs.length === 0) return 0;

  const payload = JSON.stringify({
    title,
    body,
    url,
    icon: '/icon-192x192.png',
  });

  let sent = 0;
  const deleteIds: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        );
        sent++;
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Expired subscription — mark for deletion
          deleteIds.push(sub.id);
        } else {
          console.error('Push send error:', err?.message || err);
        }
      }
    })
  );

  // Cleanup expired subscriptions
  if (deleteIds.length > 0) {
    await admin.from('push_subscriptions').delete().in('id', deleteIds);
  }

  return sent;
}

/**
 * GET /api/cron/notify-today
 * Called by: CRON scheduler every morning OR manually via "Alertar alunos" button.
 * 1. Finds all active class schedules for today (Brazil timezone).
 * 2. Finds all students enrolled in those schedules.
 * 3. Upserts "pending" attendance records for today (skips already confirmed/cancelled).
 * 4. Sends push notifications directly via web-push — no internal HTTP fetch.
 */
export async function GET() {
  try {
    const admin = getAdminClient();
    const dayOfWeek = dayOfWeekInBrasilia();
    const dateStr = todayInBrasilia();
    const diaLabel = DIAS[dayOfWeek];

    // 1. Get all active schedules for today's weekday
    const { data: schedules, error: scheduleError } = await admin
      .from('class_schedules')
      .select('id, time, class_type:class_types(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('active', true);

    if (scheduleError) {
      return NextResponse.json({ error: 'Erro ao buscar turmas: ' + scheduleError.message }, { status: 500 });
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({
        message: `Nenhuma turma programada para ${diaLabel} (dia ${dayOfWeek}).`,
        date: dateStr,
        dayOfWeek,
      });
    }

    const scheduleIds = schedules.map((s) => s.id);

    // 2. Get all students enrolled in these schedules
    const { data: studentClasses, error: scError } = await admin
      .from('student_classes')
      .select('student_id, class_schedule_id')
      .in('class_schedule_id', scheduleIds);

    if (scError) {
      return NextResponse.json({ error: 'Erro ao buscar alunos: ' + scError.message }, { status: 500 });
    }

    if (!studentClasses || studentClasses.length === 0) {
      return NextResponse.json({
        message: 'Nenhum aluno vinculado às turmas de hoje.',
        date: dateStr,
        dayOfWeek,
      });
    }

    // 3. Upsert "pending" attendance records — ignoreDuplicates preserves confirmed/cancelled
    const attendanceInserts = studentClasses.map((sc) => ({
      class_schedule_id: sc.class_schedule_id,
      student_id: sc.student_id,
      date: dateStr,
      status: 'pending' as const,
    }));

    const { error: upsertError } = await admin.from('class_attendances').upsert(attendanceInserts, {
      onConflict: 'class_schedule_id,student_id,date',
      ignoreDuplicates: true,
    });

    if (upsertError) {
      console.error('Attendance upsert error:', upsertError.message);
      // Don't abort — continue to push notifications
    }

    // 4. Send push notifications directly (no internal HTTP fetch)
    const allStudentIds = [...new Set(studentClasses.map((sc) => sc.student_id))];

    // Fetch profile IDs to match push_subscriptions (which are tied to profile_id)
    const { data: studentsInfo } = await admin
      .from('students')
      .select('id, profile_id')
      .in('id', allStudentIds);

    let totalPushSent = 0;

    for (const schedule of schedules) {
      const studentIdsForSchedule = studentClasses
        .filter((sc) => sc.class_schedule_id === schedule.id)
        .map((sc) => sc.student_id);

      if (studentIdsForSchedule.length === 0) continue;

      const profileIdsForSchedule = studentIdsForSchedule
        .map(id => studentsInfo?.find(s => s.id === id)?.profile_id)
        .filter(Boolean) as string[];

      if (profileIdsForSchedule.length === 0) continue;

      const classTypeObj = (schedule as any).class_type;
      const className = Array.isArray(classTypeObj)
        ? classTypeObj[0]?.name
        : classTypeObj?.name || 'Aula';

      const sent = await sendPushDirect(
        admin,
        profileIdsForSchedule, // Map to auth user IDs
        `Sua aula de ${className} é hoje! 💪`,
        `Horário: ${schedule.time}. Toque para confirmar sua presença!`,
        '/portal'
      );
      totalPushSent += sent;
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      dayLabel: diaLabel,
      schedulesFound: schedules.length,
      studentsWithClass: allStudentIds.length,
      pushSent: totalPushSent,
      message: `✅ ${diaLabel}: ${schedules.length} aula(s), ${allStudentIds.length} aluno(s) com presença registrada, ${totalPushSent} push(es) enviado(s).`,
    });
  } catch (error: any) {
    console.error('Cron Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
