-- Client-link operator secret (B7-P Task 0, 2026-07-18) — FOXCA project skfeivzhqvrefnkqjwtj.
--
-- THE HOLE THIS CLOSES. The seven client_link_* functions from migration
-- 20260717150000 are each `grant execute ... to anon`. The FOXCA anon key
-- (FOXCA_SUPABASE_KEY) is NOT a secret — it is shared with public form-intake —
-- so anyone holding it was a de facto service account for client links: they
-- could mint links to any deal id, enumerate a deal's link metadata, or revoke
-- links. The client-flow half (resolve, touch) is already safe because a valid
-- token hash IS its secret; the ADMIN half was not.
--
-- THE FIX. A second, server-held factor. Each admin-side function gains a
-- required p_operator_secret argument and refuses (permission denied) unless it
-- matches a value the server holds in FOXCA_OPERATOR_SECRET (a new server-only
-- env var, never NEXT_PUBLIC). The raw secret lives ONLY in the env; this
-- migration carries only its SHA-256 (a hash of a 256-bit random secret is not
-- reversible, so it is safe in this public repo). The function hashes the
-- passed secret and compares — the raw value never appears here.
--
-- SCOPE, per the brief: harden create, revoke, links_for_deal, events_recent.
-- LEAVE OPEN: resolve + touch (client-flow — the public /portal/file/[token]
-- page holds only the anon key and cannot supply a server secret) AND
-- event_record (the brief keeps it anon-callable; see the report's residual note).
--
-- OVERLOAD TRAP. `create or replace function` with a new arg list creates a
-- SEPARATE overload; the old un-secured signature would stay callable and
-- defeat the whole fix. So each hardened function DROPS its old signature first.

create extension if not exists pgcrypto with schema extensions;

-- ── create (hardened) ────────────────────────────────────────────────────────
drop function if exists public.client_link_create(text, text, text, text, timestamptz);
create function public.client_link_create(
  p_zoho_deal_id text,
  p_file_ref text,
  p_token_hash text,
  p_created_by text,
  p_expires_at timestamptz,
  p_operator_secret text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_operator_secret is null
     or encode(extensions.digest(p_operator_secret, 'sha256'), 'hex')
        <> '379d1a2d1117a157ebf255bc2f92a60b157e60bfc0cc99b5960b2f3788dc8915'
  then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  insert into public.client_links (zoho_deal_id, file_ref, token_hash, created_by, expires_at)
  values (p_zoho_deal_id, p_file_ref, p_token_hash, p_created_by, p_expires_at)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_link_create(text, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.client_link_create(text, text, text, text, timestamptz, text) to anon;

-- ── revoke (hardened) ────────────────────────────────────────────────────────
drop function if exists public.client_link_revoke(uuid, text);
create function public.client_link_revoke(
  p_id uuid,
  p_revoked_by text,
  p_operator_secret text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if p_operator_secret is null
     or encode(extensions.digest(p_operator_secret, 'sha256'), 'hex')
        <> '379d1a2d1117a157ebf255bc2f92a60b157e60bfc0cc99b5960b2f3788dc8915'
  then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  update public.client_links
  set revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, p_revoked_by)
  where id = p_id
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_link_revoke(uuid, text, text) from public, anon, authenticated;
grant execute on function public.client_link_revoke(uuid, text, text) to anon;

-- ── links_for_deal (hardened) ────────────────────────────────────────────────
drop function if exists public.client_links_for_deal(text);
create function public.client_links_for_deal(
  p_zoho_deal_id text,
  p_operator_secret text
) returns table (
  id uuid,
  zoho_deal_id text,
  file_ref text,
  created_by text,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_viewed_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_operator_secret is null
     or encode(extensions.digest(p_operator_secret, 'sha256'), 'hex')
        <> '379d1a2d1117a157ebf255bc2f92a60b157e60bfc0cc99b5960b2f3788dc8915'
  then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query
    select l.id, l.zoho_deal_id, l.file_ref, l.created_by, l.created_at,
           l.expires_at, l.revoked_at, l.last_viewed_at
    from public.client_links l
    where l.zoho_deal_id = p_zoho_deal_id
    order by l.created_at desc
    limit 50;
end;
$$;
revoke all on function public.client_links_for_deal(text, text) from public, anon, authenticated;
grant execute on function public.client_links_for_deal(text, text) to anon;

-- ── events_recent (hardened; currently no store caller, defensive) ───────────
drop function if exists public.client_link_events_recent(int);
create function public.client_link_events_recent(
  p_operator_secret text,
  p_limit int default 50
) returns setof public.client_link_events
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_operator_secret is null
     or encode(extensions.digest(p_operator_secret, 'sha256'), 'hex')
        <> '379d1a2d1117a157ebf255bc2f92a60b157e60bfc0cc99b5960b2f3788dc8915'
  then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query
    select * from public.client_link_events
    order by created_at desc
    limit least(coalesce(p_limit, 50), 500);
end;
$$;
revoke all on function public.client_link_events_recent(text, int) from public, anon, authenticated;
grant execute on function public.client_link_events_recent(text, int) to anon;

-- UNCHANGED (client-flow, no secret): client_link_resolve(text),
-- client_link_touch(uuid), client_link_event_record(uuid, text, text, text, text, text).
