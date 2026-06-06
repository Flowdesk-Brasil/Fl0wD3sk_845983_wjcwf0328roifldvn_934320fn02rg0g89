import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// This endpoint should be called by a CRON job (e.g. Vercel Cron or GitHub Actions)
export async function GET(req: Request) {
  try {
    const today = new Date();
    // getDay() returns 0 for Sunday, 1 for Monday, etc.
    const dayOfWeek = today.getDay();
    const dateStr = today.toISOString().split('T')[0];

    // 1. Get all schedules for today
    const { data: schedules, error: scheduleError } = await supabase
      .from('class_schedules')
      .select('*, plan:plans(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('active', true);

    if (scheduleError || !schedules) {
      return NextResponse.json({ error: 'Erro ao buscar turmas' }, { status: 500 });
    }

    if (schedules.length === 0) {
      return NextResponse.json({ message: 'Nenhuma turma hoje' }, { status: 200 });
    }

    // 2. Get students for these schedules
    const scheduleIds = schedules.map(s => s.id);
    const { data: studentClasses, error: scError } = await supabase
      .from('student_classes')
      .select('student_id, class_schedule_id')
      .in('class_schedule_id', scheduleIds);

    if (scError || !studentClasses) {
      return NextResponse.json({ error: 'Erro ao buscar alunos' }, { status: 500 });
    }

    // 3. Create attendance records as "pending" for today if they don't exist
    const attendanceInserts = studentClasses.map(sc => ({
      class_schedule_id: sc.class_schedule_id,
      student_id: sc.student_id,
      date: dateStr,
      status: 'pending' as const
    }));

    if (attendanceInserts.length > 0) {
      await supabase.from('class_attendances').upsert(attendanceInserts, { onConflict: 'class_schedule_id,student_id,date', ignoreDuplicates: true });
    }

    // 4. Trigger Push API for these students
    // We group by schedule so we can send customized messages (e.g., time of the class)
    let totalSent = 0;
    
    for (const schedule of schedules) {
      const studentIdsForSchedule = studentClasses.filter(sc => sc.class_schedule_id === schedule.id).map(sc => sc.student_id);
      
      if (studentIdsForSchedule.length > 0) {
        // Build absolute URL for the push API call
        const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
        
        const pushRes = await fetch(`${origin}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_ids: studentIdsForSchedule,
            title: `Aula de ${schedule.class_type?.name} hoje!`,
            body: `Você confirma presença na aula de hoje às ${schedule.time}?`,
            url: `/mobile-app?date=${dateStr}&schedule=${schedule.id}` // Link para a tela de confirmação
          })
        });

        if (pushRes.ok) {
          const result = await pushRes.json();
          totalSent += (result.sent || 0);
        }
      }
    }

    return NextResponse.json({ success: true, message: `Disparadas notificações para ${totalSent} alunos.` });
  } catch (error) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
