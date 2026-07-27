-- The homepage "Start Monitoring" CTA (app/page.tsx) is a native HTML form
-- POST. It pointed at /api/smm-enroll, whose handler begins with
-- `await req.json()` — that throws on the urlencoded body a native form
-- sends, so every homepage submission 500'd and the email was never stored
-- anywhere. That route also has no capture step at all.
--
-- The CTA now posts to /api/smm-interest, which runs the same persist-first
-- pipeline as the other three public forms (lib/form-intake.ts) before
-- redirecting the visitor into the full enrollment wizard with their email
-- prefilled. This migration widens the source CHECK so that capture can
-- land; without it the insert is refused and the fix is inert.
--
-- 'smm-interest' rows terminate at processing_status 'received' by design:
-- the row is the guaranteed capture, and the wizard creates the
-- authoritative Zoho record with its CASL consent. They are never counted
-- as Zoho failures.

alter table public.form_submissions
  drop constraint if exists form_submissions_source_check;

alter table public.form_submissions
  add constraint form_submissions_source_check
  check (source = any (array[
    'contact'::text,
    'investor-inquiry'::text,
    'partner-referral'::text,
    'smm-interest'::text
  ]));

-- Replay support (B0). form_submission_failures() returns metadata only, so
-- it cannot drive a re-attempt: reprocessing a failed row needs the original
-- payload. This returns the failed rows WITH their payload so an admin-gated
-- endpoint can rebuild the Zoho record and stamp the outcome through the
-- existing mark_form_submission().
--
-- Same posture as every other admin-side FOXCA function (2026-07-18
-- hardening): security definer, requires the operator secret, and is not
-- reachable with the public anon key alone.

-- Partner attribution rides its own columns, not raw_payload, so a replayed
-- referral must carry them or it would rebuild the lead unattributed — worse
-- than not replaying it at all.
drop function if exists public.form_submission_replay_candidates(text);

create function public.form_submission_replay_candidates(p_operator_secret text)
returns table (
  id uuid,
  created_at timestamptz,
  source text,
  raw_payload jsonb,
  submitter_name text,
  submitter_email text,
  partner_zoho_id text,
  partner_role text,
  error_detail text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.foxca_operator_secret_ok(p_operator_secret) then
    raise exception 'operator secret required' using errcode = '42501';
  end if;

  return query
    select f.id, f.created_at, f.source, f.raw_payload,
           f.submitter_name, f.submitter_email,
           f.partner_zoho_id, f.partner_role, f.error_detail
    from public.form_submissions f
    where f.processing_status = 'zoho_failed'
    order by f.created_at asc
    limit 100;
end;
$$;

revoke all on function public.form_submission_replay_candidates(text) from public, anon, authenticated;
grant execute on function public.form_submission_replay_candidates(text) to anon;
