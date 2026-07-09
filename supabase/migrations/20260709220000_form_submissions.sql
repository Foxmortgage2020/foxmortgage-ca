-- form_submissions: guaranteed capture for the public contact form, the
-- private-lending investor inquiry, and the partner-portal referral form.
-- Every inbound submission is written here FIRST, before the Zoho create
-- and the notification email, so nothing can be silently lost again.
-- Applied to the foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj)
-- on 2026-07-09; this file is the repo record of that migration.

create table if not exists public.form_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source text not null check (source in ('contact', 'investor-inquiry', 'partner-referral')),
  raw_payload jsonb not null,
  submitter_name text,
  submitter_email text,
  clerk_user_id text,
  partner_zoho_id text,
  partner_role text,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'zoho_created', 'zoho_failed')),
  zoho_record_id text,
  error_detail text,
  resend_message_id text
);

alter table public.form_submissions enable row level security;

-- The app holds the anon key server-side (never NEXT_PUBLIC) and only needs
-- to insert rows and stamp processing outcomes. No read access: this table
-- is a write-only mailbox from the app's perspective; reads happen in the
-- Supabase dashboard or with the secret key.
revoke all on public.form_submissions from anon;
grant insert on public.form_submissions to anon;

create policy form_submissions_anon_insert
  on public.form_submissions for insert to anon
  with check (true);

-- Outcome stamping goes through a narrow security-definer function instead
-- of a direct UPDATE (an RLS + column-grant PATCH silently matched zero
-- rows), keeping the app role insert-only on the table itself.
create or replace function public.mark_form_submission(
  p_id uuid,
  p_status text default null,
  p_zoho_record_id text default null,
  p_error_detail text default null,
  p_resend_message_id text default null
) returns void
language sql
security definer
set search_path = public
as $$
  update public.form_submissions set
    processing_status = coalesce(p_status, processing_status),
    zoho_record_id = coalesce(p_zoho_record_id, zoho_record_id),
    error_detail = coalesce(p_error_detail, error_detail),
    resend_message_id = coalesce(p_resend_message_id, resend_message_id)
  where id = p_id;
$$;

revoke all on function public.mark_form_submission(uuid, text, text, text, text) from public;
grant execute on function public.mark_form_submission(uuid, text, text, text, text) to anon;

create index if not exists form_submissions_created_at_idx
  on public.form_submissions (created_at desc);
create index if not exists form_submissions_needs_attention_idx
  on public.form_submissions (processing_status)
  where processing_status <> 'zoho_created';
