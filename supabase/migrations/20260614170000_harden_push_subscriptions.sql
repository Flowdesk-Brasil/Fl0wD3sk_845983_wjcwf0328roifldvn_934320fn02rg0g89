create extension if not exists "pgcrypto";

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  permission text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table push_subscriptions add column if not exists id uuid default gen_random_uuid();
alter table push_subscriptions add column if not exists user_id uuid;
alter table push_subscriptions add column if not exists endpoint text;
alter table push_subscriptions add column if not exists p256dh text;
alter table push_subscriptions add column if not exists auth text;
alter table push_subscriptions add column if not exists user_agent text;
alter table push_subscriptions add column if not exists permission text;
alter table push_subscriptions add column if not exists last_seen_at timestamptz not null default now();
alter table push_subscriptions add column if not exists created_at timestamptz not null default now();

update push_subscriptions
set id = coalesce(id, gen_random_uuid()),
    last_seen_at = coalesce(last_seen_at, created_at, now()),
    created_at = coalesce(created_at, now());

delete from push_subscriptions
where endpoint is null
   or p256dh is null
   or auth is null
   or user_id is null;

alter table push_subscriptions alter column id set not null;
alter table push_subscriptions alter column user_id set not null;
alter table push_subscriptions alter column endpoint set not null;
alter table push_subscriptions alter column p256dh set not null;
alter table push_subscriptions alter column auth set not null;

delete from push_subscriptions duplicated
using push_subscriptions kept
where duplicated.endpoint = kept.endpoint
  and duplicated.endpoint is not null
  and duplicated.id <> kept.id
  and (duplicated.created_at, duplicated.id) < (kept.created_at, kept.id);

create unique index if not exists idx_push_subscriptions_endpoint
  on push_subscriptions (endpoint);

create index if not exists idx_push_subscriptions_user_id
  on push_subscriptions (user_id);

alter table push_subscriptions enable row level security;

drop policy if exists push_subscriptions_staff_access on push_subscriptions;
create policy push_subscriptions_staff_access on push_subscriptions
  for all to authenticated
  using (is_staff())
  with check (is_staff());

drop policy if exists notifications_student_read on notifications;
create policy notifications_student_read on notifications
  for select to authenticated
  using (
    target_type = 'all'
    or exists (
      select 1
      from students s
      where s.id = notifications.target_id
        and s.profile_id = auth.uid()
    )
  );

do $$
begin
  alter publication supabase_realtime add table notifications;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
