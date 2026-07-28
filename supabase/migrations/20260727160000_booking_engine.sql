-- Native booking engine, session one of four. FOXCA project skfeivzhqvrefnkqjwtj.
--
-- POSTURE (the house pattern, not a new one): RLS on, NO policies, table grants
-- REVOKED, and a small set of narrow security-definer functions that each demand
-- `p_operator_secret`. The brief asks for "service-role writes only". THERE IS NO
-- FOXCA SERVICE-ROLE KEY — only the anon key (shared with public form intake) and
-- FOXCA_OPERATOR_SECRET. Minting a service-role key would reverse the deliberate
-- 2026-07-09 decision that deleted the workbench's. So this follows the ruling
-- already written into 20260717150000_client_links.sql:6-14: the operator-secret
-- function surface is STRICTLY NARROWER than service-role — it exposes five
-- operations rather than a schema. The public visitor never talks to Supabase;
-- every call here is made by the Next server, which holds the secret.
--
-- TENANCY: every table is keyed by `agent_id` from this first migration, so the
-- schema does not change when agent two arrives. `agent_id` carries the practice's
-- canonical agent identity — the workbench `agents.id` UUID the rest of this repo
-- already uses for tenant scoping. It is a VALUE copied in, never a cross-project
-- join, so the booking engine has no runtime dependency on the workbench.
--
-- TIME: every instant is timestamptz stored in UTC. Wall-clock configuration
-- (hours, overrides) is stored as local "HH:MM" strings plus the host's IANA
-- timezone, and converted in TypeScript (lib/booking/time.ts) where it is
-- testable. NO timezone math happens in this file — `bookings.local_date` is
-- computed by the server in the host's zone and passed in, which is what makes
-- the per-day rules correct across DST without any SQL tz handling.

-- ─── Tables ──────────────────────────────────────────────────────────────────

