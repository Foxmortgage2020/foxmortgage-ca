-- Session 9: notification center (Part 2). Practice-side notifications
-- derived from signals the portal already computes, with per-user read
-- state and per-category preferences.
--
-- Same posture as the compliance, agent, and people migrations: RLS on
-- with NO table policies AND direct table grants revoked, so the anon key
-- reaches nothing but the narrow security-definer functions below. Nothing
-- deletes: notifications append (deduped by key), reads append, prefs
-- upsert in place.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  dedup_key text not null unique,
  category text not null,
  title text not null,
  body text not null default '',
  href text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists notifications_created_idx
  on public.notifications (created_at desc);

create table if not exists public.notification_reads (
  notification_id uuid not null,
  clerk_user_id text not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, clerk_user_id)
);

create table if not exists public.notification_prefs (
  clerk_user_id text not null,
  category text not null,
  enabled boolean not null default true,
  primary key (clerk_user_id, category)
);

-- ─── Lockdown ───────────────────────────────────────────────────────────────

alter table public.notifications enable row level security;
alter table public.notification_reads enable row level security;
alter table public.notification_prefs enable row level security;

revoke all on table public.notifications from anon, authenticated;
revoke all on table public.notification_reads from anon, authenticated;
revoke all on table public.notification_prefs from anon, authenticated;

-- ─── Functions ──────────────────────────────────────────────────────────────

-- Insert-if-new; on a dedup_key collision keep the existing row and return
-- its id (do-nothing yields no RETURNING row, so re-select it).
create or replace function public.notification_upsert(
  p_dedup_key text,
  p_category text,
  p_title text,
  p_body text,
  p_href text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_dedup_key), '') = '' then
    raise exception 'dedup_key is required';
  end if;
  insert into notifications (dedup_key, category, title, body, href)
  values (
    trim(p_dedup_key),
    coalesce(p_category, ''),
    coalesce(p_title, ''),
    coalesce(p_body, ''),
    coalesce(p_href, '')
  )
  on conflict (dedup_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from notifications where dedup_key = trim(p_dedup_key);
  end if;
  return v_id;
end;
$$;

-- Every notification with a per-user read flag (read_at is not null).
create or replace function public.notifications_list_for_user(
  p_clerk_user_id text
) returns table (
  id uuid,
  dedup_key text,
  category text,
  title text,
  body text,
  href text,
  created_at timestamptz,
  read boolean
)
language sql stable security definer set search_path = public
as $$
  select
    n.id,
    n.dedup_key,
    n.category,
    n.title,
    n.body,
    n.href,
    n.created_at,
    (r.read_at is not null) as read
  from notifications n
  left join notification_reads r
    on r.notification_id = n.id
   and r.clerk_user_id = p_clerk_user_id
  order by n.created_at desc
  limit 200;
$$;

create or replace function public.notification_mark_read(
  p_id uuid,
  p_clerk_user_id text
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(trim(p_clerk_user_id), '') = '' then
    raise exception 'clerk_user_id is required';
  end if;
  insert into notification_reads (notification_id, clerk_user_id)
  values (p_id, trim(p_clerk_user_id))
  on conflict (notification_id, clerk_user_id) do nothing;
  return true;
end;
$$;

create or replace function public.notification_mark_all_read(
  p_clerk_user_id text
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(trim(p_clerk_user_id), '') = '' then
    raise exception 'clerk_user_id is required';
  end if;
  with ins as (
    insert into notification_reads (notification_id, clerk_user_id)
    select n.id, trim(p_clerk_user_id)
    from notifications n
    left join notification_reads r
      on r.notification_id = n.id
     and r.clerk_user_id = trim(p_clerk_user_id)
    where r.notification_id is null
    on conflict (notification_id, clerk_user_id) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end;
$$;

create or replace function public.notification_prefs_get(
  p_clerk_user_id text
) returns setof notification_prefs
language sql stable security definer set search_path = public
as $$
  select * from notification_prefs where clerk_user_id = p_clerk_user_id;
$$;

create or replace function public.notification_pref_set(
  p_clerk_user_id text,
  p_category text,
  p_enabled boolean
) returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(trim(p_clerk_user_id), '') = '' then
    raise exception 'clerk_user_id is required';
  end if;
  if coalesce(trim(p_category), '') = '' then
    raise exception 'category is required';
  end if;
  insert into notification_prefs (clerk_user_id, category, enabled)
  values (trim(p_clerk_user_id), trim(p_category), coalesce(p_enabled, true))
  on conflict (clerk_user_id, category)
    do update set enabled = excluded.enabled;
  return true;
end;
$$;

-- ─── Function grants ────────────────────────────────────────────────────────

revoke all on function public.notification_upsert(text, text, text, text, text) from public;
revoke all on function public.notifications_list_for_user(text) from public;
revoke all on function public.notification_mark_read(uuid, text) from public;
revoke all on function public.notification_mark_all_read(text) from public;
revoke all on function public.notification_prefs_get(text) from public;
revoke all on function public.notification_pref_set(text, text, boolean) from public;

grant execute on function public.notification_upsert(text, text, text, text, text) to anon;
grant execute on function public.notifications_list_for_user(text) to anon;
grant execute on function public.notification_mark_read(uuid, text) to anon;
grant execute on function public.notification_mark_all_read(text) to anon;
grant execute on function public.notification_prefs_get(text) to anon;
grant execute on function public.notification_pref_set(text, text, boolean) to anon;
