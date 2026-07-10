-- Acknowledged handling for form_submissions (Session 4): a zoho_failed
-- row that Michael has triaged stops ambering the status panel, without
-- hiding fresh failures. Acknowledge records who and when; nothing is
-- deleted or reprocessed. The app role stays insert-only on the table, so
-- reads and the acknowledge write go through narrow security-definer
-- functions like the existing marker function.
-- Applied to the foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj)
-- on 2026-07-09; this file is the repo record of that migration.

alter table public.form_submissions
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by text;

-- Stats now split failed counts: unacknowledged drives the panel light,
-- total keeps the history honest. The return type changes, so the old
-- function drops first (CREATE OR REPLACE cannot change a row type).
drop function if exists public.form_submission_stats();

create function public.form_submission_stats()
returns table (
  total_7d bigint,
  zoho_failed bigint,
  zoho_failed_total bigint,
  latest_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where created_at > now() - interval '7 days'),
    count(*) filter (where processing_status = 'zoho_failed' and acknowledged_at is null),
    count(*) filter (where processing_status = 'zoho_failed'),
    max(created_at)
  from public.form_submissions;
$$;

revoke all on function public.form_submission_stats() from public;
grant execute on function public.form_submission_stats() to anon;

-- The unacknowledged failures the panel lists for triage. Counts,
-- timestamps, and source only; no submitter content.
create or replace function public.form_submission_failures()
returns table (
  id uuid,
  created_at timestamptz,
  source text,
  error_detail text
)
language sql
stable
security definer
set search_path = public
as $$
  select id, created_at, source, error_detail
  from public.form_submissions
  where processing_status = 'zoho_failed' and acknowledged_at is null
  order by created_at desc
  limit 50;
$$;

revoke all on function public.form_submission_failures() from public;
grant execute on function public.form_submission_failures() to anon;

create or replace function public.acknowledge_form_submission(
  p_id uuid,
  p_by text
) returns boolean
language sql
security definer
set search_path = public
as $$
  update public.form_submissions
  set acknowledged_at = now(), acknowledged_by = p_by
  where id = p_id
    and processing_status = 'zoho_failed'
    and acknowledged_at is null
  returning true;
$$;

revoke all on function public.acknowledge_form_submission(uuid, text) from public;
grant execute on function public.acknowledge_form_submission(uuid, text) to anon;
