-- form_submission_stats: counts-only health probe for /portal/admin/status.
-- The app's anon key is deliberately insert-only on form_submissions (see
-- 20260709220000), so the status panel reads through this narrow
-- security-definer function instead of a table SELECT. It exposes counts
-- and a timestamp, never row content.
-- Applied to the foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj)
-- on 2026-07-09; this file is the repo record of that migration.

create or replace function public.form_submission_stats()
returns table (
  total_7d bigint,
  zoho_failed bigint,
  latest_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where created_at > now() - interval '7 days'),
    count(*) filter (where processing_status = 'zoho_failed'),
    max(created_at)
  from public.form_submissions;
$$;

revoke all on function public.form_submission_stats() from public;
grant execute on function public.form_submission_stats() to anon;
