-- Renewal Radar status-action audit. Records who/when for every enumerated
-- status write, alongside the Zoho field write. House pattern: RLS on, NO
-- policies, direct table grants revoked; the ONLY surface is the narrow
-- security-definer functions granted to anon. Nothing deletes.
-- Applied live to the foxmortgage-ca project (skfeivzhqvrefnkqjwtj) 2026-07-12.

create table if not exists public.renewal_events (
  id uuid primary key default gen_random_uuid(),
  deal_id text not null,
  deal_name text,
  action text not null,
  acting_email text not null,
  fields jsonb not null default '{}'::jsonb,
  prev_status text,
  result text not null default 'ok',
  created_at timestamptz not null default now()
);
create index if not exists renewal_events_deal_idx on public.renewal_events (deal_id, created_at desc);
create index if not exists renewal_events_created_idx on public.renewal_events (created_at desc);

alter table public.renewal_events enable row level security;
revoke all on public.renewal_events from anon, authenticated, public;

create or replace function public.renewal_event_record(
  p_deal_id text,
  p_deal_name text,
  p_action text,
  p_acting_email text,
  p_fields jsonb,
  p_prev_status text,
  p_result text
) returns uuid
language sql security definer set search_path = public as $$
  insert into public.renewal_events (deal_id, deal_name, action, acting_email, fields, prev_status, result)
  values (p_deal_id, p_deal_name, p_action, p_acting_email,
          coalesce(p_fields, '{}'::jsonb), p_prev_status, coalesce(p_result, 'ok'))
  returning id;
$$;

create or replace function public.renewal_events_recent(p_limit int default 50)
returns setof public.renewal_events
language sql security definer set search_path = public as $$
  select * from public.renewal_events order by created_at desc limit least(coalesce(p_limit, 50), 500);
$$;

create or replace function public.renewal_events_for_deal(p_deal_id text)
returns setof public.renewal_events
language sql security definer set search_path = public as $$
  select * from public.renewal_events where deal_id = p_deal_id order by created_at desc limit 100;
$$;

revoke all on function public.renewal_event_record(text, text, text, text, jsonb, text, text) from public;
grant execute on function public.renewal_event_record(text, text, text, text, jsonb, text, text) to anon;
revoke all on function public.renewal_events_recent(int) from public;
grant execute on function public.renewal_events_recent(int) to anon;
revoke all on function public.renewal_events_for_deal(text) from public;
grant execute on function public.renewal_events_for_deal(text) to anon;
