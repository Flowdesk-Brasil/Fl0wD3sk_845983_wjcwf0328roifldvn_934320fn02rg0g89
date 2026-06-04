-- Expansão operacional: assinatura digital, PIX, agenda e check-in idempotente.

alter table contracts add column if not exists signature_data text;
alter table contracts add column if not exists sent_at timestamptz;

alter table payments add column if not exists pix_qr_base64 text;
alter table payments add column if not exists pix_ticket_url text;
alter table payments add column if not exists provider_payment_id text;
alter table payments add column if not exists provider_status text;

alter table settings add column if not exists contract_template_path text;
alter table settings add column if not exists contract_template_name text;

create table if not exists contract_signing_requests (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  token_hash text unique not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists class_types (
  id uuid primary key default gen_random_uuid(),
  name varchar(120) not null,
  description text,
  color varchar(20) not null default '#1a73e8',
  duration_minutes integer not null default 60 check (duration_minutes between 15 and 240),
  capacity integer not null default 10 check (capacity between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_type_id uuid not null references class_types(id) on delete restrict,
  instructor_id uuid references profiles(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  capacity integer not null check (capacity between 1 and 200),
  status varchar(20) not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  notes text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

create table if not exists class_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade,
  status varchar(20) not null default 'confirmed' check (status in ('confirmed', 'attended', 'cancelled', 'missed')),
  created_at timestamptz not null default now(),
  unique (session_id, student_id)
);

create index if not exists idx_contract_signing_token on contract_signing_requests(token_hash);
create index if not exists idx_class_sessions_start on class_sessions(start_at);
create index if not exists idx_class_bookings_session on class_bookings(session_id, status);
create index if not exists idx_class_bookings_student on class_bookings(student_id, status);
create index if not exists idx_checkins_student_checked_at on checkins(student_id, checked_at desc);
create unique index if not exists idx_payments_provider_payment_id on payments(provider_payment_id) where provider_payment_id is not null;

create or replace function register_student_checkin(p_code text, p_unit text default 'Matriz')
returns jsonb
security definer
set search_path = public
language plpgsql as $$
declare
  v_student students%rowtype;
  v_enrollment enrollments%rowtype;
  v_checkin checkins%rowtype;
  v_allowed boolean := false;
  v_reason text;
begin
  if not is_staff() then
    raise exception 'Acesso negado';
  end if;

  select * into v_student
  from students
  where qr_code = trim(p_code) or id::text = trim(p_code)
  limit 1;

  if v_student.id is not null then
    select * into v_enrollment
    from enrollments
    where student_id = v_student.id and status = 'active'
    order by created_at desc
    limit 1;
  end if;

  v_allowed := v_student.id is not null and v_student.status = 'active' and v_enrollment.id is not null;

  if v_allowed then
    select * into v_checkin
    from checkins
    where student_id = v_student.id
      and status = 'allowed'
      and checked_at >= now() - interval '5 minutes'
    order by checked_at desc
    limit 1;

    if v_checkin.id is not null then
      return to_jsonb(v_checkin) || jsonb_build_object(
        'student', jsonb_build_object('id', v_student.id, 'full_name', v_student.full_name),
        'duplicate', true,
        'reason', 'Check-in já confirmado nos últimos 5 minutos. Nenhum novo registro foi criado.'
      );
    end if;
  end if;

  v_reason := case
    when v_student.id is null then 'Código não encontrado.'
    when v_student.status <> 'active' then 'Aluno inativo ou bloqueado.'
    when v_enrollment.id is null then 'Aluno sem matrícula ativa.'
    else null
  end;

  insert into checkins (student_id, enrollment_id, status, reason, unit)
  values (
    v_student.id,
    v_enrollment.id,
    case when v_allowed then 'allowed'::checkin_status else 'denied'::checkin_status end,
    v_reason,
    coalesce(nullif(trim(p_unit), ''), 'Matriz')
  )
  returning * into v_checkin;

  return to_jsonb(v_checkin) || jsonb_build_object(
    'student', case when v_student.id is null then null else jsonb_build_object('id', v_student.id, 'full_name', v_student.full_name) end,
    'duplicate', false
  );
end;
$$;

grant execute on function register_student_checkin(text, text) to authenticated;

create or replace function book_class_session(p_session_id uuid, p_student_id uuid)
returns class_bookings
security definer
set search_path = public
language plpgsql as $$
declare
  v_session class_sessions%rowtype;
  v_booking class_bookings%rowtype;
  v_occupied integer;
begin
  if not is_staff() then
    raise exception 'Acesso negado';
  end if;

  select * into v_session from class_sessions where id = p_session_id for update;
  if v_session.id is null or v_session.status <> 'scheduled' or v_session.start_at <= now() then
    raise exception 'Horário indisponível';
  end if;

  select count(*) into v_occupied from class_bookings
  where session_id = p_session_id and status in ('confirmed', 'attended');

  if v_occupied >= v_session.capacity then
    raise exception 'Aula lotada';
  end if;

  insert into class_bookings (session_id, student_id, status)
  values (p_session_id, p_student_id, 'confirmed')
  on conflict (session_id, student_id)
  do update set status = 'confirmed'
  returning * into v_booking;

  return v_booking;
end;
$$;

grant execute on function book_class_session(uuid, uuid) to authenticated;

create or replace function audit_row_change()
returns trigger
security definer set search_path = public
language plpgsql as $$
declare
  row_id text;
  payload jsonb;
begin
  row_id = case when tg_op = 'DELETE' then old.id::text else new.id::text end;
  payload = case
    when tg_op = 'INSERT' then jsonb_build_object('new', to_jsonb(new))
    when tg_op = 'UPDATE' then jsonb_build_object('before', to_jsonb(old), 'after', to_jsonb(new))
    else jsonb_build_object('before', to_jsonb(old))
  end;
  insert into audit_logs (user_id, action, entity, entity_id, details)
  values (auth.uid(), tg_op, tg_table_name, row_id, payload::text);
  return coalesce(new, old);
end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['contract_signing_requests','class_types','class_sessions','class_bookings']
  loop
    execute format('drop trigger if exists trg_audit_%I on %I', table_name, table_name);
    execute format('create trigger trg_audit_%I after insert or update or delete on %I for each row execute function audit_row_change()', table_name, table_name);
  end loop;
end $$;

alter table contract_signing_requests enable row level security;
alter table class_types enable row level security;
alter table class_sessions enable row level security;
alter table class_bookings enable row level security;

drop policy if exists class_types_staff_all on class_types;
create policy class_types_staff_all on class_types for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists class_sessions_staff_all on class_sessions;
create policy class_sessions_staff_all on class_sessions for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists class_sessions_student_read on class_sessions;
create policy class_sessions_student_read on class_sessions for select to authenticated using (
  exists (
    select 1 from class_bookings b
    join students s on s.id = b.student_id
    where b.session_id = class_sessions.id and s.profile_id = auth.uid()
  )
);
drop policy if exists class_bookings_staff_all on class_bookings;
create policy class_bookings_staff_all on class_bookings for all to authenticated using (is_staff()) with check (is_staff());
drop policy if exists class_bookings_student_read on class_bookings;
create policy class_bookings_student_read on class_bookings for select to authenticated using (
  exists (select 1 from students s where s.id = student_id and s.profile_id = auth.uid())
);

insert into class_types (name, description, color, duration_minutes, capacity)
select 'Treino funcional', 'Aula coletiva de condicionamento e mobilidade.', '#1a73e8', 60, 12
where not exists (select 1 from class_types);
