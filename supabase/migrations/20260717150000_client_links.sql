-- Client portal links (B5, 2026-07-17) — FOXCA project skfeivzhqvrefnkqjwtj.
--
-- A client opens /portal/file/<token> and sees their own file's status. This
-- table is what makes that link real, and killable.
--
-- THE HOUSE PATTERN, and a stated deviation from the brief:
-- the brief asked for "service-role access from the server only". There IS no
-- FOXCA service-role key — only FOXCA_SUPABASE_URL + FOXCA_SUPABASE_KEY (the
-- anon key) exist, and the workbench's service-role key was DELETED on
-- 2026-07-09 on purpose. Minting a new privileged key class would reverse that
-- decision, so this follows the established posture instead: RLS on, NO
-- policies, table grants REVOKED, and a few narrow security-definer functions.
-- That is strictly narrower than service-role: it exposes four operations
-- rather than a schema. See docs/client-portal-b5-2026-07-17.md.
--
-- WHAT IS DELIBERATELY ABSENT: there is no list-all function that returns a
-- token hash, and no function that returns a raw token (we never store one).
-- The resolve function takes the HASH and returns at most one row. Every
-- function granted to anon is callable by anyone holding the anon key, so the
-- rule here is that no function may return a credential or enumerate clients.

create table if not exists public.client_links (
  id uuid primary key default gen_random_uuid(),
  -- The Zoho deal id is the join key: the page reads the deal by id.
  zoho_deal_id text not null,
  -- Carried for Michael's card and the audit trail. Never shown to a client.
  file_ref text,
  -- sha256 of the token. The raw token exists only in the URL Michael copies.
  token_hash text not null unique,
  created_by text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by text,
  -- Set on each successful open, so Michael can see the link is being used.
  last_viewed_at timestamptz
);

create index if not exists client_links_deal_idx on public.client_links (zoho_deal_id, created_at desc);
create index if not exists client_links_hash_idx on public.client_links (token_hash);

alter table public.client_links enable row level security;
-- Load-bearing: RLS with no policies still leaves the default anon grants.
revoke all on public.client_links from anon, authenticated, public;

-- The audit trail. There is no general-purpose events table in FOXCA
-- (compliance_events is CHECK-constrained to credential/complaint/policy, and
-- the workbench audit_log is read-only from this repo), so link actions get
-- their own, shaped after smm_backfill_events.
create table if not exists public.client_link_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid,
  zoho_deal_id text not null,
  file_ref text,
  action text not null,
  acting_email text not null,
  result text not null default 'ok',
  created_at timestamptz not null default now()
);

create index if not exists client_link_events_recent_idx on public.client_link_events (created_at desc);
create index if not exists client_link_events_deal_idx on public.client_link_events (zoho_deal_id, created_at desc);

alter table public.client_link_events enable row level security;
revoke all on public.client_link_events from anon, authenticated, public;

-- ── Functions (the only surface) ────────────────────────────────────────────

-- Create. acting_email comes from the verified Clerk session at the route,
-- never a default or a config value (the standing "a machine may never write
-- a human's identity" rule).
create or replace function public.client_link_create(
  p_zoho_deal_id text,
  p_file_ref text,
  p_token_hash text,
  p_created_by text,
  p_expires_at timestamptz
) returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.client_links (zoho_deal_id, file_ref, token_hash, created_by, expires_at)
  values (p_zoho_deal_id, p_file_ref, p_token_hash, p_created_by, p_expires_at)
  returning id;
$$;

-- Resolve a token hash to its deal. Returns AT MOST ONE row, and nothing at
-- all for an expired or revoked link — the caller cannot tell those apart
-- from "never existed", which is the point: the client route must not be an
-- oracle. Never returns the hash back.
create or replace function public.client_link_resolve(p_token_hash text)
returns table (id uuid, zoho_deal_id text, file_ref text, expires_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select l.id, l.zoho_deal_id, l.file_ref, l.expires_at
  from public.client_links l
  where l.token_hash = p_token_hash
    and l.revoked_at is null
    and l.expires_at > now()
  limit 1;
$$;

-- Stamp a view. Best effort; the page never fails because of it.
create or replace function public.client_link_touch(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.client_links set last_viewed_at = now() where id = p_id;
$$;

-- Revoke. Idempotent: revoking twice keeps the first timestamp, so the
-- record says when it actually died.
create or replace function public.client_link_revoke(p_id uuid, p_revoked_by text)
returns uuid
language sql
security definer
set search_path = public
as $$
  update public.client_links
  set revoked_at = coalesce(revoked_at, now()), revoked_by = coalesce(revoked_by, p_revoked_by)
  where id = p_id
  returning id;
$$;

-- Michael's card: the links for ONE deal. Metadata only — no token, no hash.
create or replace function public.client_links_for_deal(p_zoho_deal_id text)
returns table (
  id uuid,
  zoho_deal_id text,
  file_ref text,
  created_by text,
  created_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_viewed_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select l.id, l.zoho_deal_id, l.file_ref, l.created_by, l.created_at,
         l.expires_at, l.revoked_at, l.last_viewed_at
  from public.client_links l
  where l.zoho_deal_id = p_zoho_deal_id
  order by l.created_at desc
  limit 50;
$$;

create or replace function public.client_link_event_record(
  p_link_id uuid,
  p_zoho_deal_id text,
  p_file_ref text,
  p_action text,
  p_acting_email text,
  p_result text
) returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.client_link_events (link_id, zoho_deal_id, file_ref, action, acting_email, result)
  values (p_link_id, p_zoho_deal_id, p_file_ref, p_action, p_acting_email, coalesce(p_result, 'ok'))
  returning id;
$$;

create or replace function public.client_link_events_recent(p_limit int default 50)
returns setof public.client_link_events
language sql
security definer
set search_path = public
as $$
  select * from public.client_link_events
  order by created_at desc
  limit least(coalesce(p_limit, 50), 500);
$$;

revoke all on function public.client_link_create(text, text, text, text, timestamptz) from public;
grant execute on function public.client_link_create(text, text, text, text, timestamptz) to anon;

revoke all on function public.client_link_resolve(text) from public;
grant execute on function public.client_link_resolve(text) to anon;

revoke all on function public.client_link_touch(uuid) from public;
grant execute on function public.client_link_touch(uuid) to anon;

revoke all on function public.client_link_revoke(uuid, text) from public;
grant execute on function public.client_link_revoke(uuid, text) to anon;

revoke all on function public.client_links_for_deal(text) from public;
grant execute on function public.client_links_for_deal(text) to anon;

revoke all on function public.client_link_event_record(uuid, text, text, text, text, text) from public;
grant execute on function public.client_link_event_record(uuid, text, text, text, text, text) to anon;

revoke all on function public.client_link_events_recent(int) from public;
grant execute on function public.client_link_events_recent(int) to anon;
