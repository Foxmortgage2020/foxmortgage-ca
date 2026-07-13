-- Savings-analysis log: every savings determination that reaches a deliverable
-- surface (the Opportunities board, the client savings PDF) is recorded with
-- its calc version, an inputs hash over everything that affects a printed
-- figure, the full replayable inputs, the quotes used with their sheet dates,
-- and the figures rendered — so a document handed to a client can always be
-- reproduced (guardrails 1 and 5). APPEND-ONLY by construction: RLS on, NO
-- policies, table grants revoked; the only surface is the narrow
-- security-definer functions below, and there is no update or delete function.
-- Mistaken entries are superseded by later entries, never edited.
-- Applied live to the foxmortgage-ca project (skfeivzhqvrefnkqjwtj) 2026-07-13.

create table if not exists public.savings_analysis_log (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  upload_id uuid,
  surface text not null, -- 'pdf' | 'board'
  calc_version integer not null,
  inputs_hash text not null,
  inputs jsonb not null default '{}'::jsonb,
  quotes jsonb not null default '[]'::jsonb, -- quote identities used, with sheet dates
  prime_as_of text,
  bucket text not null,
  figures jsonb not null default '{}'::jsonb, -- the headline figures rendered
  cross_family_approved boolean not null default false,
  acting_email text not null,
  created_at timestamptz not null default now()
);
create index if not exists savings_analysis_log_recent_idx on public.savings_analysis_log (created_at desc);
create index if not exists savings_analysis_log_household_idx on public.savings_analysis_log (household_id, created_at desc);
create index if not exists savings_analysis_log_dedupe_idx on public.savings_analysis_log (household_id, surface, calc_version, inputs_hash);

alter table public.savings_analysis_log enable row level security;
revoke all on public.savings_analysis_log from anon, authenticated, public;

-- One entry. p_dedupe true (the board path) skips the insert when an
-- identical determination (household + surface + version + hash) already
-- exists, so a page render is idempotent; the PDF path passes false because
-- every generated client document is its own event. Dedupe is BEST-EFFORT
-- (check-then-insert on a non-unique index): two concurrent board renders can
-- rarely double-insert, which is harmless on an append-only record.
create or replace function public.savings_analysis_record(p_entry jsonb, p_dedupe boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if p_dedupe and exists (
    select 1 from public.savings_analysis_log
    where household_id = p_entry->>'household_id'
      and surface = p_entry->>'surface'
      and calc_version = (p_entry->>'calc_version')::integer
      and inputs_hash = p_entry->>'inputs_hash'
  ) then
    return null;
  end if;
  insert into public.savings_analysis_log
    (household_id, upload_id, surface, calc_version, inputs_hash, inputs, quotes, prime_as_of, bucket, figures, cross_family_approved, acting_email)
  values (
    p_entry->>'household_id',
    nullif(p_entry->>'upload_id', '')::uuid,
    p_entry->>'surface',
    (p_entry->>'calc_version')::integer,
    p_entry->>'inputs_hash',
    coalesce(p_entry->'inputs', '{}'::jsonb),
    coalesce(p_entry->'quotes', '[]'::jsonb),
    p_entry->>'prime_as_of',
    p_entry->>'bucket',
    coalesce(p_entry->'figures', '{}'::jsonb),
    coalesce((p_entry->>'cross_family_approved')::boolean, false),
    p_entry->>'acting_email'
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- Batch for the board render: every entry deduped, returns how many inserted.
create or replace function public.savings_analysis_record_batch(p_entries jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_entry jsonb;
  v_count integer := 0;
begin
  for v_entry in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if public.savings_analysis_record(v_entry, true) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.savings_analysis_recent(p_limit integer default 50)
returns setof public.savings_analysis_log language sql security definer set search_path = public as $$
  select * from public.savings_analysis_log order by created_at desc limit least(coalesce(p_limit, 50), 500);
$$;

revoke all on function public.savings_analysis_record(jsonb, boolean) from public;
grant execute on function public.savings_analysis_record(jsonb, boolean) to anon;
revoke all on function public.savings_analysis_record_batch(jsonb) from public;
grant execute on function public.savings_analysis_record_batch(jsonb) to anon;
revoke all on function public.savings_analysis_recent(integer) from public;
grant execute on function public.savings_analysis_recent(integer) to anon;
