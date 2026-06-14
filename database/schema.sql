-- Corpo & Evolução - Supabase/PostgreSQL
-- Execute em um projeto novo. O script mantém funções e políticas substituíveis.

create extension if not exists "pgcrypto";

do $$ begin create type user_role as enum ('admin', 'receptionist', 'professor', 'student'); exception when duplicate_object then null; end $$;
do $$ begin create type student_status as enum ('active', 'inactive', 'blocked'); exception when duplicate_object then null; end $$;
do $$ begin create type enrollment_status as enum ('active', 'suspended', 'cancelled', 'expired'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_status as enum ('pending', 'paid', 'expired', 'cancelled', 'refunded'); exception when duplicate_object then null; end $$;
do $$ begin create type payment_method as enum ('pix', 'credit_card', 'debit_card', 'cash'); exception when duplicate_object then null; end $$;
do $$ begin create type checkin_status as enum ('allowed', 'denied'); exception when duplicate_object then null; end $$;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'student',
  full_name varchar(255) not null,
  email varchar(255) unique not null,
  avatar_url text,
  active boolean not null default true,
  last_login timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  duration_days integer not null check (duration_days > 0),
  weekly_limit integer not null default 7 check (weekly_limit between 1 and 7),
  color varchar(20) not null default '#1a73e8',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references profiles(id) on delete set null,
  full_name varchar(255) not null,
  email varchar(255) unique,
  cpf varchar(14) unique not null,
  rg varchar(20),
  birth_date date not null,
  gender varchar(30),
  phone varchar(20) not null,
  whatsapp varchar(20),
  cep varchar(10),
  street varchar(255),
  number varchar(20),
  complement varchar(100),
  neighborhood varchar(100),
  city varchar(100),
  state varchar(2),
  weight numeric(5,2) check (weight is null or weight > 0),
  height numeric(5,2) check (height is null or height > 0),
  imc numeric(5,2),
  objective text,
  emergency_contact varchar(255),
  emergency_phone varchar(20),
  observations text,
  status student_status not null default 'active',
  qr_code varchar(255) unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists enrollments (
  id uuid primary key default gen_random_uuid(),
  matricula_number varchar(30) unique not null,
  student_id uuid not null references students(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete restrict,
  status enrollment_status not null default 'active',
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  created_at timestamptz not null default now()
);

create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  plan_id uuid not null references plans(id) on delete restrict,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  document_text text not null,
  status varchar(20) not null default 'pending' check (status in ('pending', 'signed', 'cancelled')),
  ip_address varchar(50),
  signed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  reference varchar(50) unique not null,
  student_id uuid not null references students(id) on delete cascade,
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  amount numeric(10,2) not null check (amount >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  fine numeric(10,2) not null default 0 check (fine >= 0),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  status payment_status not null default 'pending',
  method payment_method,
  due_date date not null,
  paid_at timestamptz,
  pix_code text,
  created_at timestamptz not null default now()
);

create table if not exists checkins (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete set null,
  enrollment_id uuid references enrollments(id) on delete set null,
  status checkin_status not null,
  reason varchar(255),
  unit varchar(100) not null default 'Matriz',
  checked_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  target_type varchar(20) not null check (target_type in ('all', 'student')),
  target_id uuid references students(id) on delete cascade,
  title varchar(255) not null,
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  check ((target_type = 'all' and target_id is null) or (target_type = 'student' and target_id is not null))
);

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

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete set null,
  action varchar(50) not null,
  entity varchar(50) not null,
  entity_id text,
  details text not null,
  ip_address varchar(50),
  created_at timestamptz not null default now()
);

create table if not exists settings (
  id text primary key default 'studio',
  studio_name varchar(255) not null,
  cnpj varchar(24),
  phone varchar(24),
  email varchar(255),
  address text,
  updated_at timestamptz not null default now()
);

-- Compatibilidade com versões anteriores do schema.
alter table profiles add column if not exists active boolean not null default true;
alter table profiles add column if not exists last_login timestamptz;
alter table audit_logs alter column entity_id type text using entity_id::text;

create index if not exists idx_students_status on students(status);
create index if not exists idx_students_name on students(lower(full_name));
create index if not exists idx_enrollments_student_status on enrollments(student_id, status);
create index if not exists idx_payments_status_due_date on payments(status, due_date);
create index if not exists idx_checkins_checked_at on checkins(checked_at desc);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);
create unique index if not exists idx_push_subscriptions_endpoint on push_subscriptions(endpoint);
create index if not exists idx_push_subscriptions_user_id on push_subscriptions(user_id);

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function calculate_student_imc()
returns trigger language plpgsql as $$
begin
  if new.weight is not null and new.height is not null and new.height > 0 then
    new.imc = round(new.weight / power(new.height / 100.0, 2), 2);
  else
    new.imc = null;
  end if;
  return new;
end;
$$;

create or replace function generate_student_qr()
returns trigger language plpgsql as $$
begin
  if new.qr_code is null then
    new.qr_code = 'CE-' || upper(substr(new.id::text, 1, 8));
  end if;
  return new;
