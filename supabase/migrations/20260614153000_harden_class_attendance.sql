-- Hardening para agenda fixa e presencas.
-- Remove duplicados antigos e impede que o mesmo aluno tenha duas linhas
-- para a mesma aula/data ou dois vinculos para a mesma turma.

delete from class_attendances duplicated
using class_attendances kept
where duplicated.class_schedule_id = kept.class_schedule_id
  and duplicated.student_id = kept.student_id
  and duplicated.date = kept.date
  and duplicated.id <> kept.id
  and (
    case duplicated.status
      when 'attended' then 5
      when 'confirmed' then 4
      when 'pending' then 3
      when 'cancelled' then 2
      when 'missed' then 1
      else 0
    end,
    duplicated.created_at,
    duplicated.id
  ) < (
    case kept.status
      when 'attended' then 5
      when 'confirmed' then 4
      when 'pending' then 3
      when 'cancelled' then 2
      when 'missed' then 1
      else 0
    end,
    kept.created_at,
    kept.id
  );

delete from student_classes duplicated
using student_classes kept
where duplicated.student_id = kept.student_id
  and duplicated.class_schedule_id = kept.class_schedule_id
  and duplicated.id <> kept.id
  and (duplicated.created_at, duplicated.id) > (kept.created_at, kept.id);

create unique index if not exists idx_class_attendances_unique_day
  on class_attendances (class_schedule_id, student_id, date);

create unique index if not exists idx_student_classes_unique_schedule
  on student_classes (student_id, class_schedule_id);

create index if not exists idx_class_attendances_date_schedule
  on class_attendances (date, class_schedule_id);
