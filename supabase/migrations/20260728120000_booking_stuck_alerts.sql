-- Session three: the reconcile job stops logging into the void.
--
-- A booking whose calendar write has been in pending_retry past the stuck
-- threshold now EMAILS Michael instead of only appearing in a job log nobody
-- reads at 3am. The whole problem with that is flooding: the reconcile job runs
-- hourly, and a row that stays stuck for a week is 168 identical emails.
--
-- THE CLAIM IS THE FIX. One row per (booking, day) with a primary key on the
-- pair, and an insert that does nothing on conflict. The function returns
-- whether THIS call created the row, so the caller sends only when it did.
-- Two runs racing produce exactly one send, because the uniqueness is the
-- database's job and not the application's.
--
-- Nothing here holds a client's name, email, or number. The booking id is the
-- key, and the alert mail resolves the rest at send time.
--
-- House pattern: RLS on, NO policies, direct table grants revoked; the only
-- surface is narrow security-definer functions requiring p_operator_secret
-- (public.foxca_operator_secret_ok, migration 20260718190000). Nothing deletes.

create table if not exists public.booking_stuck_alerts (
  booking_id uuid not null,
  alert_date date not null,
  age_hours numeric,
  detail text,
  created_at timestamptz not null default now(),
  primary key (booking_id, alert_date)
);
create index if not exists booking_stuck_alerts_created_idx
  on public.booking_stuck_alerts (created_at desc);

alter table public.booking_stuck_alerts enable row level security;
revoke all on public.booking_stuck_alerts from anon, authenticated, public;

-- Claim the right to alert about one booking on one day.
--
-- Returns TRUE exactly once per (booking, day), to whichever caller got there
-- first. Every later caller that day gets FALSE and sends nothing. The date is
-- computed in America/Toronto so "one per day" means one per Michael's day and
-- not one per UTC day, which would fire a second mail at 8pm his time.
create or replace function public.booking_claim_stuck_alert(
  p_booking_id uuid,
  p_age_hours numeric,
  p_detail text,
  p_operator_secret text
) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_rows int;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  insert into public.booking_stuck_alerts (booking_id, alert_date, age_hours, detail)
  values (
    p_booking_id,
    (now() at time zone 'America/Toronto')::date,
    p_age_hours,
    left(coalesce(p_detail, ''), 500)
  )
  on conflict (booking_id, alert_date) do nothing;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

-- Read side, for the Status page and for a human asking "has this been
-- shouting at me and I missed it".
create or replace function public.booking_stuck_alerts_recent(
  p_limit int,
  p_operator_secret text
) returns setof public.booking_stuck_alerts
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query
    select * from public.booking_stuck_alerts
    order by created_at desc
    limit least(coalesce(p_limit, 50), 500);
end;
$$;

revoke all on function public.booking_claim_stuck_alert(uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.booking_claim_stuck_alert(uuid, numeric, text, text) to anon;
revoke all on function public.booking_stuck_alerts_recent(int, text) from public, anon, authenticated;
grant execute on function public.booking_stuck_alerts_recent(int, text) to anon;
