-- Session four: the admin write surface for the booking engine.
--
-- Sessions one to three could READ the availability tables (booking_config_for,
-- booking_availability_inputs) but nothing could WRITE them from the portal.
-- Michael's hours, his closed days, and his event-type settings were seeded by
-- migration and changeable only by another migration. This is the set of narrow
-- functions the Availability page writes through.
--
-- EVERY FUNCTION IS PER-AGENT. `p_agent_id` is a required argument on all of
-- them, not an implicit "the one host". There is one host today and the schema
-- has always allowed more; a second agent needs new rows, never new functions.
--
-- House pattern, unchanged: RLS on, NO policies, direct table grants already
-- revoked by 20260727160000; the only surface is security-definer functions
-- requiring p_operator_secret (public.foxca_operator_secret_ok, migration
-- 20260718190000).
--
-- NOTHING HERE CANCELS A BOOKING. The admin cancel goes through the SAME
-- booking_cancel the client's own link uses, reached by the SAME engine
-- function (lib/booking/engine.ts cancelBooking) so the client email and the
-- calendar removal cannot be skipped by taking a different door. All this file
-- adds for that path is a by-id lookup returning the identical shape
-- booking_by_reschedule_token returns, so the engine needs no second code path.

-- ─── Resolve: the host slug the page is scoped to, into its agent id ─────────
--
-- The page is per-agent, so it needs an agent id before it can ask for
-- anything. It starts from a SLUG (a stable, human-readable name that lives in
-- config) rather than a hardcoded uuid, so pointing the page at a second host
-- is a config value and never a code change.

create or replace function public.booking_agent_for_slug(
  p_slug text,
  p_operator_secret text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  select agent_id into v from public.booking_hosts where slug = lower(trim(p_slug));
  return v;
end;
$$;

-- ─── Read: everything the Availability page renders in one call ──────────────

create or replace function public.booking_admin_overview(
  p_agent_id uuid,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'host', (
      select jsonb_build_object(
               'agentId', h.agent_id,
               'slug', h.slug,
               'displayName', h.display_name,
               'timezone', h.timezone,
               'active', h.active)
        from public.booking_hosts h where h.agent_id = p_agent_id
    ),
    -- A MISSING weekday row means closed. The page renders all seven days and
    -- fills the gaps, so absence stays the closed state in the database.
    'hours', coalesce((
      select jsonb_agg(jsonb_build_object('weekday', bh.weekday, 'windows', bh.windows)
                       order by bh.weekday)
        from public.booking_hours bh where bh.agent_id = p_agent_id
    ), '[]'::jsonb),
    -- Past overrides are not sent. A closed day from March is noise on a page
    -- about what is bookable next.
    'overrides', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', to_char(bo.date, 'YYYY-MM-DD'),
               'closed', bo.closed,
               'windows', bo.windows,
               'note', bo.note) order by bo.date)
        from public.booking_overrides bo
       where bo.agent_id = p_agent_id
         and bo.date >= (now() at time zone 'America/Toronto')::date
    ), '[]'::jsonb),
    'eventTypes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'slug', et.slug,
               'name', et.name,
               'description', et.description,
               'durationMinutes', et.duration_minutes,
               'bufferBeforeMinutes', et.buffer_before_minutes,
               'bufferAfterMinutes', et.buffer_after_minutes,
               'minNoticeHours', et.min_notice_hours,
               'maxAdvanceDays', et.max_advance_days,
               'maxPerDay', et.max_per_day,
               'slotIncrementMinutes', et.slot_increment_minutes,
               'intakeQuestions', et.intake_questions,
               'active', et.active) order by et.name)
        from public.booking_event_types et where et.agent_id = p_agent_id
    ), '[]'::jsonb)
  ) into v;

  return coalesce(v, 'null'::jsonb);
end;
$$;

-- ─── Read: the upcoming list ─────────────────────────────────────────────────

