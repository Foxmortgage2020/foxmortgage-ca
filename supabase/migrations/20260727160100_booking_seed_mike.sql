-- Native booking engine seed: the first host (Michael) and his four launch event
-- types. Idempotent — every insert carries `on conflict do nothing`, so re-running
-- is safe and never clobbers a value edited later from the admin dashboard
-- (session four).
--
-- agent_id a0000000-0000-4000-8000-000000000001 is Michael's canonical workbench
-- `agents.id`, resolved live 2026-07-27 by email (mfox@foxmortgage.ca) through the
-- portal_readonly role. It is the same tenant key every other agent-scoped read in
-- this repo uses.
--
-- DURATIONS ARE THE BRIEF'S, NOT VERIFIED AGAINST ZOHO BOOKINGS. The brief says to
-- defer to Michael's existing Zoho Bookings types if they differ. Browsing to
-- foxmortgage.zohobookings.com is blocked by this environment's policy, so the live
-- types could not be read. These four are the brief's values; Michael confirms or
-- corrects them, and from session four they are editable in the dashboard rather
-- than in a migration.

insert into public.booking_hosts (agent_id, slug, display_name, timezone, active)
values (
  'a0000000-0000-4000-8000-000000000001',
  'mike',
  'Michael Fox',
  'America/Toronto',
  true
)
on conflict (agent_id) do nothing;

-- The Outlook connection, recorded in the state Step 0 actually found it in.
--
-- status = 'read_only' is the LIVE FINDING, written into the data rather than a
-- comment: the Graph application credential carries exactly ["Calendars.Read"], so
-- it can see Michael's calendar but cannot create an event on it. write_calendar_id
-- is therefore NULL — there is no write target yet, and the partial unique index
-- allows that. `credential_ref` names where the credential lives, never the value.
--
-- When Michael grants Calendars.ReadWrite (steps in docs/booking-engine-session-one.md),
-- lib/booking/outlook.ts detects the new role on its own and starts writing. This
-- row should then be moved to status 'connected' with write_calendar_id set.
insert into public.calendar_connections (
  agent_id, provider, credential_ref, busy_calendar_ids, write_calendar_id, status
)
select
  'a0000000-0000-4000-8000-000000000001',
  'outlook',
  'env:MS_TENANT_ID,MS_CLIENT_ID,MS_CLIENT_SECRET,MS_CALENDAR_UPN',
  '{}'::text[],
  null,
  'read_only'
where not exists (
  select 1 from public.calendar_connections
   where agent_id = 'a0000000-0000-4000-8000-000000000001' and provider = 'outlook'
);

-- The four launch event types.
insert into public.booking_event_types (
  agent_id, slug, name, description, duration_minutes,
  buffer_before_minutes, buffer_after_minutes, min_notice_hours,
  max_advance_days, max_per_day, slot_increment_minutes, intake_questions, active
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    'discovery-call',
    'Discovery call',
    'A quick first call to hear what you are working on and point you the right way.',
    15, 0, 5, 4, 60, 8, 15, '[]'::jsonb, true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'strategy-session',
    'Strategy session',
    'A full sit down on your mortgage plan, your options, and what each one costs you.',
    45, 0, 10, 12, 60, 4, 15, jsonb_build_array(
      jsonb_build_object(
        'key', 'situation',
        'label', 'What are you working on?',
        'type', 'select',
        'required', true,
        'options', jsonb_build_array('Buying a home', 'Renewing my mortgage', 'Refinancing', 'Something else')
      )
    ), true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'smm-strategy-call',
    'Monitoring strategy call',
    'We go through what your monitoring found and whether it is worth acting on yet.',
    30, 0, 10, 12, 60, 5, 15, jsonb_build_array(
      jsonb_build_object(
        'key', 'lender',
        'label', 'Who is your mortgage with right now?',
        'type', 'text',
        'required', false,
        'options', '[]'::jsonb
      )
    ), true
  ),
  (
    'a0000000-0000-4000-8000-000000000001',
    'signing-review',
    'Signing review',
    'A short walk through your paperwork before you sign, so nothing is a surprise.',
    20, 0, 5, 4, 60, 6, 15, '[]'::jsonb, true
  )
on conflict (agent_id, slug) do nothing;

-- Monday to Friday, 9 to 5, America/Toronto. Saturday (0) and Sunday (6) have NO
-- row on purpose: a missing weekday is closed, so the weekend needs no seed and
-- cannot be switched on by accident.
insert into public.booking_hours (agent_id, weekday, windows)
values
  ('a0000000-0000-4000-8000-000000000001', 1, '[{"start":"09:00","end":"17:00"}]'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 2, '[{"start":"09:00","end":"17:00"}]'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 3, '[{"start":"09:00","end":"17:00"}]'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 4, '[{"start":"09:00","end":"17:00"}]'::jsonb),
  ('a0000000-0000-4000-8000-000000000001', 5, '[{"start":"09:00","end":"17:00"}]'::jsonb)
on conflict (agent_id, weekday) do nothing;
