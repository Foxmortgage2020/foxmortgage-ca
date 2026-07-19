-- Client presentation layer (B8b, 2026-07-18) — FOXCA project skfeivzhqvrefnkqjwtj.
--
-- Three surfaces Michael composes in the deal room and PUBLISHES to a client's
-- own page: Scenarios (deterministic what-ifs), Offers (lender options with a
-- disclosed grade), and the Pre-approval letter. They share ONE storage model,
-- following the hardened client-links pattern EXACTLY (migrations 20260717150000
-- + 20260718160000):
--
--   * RLS on, NO policies, table grants REVOKED. The only surface is a set of
--     narrow security-definer functions.
--   * ADMIN-WRITE functions demand the operator secret (the second, server-held
--     factor from B7-P Task 0). The raw secret lives only in FOXCA_OPERATOR_SECRET;
--     this migration carries only its sha256 — the SAME secret as client-links, so
--     nothing new to provision. The sha lives in ONE private helper below.
--   * CLIENT-READ functions are keyed by the LINK TOKEN HASH, not a deal id. A
--     client page resolves its token to a link, then reads its published
--     presentation through the hash; the function re-validates the link (not
--     revoked, not expired) inside. So the public anon key cannot enumerate a
--     deal's published content by guessing Zoho ids — the token is the gate,
--     exactly as client_link_resolve is the gate for the status page.
--
-- SNAPSHOTS OVER REFERENCES. `figures`/`snapshot` hold what the client sees,
-- frozen at publish time. A later rate change never rewrites a page already seen.

create extension if not exists pgcrypto with schema extensions;

