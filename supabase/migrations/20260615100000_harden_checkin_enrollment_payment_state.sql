-- Mantem a catraca olhando sempre para a matricula operacional atual.
-- Se um aluno ficou com mais de uma matricula ativa por edicoes antigas,
-- preserva a ativa mais recente e encerra as demais.

with ranked_active_enrollments as (
  select
    id,
    row_number() over (
      partition by student_id
      order by start_date desc nulls last, created_at desc nulls last, id desc
    ) as position
  from public.enrollments
  where status = 'active'
),
stale_enrollments as (
  select id
  from ranked_active_enrollments
  where position > 1
)
update public.enrollments e
set status = 'cancelled'
from stale_enrollments stale
where e.id = stale.id;

update public.payments p
set status = 'cancelled',
    method = null,
    paid_at = null
from public.enrollments e
where p.enrollment_id = e.id
  and e.status = 'cancelled'
  and p.status in ('pending', 'expired');

create index if not exists idx_enrollments_student_current
  on public.enrollments (student_id, status, start_date desc, created_at desc);

create index if not exists idx_payments_enrollment_current
  on public.payments (enrollment_id, status, due_date desc, created_at desc);
