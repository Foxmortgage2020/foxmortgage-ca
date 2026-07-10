-- Ask Fox conversation storage (Agent session): every practice-agent
-- conversation persists with its tool calls and confirm-card outcomes, as
-- a supervision artifact and, later, an onboarding instrument. Same
-- posture as the compliance module: RLS on with no table policies AND
-- direct table grants revoked, so the server-only key reaches nothing
-- except the narrow security-definer functions below. Append-leaning:
-- nothing deletes; cards decide once (executed or dismissed) and keep
-- their result; conversations cap, never truncate.
--
-- Applied to the foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj)
-- on 2026-07-10; this file is the repo record of that migration.

create table if not exists public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'open' check (status in ('open', 'capped')),
  message_count int not null default 0,
  created_by text not null,
  created_by_clerk_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id),
  seq int not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- The turn's tool calls as the loop ran them: name, input, and a bounded
  -- result summary per call. Inputs and outputs never carry unmasked
  -- identifiers beyond what the source systems store.
  tool_calls jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique (conversation_id, seq)
);

create index if not exists agent_messages_conversation_idx
  on public.agent_messages (conversation_id, seq);

-- Confirm cards: the ONLY write path the agent can propose. A card is
-- created 'proposed' during the turn (turn_seq = the assistant message
-- seq it belongs to), and decides exactly once. The confirm route
-- executes the stored payload, never a client-supplied one.
create table if not exists public.agent_cards (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.agent_conversations(id),
  turn_seq int not null,
  kind text not null check (kind in ('zoho_update', 'task_create')),
  payload jsonb not null,
  reason text,
  status text not null default 'proposed' check (status in ('proposed', 'executed', 'dismissed')),
  result jsonb,
  created_by text not null,
  created_at timestamptz not null default now(),
  decided_by text,
  decided_at timestamptz
);

create index if not exists agent_cards_conversation_idx
  on public.agent_cards (conversation_id, created_at);

alter table public.agent_conversations enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_cards enable row level security;

revoke all on table public.agent_conversations from anon, authenticated;
revoke all on table public.agent_messages from anon, authenticated;
revoke all on table public.agent_cards from anon, authenticated;

-- ─── Functions: the whole access surface ───────────────────────────────────

create or replace function public.agent_conversation_create(
  p_title text,
  p_actor text,
  p_clerk_id text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_actor), '') = '' then
    raise exception 'title and actor are required';
  end if;
  insert into public.agent_conversations (title, created_by, created_by_clerk_id)
  values (left(trim(p_title), 200), p_actor, p_clerk_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.agent_conversations_list()
returns setof public.agent_conversations
language sql stable security definer set search_path = public
as $$
  select * from public.agent_conversations
  order by updated_at desc
  limit 200;
$$;

create or replace function public.agent_conversation_get(p_id uuid)
returns setof public.agent_conversations
language sql stable security definer set search_path = public
as $$
  select * from public.agent_conversations where id = p_id;
$$;

create or replace function public.agent_messages_list(p_conversation_id uuid)
returns setof public.agent_messages
language sql stable security definer set search_path = public
as $$
  select * from public.agent_messages
  where conversation_id = p_conversation_id
  order by seq asc;
$$;

-- Appends one message and returns its seq. The app enforces the product
-- cap (config/agent.ts); the 200 here is a runaway backstop only.
create or replace function public.agent_message_append(
  p_conversation_id uuid,
  p_role text,
  p_content text,
  p_tool_calls jsonb,
  p_actor text
) returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_seq int;
begin
  if p_role not in ('user', 'assistant') then
    raise exception 'role must be user or assistant';
  end if;
  update public.agent_conversations
  set message_count = message_count + 1, updated_at = now()
  where id = p_conversation_id and message_count < 200
  returning message_count into v_seq;
  if v_seq is null then
    raise exception 'conversation not found or at the hard message backstop';
  end if;
  insert into public.agent_messages (conversation_id, seq, role, content, tool_calls, created_by)
  values (p_conversation_id, v_seq, p_role, p_content, coalesce(p_tool_calls, '[]'::jsonb), p_actor);
  return v_seq;
end;
$$;

create or replace function public.agent_conversation_set_status(
  p_id uuid,
  p_status text,
  p_actor text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_status not in ('open', 'capped') then
    raise exception 'status must be open or capped';
  end if;
  update public.agent_conversations
  set status = p_status, updated_at = now()
  where id = p_id
  returning id into v_id;
  return v_id is not null;
end;
$$;

create or replace function public.agent_card_create(
  p_conversation_id uuid,
  p_turn_seq int,
  p_kind text,
  p_payload jsonb,
  p_reason text,
  p_actor text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_kind not in ('zoho_update', 'task_create') then
    raise exception 'kind must be zoho_update or task_create';
  end if;
  if p_payload is null then
    raise exception 'payload is required';
  end if;
  insert into public.agent_cards (conversation_id, turn_seq, kind, payload, reason, created_by)
  values (p_conversation_id, p_turn_seq, p_kind, p_payload, p_reason, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.agent_cards_list(p_conversation_id uuid)
returns setof public.agent_cards
language sql stable security definer set search_path = public
as $$
  select * from public.agent_cards
  where conversation_id = p_conversation_id
  order by created_at asc;
$$;

create or replace function public.agent_card_get(p_id uuid)
returns setof public.agent_cards
language sql stable security definer set search_path = public
as $$
  select * from public.agent_cards where id = p_id;
$$;

-- One decision per card: proposed -> executed | dismissed, guarded on the
-- status that was read so a double tap or stale tab lands as false (the
-- route renders it as already decided), never a second execution.
create or replace function public.agent_card_decide(
  p_id uuid,
  p_status text,
  p_result jsonb,
  p_actor text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_status not in ('executed', 'dismissed') then
    raise exception 'status must be executed or dismissed';
  end if;
  update public.agent_cards
  set status = p_status, result = p_result, decided_by = p_actor, decided_at = now()
  where id = p_id and status = 'proposed'
  returning id into v_id;
  return v_id is not null;
end;
$$;

revoke all on function public.agent_conversation_create(text, text, text) from public;
revoke all on function public.agent_conversations_list() from public;
revoke all on function public.agent_conversation_get(uuid) from public;
revoke all on function public.agent_messages_list(uuid) from public;
revoke all on function public.agent_message_append(uuid, text, text, jsonb, text) from public;
revoke all on function public.agent_conversation_set_status(uuid, text, text) from public;
revoke all on function public.agent_card_create(uuid, int, text, jsonb, text, text) from public;
revoke all on function public.agent_cards_list(uuid) from public;
revoke all on function public.agent_card_get(uuid) from public;
revoke all on function public.agent_card_decide(uuid, text, jsonb, text) from public;

grant execute on function public.agent_conversation_create(text, text, text) to anon;
grant execute on function public.agent_conversations_list() to anon;
grant execute on function public.agent_conversation_get(uuid) to anon;
grant execute on function public.agent_messages_list(uuid) to anon;
grant execute on function public.agent_message_append(uuid, text, text, jsonb, text) to anon;
grant execute on function public.agent_conversation_set_status(uuid, text, text) to anon;
grant execute on function public.agent_card_create(uuid, int, text, jsonb, text, text) to anon;
grant execute on function public.agent_cards_list(uuid) to anon;
grant execute on function public.agent_card_get(uuid) to anon;
grant execute on function public.agent_card_decide(uuid, text, jsonb, text) to anon;
