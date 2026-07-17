# B5 — The client portal: a file's status in the client's language (2026-07-17)

The first client-facing surface. A client opens a private link and sees where their
mortgage stands, in plain words — the same lifecycle truth the admin portal reads,
spoken to the person whose file it is. It shows no internal word, no other client's
anything, and never tells a person no. Base `4c9504b` (the toast fix, live). Suite
started at **653**, ends at **681**.

## Findings first

1. **The magic-link machinery could not be reused — it is the wrong shape.** The
   onboarding links live in ZOHO, in plaintext, as three fields on the Partners record
   (`Magic_Link_Token` / `_Expires_At` / `_Used_At`). That holds ONE token per record,
   so a second link overwrites the first; there is no `revoked_at`; the TTL is a
   hardcoded 14 days; and a plaintext token in the CRM is a live credential in every
   export. A client links table cannot be any of those things. Built fresh (Task 2),
   copying only the good parts: 256-bit opaque randomness, a strict shape gate, and
   constant-time comparison.
2. **The brief's "service-role access from the server only" contradicts the codebase,
   and I did not add a key.** There IS no FOXCA service-role key — only the anon key
   (`FOXCA_SUPABASE_KEY`) exists — and the workbench's service-role key was deliberately
   *deleted* on 2026-07-09. Minting a new privileged key class would reverse that
   decision. I used the established house posture instead: RLS on, no policies, table
   grants revoked, and a few narrow security-definer functions. That is strictly
   *narrower* than service-role — it exposes four operations, not a schema — and it is
   **verified live**: a direct read of either table returns `42501`, while the resolve
   function answers. If Michael truly wants a service-role key, that is his call to
   make, not mine to assume.
3. **A live PII leak, found while mapping the magic-link code, fixed in its own commit
   (`ee976a7`).** `/onboard/expired` is a *public* route. It took a partner id from the
   query string, checked only its shape, looked the partner up in Zoho, and rendered
   "Linked to {name} ({email})" to whoever loaded the page. Zoho partner ids are an org
   prefix plus a short sequence, so the space is walkable — anyone could harvest partner
   names and emails one request at a time. The code even called it "never as a leak
   channel", missing that the visitor chooses which record is resolved. Removed; Mike's
   notification email (built independently by the API) is unaffected.
4. **Realtor and lawyer fields DO exist** (contrary to the brief's hypothesis):
   `Realtor`, `Seller_s_Realtor`, and `Lawyer` are real Zoho lookups on Potentials,
   already queried by the partner portals. FP and mortgage agent have no dedicated Deals
   lookup — they attribute via `Referral_Partner`, which does not say which *kind* of
   partner it holds — so this session shows realtor and lawyer only, from their own
   fields, and never guesses a role.
5. **No deterministic Finmo upload URL can be derived** from anything this repo stores.
   The one documented Finmo URL is a broker-side deal link built from a `teamId` this
   repo never reads; a per-borrower upload URL would need the Finmo borrower id (written
   only to Contacts, never read) *and* a URL template recorded nowhere. Deriving one
   would be guessing at a third party's scheme and mailing it to a client. The documents
   card ships the honest line instead (the secure link arrives by email), per the
   brief's fallback.
6. **No rate limiting exists anywhere in this repo** (verified: zero limiter deps, zero
   429 paths). The brief said to note this rather than invent infrastructure, so: the
   token route has no rate limit. The mitigations that ARE in place: a 256-bit token
   (unguessable), a shape gate before any I/O, and identical output for every failure so
   the route is not an oracle. A real limiter (the token route is the one anonymous
   surface that hits Zoho) is a follow-up, recorded on the roadmap.
7. **I introduced, caught, and fixed two of my own bugs during render proofs** — both
   the kind a green unit suite hides. (a) A circular import: I put `AGENT_MEMBER` in
   `lib/client-file.ts`, which the demo fixtures import, which Zoho imports, which
   imports the fixtures — the page crashed at request time while every test passed. Fixed
   by moving the constant to a leaf `lib/client-team.ts`. (b) The demo fixture fell back
   to the default file for *any* unknown token, so a garbage token rendered the demo
   client's page instead of not-found — demo was lying about the exact behaviour this
   surface most needs. Removed the fallback and added a regression test. Both are
   recorded because they are the point: a client-data surface is only proven by driving
   it.

## Task 0 — Housekeeping (own commits)

- **The homepage testimonials are gone** (`7107031`): three placeholder reviews under a
  "Based on Google Reviews" banner — fabricated reviews attributed to a real platform, on
  a licensed agent's site. Beyond the brief, the same claim lived a second time as a
  "5.0 Google Rating" line in the trust bar; removing the testimonials while leaving that
  would have kept the exposure, so it went too. The section returns when there are
  consented reviews, the same bar /smm holds. **Flagged, not touched:** the trust bar
  says "200+ Clients Monitored" while /smm says "73" and the live export carries 41 —
  three possibly-different things only Michael can reconcile.
- **The two orphans are deleted** (ConditionsPanel, StubPage — zero consumers confirmed).
- **CLAUDE.md's render-proof rule now blesses the dev-instance ephemeral-TEST-admin
  pattern** and retires the temp-public-route pattern (which edited middleware to prove a
  page).

## Task 1 — The page

`/portal/file/[token]`, server-rendered, `force-dynamic`, `noindex` (metadata on the page
+ `X-Robots-Tag: noindex, nofollow, noarchive` and `Referrer-Policy: no-referrer` in
next.config.js — verified in the built routes manifest). Middleware exempts
`/portal/file/(.*)` (the token is the auth); `PortalLayoutClient` early-returns a bare
page so no partner chrome wraps it. The service worker already treats every `/portal`
path as network-only, so a client's page is never cached (verified from the worker
source, no change needed). Sections render only when their data is real: greeting, the
five-phase journey in client words with the current step's sentence and the
"what we need from you" line when the step implies one, the closing countdown, the
documents line, the team, one contact block, and the compliance footer. An unmapped
stage logs loudly server-side and shows the calm generic — the client never sees an
error or an internal word.

