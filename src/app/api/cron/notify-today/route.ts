import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { todayInBrasilia, dayOfWeekInBrasilia } from '@/lib/brazil-date';

// This endpoint should be called by a CRON job (e.g., every morning at 6am)
// OR manually via the "Alertar alunos" button in the Calendar page.
// It generates today's attendance records and sends push notifications.
export async function GET(req: Request) {
  try {
    const dayOfWeek = dayOfWeekInBrasilia();
    const dateStr = todayInBrasilia();

    // 1. Get all active schedules for today's weekday
    const { data: schedules, error: scheduleError } = await supabase
      .from('class_schedules')
      .select('id, time, class_type:class_types(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('active', true);

    if (scheduleError) {
      return NextResponse.json({ error: 'Erro ao buscar turmas: ' + scheduleError.message }, { status: 500 });
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ message: 'Nenhuma turma programada para hoje (' + ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][dayOfWeek] + ')' }, { status: 200 });
    }

    const scheduleIds = schedules.map(s => s.id);

    // 2. Get all students enrolled in these schedules
    const { data: studentClasses, error: scError } = await supabase
      .from('student_classes')
      .select('student_id, class_schedule_id')
      .in('class_schedule_id', scheduleIds);

    if (scError) {
      return NextResponse.json({ error: 'Erro ao buscar alunos: ' + scError.message }, { status: 500 });
    }

    if (!studentClasses || studentClasses.length === 0) {
      return NextResponse.json({ message: 'Nenhum aluno vinculado às turmas de hoje.' }, { status: 200 });
    }

    // 3. Upsert attendance records for ALL students today (pending if not yet confirmed)
    // ignoreDuplicates: true — won't overwrite confirmed/cancelled statuses
    const attendanceInserts = studentClasses.map(sc => ({
      class_schedule_id: sc.class_schedule_id,
      student_id: sc.student_id,
      date: dateStr,
      status: 'pending' as const,
    }));

    const { error: upsertError } = await supabase.from('class_attendances').upsert(attendanceInserts, {
      onConflict: 'class_schedule_id,student_id,date',
      ignoreDuplicates: true,
    });

    if (upsertError) {
      console.error('Attendance upsert error:', upsertError);
    }

    // 4. Get which students haven't been notified yet (status still "pending" = not yet pushed)
    // We send push to ALL students in today's classes every time this runs (idempotent from user perspective)
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

    let totalSent = 0;
    const allStudentIds = [...new Set(studentClasses.map(sc => sc.student_id))];

    // Build per-schedule messages
    for (const schedule of schedules) {
      const studentIdsForSchedule = studentClasses
        .filter(sc => sc.class_schedule_id === schedule.id)
        .map(sc => sc.student_id);

      if (studentIdsForSchedule.length === 0) continue;

      const classTypeObj = (schedule as any).class_type;
      const className = Array.isArray(classTypeObj) ? classTypeObj[0]?.name : classTypeObj?.name || 'Aula';

      const pushRes = await fetch(`${origin}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_ids: studentIdsForSchedule,
          title: `Sua aula de ${className} é hoje! 💪`,
          body: `Horário: ${schedule.time}. Acesse o app para confirmar sua presença!`,
          url: `/portal`,
        }),
      });

      if (pushRes.ok) {
        const result = await pushRes.json();
        totalSent += result.sent || 0;
      }
    }

    return NextResponse.json({
      success: true,
      date: dateStr,
      dayOfWeek,
      schedulesFound: schedules.length,
      studentsNotified: allStudentIds.length,
      pushSent: totalSent,
      message: `${schedules.length} aula(s) hoje. ${allStudentIds.length} aluno(s) com presença registrada. ${totalSent} push(es) enviado(s).`,
    });
  } catch (error: any) {
    console.error('Cron Error:', error);
    return NextResponse.json({ error: error?.message || 'Internal Server Error' }, { status: 500 });
  }
}
