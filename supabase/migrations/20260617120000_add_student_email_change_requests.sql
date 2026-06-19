create extension if not exists pgcrypto;

create table if not exists student_email_change_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  student_id uuid not null references students(id) on delete cascade,
  current_email text not null,
  new_email text,
  current_code_hash text not null,
  new_code_hash text,
  current_verified_at timestamptz,
  status text not null default 'awaiting_current' check (status in ('awaiting_current', 'awaiting_new', 'completed', 'expired')),
  attempts integer not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_student_email_change_user_status
  on student_email_change_requests(user_id, status, created_at desc);

create index if not exists idx_student_email_change_expires
  on student_email_change_requests(expires_at);