## Task 2 — The link machinery

`lib/client-links.ts` (pure): mint (32 random bytes, hex), `hashClientToken` (sha256 —
only the hash is stored), a strict `^[a-f0-9]{64}$` shape gate (also keeps the token
dot-free, so Clerk's middleware never skips it), constant-time compare, 90-day expiry,
and `linkState` (revoked outranks expired). `lib/client-links-store.ts` (the FOXCA twin)
+ migration `20260717150000` (applied live). Two POST route handlers under
`app/api/portal/admin/client-links/` follow the house order exactly: gate
(`client.link.manage`, admin) → demo refusal → validate → act → audit. The **raw token
is returned exactly once**, to the admin who clicked create; only its hash is stored.
Invalid, expired, revoked, and never-existed all render one identical not-found page. The
deal-room "Client portal" card creates, copies, and revokes; **v1 sends nothing** —
Michael pastes the link into his own message.

## The clientJourney sign-off table (Michael's word-level review)

Every cell is a one-line edit in `config/lifecycle.ts` (`CLIENT_PHASES` / `CLIENT_STEPS`)
after your review. Nothing here says no, and no internal word appears (both enforced by
tests).

### Phases (5) — the five dots on the client's page

| key | Client label | What's happening |
|---|---|---|
| intake | Getting started | Your file's open and we're getting your application together. |
| underwriting | Reviewing your file | We're going through everything and getting your file ready for lenders. |
| fulfilment | Finalizing your approval | Your lender said yes. Now we're tying up the last details. |
| complete_paid | Closing | Everything's done on our side and your lawyer takes it from here. |
| beyond_funding | Looking after it | Your mortgage is done. We keep an eye on it from here. |

### Steps (20) — the sentence under the current phase, and what we ask of them

| key | Client label | What's happening | What we need from you |
|---|---|---|---|
| qualify | Getting to know your plans | Michael wants to hear what you're hoping to do, so he can point you the right way. | Give Michael a call or reply to his message whenever it suits you. |
| application | Your application | We're getting your application filled in. | Finishing your application is the one thing that gets this moving. |
| application_chase | A gentle reminder | We'll remind you if your application still needs something. | — |
| first_review | Reading it over | Michael's reading through everything you sent. | — |
| documents | Your paperwork | We're gathering the paperwork your lender needs to see. | Sending anything we've asked for is what moves this along fastest. |
| underwrite | Checking the numbers | Michael's going through your file in detail and checking every number. | — |
| plan | Your options | Michael's putting your options together so you can pick what fits. | — |
| preapproval_letter | Your pre-approval letter | Michael's getting your letter ready so you can shop knowing your number. | — |
| shopping | Out looking | You're pre-approved and out looking. Tell us when you find the one. | — |
| package_submit | Off to your lender | Michael's putting your file together and sending it to your lender. | — |
| with_lender | It's with your lender | Your file's with the lender and we're waiting on their answer. Michael checks in if it goes quiet. | — |
| commitment | Your approval's in | Your lender said yes. Michael's going through the paperwork now. | — |
| conditions | The last few items | Your lender asked for a few final things and we're working through them. | If we've asked you for anything, sending it back quickly keeps your closing date safe. |
| final_approval | Final sign-off | We're confirming the last sign-off with your lender. | — |
| broker_complete | Everything's set | Everything's done on our side. Your lawyer takes it from here. | Your lawyer will be in touch to book your signing. |
| compliance_package | Filing the paperwork | We're filing the last of the paperwork. | — |
| paid | All done | Your mortgage is funded and everything is complete. Congratulations. | — |
| renewal_watch | We're watching your renewal | We keep an eye on your renewal date so it never sneaks up on you. | — |
| monitoring | Strategic Mortgage Monitoring | Every month we check your mortgage against what's out there, and Michael reaches out when there's something worth doing. | — |
| renewal_outreach | Your renewal check-in | We'll be in touch well before your renewal comes up. | — |

Plus the calm generic when a stage maps to no phase:
**Your file · "We're working on your file. Michael will be in touch with an update."**

The client always sees ONE phase's sentence at a time (the current one) and, in a
purchase, only the purchase steps — the shape-awareness is inherited from the lifecycle
steps, not restated. `application_chase`, `shopping`, and `renewal_outreach` carry words
for totality but are *planned* capability and never render to a client (no placeholders).

## Task 3 — Demo and tests

A synthetic demo file (design cast: Sofia / Jordan / Ava) renders the full page in demo
with **zero real reads**, asserted by the fetch-spy. Tests (`tests/client-portal.test.ts`,
24): token states (valid / expired / revoked / garbage), the shape gate incl. the
dot-bypass case, the clientJourney mapping is total over phases and steps (a new lifecycle
step fails loudly here), the demo fixture has no fallback, and a **vocabulary sweep** that
reads the actual rendered strings and fails on any internal word (underwriting, packaging,
evidence, zoho, finmo, broker, stage, pipeline...) plus a "never tells a person no" sweep.
Every guarantee was **mutation-tested** (leak a word → red, add a wordless step → red,
write a "no" → red, widen the token shape → red). The demo suite gained 4 client-portal
assertions.

## Verification

- **tsc clean. `next build` green. Suite 681** (from 653: +24 client-portal, +4 demo).
- **Admin census and Deals surfaces untouched and byte-identical** (the deal-room page
  gained one loader and one card; the shared census model is not touched — the
  deals-surface and shell suites are green).
- **The lime audit's scope statement still holds**: it walks `app/portal/admin/**` +
  `components/admin/**`. The client page is under `app/portal/file`, outside that scope;
  its one lime (the primary contact button) is the brand accent on a public surface, not
  the admin decision token, and the audit correctly does not reach it. The one admin
  component (`ClientPortalCard`) uses navy and StatusChip, no lime.
- **Live posture proof**: both new tables refuse a direct anon read with `42501`; the
  resolve function answers.
- **Live admin round trip** (via the store functions, server-role posture identical to
  the routes, synthetic deal id `TEST-B5-DEAL`, rows deleted after): create → resolve
  (found) → touch → revoke → resolve (0 rows, the link is dead) → list (metadata only,
  no token or hash) → audit trail carries `created` + `revoked` with the acting email.
  Tables empty again after cleanup.
- **Render proofs** on the blessed dev-instance pattern, synthetic fixture only,
  screenshotted in-session: the not-found page (375px), a mid-underwriting purchase
  (375px full page — the journey in client words, "what we need from you", the closing
  countdown, a realtor on the team, one lime), a fulfilment refi (two phases done, a
  lawyer, no "what we need from you" because nothing is needed while the lender decides),
  and the funded file (beyond funding, monitoring words, no closing card — verified: no
  name leaks and the unknown/malformed/never-issued tokens are byte-identical in visible
  text, differing only by the echoed token). The middleware exemption is proven: an
  unauthenticated `/portal/file/<token>` returns 200 while `/portal/admin` still bounces
  to sign-in.
- **The admin card, proven through the real UI and routes** (not just the store). Signed
  in as the ephemeral TEST admin on a real deal room (file ref **BRXM-F056361**), the
  "Client portal" card's Create button hit the real POST route and returned a fresh
  link shown once, ending in a 64-hex token, with a "live" chip and a revoke control.
  Opening that link (no demo cookie) resolved and rendered the client's file; clicking
  the card's revoke ran the real revoke route; opening the same link again returned the
  not-found page and no longer rendered the file, and the chip read "revoked". This is
  the sanctioned single issuance-and-immediate-revoke round trip — logged here by file
  ref only. Both FOXCA tables were emptied of every proof row afterward (synthetic and
  real), and the TEST admin was deleted. No screenshot of a real deal room is committed;
  the client render proofs above use the synthetic fixture only.

## Deviations, stated

- No FOXCA service-role key added (finding 2) — the house security-definer posture is
  used instead, which is narrower and matches every other FOXCA table.
- Realtor/lawyer read from their own real fields, not `Referral_Partner` (finding 4).
- The documents card ships the honest line; no Finmo URL is derived (finding 5).
- No rate limiter added (finding 6) — noted, not invented.

## For the roadmap

B5 shipped. Next: the documents desk, then client comms (automated link delivery, the
review-collection system that lets the testimonials return), then presentation, then the
qualification module co-designed with Michael. Agent mode and agent onboarding after.
A rate limiter on the one anonymous Zoho-touching route is a near-term follow-up.
