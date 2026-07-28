-- Native booking engine, session two: confirmation, reschedule, cancel, the
-- Zoho link, the reminder, and the calendar reconcile loop.
-- FOXCA project skfeivzhqvrefnkqjwtj.
--
-- ADDITIVE ONLY. No existing function's parameter list changes, so nothing has
-- to be dropped and the overload trap does not apply. `booking_get` gains keys
-- in its BODY, which is safe.
--
-- THE RESCHEDULE IS AN IN-PLACE MOVE, deliberately. The alternative, cancel then
-- create, would mint a new id and a new reschedule token, which breaks the link
-- already sitting in the client's inbox the moment they use it once. Moving the
-- row keeps one booking with one identity for its whole life, so a client can
-- reschedule twice from the same email. The cost is that the move must re-run
-- every rule booking_create runs, including the unique-index catch, which it does.

-- ─── Columns ─────────────────────────────────────────────────────────────────

alter table public.bookings
  -- Cancellation carries a time, a reason, and who did it. `status` alone said
  -- none of that.
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_by text
    check (cancelled_by is null or cancelled_by in ('client', 'admin', 'system')),

  -- Reschedule history without orphan rows: the original time is kept once, and
  -- the counter says how many times it has moved.
  add column if not exists original_starts_at timestamptz,
  add column if not exists rescheduled_count integer not null default 0,

  -- Reconcile state. `calendar_permanent` persists what CreateEventResult
  -- already computes and session one threw away, so the job can tell a
  -- retryable blip from a wall without re-parsing prose.
  add column if not exists calendar_attempts integer not null default 0,
  add column if not exists calendar_last_attempt_at timestamptz,
  add column if not exists calendar_permanent boolean not null default false,

  -- Outbound stamps. Both are idempotency guards, not decoration: a reminder
  -- job that runs twice must not send twice.
  add column if not exists confirmation_sent_at timestamptz,
  add column if not exists reminder_sent_at timestamptz,

  -- Zoho linkage outcome.
  add column if not exists zoho_synced_at timestamptz,
  add column if not exists zoho_sync_detail text,
  add column if not exists zoho_lead_id text;

create index if not exists bookings_reminder_due_idx
  on public.bookings (starts_at)
  where status = 'booked' and reminder_sent_at is null;

-- ─── Read by reschedule token ────────────────────────────────────────────────
-- The capability lookup. Keyed by the sha256 the row stores, never by the raw
-- token, so a database reader cannot use what they read. Returns the booking
-- plus the host and event type in one call, because every caller needs all three.

