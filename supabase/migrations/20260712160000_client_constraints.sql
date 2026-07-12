-- Client lender constraints + restricted-product pin confirmations (the
-- lender-eligibility-and-constraints session, 2026-07-12). Per-client rules a
-- rate sheet never knows (excluded / required / preferred, each with a reason),
-- and the recorded confirmations when Michael pins a restricted product for a
-- client. House pattern: RLS on, NO policies, table grants revoked; the ONLY
-- surface is the narrow security-definer functions granted to anon. Nothing
-- deletes — a constraint retires with its history; a client who changes their
-- mind is a fact worth keeping.
-- Applied live to the foxmortgage-ca project (skfeivzhqvrefnkqjwtj) 2026-07-12.

create table if not exists public.client_constraints (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,          -- Zoho contact id, household id, or file ref
  lender_slug text not null,
  lender_label text,
  constraint_type text not null check (constraint_type in ('excluded','required','preferred')),
  reason text not null,              -- the reason is the point, never blank
  acting_email text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by text
);
create index if not exists client_constraints_client_idx on public.client_constraints (client_key, created_at desc);

-- A recorded confirmation that Michael pinned a restricted product for a client
-- and confirms the client meets the named requirement. Travels with the file; an
-- unconfirmed restricted product cannot reach a client PDF.
create table if not exists public.pin_confirmations (
  id uuid primary key default gen_random_uuid(),
  client_key text not null,
  quote_id text not null,            -- rate_quotes id (or offer id)
  lender_slug text,
  requirement text not null,         -- the requirement code confirmed (physician, banking_bundle, ...)
  requirement_text text,             -- the plain-language sentence confirmed
  acting_email text not null,
  created_at timestamptz not null default now(),
  retired_at timestamptz
);
create index if not exists pin_confirmations_client_idx on public.pin_confirmations (client_key, created_at desc);

alter table public.client_constraints enable row level security;
alter table public.pin_confirmations enable row level security;
revoke all on public.client_constraints from anon, authenticated, public;
revoke all on public.pin_confirmations from anon, authenticated, public;

create or replace function public.client_constraint_add(
  p_client text, p_lender text, p_label text, p_type text, p_reason text, p_email text
) returns uuid language sql security definer set search_path = public as $$
  insert into public.client_constraints (client_key, lender_slug, lender_label, constraint_type, reason, acting_email)
  values (p_client, p_lender, p_label, p_type, p_reason, p_email) returning id;
$$;

create or replace function public.client_constraint_retire(p_id uuid, p_email text)
returns void language sql security definer set search_path = public as $$
  update public.client_constraints set retired_at = now(), retired_by = p_email
  where id = p_id and retired_at is null;
$$;

create or replace function public.client_constraints_for(p_client text)
returns setof public.client_constraints language sql security definer set search_path = public as $$
  select * from public.client_constraints where client_key = p_client order by created_at desc;
$$;

create or replace function public.pin_confirmation_add(
  p_client text, p_quote text, p_lender text, p_requirement text, p_requirement_text text, p_email text
) returns uuid language sql security definer set search_path = public as $$
  insert into public.pin_confirmations (client_key, quote_id, lender_slug, requirement, requirement_text, acting_email)
  values (p_client, p_quote, p_lender, p_requirement, p_requirement_text, p_email) returning id;
$$;

create or replace function public.pin_confirmations_for(p_client text)
returns setof public.pin_confirmations language sql security definer set search_path = public as $$
  select * from public.pin_confirmations where client_key = p_client and retired_at is null order by created_at desc;
$$;

revoke all on function public.client_constraint_add(text, text, text, text, text, text) from public;
grant execute on function public.client_constraint_add(text, text, text, text, text, text) to anon;
revoke all on function public.client_constraint_retire(uuid, text) from public;
grant execute on function public.client_constraint_retire(uuid, text) to anon;
revoke all on function public.client_constraints_for(text) from public;
grant execute on function public.client_constraints_for(text) to anon;
revoke all on function public.pin_confirmation_add(text, text, text, text, text, text) from public;
grant execute on function public.pin_confirmation_add(text, text, text, text, text, text) to anon;
revoke all on function public.pin_confirmations_for(text) from public;
grant execute on function public.pin_confirmations_for(text) to anon;
