import { apiErrorResponse, ApiError, requireRole } from "@/lib/server/supabase-admin";

export async function GET(request: Request) {
  try {
    const { admin, user } = await requireRole(request, ["student"]);
    const { data: student, error } = await admin.from("students").select("*").eq("profile_id", user.id).single();
    if (error || !student) throw new ApiError("Cadastro de aluno não vinculado ao portal.", 404);

    const now = new Date();
    // Use Brazil timezone offset (UTC-3)
    const dateStr = new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dayOfWeek = now.getDay(); // 0=Sunday ... 6=Saturday

    const [
      { data: existingAttendances },
      { data: studentClasses },
      { data: payments },
      { data: contracts },
    ] = await Promise.all([
      // Existing attendances for today
      admin.from("class_attendances")
           .select("id, status, date, class_schedule_id, class_schedule:class_schedules(id, time, day_of_week, capacity, class_type:class_types(id, name, color), instructor:profiles(id, full_name))")
           .eq("student_id", student.id)
           .eq("date", dateStr),
      // All schedules the student is enrolled in for today's weekday
      admin.from("student_classes")
           .select("id, class_schedule_id, class_schedule:class_schedules(id, time, day_of_week, capacity, active, class_type:class_types(id, name, color), instructor:profiles(id, full_name))")
           .eq("student_id", student.id),
      admin.from("payments").select("id, reference, total_amount, status, due_date, paid_at").eq("student_id", student.id).order("due_date", { ascending: false }).limit(12),
      admin.from("contracts").select("id, status, signed_at, created_at, plan:plans(name)").eq("student_id", student.id).order("created_at", { ascending: false }).limit(12),
    ]);

    // Filter student_classes for today's weekday and active schedules
    const todayStudentClasses = (studentClasses || []).filter((sc: any) =>
      sc.class_schedule?.day_of_week === dayOfWeek && sc.class_schedule?.active !== false
    );

    // Build attendances map by class_schedule_id
    const attendanceMap = new Map((existingAttendances || []).map((a: any) => [a.class_schedule_id, a]));

    // Build final attendances list: merge existing + create virtual pending for missing
    const attendancesToUpsert: any[] = [];
    const mergedAttendances: any[] = [];

    for (const sc of todayStudentClasses) {
      const existing = attendanceMap.get(sc.class_schedule_id);
      if (existing) {
        // Already has an attendance record today
        mergedAttendances.push(existing);
      } else {
        // No attendance yet — create one as pending in DB and add to list
        attendancesToUpsert.push({
          class_schedule_id: sc.class_schedule_id,
          student_id: student.id,
          date: dateStr,
          status: "pending",
        });
        // Add virtual attendance to display
        mergedAttendances.push({
          id: `virtual-${sc.class_schedule_id}`,
          status: "pending",
          date: dateStr,
          class_schedule_id: sc.class_schedule_id,
          class_schedule: sc.class_schedule,
        });
      }
    }

    // Upsert missing attendance records silently (don't fail portal load on error)
    if (attendancesToUpsert.length > 0) {
      await admin.from("class_attendances").upsert(attendancesToUpsert, {
        onConflict: "class_schedule_id,student_id,date",
        ignoreDuplicates: true,
      });

      // Re-fetch the newly created records to get real IDs
      const { data: freshAttendances } = await admin.from("class_attendances")
        .select("id, status, date, class_schedule_id, class_schedule:class_schedules(id, time, day_of_week, capacity, class_type:class_types(id, name, color), instructor:profiles(id, full_name))")
        .eq("student_id", student.id)
        .eq("date", dateStr);

      // Replace virtual IDs with real DB IDs
      if (freshAttendances) {
        const freshMap = new Map(freshAttendances.map((a: any) => [a.class_schedule_id, a]));
        for (let i = 0; i < mergedAttendances.length; i++) {
          const att = mergedAttendances[i];
          if (String(att.id).startsWith("virtual-")) {
            const real = freshMap.get(att.class_schedule_id);
            if (real) mergedAttendances[i] = real;
          }
        }
      }
    }

    // Sort by schedule time
    mergedAttendances.sort((a, b) => {
      const timeA = a.class_schedule?.time || "00:00";
      const timeB = b.class_schedule?.time || "00:00";
      return timeA.localeCompare(timeB);
    });

    return Response.json({
      student,
      attendances: mergedAttendances,
      payments: payments || [],
      contracts: contracts || [],
    });
  } catch (reason) {
    return apiErrorResponse(reason);
  }
}
