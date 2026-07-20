-- Today task-action audit. Records who/when for every complete/reopen a
-- verified admin fires from the Tasks card, alongside the Zoho Status write.
-- House pattern, hardened from the start: RLS on, NO policies, direct table
-- grants revoked; the ONLY surface is narrow security-definer functions that
-- require p_operator_secret (public.foxca_operator_secret_ok, migration
-- 20260718190000). Nothing deletes. The task's own truth stays in Zoho; this
-- is an append-only trail of the actions the portal took, never task state.

create table if not exists public.task_action_events (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  subject text,
  action text not null,          -- 'complete' | 'reopen'
  acting_email text not null,
  prev_status text,              -- the status before the write
  new_status text,               -- the status the write set
  result text not null default 'ok',
  created_at timestamptz not null default now()
);
create index if not exists task_action_events_task_idx on public.task_action_events (task_id, created_at desc);
create index if not exists task_action_events_created_idx on public.task_action_events (created_at desc);

alter table public.task_action_events enable row level security;
revoke all on public.task_action_events from anon, authenticated, public;

create or replace function public.task_action_record(
  p_task_id text,
  p_subject text,
  p_action text,
  p_acting_email text,
  p_prev_status text,
  p_new_status text,
  p_result text,
  p_operator_secret text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  if p_action not in ('complete', 'reopen') then
    raise exception 'action must be complete or reopen';
  end if;
  insert into public.task_action_events (task_id, subject, action, acting_email, prev_status, new_status, result)
  values (p_task_id, p_subject, p_action, p_acting_email, p_prev_status, p_new_status, coalesce(p_result, 'ok'))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.task_action_events_recent(p_limit int, p_operator_secret text)
returns setof public.task_action_events
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query select * from public.task_action_events order by created_at desc limit least(coalesce(p_limit, 50), 500);
end;
$$;

create or replace function public.task_action_events_for_task(p_task_id text, p_operator_secret text)
returns setof public.task_action_events
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;
  return query select * from public.task_action_events where task_id = p_task_id order by created_at desc limit 100;
end;
$$;

revoke all on function public.task_action_record(text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.task_action_record(text, text, text, text, text, text, text, text) to anon;
revoke all on function public.task_action_events_recent(int, text) from public, anon, authenticated;
grant execute on function public.task_action_events_recent(int, text) to anon;
revoke all on function public.task_action_events_for_task(text, text) from public, anon, authenticated;
grant execute on function public.task_action_events_for_task(text, text) to anon;
