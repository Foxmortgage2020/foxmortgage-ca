-- Strategic Mortgage Monitoring — backfill audit. Every Zoho write that fills a
-- previously-empty CRM field from the monitoring export lands here first-class:
-- who wrote it, which record, exactly which fields, and the result. Same house
-- pattern as 20260712120000: RLS on, NO policies, table grants revoked; the ONLY
-- surface is the narrow security-definer functions granted to anon. Nothing
-- deletes — this is the record of every confirmed backfill.
-- Applied live to the foxmortgage-ca project (skfeivzhqvrefnkqjwtj) 2026-07-12.

create table if not exists public.smm_backfill_events (
  id uuid primary key default gen_random_uuid(),
  household_id text,
  zoho_module text not null,
  zoho_record_id text not null,
  fields jsonb not null default '{}'::jsonb,
  acting_email text not null,
  result text not null default 'ok',
  created_at timestamptz not null default now()
);
create index if not exists smm_backfill_events_recent_idx on public.smm_backfill_events (created_at desc);
create index if not exists smm_backfill_events_record_idx on public.smm_backfill_events (zoho_record_id, created_at desc);

alter table public.smm_backfill_events enable row level security;
revoke all on public.smm_backfill_events from anon, authenticated, public;

create or replace function public.smm_backfill_record(
  p_household text, p_module text, p_record_id text, p_fields jsonb, p_email text, p_result text
) returns uuid language sql security definer set search_path = public as $$
  insert into public.smm_backfill_events (household_id, zoho_module, zoho_record_id, fields, acting_email, result)
  values (p_household, p_module, p_record_id, coalesce(p_fields, '{}'::jsonb), p_email, coalesce(p_result, 'ok'))
  returning id;
$$;

create or replace function public.smm_backfill_events_recent(p_limit integer default 50)
returns setof public.smm_backfill_events language sql security definer set search_path = public as $$
  select * from public.smm_backfill_events order by created_at desc limit least(coalesce(p_limit, 50), 500);
$$;

revoke all on function public.smm_backfill_record(text, text, text, jsonb, text, text) from public;
grant execute on function public.smm_backfill_record(text, text, text, jsonb, text, text) to anon;
revoke all on function public.smm_backfill_events_recent(integer) from public;
grant execute on function public.smm_backfill_events_recent(integer) to anon;
