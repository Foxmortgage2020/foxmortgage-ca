-- Saved rate scenarios (Rates v3, Part 5). Michael runs the same handful of
-- deal shapes repeatedly (typical insured purchase, conventional refinance,
-- insured switch); this stores them per user so he can name and recall one in
-- a tap. Same house posture as every FOXCA feature: RLS on, NO table policies,
-- direct table grants revoked, and the only reachable surface is the narrow
-- SECURITY DEFINER functions below (granted to anon). Nothing hard-deletes —
-- a saved scenario retires (status flips), history is retained. Twin of
-- migration 20260710220000 (notifications) for the store scaffold and the
-- 20260710120000 (compliance) retire pattern.

create table if not exists public.saved_scenarios (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text not null,
  name text not null,
  -- The scenario as its URL query string (scenarioToParams output), so recall
  -- is a straight apply-to-URL. No borrower data lives here; the optional
  -- from_file is a file reference only, kept out of the name by the client.
  params text not null,
  from_file text,
  status text not null default 'active' check (status in ('active', 'retired')),
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  retired_by text
);

create index if not exists saved_scenarios_user_idx
  on public.saved_scenarios (clerk_user_id, created_at desc);

-- ─── Lockdown ───────────────────────────────────────────────────────────────
alter table public.saved_scenarios enable row level security;
revoke all on table public.saved_scenarios from anon, authenticated;

-- ─── Create ─────────────────────────────────────────────────────────────────
create or replace function public.saved_scenario_create(
  p_clerk_user_id text,
  p_name text,
  p_params text,
  p_from_file text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(trim(p_clerk_user_id), '') = '' then
    raise exception 'clerk_user_id is required';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name is required';
  end if;
  if coalesce(trim(p_params), '') = '' then
    raise exception 'params are required';
  end if;
  insert into saved_scenarios (clerk_user_id, name, params, from_file)
  values (
    trim(p_clerk_user_id),
    left(trim(p_name), 80),
    left(trim(p_params), 1000),
    nullif(left(trim(coalesce(p_from_file, '')), 40), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ─── List (active only, per user, newest first) ─────────────────────────────
create or replace function public.saved_scenarios_list_for_user(p_clerk_user_id text)
returns table (id uuid, name text, params text, from_file text, created_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select s.id, s.name, s.params, s.from_file, s.created_at
  from saved_scenarios s
  where s.clerk_user_id = p_clerk_user_id and s.status = 'active'
  order by s.created_at desc
  limit 50;
$$;

-- ─── Retire (soft delete, scoped to the owner) ──────────────────────────────
create or replace function public.saved_scenario_retire(
  p_id uuid,
  p_clerk_user_id text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  update saved_scenarios
  set status = 'retired', retired_at = now(), retired_by = p_clerk_user_id
  where id = p_id and clerk_user_id = p_clerk_user_id and status = 'active'
  returning id into v_id;
  return v_id is not null;
end;
$$;

-- ─── Function grants (revoke from public, execute to anon only) ─────────────
revoke all on function public.saved_scenario_create(text, text, text, text) from public;
revoke all on function public.saved_scenarios_list_for_user(text) from public;
revoke all on function public.saved_scenario_retire(uuid, text) from public;

grant execute on function public.saved_scenario_create(text, text, text, text) to anon;
grant execute on function public.saved_scenarios_list_for_user(text) to anon;
grant execute on function public.saved_scenario_retire(uuid, text) to anon;