end;
$$;

create or replace function handle_new_auth_user()
returns trigger
security definer set search_path = public
language plpgsql as $$
begin
  insert into profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.email,
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function current_app_role()
returns user_role
stable security definer set search_path = public
language sql as $$
  select role from profiles where id = auth.uid() and active = true;
$$;

create or replace function is_staff()
returns boolean stable language sql as $$
  select coalesce(current_app_role() in ('admin', 'receptionist', 'professor'), false);
$$;

create or replace function is_admin()
returns boolean stable language sql as $$
  select coalesce(current_app_role() = 'admin', false);
$$;

create or replace function audit_row_change()
returns trigger
security definer set search_path = public
language plpgsql as $$
declare
  row_id text;
begin
  row_id = case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  insert into audit_logs (user_id, action, entity, entity_id, details)
  values (auth.uid(), tg_op, tg_table_name, row_id, 'Mutation recorded by database trigger');
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_students_updated_at on students;
create trigger trg_students_updated_at before update on students for each row execute function set_updated_at();
drop trigger if exists trg_settings_updated_at on settings;
create trigger trg_settings_updated_at before update on settings for each row execute function set_updated_at();
drop trigger if exists trg_students_imc on students;
drop trigger if exists calculate_imc_trigger on students;
create trigger trg_students_imc before insert or update of weight, height on students for each row execute function calculate_student_imc();
drop trigger if exists trg_students_qr on students;
drop trigger if exists generate_student_qr_trigger on students;
create trigger trg_students_qr before insert on students for each row execute function generate_student_qr();
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_auth_user();

do $$
declare table_name text;
begin
  foreach table_name in array array['profiles','plans','students','enrollments','contracts','payments','checkins','notifications','settings']
  loop
    execute format('drop trigger if exists trg_audit_%I on %I', table_name, table_name);
    execute format('create trigger trg_audit_%I after insert or update or delete on %I for each row execute function audit_row_change()', table_name, table_name);
  end loop;
end $$;

alter table profiles enable row level security;
alter table plans enable row level security;
alter table students enable row level security;
alter table enrollments enable row level security;
alter table contracts enable row level security;
alter table payments enable row level security;
alter table checkins enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;
alter table audit_logs enable row level security;
alter table settings enable row level security;

drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles for select to authenticated using (id = auth.uid() or is_staff());
drop policy if exists profiles_admin_write on profiles;
create policy profiles_admin_write on profiles for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists plans_read on plans;
create policy plans_read on plans for select to authenticated using (true);
drop policy if exists plans_admin_write on plans;
create policy plans_admin_write on plans for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists students_staff_write on students;
create policy students_staff_write on students for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists students_own_read on students;
create policy students_own_read on students for select to authenticated using (profile_id = auth.uid() or is_staff());

drop policy if exists enrollments_staff_write on enrollments;
create policy enrollments_staff_write on enrollments for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists enrollments_own_read on enrollments;
create policy enrollments_own_read on enrollments for select to authenticated using (exists (select 1 from students s where s.id = student_id and s.profile_id = auth.uid()) or is_staff());

drop policy if exists contracts_staff_write on contracts;
create policy contracts_staff_write on contracts for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists contracts_own_read on contracts;
create policy contracts_own_read on contracts for select to authenticated using (exists (select 1 from students s where s.id = student_id and s.profile_id = auth.uid()) or is_staff());

drop policy if exists payments_staff_write on payments;
create policy payments_staff_write on payments for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists payments_own_read on payments;
create policy payments_own_read on payments for select to authenticated using (exists (select 1 from students s where s.id = student_id and s.profile_id = auth.uid()) or is_staff());

drop policy if exists checkins_staff_write on checkins;
create policy checkins_staff_write on checkins for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists checkins_own_read on checkins;
create policy checkins_own_read on checkins for select to authenticated using (exists (select 1 from students s where s.id = student_id and s.profile_id = auth.uid()) or is_staff());

drop policy if exists notifications_staff_access on notifications;
create policy notifications_staff_access on notifications for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists notifications_student_read on notifications;
create policy notifications_student_read on notifications for select to authenticated using (
  target_type = 'all'
  or exists (select 1 from students s where s.id = notifications.target_id and s.profile_id = auth.uid())
);
drop policy if exists push_subscriptions_staff_access on push_subscriptions;
create policy push_subscriptions_staff_access on push_subscriptions for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists audit_admin_read on audit_logs;
create policy audit_admin_read on audit_logs for select to authenticated using (is_admin());
drop policy if exists settings_staff_read on settings;
create policy settings_staff_read on settings for select to authenticated using (is_staff());
drop policy if exists settings_admin_write on settings;
create policy settings_admin_write on settings for all to authenticated using (is_admin()) with check (is_admin());

insert into settings (id, studio_name, cnpj, phone, email, address)
values ('studio', 'Studio Corpo & Evolução', '', '', '', '')
on conflict (id) do nothing;