-- One row per host. `slug` is the public URL segment: /book/<slug>/<event-type>.
create table if not exists public.booking_hosts (
  agent_id uuid primary key,
  slug text not null unique,
  display_name text not null,
  timezone text not null default 'America/Toronto',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Calendar providers. MULTIPLE rows per agent are allowed so busy can be checked
-- across several calendars; EXACTLY ONE may be the write target, enforced by the
-- partial unique index below. `credential_ref` names WHERE the credential lives
-- (e.g. 'env:MS_*'), never the credential itself — no secret is ever stored here.
create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.booking_hosts (agent_id) on delete cascade,
  provider text not null check (provider in ('outlook', 'google')),
  credential_ref text not null,
  busy_calendar_ids text[] not null default '{}',
  write_calendar_id text,
  status text not null default 'connected' check (status in ('connected', 'read_only', 'disconnected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One bookable meeting type per row.
create table if not exists public.booking_event_types (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.booking_hosts (agent_id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  duration_minutes integer not null check (duration_minutes between 5 and 480),
  buffer_before_minutes integer not null default 0 check (buffer_before_minutes between 0 and 240),
  buffer_after_minutes integer not null default 0 check (buffer_after_minutes between 0 and 240),
  min_notice_hours integer not null default 4 check (min_notice_hours between 0 and 720),
  max_advance_days integer not null default 60 check (max_advance_days between 1 and 365),
  max_per_day integer not null default 8 check (max_per_day between 1 and 50),
  slot_increment_minutes integer not null default 15 check (slot_increment_minutes between 5 and 120),
  intake_questions jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, slug)
);

-- Weekly recurring availability. `weekday` is 0=Sunday..6=Saturday. `windows` is
-- a jsonb array of {"start":"09:00","end":"17:00"} in the HOST's local wall clock.
-- A MISSING weekday row means closed — absence is the closed state, so nothing
-- has to be seeded to keep a weekend off.
create table if not exists public.booking_hours (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.booking_hosts (agent_id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  windows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, weekday)
);

-- Date-specific exceptions. `closed` wins over `windows`; a row with closed=false
-- and windows set REPLACES that day's recurring hours entirely.
create table if not exists public.booking_overrides (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.booking_hosts (agent_id) on delete cascade,
  date date not null,
  closed boolean not null default true,
  windows jsonb not null default '[]'::jsonb,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_id, date)
);

-- The bookings themselves.
--
-- `local_date` is a DELIBERATE ADDITION beyond the brief's column list: it is the
-- host-local calendar date of `starts_at`, computed by the server in the host's
-- timezone. It makes max_per_day and the one-per-email-per-day rule correct
-- without any timezone math in SQL, across DST, forever.
--
-- `reschedule_token_hash` stores a sha256 hex, never the raw token — the raw is
-- returned once at creation for the confirmation email (session two) and the
-- reschedule link (session three), mirroring lib/client-links.ts exactly.
--
-- `calendar_status` is 'written' once the provider confirms, 'pending_retry'
-- whenever the provider write did not land. A booking is REAL either way; the
-- calendar write is a side effect a reconcile job repairs (session two).
create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.booking_hosts (agent_id) on delete restrict,
  event_type_slug text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  local_date date not null,
  client_name text not null,
  client_email text not null,
  client_phone text not null,
  client_timezone text,
  notes text,
  intake_answers jsonb not null default '{}'::jsonb,
  status text not null default 'booked' check (status in ('booked', 'cancelled', 'rescheduled', 'no_show')),
  reschedule_token_hash text not null,
  sms_consent boolean not null default false,
  consented_at timestamptz,
  source text not null default 'public',
  zoho_contact_id text,
  deal_id text,
  touch_id text,
  calendar_event_id text,
  calendar_status text not null default 'pending_retry' check (calendar_status in ('written', 'pending_retry', 'not_attempted')),
  calendar_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Exactly one write target per agent, however many busy calendars are connected.
create unique index if not exists calendar_connections_write_target_idx
  on public.calendar_connections (agent_id)
  where write_calendar_id is not null;

create index if not exists calendar_connections_agent_idx
  on public.calendar_connections (agent_id, provider);

-- THE RACE GUARD: no two live bookings may hold the identical start for one
-- agent. Overlapping-but-not-identical races are caught by the re-check inside
-- booking_create; this index is the hard backstop for the exact-slot case.
create unique index if not exists bookings_agent_slot_active_idx
  on public.bookings (agent_id, starts_at)
  where status = 'booked';

create index if not exists bookings_agent_window_idx
  on public.bookings (agent_id, starts_at, status);

create index if not exists bookings_agent_local_date_idx
  on public.bookings (agent_id, local_date, status);

create index if not exists bookings_email_idx
  on public.bookings (agent_id, event_type_slug, lower(client_email), local_date);

create index if not exists bookings_calendar_retry_idx
  on public.bookings (calendar_status, created_at desc)
  where calendar_status = 'pending_retry';

create index if not exists bookings_reschedule_token_idx
  on public.bookings (reschedule_token_hash);

-- ─── RLS + grants ────────────────────────────────────────────────────────────
-- RLS with no policies still leaves the default anon grants, so the revoke is
-- separate and load-bearing (the client_links.sql:43 lesson).

alter table public.booking_hosts enable row level security;
revoke all on public.booking_hosts from anon, authenticated, public;

alter table public.calendar_connections enable row level security;
revoke all on public.calendar_connections from anon, authenticated, public;

alter table public.booking_event_types enable row level security;
revoke all on public.booking_event_types from anon, authenticated, public;

alter table public.booking_hours enable row level security;
revoke all on public.booking_hours from anon, authenticated, public;

alter table public.booking_overrides enable row level security;
revoke all on public.booking_overrides from anon, authenticated, public;

alter table public.bookings enable row level security;
revoke all on public.bookings from anon, authenticated, public;

-- ─── Functions ───────────────────────────────────────────────────────────────
-- Every one is `language plpgsql security definer set search_path = public` with
-- the operator-secret check as the FIRST statement. public.foxca_operator_secret_ok
-- already exists (20260718190000) — it is NOT recreated here, only called.

-- 1. The public page's config read: host + event type in one round trip.
create or replace function public.booking_config_for(
  p_host_slug text,
  p_event_slug text,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_host public.booking_hosts%rowtype;
        v_et public.booking_event_types%rowtype;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  select * into v_host from public.booking_hosts where slug = p_host_slug and active;
  if not found then
    return jsonb_build_object('found', false, 'reason', 'host');
  end if;

  select * into v_et from public.booking_event_types
   where agent_id = v_host.agent_id and slug = p_event_slug and active;
  if not found then
    return jsonb_build_object('found', false, 'reason', 'event_type');
  end if;

  return jsonb_build_object(
    'found', true,
    'host', jsonb_build_object(
      'agentId', v_host.agent_id,
      'slug', v_host.slug,
      'displayName', v_host.display_name,
      'timezone', v_host.timezone
    ),
    'eventType', jsonb_build_object(
      'slug', v_et.slug,
      'name', v_et.name,
      'description', v_et.description,
      'durationMinutes', v_et.duration_minutes,
      'bufferBeforeMinutes', v_et.buffer_before_minutes,
      'bufferAfterMinutes', v_et.buffer_after_minutes,
      'minNoticeHours', v_et.min_notice_hours,
      'maxAdvanceDays', v_et.max_advance_days,
      'maxPerDay', v_et.max_per_day,
      'slotIncrementMinutes', v_et.slot_increment_minutes,
      'intakeQuestions', v_et.intake_questions
    )
  );
end;
$$;

revoke all on function public.booking_config_for(text, text, text) from public, anon, authenticated;
grant execute on function public.booking_config_for(text, text, text) to anon;

-- 2. Everything the availability engine needs for a date range, in ONE call:
--    the weekly hours, the date overrides in range, and the live bookings in
--    range carrying THEIR OWN event type's buffers (so each existing booking is
--    padded by the buffers it was made under, not the buffers of the type being
--    booked now).
create or replace function public.booking_availability_inputs(
  p_agent_id uuid,
  p_from_date date,
  p_to_date date,
  p_from_instant timestamptz,
  p_to_instant timestamptz,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_hours jsonb;
        v_overrides jsonb;
        v_bookings jsonb;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('weekday', weekday, 'windows', windows) order by weekday), '[]'::jsonb)
    into v_hours
    from public.booking_hours where agent_id = p_agent_id;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(date, 'YYYY-MM-DD'), 'closed', closed, 'windows', windows) order by date), '[]'::jsonb)
    into v_overrides
    from public.booking_overrides
   where agent_id = p_agent_id and date between p_from_date and p_to_date;

  select coalesce(jsonb_agg(jsonb_build_object(
           'start', to_char(b.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'end', to_char(b.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'localDate', to_char(b.local_date, 'YYYY-MM-DD'),
           'eventTypeSlug', b.event_type_slug,
           'bufferBefore', coalesce(et.buffer_before_minutes, 0),
           'bufferAfter', coalesce(et.buffer_after_minutes, 0)
         ) order by b.starts_at), '[]'::jsonb)
    into v_bookings
    from public.bookings b
    left join public.booking_event_types et
      on et.agent_id = b.agent_id and et.slug = b.event_type_slug
   where b.agent_id = p_agent_id
     and b.status = 'booked'
     and b.ends_at > p_from_instant
     and b.starts_at < p_to_instant;

  return jsonb_build_object('hours', v_hours, 'overrides', v_overrides, 'bookings', v_bookings);
end;
$$;

revoke all on function public.booking_availability_inputs(uuid, date, date, timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.booking_availability_inputs(uuid, date, date, timestamptz, timestamptz, text) to anon;

-- 3. THE WRITE. Re-checks conflicts INSIDE the statement so a slot cannot be
--    taken between the availability read and the insert. Returns a jsonb verdict
--    rather than raising, so the route can render an honest reason and a fresh
--    slot list. The unique partial index is the final backstop: a concurrent
--    identical-start insert raises unique_violation, which is caught and returned
--    as the same 'slot_taken' verdict.
create or replace function public.booking_create(
  p_agent_id uuid,
  p_event_type_slug text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_local_date date,
  p_client_name text,
  p_client_email text,
  p_client_phone text,
  p_client_timezone text,
  p_notes text,
  p_intake_answers jsonb,
  p_reschedule_token_hash text,
  p_sms_consent boolean,
  p_source text,
  p_zoho_contact_id text,
  p_deal_id text,
  p_touch_id text,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_et public.booking_event_types%rowtype;
        v_id uuid;
        v_count integer;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  if p_ends_at <= p_starts_at then
    return jsonb_build_object('ok', false, 'reason', 'bad_range');
  end if;

  perform 1 from public.booking_hosts where agent_id = p_agent_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'host_inactive');
  end if;

  select * into v_et from public.booking_event_types
   where agent_id = p_agent_id and slug = p_event_type_slug and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_inactive');
  end if;

  -- Anti-abuse: at most one ACTIVE booking per email, per event type, per day.
  -- "per day" is read as the day of the requested MEETING (local_date), which is
  -- the reading that also stops one person double-booking the same day.
  select count(*) into v_count from public.bookings
   where agent_id = p_agent_id
     and event_type_slug = p_event_type_slug
     and lower(client_email) = lower(p_client_email)
     and local_date = p_local_date
     and status = 'booked';
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_pending');
  end if;

  -- Per-day cap for this event type.
  select count(*) into v_count from public.bookings
   where agent_id = p_agent_id
     and event_type_slug = p_event_type_slug
     and local_date = p_local_date
     and status = 'booked';
  if v_count >= v_et.max_per_day then
    return jsonb_build_object('ok', false, 'reason', 'day_full');
  end if;

  -- Padded-interval overlap against every live booking. Each side is padded by
  -- its OWN event type's buffers.
  select count(*) into v_count
    from public.bookings b
    left join public.booking_event_types et
      on et.agent_id = b.agent_id and et.slug = b.event_type_slug
   where b.agent_id = p_agent_id
     and b.status = 'booked'
     and (b.starts_at - make_interval(mins => coalesce(et.buffer_before_minutes, 0)))
         < (p_ends_at + make_interval(mins => v_et.buffer_after_minutes))
     and (b.ends_at + make_interval(mins => coalesce(et.buffer_after_minutes, 0)))
         > (p_starts_at - make_interval(mins => v_et.buffer_before_minutes));
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  begin
    insert into public.bookings (
      agent_id, event_type_slug, starts_at, ends_at, local_date,
      client_name, client_email, client_phone, client_timezone, notes,
      intake_answers, reschedule_token_hash, sms_consent, consented_at,
      source, zoho_contact_id, deal_id, touch_id, calendar_status
    ) values (
      p_agent_id, p_event_type_slug, p_starts_at, p_ends_at, p_local_date,
      p_client_name, p_client_email, p_client_phone, p_client_timezone, p_notes,
      coalesce(p_intake_answers, '{}'::jsonb), p_reschedule_token_hash,
      coalesce(p_sms_consent, false),
      case when coalesce(p_sms_consent, false) then now() else null end,
      coalesce(p_source, 'public'), p_zoho_contact_id, p_deal_id, p_touch_id,
      'pending_retry'
    ) returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.booking_create(uuid, text, timestamptz, timestamptz, date, text, text, text, text, text, jsonb, text, boolean, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.booking_create(uuid, text, timestamptz, timestamptz, date, text, text, text, text, text, jsonb, text, boolean, text, text, text, text, text) to anon;

-- 4. Stamp the calendar outcome after the provider call. Separate from the write
--    so a provider failure can never roll back a real booking.
create or replace function public.booking_mark_calendar(
  p_id uuid,
  p_calendar_event_id text,
  p_calendar_status text,
  p_detail text,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_calendar_status not in ('written', 'pending_retry', 'not_attempted') then
    raise exception 'bad calendar status';
  end if;
  update public.bookings
     set calendar_event_id = coalesce(p_calendar_event_id, calendar_event_id),
         calendar_status = p_calendar_status,
         calendar_detail = p_detail,
         updated_at = now()
   where id = p_id;
  return found;
end;
$$;

revoke all on function public.booking_mark_calendar(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.booking_mark_calendar(uuid, text, text, text, text) to anon;

-- 5. Read one booking back (the confirmation surface, and session two's
--    confirmation email + reconcile job).
create or replace function public.booking_get(
  p_id uuid,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  select jsonb_build_object(
           'id', b.id,
           'agentId', b.agent_id,
           'eventTypeSlug', b.event_type_slug,
           'eventTypeName', et.name,
           'startsAt', to_char(b.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'endsAt', to_char(b.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'localDate', to_char(b.local_date, 'YYYY-MM-DD'),
           'clientName', b.client_name,
           'clientEmail', b.client_email,
           'clientPhone', b.client_phone,
           'clientTimezone', b.client_timezone,
           'notes', b.notes,
           'intakeAnswers', b.intake_answers,
           'status', b.status,
           'smsConsent', b.sms_consent,
           'consentedAt', b.consented_at,
           'source', b.source,
           'calendarStatus', b.calendar_status,
           'calendarDetail', b.calendar_detail,
           'hostTimezone', h.timezone,
           'hostDisplayName', h.display_name
         )
    into v
    from public.bookings b
    join public.booking_hosts h on h.agent_id = b.agent_id
    left join public.booking_event_types et
      on et.agent_id = b.agent_id and et.slug = b.event_type_slug
   where b.id = p_id;
  return coalesce(v, 'null'::jsonb);
end;
$$;

revoke all on function public.booking_get(uuid, text) from public, anon, authenticated;
grant execute on function public.booking_get(uuid, text) to anon;
