-- Compliance module storage (Session 6): the business compliance records
-- the portal itself owns. Underwriting truth (flags, conditions, stages)
-- stays workbench-side behind the read-only role; THIS project holds what
-- a supervised practice must keep itself: the credential register, the
-- complaint and incident register, and the policy library with
-- acknowledgments.
--
-- Posture follows the form_submissions precedent: RLS on with NO table
-- policies for the app role, so the server-only anon key can touch
-- nothing directly; every read and write goes through the narrow
-- security-definer functions below (execute granted to anon, revoked
-- from public). Admin gating happens at the portal route layer
-- (compliance.manage); every mutation records who and when.
--
-- Append-leaning by construction: records never delete. Credentials
-- retire, complaints change status, policies version; every change also
-- lands in compliance_events, the module's own append-only trail (no
-- update or delete path exists for it). The audit-log ethos extends here.
--
-- Applied to the foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj)
-- on 2026-07-10; this file is the repo record of that migration.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.compliance_credentials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  holder text not null,
  expires_on date,
  -- Seeded rows carry placeholder dates; the UI shows a "confirm date"
  -- state until Michael confirms the real one. Never render a seeded
  -- date as verified.
  date_confirmed boolean not null default false,
  notes text,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null,
  retired_at timestamptz,
  retired_by text
);

create table if not exists public.compliance_complaints (
  id uuid primary key default gen_random_uuid(),
  received_on date not null,
  source text not null,
  summary text not null,
  status text not null default 'open'
    check (status in ('open', 'investigating', 'resolved', 'reported')),
  resolution_notes text,
  -- Cross-system reference as plain text (a Zoho record id, a deal file
  -- ref); never a foreign key, never a cross-system write.
  reference text,
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

create table if not exists public.compliance_policies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_md text not null,
  version int not null default 1,
  effective_on date,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now(),
  updated_by text not null
);

-- Every policy version is retained immutably; the head row above is the
-- current one, this table is the full history.
create table if not exists public.compliance_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.compliance_policies(id),
  version int not null,
  title text not null,
  body_md text not null,
  effective_on date,
  created_at timestamptz not null default now(),
  created_by text not null,
  unique (policy_id, version)
);

-- Read-and-acknowledge, per policy version, who and when. One user today;
-- the mechanics exist for the first hire's onboarding checklist.
create table if not exists public.compliance_policy_acks (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.compliance_policies(id),
  version int not null,
  acked_by text not null,
  acked_by_clerk_id text,
  acked_at timestamptz not null default now(),
  unique (policy_id, version, acked_by)
);

-- The module's append-only change trail: every mutation function writes
-- one row. No update or delete function exists for this table.
create table if not exists public.compliance_events (
  id uuid primary key default gen_random_uuid(),
  record_type text not null check (record_type in ('credential', 'complaint', 'policy')),
  record_id uuid not null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  actor text not null,
  created_at timestamptz not null default now()
);

create index if not exists compliance_events_record_idx
  on public.compliance_events (record_type, record_id, created_at desc);

-- RLS on, no policies: the app key reaches nothing except the functions.
alter table public.compliance_credentials enable row level security;
alter table public.compliance_complaints enable row level security;
alter table public.compliance_policies enable row level security;
alter table public.compliance_policy_versions enable row level security;
alter table public.compliance_policy_acks enable row level security;
alter table public.compliance_events enable row level security;

-- ─── Credential functions ───────────────────────────────────────────────────

create or replace function public.compliance_credentials_list()
returns setof public.compliance_credentials
language sql stable security definer set search_path = public
as $$
  select * from public.compliance_credentials
  order by status asc, expires_on asc nulls last, name asc;
$$;

