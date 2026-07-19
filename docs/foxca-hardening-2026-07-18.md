# FOXCA-wide operator-secret hardening — 2026-07-18

A micro-session that ends the "anon key = service account" posture across the WHOLE FOXCA project
(`skfeivzhqvrefnkqjwtj`), not just client links (B7-P) and client presentation (B8b).

Migration `20260718190000_foxca_operator_secret_hardening.sql`. tsc clean, `next build` green,
**818 → 823 tests**. Committed, NOT pushed.

---

## The hole, restated FOXCA-wide

The FOXCA anon key (`FOXCA_SUPABASE_KEY`) is NOT a secret — it is shared with public form-intake and
sits client-side on the public forms. Every admin security-definer function was `grant execute to
anon`, so anyone holding the anon key was a de facto service account for the entire FOXCA surface:
mint/forge compliance records, staff provisions, renewal decisions, savings-log rows, Ask Fox
conversations, SMM overrides, and impersonation audit rows — and READ the compliance register (holder
names, complaint details), the view-as logs, staff PII, and every failed public form submission (with
its submitter contents).

## The fix — the client_link / client_presentation pattern, exactly

Each hardened function gains a required last argument `p_operator_secret` and refuses (`42501`) unless
it matches the value the server holds in `FOXCA_OPERATOR_SECRET` — the **same** secret B7-P and B8b
use, so **no new env**. One shared helper, `public.foxca_operator_secret_ok(text)`, carries the
sha256 (not anon-callable). The **old signature is DROPPED first** (the overload trap: `create or
replace` with a new arg list leaves the old un-secured signature callable and defeats the fix). Every
`language sql` function was rewritten to `plpgsql` so it can `raise` the same `42501` the rest do.

Stores thread the secret through a single new helper `lib/foxca-secret.ts` (`foxcaOperatorSecret()`,
throw-if-unset). One function that was previously an open residual is now closed:
`client_link_event_record` (B7-P had left it anon-callable — "anon can forge audit rows"; that residual
is gone).

## Deploy-ordering consequence — LOUD (the B7-P pattern, at FOXCA-wide scale)

**Applying this migration DROPS the old signatures, so the currently-deployed code (which calls these
functions WITHOUT the secret) errors on EVERY hardened function until this session's code deploys.**
That is the entire FOXCA admin surface: compliance, notifications, people (provisioning/offboarding),
renewals, SMM, Ask Fox, client constraints, saved scenarios, view-as, the savings log, and the Status
page's form-intake ack/stats. The stores fail gracefully (error states, not crashes), but those
features are DOWN between apply and deploy. **Push and deploy this session's commit immediately.**
The client-facing status page, the token-keyed presentation, and public form CAPTURE are unaffected
(their functions stay open — see the table).

---

## Every function, ruled

**Legend.** `SECRET` = hardened this session · `SECURED✓` = already secret-gated (B7-P/B8b) ·
`OPEN` = stays anon-callable with the reason.

### Already secured (B7-P + B8b) — unchanged (16)
`client_link_create`, `client_link_revoke`, `client_links_for_deal`, `client_link_events_recent`,
`client_letter_mint`, `client_letter_supersede`, `client_letters_for_deal`, `client_offer_create`,
`client_offer_delete`, `client_offer_set_published`, `client_offers_for_deal`,
`client_scenario_upsert`, `client_scenario_set_published`, `client_scenario_delete`,
`client_scenarios_for_deal`, `client_presentation_secret_ok` (the B8b helper). — `SECURED✓`

### Stays OPEN (9), with the reason
| Function | Ruling | Reason |
|---|---|---|
| `client_link_resolve` | OPEN | Token-keyed. The 256-bit token hash IS the per-record secret; the public status page holds only the anon key. |
| `client_link_touch` | OPEN | Token-keyed (a client opening their own page stamps last-viewed). |
| `client_scenarios_for_token` | OPEN | Token-keyed client-page read. |
| `client_offers_for_token` | OPEN | Token-keyed client-page read. |
| `client_letter_for_token` | OPEN | Token-keyed client-page read. |
| `mark_form_submission` | OPEN | Public form-intake stamp; the anon key is the deliberate public-capture credential for that pipeline. |
| `notifications_list_for_user` | OPEN | User-scoped READ keyed by the caller's clerk id; low value. |
| `notification_prefs_get` | OPEN | User-scoped READ keyed by the caller's clerk id. |
| `saved_scenarios_list_for_user` | OPEN | User-scoped READ keyed by the caller's clerk id. |