-- ── The operator-secret guard (ONE place; not anon-callable) ─────────────────
-- Security definer + revoked from every role means only the definer functions
-- below (running as the owner) can call it. The sha256 is the SAME client-links
-- carries, so FOXCA_OPERATOR_SECRET already unlocks it.
create or replace function public.client_presentation_secret_ok(p_operator_secret text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select p_operator_secret is not null
     and encode(extensions.digest(p_operator_secret, 'sha256'), 'hex')
         = '379d1a2d1117a157ebf255bc2f92a60b157e60bfc0cc99b5960b2f3788dc8915';
$$;
revoke all on function public.client_presentation_secret_ok(text) from public, anon, authenticated;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.client_scenarios (
  id uuid primary key default gen_random_uuid(),
  zoho_deal_id text not null,
  file_ref text,
  label text not null,
  inputs jsonb not null,        -- ScenarioInputs
  figures jsonb not null,       -- ScenarioFigures (frozen, engine-computed)
  inputs_hash text not null,    -- citation: sha256 of the inputs
  calc_version int not null,
  published boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists client_scenarios_deal_idx on public.client_scenarios (zoho_deal_id, created_at);
alter table public.client_scenarios enable row level security;
revoke all on public.client_scenarios from anon, authenticated, public;

create table if not exists public.client_offers (
  id uuid primary key default gen_random_uuid(),
  zoho_deal_id text not null,
  file_ref text,
  quote_id text not null,       -- the approved quote this was snapshotted from
  snapshot jsonb not null,      -- OfferSnapshot incl. the frozen grade
  published boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists client_offers_deal_idx on public.client_offers (zoho_deal_id, created_at);
alter table public.client_offers enable row level security;
revoke all on public.client_offers from anon, authenticated, public;

create table if not exists public.client_letters (
  id uuid primary key default gen_random_uuid(),
  zoho_deal_id text not null,
  file_ref text,
  snapshot jsonb not null,      -- LetterSnapshot (terms + identity block, frozen)
  rate_hold_expiry date not null,
  superseded_at timestamptz,    -- null = the current letter; re-minting supersedes
  created_by text not null,
  created_at timestamptz not null default now()
);
create index if not exists client_letters_deal_idx on public.client_letters (zoho_deal_id, created_at);
alter table public.client_letters enable row level security;
revoke all on public.client_letters from anon, authenticated, public;

-- ── Scenario functions ───────────────────────────────────────────────────────

-- Upsert: insert when p_id is null, update in place otherwise (keeping the
-- published flag). Editing re-freezes figures + inputs_hash.
create or replace function public.client_scenario_upsert(
  p_id uuid,
  p_zoho_deal_id text,
  p_file_ref text,
  p_label text,
  p_inputs jsonb,
  p_figures jsonb,
  p_inputs_hash text,
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
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.client_scenarios (zoho_deal_id, file_ref, label, inputs, figures, inputs_hash, calc_version, created_by)
    values (p_zoho_deal_id, p_file_ref, p_label, p_inputs, p_figures, p_inputs_hash, p_calc_version, p_created_by)
    returning id into v_id;
  else
    update public.client_scenarios
    set label = p_label, inputs = p_inputs, figures = p_figures,
        inputs_hash = p_inputs_hash, calc_version = p_calc_version, updated_at = now()
    where id = p_id
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke all on function public.client_scenario_upsert(uuid, text, text, text, jsonb, jsonb, text, int, text, text) from public, anon, authenticated;
grant execute on function public.client_scenario_upsert(uuid, text, text, text, jsonb, jsonb, text, int, text, text) to anon;

create or replace function public.client_scenario_set_published(p_id uuid, p_published boolean, p_operator_secret text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  update public.client_scenarios set published = p_published, updated_at = now() where id = p_id returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_scenario_set_published(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.client_scenario_set_published(uuid, boolean, text) to anon;

create or replace function public.client_scenario_delete(p_id uuid, p_operator_secret text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  delete from public.client_scenarios where id = p_id returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_scenario_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.client_scenario_delete(uuid, text) to anon;

-- Admin list: every scenario for a deal, published or not.
create or replace function public.client_scenarios_for_deal(p_zoho_deal_id text, p_operator_secret text)
returns setof public.client_scenarios
language plpgsql security definer set search_path = public
as $$
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query select * from public.client_scenarios where zoho_deal_id = p_zoho_deal_id order by created_at asc limit 50;
end;
$$;
revoke all on function public.client_scenarios_for_deal(text, text) from public, anon, authenticated;
grant execute on function public.client_scenarios_for_deal(text, text) to anon;

-- ── Offer functions ──────────────────────────────────────────────────────────

create or replace function public.client_offer_create(
  p_zoho_deal_id text, p_file_ref text, p_quote_id text, p_snapshot jsonb, p_created_by text, p_operator_secret text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  insert into public.client_offers (zoho_deal_id, file_ref, quote_id, snapshot, created_by)
  values (p_zoho_deal_id, p_file_ref, p_quote_id, p_snapshot, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_offer_create(text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.client_offer_create(text, text, text, jsonb, text, text) to anon;

create or replace function public.client_offer_set_published(p_id uuid, p_published boolean, p_operator_secret text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  update public.client_offers set published = p_published where id = p_id returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_offer_set_published(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.client_offer_set_published(uuid, boolean, text) to anon;

create or replace function public.client_offer_delete(p_id uuid, p_operator_secret text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  delete from public.client_offers where id = p_id returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_offer_delete(uuid, text) from public, anon, authenticated;
grant execute on function public.client_offer_delete(uuid, text) to anon;

create or replace function public.client_offers_for_deal(p_zoho_deal_id text, p_operator_secret text)
returns setof public.client_offers
language plpgsql security definer set search_path = public
as $$
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query select * from public.client_offers where zoho_deal_id = p_zoho_deal_id order by created_at asc limit 50;
end;
$$;
revoke all on function public.client_offers_for_deal(text, text) from public, anon, authenticated;
grant execute on function public.client_offers_for_deal(text, text) to anon;

-- ── Letter functions (append-only; re-mint supersedes) ───────────────────────

create or replace function public.client_letter_mint(
  p_zoho_deal_id text, p_file_ref text, p_snapshot jsonb, p_rate_hold_expiry date, p_created_by text, p_operator_secret text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  -- Supersede any current letter for this deal, then insert the new one.
  update public.client_letters set superseded_at = now()
    where zoho_deal_id = p_zoho_deal_id and superseded_at is null;
  insert into public.client_letters (zoho_deal_id, file_ref, snapshot, rate_hold_expiry, created_by)
  values (p_zoho_deal_id, p_file_ref, p_snapshot, p_rate_hold_expiry, p_created_by)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_letter_mint(text, text, jsonb, date, text, text) from public, anon, authenticated;
grant execute on function public.client_letter_mint(text, text, jsonb, date, text, text) to anon;

-- Retract the current letter with no replacement (supersede-with-nothing).
create or replace function public.client_letter_supersede(p_id uuid, p_operator_secret text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  update public.client_letters set superseded_at = coalesce(superseded_at, now()) where id = p_id returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.client_letter_supersede(uuid, text) from public, anon, authenticated;
grant execute on function public.client_letter_supersede(uuid, text) to anon;

create or replace function public.client_letters_for_deal(p_zoho_deal_id text, p_operator_secret text)
returns setof public.client_letters
language plpgsql security definer set search_path = public
as $$
begin
  if not public.client_presentation_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query select * from public.client_letters where zoho_deal_id = p_zoho_deal_id order by created_at desc limit 50;
end;
$$;
revoke all on function public.client_letters_for_deal(text, text) from public, anon, authenticated;
grant execute on function public.client_letters_for_deal(text, text) to anon;

-- ── Client-read functions (token-hash keyed; NO secret) ──────────────────────
-- Each resolves the token hash to a live link (not revoked, not expired) and
-- returns only PUBLISHED content for that link's deal. No deal id crosses the
-- boundary, so the public anon key cannot enumerate.

create or replace function public.client_scenarios_for_token(p_token_hash text)
returns table (label text, inputs jsonb, figures jsonb, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select s.label, s.inputs, s.figures, s.created_at
  from public.client_links l
  join public.client_scenarios s on s.zoho_deal_id = l.zoho_deal_id and s.published
  where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
  order by s.created_at asc
  limit 20;
$$;
revoke all on function public.client_scenarios_for_token(text) from public;
grant execute on function public.client_scenarios_for_token(text) to anon;

create or replace function public.client_offers_for_token(p_token_hash text)
returns table (snapshot jsonb, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select o.snapshot, o.created_at
  from public.client_links l
  join public.client_offers o on o.zoho_deal_id = l.zoho_deal_id and o.published
  where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
  order by o.created_at asc
  limit 20;
$$;
revoke all on function public.client_offers_for_token(text) from public;
grant execute on function public.client_offers_for_token(text) to anon;

-- The latest non-superseded letter (0 or 1). Expired letters are still returned
-- so the client page can say "your pre-approval has expired"; a superseded one
-- is not (it has been replaced).
create or replace function public.client_letter_for_token(p_token_hash text)
returns table (snapshot jsonb, rate_hold_expiry date, created_at timestamptz)
language sql security definer set search_path = public
as $$
  select ltr.snapshot, ltr.rate_hold_expiry, ltr.created_at
  from public.client_links l
  join public.client_letters ltr on ltr.zoho_deal_id = l.zoho_deal_id and ltr.superseded_at is null
  where l.token_hash = p_token_hash and l.revoked_at is null and l.expires_at > now()
  order by ltr.created_at desc
  limit 1;
$$;
revoke all on function public.client_letter_for_token(text) from public;
grant execute on function public.client_letter_for_token(text) to anon;
