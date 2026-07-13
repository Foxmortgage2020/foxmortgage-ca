-- Michael's manual comparable overrides (Task 3) + savings_analysis_log
-- hardening (Task 4). House posture: RLS on, NO policies, table grants
-- revoked; the only surface is the narrow security-definer functions.
-- Overrides retire, never delete. The log becomes append-only BY PHYSICS:
-- BEFORE UPDATE OR DELETE (and TRUNCATE) triggers raise, binding even
-- service_role — until now append-only was grants convention only.
-- Applied live to the foxmortgage-ca project (skfeivzhqvrefnkqjwtj) 2026-07-13.

-- ── Overrides ────────────────────────────────────────────────────────────────
create table if not exists public.smm_overrides (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  upload_id uuid,
  override_type text not null check (override_type in ('book_quote', 'desk_rate')),
  comparable jsonb not null, -- the server-built Comparable the analysis consumes
  source_note text,          -- desk rates carry their source framing
  reason text not null,      -- every override is a documented suitability decision
  acting_email text not null,
  status text not null default 'active',
  retired_at timestamptz,
  retired_by text,
  created_at timestamptz not null default now()
);
create index if not exists smm_overrides_household_idx on public.smm_overrides (household_id, status, created_at desc);

alter table public.smm_overrides enable row level security;
revoke all on public.smm_overrides from anon, authenticated, public;

-- Setting an override retires any prior active one for the household
-- (retire-not-delete; the history stays).
create or replace function public.smm_override_set(
  p_household text,
  p_upload uuid,
  p_type text,
  p_comparable jsonb,
  p_source_note text,
  p_reason text,
  p_email text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  update public.smm_overrides
    set status = 'retired', retired_at = now(), retired_by = p_email
    where household_id = p_household and status = 'active';
  insert into public.smm_overrides (household_id, upload_id, override_type, comparable, source_note, reason, acting_email)
  values (p_household, p_upload, p_type, p_comparable, p_source_note, p_reason, p_email)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.smm_override_retire(p_id uuid, p_email text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  update public.smm_overrides
    set status = 'retired', retired_at = now(), retired_by = p_email
    where id = p_id and status = 'active';
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

create or replace function public.smm_overrides_active()
returns setof public.smm_overrides language sql security definer set search_path = public as $$
  select * from public.smm_overrides where status = 'active' order by created_at desc limit 500;
$$;

revoke all on function public.smm_override_set(text, uuid, text, jsonb, text, text, text) from public;
grant execute on function public.smm_override_set(text, uuid, text, jsonb, text, text, text) to anon;
revoke all on function public.smm_override_retire(uuid, text) from public;
grant execute on function public.smm_override_retire(uuid, text) to anon;
revoke all on function public.smm_overrides_active() from public;
grant execute on function public.smm_overrides_active() to anon;

-- ── savings_analysis_log: the override column ───────────────────────────────
alter table public.savings_analysis_log add column if not exists override jsonb;

-- Same signature; now inserts the override.
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
    (household_id, upload_id, surface, calc_version, inputs_hash, inputs, quotes, prime_as_of, bucket, figures, cross_family_approved, override, acting_email)
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
    nullif(p_entry->'override', 'null'::jsonb),
    p_entry->>'acting_email'
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Append-only by physics ───────────────────────────────────────────────────
create or replace function public.savings_analysis_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'savings_analysis_log is append-only: rows are superseded by later entries, never edited or deleted';
end;
$$;

drop trigger if exists savings_analysis_log_no_update_delete on public.savings_analysis_log;
create trigger savings_analysis_log_no_update_delete
  before update or delete on public.savings_analysis_log
  for each row execute function public.savings_analysis_log_immutable();

drop trigger if exists savings_analysis_log_no_truncate on public.savings_analysis_log;
create trigger savings_analysis_log_no_truncate
  before truncate on public.savings_analysis_log
  for each statement execute function public.savings_analysis_log_immutable();