### Hardened this session (65) — gained `p_operator_secret`
Grouped by family (all → `SECRET`):

- **form-intake (admin side):** `acknowledge_form_submission`, `form_submission_failures` (exposes
  failed-submission PII), `form_submission_stats`.
- **Ask Fox:** `agent_conversation_create/_get/_set_status`, `agent_conversations_list`,
  `agent_message_append`, `agent_messages_list`, `agent_card_create/_decide/_get`, `agent_cards_list`.
- **client constraints + pins:** `client_constraint_add/_retire`, `client_constraints_for`,
  `pin_confirmation_add`, `pin_confirmations_for`.
- **client-link audit:** `client_link_event_record` (closes the B7-P residual).
- **compliance (FSRA register):** `compliance_complaint_create/_set_status`, `compliance_complaints_list`,
  `compliance_credential_save/_retire`, `compliance_credentials_list`, `compliance_events_list`,
  `compliance_policies_list`, `compliance_policy_create/_update/_ack`, `compliance_policy_acks_list`,
  `compliance_policy_versions_list`.
- **notifications (producer + user writes):** `notification_upsert`, `notification_mark_read`,
  `notification_mark_all_read`, `notification_pref_set`.
- **people:** `people_provision_record`, `people_provision_list`, `people_offboard_record/_check/_get`,
  `people_offboard_list`.
- **renewals:** `renewal_event_record`, `renewal_events_for_deal`, `renewal_events_recent`.
- **saved scenarios (user writes):** `saved_scenario_create`, `saved_scenario_retire`.
- **savings-analysis log:** `savings_analysis_record` (batch's internal call updated to pass the
  secret), `savings_analysis_record_batch`, `savings_analysis_recent`†.
- **SMM:** `smm_upload_create/_finalize`, `smm_rows_insert`, `smm_rows_for_upload`, `smm_uploads_recent`,
  `smm_opportunity_status_set/_latest`, `smm_override_set/_retire`, `smm_overrides_active`,
  `smm_backfill_record`, `smm_backfill_events_recent`†.
- **view-as (impersonation):** `view_as_start`, `view_as_end`, `view_as_list`.

† `savings_analysis_recent` and `smm_backfill_events_recent` have **no caller in the codebase** today
(defined but unwired). They are hardened in the DB anyway (an unused anon-grant is still a hole); no
store change was needed. A future feature that wires them must pass the secret.

**Judgment stated (deviation from a literal read of "admin-mutating"):** the brief's read exemption is
specifically *user-scoped or token-keyed* reads. Admin list-reads (the compliance register, view-as
logs, staff provisions, savings analyses, SMM data) are neither, and they expose business/PII/audit
data off the public anon key — the same hole the session exists to close — so they are hardened too.
User-scoped WRITES (notification read-state, saved scenarios) are hardened as well (they are writes,
not client-flow writes, and the anon key could otherwise mutate any user's state by passing their
clerk id).

---

## Verification

- **tsc clean**, `next build` green, **823 tests** (from 818): `tests/foxca-secret-hardening.test.ts`
  (+5) proves the STORE half per family — a source-coverage sweep that every hardened call threads
  `p_operator_secret` and every exempt read does not, plus a runtime pass that a representative from
  each family sends the env value and a missing `FOXCA_OPERATOR_SECRET` fails LOUD (throws) before any
  network call. No existing test regressed.
- **Live posture, proven as the anon role** (python + PostgREST): every hardened function refuses
  without the secret (`42501 operator secret required`), succeeds with it, and the old un-secured
  signature is gone (`42883`). Re-enumeration confirms all 65 carry the guard. (Results in the session.)

## Guardrails

No new env (the same `FOXCA_OPERATOR_SECRET`). No fox-underwriting changes. No Zoho writes, no sends.
No behavior change for legit callers (the stores pass the secret; the function bodies are otherwise
byte-preserved). Public repo — the raw secret is never committed; the migration carries only its
sha256. Committed, NOT pushed.