create or replace function public.compliance_credential_save(
  p_id uuid,
  p_name text,
  p_holder text,
  p_expires_on date,
  p_date_confirmed boolean,
  p_notes text,
  p_actor text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_holder), '') = '' then
    raise exception 'name and holder are required';
  end if;
  if p_id is null then
    insert into public.compliance_credentials
      (name, holder, expires_on, date_confirmed, notes, created_by, updated_by)
    values (trim(p_name), trim(p_holder), p_expires_on, coalesce(p_date_confirmed, false), p_notes, p_actor, p_actor)
    returning id into v_id;
    insert into public.compliance_events (record_type, record_id, action, detail, actor)
    values ('credential', v_id, 'created',
      jsonb_build_object('name', trim(p_name), 'expires_on', p_expires_on, 'date_confirmed', coalesce(p_date_confirmed, false)),
      p_actor);
  else
    update public.compliance_credentials
    set name = trim(p_name), holder = trim(p_holder), expires_on = p_expires_on,
        date_confirmed = coalesce(p_date_confirmed, false), notes = p_notes,
        updated_at = now(), updated_by = p_actor
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'credential not found';
    end if;
    insert into public.compliance_events (record_type, record_id, action, detail, actor)
    values ('credential', v_id, 'updated',
      jsonb_build_object('name', trim(p_name), 'expires_on', p_expires_on, 'date_confirmed', coalesce(p_date_confirmed, false)),
      p_actor);
  end if;
  return v_id;
end;
$$;

