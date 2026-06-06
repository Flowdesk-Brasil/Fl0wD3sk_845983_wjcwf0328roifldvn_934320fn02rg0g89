import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// This endpoint should be called by a CRON job continuously (e.g., every 5 minutes)
export async function GET(req: Request) {
  try {
    const today = new Date();
    // getDay() returns 0 for Sunday, 1 for Monday, etc.
    const dayOfWeek = today.getDay();
    const dateStr = today.toISOString().split('T')[0];
    const currentHour = today.getHours();

    // 1. Get all schedules for today
    const { data: schedules, error: scheduleError } = await supabase
      .from('class_schedules')
      .select('*, class_type:class_types(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('active', true);

    if (scheduleError || !schedules) {
      return NextResponse.json({ error: 'Erro ao buscar turmas' }, { status: 500 });
    }

    if (schedules.length === 0) {
      return NextResponse.json({ message: 'Nenhuma turma programada para hoje' }, { status: 200 });
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

    // 3. To avoid duplicates, fetch existing attendances for today
    const { data: existingAttendances, error: attError } = await supabase
      .from('class_attendances')
      .select('student_id, class_schedule_id')
      .eq('date', dateStr)
      .in('class_schedule_id', scheduleIds);
      
    if (attError) {
      return NextResponse.json({ error: 'Erro ao buscar presenças existentes' }, { status: 500 });
    }

    const existingSet = new Set(existingAttendances.map(a => `${a.student_id}-${a.class_schedule_id}`));

    // Filter out students who already have an attendance record for this class today
    const newStudentClasses = studentClasses.filter(sc => !existingSet.has(`${sc.student_id}-${sc.class_schedule_id}`));

    if (newStudentClasses.length === 0) {
      return NextResponse.json({ message: 'Nenhum novo aluno para notificar no momento.' }, { status: 200 });
    }

    // 4. Create attendance records as "pending" for today
    const attendanceInserts = newStudentClasses.map(sc => ({
      class_schedule_id: sc.class_schedule_id,
      student_id: sc.student_id,
      date: dateStr,
      status: 'pending' as const
    }));

    if (attendanceInserts.length > 0) {
      await supabase.from('class_attendances').upsert(attendanceInserts, { onConflict: 'class_schedule_id,student_id,date', ignoreDuplicates: true });
    }

    // 5. Trigger Push API for these new students
    let totalSent = 0;
    const origin = req.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    for (const schedule of schedules) {
      const newStudentIdsForSchedule = newStudentClasses.filter(sc => sc.class_schedule_id === schedule.id).map(sc => sc.student_id);
      
      if (newStudentIdsForSchedule.length > 0) {
        // Handle both local db object and supabase object structures safely
        const classTypeObj = schedule.class_type || schedule.class_types;
        // In local mock it might be an array or object, in supabase it's usually an object with name
        const className = Array.isArray(classTypeObj) ? classTypeObj[0]?.name : classTypeObj?.name || 'Aula';
        
        const pushRes = await fetch(`${origin}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_ids: newStudentIdsForSchedule,
            title: `${className} nas próximas horas!`,
            body: `Sua aula de hoje será às ${schedule.time}. Acesse o app para confirmar sua presença!`,
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
