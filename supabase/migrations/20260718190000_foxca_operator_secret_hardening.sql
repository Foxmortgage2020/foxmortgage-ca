-- FOXCA-wide operator-secret hardening (2026-07-18) — FOXCA project skfeivzhqvrefnkqjwtj.
--
-- THE HOLE, restated FOXCA-wide. The FOXCA anon key (FOXCA_SUPABASE_KEY) is NOT
-- a secret — it is shared with public form-intake. B7-P Task 0 closed this for
-- the client_link_* functions and B8b did so for client_presentation_*; every
-- OTHER admin security-definer function was still `grant execute to anon`, so
-- anyone holding the anon key was a de facto service account for the whole FOXCA
-- surface: they could forge compliance records, staff provisions, renewal
-- decisions, savings logs, agent conversations, SMM overrides, view-as audit
-- rows, and read the compliance register, view-as logs, and staff PII.
--
-- THE FIX, the client_link / client_presentation pattern EXACTLY. Each
-- admin-side function gains a required p_operator_secret argument and refuses
-- (42501) unless it matches the value the server holds in FOXCA_OPERATOR_SECRET
-- (the SAME secret — NO new env). One shared helper carries the sha256. The OLD
-- signature is DROPPED first (the overload trap: `create or replace` with a new
-- arg list leaves the old un-secured signature callable and defeats the fix).
--
-- WHAT STAYS OPEN, and why (each ruled in docs/foxca-hardening-2026-07-18.md):
--   * token-keyed client-page flow — client_link_resolve, client_link_touch,
--     client_scenarios_for_token, client_offers_for_token, client_letter_for_token.
--     The 256-bit token hash IS the per-record secret; the public status page
--     holds only the anon key and cannot supply a server secret.
--   * mark_form_submission — the public form-intake stamp; the anon key is the
--     deliberate public-capture credential for that pipeline.
--   * notifications_list_for_user, notification_prefs_get,
--     saved_scenarios_list_for_user — user-scoped READS keyed by the caller's
--     clerk id; low value, and the brief keeps user-scoped reads open.
--
-- DEPLOY-ORDERING CONSEQUENCE, LOUD (the B7-P pattern, at FOXCA-wide scale):
-- applying this DROPS the old signatures, so the currently-DEPLOYED code (which
-- calls these functions WITHOUT the secret) errors on every hardened function
-- until the matching code deploys. That is the ENTIRE FOXCA admin surface
-- (compliance, notifications, people, renewals, SMM, Ask Fox, constraints,
-- saved scenarios, view-as, savings log, the status-page form-intake ack/stats).
-- The stores fail gracefully (error states, not crashes), but those features are
-- DOWN between apply and deploy. Deploy this session's code immediately.

create extension if not exists pgcrypto with schema extensions;

