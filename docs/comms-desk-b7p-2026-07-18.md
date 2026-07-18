# Brief B7-P — The comms desk (foxmortgage-ca)

**Date:** 2026-07-18 · **Repo:** foxmortgage-ca (portal only; no fox-underwriting, n8n, or Zoho changes)
**Base:** portal `main` `470ccf0` (B6.4). **Prerequisite:** B7-W (`f7e302e`) merged + live. **Suite:** 764 → **783** (+19), tsc clean, `next build` green.
**Two commits:** Task 0 first (`f60d987`), then Tasks 1-4.

The portal SURFACE over B7-W's client comms engine. Clients hear from the practice at the moments that
matter, in Michael's voice, with every single message individually approved. This repo reads the workbench
comms tables through `portal_readonly` and writes ONLY through the workbench gates API. **No send ever
originates in this repo — the portal approves, the workbench sends.** The engine ships DARK.

## The contract consumed (B7-W, `docs/gates-api.md` in the workbench)

- **Tables (portal_readonly SELECT, verified live):** `renewal_sequences`, `renewal_touches`,
  `renewal_touch_drafts`, `renewal_settings` (0047) + `comms_suppressions` (0050). The comms engine shares
  the renewal chassis, discriminated by `renewal_sequences.touch_kind`.
- **Four comms touch kinds:** `stage_update`, `app_chase`, `doc_chase`, `review_ask` (the fifth, `renewal`,
  is the renewal drip engine — kept apart).
- **Draft `sources_snapshot`** is deterministic (the comms templates are string substitution, not a model):
  `{template, merge_fields, copy_gate, held_reason}` for a generated draft, `{source, edited_by}` for a
  human edit. The portal renders this honestly (merge fields + copy-gate state) — there is no per-sentence
  provenance to show, unlike the renewal skill.
- **Gate endpoints (all `comms.decide`, admin, human-only):** approve `{note?}` (approves AND sends,
  triple-gated on the workbench), edit `{subject?, body}`, skip `{reason}`, settings
  `{comms_enabled?, comms_mailing_address?, comms_max_per_client_per_day?, comms_max_per_client_per_week?}`.

## Live posture verified (read-only, workbench `rnupbdmpxfwsowiqhcqv`)

