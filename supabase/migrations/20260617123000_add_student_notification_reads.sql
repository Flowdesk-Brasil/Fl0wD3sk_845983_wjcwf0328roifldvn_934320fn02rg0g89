create extension if not exists pgcrypto;

create table if not exists student_notification_reads (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  notification_id uuid not null references notifications(id) on delete cascade,
  read_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (student_id, notification_id)
);

create index if not exists idx_student_notification_reads_student
  on student_notification_reads(student_id, read_at desc);

create index if not exists idx_student_notification_reads_notification
  on student_notification_reads(notification_id);

alter table student_notification_reads enable row level security;

drop policy if exists student_notification_reads_staff_access on student_notification_reads;
create policy student_notification_reads_staff_access on student_notification_reads
  for all to authenticated
  using (is_staff())
  with check (is_staff());

drop policy if exists student_notification_reads_own_read on student_notification_reads;
create policy student_notification_reads_own_read on student_notification_reads
  for select to authenticated
  using (
    exists (
      select 1
      from students s
      where s.id = student_notification_reads.student_id
        and s.profile_id = auth.uid()
    )
  );

drop policy if exists student_notification_reads_own_insert on student_notification_reads;
create policy student_notification_reads_own_insert on student_notification_reads
  for insert to authenticated
  with check (
    exists (
      select 1
      from students s
      where s.id = student_notification_reads.student_id
        and s.profile_id = auth.uid()
    )
  );