-- ── The shared operator-secret guard (one place; not anon-callable) ──────────
create or replace function public.foxca_operator_secret_ok(p_operator_secret text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select p_operator_secret is not null
     and encode(extensions.digest(p_operator_secret, 'sha256'), 'hex')
         = '379d1a2d1117a157ebf255bc2f92a60b157e60bfc0cc99b5960b2f3788dc8915';
$$;
revoke all on function public.foxca_operator_secret_ok(text) from public, anon, authenticated;

-- ═══ form_submission (ack + status-page reads) ══════════════════════════════

drop function if exists public.acknowledge_form_submission(p_id uuid, p_by text);
create or replace function public.acknowledge_form_submission(p_id uuid, p_by text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update public.form_submissions
  set acknowledged_at = now(), acknowledged_by = p_by
  where id = p_id and processing_status = 'zoho_failed' and acknowledged_at is null
  returning true into v_ok;
  return v_ok;
end; $$;
revoke all on function public.acknowledge_form_submission(uuid, text, text) from public, anon, authenticated;
grant execute on function public.acknowledge_form_submission(uuid, text, text) to anon;

drop function if exists public.form_submission_failures();
create or replace function public.form_submission_failures(p_operator_secret text)
returns table(id uuid, created_at timestamptz, source text, error_detail text)
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query
    select f.id, f.created_at, f.source, f.error_detail
    from public.form_submissions f
    where f.processing_status = 'zoho_failed' and f.acknowledged_at is null
    order by f.created_at desc limit 50;
end; $$;
revoke all on function public.form_submission_failures(text) from public, anon, authenticated;
grant execute on function public.form_submission_failures(text) to anon;

drop function if exists public.form_submission_stats();
create or replace function public.form_submission_stats(p_operator_secret text)
returns table(total_7d bigint, zoho_failed bigint, zoho_failed_total bigint, latest_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query
    select
      count(*) filter (where created_at > now() - interval '7 days'),
      count(*) filter (where processing_status = 'zoho_failed' and acknowledged_at is null),
      count(*) filter (where processing_status = 'zoho_failed'),
      max(created_at)
    from public.form_submissions;
end; $$;
revoke all on function public.form_submission_stats(text) from public, anon, authenticated;
grant execute on function public.form_submission_stats(text) to anon;

-- ═══ agent (Ask Fox conversations / messages / cards) ═══════════════════════

drop function if exists public.agent_card_create(p_conversation_id uuid, p_turn_seq integer, p_kind text, p_payload jsonb, p_reason text, p_actor text);
create or replace function public.agent_card_create(p_conversation_id uuid, p_turn_seq integer, p_kind text, p_payload jsonb, p_reason text, p_actor text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_kind not in ('zoho_update', 'task_create') then raise exception 'kind must be zoho_update or task_create'; end if;
  if p_payload is null then raise exception 'payload is required'; end if;
  insert into public.agent_cards (conversation_id, turn_seq, kind, payload, reason, created_by)
  values (p_conversation_id, p_turn_seq, p_kind, p_payload, p_reason, p_actor)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.agent_card_create(uuid, integer, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_card_create(uuid, integer, text, jsonb, text, text, text) to anon;

drop function if exists public.agent_card_decide(p_id uuid, p_status text, p_result jsonb, p_actor text);
create or replace function public.agent_card_decide(p_id uuid, p_status text, p_result jsonb, p_actor text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_status not in ('executed', 'dismissed') then raise exception 'status must be executed or dismissed'; end if;
  update public.agent_cards
  set status = p_status, result = p_result, decided_by = p_actor, decided_at = now()
  where id = p_id and status = 'proposed'
  returning id into v_id;
  return v_id is not null;
end; $$;
revoke all on function public.agent_card_decide(uuid, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.agent_card_decide(uuid, text, jsonb, text, text) to anon;

drop function if exists public.agent_card_get(p_id uuid);
create or replace function public.agent_card_get(p_id uuid, p_operator_secret text)
returns setof public.agent_cards language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.agent_cards where id = p_id;
end; $$;
revoke all on function public.agent_card_get(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_card_get(uuid, text) to anon;

drop function if exists public.agent_cards_list(p_conversation_id uuid);
create or replace function public.agent_cards_list(p_conversation_id uuid, p_operator_secret text)
returns setof public.agent_cards language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.agent_cards where conversation_id = p_conversation_id order by created_at asc;
end; $$;
revoke all on function public.agent_cards_list(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_cards_list(uuid, text) to anon;

drop function if exists public.agent_conversation_create(p_title text, p_actor text, p_clerk_id text);
create or replace function public.agent_conversation_create(p_title text, p_actor text, p_clerk_id text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_actor), '') = '' then raise exception 'title and actor are required'; end if;
  insert into public.agent_conversations (title, created_by, created_by_clerk_id)
  values (left(trim(p_title), 200), p_actor, p_clerk_id)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.agent_conversation_create(text, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_conversation_create(text, text, text, text) to anon;

drop function if exists public.agent_conversation_get(p_id uuid);
create or replace function public.agent_conversation_get(p_id uuid, p_operator_secret text)
returns setof public.agent_conversations language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.agent_conversations where id = p_id;
end; $$;
revoke all on function public.agent_conversation_get(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_conversation_get(uuid, text) to anon;

drop function if exists public.agent_conversation_set_status(p_id uuid, p_status text, p_actor text);
create or replace function public.agent_conversation_set_status(p_id uuid, p_status text, p_actor text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_status not in ('open', 'capped') then raise exception 'status must be open or capped'; end if;
  update public.agent_conversations set status = p_status, updated_at = now() where id = p_id returning id into v_id;
  return v_id is not null;
end; $$;
revoke all on function public.agent_conversation_set_status(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.agent_conversation_set_status(uuid, text, text, text) to anon;

drop function if exists public.agent_conversations_list();
create or replace function public.agent_conversations_list(p_operator_secret text)
returns setof public.agent_conversations language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.agent_conversations order by updated_at desc limit 200;
end; $$;
revoke all on function public.agent_conversations_list(text) from public, anon, authenticated;
grant execute on function public.agent_conversations_list(text) to anon;

drop function if exists public.agent_message_append(p_conversation_id uuid, p_role text, p_content text, p_tool_calls jsonb, p_actor text);
create or replace function public.agent_message_append(p_conversation_id uuid, p_role text, p_content text, p_tool_calls jsonb, p_actor text, p_operator_secret text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_seq int;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_role not in ('user', 'assistant') then raise exception 'role must be user or assistant'; end if;
  update public.agent_conversations
  set message_count = message_count + 1, updated_at = now()
  where id = p_conversation_id and message_count < 200
  returning message_count into v_seq;
  if v_seq is null then raise exception 'conversation not found or at the hard message backstop'; end if;
  insert into public.agent_messages (conversation_id, seq, role, content, tool_calls, created_by)
  values (p_conversation_id, v_seq, p_role, p_content, coalesce(p_tool_calls, '[]'::jsonb), p_actor);
  return v_seq;
end; $$;
revoke all on function public.agent_message_append(uuid, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.agent_message_append(uuid, text, text, jsonb, text, text) to anon;

drop function if exists public.agent_messages_list(p_conversation_id uuid);
create or replace function public.agent_messages_list(p_conversation_id uuid, p_operator_secret text)
returns setof public.agent_messages language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.agent_messages where conversation_id = p_conversation_id order by seq asc;
end; $$;
revoke all on function public.agent_messages_list(uuid, text) from public, anon, authenticated;
grant execute on function public.agent_messages_list(uuid, text) to anon;

-- ═══ client constraints + pin confirmations ════════════════════════════════

drop function if exists public.client_constraint_add(p_client text, p_lender text, p_label text, p_type text, p_reason text, p_email text);
create or replace function public.client_constraint_add(p_client text, p_lender text, p_label text, p_type text, p_reason text, p_email text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  insert into public.client_constraints (client_key, lender_slug, lender_label, constraint_type, reason, acting_email)
  values (p_client, p_lender, p_label, p_type, p_reason, p_email) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.client_constraint_add(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.client_constraint_add(text, text, text, text, text, text, text) to anon;

drop function if exists public.client_constraint_retire(p_id uuid, p_email text);
create or replace function public.client_constraint_retire(p_id uuid, p_email text, p_operator_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update public.client_constraints set retired_at = now(), retired_by = p_email where id = p_id and retired_at is null;
end; $$;
revoke all on function public.client_constraint_retire(uuid, text, text) from public, anon, authenticated;
grant execute on function public.client_constraint_retire(uuid, text, text) to anon;

drop function if exists public.client_constraints_for(p_client text);
create or replace function public.client_constraints_for(p_client text, p_operator_secret text)
returns setof public.client_constraints language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.client_constraints where client_key = p_client order by created_at desc;
end; $$;
revoke all on function public.client_constraints_for(text, text) from public, anon, authenticated;
grant execute on function public.client_constraints_for(text, text) to anon;

drop function if exists public.pin_confirmation_add(p_client text, p_quote text, p_lender text, p_requirement text, p_requirement_text text, p_email text);
create or replace function public.pin_confirmation_add(p_client text, p_quote text, p_lender text, p_requirement text, p_requirement_text text, p_email text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  insert into public.pin_confirmations (client_key, quote_id, lender_slug, requirement, requirement_text, acting_email)
  values (p_client, p_quote, p_lender, p_requirement, p_requirement_text, p_email) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.pin_confirmation_add(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.pin_confirmation_add(text, text, text, text, text, text, text) to anon;

drop function if exists public.pin_confirmations_for(p_client text);
create or replace function public.pin_confirmations_for(p_client text, p_operator_secret text)
returns setof public.pin_confirmations language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.pin_confirmations where client_key = p_client and retired_at is null order by created_at desc;
end; $$;
revoke all on function public.pin_confirmations_for(text, text) from public, anon, authenticated;
grant execute on function public.pin_confirmations_for(text, text) to anon;

-- ═══ client_link_event_record (closes the B7-P audit-forge residual) ════════

drop function if exists public.client_link_event_record(p_link_id uuid, p_zoho_deal_id text, p_file_ref text, p_action text, p_acting_email text, p_result text);
create or replace function public.client_link_event_record(p_link_id uuid, p_zoho_deal_id text, p_file_ref text, p_action text, p_acting_email text, p_result text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  insert into public.client_link_events (link_id, zoho_deal_id, file_ref, action, acting_email, result)
  values (p_link_id, p_zoho_deal_id, p_file_ref, p_action, p_acting_email, coalesce(p_result, 'ok'))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.client_link_event_record(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.client_link_event_record(uuid, text, text, text, text, text, text) to anon;

-- ═══ compliance (credentials / complaints / policies / acks / events) ═══════

drop function if exists public.compliance_complaint_create(p_received_on date, p_source text, p_summary text, p_reference text, p_actor text);
create or replace function public.compliance_complaint_create(p_received_on date, p_source text, p_summary text, p_reference text, p_actor text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_received_on is null or coalesce(trim(p_source), '') = '' or coalesce(trim(p_summary), '') = '' then raise exception 'received_on, source, and summary are required'; end if;
  insert into public.compliance_complaints (received_on, source, summary, reference, created_by, updated_by)
  values (p_received_on, trim(p_source), trim(p_summary), nullif(trim(coalesce(p_reference, '')), ''), p_actor, p_actor)
  returning id into v_id;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('complaint', v_id, 'created', jsonb_build_object('received_on', p_received_on, 'source', trim(p_source)), p_actor);
  return v_id;
end; $$;
revoke all on function public.compliance_complaint_create(date, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.compliance_complaint_create(date, text, text, text, text, text) to anon;

drop function if exists public.compliance_complaint_set_status(p_id uuid, p_status text, p_note text, p_actor text);
create or replace function public.compliance_complaint_set_status(p_id uuid, p_status text, p_note text, p_actor text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_from text;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_status not in ('open', 'investigating', 'resolved', 'reported') then raise exception 'status must be open, investigating, resolved, or reported'; end if;
  select status into v_from from public.compliance_complaints where id = p_id;
  if v_from is null then return false; end if;
  update public.compliance_complaints
  set status = p_status,
      resolution_notes = coalesce(nullif(trim(coalesce(p_note, '')), ''), resolution_notes),
      updated_at = now(), updated_by = p_actor
  where id = p_id;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('complaint', p_id, 'status_changed', jsonb_build_object('from', v_from, 'to', p_status, 'note', nullif(trim(coalesce(p_note, '')), '')), p_actor);
  return true;
end; $$;
revoke all on function public.compliance_complaint_set_status(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.compliance_complaint_set_status(uuid, text, text, text, text) to anon;

drop function if exists public.compliance_complaints_list();
create or replace function public.compliance_complaints_list(p_operator_secret text)
returns setof public.compliance_complaints language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.compliance_complaints order by (status in ('open', 'investigating')) desc, received_on desc;
end; $$;
revoke all on function public.compliance_complaints_list(text) from public, anon, authenticated;
grant execute on function public.compliance_complaints_list(text) to anon;

drop function if exists public.compliance_credential_retire(p_id uuid, p_note text, p_actor text);
create or replace function public.compliance_credential_retire(p_id uuid, p_note text, p_actor text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update public.compliance_credentials
  set status = 'retired', retired_at = now(), retired_by = p_actor, updated_at = now(), updated_by = p_actor
  where id = p_id and status = 'active'
  returning id into v_id;
  if v_id is null then return false; end if;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('credential', v_id, 'retired', jsonb_build_object('note', p_note), p_actor);
  return true;
end; $$;
revoke all on function public.compliance_credential_retire(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.compliance_credential_retire(uuid, text, text, text) to anon;

drop function if exists public.compliance_credential_save(p_id uuid, p_name text, p_holder text, p_expires_on date, p_date_confirmed boolean, p_notes text, p_actor text);
create or replace function public.compliance_credential_save(p_id uuid, p_name text, p_holder text, p_expires_on date, p_date_confirmed boolean, p_notes text, p_actor text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_holder), '') = '' then raise exception 'name and holder are required'; end if;
  if p_id is null then
    insert into public.compliance_credentials (name, holder, expires_on, date_confirmed, notes, created_by, updated_by)
    values (trim(p_name), trim(p_holder), p_expires_on, coalesce(p_date_confirmed, false), p_notes, p_actor, p_actor)
    returning id into v_id;
    insert into public.compliance_events (record_type, record_id, action, detail, actor)
    values ('credential', v_id, 'created', jsonb_build_object('name', trim(p_name), 'expires_on', p_expires_on, 'date_confirmed', coalesce(p_date_confirmed, false)), p_actor);
  else
    update public.compliance_credentials
    set name = trim(p_name), holder = trim(p_holder), expires_on = p_expires_on,
        date_confirmed = coalesce(p_date_confirmed, false), notes = p_notes, updated_at = now(), updated_by = p_actor
    where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'credential not found'; end if;
    insert into public.compliance_events (record_type, record_id, action, detail, actor)
    values ('credential', v_id, 'updated', jsonb_build_object('name', trim(p_name), 'expires_on', p_expires_on, 'date_confirmed', coalesce(p_date_confirmed, false)), p_actor);
  end if;
  return v_id;
end; $$;
revoke all on function public.compliance_credential_save(uuid, text, text, date, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.compliance_credential_save(uuid, text, text, date, boolean, text, text, text) to anon;

drop function if exists public.compliance_credentials_list();
create or replace function public.compliance_credentials_list(p_operator_secret text)
returns setof public.compliance_credentials language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.compliance_credentials order by status asc, expires_on asc nulls last, name asc;
end; $$;
revoke all on function public.compliance_credentials_list(text) from public, anon, authenticated;
grant execute on function public.compliance_credentials_list(text) to anon;

drop function if exists public.compliance_events_list(p_record_type text, p_record_id uuid);
create or replace function public.compliance_events_list(p_record_type text, p_record_id uuid, p_operator_secret text)
returns setof public.compliance_events language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.compliance_events where record_type = p_record_type and record_id = p_record_id order by created_at desc limit 200;
end; $$;
revoke all on function public.compliance_events_list(text, uuid, text) from public, anon, authenticated;
grant execute on function public.compliance_events_list(text, uuid, text) to anon;

drop function if exists public.compliance_policies_list();
create or replace function public.compliance_policies_list(p_operator_secret text)
returns setof public.compliance_policies language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.compliance_policies order by status asc, title asc;
end; $$;
revoke all on function public.compliance_policies_list(text) from public, anon, authenticated;
grant execute on function public.compliance_policies_list(text) to anon;

drop function if exists public.compliance_policy_ack(p_policy_id uuid, p_version integer, p_actor text, p_clerk_id text);
create or replace function public.compliance_policy_ack(p_policy_id uuid, p_version integer, p_actor text, p_clerk_id text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_inserted uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if not exists (select 1 from public.compliance_policy_versions where policy_id = p_policy_id and version = p_version) then
    raise exception 'that policy version does not exist';
  end if;
  insert into public.compliance_policy_acks (policy_id, version, acked_by, acked_by_clerk_id)
  values (p_policy_id, p_version, p_actor, p_clerk_id)
  on conflict (policy_id, version, acked_by) do nothing
  returning id into v_inserted;
  return v_inserted is not null;
end; $$;
revoke all on function public.compliance_policy_ack(uuid, integer, text, text, text) from public, anon, authenticated;
grant execute on function public.compliance_policy_ack(uuid, integer, text, text, text) to anon;

drop function if exists public.compliance_policy_acks_list();
create or replace function public.compliance_policy_acks_list(p_operator_secret text)
returns setof public.compliance_policy_acks language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.compliance_policy_acks order by acked_at desc;
end; $$;
revoke all on function public.compliance_policy_acks_list(text) from public, anon, authenticated;
grant execute on function public.compliance_policy_acks_list(text) to anon;

drop function if exists public.compliance_policy_create(p_title text, p_body_md text, p_effective_on date, p_actor text);
create or replace function public.compliance_policy_create(p_title text, p_body_md text, p_effective_on date, p_actor text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_title), '') = '' or coalesce(trim(p_body_md), '') = '' then raise exception 'title and body are required'; end if;
  insert into public.compliance_policies (title, body_md, effective_on, created_by, updated_by)
  values (trim(p_title), p_body_md, p_effective_on, p_actor, p_actor)
  returning id into v_id;
  insert into public.compliance_policy_versions (policy_id, version, title, body_md, effective_on, created_by)
  values (v_id, 1, trim(p_title), p_body_md, p_effective_on, p_actor);
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('policy', v_id, 'created', jsonb_build_object('title', trim(p_title), 'version', 1), p_actor);
  return v_id;
end; $$;
revoke all on function public.compliance_policy_create(text, text, date, text, text) from public, anon, authenticated;
grant execute on function public.compliance_policy_create(text, text, date, text, text) to anon;

drop function if exists public.compliance_policy_update(p_id uuid, p_title text, p_body_md text, p_effective_on date, p_status text, p_actor text);
create or replace function public.compliance_policy_update(p_id uuid, p_title text, p_body_md text, p_effective_on date, p_status text, p_actor text, p_operator_secret text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_old public.compliance_policies%rowtype;
  v_version int;
  v_content_changed boolean;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_status not in ('active', 'retired') then raise exception 'status must be active or retired'; end if;
  select * into v_old from public.compliance_policies where id = p_id;
  if v_old.id is null then raise exception 'policy not found'; end if;
  v_content_changed := trim(p_title) is distinct from v_old.title
    or p_body_md is distinct from v_old.body_md
    or p_effective_on is distinct from v_old.effective_on;
  v_version := v_old.version;
  if v_content_changed then
    v_version := v_old.version + 1;
    insert into public.compliance_policy_versions (policy_id, version, title, body_md, effective_on, created_by)
    values (p_id, v_version, trim(p_title), p_body_md, p_effective_on, p_actor);
  end if;
  update public.compliance_policies
  set title = trim(p_title), body_md = p_body_md, effective_on = p_effective_on,
      version = v_version, status = p_status, updated_at = now(), updated_by = p_actor
  where id = p_id;
  insert into public.compliance_events (record_type, record_id, action, detail, actor)
  values ('policy', p_id,
    case when p_status is distinct from v_old.status then 'status_changed' else 'updated' end,
    jsonb_build_object('version', v_version, 'content_changed', v_content_changed, 'from_status', v_old.status, 'to_status', p_status),
    p_actor);
  return v_version;
end; $$;
revoke all on function public.compliance_policy_update(uuid, text, text, date, text, text, text) from public, anon, authenticated;
grant execute on function public.compliance_policy_update(uuid, text, text, date, text, text, text) to anon;

drop function if exists public.compliance_policy_versions_list(p_policy_id uuid);
create or replace function public.compliance_policy_versions_list(p_policy_id uuid, p_operator_secret text)
returns setof public.compliance_policy_versions language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.compliance_policy_versions where policy_id = p_policy_id order by version desc;
end; $$;
revoke all on function public.compliance_policy_versions_list(uuid, text) from public, anon, authenticated;
grant execute on function public.compliance_policy_versions_list(uuid, text) to anon;

-- ═══ notifications (producer + user writes; user reads stay open) ═══════════

drop function if exists public.notification_mark_all_read(p_clerk_user_id text);
create or replace function public.notification_mark_all_read(p_clerk_user_id text, p_operator_secret text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then raise exception 'clerk_user_id is required'; end if;
  with ins as (
    insert into notification_reads (notification_id, clerk_user_id)
    select n.id, trim(p_clerk_user_id)
    from notifications n
    left join notification_reads r on r.notification_id = n.id and r.clerk_user_id = trim(p_clerk_user_id)
    where r.notification_id is null
    on conflict (notification_id, clerk_user_id) do nothing
    returning 1
  )
  select count(*) into v_count from ins;
  return coalesce(v_count, 0);
end; $$;
revoke all on function public.notification_mark_all_read(text, text) from public, anon, authenticated;
grant execute on function public.notification_mark_all_read(text, text) to anon;

drop function if exists public.notification_mark_read(p_id uuid, p_clerk_user_id text);
create or replace function public.notification_mark_read(p_id uuid, p_clerk_user_id text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then raise exception 'clerk_user_id is required'; end if;
  insert into notification_reads (notification_id, clerk_user_id)
  values (p_id, trim(p_clerk_user_id))
  on conflict (notification_id, clerk_user_id) do nothing;
  return true;
end; $$;
revoke all on function public.notification_mark_read(uuid, text, text) from public, anon, authenticated;
grant execute on function public.notification_mark_read(uuid, text, text) to anon;

drop function if exists public.notification_pref_set(p_clerk_user_id text, p_category text, p_enabled boolean);
create or replace function public.notification_pref_set(p_clerk_user_id text, p_category text, p_enabled boolean, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then raise exception 'clerk_user_id is required'; end if;
  if coalesce(trim(p_category), '') = '' then raise exception 'category is required'; end if;
  insert into notification_prefs (clerk_user_id, category, enabled)
  values (trim(p_clerk_user_id), trim(p_category), coalesce(p_enabled, true))
  on conflict (clerk_user_id, category) do update set enabled = excluded.enabled;
  return true;
end; $$;
revoke all on function public.notification_pref_set(text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.notification_pref_set(text, text, boolean, text) to anon;

drop function if exists public.notification_upsert(p_dedup_key text, p_category text, p_title text, p_body text, p_href text);
create or replace function public.notification_upsert(p_dedup_key text, p_category text, p_title text, p_body text, p_href text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_dedup_key), '') = '' then raise exception 'dedup_key is required'; end if;
  insert into notifications (dedup_key, category, title, body, href)
  values (trim(p_dedup_key), coalesce(p_category, ''), coalesce(p_title, ''), coalesce(p_body, ''), coalesce(p_href, ''))
  on conflict (dedup_key) do nothing
  returning id into v_id;
  if v_id is null then select id into v_id from notifications where dedup_key = trim(p_dedup_key); end if;
  return v_id;
end; $$;
revoke all on function public.notification_upsert(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.notification_upsert(text, text, text, text, text, text) to anon;

-- ═══ people (provisioning + offboarding) ════════════════════════════════════

drop function if exists public.people_offboard_check(p_id uuid, p_item_key text, p_done boolean, p_actor text);
create or replace function public.people_offboard_check(p_id uuid, p_item_key text, p_done boolean, p_actor text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_actor), '') = '' then raise exception 'actor is required'; end if;
  update people_offboarding
  set checklist = (
        select coalesce(jsonb_agg(
          case when item ->> 'key' = p_item_key then jsonb_set(item, '{done}', to_jsonb(coalesce(p_done, false))) else item end
        ), '[]'::jsonb)
        from jsonb_array_elements(checklist) as item
      ),
      updated_at = now(), updated_by = trim(p_actor)
  where id = p_id;
  v_found := found;
  return v_found;
end; $$;
revoke all on function public.people_offboard_check(uuid, text, boolean, text, text) from public, anon, authenticated;
grant execute on function public.people_offboard_check(uuid, text, boolean, text, text) to anon;

drop function if exists public.people_offboard_get(p_id uuid);
create or replace function public.people_offboard_get(p_id uuid, p_operator_secret text)
returns setof public.people_offboarding language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from people_offboarding where id = p_id;
end; $$;
revoke all on function public.people_offboard_get(uuid, text) from public, anon, authenticated;
grant execute on function public.people_offboard_get(uuid, text) to anon;

drop function if exists public.people_offboard_list();
create or replace function public.people_offboard_list(p_operator_secret text)
returns setof public.people_offboarding language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from people_offboarding order by created_at desc;
end; $$;
revoke all on function public.people_offboard_list(text) from public, anon, authenticated;
grant execute on function public.people_offboard_list(text) to anon;

drop function if exists public.people_offboard_record(p_actor text, p_clerk_user_id text, p_email text, p_name text, p_roles jsonb, p_checklist jsonb);
create or replace function public.people_offboard_record(p_actor text, p_clerk_user_id text, p_email text, p_name text, p_roles jsonb, p_checklist jsonb, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_actor), '') = '' then raise exception 'actor is required'; end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then raise exception 'clerk_user_id is required'; end if;
  insert into people_offboarding (clerk_user_id, email, name, roles, checklist, offboarded_by)
  values (trim(p_clerk_user_id), lower(trim(coalesce(p_email, ''))), coalesce(trim(p_name), ''),
          coalesce(p_roles, '[]'::jsonb), coalesce(p_checklist, '[]'::jsonb), trim(p_actor))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.people_offboard_record(text, text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.people_offboard_record(text, text, text, text, jsonb, jsonb, text) to anon;

drop function if exists public.people_provision_list();
create or replace function public.people_provision_list(p_operator_secret text)
returns setof public.people_provisioning language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from people_provisioning order by created_at desc;
end; $$;
revoke all on function public.people_provision_list(text) from public, anon, authenticated;
grant execute on function public.people_provision_list(text) to anon;

drop function if exists public.people_provision_record(p_actor text, p_clerk_user_id text, p_email text, p_name text, p_person_type text, p_roles jsonb, p_zoho_partner_id text, p_workbench_agent_id text, p_setup_remaining jsonb, p_invite_sent boolean);
create or replace function public.people_provision_record(p_actor text, p_clerk_user_id text, p_email text, p_name text, p_person_type text, p_roles jsonb, p_zoho_partner_id text, p_workbench_agent_id text, p_setup_remaining jsonb, p_invite_sent boolean, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_actor), '') = '' then raise exception 'actor is required'; end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then raise exception 'clerk_user_id is required'; end if;
  if p_person_type not in ('staff', 'partner', 'agent') then raise exception 'person_type must be staff, partner, or agent'; end if;
  insert into people_provisioning
    (clerk_user_id, email, name, person_type, roles, zoho_partner_id, workbench_agent_id, setup_remaining, invite_sent, provisioned_by)
  values
    (trim(p_clerk_user_id), lower(trim(coalesce(p_email, ''))), coalesce(trim(p_name), ''),
     p_person_type, coalesce(p_roles, '[]'::jsonb), nullif(trim(coalesce(p_zoho_partner_id, '')), ''),
     nullif(trim(coalesce(p_workbench_agent_id, '')), ''), p_setup_remaining, coalesce(p_invite_sent, false), trim(p_actor))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.people_provision_record(text, text, text, text, text, jsonb, text, text, jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.people_provision_record(text, text, text, text, text, jsonb, text, text, jsonb, boolean, text) to anon;

-- ═══ renewal events (record + reads) ════════════════════════════════════════

drop function if exists public.renewal_event_record(p_deal_id text, p_deal_name text, p_action text, p_acting_email text, p_fields jsonb, p_prev_status text, p_result text);
create or replace function public.renewal_event_record(p_deal_id text, p_deal_name text, p_action text, p_acting_email text, p_fields jsonb, p_prev_status text, p_result text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  insert into public.renewal_events (deal_id, deal_name, action, acting_email, fields, prev_status, result)
  values (p_deal_id, p_deal_name, p_action, p_acting_email, coalesce(p_fields, '{}'::jsonb), p_prev_status, coalesce(p_result, 'ok'))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.renewal_event_record(text, text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.renewal_event_record(text, text, text, text, jsonb, text, text, text) to anon;

drop function if exists public.renewal_events_for_deal(p_deal_id text);
create or replace function public.renewal_events_for_deal(p_deal_id text, p_operator_secret text)
returns setof public.renewal_events language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.renewal_events where deal_id = p_deal_id order by created_at desc limit 100;
end; $$;
revoke all on function public.renewal_events_for_deal(text, text) from public, anon, authenticated;
grant execute on function public.renewal_events_for_deal(text, text) to anon;

drop function if exists public.renewal_events_recent(p_limit integer);
create or replace function public.renewal_events_recent(p_limit integer, p_operator_secret text)
returns setof public.renewal_events language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.renewal_events order by created_at desc limit least(coalesce(p_limit, 50), 500);
end; $$;
revoke all on function public.renewal_events_recent(integer, text) from public, anon, authenticated;
grant execute on function public.renewal_events_recent(integer, text) to anon;

-- ═══ saved scenarios (user writes; user read stays open) ════════════════════

drop function if exists public.saved_scenario_create(p_clerk_user_id text, p_name text, p_params text, p_from_file text);
create or replace function public.saved_scenario_create(p_clerk_user_id text, p_name text, p_params text, p_from_file text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_clerk_user_id), '') = '' then raise exception 'clerk_user_id is required'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'name is required'; end if;
  if coalesce(trim(p_params), '') = '' then raise exception 'params are required'; end if;
  insert into saved_scenarios (clerk_user_id, name, params, from_file)
  values (trim(p_clerk_user_id), left(trim(p_name), 80), left(trim(p_params), 1000), nullif(left(trim(coalesce(p_from_file, '')), 40), ''))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.saved_scenario_create(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.saved_scenario_create(text, text, text, text, text) to anon;

drop function if exists public.saved_scenario_retire(p_id uuid, p_clerk_user_id text);
create or replace function public.saved_scenario_retire(p_id uuid, p_clerk_user_id text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update saved_scenarios
  set status = 'retired', retired_at = now(), retired_by = p_clerk_user_id
  where id = p_id and clerk_user_id = p_clerk_user_id and status = 'active'
  returning id into v_id;
  return v_id is not null;
end; $$;
revoke all on function public.saved_scenario_retire(uuid, text, text) from public, anon, authenticated;
grant execute on function public.saved_scenario_retire(uuid, text, text) to anon;

-- ═══ savings analysis log (append-only; internal batch call updated) ════════

drop function if exists public.savings_analysis_record(p_entry jsonb, p_dedupe boolean);
create or replace function public.savings_analysis_record(p_entry jsonb, p_dedupe boolean, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if p_dedupe and exists (
    select 1 from public.savings_analysis_log
    where household_id = p_entry->>'household_id'
      and surface = p_entry->>'surface'
      and calc_version = (p_entry->>'calc_version')::integer
      and inputs_hash = p_entry->>'inputs_hash'
  ) then
    return null;
  end if;
  insert into public.savings_analysis_log
    (household_id, upload_id, surface, calc_version, inputs_hash, inputs, quotes, prime_as_of, bucket, figures, cross_family_approved, override, acting_email)
  values (
    p_entry->>'household_id', nullif(p_entry->>'upload_id', '')::uuid, p_entry->>'surface',
    (p_entry->>'calc_version')::integer, p_entry->>'inputs_hash',
    coalesce(p_entry->'inputs', '{}'::jsonb), coalesce(p_entry->'quotes', '[]'::jsonb),
    p_entry->>'prime_as_of', p_entry->>'bucket', coalesce(p_entry->'figures', '{}'::jsonb),
    coalesce((p_entry->>'cross_family_approved')::boolean, false), nullif(p_entry->'override', 'null'::jsonb), p_entry->>'acting_email'
  )
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.savings_analysis_record(jsonb, boolean, text) from public, anon, authenticated;
grant execute on function public.savings_analysis_record(jsonb, boolean, text) to anon;

drop function if exists public.savings_analysis_record_batch(p_entries jsonb);
create or replace function public.savings_analysis_record_batch(p_entries jsonb, p_operator_secret text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_entry jsonb; v_count integer := 0;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  for v_entry in select * from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb)) loop
    if public.savings_analysis_record(v_entry, true, p_operator_secret) is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end; $$;
revoke all on function public.savings_analysis_record_batch(jsonb, text) from public, anon, authenticated;
grant execute on function public.savings_analysis_record_batch(jsonb, text) to anon;

drop function if exists public.savings_analysis_recent(p_limit integer);
create or replace function public.savings_analysis_recent(p_limit integer, p_operator_secret text)
returns setof public.savings_analysis_log language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.savings_analysis_log order by created_at desc limit least(coalesce(p_limit, 50), 500);
end; $$;
revoke all on function public.savings_analysis_recent(integer, text) from public, anon, authenticated;
grant execute on function public.savings_analysis_recent(integer, text) to anon;

-- ═══ SMM (uploads / rows / statuses / overrides / backfill) ═════════════════

drop function if exists public.smm_backfill_events_recent(p_limit integer);
create or replace function public.smm_backfill_events_recent(p_limit integer, p_operator_secret text)
returns setof public.smm_backfill_events language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.smm_backfill_events order by created_at desc limit least(coalesce(p_limit, 50), 500);
end; $$;
revoke all on function public.smm_backfill_events_recent(integer, text) from public, anon, authenticated;
grant execute on function public.smm_backfill_events_recent(integer, text) to anon;

drop function if exists public.smm_backfill_record(p_household text, p_module text, p_record_id text, p_fields jsonb, p_email text, p_result text);
create or replace function public.smm_backfill_record(p_household text, p_module text, p_record_id text, p_fields jsonb, p_email text, p_result text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  insert into public.smm_backfill_events (household_id, zoho_module, zoho_record_id, fields, acting_email, result)
  values (p_household, p_module, p_record_id, coalesce(p_fields, '{}'::jsonb), p_email, coalesce(p_result, 'ok'))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.smm_backfill_record(text, text, text, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.smm_backfill_record(text, text, text, jsonb, text, text, text) to anon;

drop function if exists public.smm_opportunity_status_latest();
create or replace function public.smm_opportunity_status_latest(p_operator_secret text)
returns table(household_id text, status text, acting_email text, note text, created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query
    select distinct on (s.household_id) s.household_id, s.status, s.acting_email, s.note, s.created_at
    from public.smm_opportunity_status s order by s.household_id, s.created_at desc;
end; $$;
revoke all on function public.smm_opportunity_status_latest(text) from public, anon, authenticated;
grant execute on function public.smm_opportunity_status_latest(text) to anon;

drop function if exists public.smm_opportunity_status_set(p_household text, p_upload uuid, p_status text, p_email text, p_note text);
create or replace function public.smm_opportunity_status_set(p_household text, p_upload uuid, p_status text, p_email text, p_note text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  insert into public.smm_opportunity_status (household_id, upload_id, status, acting_email, note)
  values (p_household, p_upload, p_status, p_email, p_note) returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.smm_opportunity_status_set(text, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.smm_opportunity_status_set(text, uuid, text, text, text, text) to anon;

drop function if exists public.smm_override_retire(p_id uuid, p_email text);
create or replace function public.smm_override_retire(p_id uuid, p_email text, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update public.smm_overrides set status = 'retired', retired_at = now(), retired_by = p_email where id = p_id and status = 'active';
  get diagnostics v_count = row_count;
  return v_count > 0;
end; $$;
revoke all on function public.smm_override_retire(uuid, text, text) from public, anon, authenticated;
grant execute on function public.smm_override_retire(uuid, text, text) to anon;

drop function if exists public.smm_override_set(p_household text, p_upload uuid, p_type text, p_comparable jsonb, p_source_note text, p_reason text, p_email text);
create or replace function public.smm_override_set(p_household text, p_upload uuid, p_type text, p_comparable jsonb, p_source_note text, p_reason text, p_email text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update public.smm_overrides set status = 'retired', retired_at = now(), retired_by = p_email where household_id = p_household and status = 'active';
  insert into public.smm_overrides (household_id, upload_id, override_type, comparable, source_note, reason, acting_email)
  values (p_household, p_upload, p_type, p_comparable, p_source_note, p_reason, p_email)
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.smm_override_set(text, uuid, text, jsonb, text, text, text, text) from public, anon, authenticated;
grant execute on function public.smm_override_set(text, uuid, text, jsonb, text, text, text, text) to anon;

drop function if exists public.smm_overrides_active();
create or replace function public.smm_overrides_active(p_operator_secret text)
returns setof public.smm_overrides language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.smm_overrides where status = 'active' order by created_at desc limit 500;
end; $$;
revoke all on function public.smm_overrides_active(text) from public, anon, authenticated;
grant execute on function public.smm_overrides_active(text) to anon;

drop function if exists public.smm_rows_for_upload(p_upload_id uuid);
create or replace function public.smm_rows_for_upload(p_upload_id uuid, p_operator_secret text)
returns setof public.smm_rows language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.smm_rows where upload_id = p_upload_id order by row_index asc;
end; $$;
revoke all on function public.smm_rows_for_upload(uuid, text) from public, anon, authenticated;
grant execute on function public.smm_rows_for_upload(uuid, text) to anon;

drop function if exists public.smm_rows_insert(p_upload_id uuid, p_rows jsonb);
create or replace function public.smm_rows_insert(p_upload_id uuid, p_rows jsonb, p_operator_secret text)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer := 0; v_row jsonb; v_i integer := 0;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  for v_row in select * from jsonb_array_elements(p_rows) loop
    insert into public.smm_rows (upload_id, row_index, raw) values (p_upload_id, v_i, v_row);
    v_i := v_i + 1; v_count := v_count + 1;
  end loop;
  update public.smm_uploads set raw_row_count = v_count where id = p_upload_id;
  return v_count;
end; $$;
revoke all on function public.smm_rows_insert(uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.smm_rows_insert(uuid, jsonb, text) to anon;

drop function if exists public.smm_upload_create(p_filename text, p_uploaded_by text);
create or replace function public.smm_upload_create(p_filename text, p_uploaded_by text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update public.smm_uploads set superseded = true where superseded = false;
  insert into public.smm_uploads (filename, uploaded_by, status) values (p_filename, p_uploaded_by, 'uploading') returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.smm_upload_create(text, text, text) from public, anon, authenticated;
grant execute on function public.smm_upload_create(text, text, text) to anon;

drop function if exists public.smm_upload_finalize(p_upload_id uuid, p_parsed integer, p_mortgages integer, p_collapsed integer, p_notes jsonb);
create or replace function public.smm_upload_finalize(p_upload_id uuid, p_parsed integer, p_mortgages integer, p_collapsed integer, p_notes jsonb, p_operator_secret text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update public.smm_uploads
  set parsed_row_count = p_parsed, mortgage_count = p_mortgages, collapsed_count = p_collapsed,
      notes = coalesce(p_notes, '{}'::jsonb), status = 'ready'
  where id = p_upload_id;
end; $$;
revoke all on function public.smm_upload_finalize(uuid, integer, integer, integer, jsonb, text) from public, anon, authenticated;
grant execute on function public.smm_upload_finalize(uuid, integer, integer, integer, jsonb, text) to anon;

drop function if exists public.smm_uploads_recent(p_limit integer);
create or replace function public.smm_uploads_recent(p_limit integer, p_operator_secret text)
returns setof public.smm_uploads language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from public.smm_uploads order by uploaded_at desc limit least(coalesce(p_limit, 24), 200);
end; $$;
revoke all on function public.smm_uploads_recent(integer, text) from public, anon, authenticated;
grant execute on function public.smm_uploads_recent(integer, text) to anon;

-- ═══ view-as (impersonation sessions + audit) ═══════════════════════════════

drop function if exists public.view_as_end(p_id uuid);
create or replace function public.view_as_end(p_id uuid, p_operator_secret text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_found boolean;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  update view_as_sessions set ended_at = now() where id = p_id and ended_at is null;
  v_found := found;
  return v_found;
end; $$;
revoke all on function public.view_as_end(uuid, text) from public, anon, authenticated;
grant execute on function public.view_as_end(uuid, text) to anon;

drop function if exists public.view_as_list(p_limit integer);
create or replace function public.view_as_list(p_limit integer, p_operator_secret text)
returns setof public.view_as_sessions language plpgsql security definer set search_path = public as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  return query select * from view_as_sessions order by started_at desc limit greatest(1, least(coalesce(p_limit, 100), 500));
end; $$;
revoke all on function public.view_as_list(integer, text) from public, anon, authenticated;
grant execute on function public.view_as_list(integer, text) to anon;

drop function if exists public.view_as_start(p_viewer_clerk_id text, p_viewer_email text, p_partner_zoho_id text, p_partner_name text, p_portal_role text);
create or replace function public.view_as_start(p_viewer_clerk_id text, p_viewer_email text, p_partner_zoho_id text, p_partner_name text, p_portal_role text, p_operator_secret text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then raise exception 'operator secret required' using errcode = '42501'; end if;
  if coalesce(trim(p_viewer_email), '') = '' then raise exception 'viewer_email is required'; end if;
  if coalesce(trim(p_partner_zoho_id), '') = '' then raise exception 'partner_zoho_id is required'; end if;
  insert into view_as_sessions (viewer_clerk_id, viewer_email, partner_zoho_id, partner_name, portal_role)
  values (coalesce(p_viewer_clerk_id, ''), trim(p_viewer_email), trim(p_partner_zoho_id),
          coalesce(nullif(trim(p_partner_name), ''), p_partner_zoho_id), coalesce(p_portal_role, ''))
  returning id into v_id;
  return v_id;
end; $$;
revoke all on function public.view_as_start(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.view_as_start(text, text, text, text, text, text) to anon;