`portal_readonly` holds SELECT on all five comms surfaces. **0 comms sequences, 0 comms touches,
`renewal_settings` EMPTY (0 rows), 0 suppressions.** So the live queue is honestly empty (B7-W shipped dark;
the hourly `comms-tick` cron mints nothing until the workbench's `ZOHO_*` env lands), and the kill switch is
off **by absence, not by value** — the load-bearing Task 4 finding, proven against the live table.

## Task 0 — Harden the client-link function grants (own commit `f60d987`, FIRST)

**The hole:** the seven `client_link_*` FOXCA functions are each `grant execute ... to anon`, and the FOXCA
anon key is NOT a secret (it is shared with public form-intake). So anyone holding it was a de facto service
account for client links: mint a link to any deal, enumerate a deal's link metadata, revoke links.

**The fix (migration `20260718160000`, applied live to FOXCA `skfeivzhqvrefnkqjwtj`):** each of the four
admin-side functions (`client_link_create`, `client_link_revoke`, `client_links_for_deal`,
`client_link_events_recent`) gains a required `p_operator_secret` argument, checked inside the function body
against a **sha256 the function carries**; a mismatch/absence raises `42501 operator secret required`. The
raw secret lives ONLY in a new server-only env var, `FOXCA_OPERATOR_SECRET` — this **public repo carries only
the hash** (a sha256 of a 256-bit random secret is not reversible, so it is safe to commit). The OLD
signatures are DROPPED so no un-secured overload survives (the overload trap). `resolve` and `touch` stay
anon (a valid token hash is their secret); **`event_record` stays anon per the brief's explicit
classification** — see the residual below. `lib/client-links-store.ts` threads the secret into every admin
rpc (`foxcaOperatorSecret()`, throw-if-unset — the SESSION_SECRET discipline; the deal-room list read is
`.catch`-guarded so it degrades rather than crashing).

**Proven live as the `anon` role:**

| Case | Result |
|---|---|
| `client_links_for_deal(deal, 'WRONG-SECRET')` | `42501 operator secret required` |
| `client_link_create(..., null)` | `42501 operator secret required` |
| `client_link_create(...)` (old 5-arg) | `42883 does not exist` (no un-secured overload) |
| `client_links_for_deal(deal, <correct secret>)` | succeeds |
| `client_link_resolve(<hash>)` (client-flow) | succeeds, unaffected |

`tests/client-links-secret.test.ts` proves the store sends `p_operator_secret` on create/revoke/links_for_deal,
never on resolve, and throws (never sends an empty secret) when the env is unset.

**THE NEW ENV VAR — for Michael to set in Vercel (the brief's explicit authorization):**
`FOXCA_OPERATOR_SECRET`. It is set in `.env.local` (local dev) already; set it in **Vercel (all targets,
encrypted, via the REST API — never `vercel env add` from a pipe)** to the same value.

**DEPLOY FLAG (loud):** the migration is applied live NOW, so the currently-deployed production portal (old
store code, no secret) can no longer create/revoke/list client links — the deal-room Client portal card's
create/revoke/list is down until Michael sets `FOXCA_OPERATOR_SECRET` in Vercel and deploys this commit.
**Client-facing `resolve` is unchanged, so existing client links keep working.** The window is narrow
(client-link creation is a rare manual action) and self-inflicted-with-notice; it is the correct, complete
closure of a real hole for a public repo under commit-not-push.

**Residual, brief-sanctioned:** `client_link_event_record` stays anon-callable (the brief classifies it as
client-flow). So an anon-key holder can still INSERT rows into `client_link_events` (append-only audit noise;
no data exposure, no link creation/revocation). Flagged; hardening it would deviate from an explicit brief
instruction, so it is left as the brief chose.

## Task 1 — The link constants

`lib/contact.ts` `CONTACT.bookingUrl` is set to `https://foxmortgage.zohobookings.com/4936582000000975003`
(the field six Support pages already read, so this is genuinely one source everywhere). `CONTACT.reviewUrl`
is added as an empty **named placeholder**: every surface that uses it is truthiness-gated
(`{CONTACT.reviewUrl && …}`), so it renders NOTHING until Michael supplies a value — distinct from
`bookingUrl`, which has a Support-page fallback. The client portal Questions block adopts the booking link
(white-outline treatment; the single-lime rule — Call is the only lime on that page — stays intact), and a
review link is added the same truthiness-gated way (absent while empty).

*(Naming note: the brief's `BOOKING_URL`/`REVIEW_URL` land as fields on `CONTACT` — the existing style, where
`CONTACT.bookingUrl` already lives beside the phone number — not as parallel top-level constants, which would
be the "two sources" the "one source, everywhere" instruction forbids.)*

## Task 2 — The comms queue on Approvals

The Approvals area gains a **Client comms** tab over the new `getCommsQueue` fetcher (a workbench read via
`portal_readonly`, folded into `getApprovalsData` so the shared refetch reconciles it after a decision). A
self-contained `CommsQueue` component renders each pending touch **grouped by client**, showing the FULL
rendered message exactly as the client would receive it, the touch kind + milestone label, the copy's
merge-field provenance, and the held reason where held. Controls: **Approve & send / Edit / Reject** (with a
reason) — **navy (`bg-cool-800`), mirroring the renewal drip desk exactly**, so there is **zero new lime and
no decision token** and the exhaustive lime audit stays green with zero registry edits (exactly the brief's
"the Approve control follows whatever the renewal desk does today").

**Calibration for the catch-up crop:** the first live queue will hold stage updates for transitions weeks ago
beside current drafts. Any touch whose send date has slipped ≥ 7 days into the past shows an amber
"queued N days ago" flag, the reject flow pre-seeds the reason on such cards ("no longer current"), and the
full message is always visible so a stale update is unambiguous to reject.

**CRITICAL FINDING (findings first):** `getRenewalDripQueue` + `getRenewalSequenceStates` did NOT filter
`touch_kind`. The comms engine shares `renewal_touches`/`renewal_sequences`, so once comms touches exist they
would leak onto the RENEWAL drip desk (mislabelled). Both renewal fetchers are now scoped to
`touch_kind='renewal'`, and `getCommsQueue` scopes to the four comms kinds. On current live data (only
renewal sequences exist) the scoping is a provable no-op; it is correct going forward.

## Task 3 — The per-deal comms timeline

Every deal room gains a quiet, read-only `DealCommsCard` (a file-level Section beside the Client portal card)
over `getDealCommsTimeline`: sent touches with dates and kinds, pending drafts with a "review in the comms
queue" link, and the suppression state if the client unsubscribed. Nothing is decided here.

## Task 4 — Kill switch, suppression, and fail-closed

`CommsSettings` mounts on the Settings page (gated `comms.decide`, read-only in demo). It shows the **master
kill switch** (the flip is a gated `comms.decide` action; the workbench upsert creates the settings row on
the first flip, and `comms_enabled` defaults false, so the switch's very first ON is an explicit human act),
the per-client caps, the CASL **mailing address**, and the **suppression list** — read-only and NEVER
removable from the UI (CASL permanence, stated in the copy).

**Fail-closed (the load-bearing addition):** the live `renewal_settings` table is empty, so the switch is off
by absence. The portal read model `deriveCommsSettings(row | null)` returns `commsEnabled: false,
hasSettingsRow: false` for an absent row (and for any non-`true` value), so the portal NEVER presents the
engine as sendable without an explicit `comms_enabled === true` row. `tests/comms.test.ts` asserts this ("no
send is possible with the table empty"). The workbench send path additionally fails closed — its approve gate
pre-flights the kill switch and refuses before approving.

## Adversarial review — 4 raised, 4 CONFIRMED, all fixed

Five dimensions (send-safety/fail-closed, demo isolation, workbench-contract alignment, Task 0 security,
lime/copy/census/a11y), each finding independently verified by a refuting skeptic against the actual code.

1. **MEDIUM + LOW (same defect) — the comms approve 409 reason was masked.** The workbench approve gate
   overloads HTTP 409 with the true fail-closed reason (`client comms are turned off (the kill switch)…`,
   suppressed, capped), but `mapGateResponse` collapses every 409 to the fixed "Already decided." — so in the
   engine's dark-by-default first-use state, clicking Approve told Michael the message was already decided
   when it never sent. **Fixed:** a SCOPED `surface409` option on `gateCall`, used ONLY by
   `approveCommsTouch`, surfaces the workbench's real 409 reason; statements/sheets/etc. keep the fixed copy
   (their 409 genuinely means already-decided). `tests/comms-gate.test.ts` proves both.
2. **LOW — comms edit accepted a body ≥ 5 chars, but the workbench requires ≥ 20.** A short edit would 422.
   **Fixed:** 20 in the edit route and the Save button.
3. **LOW — the CASL address allowed ≤ 500 with no minimum, but the workbench bounds it 6..300.** A long or
   too-short address would 422. **Fixed:** 6..300 in the settings route and the input.

Everything else was refuted (send-safety is intact — no wrong send ever occurs; demo isolation is complete;
the touch_kind scoping is correct; no lime/decision token; census untouched).

## Render proofs (blessed pattern)

Local dev on the dev Clerk instance, signed in as an ephemeral TEST admin **created and DELETED in-session**,
navigating read-only, in **demo mode** (synthetic design cast only — no real client anywhere), no console
errors. Captured:

- **The comms queue:** all four touch kinds (stage update, application nudge, document chase, review
  request), the held review-ask ("held: the review link is not configured yet"), the catch-up badge
  ("queued 30 days ago"), and — correctly — no decision controls (demo is read-only).
- **The deal-room comms card:** two sent stage updates (application received, submitted to the lender) + a
  waiting document chase + the "review in the comms queue" link.
- **The settings surface:** the dark master switch ("the engine is dark; nothing sends even when a message is
  approved"), the mailing address, 1/day 3/week caps, and the CASL-permanent suppression list
  (eli@example.com), read-only in demo.
- **375px:** measured `document.documentElement.scrollWidth === window.innerWidth` (375 === 375) — zero
  horizontal overflow.

## Live proof (minimal)

The read posture is verified live (grants + the honest-empty comms tables). Because B7-W shipped dark and the
comms-tick cron has minted nothing (it needs the workbench's `ZOHO_*` env), the live queue is EMPTY, so **no
approve was exercised** — that is the honest expected state, not a gap. The first live approved sends are
Michael's step.

## Verification summary

- tsc clean; `next build` green; **783 tests** (Task 0 store +5, comms model +9, comms gate +3, demo +2).
- Task 0 proven live (anon-role refusals shown; client-flow unaffected; env var named).
- Task 4 fail-closed proven (no settings row → OFF, asserted).
- Demo: the queue/timeline/settings resolve from fixtures with ZERO real reads; all four comms writes reject
  `DemoWriteBlocked` — both asserted (`tests/demo.test.ts`). The comms components carry no lime and no
  decision token; the lime audit is green with zero registry edits.
- Census untouched (the fetcher/gate additions do not alter existing behavior beyond the intended
  `touch_kind` scoping, a no-op on current live data).

## Michael's steps to go live (recorded, not done here)

1. Set `FOXCA_OPERATOR_SECRET` in Vercel (all targets, encrypted, REST API) to the value in `.env.local`, and
   deploy this commit (restores admin client-link create/revoke/list). *(Do this promptly — see the Task 0
   deploy flag.)*
2. To turn comms on: set the workbench comms env (`ZOHO_*` for the cron to mint touches, `RESEND_API_KEY` +
   `RENEWAL_SEND_MODE=test` + `RENEWAL_TEST_RECIPIENT=mfox@foxmortgage.ca` to send to himself first), set the
   mailing address and flip the master switch on the Settings comms surface, then approve one stage-update
   touch — it sends to his own inbox.
3. Optional: set `CONTACT.reviewUrl` (a Google review link) — the review link surfaces light up on their own.

## Follow-ups / residuals

- **`client_link_event_record` stays anon-callable** (brief classification) — an anon-key holder can still
  insert audit rows. Hardening it is a one-migration follow-up if the residual is unwanted.
- **The comms tables are still named `renewal_*`** (B7-W's chosen extension); a cosmetic rename to
  `campaign_*` is deferred workbench-side.
- **A rate limiter on the client token page** (the one anonymous Zoho-touching route) remains a near-term
  follow-up, unchanged by this brief.