create or replace function public.booking_by_reschedule_token(
  p_token_hash text,
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
   where b.reschedule_token_hash = p_token_hash;
  return coalesce(v, 'null'::jsonb);
end;
$$;

revoke all on function public.booking_by_reschedule_token(text, text) from public, anon, authenticated;
grant execute on function public.booking_by_reschedule_token(text, text) to anon;

-- ─── Cancel ──────────────────────────────────────────────────────────────────
-- Idempotent by shape: cancelling an already-cancelled booking reports
-- 'already_cancelled' rather than raising or silently succeeding, so a client
-- double-clicking a link in an email gets an honest page either way.

create or replace function public.booking_cancel(
  p_id uuid,
  p_reason text,
  p_by text,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_status text;
        v_event_id text;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  select status, calendar_event_id into v_status, v_event_id
    from public.bookings where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  end if;
  if v_status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  update public.bookings
     set status = 'cancelled',
         cancelled_at = now(),
         cancel_reason = nullif(btrim(coalesce(p_reason, '')), ''),
         cancelled_by = coalesce(p_by, 'client'),
         updated_at = now()
   where id = p_id;

  -- The caller removes the provider event and then clears the id. Returning it
  -- here saves a second read.
  return jsonb_build_object('ok', true, 'calendarEventId', v_event_id);
end;
$$;

revoke all on function public.booking_cancel(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.booking_cancel(uuid, text, text, text) to anon;

-- ─── Reschedule ──────────────────────────────────────────────────────────────
-- Every rule booking_create enforces, re-run against the NEW time, with the row
-- itself excluded from both the duplicate check and the overlap check. Without
-- those exclusions a booking would always collide with itself and no reschedule
-- could ever succeed.

create or replace function public.booking_reschedule(
  p_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_local_date date,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_b public.bookings%rowtype;
        v_et public.booking_event_types%rowtype;
        v_count integer;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  if p_ends_at <= p_starts_at then
    return jsonb_build_object('ok', false, 'reason', 'bad_range');
  end if;

  select * into v_b from public.bookings where id = p_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_b.status = 'cancelled' then
    return jsonb_build_object('ok', false, 'reason', 'already_cancelled');
  end if;
  if v_b.status <> 'booked' then
    return jsonb_build_object('ok', false, 'reason', 'not_active');
  end if;

  -- Moving to the time it already holds is a no-op, not an error.
  if v_b.starts_at = p_starts_at then
    return jsonb_build_object('ok', true, 'unchanged', true);
  end if;

  perform 1 from public.booking_hosts where agent_id = v_b.agent_id and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'host_inactive');
  end if;

  select * into v_et from public.booking_event_types
   where agent_id = v_b.agent_id and slug = v_b.event_type_slug and active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'event_inactive');
  end if;

  -- One active booking per email, per event type, per day. Self excluded.
  select count(*) into v_count from public.bookings
   where agent_id = v_b.agent_id
     and event_type_slug = v_b.event_type_slug
     and lower(client_email) = lower(v_b.client_email)
     and local_date = p_local_date
     and status = 'booked'
     and id <> p_id;
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_pending');
  end if;

  -- Per-day cap for the target day. Self excluded, so moving within one day
  -- cannot trip a cap the booking itself is already counted in.
  select count(*) into v_count from public.bookings
   where agent_id = v_b.agent_id
     and event_type_slug = v_b.event_type_slug
     and local_date = p_local_date
     and status = 'booked'
     and id <> p_id;
  if v_count >= v_et.max_per_day then
    return jsonb_build_object('ok', false, 'reason', 'day_full');
  end if;

  -- Padded-interval overlap, self excluded.
  select count(*) into v_count
    from public.bookings b
    left join public.booking_event_types et
      on et.agent_id = b.agent_id and et.slug = b.event_type_slug
   where b.agent_id = v_b.agent_id
     and b.status = 'booked'
     and b.id <> p_id
     and (b.starts_at - make_interval(mins => coalesce(et.buffer_before_minutes, 0)))
         < (p_ends_at + make_interval(mins => v_et.buffer_after_minutes))
     and (b.ends_at + make_interval(mins => coalesce(et.buffer_after_minutes, 0)))
         > (p_starts_at - make_interval(mins => v_et.buffer_before_minutes));
  if v_count > 0 then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  begin
    update public.bookings
       set starts_at = p_starts_at,
           ends_at = p_ends_at,
           local_date = p_local_date,
           original_starts_at = coalesce(original_starts_at, v_b.starts_at),
           rescheduled_count = rescheduled_count + 1,
           -- The calendar entry now points at the wrong time. The caller moves
           -- or recreates it and stamps the outcome.
           calendar_status = 'pending_retry',
           calendar_attempts = 0,
           calendar_permanent = false,
           reminder_sent_at = null,
           updated_at = now()
     where id = p_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;

  return jsonb_build_object(
    'ok', true,
    'previousStartsAt', to_char(v_b.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'calendarEventId', v_b.calendar_event_id
  );
end;
$$;

revoke all on function public.booking_reschedule(uuid, timestamptz, timestamptz, date, text) from public, anon, authenticated;
grant execute on function public.booking_reschedule(uuid, timestamptz, timestamptz, date, text) to anon;

-- ─── Calendar reconcile support ──────────────────────────────────────────────

-- The work queue. Skips rows already known to be permanently blocked so the job
-- does not hammer a wall, and reports how long each has been waiting so the
-- caller can flag the stuck ones.
create or replace function public.booking_pending_calendar(
  p_limit integer,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x->>'createdAt'), '[]'::jsonb) into v
    from (
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
               'clientName', b.client_name,
               'clientPhone', b.client_phone,
               'clientEmail', b.client_email,
               'clientTimezone', b.client_timezone,
               'notes', b.notes,
               'intakeAnswers', b.intake_answers,
               'smsConsent', b.sms_consent,
               'calendarEventId', b.calendar_event_id,
               'calendarAttempts', b.calendar_attempts,
               'calendarDetail', b.calendar_detail,
               'createdAt', to_char(b.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'ageHours', round(extract(epoch from (now() - b.created_at)) / 3600.0, 1)
             ) as x
        from public.bookings b
        join public.booking_hosts h on h.agent_id = b.agent_id
        left join public.booking_event_types et
          on et.agent_id = b.agent_id and et.slug = b.event_type_slug
       where b.status = 'booked'
         and b.calendar_status = 'pending_retry'
         and b.calendar_permanent = false
         and b.starts_at > now()
       order by b.created_at
       limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) s;
  return v;
end;
$$;

revoke all on function public.booking_pending_calendar(integer, text) from public, anon, authenticated;
grant execute on function public.booking_pending_calendar(integer, text) to anon;

-- Stamp an attempt. Separate from booking_mark_calendar because that one cannot
-- clear an event id (its coalesce preserves the old value) and does not count
-- attempts. Passing p_clear_event true nulls the id, which is what a cancel
-- needs after the provider event is gone.
create or replace function public.booking_mark_calendar_attempt(
  p_id uuid,
  p_calendar_event_id text,
  p_calendar_status text,
  p_detail text,
  p_permanent boolean,
  p_clear_event boolean,
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
     set calendar_event_id = case
           when coalesce(p_clear_event, false) then null
           else coalesce(p_calendar_event_id, calendar_event_id)
         end,
         calendar_status = p_calendar_status,
         calendar_detail = p_detail,
         calendar_permanent = coalesce(p_permanent, false),
         calendar_attempts = calendar_attempts + 1,
         calendar_last_attempt_at = now(),
         updated_at = now()
   where id = p_id;
  return found;
end;
$$;

revoke all on function public.booking_mark_calendar_attempt(uuid, text, text, text, boolean, boolean, text) from public, anon, authenticated;
grant execute on function public.booking_mark_calendar_attempt(uuid, text, text, text, boolean, boolean, text) to anon;

-- ─── Reminders ───────────────────────────────────────────────────────────────
-- Due list for the T-24h reminder.
--
-- THE INSIDE-24-HOURS GUARD, which is the whole point: a booking made less than
-- p_min_lead_hours before it starts NEVER gets a reminder. Without that, someone
-- booking for tomorrow morning would receive a reminder within seconds of their
-- confirmation, which reads as a system fault rather than a courtesy.

create or replace function public.booking_due_reminders(
  p_from timestamptz,
  p_to timestamptz,
  p_min_lead_hours integer,
  p_limit integer,
  p_operator_secret text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(x order by x->>'startsAt'), '[]'::jsonb) into v
    from (
      select jsonb_build_object(
               'id', b.id,
               'eventTypeName', et.name,
               'durationMinutes', et.duration_minutes,
               'startsAt', to_char(b.starts_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'endsAt', to_char(b.ends_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
               'clientName', b.client_name,
               'clientEmail', b.client_email,
               'clientPhone', b.client_phone,
               'clientTimezone', b.client_timezone,
               'hostDisplayName', h.display_name,
               'hostTimezone', h.timezone
             ) as x
        from public.bookings b
        join public.booking_hosts h on h.agent_id = b.agent_id
        left join public.booking_event_types et
          on et.agent_id = b.agent_id and et.slug = b.event_type_slug
       where b.status = 'booked'
         and b.reminder_sent_at is null
         and b.starts_at >= p_from
         and b.starts_at < p_to
         and b.created_at <= b.starts_at - make_interval(hours => coalesce(p_min_lead_hours, 24))
       order by b.starts_at
       limit greatest(1, least(coalesce(p_limit, 100), 500))
    ) s;
  return v;
end;
$$;

revoke all on function public.booking_due_reminders(timestamptz, timestamptz, integer, integer, text) from public, anon, authenticated;
grant execute on function public.booking_due_reminders(timestamptz, timestamptz, integer, integer, text) to anon;

-- ─── Outbound and Zoho stamps ────────────────────────────────────────────────

create or replace function public.booking_mark_sent(
  p_id uuid,
  p_kind text,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_kind = 'confirmation' then
    update public.bookings set confirmation_sent_at = now(), updated_at = now() where id = p_id;
  elsif p_kind = 'reminder' then
    update public.bookings set reminder_sent_at = now(), updated_at = now() where id = p_id;
  else
    raise exception 'kind must be confirmation or reminder';
  end if;
  return found;
end;
$$;

revoke all on function public.booking_mark_sent(uuid, text, text) from public, anon, authenticated;
grant execute on function public.booking_mark_sent(uuid, text, text) to anon;

create or replace function public.booking_mark_zoho(
  p_id uuid,
  p_detail text,
  p_contact_id text,
  p_deal_id text,
  p_lead_id text,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  update public.bookings
     set zoho_synced_at = now(),
         zoho_sync_detail = p_detail,
         zoho_contact_id = coalesce(p_contact_id, zoho_contact_id),
         deal_id = coalesce(p_deal_id, deal_id),
         zoho_lead_id = coalesce(p_lead_id, zoho_lead_id),
         updated_at = now()
   where id = p_id;
  return found;
end;
$$;

revoke all on function public.booking_mark_zoho(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.booking_mark_zoho(uuid, text, text, text, text, text) to anon;

-- ─── booking_get gains the fields session two needs ──────────────────────────
-- BODY-ONLY change. The signature is untouched, so no drop is needed and the
-- existing grant stands.

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
           'durationMinutes', et.duration_minutes,
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
           'calendarEventId', b.calendar_event_id,
           'zohoContactId', b.zoho_contact_id,
           'dealId', b.deal_id,
           'touchId', b.touch_id,
           'zohoSyncedAt', b.zoho_synced_at,
           'confirmationSentAt', b.confirmation_sent_at,
           'reminderSentAt', b.reminder_sent_at,
           'rescheduledCount', b.rescheduled_count,
           'cancelledAt', b.cancelled_at,
           'createdAt', to_char(b.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
           'hostTimezone', h.timezone,
           'hostDisplayName', h.display_name,
           'hostSlug', h.slug
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
