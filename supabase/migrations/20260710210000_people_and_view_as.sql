-- Session 8: multi-user hardening — view-as session log, people
-- provisioning records, and offboarding records.
--
-- Same posture as the compliance and agent migrations: RLS on with NO
-- table policies AND direct table grants revoked, so the anon key reaches
-- nothing but the narrow security-definer functions below. Nothing
-- deletes: view-as sessions end, offboarding checklists update in place,
-- provisioning records are append-only.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.view_as_sessions (
  id uuid primary key default gen_random_uuid(),
  viewer_clerk_id text not null,
  viewer_email text not null,
  partner_zoho_id text not null,
  partner_name text not null,
  portal_role text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index if not exists view_as_sessions_started_idx
  on public.view_as_sessions (started_at desc);

create table if not exists public.people_provisioning (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  email text not null,
  name text not null,
  person_type text not null check (person_type in ('staff', 'partner', 'agent')),
  roles jsonb not null default '[]'::jsonb,
  zoho_partner_id text,
  workbench_agent_id text,
  setup_remaining jsonb,
  invite_sent boolean not null default false,
  provisioned_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists people_provisioning_clerk_idx
  on public.people_provisioning (clerk_user_id);

create table if not exists public.people_offboarding (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  email text not null,
  name text not null,
  roles jsonb not null default '[]'::jsonb,
  checklist jsonb not null default '[]'::jsonb,
  offboarded_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create index if not exists people_offboarding_clerk_idx
  on public.people_offboarding (clerk_user_id);

-- ─── Lockdown ───────────────────────────────────────────────────────────────

alter table public.view_as_sessions enable row level security;
alter table public.people_provisioning enable row level security;
alter table public.people_offboarding enable row level security;

revoke all on table public.view_as_sessions from anon, authenticated;
revoke all on table public.people_provisioning from anon, authenticated;
revoke all on table public.people_offboarding from anon, authenticated;

-- ─── Functions: view-as ─────────────────────────────────────────────────────

create or replace function public.view_as_start(
  p_viewer_clerk_id text,
  p_viewer_email text,
  p_partner_zoho_id text,
  p_partner_name text,
  p_portal_role text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_viewer_email), '') = '' then
    raise exception 'viewer_email is required';
  end if;
  if coalesce(trim(p_partner_zoho_id), '') = '' then
    raise exception 'partner_zoho_id is required';
  end if;
  insert into view_as_sessions
    (viewer_clerk_id, viewer_email, partner_zoho_id, partner_name, portal_role)
  values
    (coalesce(p_viewer_clerk_id, ''), trim(p_viewer_email), trim(p_partner_zoho_id),
     coalesce(nullif(trim(p_partner_name), ''), p_partner_zoho_id), coalesce(p_portal_role, ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.view_as_end(
  p_id uuid
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_found boolean;
begin
  update view_as_sessions
  set ended_at = now()
  where id = p_id and ended_at is null;
  v_found := found;
  return v_found;
end;
$$;

create or replace function public.view_as_list(
  p_limit integer default 100
) returns setof view_as_sessions
language sql stable security definer set search_path = public
as $$
  select * from view_as_sessions
  order by started_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

-- ─── Functions: provisioning ────────────────────────────────────────────────

create or replace function public.people_provision_record(
  p_actor text,
  p_clerk_user_id text,
  p_email text,
  p_name text,
  p_person_type text,
  p_roles jsonb,
  p_zoho_partner_id text default null,
  p_workbench_agent_id text default null,
  p_setup_remaining jsonb default null,
  p_invite_sent boolean default false
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_actor), '') = '' then
    raise exception 'actor is required';
  end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then
    raise exception 'clerk_user_id is required';
  end if;
  if p_person_type not in ('staff', 'partner', 'agent') then
    raise exception 'person_type must be staff, partner, or agent';
  end if;
  insert into people_provisioning
    (clerk_user_id, email, name, person_type, roles, zoho_partner_id,
     workbench_agent_id, setup_remaining, invite_sent, provisioned_by)
  values
    (trim(p_clerk_user_id), lower(trim(coalesce(p_email, ''))), coalesce(trim(p_name), ''),
     p_person_type, coalesce(p_roles, '[]'::jsonb), nullif(trim(coalesce(p_zoho_partner_id, '')), ''),
     nullif(trim(coalesce(p_workbench_agent_id, '')), ''), p_setup_remaining,
     coalesce(p_invite_sent, false), trim(p_actor))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.people_provision_list()
returns setof people_provisioning
language sql stable security definer set search_path = public
as $$
  select * from people_provisioning order by created_at desc;
$$;

-- ─── Functions: offboarding ─────────────────────────────────────────────────

create or replace function public.people_offboard_record(
  p_actor text,
  p_clerk_user_id text,
  p_email text,
  p_name text,
  p_roles jsonb,
  p_checklist jsonb
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_actor), '') = '' then
    raise exception 'actor is required';
  end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then
    raise exception 'clerk_user_id is required';
  end if;
  insert into people_offboarding
    (clerk_user_id, email, name, roles, checklist, offboarded_by)
  values
    (trim(p_clerk_user_id), lower(trim(coalesce(p_email, ''))), coalesce(trim(p_name), ''),
     coalesce(p_roles, '[]'::jsonb), coalesce(p_checklist, '[]'::jsonb), trim(p_actor))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.people_offboard_list()
returns setof people_offboarding
language sql stable security definer set search_path = public
as $$
  select * from people_offboarding order by created_at desc;
$$;

create or replace function public.people_offboard_get(
  p_id uuid
) returns setof people_offboarding
language sql stable security definer set search_path = public
as $$
  select * from people_offboarding where id = p_id;
$$;

create or replace function public.people_offboard_check(
  p_id uuid,
  p_item_key text,
  p_done boolean,
  p_actor text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_found boolean;
begin
  if coalesce(trim(p_actor), '') = '' then
    raise exception 'actor is required';
  end if;
  update people_offboarding
  set checklist = (
        select coalesce(
          jsonb_agg(
            case
              when item ->> 'key' = p_item_key
                then jsonb_set(item, '{done}', to_jsonb(coalesce(p_done, false)))
              else item
            end
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(checklist) as item
      ),
      updated_at = now(),
      updated_by = trim(p_actor)
  where id = p_id;
  v_found := found;
  return v_found;
end;
$$;

-- ─── Function grants ────────────────────────────────────────────────────────

revoke all on function public.view_as_start(text, text, text, text, text) from public;
revoke all on function public.view_as_end(uuid) from public;
revoke all on function public.view_as_list(integer) from public;
revoke all on function public.people_provision_record(text, text, text, text, text, jsonb, text, text, jsonb, boolean) from public;
revoke all on function public.people_provision_list() from public;
revoke all on function public.people_offboard_record(text, text, text, text, jsonb, jsonb) from public;
revoke all on function public.people_offboard_list() from public;
revoke all on function public.people_offboard_get(uuid) from public;
revoke all on function public.people_offboard_check(uuid, text, boolean, text) from public;

grant execute on function public.view_as_start(text, text, text, text, text) to anon;
grant execute on function public.view_as_end(uuid) to anon;
grant execute on function public.view_as_list(integer) to anon;
grant execute on function public.people_provision_record(text, text, text, text, text, jsonb, text, text, jsonb, boolean) to anon;
grant execute on function public.people_provision_list() to anon;
grant execute on function public.people_offboard_record(text, text, text, text, jsonb, jsonb) to anon;
grant execute on function public.people_offboard_list() to anon;
grant execute on function public.people_offboard_get(uuid) to anon;
grant execute on function public.people_offboard_check(uuid, text, boolean, text) to anon;