create or replace function public.booking_admin_upcoming(
  p_agent_id uuid,
  p_limit int,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(t) order by t.starts_at), '[]'::jsonb) into v
  from (
    select b.id,
           b.starts_at,
           to_char(b.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "startsAt",
           to_char(b.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') as "endsAt",
           b.event_type_slug as "eventTypeSlug",
           et.name as "eventTypeName",
           b.client_name as "clientName",
           b.client_email as "clientEmail",
           b.client_phone as "clientPhone",
           b.client_timezone as "clientTimezone",
           b.notes,
           b.intake_answers as "intakeAnswers",
           b.sms_consent as "smsConsent",
           b.status,
           b.calendar_status as "calendarStatus",
           b.source
      from public.bookings b
      left join public.booking_event_types et
        on et.agent_id = b.agent_id and et.slug = b.event_type_slug
     where b.agent_id = p_agent_id
       and b.status = 'booked'
       and b.ends_at >= now()
     order by b.starts_at
     limit least(coalesce(p_limit, 50), 200)
  ) t;

  return v;
end;
$$;

-- By id, in EXACTLY the shape booking_by_reschedule_token returns, so the
-- engine's cancelBooking takes an admin cancel without a second code path.
create or replace function public.booking_admin_by_id(
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
           'hostSlug', h.slug,
           'hostTimezone', h.timezone,
           'hostDisplayName', h.display_name,
           'eventTypeSlug', b.event_type_slug,
           'eventTypeName', et.name,
           'durationMinutes', et.duration_minutes,
           'startsAt', to_char(b.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'endsAt', to_char(b.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'localDate', to_char(b.local_date, 'YYYY-MM-DD'),
           'clientName', b.client_name,
           'clientEmail', b.client_email,
           'clientPhone', b.client_phone,
           'clientTimezone', b.client_timezone,
           'notes', b.notes,
           'status', b.status,
           'calendarEventId', b.calendar_event_id,
           'rescheduledCount', b.rescheduled_count
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

-- ─── Write: weekly hours ─────────────────────────────────────────────────────
--
-- One weekday at a time, upserted. An EMPTY windows array DELETES the row
-- rather than storing `[]`, because absence is the closed state and two ways to
-- say closed is one way too many.

create or replace function public.booking_hours_set(
  p_agent_id uuid,
  p_weekday smallint,
  p_windows jsonb,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_weekday is null or p_weekday < 0 or p_weekday > 6 then
    raise exception 'weekday must be 0 through 6';
  end if;
  if jsonb_typeof(coalesce(p_windows, '[]'::jsonb)) <> 'array' then
    raise exception 'windows must be a json array';
  end if;

  if coalesce(jsonb_array_length(coalesce(p_windows, '[]'::jsonb)), 0) = 0 then
    delete from public.booking_hours where agent_id = p_agent_id and weekday = p_weekday;
    return true;
  end if;

  insert into public.booking_hours (agent_id, weekday, windows)
  values (p_agent_id, p_weekday, p_windows)
  on conflict (agent_id, weekday)
  do update set windows = excluded.windows, updated_at = now();
  return true;
end;
$$;

-- ─── Write: date overrides ───────────────────────────────────────────────────

create or replace function public.booking_override_set(
  p_agent_id uuid,
  p_date date,
  p_closed boolean,
  p_windows jsonb,
  p_note text,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_date is null then
    raise exception 'a date is required';
  end if;
  if jsonb_typeof(coalesce(p_windows, '[]'::jsonb)) <> 'array' then
    raise exception 'windows must be a json array';
  end if;
  -- An open override with no windows would silently mean "closed", which is a
  -- different thing than the person asked for.
  if p_closed is false and coalesce(jsonb_array_length(coalesce(p_windows, '[]'::jsonb)), 0) = 0 then
    raise exception 'an open day needs at least one time window';
  end if;

  insert into public.booking_overrides (agent_id, date, closed, windows, note)
  values (p_agent_id, p_date, coalesce(p_closed, true), coalesce(p_windows, '[]'::jsonb),
          nullif(left(coalesce(p_note, ''), 200), ''))
  on conflict (agent_id, date)
  do update set closed = excluded.closed,
                windows = excluded.windows,
                note = excluded.note,
                updated_at = now();
  return true;
end;
$$;

create or replace function public.booking_override_delete(
  p_agent_id uuid,
  p_date date,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  delete from public.booking_overrides where agent_id = p_agent_id and date = p_date;
  return true;
end;
$$;

-- ─── Write: event type settings ──────────────────────────────────────────────
--
-- EDIT ONLY, deliberately. Creating an event type is a decision with a public
-- URL attached and it can wait for a real second agent. The column checks from
-- migration 20260727160000 (duration 5..480, buffers 0..240, notice 0..720,
-- advance 1..365, per day 1..50, increment 5..120) are the bounds; they raise
-- here rather than being restated, so there is one source of truth for them.

create or replace function public.booking_event_type_update(
  p_agent_id uuid,
  p_slug text,
  p_name text,
  p_description text,
  p_duration_minutes int,
  p_buffer_before_minutes int,
  p_buffer_after_minutes int,
  p_min_notice_hours int,
  p_max_advance_days int,
  p_max_per_day int,
  p_slot_increment_minutes int,
  p_intake_questions jsonb,
  p_active boolean,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'a name is required';
  end if;
  if jsonb_typeof(coalesce(p_intake_questions, '[]'::jsonb)) <> 'array' then
    raise exception 'intake questions must be a json array';
  end if;

  update public.booking_event_types
     set name = trim(p_name),
         description = nullif(left(coalesce(p_description, ''), 2000), ''),
         duration_minutes = p_duration_minutes,
         buffer_before_minutes = p_buffer_before_minutes,
         buffer_after_minutes = p_buffer_after_minutes,
         min_notice_hours = p_min_notice_hours,
         max_advance_days = p_max_advance_days,
         max_per_day = p_max_per_day,
         slot_increment_minutes = p_slot_increment_minutes,
         intake_questions = coalesce(p_intake_questions, '[]'::jsonb),
         active = coalesce(p_active, true),
         updated_at = now()
   where agent_id = p_agent_id and slug = p_slug;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- ─── Grants: anon may EXECUTE, and every one demands the secret ──────────────

revoke all on function public.booking_agent_for_slug(text, text) from public, anon, authenticated;
grant execute on function public.booking_agent_for_slug(text, text) to anon;

revoke all on function public.booking_admin_overview(uuid, text) from public, anon, authenticated;
grant execute on function public.booking_admin_overview(uuid, text) to anon;

revoke all on function public.booking_admin_upcoming(uuid, int, text) from public, anon, authenticated;
grant execute on function public.booking_admin_upcoming(uuid, int, text) to anon;

revoke all on function public.booking_admin_by_id(uuid, text) from public, anon, authenticated;
grant execute on function public.booking_admin_by_id(uuid, text) to anon;

revoke all on function public.booking_hours_set(uuid, smallint, jsonb, text) from public, anon, authenticated;
grant execute on function public.booking_hours_set(uuid, smallint, jsonb, text) to anon;

revoke all on function public.booking_override_set(uuid, date, boolean, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.booking_override_set(uuid, date, boolean, jsonb, text, text) to anon;

revoke all on function public.booking_override_delete(uuid, date, text) from public, anon, authenticated;
grant execute on function public.booking_override_delete(uuid, date, text) to anon;

revoke all on function public.booking_event_type_update(uuid, text, text, text, int, int, int, int, int, int, int, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.booking_event_type_update(uuid, text, text, text, int, int, int, int, int, int, int, jsonb, boolean, text) to anon;