create or replace function public.compliance_credential_retire(
  p_id uuid,
  p_note text,
  p_actor text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  update public.compliance_credentials
  set status = 'retired', retired_at = now(), retired_by = p_actor,
      updated_at = now(), updated_by = p_actor
  where id = p_id and status = 'active'
  returning id into v_id;
  if v_id is null then
    return false;
  end if;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('credential', v_id, 'retired', jsonb_build_object('note', p_note), p_actor);
  return true;
end;
$$;

-- ─── Complaint functions ────────────────────────────────────────────────────

create or replace function public.compliance_complaints_list()
returns setof public.compliance_complaints
language sql stable security definer set search_path = public
as $$
  select * from public.compliance_complaints
  order by (status in ('open', 'investigating')) desc, received_on desc;
$$;

create or replace function public.compliance_complaint_create(
  p_received_on date,
  p_source text,
  p_summary text,
  p_reference text,
  p_actor text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_received_on is null or coalesce(trim(p_source), '') = '' or coalesce(trim(p_summary), '') = '' then
    raise exception 'received_on, source, and summary are required';
  end if;
  insert into public.compliance_complaints (received_on, source, summary, reference, created_by, updated_by)
  values (p_received_on, trim(p_source), trim(p_summary), nullif(trim(coalesce(p_reference, '')), ''), p_actor, p_actor)
  returning id into v_id;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('complaint', v_id, 'created',
    jsonb_build_object('received_on', p_received_on, 'source', trim(p_source)), p_actor);
  return v_id;
end;
$$;

create or replace function public.compliance_complaint_set_status(
  p_id uuid,
  p_status text,
  p_note text,
  p_actor text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_from text;
begin
  if p_status not in ('open', 'investigating', 'resolved', 'reported') then
    raise exception 'status must be open, investigating, resolved, or reported';
  end if;
  select status into v_from from public.compliance_complaints where id = p_id;
  if v_from is null then
    return false;
  end if;
  update public.compliance_complaints
  set status = p_status,
      resolution_notes = coalesce(nullif(trim(coalesce(p_note, '')), ''), resolution_notes),
      updated_at = now(), updated_by = p_actor
  where id = p_id;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('complaint', p_id, 'status_changed',
    jsonb_build_object('from', v_from, 'to', p_status, 'note', nullif(trim(coalesce(p_note, '')), '')),
    p_actor);
  return true;
end;
$$;

-- ─── Policy functions ───────────────────────────────────────────────────────

create or replace function public.compliance_policies_list()
returns setof public.compliance_policies
language sql stable security definer set search_path = public
as $$
  select * from public.compliance_policies
  order by status asc, title asc;
$$;

create or replace function public.compliance_policy_versions_list(p_policy_id uuid)
returns setof public.compliance_policy_versions
language sql stable security definer set search_path = public
as $$
  select * from public.compliance_policy_versions
  where policy_id = p_policy_id
  order by version desc;
$$;

create or replace function public.compliance_policy_acks_list()
returns setof public.compliance_policy_acks
language sql stable security definer set search_path = public
as $$
  select * from public.compliance_policy_acks order by acked_at desc;
$$;

create or replace function public.compliance_policy_create(
  p_title text,
  p_body_md text,
  p_effective_on date,
  p_actor text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body_md), '') = '' then
    raise exception 'title and body are required';
  end if;
  insert into public.compliance_policies (title, body_md, effective_on, created_by, updated_by)
  values (trim(p_title), p_body_md, p_effective_on, p_actor, p_actor)
  returning id into v_id;
  insert into public.compliance_policy_versions (policy_id, version, title, body_md, effective_on, created_by)
  values (v_id, 1, trim(p_title), p_body_md, p_effective_on, p_actor);
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('policy', v_id, 'created', jsonb_build_object('title', trim(p_title), 'version', 1), p_actor);
  return v_id;
end;
$$;

-- Content changes bump the version and retain the old one; a status-only
-- change (active/retired) records without a version bump. Returns the
-- current version.
create or replace function public.compliance_policy_update(
  p_id uuid,
  p_title text,
  p_body_md text,
  p_effective_on date,
  p_status text,
  p_actor text
) returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_old public.compliance_policies%rowtype;
  v_version int;
  v_content_changed boolean;
begin
  if p_status not in ('active', 'retired') then
    raise exception 'status must be active or retired';
  end if;
  select * into v_old from public.compliance_policies where id = p_id;
  if v_old.id is null then
    raise exception 'policy not found';
  end if;
  v_content_changed := trim(p_title) is distinct from v_old.title
    or p_body_md is distinct from v_old.body_md
    or p_effective_on is distinct from v_old.effective_on;
  v_version := v_old.version;
  if v_content_changed then
    v_version := v_old.version + 1;
    insert into public.compliance_policy_versions (policy_id, version, title, body_md, effective_on, created_by)
    values (p_id, v_version, trim(p_title), p_body_md, p_effective_on, p_actor);
  end if;
  update public.compliance_policies
  set title = trim(p_title), body_md = p_body_md, effective_on = p_effective_on,
      version = v_version, status = p_status, updated_at = now(), updated_by = p_actor
  where id = p_id;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('policy', p_id,
    case when p_status is distinct from v_old.status then 'status_changed' else 'updated' end,
    jsonb_build_object('version', v_version, 'content_changed', v_content_changed,
      'from_status', v_old.status, 'to_status', p_status),
    p_actor);
  return v_version;
end;
$$;

create or replace function public.compliance_policy_ack(
  p_policy_id uuid,
  p_version int,
  p_actor text,
  p_clerk_id text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_inserted uuid;
begin
  if not exists (
    select 1 from public.compliance_policy_versions
    where policy_id = p_policy_id and version = p_version
  ) then
    raise exception 'that policy version does not exist';
  end if;
  insert into public.compliance_policy_acks (policy_id, version, acked_by, acked_by_clerk_id)
  values (p_policy_id, p_version, p_actor, p_clerk_id)
  on conflict (policy_id, version, acked_by) do nothing
  returning id into v_inserted;
  return v_inserted is not null;
end;
$$;

-- ─── Events (status history display) ────────────────────────────────────────

create or replace function public.compliance_events_list(
  p_record_type text,
  p_record_id uuid
) returns setof public.compliance_events
language sql stable security definer set search_path = public
as $$
  select * from public.compliance_events
  where record_type = p_record_type and record_id = p_record_id
  order by created_at desc
  limit 200;
$$;

-- ─── Grants: the functions are the whole surface ───────────────────────────

revoke all on function public.compliance_credentials_list() from public;
revoke all on function public.compliance_credential_save(uuid, text, text, date, boolean, text, text) from public;
revoke all on function public.compliance_credential_retire(uuid, text, text) from public;
revoke all on function public.compliance_complaints_list() from public;
revoke all on function public.compliance_complaint_create(date, text, text, text, text) from public;
revoke all on function public.compliance_complaint_set_status(uuid, text, text, text) from public;
revoke all on function public.compliance_policies_list() from public;
revoke all on function public.compliance_policy_versions_list(uuid) from public;
revoke all on function public.compliance_policy_acks_list() from public;
revoke all on function public.compliance_policy_create(text, text, date, text) from public;
revoke all on function public.compliance_policy_update(uuid, text, text, date, text, text) from public;
revoke all on function public.compliance_policy_ack(uuid, int, text, text) from public;
revoke all on function public.compliance_events_list(text, uuid) from public;

grant execute on function public.compliance_credentials_list() to anon;
grant execute on function public.compliance_credential_save(uuid, text, text, date, boolean, text, text) to anon;
grant execute on function public.compliance_credential_retire(uuid, text, text) to anon;
grant execute on function public.compliance_complaints_list() to anon;
grant execute on function public.compliance_complaint_create(date, text, text, text, text) to anon;
grant execute on function public.compliance_complaint_set_status(uuid, text, text, text) to anon;
grant execute on function public.compliance_policies_list() to anon;
grant execute on function public.compliance_policy_versions_list(uuid) to anon;
grant execute on function public.compliance_policy_acks_list() to anon;
grant execute on function public.compliance_policy_create(text, text, date, text) to anon;
grant execute on function public.compliance_policy_update(uuid, text, text, date, text, text) to anon;
grant execute on function public.compliance_policy_ack(uuid, int, text, text) to anon;
grant execute on function public.compliance_events_list(text, uuid) to anon;

-- Belt and braces (applied as its own migration entry,
-- compliance_module_table_revokes, same day): Supabase's default schema
-- privileges grant table access to the API roles, leaving RLS-with-no-
-- policies as the only barrier. Revoke the direct grants so the narrow
-- security-definer functions are the whole surface, database-enforced.
revoke all on table public.compliance_credentials from anon, authenticated;
revoke all on table public.compliance_complaints from anon, authenticated;
revoke all on table public.compliance_policies from anon, authenticated;
revoke all on table public.compliance_policy_versions from anon, authenticated;
revoke all on table public.compliance_policy_acks from anon, authenticated;
revoke all on table public.compliance_events from anon, authenticated;

-- ─── Seed: Michael's known credentials, dates marked unconfirmed ────────────
-- Placeholder dates are clearly marked date_confirmed=false and the UI
-- renders a confirm-date state; nothing here invents a verified date.
-- FSRA licensing cycles end March 31; the current cycle's exact renewal
-- date needs confirming against FSRA's records.

do $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.compliance_credentials) then
    insert into public.compliance_credentials
      (name, holder, expires_on, date_confirmed, notes, created_by, updated_by)
    values
      ('FSRA Mortgage Agent Level 2 licence', 'Michael Fox', '2028-03-31', false,
       'Licence 13463 under BRX Mortgage. FSRA licensing cycles end March 31; confirm the exact renewal date for the current cycle.',
       'session-6-seed', 'session-6-seed')
    returning id into v_id;
    insert into public.compliance_events (record_type, record_id, action, detail, actor)
    values ('credential', v_id, 'created', jsonb_build_object('seed', true), 'session-6-seed');

    insert into public.compliance_credentials
      (name, holder, expires_on, date_confirmed, notes, created_by, updated_by)
    values
      ('Errors and omissions insurance', 'Michael Fox', null, false,
       'Carried through BRX Mortgage. Confirm the policy renewal date and record it here.',
       'session-6-seed', 'session-6-seed')
    returning id into v_id;
    insert into public.compliance_events (record_type, record_id, action, detail, actor)
    values ('credential', v_id, 'created', jsonb_build_object('seed', true), 'session-6-seed');

    insert into public.compliance_credentials
      (name, holder, expires_on, date_confirmed, notes, created_by, updated_by)
    values
      ('Continuing education, FSRA cycle', 'Michael Fox', '2028-03-31', false,
       'CE must complete before the licensing cycle closes. Confirm the requirement and due date for the current cycle.',
       'session-6-seed', 'session-6-seed')
    returning id into v_id;
    insert into public.compliance_events (record_type, record_id, action, detail, actor)
    values ('credential', v_id, 'created', jsonb_build_object('seed', true), 'session-6-seed');
  end if;
end;
$$;
