-- The qualification explorer (B9, 2026-07-18) — FOXCA project skfeivzhqvrefnkqjwtj.
--
-- Michael reviews a baseline the platform proposes from a file's current truth,
-- edits any value, and PUBLISHES it to the client's own page, where a
-- "Can I afford it?" tool lets the client move the price, down payment, taxes,
-- and condo fees and watch the numbers move. The baseline he publishes is the
-- LOCKED panel (income, debts, heat, rate, amortization) plus the starting
-- values for the client's four inputs, frozen as one snapshot.
--
-- Same storage posture as the client presentation layer (migration
-- 20260718180000), EXACTLY:
--   * RLS on, NO policies, table grants REVOKED. The only surface is narrow
--     security-definer functions.
--   * ADMIN-WRITE functions demand the operator secret, checked by the shared
--     guard public.foxca_operator_secret_ok (the FOXCA-wide hardening's one
--     helper, migration 20260718190000). NO new secret, NO new sha256.
--   * The CLIENT-READ function is keyed by the LINK TOKEN HASH, not a deal id.
--     It joins client_links (not revoked, not expired) and returns only the
--     PUBLISHED baseline. No deal id crosses the anon boundary, so the public
--     key cannot enumerate.
--
-- SNAPSHOTS OVER REFERENCES. `baseline` holds what the client sees, frozen at
-- publish time; a later change to the file's income or rate never rewrites the
-- locked panel a client already saw. Per-field `sources` is admin-only
-- provenance (proposed-from-file vs default vs edited-by-Michael) and never
-- reaches the client read.

create extension if not exists pgcrypto with schema extensions;

-- ── Table ────────────────────────────────────────────────────────────────────

create table if not exists public.client_qualification_baselines (
  id uuid primary key default gen_random_uuid(),
  zoho_deal_id text not null,
  file_ref text,
  baseline jsonb not null,               -- QualificationBaseline (frozen)
  sources jsonb not null default '{}'::jsonb, -- per-field provenance (admin only)
  baseline_hash text not null,           -- citation: sha256 of {v, baseline}
  calc_version int not null,
  published boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_qualification_deal_idx
  on public.client_qualification_baselines (zoho_deal_id, created_at);
alter table public.client_qualification_baselines enable row level security;
revoke all on public.client_qualification_baselines from anon, authenticated, public;

-- ── Admin functions (operator-secret gated) ──────────────────────────────────

-- Upsert: insert when p_id is null, update in place otherwise (keeping the
-- published flag). Editing re-freezes baseline + baseline_hash + sources.
create or replace function public.client_qualification_upsert(
  p_id uuid,
  p_zoho_deal_id text,
  p_file_ref text,
  p_baseline jsonb,
  p_sources jsonb,
  p_baseline_hash text,
  p_calc_version int,
  p_created_by text,
  p_operator_secret text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.client_qualification_baselines
      (zoho_deal_id, file_ref, baseline, sources, baseline_hash, calc_version, created_by)
    values (p_zoho_deal_id, p_file_ref, p_baseline, p_sources, p_baseline_hash, p_calc_version, p_created_by)
    returning id into v_id;
  else
    update public.client_qualification_baselines
    set baseline = p_baseline, sources = p_sources, baseline_hash = p_baseline_hash,
        calc_version = p_calc_version, updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.client_qualification_upsert(uuid, text, text, jsonb, jsonb, text, int, text, text) from public, anon, authenticated;
grant execute on function public.client_qualification_upsert(uuid, text, text, jsonb, jsonb, text, int, text, text) to anon;

-- Publish exactly one baseline per deal: publishing this row unpublishes any
-- sibling, so the client always sees the single current baseline. Unpublishing
-- (p_published false) simply removes the section.
create or replace function public.client_qualification_set_published(p_id uuid, p_published boolean, p_operator_secret text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_published then
    update public.client_qualification_baselines
      set published = false, updated_at = now()
      where zoho_deal_id = (select zoho_deal_id from public.client_qualification_baselines where id = p_id)
        and id <> p_id and published;
  end if;
  update public.client_qualification_baselines set published = p_published, updated_at = now()
    where id = p_id returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_qualification_set_published(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.client_qualification_set_published(uuid, boolean, text) to anon;

create or replace function public.client_qualification_delete(p_id uuid, p_operator_secret text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  delete from public.client_qualification_baselines where id = p_id returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_qualification_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.client_qualification_delete(uuid, text) to anon;

-- Admin list: every baseline for a deal, published or not.
create or replace function public.client_qualification_for_deal(p_zoho_deal_id text, p_operator_secret text)
returns setof public.client_qualification_baselines
language plpgsql security definer set search_path = public
as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query select * from public.client_qualification_baselines
    where zoho_deal_id = p_zoho_deal_id order by created_at desc limit 50;
end;
$$;
revoke all on function public.client_qualification_for_deal(text, text) from public, anon, authenticated;
grant execute on function public.client_qualification_for_deal(text, text) to anon;

-- ── Client read (token-hash keyed; NO secret) ────────────────────────────────
-- The most recent PUBLISHED baseline for the link's deal. `sources` is NOT
-- returned — provenance is admin metadata, never a client-facing figure.
create or replace function public.client_qualification_for_token(p_token_hash text)
returns table (baseline jsonb, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select q.baseline, q.created_at
  from public.client_links l
  join public.client_qualification_baselines q on q.zoho_deal_id = l.zoho_deal_id and q.published
  where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
  order by q.created_at desc
  limit 1;
$$;
revoke all on function public.client_qualification_for_token(text) from public;
grant execute on function public.client_qualification_for_token(text) to anon;
