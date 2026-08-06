# foxmortgage.ca — Claude Code Build Context

## Where things live

Session history is not in this file. Load it only when a question is actually
historical.

- `/Users/user/Desktop/Fox Knowledge Base/00-master-context/foxmortgage.ca/FOXMORTGAGE.md` — the master index
- `/Users/user/Desktop/fox-underwriting/CLAUDE.md` — the workbench repo, sibling to this one
- `docs/JOURNEY.md` — the client journey operating document
- `docs/ledger/` — dated session history, one file per month, load on demand
  (`2026-07.md`, `2026-08.md`)

Session headers and dated narrative notes moved verbatim to `docs/ledger/2026-07.md`.

PII DISCIPLINE (STANDING RULE, rewritten 2026-07-17 in B4 — the named exception is ENDED): real personal names never appear anywhere in this repo — code, comments, fixtures, tests, config strings, docs, or ledger prose. File refs (BRXM-/IFMS-/FOX-) and opaque record ids are always acceptable and are the standard way to reference a client. Where a rendering or parsing test genuinely needs a human name, use the synthetic design cast (Sofia Ricci, Jordan Wells, Marcus Tran, Priya Anand, Dana Okafor, Eli Fraser, Noor Haddad, Ava Lindqvist), keeping any many-to-one mapping stable within a file. Michael Fox, lender names, and company names are not PII for this purpose. TWO DOCUMENTED CARVE-OUTS: consented public-site testimonial content (first name + last initial, client-approved for publication — the /smm pair; the homepage pair is flagged for Michael to confirm or replace), and the live n8n FP-handoff webhook slug documented verbatim in docs/integrations/finmo-fp-handoff-field-map.md (an operational identifier; renaming it is an n8n change, out of a portal session’s bounds). The real SMM client export still lives OUTSIDE the repo (~/fox-local/SMM/, gitignored SMM/); it is NEVER copied into the repo tree, committed, or logged; the committed suite runs on the synthetic fixtures (tests/fixtures/smm-sample*.csv); local verification reports counts/buckets/outcomes only; the smm-store logs function+status+counts, never row payloads. GIT HISTORY still contains pre-B4 names — only a history rewrite or a private repo fixes that; Michael’s open decision.)

NOTE: Sections below dated April or May 2026 have drifted. docs/portal-audit-2026-07.md
is the corrected baseline for routes, env vars, and module names as of July 2026.

---

## Admin Command Center (Sessions 1 and 3 shipped 2026-07-09)

### Three-layer architecture
- Zoho CRM: system of record for relationships, stages, tasks.
- fox-underwriting (separate repo + Supabase project `rnupbdmpxfwsowiqhcqv`): system of
  record for underwriting truth (evidence, calcs, conditions, flags, reviews, audit log).
- This portal: system of engagement. Reads the workbench through a database-enforced
  read-only role; every decision write flows through the Gates API at
  https://fox-underwriting.vercel.app (Session 2 deployment). This repo NEVER writes
  to the workbench database and never re-implements gate logic.

### Read-only workbench posture (Session 3: database-enforced)
- `lib/underwriting.ts` is the ONLY module touching the UW Supabase project. Its whole
  query surface is one GET-based PostgREST wrapper (uwFetch/uwSelect; the audit viewer
  variant adds Prefer: count=exact, still a GET). No insert/update/upsert/delete/rpc
  calls exist anywhere in this repo against the workbench.
- Since Session 3 the wrapper authenticates as the `portal_readonly` Postgres role
  (fox-underwriting migration 0024): `UW_SUPABASE_READONLY_KEY` (long-lived ES256 JWT
  under a standby signing key, expires 2028-07-08) rides Authorization: Bearer;
  `UW_SUPABASE_PUBLISHABLE_KEY` rides apikey for gateway passage. Rotation procedure:
  fox-underwriting docs/gates-api.md.
- `UW_SUPABASE_SERVICE_ROLE_KEY` was DELETED from the foxmortgage-ca Vercel project on
  2026-07-09 (all targets) and removed from .env.local. The portal cannot write to the
  workbench even in principle: portal_readonly has SELECT on exactly 12 tables and
  Postgres refuses everything else with 42501 (verified live).
- Granted tables (SELECT only; 18 since the promo-pipeline session, verified
  live 2026-07-11): agents, audit_log, borrowers, conditions, deals, documents,
  flags, income_calcs, intake_events, lender_intel_items, lender_offers (18th),
  number_links, rate_quotes, rate_sheet_reviews, ratio_calcs, shadow_scores,
  statement_fields, statement_reviews. NOT granted: evidence (still 42501).
  No submission-notes table exists yet (notes are report artifacts, not rows).
  lender_offers is read by lib/underwriting.ts getOfferQueue (status=extracted
  for the desk); the offers gate (POST /api/gates/offers/[id]/decision) is the
  only decision path.
- Attempt-and-fallback is the STANDING RULE for granted-surface sections
  (Session 4): a page section queries its tables and renders the not-granted
  state only on an actual permission refusal (UwResult.status 403, helper
  isPermissionRefusal), never as a hardcoded placeholder. When a grant lands in
  the workbench, the portal section lights up with zero portal changes.
- Env vars (server-only, never NEXT_PUBLIC): `UW_SUPABASE_URL`,
  `UW_SUPABASE_READONLY_KEY`, `UW_SUPABASE_PUBLISHABLE_KEY`. Any missing produces
  `{ configured: false }` and quiet "Workbench not connected" UI states, never crashes.
  The URL accepts the bare project URL or a pasted .../rest/v1 form.
- Never log workbench payloads (counts and durations only). Render masked values
  exactly as stored. Every fetcher takes `agentId` (tenant scoping); Michael's agent
  row is resolved by email (`config/targets.ts WORKBENCH_AGENT_EMAIL`) and cached.

### Gates client (Session 3) — the only decision write path
- `lib/gates.ts` is the ONLY module that calls the Gates API (`GATES_API_URL`, set in
  Vercel all targets). Server-side only, invoked from the five gate proxy routes under
  app/api/portal/admin/gates/: statements/[id]/decision, rate-sheets/[id]/decision,
  flags/[id]/disposition, shadow/[id]/score, conditions/[id]/decision (Session 4).
  Each route enforces the authority matrix (apiPermission in lib/authz.ts) before any
  Gates call. Conditions vocabulary: satisfied | moot | waived; moot records as status
  waived with the action preserved in the audit detail; moot and waived require a 5+
  character note; deciding on a terminal deal succeeds and audits deal_terminal.
- Knowledge endpoints ride the same posture behind knowledge.view (all internal
  roles): browser-minted token, forwarded through the three read-only proxy routes
  under app/api/portal/admin/knowledge/ (lenders, lenders/[slug], offers) into
  lib/gates.ts gateGet. Client fetches use lib/knowledge-client.ts useKnowledgeFetch.
  The health response's knowledge_bundled count renders on Status and ambers the
  panel at 0 (knowledge missed the deploy).
- Token mechanics (CONTRACT CORRECTION, verified live 2026-07-09): the gates-template
  Clerk token MUST be minted in the browser. Backend mints via auth().getToken carry
  no azp claim and the Gates API refuses them with 401. `lib/gates-token.ts`
  (client-side, the only browser mint point) mints per action with
  getToken({ template: 'gates' }) (60s life, never cached, never logged) and the desk
  forwards it in the x-gates-token header; the proxy route passes it to lib/gates.ts.
- Error mapping is a UX contract (unit-tested in tests/gates.test.ts): 401 auth copy,
  403 permission copy, 404 "Not found or not yours.", 409 "Already decided." plus a
  queue refetch, 422 surfaces the server validation message, 503/unexpected render as
  unavailable, fetch failures render retryable network copy. Raw error bodies never
  reach the user. STATUS_BY_KIND mirrors kinds to HTTP statuses on the proxy routes.
- Logs carry method, path (with record id), status, duration. Never tokens, never
  notes, never payloads.

### Authority matrix contract
- `config/authority.ts` holds ROLES ('admin' | 'ops' | 'underwriting-reviewer' |
  'agent') and PERMISSIONS. Key names are a CONTRACT with the Session 2 gates API:
  additive changes only; renames require a note here. Session 1 added admin-only view
  keys: approvals.view, rates.view, intel.view, knowledge.view, revenue.view,
  status.view (also ops), bookkeeping.view, roadmap.view (all roles).
- `lib/authz.ts` exposes `can(user, permission)` and `requirePermission()`; both read
  Clerk roles via currentUser() (never auth()) and normalize the three metadata shapes
  (roles array, roles string, legacy role string). Unknown roles degrade to no access.
- Settings renders the matrix read-only.

### A machine may never write a human's identity (STANDING RULE, 2026-07-14 integrity incident)
Mirrors fox-underwriting guardrails 19 + 20 (its `## 5. Hard guardrails`); both CLAUDE.md
files carry it per the closing ritual.
- **Human identity comes only from a verified session.** Every workbench decision the portal
  makes goes through the gates API with a per-action, client-minted Clerk `gates` token
  (`lib/gates-token.ts`); the workbench records the real human as `actor='portal'` + the Clerk
  id/email. The portal never writes the workbench directly and never supplies a human actor
  from a config value, env var, default, or service identity. The bridge (`lib/underwriting-bridge.ts`)
  is a MACHINE path (`x-bridge-secret`) and its rows attribute to `bridge`/`manual`/`system` —
  never a specific person. The FOXCA operational tables (notifications, constraints, people,
  impersonation) attribute humans via the verified gate session (`gate.user.email`/`userId`,
  `acting_email`), never from a non-session source; public forms attribute NO human.
- **Synthetic artifacts are loud and never on a live file.** A workbench document/condition may
  carry `provenance='synthetic'`; the deal-room Documents table renders a loud "SYNTHETIC — not a
  lender document" banner for it (`getDealDocuments` selects `provenance`), and a synthetic
  document can never be approved. A stand-in used to prove a loop belongs on a synthetic FIXTURE
  deal, never on a real client's room.
- **Opening a room does not write.** Room open recomputes document PRESENCE only
  (`conditions.recompute`, decides nothing); it never extracts, generates, approves, or supersedes
  conditions. Decision-control UI testing stays on preview deploys against seeded TEST rows only
  (the existing UI-test discipline standing rule).
- **Condition axes (fox-underwriting migration 0038, format-aware session 2026-07-14).** The
  checklist renders an UNDERWRITING owner (`presence = not_applicable` → a neutral "underwriting"
  pill, counted as done not outstanding — an adjudication constraint is never a document chase), a
  `loadBearing` badge (an appraisal a plan limit derives from — a low appraisal re-adjudicates), and
  the FlexLine doc-kinds (`product_assessment_form`, `term_portion_amendment`) in the edit options.
  `getDealConditions`/`getPendingCommitmentConditions` select `load_bearing`; a cross-source
  `cross_source_mortgage_contradiction` flag (commitment vs monitoring-feed existing-mortgage
  balance) renders through the existing flags surface.
- **Every empty state that instructs an action carries the control for that action inline.** The
  commitment dropzone (`components/admin/CommitmentUploader.tsx`, POSTs to the existing
  `/api/portal/admin/commitments/[dealId]/upload` route) renders in the Conditions empty state and
  the Documents section whenever no REAL commitment is on file; `hasRealCommitment` is computed on
  document provenance so a retired synthetic/rejected commitment never counts and never suppresses
  the control. A real commitment on file swaps the bare dropzone for an "upload amendment" control
  (never a second bare dropzone). Gated on `commitment.upload` so the affordance matches the server
  (presently admin-only by the tested authority posture; widening to agents is a coordinated
  additive change if wanted).

### Committed terms: the second extraction off a commitment (2026-08-04)
A commitment upload produces TWO things, and they are gated separately.
Confusing them is the easy mistake, so they are stated together.
- **CONDITIONS** — the checklist the document creates. Key
  `approvals.conditions.decide`, proxy
  `/api/portal/admin/gates/commitment-conditions/[documentId]/decision`.
- **TERMS** — the economics the document states. NEW key
  **`approvals.commitment_terms.decide`**, proxy
  `/api/portal/admin/gates/commitment-terms/[documentId]/decision` ->
  `lib/gates.ts decideCommitmentTerms` -> Gates API
  `POST /api/gates/commitment-terms/{documentId}/decision`.
- **THE KEY NAME IS A CROSS-REPO CONTRACT.** fox-underwriting's gates API
  enforces `approvals.commitment_terms.decide` server-side on every call. A
  rename needs coordinated edits in BOTH repos; a widening here without one
  there just produces 403s from the gate. Admin only on both sides, matching
  its twin above. Placed beside `approvals.conditions.decide` in
  `config/authority.ts`.
- **DECIDED PER DOCUMENT, NEVER PER FIELD.** A commitment's ten fields are one
  lender's one offer, so the set moves together and the response's `decided`
  says how many rows moved. `{documentId}` is the COMMITMENT DOCUMENT's id
  (`documents.doc_type = 'signed_commitment'`), NOT the deal id — a malformed
  id is 422. There is no bulk endpoint and no per-term control; the card
  carries exactly one textarea (the note) and zero inputs, selects or forms,
  asserted by test.
- **THE PRINTED STRING IS THE VALUE; `value_numeric` NEVER RENDERS.** What
  Michael approves is evidence, not a summary. Every row shows the document's
  printed token beside its page, confidence and verbatim snippet. A missing
  `printed` is NAMED, never backfilled from the numeric.
- **A RESOLUTION SITS BESIDE THE PRINTED TOKEN, NEVER IN PLACE OF IT.** The
  maturity is the case that matters: the document printed `06/10/2031`, the
  stored date is `2031-10-06`, and the row carries `date_convention` +
  `date_convention_basis`. The card renders the printed token, the resolved
  date SPELLED OUT (`6 October 2031 (2031-10-06)`), the convention, and the
  basis — because read the other way round the renewal moves four months. The
  same mechanism shows `rate_type` reading as "variable" off a printed "Prime
  Lending Rate - 0.85%". Rules live in `lib/commitment-terms.ts` (pure, no
  next/Clerk/fetch imports, twin of `lib/tasks-shape.ts`) and are unit-tested
  in `tests/commitment-terms.test.ts`; the card is the render only.
- **NOTHING IS DROPPED.** An unrecognised `field_key` sorts last and still
  renders with a derived label. A `gate_status` outside pending/approved/
  rejected counts as `other` and makes the set read `mixed`, never approved.
- **An over-long note is REFUSED, not truncated** (2000 chars) — silently
  shortening what a person wrote changes the record they meant to leave.
- **Read** is `lib/underwriting.ts getDealCommitmentTerms` through
  `portal_readonly`, scoped by `agent_id` + `deal_id`, rendered in the deal
  room's Fulfilment section (`#terms`) above Conditions. Pending terms force
  that section open, like a pending condition list — a queued decision must
  never sit hidden inside a collapsed row. `commitment_terms` had NO row-level
  policy for this role until 2026-08-03: it returned zero rows, which on screen
  is indistinguishable from an empty table. CONFIRM A LIVE NON-ZERO COUNT
  before concluding the card works.
- **The pending state is AMBER, matching the conditions banner off the same
  upload.** Lime is not spent here; `tests/shell.test.ts` enumerates every
  surface that may carry the decision token and this is not one.
- **Local dev CANNOT exercise this gate.** The dev Clerk instance carries zero
  JWT templates (`getToken({template:'gates'})` throws "JWT template not
  found"), so no gates token can be minted and `gateCall` returns its 401 auth
  copy before any network call. Verified again 2026-08-04. Budget production
  for any live gate proof.

### Lender notes: TWO paths, and they are not the same thing (N-06, 2026-07-29)
Confusing these is the easy mistake, so they are stated together.
- **The DRAFT path (2026-07-15, unchanged).** `LenderNotesCard` "Generate" ->
  `/api/portal/admin/gates/deals/[dealId]/lender-notes` -> `lib/gates.ts
  generateLenderNotes` -> Gates API `POST /api/deals/{workbenchUuid}/lender-notes`
  on a browser-minted Clerk token, key `notes.generate`. Lands an editable draft
  in the workbench `lender_notes` table. NOTHING IS SENT ANYWHERE.
- **The CRM WRITE path (N-06).** `LenderNotesCard` "Write to the Zoho file" ->
  `/api/portal/admin/underwriting/lender-notes/[dealId]` -> `lib/lender-notes-bridge.ts`
  -> fox-underwriting `POST /api/bridge/lender-notes-generate` on the
  BRIDGE_SECRET machine path, key `notes.crm.write` (admin only, PORTAL-LOCAL, not
  a gates key). This is the ported n8n generator (model pinned claude-opus-4-7).
  A real run does three ordered Zoho writes: previous Lender_Notes copied to a
  history Note, Lender_Notes overwritten, a log Note appended. `dry_run` does
  everything and stops before all three. No gates token rides this call and none
  should: generation records no human actor by design (guardrail 19); the human is
  gated on the portal side.
- `lib/lender-notes-bridge.ts` is the ONLY module here that calls that endpoint,
  server-side only. `UW_BRIDGE_SECRET` is byte-identical to fox-underwriting's
  `BRIDGE_SECRET` (verified 2026-07-29). The URL prefers `UW_LENDER_NOTES_URL` and
  otherwise derives from `UW_BRIDGE_URL` by swapping `/api/bridge/rooms`; an
  unrecognised shape refuses rather than guessing.
- THE BROWSER NEVER NAMES THE ZOHO RECORD. The card posts the workbench deal id;
  the route reads `zoho_potential_id` / `finmo_app_id` off the row. Unit-tested.
- The n8n workflow `dGtxpNedIDTJhwro` never had a caller in this repo and is left
  active and untouched; its retirement follows Michael's first successful card
  press, in the chat lane.

### Native tasks: TWO task surfaces, and they are not the same thing (A2, 2026-08-01)
Confusing these is the easy mistake, so they are stated together — the same
shape as the lender-notes pair above.
- **The ZOHO card (legacy, unchanged).** The Tasks card on `/portal/admin`
  (Today) -> `POST /api/portal/admin/tasks/[id]/status` -> `lib/zoho-admin.ts`
  `setZohoTaskStatus`, key `tasks.complete`. WRITES TO ZOHO. Zoho stays the
  source of truth; who and when land in FOXCA `task_action_events`.
- **The NATIVE page (A2).** `/portal/admin/tasks` -> the workbench's own task
  store. Keys `tasks.view` (admin, ops, underwriting-reviewer, agent) and
  `tasks.manage` (admin). **WRITES NOTHING TO ZOHO, on any path.** Both keys
  are MIRRORED from fox-underwriting's `config/authority.ts` (block A1) and are
  a CONTRACT with it: additive changes only, and a widening here without one
  there just produces 403s from the gates API.
- Both are live ON PURPOSE. Zoho Tasks remain Michael's operating list until he
  declares the flip; A3 repoints the machine writers. Do not turn off, hide, or
  de-link the Zoho card, and never add a sync-back path in either direction.
- **Read:** `GET /api/portal/admin/tasks/today` (behind `tasks.view`) forwards a
  browser-minted gates token to the workbench's `GET /api/tasks/today`.
  Four buckets with counts, `as_of`, `timezone`, `due_this_week_through`,
  `truncated`. `lib/gates.ts getTasksToday`.
- **THE COUNT IS THE TRUE BUCKET SIZE; THE ARRAY MAY BE SHORTER.** Buckets are
  capped at 200 rows server-side and capped ones name themselves in
  `truncated`. Never render `rows.length` as the count — A1 shipped and fixed
  exactly that defect (276 overdue reported as 200). Pinned in
  `tests/today-tasks.test.ts`.
- **Paging past the cap** is `GET /api/portal/admin/tasks/overdue?asOf=&offset=`
  -> `lib/underwriting.ts getOverdueTasksPage`, a read through `portal_readonly`
  (`tasks` is granted by migration 0057; the 20th granted table). The endpoint
  takes no paging params and A2 may not modify fox-underwriting, so this is the
  only way to the other 76 rows. **`asOf` is the endpoint's own value, passed
  back verbatim** — nothing here or in the browser recomputes "today", and a
  missing or malformed `asOf` is refused rather than defaulted. If
  fox-underwriting's `bucketOf` rule changes, this filter changes with it.
- **`due_this_week` is a ROLLING SEVEN DAYS**, not the calendar week; render
  `due_this_week_through`. `as_of` is resolved in America/Toronto. 409 means
  already-decided, not an error. Dismiss requires a reason (min 3) and is STICKY
  across re-imports, so the reason is the only record of it.
- **Writes** are the four gate proxies under `app/api/portal/admin/gates/tasks/`
  (create, `[taskId]/complete|defer|dismiss`), all behind `tasks.manage`, all
  through `lib/gates.ts`. `tasks.completed/deferred/dismissed` are HUMAN_ONLY in
  the workbench. **Bulk complete and bulk dismiss call these SAME per-task
  endpoints in sequence** — no bulk endpoint exists and none should, because
  one call per row is what keeps one audit entry per row with the real human on
  it (guardrail 19).
- **A1's gate writes: THREE of four proven live (2026-08-01), defer is not.**
  Michael exercised them through the deployed page on production Clerk. Audit
  ids, all carrying `actor='portal'` + his real Clerk id/email
  (`user_3BamhsuiOxaSkRFj0vDyOTkzSce` / mfox@foxmortgage.ca): `tasks.completed`
  `a011023c-d422-4157-8a17-006f50a1f6ee`, `tasks.created`
  `fe0b92fc-9573-4169-b5f5-50a73b22cc66`, `tasks.dismissed`
  `41965410-666c-4e65-a1f3-8fb645153fbf`.
  **`tasks.deferred` has ZERO audit rows all time and no row anywhere carries
  `deferred_from`** — the verb has never executed successfully. Likely a 409
  no-op (deferring to the date already held writes no audit row) rather than a
  wiring fault, since complete and dismiss ride the identical client path. Still
  open; do not record it as proven.
- **The dev Clerk instance carries ZERO JWT templates** (`GET /v1/jwt_templates`
  returns `[]`), so no `gates` token can be minted there and NO gate write can be
  exercised from local dev. Production carries the template. Any future session
  planning a live gate proof must budget for production, not localhost.
- **KNOWN UX DEFECT (unfixed):** `components/admin/TasksToday.tsx` drops a row on
  409, which is right for complete and dismiss (the row is terminal) but wrong
  for defer (409 there means no-op or non-open, and the row is still open). It
  self-heals on the refetch that follows; the fix is to branch 409 handling by
  verb.

### The design tokens, and the board rebuilt on them (handoff 57, 2026-08-06)
- **`lib/design-tokens.ts` IS THE ANTI-DRIFT MECHANISM and matters more than
  any value in it.** Michael iterated on mockups for a morning and approved a
  design; three builds this week drifted from prose descriptions of one, each
  costing a session. Every colour and every type size on the board now lives
  there once. `tests/board-tokens.test.ts` fails on ANY hardcoded hex on the
  surface, walking the directory so a file nobody has written yet is covered.
  **It does NOT own spacing**: padding and gaps stay on Tailwind's scale,
  because none was specified and a second spacing system would be the drift.
- **THE BOARD RESTRUCTURED, IT DID NOT ONLY REPAINT.** Twenty-eight stages in
  one row overflowed 1512 by 588px. **Phases stack vertically**, each phase's
  stages sit side by side in a grid that **WRAPS** (`repeat(auto-fit,
  minmax(240px,1fr))`), empty stages fold to one line at the foot of their
  phase and empty phases fold to their header line. Verified live: **zero
  horizontal scroll at 1512 and at 1280**, columns 285px, `overflow: []`.
- **`?collapsed=` AND `?phase=` ARE BOTH GONE**, with the phase bar `?phase=`
  drove. Collapse existed to survive a too-wide row; the row is gone, so it
  only hid work. `parseCollapsed`/`toggleCollapsed` stay exported and tested in
  lib/phase-model.ts, unused, the DealPreview precedent. Both params still
  answer 200 and are ignored.
- **THE COUNTDOWN'S FIFTH READING, RULED ON BY MICHAEL.** The four specified
  states painted **75 of 97 board cards red, 59 of them FUNDED** files whose
  closing correctly already happened. A passed closing is an alarm only where
  the file has not ended, so a terminal stage reads `Closed 18 Jun 2026` in
  plain grey. **16 red cards** now, which is the signal the design was drawn
  for. Keyed on the stage's own `category` (`terminal_won`/`terminal_lost`),
  NEVER a stage code, so a terminal stage added later behaves correctly.
- **TWO SPECIFIED VALUES ARE DELIBERATELY UNAPPLIED, both ruled on rather than
  assumed.** The needs-you chip keeps `bg-decision`/`text-decision-ink`
  (#C6F53F on #3D4F0A) instead of the approved **#EDF3D9 / #4A5D0A**, because
  `tests/shell.test.ts` greps DealCard for that exact ternary and
  `tests/phase-model.test.ts` asserts the card matches `/bg-decision/`, and
  redefining the Tailwind token would repaint six protected surfaces. The
  approved values sit in `ROLE.needsYouBg`/`needsYouInk` so the switch is one
  edit on the day the lime pass reaches the rest of the Command Centre.
- **PROJECTION GREEN: the digits moved to `#1D6E56` (hue 163) and the fill and
  border keep the hue-152 family.** The one value assertion in
  tests/phase-model.test.ts was rewritten to check what it was written to
  protect (hue outside the 60-140 lime band, in either notation) and proves
  itself non-vacuous against the Fox lime. The two ZONE assertions beside it
  were not touched.
- **THE DEBT REGISTER IS THE HONEST PART OF THE HEX TEST.** `NOT_YET_PASSED` in
  tests/board-tokens.test.ts holds the file page's own components plus the two
  SHARED controls (`RecordWithdrawal`, `ReextractControl`), which render on both
  surfaces, so restyling them would have changed a page the brief required to
  stay visually untouched. **Consequence: RecordWithdrawal's buttons still carry
  weight 600 where they render on a card** — the board's one live deviation
  from the two-weight rule. A NEW board file is covered by default because it
  is not on the list.
- Live counts unchanged through `portal_readonly`: **160 = board 97 + Archive
  29 + No stage 33 + Withdrawn 1**. The board holds 97; the 159 in the brief is
  the whole live book across four views, not one screen of cards.
- **THE BOARD NO LONGER SCROLLS SIDEWAYS BUT IT IS 24,000px TALL**, because
  `funded` alone holds 66 cards in one column. Naming it rather than capping
  it: a cap is a product decision Michael has not made.
- Pinned in `tests/board-tokens.test.ts` (26 tests). The lime audit, both zone
  assertions, the copy gate and the write guarantee all pass **unmodified**.
  Board route JS unchanged at **438 B / 120 kB**. No data changed.

### The conditions checklist LAYOUT rebuild (handoff 56, 2026-08-05)
Supersedes handoff 55's layout section. Its write paths are correct and
unchanged; what changed is how the list is drawn.
- **WHY: Michael read the shipped checklist on a live file and called the
  layout disastrous. Two causes, both specific.** (1) **EVERY CONDITION
  RENDERED TWICE** — the text, then the identical string again beneath it in
  grey quotes as the source snippet. On F060561 `source_snippet == text` on
  ALL TWELVE rows, so twelve conditions filled twenty-four paragraphs.
  (2) Full paragraph text on every row defeated the one job a checklist has.
- **THE ROW IS ONE LINE**: status glyph, short label, due date right-aligned,
  and one line of plain words underneath stating the state. The full text,
  the findings, the CONTROLS and a quiet metadata line (condition number,
  owner, doc kind, flags, page, open source) live behind expansion. **No
  control renders on a collapsed row**, asserted by test. The source quote
  renders in the expanded row ONLY, and only when
  `sourceQuoteToShow(text, snippet)` says it is not a second copy (equal,
  substring, or superstring after whitespace/case normalising -> dropped).
- **FOUR STATES, and the TWO with no home in them are NAMED not forced.**
  `conditionChecklistState` in lib/conditions-status.ts:
  `nothing` (hollow ring), `on_file` (solid navy dot), `problems` (lime),
  `done` (grey tick, struck through). **`waived` folds into done with its own
  words** (three live rows) and **`not_applicable` gets its own
  `underwriting` reading**, held out of both header figures because an
  adjudication constraint is not a chase.
- **THE INTERIM READING, DESIGNED TO BE DELETED. NOT ONE CONDITION IN THE
  BOOK CARRIES `presence_detail.analysis`** (verified live, 49 approved rows),
  so the document check does not exist yet and a present document says only
  "On file. Nothing has read it yet." The `meets` and gap branches are already
  written against the shape the check will store, so it lights up with zero
  portal changes and that sentence disappears on its own.
- **NEITHER `satisfied` NOR `waived` RECORDS WHO OR WHEN ON THE ROW.**
  `conditions` carries `verified_by`/`verified_at` and nothing else (both null
  on all five live decided rows); the acting human lives on the audit_log
  entry by design (guardrail 19). The done line therefore points at the audit
  log rather than inventing a name. The brief asked for who and when; the
  column does not exist. Workbench change if wanted.
- **HEADER: three counts plus a thin navy bar.** collected + outstanding +
  settled partition the list exactly once each; **needs-you is a highlighted
  SUBSET** (unread document, or failed check), and it carries the only lime on
  that line. Figures are derived from the SAME states the rows render, so a
  count can never contradict a glyph.
- **THE SHORT LABEL IS THE HONEST GAP. NOTHING GENERATES ONE.**
  `conditionShortLabel` names the document where `doc_kind` names one (set on
  11 of 49 approved rows) and otherwise truncates the text at a word boundary
  near 72 chars. **`other` NEVER becomes a label** — four of F057400's twelve
  carry it, so the kind would print the same word four times. A repeated
  label inside one group gains its condition number (`disambiguateLabels`);
  the live case is two letters of employment on F060561, which read
  "Letter of employment (2)" and "(3)".
- **NOTHING PARSES A NAME OUT OF CONDITION TEXT.** Grouping keys on
  `borrower_id` alone. Coverage is thin and the FALLBACK matters more than the
  grouping: F060561 has zero borrower rows, F053724 has two borrowers and
  zero of thirty-three conditions linked. `borrowerGroupingNote` says which
  of those two situations the reader is in and goes SILENT the moment one row
  is genuinely linked (F057400: 5 of 12, so it renders General 7 plus two
  named borrower sections and no note).
- **NO RED IN THE STATE VOCABULARY.** Overdue reads navy, load-bearing is a
  navy chip, and the findings block was RECOLOURED (gap verdicts lime, `meets`
  navy, amber retired from it). Red survives on exactly two destructive
  controls, Reject list and Remove, plus error text, and the test enumerates
  every remaining red line.
- **THE LIME AUDIT WAS LINE-WISE AND HAD A HOLE.** `tests/shell.test.ts`
  tested the allowlist regex against the whole LINE, so one permitted token
  licensed every token beside it: `border-l-4 border-l-decision bg-decision/10`
  passed because `bg-decision` was granted. It is **token-wise now**, the
  side-specific border utilities are named in the pattern, and a test proves
  the check is not vacuous. The checklist's grant gained `border-l-decision`
  with its role written down.
- `document_id` joined `CONDITION_SELECT` (read-only) so the expanded row can
  open the source at its page. `conditionStatusPill` still exists and is still
  tested but NO LONGER RENDERS anywhere.
- Pinned in `tests/conditions-layout.test.ts` (38 tests).
  `tests/beta-file.test.ts` and `tests/conditions-checklist.test.ts` both
  passed UNMODIFIED. **No condition data changed**: census identical before
  and after (206 rows, 49 approved / 124 superseded / 21 rejected / 12
  pending). Costs: beta file page route JS unchanged at 2.85 kB, first load
  135 to 137 kB; room route JS unchanged at 21.7 kB, first load 161 to 164 kB.
- Render-proved on the dev Clerk instance against the real pages, read-only,
  with an ephemeral TEST admin created and DELETED in the same session.

### The conditions checklist redesign (handoff 55, 2026-08-05)
- **WHY: Michael applied the first real re-extraction, read the twelve, and
  called the checklist poor.** Two instructions: solicitor conditions are not
  his concern (sectioned off, never removed), and he works conditions ONE AT A
  TIME. This was a RENDERING job on a model that already fit: the status axis
  existed, and `satisfied` was already accepted by
  `/api/portal/admin/gates/conditions/{id}/decision` (conditions.decide, note
  optional) — it lost its renderer when **ConditionsPanel was DELETED in
  commit 7107031 (2026-07-17)**; the CLAUDE.md Session 4 paragraph naming it
  is stale. `moot` remains accepted and UNRENDERED, deliberately.
- **The knock-off**: every undecided row carries **Mark satisfied** (primary,
  arm by timestamp, LATCH after success — `rowDone`, never cleared). Verify
  and Waive keep their verbs and gained the same latch. The banner's Approve
  and Reject latch per document (`decided`). "Accepted by the lender" has NO
  distinct state in the model; satisfied is the closest honest verb, and a
  separate lender-acceptance fact would be a workbench change.
- **The split**: broker rows first in numeric order (the working list, N-of-M
  count unchanged), `category='general_verification'` rows land THERE flagged
  **unassigned ownership** with one explainer line (ambiguity defaults to
  visibility). Non-broker rows sit in **"Handled at the lawyer's office and
  elsewhere · N"** below: quieter, per-owner disclosures collapsed by
  default, pills still render, controls behind a per-row `manage` toggle
  (`quiet` prop). The PENDING banner sections its rows the same way.
- **The three screen defects fixed**: `sortConditions`/`compareCondNumber` in
  lib/conditions-status.ts (cond_number is a STRING, may be '7a'; numeric
  first, suffix ties by string, unnumbered last) applied at BOTH render
  sites — the fetchers' orders (due-date for approved, text-number for
  pending) never reach the screen. The header on BOTH surfaces reads
  "Conditions (N pending your decision)" while a set is pending, and the
  open-of-approved count returns after approval. Reject list is SOLID
  red-600/700, equal weight, with the finality line: rejecting is final for
  the document because a succeeded attempt exists, so the retry gate refuses,
  and the road back is an amendment upload.
- **THE THREE-WAY EMPTY STATE, found live during the proof**: with a PENDING
  set above, zero-approved renders "The working checklist fills when the
  pending set above is approved" — the failed-extraction variant was caught
  rendering under twelve pending rows on F060561, where it was FALSE (the
  pending set IS the extraction succeeding). Pending beats both other
  variants in the checklist default AND the beta override
  (FileConditions passes `undefined` while pending > 0). The room's default
  is now the two-variant copy Michael green-lit (the one authorized test
  rewrite, tests/reextract.test.ts).
- **THE BADGE'S FIRST REAL FIRING IS PROVEN**: the beta Conditions tab
  renders the amber 12 from live pending rows, closing the loop handoff 53
  could only argue by wiring.
- Pinned in `tests/conditions-checklist.test.ts`. tests/beta-file.test.ts
  passed UNMODIFIED. Costs: beta file page 2.73 -> 2.85 kB, room route
  unchanged. No condition data changed: F060561 12 pending/open, F053724's
  four-status mix intact, F057400 still 12 approved of 157.

### The preview body fix, and the two empty states (handoff 54, 2026-08-05)
- **THE DEFECT: the route injected `reason` into every gate call and the
  gate's strict schema refused it** (422 `Unrecognized key: "reason"` on the
  first production preview press, before the extractor was ever reached). The
  strictness is the gate protecting its identity fields and was NOT changed.
  The brief handoff 53 built from specified `{mode, reason}` for both modes;
  the gate only ever took reason on apply. **Dry run body is `{mode}` and
  nothing else.** `DRY_RUN_REASON` is retired and must not come back under
  any name (tested).
- **THE PAYLOAD IS BUILT IN EXACTLY ONE PLACE** —
  `lib/gates.ts retryCommitmentExtraction` constructs
  `mode === 'apply' ? {mode, reason} : {mode}` — so nothing the browser sends
  can ride through to the gate unshaped. That construction plus the gate's
  strictness is the whole answer to "is anything else sending a field the
  gate does not accept": the gate can only ever see the two canonical shapes.
- **THE APPLY BODY WAS ESTABLISHED EMPIRICALLY, not from the brief**: probed
  through Michael's production session at F057400's real commitment
  `d1af3684-3301-459f-974b-4de27c7593bc` — the document whose succeeded
  attempt the gate REFUSES, so nothing can be written by probing it. Results:
  dry_run there answers **409** (the refusal covers both modes), and
  `{mode:'apply', reason}` answers **409, not 422**, so the apply body passes
  the gate's schema. Residual assumption, stated rather than hidden: schema
  parse precedes the refusal check (zod handler convention; could not be
  forced from this side because the portal's own client only ever emits the
  two canonical bodies). Do not re-derive the contract from handoff briefs,
  which is what caused this defect.
- **THE RESPONSE SHAPE WAS THE SECOND GUESS TO FALL THE SAME DAY.** The
  forecast nests under **`data.preview`** (`would_draft`, `conditions[]`,
  `coverage_notes[]`) — NOT `data.conditions`, which the first cut read,
  rendering a zero-row forecast over a successful twelve-row dry run. Pinned
  from the CAPTURED production response in `lib/gates.ts ReextractPreview`
  and tested against regression. The apply half of the response has never
  been observed live; the control reads it tolerantly and never destructures
  it. A conflict on this endpoint means "succeeded extraction exists" and
  renders `REEXTRACT_REFUSED_COPY`, never the gates client's generic
  "Already decided.".
- **THE TWO EMPTY STATES on the beta Conditions tab** (`emptyStateFor` in
  `components/admin/deals-beta/FileConditions.tsx`, keyed on
  `hasRealCommitment`, the guardrail-20 computation): no commitment ->
  "upload the commitment below" (`beta-conditions-empty-nocommitment`);
  commitment present + zero conditions -> the extraction FAILED, amber,
  linking `?tab=commitment`, and saying plainly **"Do not upload the
  commitment again"** because a second upload creates a second document and a
  second extraction (`beta-conditions-empty-failed`). The old single sentence
  sent Michael toward exactly that re-upload.
- **The shared `ConditionsChecklist` gained an optional `emptyState` prop
  and NOTHING else changed in it**: the deal room passes nothing and keeps
  its original sentence (asserted by test). The room's copy carries the same
  ambiguity and is Michael's to green-light separately, the handoff 46
  precedent.
- **THE DOUBLE AMENDMENT DROPZONE IS INTENTIONAL and stays.** FileCommitment
  renders one directly and ConditionsChecklist renders its own (the room's
  standing rule: the dropzone lives in the Conditions empty state AND the
  documents surface, because an amendment supersedes the condition set, so
  the control belongs both where the document lives and where its effect
  lands). Ruled on, not removed.

### The re-extract control (handoff 53, 2026-08-05)
- **WHY: BRXM-F060561 carries an approved commitment, ten approved terms and
  ZERO conditions** — its extraction failed once on 2026-07-31 (region bug,
  since fixed) and the extractor's only other production caller is the upload
  endpoint. The gate's retry is live; this is the portal half of pressing it.
- **Key `commitment.reextract`** (config/authority.ts, admin only, CROSS-REPO
  CONTRACT). Unlike rec.withdraw's first mirroring, it is CALLED from day one
  by the control shipped in the same session.
- **Proxy** `app/api/portal/admin/gates/commitment-extractions/[documentId]/
  retry` -> `lib/gates.ts retryCommitmentExtraction` -> gate
  `POST /api/gates/commitment-extractions/{documentId}/retry`. **THE SEGMENT
  IS `commitment-extractions`, NOT `commitments`**: the commitments directory
  already carries `[dealId]`, and two differently named dynamic segments at
  one level is a Next slug conflict. Do not tidy. **BODY (corrected handoff
  54): `{mode}` alone on dry_run, `{mode, reason}` on apply.** Handoff 53
  shipped a route that injected a fixed literal into every call, off a brief
  that specified reason in both modes; the gate's strict schema answered 422
  `Unrecognized key: "reason"` on the first production preview press. Reason
  is APPLY-ONLY: typed, trimmed, never prefilled, refused over-long. Rules
  live in `lib/reextract.ts` (pure twin of lib/rec-withdrawal.ts); tests in
  `tests/reextract.test.ts`.
- **THE PREVIEW IS NOT OPTIONAL.** `ReextractControl` (Commitment tab,
  `components/admin/deals-beta/`) runs dry_run first and renders the FULL
  forecast list. The apply step (reason + timestamp arming + latch-after-
  success, 409 latches too — the Remove-control pattern) does not exist on
  screen until a preview succeeds in that mount. The two safety sentences
  (`REEXTRACT_PENDING_COPY`, `REEXTRACT_TERMS_COPY`) render above the buttons:
  drafted conditions land PENDING for the existing list gate, and an approved
  term row is never overwritten.
- **THE GATE'S REFUSAL IS SURFACED, NEVER PREDICTED.** A document with a
  succeeded attempt answers conflict and the control renders it as a reason
  (`beta-reextract-refused`). The portal has NO read on extraction attempts,
  so the control renders on every REAL commitment-family document (guardrail
  20 population, same as the uploader) and lets the gate decide. F057400's
  real doc `d1af3684` is the live refusal case; its two synthetic docs are
  correctly excluded.
- **THE PENDING SET HAS A HOME ALREADY**: gate drafts `gate_status='pending'`
  -> `getPendingCommitmentConditions` filters exactly that -> `buildTabBadges`
  counts it (amber Conditions badge) -> `ConditionsChecklist`'s approval
  banner ("Approve list", `approvals.conditions.decide`) renders on BOTH the
  deal room and the beta Conditions tab. All four links verified in code and
  pinned by test. No new surface was needed.
- **NO APPLY WAS RUN AND NONE CAN BE FROM LOCAL DEV** (dev Clerk mints no
  gates token; the live press died at the boundary with NO `[gates] POST`
  line). Before/after census identical through portal_readonly: F060561
  0 conditions + 10 approved terms, book-wide pending 0. **The first real
  apply is Michael's**, from production, like the first withdrawal. File page
  client JS 216 B -> 2.73 kB.

### The census, and the No stage view (handoff 52, 2026-08-05)
- **THE ARITHMETIC, verified in one pass through `portal_readonly`:**
  board 98 (underwriting 24: strategy 14, application started 9, collecting
  docs 1; fulfilment 74: **Funded 66**, lender response 4, submitted 4) +
  Archive 29 (lost-to-competitor 23, cancelled 6) + No stage 33 + Withdrawn 0
  = **160**. Exactly ONE cause of invisibility existed: NULL `stage_code`.
  Zero deals sit in inactive stages (the three inactive rows — inquiry,
  renewal, commitment — hold nobody), zero orphan codes, zero active stages
  outside both phase and terminal.
- **PRIOR REPORTS CORRECTED.** "33 archived" was never true; the Archive is
  29 and the 33 was the stageless count, a DIFFERENT population. "4 of the 38
  no-reference records are stageless" was also wrong: **all 33 stageless
  records carry file_refs** (BRXM-F0207xx era, one import batch), and the 38
  no-ref records split 34 board / 4 archive / 0 stageless. The production "24
  cards" was just the underwriting phase view, board default.
- **FUNDED IS A BOARD COLUMN, NOT THE ARCHIVE.** `terminal_won` with
  `phase='fulfilment'`, so terminal-CATEGORY deals number 95 while the Archive
  renders 29. `terminalStages` requires `phase === null`; do not "fix" one
  side without the other. Pinned in the partition test.
- **`lib/phase-model.ts unplacedDeals(stages, deals)`** is the COMPLEMENT of
  board ∪ archive, computed as not-in-either rather than by restating their
  rules, so the three sets partition the live book by construction
  (`tests/phase-model.test.ts` "board, archive and unplaced partition the
  live book"). Reasons: `no_stage` (null) and `unknown_stage` (a code the
  active stage list does not carry). A stage row added later moves a record
  out with no code change.
- **The No stage view** (`?view=nostage`, switch "No stage 33" beside Board |
  Archive | Withdrawn, count at zero too) renders every unplaced record with
  its reason, file link and the Remove control with posture. NO STAGE IS
  INVENTED — writing one would fabricate a fact about a file. The handoff-50
  UnplacedNote ("cannot be removed from here") is GONE, and
  `tests/rec-withdrawal.test.ts` asserts its absence. The file page's stage
  line now reads "not recorded" (italic) for a null stage, never "unknown".
- **Tiles vs views:** with the fourth view the switch row accounts for all
  160 the tiles count. The open-amount tile counts ONE stageless record
  (amount, non-terminal); the view's explainer says so rather than the tile
  being re-engineered.
- **Of the 33 stageless: 32 carry `finmo_application_id`** (Remove shows the
  live-feed warning), 1 carries none, 0 have workbench rooms (nothing
  refused). All 33 are `is_historical_import`. Every record in the book has a
  `source_id`, so the control can key all 160. Oddity for Mike's sitting:
  **BRXM-F041381 exists TWICE in rec.deals** (same ref, two rows) — the only
  duplicate file_ref in the book.
- **Mike's live round trip is PROVEN**: `source_decisions` carries one
  `record_withdrawn` row, status `superseded`, reason "This is a duplicate
  record." — withdraw AND reverse both executed through the gate on
  2026-08-05, and BRXM-F027822 renders back in the Archive. Book at close:
  160 rows, nothing deleted.

### Withdrawing a record, and the card click (handoff 50, 2026-08-05)
- **THE READ PATH ALWAYS EXISTED. THE 404 WAS A MISSING HEADER.** Handoff 48
  mirrored `rec.withdraw` and correctly declined to build against it, because a
  withdrawn record could not be read back and so could never be reversed. That
  conclusion came from a 404 on `rec.source_decisions`, and the 404 was the
  absent `Accept-Profile: rec` header: without it PostgREST looks in `public`,
  finds nothing, and answers exactly as it would for a table nobody exposed.
  The grant has been in place since migration 0073. **If a rec table 404s,
  suspect the header before the grant.**
- **Read:** `lib/underwriting.ts getRecWithdrawals(agentId)`. FOUR filters, all
  load-bearing: `entity_type=eq.deal`, `decision=eq.record_withdrawn`,
  `status=eq.active`, plus agent scoping. **`status` most of all** — a reversal
  sets the row to `superseded` rather than removing it, so dropping that filter
  renders every reversed record as withdrawn permanently. The row's `id` is the
  `decisionId` the reverse endpoint takes and **this query is the only source
  for it**: the gates API exposes NO GET on this resource (405, verified live).
- **Write:** two proxies under `app/api/portal/admin/gates/rec/withdrawals/`
  (POST, and `[decisionId]/reverse`), both on `rec.withdraw`, both through
  `lib/gates.ts` `withdrawRecRecord` / `reverseRecWithdrawal`.
  **`instructed_by` and `instructed_on` are structurally absent from the body**
  and must stay so (guardrail 19): the human comes from the verified session at
  the far end and the date from the server clock. The schema is strict, so
  sending either is a 422 rather than a silently ignored field.
- **MATCHING IS ON `source_system` + `source_id`**, which `rec.deals` carries as
  its own columns on all 160 rows, so there is NO join. Do not route this
  through `rec.source_aliases`: it covers 124 rows and would leave the rest of
  the board unable to show its own state. `source_system` is optional on the
  write, so a decision naming none matches on `source_id` alone (unique across
  the whole book, verified).
- **THE REFUSAL KEYS ON `finmo_application_id`, NEVER ON `source_system`.**
  `source_system='finmo'` covers 2 of 160 records; `finmo_application_id`
  covers **106**, including **17 of the 38** no-reference records. A withdrawal
  stops the LIVE FINMO RECEIVER as well as the CSV loader, so keying on
  source_system would stay silent on all 17 while cutting their feed. A live
  feed AND an open workbench room is **REFUSED**, enforced in the ROUTE and not
  only on the button: posted at directly with a forged `hasRoom:false` it still
  answers 409. A room with no live feed is a caution (not in the brief, not
  refused, and today the populations coincide exactly). A workbench read that
  FAILS refuses the withdrawal rather than assuming no room.
- **ZERO of the 38 no-reference records carry a workbench room**, so the
  refusal never blocks the sitting it was written for. It fires on the 9
  room-bearing files on the board.
- **A withdrawn record leaves the phase columns, the Archive AND the insights**
  — a weighted total that kept counting a removed record would be a forecast
  that lies — and appears in the **Withdrawn view alone**, never in two views.
  Its count renders beside Archive **even at zero**, because that count is the
  only place a shrinking book can be read against what left it.
- **NOTHING SAYS DELETE**, enforced by `tests/rec-withdrawal.test.ts` (a
  negated use like "the record is not deleted" is the point, not a breach).
  The reason is REQUIRED, never prefilled, never carried between records, and
  an over-long one is REFUSED rather than truncated. Arming is by timestamp at
  tap time, the committed-terms pattern.
- **THE LIVE ROUND TRIP IS NOT PROVEN AND CANNOT BE FROM LOCAL DEV.** The dev
  Clerk instance carries ZERO JWT templates, so no gates token mints and
  `gateCall` returns its 401 auth copy before any network request (confirmed:
  no `[gates] POST` line in the server log). Everything up to that boundary is
  proven, including all six route refusals. **Budget production for the write
  proof.** Book state at close: 160 rows, 3 `source_decisions` all
  `field_corrected`, **zero active withdrawals**, nothing deleted.
- **THE CARD CLICK OPENS THE FILE.** `DealPreview.tsx` is left in the repo
  **unreferenced**, with its read-only grep in `tests/phase-model.test.ts`
  still pointed at it, so restoring the panel is one line. `selectedRef` now
  only rings the card you came back from. Board client JS 195 B -> 438 B, file
  page 197 B -> 216 B.

### The copy gate now covers Deals (Beta), and the terms card says it is final (handoff 46, 2026-08-05)
- **THE COPY RULES APPLY TO EVERYTHING RENDERED IN THE PORTAL**, not only client
  copy: no em dash, no en dash, no exclamation point, no semicolon in prose.
  `tests/beta-copy.test.ts` enforces them by WALKING the deals-beta tree plus
  `lib/beta-file.ts` and `CommitmentTermsCard`, so a string nobody has written
  yet is checked the moment it exists. It reuses `lib/booking/copy-gate.ts`
  `COPY_RULES` rather than restating them, so the portal cannot end up with two
  definitions of the gate.
- **WHY NOW: the empty-state pattern was about to be copied four more times**
  (Documents, Qualification, Submission, Compliance). Fixing the pattern once
  is cheap; fixing four replicas is not, and one gets missed.
- **The "broker" rule is deliberately NOT applied here.** It is a client-copy
  rule; this is an internal admin surface and "broker condition" is the correct
  term on a lender's checklist. The typographic rules apply everywhere.
- **KNOWINGLY EXCLUDED, so the gap is a decision not an oversight:**
  `ConditionsChecklist` (5 rendered em dashes) and `CommitmentUploader` (2).
  They render on the beta page but their copy is the deal room's, written
  before this surface existed, and rewriting it was outside handoff 46's two
  target surfaces. Listed in the handoff 46 report for Michael to green-light.
- **THE COMMITTED-TERMS CARD NOW STATES ITS OWN FINALITY.** Above both buttons:
  "Both choices are permanent. The gate moves only pending terms, so there is
  no way back to this state. A correction means a new commitment, not an undo."
  Buttons read `Approve all {n} (final)` and `Reject the set (final)`, count
  dynamic. Armed copy is "Press again to confirm. This cannot be undone." and
  "Press again to confirm. Rejecting is also permanent." The card ALREADY armed
  both buttons, so this was copy only and no behaviour changed.
- **REJECT IS STILL STYLED AS THE SAFE OPTION and that is unresolved.** Approve
  is solid navy (primary), reject is a white outline (which reads as Cancel).
  Both are equally permanent. The visual treatment was NOT changed on this
  session's own judgement; the proposal is in the handoff 46 report.
- **TIMING, recorded because it matters:** Michael approved BRXM-F060561's ten
  terms himself at 2026-08-05T14:24:22Z (`commitment.terms_approved`,
  actor=portal/mfox@foxmortgage.ca, decided 10) BEFORE this warning shipped.
  The copy guards the next commitment, not that one. Zero pending terms remain
  in the book, so the buttons were render-proved by forcing a pending state
  locally and reverting.

### Deals (Beta): the Conditions, Commitment and Client tabs (handoff 45, 2026-08-05)
- **THE FIRST SHARED COMPONENTS between the beta and the live deal room.**
  `ConditionsChecklist`, `CommitmentTermsCard` and `CommitmentUploader` are
  RENDERED, not forked — the gate proxies are keyed on record ids rather than
  pages, so every card keeps its existing route, permission key and
  browser-minted token path with zero duplication. Two surfaces reading the
  same rows is the intended state during build → move → repoint → remove.
  Nothing in the deal room changed; the diff does not touch it.
- **The Conditions tab reads `public.conditions`, NEVER `rec.conditions`.**
  The record layer's table has no `gate_status` column (42703), so a tab over
  it would show an ungated population and rebuild handoff 44's defect on a new
  surface. Keyed on the workbench id from `resolveRoom`; no room renders the
  honest empty state and no room is ever invented.
- **TAB BADGES: a queued decision is visible without opening the tab.** The
  room force-opens a section; the tab row's equivalent is a count on the tab.
  `buildTabBadges` in `lib/beta-file.ts` is general; **only Conditions is
  wired**, because a badge on a tab that computes no count is a number nobody
  can trust. Amber, matching the room's pending banner — lime is not spent
  here. Zero pending in the book today, so it renders nothing; proven by
  forcing a count and screenshotting, then reverting.
- **THE EXISTING-MORTGAGE RULE KEYS ON PRESENCE, NOT DEAL TYPE.** The brief
  said a purchase has no existing mortgage; **that is false in this book** —
  BRXM-F053724 is a purchase carrying a real Scotiabank 3.24% fixed maturing
  2027-03-30. So: a record present is ALWAYS shown; absent is SILENT on
  purchase/preapproval/unknown; absent is a NAMED GAP on renewal/refinance/
  switch, where one must exist in reality. An empty block on a file that
  structurally cannot have one is a false absence, and this page's convention
  is that empty means "not yet".
- **BOTH mortgages are labelled explicitly** — "This deal's mortgage" (with
  "not recorded yet" when absent) and "The client's existing mortgage" — so a
  populated old block can never read as this deal's rate on an unfunded file.
- **THE COMMITTED-TERMS CARD CARRIES NO IRREVERSIBILITY COPY AT ALL** — not on
  the button, not in surrounding text. Verified, not assumed. It was carried
  across UNCHANGED rather than edited, because the wording is shared with the
  deal room. Proposed wording is in the handoff 45 report and is MICHAEL'S to
  accept before anyone edits the card.
- **The write guarantee now follows the reuse.** `tests/beta-file.test.ts`
  gained a scan of the three shared components against a CLOSED allowlist:
  `/api/portal/admin/gates/` plus `/api/portal/admin/commitments/`. The second
  is deliberate and recorded: the commitment upload is a pre-existing route
  gated on `commitment.upload` with a human Clerk actor, which satisfies the
  guarantee's intent while not matching its path prefix.
- **Client tab shows EVERY client, not the primary alone.** Read from
  `rec.clients` through `rec.deal_clients`. Coverage is uneven and honest:
  email/phone 137 of 139, DOB 136, work phone 40, marital 44, dependents 39.
  Zero dependents renders as 0, not as absent.
- **Client JS: 208 B route-specific, but FIRST LOAD 94.3 kB → 128 kB**, the
  first time this surface crossed the client boundary. The deal room's own
  route JS fell 31.8 kB → 21.7 kB as the shared cards moved into common
  chunks. The board is unchanged at 195 B.

### Conditions carry TWO axes, and reading one is not reading the file (handoff 44, 2026-08-05)
- `status` is the WORKFLOW axis (open, pre_checked, evidence_attached,
  satisfied, waived): "have we collected it yet?" `gate_status` is the
  DECISION axis (pending, approved, superseded, rejected): "is this row part of
  the live checklist at all?" **A reader that filters only on `status` counts
  every retired row as outstanding work.**
- **Supersession RETIRES a row, it never removes one** — the audit trail
  depends on those rows surviving (guardrail 21). So a re-extracted commitment
  leaves the previous set at `gate_status='superseded'` with `status` STILL
  `'open'`: never collected, never going to be.
- **BRXM-F057400 is the proof**: 157 rows, ALL `status='open'`, splitting
  **12 approved / 124 superseded / 21 rejected** across thirteen extraction
  runs and two human rejections. The correct answer is 12. It is the ONLY file
  in the book with any supersession (established by reading the gate split for
  every file, not by assuming it was unique).
- **THE DEAL ROOM WAS ALWAYS RIGHT.** `getApprovedConditions` has filtered
  `gate_status=eq.approved` since Phase B2; the room read "Conditions (12 open
  of 12)" before this session and after it. So did the Deals list, Ask Fox and
  the Closings open-count. **Two readers were wrong and both were on Today /
  Compliance, not the room.**
- **FIXED:** `getConditionsDue` (Today's chase rail) and
  `getComplianceAttentionDeals`. Today's exceptions line read **"146 overdue
  conditions"** on F057400 and now reads **"1 overdue condition"**; the
  compliance reasons list over-counted 33 to 8.
- **`APPROVED_CONDITION_GATE` is one shared constant** because the Closings
  card renders "N open" from `getOpenConditionCounts` and "N overdue" from
  `getConditionsDue` — two literals could drift and put contradictory numbers
  on the same row; one constant cannot.
- **PENDING IS A DECISION, NOT A CHASE.** Today reads the approved population
  only. A pending condition must not be chased (it may yet be rejected) and
  must not be hidden either — it stays visible where it is actionable, in the
  deal room's amber banner, whose section force-opens. There are ZERO pending
  conditions in the book today, so this is a forward-looking rule. **If Michael
  wants "a commitment is waiting on your decision" on Today, that is a new
  tile, not a filter change** — noted, not built.
- **`rec.conditions` has NO `gate_status` column at all** (Postgres 42703), so
  the Deals (Beta) board is structurally unaffected. Untouched this session.
- **The guard is `tests/conditions-gate.test.ts`, and it is a SOURCE scan, not
  a live assertion.** The defect is invisible on any file that has never been
  amended, so a live check would pass today and keep passing until the next
  amendment. The test parses every `uwSelect('conditions'` block out of
  lib/underwriting.ts and fails any that omits `gate_status` — including one a
  future session has not written yet — and separately proves the filter reaches
  PostgREST. Verified to fail (4 tests) when the filter is removed.

### Deals (Beta): the file page, and the guarantee that changed (handoff 42, 2026-08-05)
The board had NO file-level surface: one route, no `[id]`, no API route, 195 B
of client JS. A file-level feature therefore had nowhere on this board to live,
which is how the committed-terms card ended up on the live deal room. This
session built the container. It moved no feature into it.
- **THE READ-ONLY GUARANTEE WAS REPLACED, NOT DROPPED.** It WAS: "the beta
  board is read-only", enforced by grepping the preview panel for form /
  onSubmit / onClick / POST / button / input / textarea / select. It IS NOW:
  **nothing under `deals-beta` writes except through an existing gate proxy,
  with a human actor** — no direct database write, no new write path invented
  here, no service-role key, no `Content-Profile` header. WHY: Michael approved
  writes on this surface, so the old sentence stopped being true, and an
  untrue guarantee is worse than none. `tests/beta-file.test.ts` enforces the
  new one across the WHOLE deals-beta tree (it walks the directory, so a file
  added by a later session is audited automatically). The preview panel keeps
  its ORIGINAL grep in `tests/phase-model.test.ts` because that panel stays
  read-only. **This session added no write at all**; the page is a container.
- **THE JOIN KEY IS `rec.deals.workbench_deal_id`, and nothing had ever
  selected it.** `getRecDeals` now does. Resolution is
  `lib/beta-file.ts resolveRoom`: direct id, then an UNAMBIGUOUS `file_ref`,
  then **null rather than a guess** — two workbench rows sharing a file_ref
  resolve to neither, because putting one client's documents on another
  client's page is the worst failure this surface could have. Live coverage
  2026-08-05: **10 of 13 rooms** (5 direct, 5 by file_ref).
- **A rec deal with no workbench room is the NORMAL case, not an error.**
  153 of the 160 rec rows are `is_historical_import`. The empty states say so
  and render no dead link.
- **The route is `/portal/admin/deals-beta/[dealId]`, keyed on the REC deal id**
  and gated on the existing `deals.view`. **No new authority key**, asserted by
  test. Still a server component: **197 B** of client JS.
- **EIGHT TABS ON EVERY FILE, ALWAYS, IN ORDER** (Overview, Client, Documents,
  Qualification, Submission, Commitment, Conditions, Compliance). The row reads
  left to right as the file's life so it teaches the process. A tab is NEVER
  hidden for having no data. Order is `FILE_TABS` in `lib/beta-file.ts`; do not
  reorder. Only Overview is filled.
- **FLAGS ARE A STRIP UNDER THE HEADER, NEVER A TAB** — a flag interrupts, so
  it must be visible from every tab. **There is no flag table in `rec`**
  (verified live). The strip is built and renders nothing.
- **STAGE IS READ-ONLY HERE.** No advance control, no phase-complete button.
  `public.deals.stage` and `rec.deals.stage_code` carry different vocabularies;
  advancing one before that consolidation would write into an unresolved fork.
- **TWO MORTGAGES PER FILE AND THEY ARE NOT INTERCHANGEABLE.** The one being
  PLACED is `rec.mortgages.originating_deal_id -> deal.id`; the one being
  REPLACED is `rec.deals.existing_mortgage_id`. Rendering a renewal's OLD rate
  as the deal's rate is exactly backwards, so they resolve separately and the
  replaced one renders in its own labelled block.
- **`formatMonths()` did not exist** despite the brief citing it. Written in
  `lib/beta-file.ts` (months below 24, years and months at or above). The two
  nearest helpers disagree with the rule and with each other — `lib/scenario.ts`
  `termLabel` gives "2yr"/"25mo", `lib/smm.ts` `comparableTermLabel` gives
  "5-year term" — and NEITHER was repointed; both are load-bearing elsewhere.
- **TWO APPROVED FIELDS HAVE NO COLUMN IN `rec`: "Subject to financing" and
  "Rate hold expiry."** They render "Not specified" and are named in
  `FIELDS_WITHOUT_A_COLUMN` rather than dropped, so the gap stays visible.
- **`rec.properties` carries the street TWO ways**: `address_line1` (154 of 161)
  and `street_number` + `street_name` (7 of 161). Reading only the first printed
  a bare "North Perth, ON" for a file that does have an address; both are read.

### Deals (Beta): the rebuild (2026-08-02b) — READ THIS ONE
Supersedes the two sections below. `lib/phase-model.ts` (rules) +
`lib/phase-palette.ts` (colour); `lib/four-phase.ts` has not existed since
2026-08-02.
- **THE PHASE CODES CHANGED.** `advise` → `underwriting`, `fund` →
  `fulfilment`; the old rows are `is_active: false`. Monitor grew 5 → 7 steps,
  Fulfilment is 5 (commitment retired), 28 active stages. Nothing in this repo
  needed editing for the rename except the palette's hue keys, because every
  code path reads codes from `rec.phases` / `rec.deal_stages` at runtime. If a
  future rename breaks something, that something is hardcoded and is the bug.
- **PROBABILITY (`rec.deal_stages.probability`).** Present on underwriting
  (20→44) and fulfilment (45→100); **NULL on intake and monitor, and null is
  NOT zero** — those phases count people, and 0 is what a LOST deal means
  (the three terminals carry 0). A null never renders as 0, never enters a
  sum, and never puts its phase in a weighted total. `phaseTotals` and
  `columnWeight` return **null** rather than a zero so a caller cannot add
  what it never received. Contact-level columns therefore carry NO footer at
  all, which is the visible proof.
- **A PROJECTION IS NEVER DRAWN LIKE AN ACTUAL**, and as of 2026-08-02c it is
  a SOLID FILL, not a hatch. The hatch was tried and failed: the number sits
  INSIDE the fill here, so the texture ran through the digits. On the
  practice-history chart the number sits OUTSIDE the bar, which is why it works
  there. **Hatch behind a bar, never behind type.** The replacement is
  `PROJECTION_GREEN` (hue 152, a light tint with dark-green digits).
  `Weighted` and `ColumnWeight` carry `isProjection: true` so a caller cannot
  destructure the number without meeting the flag, and the word `weighted` or
  `projected` always rides with the figure — colour never carries meaning alone.
- **THE TWO-GREEN ZONE RULE, enforced by construction.** Projection green and
  needs-you lime are separated by MODULE so they can never sit side by side:
  `components/admin/deals-beta/ProjectionFigure.tsx` owns the green and imports
  no decision token; `components/admin/deals-beta/DealCard.tsx` owns the lime
  and imports no projection token. The card moved into its own file precisely
  so the path-keyed lime audit in `tests/shell.test.ts` enforces "lime on cards
  only", and `tests/phase-model.test.ts` asserts both halves on the imports
  (not on mentions — the headers explain the rule and name both tokens).
  **Green = footers and the insights strip. Lime = cards. Never the reverse.**
- **The preview panel** (`?deal=<file_ref>`) — **RETIRED AS A BEHAVIOUR IN
  HANDOFF 50, still present as a file.** It was a server component whose
  selection rode searchParams, read-only with a close control and nothing else.
  Michael opened it and clicked straight through to the file every time, so the
  card now links to the file page directly and this panel is no longer
  rendered. `DealPreview.tsx` is deliberately LEFT IN THE REPO unreferenced,
  and its read-only grep in `tests/phase-model.test.ts` still points at it, so
  restoring the old behaviour is one line rather than a rebuild. The two
  figures in the bullets around this one are also superseded: the board is
  **438 B** of client JS, not 195 B, because the Remove control crossed the
  client boundary.
- **CARD TAGS ARE THREE SCALAR COLUMNS AND MUST STAY THAT WAY** (field,
  operator, value). They cannot express a conjunction, a join or a time
  window; wanting one is a record-layer change, never a rules engine here.
  **`no_next_step` is active but UNEVALUABLE: `rec.deals` has no
  `next_activity_at` column** (Postgres 42703). A rule naming a field the row
  does not carry returns `unevaluable`, renders nothing, and is named once
  above the board — treating absent-as-null would tag all seven files and
  invent a signal out of a field nobody records. `large_deal` is inactive AND
  has a null threshold; it is filtered at the query.
- **Milestones** (`rec.deal_milestones`, 0 rows) render as small dated markers,
  never as stages. The link column is **`milestone_type`, not
  `milestone_code`**. Built for `lawyer_instructed` landing on a file in
  Conditions.
- **Insights strip: five tiles.** Total / open / closed won are actuals;
  weighted pipeline is a projection over OPEN files only (a funded deal is an
  actual, and folding a certainty into a forecast is how forecasts start
  lying). The fifth is **"Average days since first stage event"**, which
  replaced the omitted average-deal-age tile (2026-08-02c): `created_at` is the
  seed date on every row, so age from it measures the migration. The tile is
  labelled for WHAT IT MEASURES rather than as deal age with a different
  formula underneath, and carries its own coverage (5 of 7 files) so a partial
  average is never read as a whole one. It is omitted entirely if no deal has a
  stage event.
- **Collapse rides `?collapsed=` in the URL**, so the board is still a SERVER
  component with 195 B of client JS and no handler, form or drag target. A
  collapsed column keeps its name, count, total and weighted footer.
- The one-screen constraint stays withdrawn: 280px columns, board scrolls,
  collapse is the answer to a phase that will not fit.

### Deals (Beta): FIVE phases as of B0c (2026-08-02, superseded by the rebuild above)
The record layer moved; the page moved with it. `lib/four-phase.ts` is GONE,
replaced by `lib/phase-model.ts` (rules) + `lib/phase-palette.ts` (colour).
- **Phases are rows now.** `rec.phases` (5: attract, intake, advise, fund,
  monitor) carries `unit`, `counts_dollars`, `is_ordered` and `level`. READ
  THOSE — never branch on a phase's name. THREE units exist (arrivals, people,
  files) and `phaseTotals` returns **null**, not zero, for anything not
  deal-level, so a caller cannot render "0 files" for a phase that counts
  people. Nothing sums across units and no function exists that could.
- **EVERY SUB-STAGE RENDERS, occupied or not** (intake 7, advise 6, fund 6,
  monitor 5). An empty column is information; a missing column is a lie about
  the process. Never filter columns by occupancy.
- **Attract has no stages, structurally** — `is_ordered` false, `level`
  `source`. It renders `rec.attract_sources` (5) instead. Do not give it a board.
- **Gates** come from `deal_stages.is_gate` (4: routed, proceeding, funded,
  decided) and render as a dashed accent plus a small label.
- **The return rail reads `rec.phase_returns` (2 rows)** — Decided → Advise
  (strategy session) AND Decided → Attract (the book). Drawing only the renewal
  return understates the loop; both are configuration, never hardcoded.
- **The Archive** (`?view=archive`) is a VIEW, not a sixth phase card. The three
  `terminal_lost` stages belong to no phase, so lost files rendered nowhere
  before. The outcome leads each row: lost-to-competitor is a remarketing lead
  and cancelled is not. **Empty today — no deal sits in a terminal stage.**
- **COLOUR MEANS EXACTLY TWO THINGS**: hue = which phase (a cyan→magenta sweep,
  195/215/250/285/320), depth = how far along (the accent alpha ramps 0.35→1.0
  across a phase's columns, computed from POSITION so a new stage extends the
  ramp with no code change). Never one arbitrary colour per stage. Every hue is
  outside the 60–140° green band, enforced by test, because **lime means only
  "this needs you"** and is spent on the You chip alone. Deal types are a
  SEPARATE channel — outlined chips, not fills — so hue reuse cannot confuse.
- **The one-screen constraint is withdrawn.** Columns are 264px min and the
  board scrolls sideways; a readable card beats a crammed column.

### Deals (Beta): the four-phase board over `rec` (2026-08-01, superseded above)
A READ-ONLY surface at `/portal/admin/deals-beta` for judging the September
record layer beside the live setup. The live Deals area at
`/portal/admin/underwriting` is untouched and stays the daily driver.
- **Read-only by construction.** A server component: phase selection rides
  `searchParams` through links, so it ships no client JS and has no form,
  handler, or drag target. Reads go through `lib/underwriting.ts` as
  `portal_readonly`. `POST rec.deals` answers **403 / 42501** (verified live).
  No service role key, ever.
- **`rec` is reached with `Accept-Profile`**, an optional argument on `uwFetch`.
  Its write-side twin `Content-Profile` is NEVER sent — that is the header that
  would make a write possible, and its absence is the guarantee.
- **Stages are CONFIGURATION.** Columns come from `rec.deal_stages` where
  `phase` is not null, ordered by `sort_order`, read at runtime. Never hardcode
  a stage list: adding a row adds a column with no code change (tested).
- **DAYS IN STAGE IS NEVER INVENTED.** A figure renders only when an event's
  `to_stage` equals the deal's CURRENT `stage_code`. The timestamp column is
  `changed_at`, not `occurred_at`. Live data has deals whose only event is entry
  into `submitted` while they now sit in `lender_response` — falling back to the
  latest event would print a real-looking number for the wrong stage. The two
  absent states are distinguished on the card (`no stage history` vs
  `stage entry not recorded`). Pinned in `tests/four-phase.test.ts`.
- **The two units are never added.** Contact-level phases (Intake, Monitor) are
  dashed and count people; deal-level (Advise, Fund) are solid and count files
  with a dollar total. `lib/four-phase.ts` exposes no combined total by design.
- **The `You` chip is the ninth lime surface**, registered in the
  `tests/shell.test.ts` audit; Client, Lender and Lawyer stay cool (asserted).
- Intake and Monitor are honest placeholders: `rec.consents` holds zero rows,
  and Monitor should EMBED the existing Opportunities engine, never rebuild it.
- **Temporary by intent.** Retire the page and its nav item when the record
  layer ships or is rejected; that also returns the working nav to ten.

### Nav IA (names are stable; renames need a note here)
Home | Tasks (A2, native task list) | Deals (S3) | Deals (Beta) (rec four-phase board, temporary) | Approvals (S3) | Rates (S4) | Intel (S4) | Knowledge (S4) |
Changelog (S4, under Knowledge) | Compliance (S6) | Revenue (S7) |
Partners (S7 health ranking over the existing management pages) |
Directory (S4) | Bookkeeping (nav link to existing /portal/bookkeeping,
pages untouched) | Audit Log (S3) | Status | Settings | Roadmap. All live.
Config: `config/admin-nav.ts`. Session 8 additions outside the main list:
"View as a partner…" heads the portals quick-links block
(portals.view-as); People lives under Settings
(/portal/admin/settings/people, people.manage); the view-as session log
lives under Audit Log (/portal/admin/audit/view-as, audit.view).

### Session 4 pages and semantics
- Terminal-deal filtering: config/pipeline.ts isTerminalWorkbenchDeal (status not
  active, or stage in WORKBENCH_TERMINAL_STAGES: funded/closed/lost/cancelled/
  archived). Terminal deals never feed the Home Needs Attention rail or the
  Approvals badges; they stay fully visible in the deal list and room. Open flags
  on terminal deals render in a collapsed closed-files section on the flags tab
  (still decidable; excluded from the badge). A terminal deal room with open
  conditions or flags shows a quiet cleanup note.
- Deal room conditions carry decision controls (components/admin/
  ConditionsPanel.tsx): satisfied/moot/waived with two-tap confirms, notes, 409
  handling, router.refresh reconcile. This is Michael's cleanup and daily tool.
- /portal/admin/rates: RatesBrowser (client filter over approved plus superseded
  behind a toggle), digest strip (lib/rates.ts computeLenderDigests: median
  movement only when two sheet dates exist, otherwise the sheet date, honestly),
  PromoCountdowns from the offers endpoint (amber inside 14 days).
- /portal/admin/knowledge and /knowledge/[slug]: client-fetched via the proxy
  routes; as-of dates everywhere, stale flag past 90 days (lib/knowledge.ts,
  unit-tested), draft caveat (Scotia), withheld-profile handling (MCAP: never
  invent figures), markdown rendered with react-markdown + remark-gfm in house
  style, approved-quote count linking into Rates filtered by lender.
- /portal/admin/intel: read-only feed from lender_intel_items with lender and
  source filters; items with a sheet review show the outcome; no mutation, the
  workbench owns intel lifecycle.
- /portal/admin/changelog: week-grouped feed from rate_sheet_reviews, recent
  intel, and PLATFORM_NOTES in config/changelog.ts (each session appends one
  entry; convention documented in that file). Offers render as a current-state
  strip because they carry expiries, not start dates.
- /portal/admin/directory: staff from the agents table; lender contacts state
  the grant gap (number directory outside the granted surface).
- Form intake acknowledged convention: zoho_failed rows carry acknowledged_at/
  acknowledged_by (FOXCA migration 20260710000000). The status panel counts only
  unacknowledged failures (light logic pure and unit-tested in lib/status.ts);
  acknowledge is admin-only (status.acknowledge) through the security-definer
  function, recorded who and when, and never hides fresh failures.

### Session 5: Rates v2, scenario-driven (2026-07-10)
- /portal/admin/rates now lands on the scenario view (three levels, Lender
  Spotlight shaped, grounded in audited data); the Session 4 dense table
  stays behind the Cards/Table toggle with superseded history. Trust edge
  everywhere: every rate carries its sheet date; product detail renders the
  approval provenance block (sheet review decision + decided date + audit
  entry id linking into the audit viewer) and the lender knowledge page
  where the slug matches.
- lib/scenario.ts is the pure model (unit-tested in tests/scenario.test.ts):
  matchQuote / lenderResults / summaryLine / classifyVariant /
  scenarioParamsFromDeal / URL round-trip. The whole view state lives in
  searchParams (scenario, lender, product, pins, view, from), so back
  preserves the scenario, deal rooms prefill by link, and every level is
  reachable without a pointer event.
- rate_quotes dimension inventory: SUPERSEDED by the Session 6 refresh
  below (migration 0029 added rate_type / prime_variance / cashback_pct /
  program_notes and the parser expansion multiplied lenders and variants).
  Still true from Session 5: no purpose/transaction-type column exists;
  purpose in the scenario drives promo eligibility and the summary line
  only, never the quote filter (tooltip says so).
- Sparse-dimension rule (tested): explicit variant markers rule quotes in
  or out; absence NEVER silently excludes; the match carries an assumed
  note the UI shows as a tooltip plus an inline line. Unknown future
  variants classify as 'other' and always match with a note.
- Payment math: lib/mortgage-engine.ts monthlyPayment was ALREADY the
  shared validated library (the public calculators import it; it shares the
  semi-annual compounding core with refinance-engine). No extraction was
  needed; Rates v2 and the PDF import it and never re-derive. Cent anchors
  in tests: 650000 @ 3.75 over 30yr = 2999.58 (cross-validated against a live file);
  500000 @ 5.00 over 25yr = 2908.02 (standard reference).
- Compare tray: pin up to three products across lenders (pins in the URL),
  aligned rows with payments at the scenario amount, penalty methodology
  line per lender. No machine profile documents a penalty methodology
  today, so the line renders the honest not-documented state with the
  profile's as-of date; the lookup lights up when profiles gain the field.
- Client PDF: POST /api/portal/admin/rates/pdf (rates.view), server-side
  with pdf-lib (no headless browser on the serverless runtime; Helvetica
  with brand navy/lime, recorded tradeoff). The route re-fetches pinned
  quotes through the read-only role and recomputes payments with the
  engine; client figures are never trusted into a client-facing document.
  Lender display names resolve live from the knowledge index through the
  browser-minted token the tray forwards (x-gates-token, same posture as
  the knowledge proxies); mint failure degrades to stored slugs. Grade 6
  copy, scenario summary, sheet dates, licence line (Mortgage Agent
  Level 2, BRX Mortgage, FSRA 13463), estimates-not-a-commitment
  disclaimer. Download only, filename rates-comparison-[date].pdf, never
  client PII in the filename (a prefill file ref may appear in the body).
- Deal room prefill: the find-rates button builds
  /portal/admin/rates?...&from=<fileRef> via scenarioParamsFromDeal (reads
  only; purpose mapped only from the deal_type vocabulary, insured
  prefilled only above 80 LTV); the scenario page banners the source file.
- Slug gap unchanged (Session 4 finding): quote slugs first-national/rfa/
  strive have no knowledge page; cross-links render the graceful no-page
  state. The component and the PDF route already resolve through
  quote_slugs aliases the moment fox-underwriting micro-session 3 publishes
  them on the knowledge index; the portal never invents the mapping.

### Session 6: floating rates on screen, and Compliance (2026-07-10)
- Prerequisite consumed: the fox-underwriting variable-rates session
  (migration 0029). rate_quotes now carries rate_type (fixed | adjustable |
  variable, printed label only), prime_variance (signed, verbatim; -1.05 =
  P minus 1.05, alt sheets price prime-plus), cashback_pct, program_notes
  (verbatim printed conditions); rate is NULLABLE behind a priced check (a
  quote carries a printed rate or a printed variance, never neither). All
  three portal row types (RateQuoteFullRow, RateQuoteBrowserRow, the
  approvals RateQuoteRow) carry the new columns; every .rate call site
  handles null.
- Rates-reference layer: GET /api/knowledge/rates-reference (prime with
  as-of and source, per-lender overrides, floating mechanism notes,
  quote-slug coverage) proxied at app/api/portal/admin/knowledge/
  rates-reference behind knowledge.view, same browser-minted-token posture.
  EFFECTIVE RATES ARE COMPUTED AT DISPLAY TIME as prime + variance
  (per-lender override first, matched through the published coverage map
  only) and always labeled with the prime as-of used; a computed figure is
  never stored. Reference unreachable = discount alone with the honest
  prime-unavailable state, never stale or guessed (unit-tested). A floating
  quote whose sheet printed its own rate displays the printed figure
  (UnionLink prints both).
- Ranking contract (lib/scenario.ts, tested): floating-only views sort by
  deepest discount (most negative variance); mixed views sort by effective
  rate; floating rows the reference cannot price sort last, deepest
  discount first; adjustable and variable are NEVER collapsed anywhere
  (distinct badges, sky vs violet, with mechanism tooltips from the
  reference payload, never the sheet label; pending caveat renders when
  basis is printed_label_plus_convention, Scotia's variable note today).
  A cash back tier is its own row and never the lender headline (a lender
  with only cashback matches shows no headline rate at all). Scenario
  gains the three-way rate-type filter (rt param) and the cash back filter
  (cb param); product class extended to the observed vocabulary
  (conventional/insurable/insured/b_side/heloc/reverse/other) since the
  expansion book carries all of them. Scenario.insuranceClass renamed to
  productClass (URL param stays 'class').
- Promo offers as first-class scenario results: offerScenarioResult
  renders an offer inside matching results ONLY when its structured
  eligibility fits (purpose/occupancy/amortization gates, the same
  semantics as fox-underwriting assessOffer) AND it carries structured
  rate tiers; prose-only offers never auto-apply (they stay countdown
  chips). Tier follows the scenario product class (insured picks the
  default-insured tier). The Scotia 60-day 3yr special at 4.19 is the
  proving case: badged card beside the sheet quotes with conditions,
  expiry countdown, started date, and announcement provenance (never a
  sheet). Term is NOT structured on offers; the card states the offer's
  own description verbatim.
- Approvals sheet cards (Michael's 719-quote sitting renders through
  this): summary strip prints fixed printed-rate ranges per term plus
  floating discount ranges per mechanism (P−0.75..P−0.35 style) plus the
  cash back tier count; quote detail rows print discount-first floating,
  cashback chips, and program conditions verbatim expandable. The old
  min/max math would have crashed on null rates.
- Client PDF: paginated now (program notes are verbatim, so overflow adds
  pages; licence footer on every page); rate rows discount-first with
  labeled effective rates; rate-type row; cash back row when a pinned
  product carries one; mechanism lines per floating product in grade 6
  words; printed program conditions verbatim; a sources section with
  sheet date, page, snippet, and extraction confidence. The route fetches
  rates-reference through the forwarded browser token; token missing or
  refused = the PDF says prime was unavailable and prints no effective
  rate (never stale). Helvetica lacks U+2212 so the PDF prints ASCII
  hyphens (pdfSafe).
- Directory completes: number_links (17th granted table) renders learned
  numbers with label, source, and Zoho contact/partner links; last-10
  digits exactly as stored.
- rate_quotes dimension inventory refresh (live, 2026-07-10, post
  migration 0029; 1150 readable rows: 312 approved incl. 2 approved
  TEST-GATES-VR test-portal artifacts, 119 superseded, 719 extracted
  pending Michael's sitting):
  - approved book: fixed 311 / adjustable 1 (the test artifact); real
    approved floating arrives only when Michael approves the queue.
  - pending 719: fixed 554 / adjustable 133 / variable 32; cashback_pct
    non-null on 95 (values 1/2/3/5); program_notes on 243; rate null on
    154 (discount-only rows); floating variance -1.05 to +2.30; 11
    floating rows print BOTH discount and rate (unionlink).
  - pending lenders: mcap 123, merix 68, unionlink 62,
    first-national-excalibur 45, scotia 44, neo 43, cmls 40, npx 38,
    highclere 35, strive 33, nbc-optimum 32, haventree 25, b2b 24,
    first-national 23, rfa 21, bridgewater 21, shinhan 16, manulife 11,
    coast-capital 8, radius 4, home-trust 3.
  - product_class now carries b_side 189 / heloc 20 / reverse 3 / other 1
    beyond the insurance trio; variant vocabulary exploded (beacon bands,
    physician, pmpp, fusion tiers, promo windows, partner-exclusive
    bands); unclassified variants keep matching-with-note by design.
  - prime 4.45 as of 2026-07-09 (CMLS, corroborated book-wide); one real
    override: Kootenay PLR 5.50 (2026-07-03). Mechanism notes cover 14
    lenders; every note today carries basis printed_label_plus_convention
    (pending-confirmation caveat renders).
- Compliance module shipped, two data homes honestly split. Workbench
  truth reads through the granted surface; business compliance records
  live in the FOXCA project (migration 20260710120000 + the table-revokes
  follow-up, applied 2026-07-10): compliance_credentials,
  compliance_complaints, compliance_policies + _versions + _acks, and
  compliance_events (append-only trail). RLS on with NO table policies AND
  direct table grants revoked (verified live: table select refuses 42501);
  the ONLY surface is 13 narrow security-definer functions granted to
  anon. lib/compliance.ts is the only client; admin gating rides
  compliance.manage (new authority key, admin only) on the routes under
  app/api/portal/admin/compliance/; every mutation records the acting
  email and lands a compliance_events row. NOTHING DELETES: credentials
  retire, complaints change status, policies version (full history
  retained; acks attach to the version read).
- /portal/admin/compliance (compliance.view: admin + ops): dashboard
  (credentials tone, open complaints, policy ack coverage, files reading
  attention, honest-gaps note), credential register (seeded with
  Michael's FSRA licence / E&O / CE rows, placeholder dates marked
  date_confirmed=false rendering a confirm-date chip), complaint and
  incident register (FSRA-expects-this empty state), policy library
  (versioned markdown, read-and-acknowledge, suggestion-only empty state).
  Tab state in the URL (?tab=).
- Per-file compliance card (components/admin/ComplianceCard.tsx) on every
  deal room: posture chip computed by the pure rule in
  lib/compliance-logic.ts (attention = open compliance_gap flag or
  overdue solicitor/borrower_execution condition; clear needs recorded
  rows; empty files read gaps-unrecorded, never clear), rule stated
  verbatim in the tooltip (POSTURE_RULE); compliance_gap flags with
  disposition history; compliance-bearing conditions grouped by the
  stored category vocabulary; per-condition system precheck outcomes from
  the precheck jsonb; the five workbench gap fields stated honestly
  (suitability assessment, exit-strategy note, identity verification,
  disclosure delivered date, package state) as the fox-underwriting
  follow-up list.
- Home Needs Attention rail: credential renewals join at 60 days amber /
  14 days red (thresholds unit-tested in tests/compliance.test.ts; past
  due stays red; no date recorded never alarms), unconfirmed dates say
  "confirm date".

### Ask Fox, the practice agent (Agent session, 2026-07-10)
- /portal/admin/agent ("Ask Fox" in the nav, agent.use: admin today so
  onboarding roles can get it later; agent.execute gates confirm-card
  execution and stays admin even when agent.use widens). Mobile-first
  streaming chat; /portal/admin/agent/history lists every conversation;
  deal rooms carry a one-tap "Prep a call" button
  (/portal/admin/agent?prep=<fileRef>, auto-sends once).
- BEHAVIOUR RULES ARE THE PRODUCT (encoded in lib/agent/prompt.ts,
  versioned AGENT_PROMPT_VERSION; prompt changes get changelog entries):
  grounded or silent (every figure carries its source inline; missing
  data says "not captured", never a guess; no balance field exists in
  Zoho and the agent says so); approved means approved (pending quotes as
  counts only); reads freely, writes only through confirm cards; the desk
  decides (NO gate actions exist in the tool surface, architecturally);
  tenant-scoped and logged.
- The tool surface is EXACTLY six tools (lib/agent/tools.ts, enumerated,
  no raw queries; unit test asserts the list and greps prove no send
  paths): find_client (Zoho contacts and deals, longest-token retry
  because Zoho word search does not match a short first-name form
  against the stored full form),
  get_deal_file (workbench readonly composite; honest not-found for
  pre-workbench files), search_rates (the same lib/scenario matching
  module the Rates page uses: approved rows only, floating discounts with
  effective-at-prime labels, structured offers with conditions and
  expiry, prime as-of, pending counts by rate type), knowledge_lookup
  (profiles with as-of, mechanism notes with the pending caveat, penalty
  state), propose_zoho_update and propose_task (mint confirm cards,
  nothing more). Zoho writes exist ONLY in updateZohoRecordFields and
  createZohoTask (lib/zoho-admin.ts), called ONLY by the card execute
  route after the tap, executing the STORED payload (client bodies
  ignored); module allowlist Potentials and Contacts, scalar fields only.
- Loop (lib/agent/loop.ts): manual Anthropic Messages tool-use loop,
  streamed as NDJSON events (text, tool, card, error, capped, done);
  model claude-sonnet-4-6 by default (config/agent.ts AGENT_MODEL env
  override), adaptive thinking, cached static system prompt (runtime
  date renders after the cache breakpoint); caps enforced and
  unit-tested: 12 tool calls per user message (excess tool_use gets an
  is_error budget note; hard iteration ceiling above it), 25 messages
  per conversation (capped conversations say so plainly and require a
  new thread). Errors surface honestly in-stream; refusal, max_tokens,
  auth, and rate-limit cases carry their own copy.
- Persistence: FOXCA migration 20260710190000 (agent_conversations,
  agent_messages with tool_calls jsonb, agent_cards with one-decision
  guard), narrow security-definer functions only, table grants revoked
  (42501 verified live with the actual key), nothing deletes. The chat
  route persists the user message BEFORE the model runs and refuses to
  run unlogged; the assistant turn persists with its tool log even on
  mid-turn errors. Cards attach to their turn_seq; the execute route
  stamps who, when, and the result on the card row.
- Call Review: transcript paste or CSV upload; lib/agent/transcript.ts
  parses the Dialpad CSV shape by header sniffing (name/time/type/
  content-ish columns, event rows dropped, quoted fields handled) with a
  plain-text fallback so a paste never fails; the Jul 10 reference CSV
  was not on this machine, so the parser is shape-tolerant by design and
  unit-tested on a synthetic fixture. Rubric config/call-rubric.ts v1
  (ten items, stable ids); rubric changes are config edits with
  changelog notes.
- RUNTIME ENV VARS (Michael adds via dashboard or REST, all targets):
  ANTHROPIC_API_KEY (required; feature renders the honest not-configured
  banner until set) and optional AGENT_MODEL. DISTINCTION NOTE: the
  standing guardrail against setting ANTHROPIC_API_KEY in build-session
  subprocesses STANDS; this is a runtime product credential, server-side
  only, never client-exposed, never NEXT_PUBLIC. No key exists in
  .env.local by design.
- Live verification (2026-07-10, mocked-model tests plus real-read runs):
  find_client resolves the renewal reference client to IFMS-F001515 with Maturity_Date
  null and Mortgage_Rate 1.99 (the reference gap); get_deal_file answers
  found:false for IFMS-F001515 and found:true for BRXM-F053724;
  search_rates serves approved matches with the honest prime-unavailable
  state when no token rides; the confirm write path ran on TEST
  artifacts through the stored-card sequence (Zoho task
  7112178000005988001 created then completed; card 0c70fd74 executed
  with the double-decide guard returning false; conversation f0f90f9e).
  TEST-AGENT conversations and cards stay in FOXCA per the
  append-leaning posture.
- v2 noted on the roadmap: Dialpad-automatic Call Review through the
  existing n8n call pipeline (no paste). Out of scope this session.

### Session 7: Revenue and Partners (2026-07-10)

#### Part 1 data discovery (recorded per the brief; live against Zoho 2026-07-10)
- REVENUE FIELDS EXIST on Potentials: `BPS` (integer), `VB_BPS` (integer,
  volume bonus), `Split_to_Brokerage_Network` (double fraction; observed
  0.15 on 2026 files, 0.25 on some 2025), and three currency formula
  fields: `Total_Commission`, `Finders_Fee`, `Brokerage_Network_Commission`.
  Formula semantics verified to the cent on three funded deals:
  Total_Commission = Amount x (BPS + VB_BPS)/10000 x (1 - split);
  Finders_Fee is the same without VB_BPS; Brokerage_Network_Commission is
  the split share. One funded deal (BRXM-F040336) carries Total_Commission
  1500 with BPS null, so the formula also folds in a flat fee component
  (likely Brokerage_Fee); the portal treats Total_Commission > 0 as the
  actual and never re-derives it. IMPORTANT: formula fields always return
  a number, so 0 means "not recorded", never "free deal".
- Coverage: Total_Commission > 0 on 5/11 funded trailing-12 (45.5%) and
  11/54 all funded (20.4%); BPS set on 4/11 funded-t12. So actuals take
  precedence and config/comp.ts fills gaps, exactly the brief's design.
- ATTRIBUTION: Lead_Source does NOT exist on Potentials (0/205; the field
  is absent from the module, not just empty). It exists on Leads with
  100% coverage on the 26 leads created trailing-12 (top: Website - SMM
  Wizard 10, CoPilot Ai 5, Website 3). Referral_Partner on Potentials:
  12/35 deals created trailing-12 (34.3%), 18/205 all time across 4
  distinct partners, 4/11 funded-t12 (36.4%). These are the caveats
  rendered on the Revenue funnel and the Partners page.
- FUNDED-T12 MIX COVERAGE (11 deals): Transaction_Type 100%, Rate_Type
  90.9%, Term_Years 90.9%, Mortgage_Rate 90.9%, Mortgage_Type 72.7%,
  LTV 63.6%, Term_Type 54.5%, Lender_Name 27.3%. Mix charts render at
  >= 70% (MIN_MIX_COVERAGE in lib/revenue.ts): purpose, rate type, term,
  mortgage type in; LTV, term type, lender out with the honest
  low-coverage state. NO insured-class field exists on the module at all.
- CLOSING-DATE HYGIENE: of 31 open deals, only 4 carry a future
  Closing_Date; 12 have none; 15 carry stale past dates (2021-2024). The
  forecast buckets past-dated and undated deals separately and never
  smears them into future months; the page renders the hygiene callout.
- QBO PATH: none exists server-side in this repo (no QBO env vars, no
  client code; the bookkeeping proxy routes are Zoho Creator). The n8n
  QBO credential is SANDBOX-realm only and production API access waits on
  the Intuit app assessment, so the P&L tile renders the graceful state.
  Exact requirements listed in lib/pnl.ts PNL_REQUIREMENTS and on the
  page: an n8n read-only webhook serving P&L-by-class JSON (contract
  documented in lib/pnl.ts) + N8N_QBO_PNL_WEBHOOK_URL, or direct QBO
  OAuth vars in a future session. The tile lights with zero portal
  changes once the webhook env var lands (attempt-and-fallback).

#### What shipped
- /portal/admin/revenue (revenue.view): goal pacing deep view (funded
  YTD, weighted pipeline, pace delta, gap in files at the trailing
  average, labeled estimated), commission forecast by close month
  (trailing 3 funded months beside it for scale), funded revenue trend
  with actual/model split visible, mix grids at real coverage, the
  conversion funnel (stage census + funded t12 + leads by source) with
  its method caveat stated on the page, the P&L tile, and the comp model
  card with confirm-bps chips.
- config/comp.ts (COMP_MODEL_VERSION 1): rows match on
  Lender_Classification or Lender_Name substring, first match wins, then
  defaultBps; networkSplit 0.15 (confirm); agentSplit 1.0 is the future
  comp-engine hook (per-agent rows become a config evolution, not a
  redesign). Every value seeded unconfirmed until Michael confirms.
  Bump the version with every value change plus a changelog note.
- lib/revenue.ts: pure math (dealRevenue actuals-first, forecast with
  past-dated/undated buckets, fundedTrend, mixBreakdown with
  MIN_MIX_COVERAGE 0.7, pacingByMonth, filesToCloseGap, leadsBySource);
  unit-tested in tests/revenue.test.ts including "changing a bps value
  changes the forecast".
- /portal/admin/partners: health-ranked list (PartnersHealthTable
  replaced PartnersFilterTable, which was deleted) with tier chips from
  config/partner-tiers.ts (active <= 90 days since last referral,
  cooling <= 270, dormant beyond or never; thresholds carry
  confirmed:false until Michael confirms), referrals t12, conversion to
  funded (open files count against, stated), attributed volume and
  revenue (actual + est chip, never conflated), portal last sign-in via
  server-side Clerk (lib/partner-engagement.ts; caches the
  partner-agnostic user index; matches publicMetadata zoho_partner_id /
  fp_zoho_id then lowercase email; read failure renders "not read",
  never "no account"). INVESTORS CARRY NO TIER (funding partners, not
  referral partners; grading them on referral recency would mislabel
  every one dormant) and sort after tiered partners.
- Partner detail: the non-investor "coming soon" card replaced by
  PartnerReferralSection (referred files with stages and outcomes,
  12-month cadence bars, portal sign-in recency, contact card); the
  investor branch renders the section only when files actually carry the
  partner as Referral_Partner. No messaging or send capability anywhere;
  the page informs the touch.
- The attribution caveat renders EXACTLY ONCE, on the Partners list page.
- Ask Fox: seventh tool get_open_tasks (related-records API,
  Potentials/Contacts, Completed filtered client-side); prompt v2 rule
  CHECK OPEN TASKS FIRST (reference a covering task with its due date
  instead of duplicating). Live proof: the IFMS-F001515 deal carries 5 open
  tasks including a backfill-fields-from-commitment task due
  2026-07-11, exactly the card v1 would have duplicated. AgentChat gained
  the thinking indicator (submit to first token) and per-tool running
  shimmer, both behind motion-safe with a static reduced-motion form.
- Estimate labeling contract: every model-derived figure renders with a
  data-estimate chip whose tooltip names the assumptions (grep
  data-estimate across app/portal/admin/revenue and the two partner
  components to verify).

### Session 8: Multi-user hardening (2026-07-10)
- Shipped role baselines (config/authority.ts, recorded in the header
  comment there and asserted exactly in tests/authority.test.ts):
  ops = deals.view, compliance.view, knowledge.view, status.view,
  roadmap.view; underwriting-reviewer = ops + approvals.view + agent.use
  (a strict superset of ops, tested); agent = deals.view, knowledge.view,
  agent.use, roadmap.view. Decision keys, agent.execute,
  compliance.manage, status.acknowledge, and the provisioning keys
  (people.manage NEW, agents.provision NEW — the latter a CONTRACT with
  the gates API micro-session 4) stay admin-only. PERMISSION_LABELS maps
  every key to plain language (completeness unit-tested).
- ZERO role-literal gates remain anywhere (grep `roles.includes('admin')`
  across app/ returns nothing). Admin pages use requirePermission; admin
  API routes use apiPermission or roleCan with permission keys;
  bookkeeping routes gate on bookkeeping.view (service-account Bearer
  paths untouched); the admin allowance inside partner-portal API routes
  is now roleCan(roles, 'portals.view-as') — the capability it always
  was. The /portal dispatcher routes internal roles (ops/UR/agent) to
  /portal/admin; the Home page is permission-composed (approvals rail
  behind approvals.view, pacing behind revenue.view, rates tile behind
  rates.view, credentials rail behind compliance.view); the shell footer
  chip prints actual roles.
- Effective-access view on Settings (?role= URL state): every nav page
  and every non-nav action with allowed/denied per role, derived live
  from the matrix + nav by lib/effective-access.ts (no third source of
  truth; unit-tested for all four roles).
- View-as formalized: picker at /portal/admin/view-as (exact
  Partner_Type groups; prospects excluded because the impersonate route
  validates exact type), "View as a partner…" heads the portals nav
  block. Both impersonate routes gate on portals.view-as. Every session
  logs to FOXCA view_as_sessions through view_as_start/view_as_end (the
  cookie carries the log row id as logId; store outage degrades to a
  loud console error, never a block) and lists at
  /portal/admin/audit/view-as (ended / expired-after-12h / active).
  Structurally read-only, belt and suspenders: lib/view-as.ts
  viewAsWriteRejection is the single server rejection every partner
  write route runs (10 routes refactored; copy is a tested UX contract),
  and all write controls (4 add-referral forms, 4 message composers,
  investor express-interest, ReferralPartnerClientFile composer) are
  ABSENT in view-as, replaced by the quiet read-only notice.
- Provisioning wizard at /portal/admin/settings/people/new
  (people.manage): staff (ops/UR with the exact grants rendered before
  confirm), partner (kind chips + Zoho search-and-pick so the id is
  selected never typed, re-verified server-side against live Zoho type;
  metadata keys from lib/partner-types, identical to self-onboarding),
  agent (Clerk half + workbench half through
  lib/gates.ts provisionWorkbenchAgent → POST /api/gates/agents with the
  browser-minted token forwarded; setup_remaining renders verbatim as
  the honest hand-back; gates failure reported, never rolled back, never
  pretended). Invitation email optional (Resend,
  noreply@app.foxmortgage.ca, forgot-password first-sign-in copy).
  people_provisioning records who provisioned whom. Validation is pure
  (lib/provisioning.ts, tested): admin is NOT provisionable.
- People list at /portal/admin/settings/people: every Clerk user with
  roles, last sign-in (server-side, paginated getUserList), provisioned
  by (FOXCA; older accounts read "pre-wizard (manual)"), status
  (active/disabled), self shows "you" with no disable button.
- Offboarding: two-tap Disable (timestamp-enforced arm window) → POST
  offboard bans the Clerk user AND revokes live sessions in one action
  (lib/people.ts banAndRevokeUser; ban failure aborts everything — no
  checklist for a person who is still in; self-offboard refused, lockout
  protection). Checklist built by pure lib/offboarding.ts (tested):
  disable + grants-void pre-done; partner attribution with the honest
  referred-file count (or could-not-read); agent workbench book +
  FINMO_API_KEY_<AGENT> revoke (named from the gates setup_remaining
  contract); compliance credentials matched by holder. Persisted to
  people_offboarding; items toggle with updated_by stamped; record page
  at settings/people/offboard/[id]. Nothing deletes — audit history,
  provisioning records, and view-as logs remain.
- FOXCA migration 20260710210000 (applied live): view_as_sessions,
  people_provisioning, people_offboarding; RLS on, no policies, table
  grants revoked (verified live: 42501 on all three), nine narrow
  security-definer functions granted to anon; lib/people-store.ts is the
  only client (twin of lib/compliance.ts).
- Clerk backend surface (lib/people.ts, server-only, CLERK_SECRET_KEY):
  list / createUser (skipPasswordRequirement; invite email covers
  first sign-in) / banUser + revokeSession. Deleting users is
  deliberately NOT in the module.
- Verified on the DEV Clerk instance (sk_test in .env.local; production
  untouched): per-role surfaces exact (ops 8 nav items, UR +Approvals
  +Ask Fox with ZERO decide buttons on the desk, agent 7 items), page
  refusals bounce to /portal, API refusal 403 on a decision route, the
  full provision→verify→offboard→sign-in-refused (user_banned) cycle.
  TEST users created and removed same session (ids in the session
  report); FOXCA TEST rows remain per the append posture. Suite at 171
  tests.
- Note for the person-model: the dev Clerk instance enforces email_code
  as a second factor on password sign-ins; the production custom sign-in
  form only handles first factors. If production ever turns MFA on, the
  sign-in page needs a second-factor step.

### Session 9: The finale — PWA, notifications, search, demo mode (2026-07-10)
- PWA. app/layout.tsx gained the manifest link, appleWebApp hints, and a
  Viewport export (themeColor navy #032133); public/manifest.webmanifest
  (start_url /portal/admin, standalone). On-brand icon set generated
  deterministically (navy squircle + lime "F", maskable variants inside
  the safe zone) at public/icons/* + public/apple-touch-icon.png +
  app/icon.png (favicon). components/ServiceWorkerRegister.tsx registers
  /sw.js once from the root layout; components/InstallHint.tsx is the
  polite, dismissible (localStorage fox_install_dismissed_v1),
  never-nag hint on both the admin and partner shells (iOS Share-sheet
  variant; hidden when standalone). middleware.ts publicRoutes adds
  /offline (extensionless, so not auto-exempt).
  - SERVICE WORKER CACHING POSTURE — SECURITY CONTRACT (public/sw.js, do
    NOT let a future session "optimize" borrower data into a cache):
    static assets (/_next/static, /icons, /assets, and hashed .css/.js/
    .woff2/.png/.svg) are cache-first; the offline page + manifest + icons
    are precached (STATIC_ASSETS — NEVER a /portal or /api entry). EVERY
    request whose path starts with /api or /portal is NETWORK-ONLY and
    never read from or written to the cache (an isCacheable() guard is
    called before every cache.put, and returns false for /api and /portal).
    Navigations are network-first with the cached /offline page as the
    only offline fallback — a /portal navigation response is never cached.
    tests/pwa.test.ts asserts this statically over the SW source.
    DEV-ONLY NOTE: because the SW caches /_next/static cache-first and dev
    chunk URLs are not content-hashed, a local dev server can serve a stale
    component chunk after an edit; unregister the SW / clear caches to see
    fresh code. Production uses hashed URLs, so this cannot happen there.
- Notification center. FOXCA migration 20260710220000 (applied live):
  notifications (dedup_key unique, append), notification_reads (per-user),
  notification_prefs (per-category) — RLS on, no policies, table grants
  revoked (functions-only), six security-definer functions granted anon.
  lib/notifications-store.ts is the client twin of lib/people-store.ts;
  lib/notifications.ts is the PURE producer layer (five mappers, tested)
  over signals the portal already computes: sheet_review (getRateSheetQueue),
  credential_expiry (credentialTone 60/14), form_intake (formIntakeLight),
  sync_freshness (getN8nStatus errors), and gate_decision_external — audit
  rows whose action is a decision and actor !== 'portal' (a CLI/terminal
  decision), so the desk sees decisions made outside it. Route
  app/api/portal/admin/notifications gates deals.view, then filters
  categories by each one's own permission (approvals.view / compliance.view
  / status.view). NO new authority key. components/admin/NotificationBell.tsx
  (mounted once in the AdminShell top bar) polls 60s; NotificationSettings
  mounts on Settings (#notifications) for the per-category toggles. Live
  proof: 30 real notifications surfaced incl. "michael decided
  rates.sheet_approved" (a real off-portal decision).
- Global search / cmd-K. lib/search.ts (pure: nav filter, deal ranking,
  group-status), app/api/portal/admin/search (gates deals.view; deals =
  getDealsSummary + getAllDealsSlim joined, contacts = searchZohoContacts
  with longest-token retry, partners = listAllPartners behind
  partners.provision; each source time-boxed ~1200ms and reports
  'degraded' rather than hanging). components/admin/CommandPalette.tsx
  (mounted once) owns the ⌘K/Ctrl-K + '/' listener, groups results
  (nav local + deals/contacts/partners from the route + knowledge via the
  browser-token knowledge proxy), keyboard nav, recent items. Knowledge
  degrades honestly where the browser gates token can't mint (dev instance
  has no 'gates' JWT template; production does).
- Demo mode. Admin-only (authority key demo.mode) AND env-fenced
  (DEMO_MODE_ENABLED). lib/demo.ts: isDemoMode() (env flag + HMAC-signed
  fox_demo session cookie under SESSION_SECRET, mirrors lib/auth.ts),
  setDemoCookie/clearDemoCookie, DemoWriteBlocked. Fixtures replace data AT
  THE FETCHER BOUNDARY (lib/demo-fixtures.ts): ~27 workbench read fetchers
  in lib/underwriting.ts return fixtures BEFORE any uwFetch; the four
  borrower-adjacent-but-unlisted fetchers (getAuditEntries,
  getComplianceAttentionDeals, getNumberLinks, getDealIdByFileRef) are
  guarded too, and searchZohoContacts/searchZohoDealsByWord/
  getZohoDealsByContactId/getZohoDealById return empty in demo, so NO real
  name or file ref appears on ANY page (bell + cmd-K included — the
  notifications route returns freshly-produced fictional notifications in
  demo and never lists the persisted real ones). Writes throw
  DemoWriteBlocked (3 Zoho writes; 5 gate decisions + provisionWorkbenchAgent;
  Ask Fox chat short-circuits to a labeled canned reply). Decision controls
  are HIDDEN in demo (canDecide &&= !isDemoMode() on the approvals page and
  the deal room). LENDER reference data (rates_reference + knowledge via
  lib/gates.ts gateGet) intentionally stays real — it is not borrower data.
  DemoBanner (persistent lime/navy, in the AdminShell sticky top chrome),
  DemoToggle on Settings. tests/demo.test.ts asserts zero real reads (fetch
  spy) + writes throw. app/api/portal/admin/demo (POST enter/exit, gates
  demo.mode + demoModeAvailable). RUNTIME ENV: DEMO_MODE_ENABLED (Vercel;
  server-only, not NEXT_PUBLIC). Distinct from the public /demo/fp
  lead-gen sandbox (that is a separate route tree; admin demo mode reuses
  the real admin pages via the cookie).
- Finale sweep. Deleted app/portal/clients + app/portal/reports (legacy
  hardcoded mocks) and unwired them from PortalLayoutClient (zero
  references remain). DAILY DEAL BRIEFING DECISION — RETIRE: workflow
  dh1qIttAuctSQ7L0 has been INACTIVE since inception (zero recorded
  executions per the 2026-07-09 live check) and its whole payload (tasks
  due, pipeline by stage, renewals) is now served live by the admin Home
  rail; reactivating it would duplicate the rail into a 5:45am email with
  no added signal. Left inactive by decision; not deleted (the config
  registry row stays for the Status page). PortalLayoutClient.tsx made
  responsive (was desktop-only fixed w-64 sidebar + ml-64: now hidden
  lg:flex sidebar + lg:ml-64 main + a mobile drawer mirroring AdminShell;
  desktop behavior unchanged; the admin 6-pill portal switcher hides below
  sm — the drawer carries it). FP dashboard Recent Activity table wrapped
  in overflow-x-auto + min-w. globals.css body gained overflow-x: clip
  (not hidden — clip preserves sticky/fixed) as a backstop. Roadmap page
  graduated: Session 9 shipped, "the original map is complete", and a
  living forward BACKLOG list.
- Verified live (dev instance, TEST admin, removed after): PWA assets
  serve (manifest/sw/offline/icons 200); bell shows real notifications
  incl. a real CLI decision; cmd-K returns grouped deal/partner results
  with slow-source honesty; demo mode renders DEMO-F000x deals + Sample
  Bank with the banner, no decision buttons, no real data in bell/search;
  exit restores real data; 375px admin + partner shells have zero
  horizontal scroll and working drawers. Suite at 208 tests (pwa 8,
  notifications 9, search 11, demo 9 added). Build green.
- Guardrails held: readonly workbench (all new reads go through the
  existing wrapper; no new writes to the workbench), gates-only workbench
  mutation, FOXCA narrow functions only, Clerk backend server-side only,
  middleware publicRoutes unchanged except the additive /offline, env via
  dashboard/REST, no ANTHROPIC_API_KEY in build subprocesses, portals
  spot-checked and unaffected.

### End-of-session closing ritual (STANDING RULE, Session 5)
Every build session ends by updating all three, together, before the
completion report: (1) the Session Ledger entry in this file, (2) a
PLATFORM_NOTES entry in config/changelog.ts, (3) the roadmap page
(app/portal/admin/roadmap/page.tsx) statuses and items. Roadmap staleness
is a bug; this ritual is why it cannot happen again. Future briefs inherit
this step even when they do not restate it.

### Input-commit discipline (STANDING RULE, 2026-07-18)
No keystroke ever triggers a network call or heavy recompute. Inputs commit on
blur or Enter, or debounce at 600ms or more with in-flight cancellation
(AbortController) so a stale result never lands out of order. Currency fields
format on blur, not while typing. This covers any numeric or text input that
drives matching or fetching — scenario/filter inputs, search boxes. It does NOT
force blur-commit on a purely local, pure, O(1) live recompute (a slider whose
result is computed in-render with no network, e.g. the qualification explorer):
live feedback there is the intended UX and costs nothing. The repo helpers are
`lib/input-commit.ts commitNumericInput` (the blur/Enter parser) and
`components/admin/CommittedNumberField.tsx` (a numeric input that commits on
blur/Enter, resyncing to an external value change). Future briefs inherit this.

### UI test automation discipline (STANDING RULE, Session 5, after the Session 4 incident)
Automated UI tests and browser drivers target elements by explicit test
ids scoped to rows with TEST-prefixed identifiers, and never fire pointer
or keyboard events on pages listing live records. Decision-control testing
happens on preview deploys against seeded TEST rows only. A flow that
cannot be exercised that way is verified by unit test plus a manual step
listed for Michael, never by automation against production data.
Components ship data-testid attributes carrying the record id (e.g.
rate-product-<id>, pin-<id>) so tests can scope to TEST rows; the Rates v2
view keeps every level and pin state URL-addressable so screenshots and
checks navigate instead of clicking.

### Audit trails are append-only, including during proofs (STANDING RULE, 2026-07-20, architect follow-up)
TEST audit rows are never deleted. Disposable-entity audit rows stay in place,
identifiable by their DISPOSABLE-TEST reference. An audit trail is append-only,
including during proofs. (Origin: the 2026-07-20 task two-way session deleted its
own proof audit rows from FOXCA `task_action_events` via the Supabase MCP
service role during cleanup — the live write path HAD been exercised end to end,
but the deletion erased the standing evidence and made independent verification
impossible. Disposable Zoho tasks are still deleted; the AUDIT ROWS about them
stay. This binds every append-only audit table — FOXCA renewal_events,
task_action_events, compliance_events, and any future one — and every credential
that could reach them, the Supabase MCP service role included.)

**RENDER PROOFS: the blessed pattern (STANDING RULE, B5 2026-07-17 — this
REPLACES the temp-public-route pattern used through B1–B4).** Render proofs
run against the local dev server on the DEV Clerk instance, signed in as an
ephemeral TEST admin created at the start of the session and DELETED before
it ends, navigating READ-ONLY (no decision control is ever touched). The
temp-route pattern — adding a throwaway public /preview-* route plus a
middleware entry, screenshotting, then reverting — is RETIRED: it edited
middleware to prove a page, which is exactly the file least safe to churn,
and it left a public unauthenticated route in the tree for the length of a
session. The dev-instance pattern proves the REAL page through the REAL
shell and gates, which the temp route never did.
Mechanics that make it cheap (learned B4): the dev Clerk instance enforces
email_code as a second factor and the custom sign-in form only handles first
factors, so drive sign-in through Clerk JS in the browser console with the
fixed dev code 424242; the Clerk backend API refuses python-urllib's default
agent with Cloudflare 1010, so send a browser User-Agent. Screenshots are
referenced in the report, never committed.
For a CLIENT-FACING surface (B5 onward) the same rule holds with one
addition: proofs use the SYNTHETIC fixture only. A real client's page is
never opened to take a screenshot.

**BOTH WIDTHS (STANDING RULE, B8a 2026-07-18).** Every client-facing surface
is designed AND proven at BOTH 375px and 1280px in the same session.
Mobile-first construction stays, but desktop is a CONSIDERED layout, never a
stretched phone column: a sensible max width, a real grid, type stepped up. A
render proof of a client surface is incomplete until it shows both widths with
zero horizontal overflow at each.

### Approvals desk, Deals, Audit viewer (Session 3)
- /portal/admin/approvals: four queues (statements, rate sheets, flags, shadow) in
  `components/admin/ApprovalsDesk.tsx` (client) over `lib/approvals-data.ts` (shared
  loader; also served fresh by GET /api/portal/admin/approvals/queues for the
  post-decision reconcile refetch). Final actions (approve, reject, flag dispositions,
  shadow agree) take a two-tap confirm on the same control with a 4 second disarm;
  hold is single-tap; shadow disagree requires a 5+ character note. Success updates
  optimistically then refetches; 409 shows "Already decided" and refetches. Statement
  cards render extracted fields with source_snippet/source_page citations exactly as
  stored, pre-stored held_reason chips, and the two-sided discrepancy framing from
  open statement_value_discrepancy flags (detail keys: statement_field,
  statement_value, statement_document_id, statement_source, application_field,
  application_value, application_source, wide_gap, policy). Empty queues show the
  last-decided timestamp derived from audit_log decision actions.
- Shadow queue definition (aligned across Home and Approvals): active deals with
  fewer than 4 latest-scored dimensions. System values for unscored dimensions are
  computed by the Gates API at scoring time (fetchSnapshot + dealValues in
  fox-underwriting); nothing is pre-stored, so cards render past scores'
  system_value as recorded and say so. The portal never re-implements that pathway.
- /portal/admin/deals: every workbench deal with Zoho stage joined via
  zoho_potential_id (Session 1 approach), open condition/flag counts, shadow n/4
  chip; closing-date sort; stage and open-flags filters via searchParams.
- /portal/admin/deals/[id] (deal room): snapshot from the deals row, statement
  evidence with provenance beside every value, conditions with overdue highlight,
  flags with disposition history, shadow history with recorded system values,
  deal-scoped audit entries. Borrowers, ratios/calcs, and submission notes render
  graceful not-granted sections (see granted-table list above). Rate sheet reviews
  are practice-level, not per deal; the room links to Approvals for them.
- /portal/admin/audit (audit.view): reverse-chron entries showing actor_email for
  portal-originated actions, filters (Toronto-day date bounds via
  torontoDayStartISO/torontoDayEndISO in lib/dates.ts, actor enum, action ilike,
  deal file ref resolved to deal_id), server-side pagination (50/page,
  count=exact), CSV export at GET /api/portal/admin/audit/export capped at
  AUDIT_EXPORT_CAP (config/targets.ts, 5000, stated in the UI). Fixed header states
  the log is append-only and test entries are marked and superseded, never deleted.

### Shell and gating
- `/portal/admin/*` renders in its own responsive shell (`app/portal/admin/layout.tsx`
  plus `components/admin/AdminShell.tsx`): server-gated (unauthenticated to sign-in,
  unauthorized to /portal), mobile drawer + desktop sidebar, nav filtered through
  can(). PortalLayoutClient steps aside for /portal/admin paths (one early return);
  /portal/bookkeeping keeps the legacy shell and those pages are untouched.

### Pipeline + pacing decisions (verified against live Zoho 2026-07-09)
- One Zoho module: `Deals` is canonical (COQL-valid); `Potentials` is a REST-only alias
  this codebase uses widely. The two older sections of this file that disagreed were
  describing the same module. Details: docs/portal-audit-2026-07.md section 4.
- Funded volume field: `Amount` (fallback Total_Loan_Amount). 2026 fundings carry
  Stage 'Funded'; pre-2026 carry 'Mortgage Funded'; both count as funded.
- Terminal stages = the Daily Deal Briefing set (Archive, Closed, Lost, Mortgage
  Funded, Mortgage Lost) PLUS 'Funded' and 'Cancelled', so funded volume never
  double-counts as open pipeline. Additional Properties is a summary bucket, never
  pipeline or weighting. Config: `config/pipeline.ts`.
- FULL STAGE VOCABULARY (live COQL, 2026-07-12, 205 deals): Mortgage Funded 48
  (funded, 2021-04 through 2025-10), Funded 6 (funded, 2026-01 through 2026-06),
  Mortgage Lost 19, Archive 33, Closed 9, Lost 4, Cancelled 6 (all terminal),
  Additional Properties 49 (summary, property attachments not deals), and the 31
  OPEN: Options 14, Pending 8, Conditionally Approved 3, Application Started 3,
  Underwriting In Progress 1, Collecting Documentation 1, Approved 1. Funded by
  year (Closing_Date basis): 2021 12/$6,231,323.30, 2022 12/$6,698,671.57, 2023
  6/$3,969,050, 2024 5/$5,790,000, 2025 13/$5,944,767, 2026 6/$3,280,925.94.
- PIPELINE STALENESS (2026-07-12, config/pipeline.ts STALE_CLOSING_DAYS 90 /
  STALE_CREATED_DAYS 180 + pure lib/pipeline-hygiene.ts, unit-tested): of the 31
  open deals only 8 are real active pipeline ($4,714,239.74 ≈ $4.71M); the other
  23 are un-groomed debt (15 genuine 2021-2022 files with past close dates, 7
  "- Additional Property" records mis-staged in Options, and BRXM-F025547 with a
  future close date but created 2024). An open deal is STALE when its Closing_Date
  is >90 days past OR it was Created >180 days ago. The created-age arm stands in
  for "no activity 180d" because Last_Activity_Time is Finmo-mass-synced to one
  value and Stage_Modified_Time is null (no usable per-deal activity signal).
  computePipeline(deals, todayYMD) partitions active vs stale and returns the
  stale bucket; SlimDeal gained createdTime (SLIM_DEAL_FIELDS gained Created_Time).
  Stale is surfaced-for-grooming on Revenue (linked to Zoho), never deleted, never
  hidden. BEFORE/AFTER: weighted pipeline $4,138,534.80 → $2,194,123.10; pace vs
  $12M +$1,074,255 (read ahead) → -$870,156 (actually behind). The stale/ghost
  records were flipping the pace from behind to ahead.
- Stage weights seeded per the Session 1 brief plus additive mappings for live stages
  the seed vocabulary predates (Pending .05, Qualification .05, Options .30,
  Approved .75).
- Goal pacing math is pure and unit-tested (`lib/pacing.ts`, tests/pacing.test.ts,
  `npm test` runs vitest). Annual target: `config/targets.ts` (12,000,000).
- Zoho reads use the records API only; the production refresh token has NO
  ZohoCRM.coql.READ scope (COQL 401s in prod). Zoho Tasks search rejects not_equal on
  Status; `lib/zoho-admin.ts getTasksDue` filters by Due_Date and drops Completed
  client-side.

### Status page sources (covers every production dependency as of Session 3)
- Workbench reachability + intake freshness (lib/underwriting.ts, portal_readonly).
- Gates API: GET /api/gates/health via lib/gates.ts getGatesHealth (traffic light with
  auth/db booleans, commit, env).
- Zoho ping: token refresh + 1-record Potentials read (lib/zoho-admin.ts).
- n8n: `N8N_API_URL` + `N8N_API_KEY` (added to Vercel 2026-07-09 via REST API,
  encrypted, production+preview; same API key the Paperclip agents use). Known
  workflow registry: `config/n8n-workflows.ts`.
- Bookkeeping: live WRITE_TO_QBO read from workflow Uu6fsZ2A2gTn0gBs config node, plus
  the dry-run log via `lib/bookkeeping-dry-run-store.ts` (extracted from the route;
  route behavior unchanged).
- Form intake capture: the foxmortgage-ca Supabase project via the STABLE
  security-definer function form_submission_stats() (migration 20260709230000;
  the anon key is insert-only on form_submissions, so a table SELECT would silently
  return nothing). Panel shows 7-day submission count, zoho_failed count, latest
  submission time.
- Deploy: VERCEL_GIT_* env plus BUILD_TIME (baked in next.config.js).

---

## Form Intake Pipeline (hotfix shipped 2026-07-09)

Three endpoints run a persist-first pipeline (`lib/form-intake.ts`):
`POST /api/contact` (public), `POST /api/investor-inquiry` (public),
`POST /api/portal/add-referral` (handler-enforced partner auth; middleware
posture unchanged).

Order is fixed and load-bearing:
1. Raw submission lands in `form_submissions` (foxmortgage-ca Supabase
   project `skfeivzhqvrefnkqjwtj`, created for this hotfix, us-east-1,
   $10/month). Migration: supabase/migrations/20260709220000_form_submissions.sql.
2. Zoho Lead created via the existing `createZohoLead` (Leads module;
   Lead_Source = Website / Private Lending Page / Partner Referral). Outcome
   stamped on the row through the security-definer function
   `mark_form_submission` (the app role is insert-only on the table; a plain
   RLS + column-grant PATCH silently matched zero rows, hence the function).
3. Resend email to mfox@foxmortgage.ca from noreply@app.foxmortgage.ca, with
   the Resend message id stamped on the row. Email failures are logged, never
   fatal.
4. Success returns ONLY if the row or the Zoho record exists. Total failure
   returns 503 and the front ends show the error (all three forms now check
   res.ok; the contact form used to show success even on failure).

Env vars (server-only): `FOXCA_SUPABASE_URL`, `FOXCA_SUPABASE_KEY` (anon key;
RLS limits it to insert + the marker function, no reads). Set in all three
Vercel targets and .env.local on 2026-07-09.

Abuse protection on the public pair: server-side validation plus a hidden
"company" honeypot field on both forms (filled honeypot = fake success, no
store). No CAPTCHA, no rate limiting, by design.

Referral attribution: the Leads module has NO Referral_Partner or FP_* fields
(verified live), so attribution rides the lead Description plus
partner_zoho_id / partner_role / clerk_user_id columns on form_submissions.
Michael links Referral_Partner on the Potentials record at conversion, same
as the FP webhook flow. Referral intake may later migrate to the n8n webhook
path once the partner webhook workflows and their *_WEBHOOK_URL env vars
exist; the direct path works without them.

---

## Current Status (April 18, 2026)

### Financial Planner Portal
- **Phase 1** ✅ live (commit `8ce7976`) — all 6 routes with static/mock data; Clerk role: `financial-planner`
- **Phase 2** ✅ complete (FOX-48) — live Zoho data, n8n webhooks active, Vercel env vars set
  - `FP_REFERRAL_WEBHOOK_URL` → `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-referral`
    n8n workflow ID: `j17v139rGek6tjAC`, webhookId: `df8d9aaa-fc15-4ddf-b951-4af788a17feb`
  - `FP_MESSAGE_WEBHOOK_URL` → `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-message`
    n8n workflow ID: `1jl45sF4HfvxO5L8`, webhookId: `b8c42e1f-9d31-47ae-a762-6f5e9c830d44`
  - Both webhooks verified 200 OK in production (executions 4574, 4575)
  - NOTE: If webhooks stop working after an API update, the fix is: deactivate workflow,
    PUT the full workflow JSON with `webhookId` set on the webhook node, then reactivate.
- **Phase 3** ❌ not started — DialPad integration (pending FOX-8 board approval)

### Investor Portal
- Dashboard crashes on load — fix: use `currentUser()` not `auth()` in API routes

### Bookkeeping Agent — Phase 1 Infrastructure (FOX-111 series)

#### Architecture Overview
Three n8n workflows + Zoho Creator forms + Next.js proxy routes:
1. **Nightly Categorization** — there are TWO workflows in this lineage. They coexist on purpose: the dry-run cut validates the auth/pipeline plumbing in sandbox; the full pipeline is the eventual production target.

   **1a. FOX-112 dry-run validation cut — `Uu6fsZ2A2gTn0gBs`** ("Bookkeeping — Nightly Transaction Categorization")
   - Cron: 2:00 AM daily (`0 2 * * *`), active=false (manually triggerable via MCP)
   - **16 nodes (as of 2026-05-22, D2 AI Fallback live):** Schedule trigger → Workflow Config (Set) → Load Categorization Rules → Fetch Uncategorized QBO Transactions → Rules Engine → Rule Matched? → [true] Check Write Mode → Write Stub / Log Dry Run; [false] Build AI Prompt → Call OpenRouter → Parse AI Response → AI Auto Route? / AI Review Route? → Submit to Review Queue / Skip — Low Confidence. Active version: `ee34c1f9`.
   - QBO realm: **sandbox `9341456901231490`** (correct).
   - Logs to `/api/bookkeeping/dry-run-log` when WRITE_TO_QBO=false (currently false).
   - **As of 2026-05-15: first clean dry-run end-to-end ✅.** Workflow execution `8247` (2026-05-15) ran all 7 active nodes green: Trigger → Workflow Config (`WRITE_TO_QBO=false`, `QBO_REALM_ID=9341456901231490`) → Load Categorization Rules (HTTP 200, empty `{"records":[]}`) → Fetch Uncategorized QBO Transactions (HTTP 200, 6 Purchases) → Rules Engine — Match Transactions (1 item passed the new uncategorized filter) → Check Write Mode (routed to false branch since `WRITE_TO_QBO=false`; the Write-Stub branch is intentionally idle here) → Log Dry Run to API (HTTP 200, body `{"ok":true}`). One Purchase (id `182`, DocNumber `FOX-112-DRY-RUN-SEED`, $99.99) was seeded into the sandbox via a one-off API call during validation; safe to delete once Mike confirms.
   - **FOX-114 three-night gate MET (2026-05-22).** 7 consecutive clean nightly runs confirmed (2026-05-16 through 2026-05-22). Pending Mike sign-off + board approval before `WRITE_TO_QBO` can be flipped to `true`.
   - **Master_Bookkeeping_Rules form** in Zoho Creator: ✅ exists (created by Mike 2026-05-15) with the 6 required field link-names (`Vendor_Regex`, `Account_Name`, `Memo_Tag`, `Confidence`, `Active`, `Hit_Count`) and the auto-generated `All_Master_Bookkeeping_Rules` report. Form is empty (zero rules seeded). Rules engine emits `match_method: 'no_match'` for every transaction until rules are added — that's expected dry-run behavior.
   - **QBO sandbox OAuth2 credential**: `1RTFGz2TrFtUtu97` "QuickBooks Online account" (sandbox environment, realm `9341456901231490`). Bound to the "Fetch Uncategorized QBO Transactions" node via `predefinedCredentialType` + `nodeCredentialType: "quickBooksOAuth2Api"`. Confirmed working with Intuit's sandbox API.
   - **Uncategorized-line filter in Rules Engine:** the JS code now scans every Purchase's `Line[]` for at least one line where `DetailType === 'AccountBasedExpenseLineDetail'` AND `AccountBasedExpenseLineDetail.AccountRef.name === 'Uncategorized Expense'`; Purchases with no such line are skipped (`continue`). Needed because QBO QueryAPI rejects nested-property filters on the `Purchase` entity (see Known Footguns below). Date filter at query level (`TxnDate >= '2026-04-01'`) bounds the result set.
   - **2026-05-15 — Rules seeded from 5-year historical analysis.** `Master_Bookkeeping_Rules` now contains **51 active vendor-regex rules** seeded via direct Zoho Creator API. Source: 5-year QBO Transaction Detail by Account export (production realm 9341456900727321, 2021-01-11 → 2025-12-31, 8,218 rows total, 2,034 expense rows, 1,336 with vendor names, 185 unique normalized vendors). Analysis pipeline + draft files live in `~/Desktop/foxmortgage-ca/.qbo-history/` (gitignored — raw vendor data never commits). Coverage baseline: **the 51 rules cover ~58.1% of historical expense dollars over the 5-year period.** Memo_Tag distribution: 19 FOXM, 1 PHUB, 31 OVHD; zero FSOC/TLB (the early history pre-dates Fox Social and Left Bench operating cost streams). Workflow execution `8248` (2026-05-15, post-seed) verified all 8 nodes green with the seeded rules loaded by Load Categorization Rules. Cross-reference to QBO live Chart of Accounts at seed time: all 19 unique `Account_Name` values matched exactly (note: both `Repair & Maintenance` (sub of Automobile) and `Repair and maintenance` (top-level) exist as separate accounts and are referenced as separate rules — not a typo).
   - **2026-05-15 — Description_Pattern schema extension shipped (FOX-112 complete).** `Master_Bookkeeping_Rules` form has a new optional `Description_Pattern` field (Multi Line text) added manually in Zoho Creator UI by Mike (Zoho Creator API v2 doesn't support form-schema mutations). `lib/zoho-creator.ts` (`getBookkeepingRules`) now returns a typed `BookkeepingRule[]` with `Description_Pattern` normalized to `""` for older records (commit `505da8b`). Rules Engine in workflow `Uu6fsZ2A2gTn0gBs` was extended to match in two phases: **Phase 1 (vendor-regex match)** runs only when both `Vendor_Regex` is set AND vendor name is non-empty. **Phase 2 (description-pattern match)** runs only when Phase 1 returned no match AND the transaction has any text in PrivateNote / Memo / per-line Description. **Precedence: vendor wins** — a vendor-regex match short-circuits description checks even if a description rule would also match (this is intentional; vendor regex is more specific). Empty regex strings are treated as "field not set" (skip). Output now includes `description_text` (concatenated PrivateNote + Memo + per-line Description for debugging) and `match_method: "vendor" | "description" | "no_match"`. Workflow executions `8249` (backward-compat, all 51 vendor rules behave identically) and `8253` (description-match test with one POSTed test rule + one seeded Purchase with empty vendor and INTERAC E-TRANSFER FEE memo) both ran green end-to-end. Test description rule deactivated post-validation (ID `4890667000000930087`, Active=false).
   - **2026-05-15 — 15 description-pattern rules seeded (FOX-112 fully complete).** Followed today's vendor-rule pattern: pattern-mined the 698 vendor-less expense rows from the same 5-year QBO export (`~/Desktop/foxmortgage-ca/.qbo-history/`), produced 15 candidate `^prefix\s+token` regexes via greedy shortest-discriminating-prefix algorithm, Mike reviewed and approved all 15 (some with refined Memo_Tag and narrowed patterns vs the auto-generated draft). Tag distribution: 12 OVHD, 3 FOXM, 0 PHUB/FSOC/TLB. Account distribution: Bank charges, Dues and Subscriptions, Interest expense, Meals and entertainment, Software Subscriptions, Telephone — all 6 cross-referenced against live QBO Chart of Accounts (matched exactly). Workflow execution `8254` (post-seed) confirmed Load Categorization Rules now returns 66 active records (51 vendor + 15 description); both seed Purchases (id=182, id=183) correctly returned `match_method: "no_match"` because their PrivateNote text doesn't match any of the 15 seeded description patterns (correct semantic behavior — `^Interest` doesn't match "INTERAC E-TRANSFER FEE", `^INTERAC` is not in the seeded set). **Final combined coverage: 73.3% of total 5-year expense dollars** = $190,059.99 of $259,338.73. Breakdown: vendor rules cover $150,577.39 (58.1%), description rules cover $39,482.60 (15.2% absolute, 64.6% of vendor-less subset). Remaining ~26.7% is genuine long-tail (singleton vendors + singleton descriptions + 1 empty-description row). FOX-112 is now fully complete: schema extension shipped, both rule classes seeded, end-to-end auth + matching pipeline verified.
   - **FOX-114 three-night clean-run counter:** Mike enabled the workflow's schedule trigger at close-out 2026-05-15. **First night counts at 02:00 AM Toronto time 2026-05-16** (tonight). Need 3 consecutive clean nights before WRITE_TO_QBO can flip to true (with board approval).
   - **Intentional exclusions from the rule seed:**
     - **"Fox" vendor** — not seeded. Mixed-use (some Fox-related charges are intercompany Printhub.CA, some are personal). The review queue handles these case-by-case; a single regex rule would mis-categorize the non-dominant share.
     - **Ford-prefix rules** — seeded with `Account_Name=Vehicle Lease` and `Confidence=0.8`. **Pre-payout only.** When the Ford lease pays out and Mike transitions vehicle accounting (purchase vs new lease vs sold), the Ford rule will start mis-routing. Lease transition handling is a future task — update `Account_Name` or deactivate the rule then.
     - **698 vendor-less expense rows** (bank fees, interest charges, e-Transfer service charges) cannot be matched by vendor-regex rules at all. These need either (a) description-based rule pattern support (schema change), (b) QBO bank rules at source, or (c) a separate description-classifier pass when Vendor is empty. Out of scope for FOX-112; flagged for future iteration.

   **1b. Full-pipeline future production — `Rupc79GeJ8s6bbJa`** ("QBO Nightly Transaction Categorization")
   - Built April 18, 2026, **INACTIVE**, never executed.
   - 13 nodes: cron 7:00 UTC → Fetch QBO Classes → Query QBO Purchases → Rules Engine → Needs AI? → AI Categorize Transaction (OpenRouter Claude Haiku) → Parse AI Response → High Confidence? → Update QBO Transaction OR Submit to Review Queue. Plus a separate Monday 14:00 UTC cron → Send Weekly Bookkeeping Summary (Resend email).
   - Native QBO ClassRef (QBO Plus) instead of memo-tag prefixes.
   - Pulls uncategorized QBO transactions → fetches Classes → rules engine → AI fallback → routes by confidence.
   - QBO Classes fetched dynamically each run from `SELECT * FROM Class WHERE Active=true`.
   - High-confidence → `ClassRef` + `AccountRef` written to QBO line items (PrivateNote untouched).
   - Low-confidence → submitted to `/api/bookkeeping/review-queue` on foxmortgage.ca.
   - **⚠️ PRE-ACTIVATION: QBO Realm Must Be Switched to Sandbox First (audited 2026-05-04, still applies)**
     All 3 QBO nodes in `Rupc79GeJ8s6bbJa` currently have **production realm `9341456900727321`** hardcoded.
     Before attaching credentials, Michael must instruct Dev agent to update those URLs to sandbox realm `9341456901231490`.
     Do NOT activate against production QBO until Intuit App Assessment is approved.
   - Requires 3 consecutive clean dry-run nights (via 1a, not 1b) before flipping `WRITE_TO_QBO=true` here.
   - Board approval required before WRITE_TO_QBO is ever set to true.
   - **Activation checklist for `Rupc79GeJ8s6bbJa`:**
     0. (Michael instructs Dev) Update QBO realm in Fetch QBO Classes, Query QBO Purchases, Update QBO Transaction → `9341456901231490`
     1. Create `Master_Bookkeeping_Rules` + `Deferred_Revenue_Schedule` forms in Zoho Creator UI **— still outstanding; this is what blocks `Uu6fsZ2A2gTn0gBs` from returning 200 today.**
     2. Set `BOOKKEEPING_WEBHOOK_SECRET` in Vercel env vars ✅ **done 2026-05-15** (encrypted type, Production scope)
     3. In n8n `Rupc79GeJ8s6bbJa`: attach credentials to nodes:
        - "Fetch QBO Classes", "Query QBO Purchases", "Update QBO Transaction" → QuickBooks OAuth2 credential
        - "AI Categorize Transaction" → OpenRouter Header Auth credential
        - "Submit to Review Queue" → Header Auth: use the same **Fox Bookkeeping API** credential created for `Uu6fsZ2A2gTn0gBs` (id `6rVxjMhbq2zLOqqj`)
        - "Send Weekly Bookkeeping Summary" → `Resend API Paperclip` Header Auth credential
     4. Activate workflow in n8n UI

   **Bookkeeping service-account auth — FOX-112 implementation notes (2026-05-15):**
   - `BOOKKEEPING_WEBHOOK_SECRET` is set in Vercel Production with `type: "encrypted"`. **Do not use `vercel env add` from a pipe to set this** — the CLI stores piped values as `type: "sensitive"` which is write-only and silently presents as empty to `vercel env pull`. Use the Vercel REST API directly: `POST /v10/projects/{id}/env` with `{"type":"encrypted","target":["production"],"value":"<plaintext>"}`.
   - n8n credential **Fox Bookkeeping API** (id `6rVxjMhbq2zLOqqj`, project `JTCIC344s4l5JCyv`) is a Header Auth credential. **Name** field = `Authorization`, **Value** field = literal `Bearer <secret>` (the literal string `Bearer ` + the plaintext secret pasted directly). n8n Header Auth Value does **NOT** expand env expressions like `{{$env.FOO}}` — that pattern silently sends `{{$env.FOO}}` as the literal header value.
   - The `httpHeaderAuth` credential schema in the n8n public API requires an `allowedDomains` field. When creating via API, set it to `"https://www.foxmortgage.ca, https://foxmortgage.ca"`.
   - `middleware.ts` exempts `/api/bookkeeping/rules` and `/api/bookkeeping/dry-run-log` from Clerk's `authMiddleware` (commit `effbdb3`). Before this fix, Clerk intercepted unauthenticated service-account requests and returned `null` body 401 before the route handler's `isServiceAccount()` Bearer check could run. Any future bookkeeping route that wants service-account access must be added to `publicRoutes` alongside its own Bearer enforcement.
2. **Monthly Deferred Recognition** (FOX-113, in_progress) — 1st of each month, 3:00 AM America/Toronto
   - n8n workflow ID: `1iR3tvhFATxwFnj7` ("Bookkeeping — Monthly Deferred Revenue Recognition") — built 2026-05-17, INACTIVE
   - Cron: `0 3 1 * *`, active=false (manually enable once credential is attached)
   - 8 nodes: Schedule Trigger → Workflow Config (WRITE_TO_QBO=false, sandbox realm 9341456901231490) → Fetch Active Deferred Schedules → Recognition Engine (straight-line / per-session / percentage-of-completion) → Check Write Mode → Write QBO Stub (disabled) / Log Dry Run to API
   - **Credential setup required:** Attach existing "Fox Bookkeeping API" Header Auth credential (id `6rVxjMhbq2zLOqqj`) to "Fetch Active Deferred Schedules" and "Log Dry Run to API" nodes in n8n UI. This cannot be done via API (the credential was created by SDK placeholder `newCredential()`).
   - **D2 AI Fallback live (2026-05-22):** `Uu6fsZ2A2gTn0gBs` extended to 16 nodes with OpenRouter AI fallback for unmatched transactions. Active version `ee34c1f9`. Confidence routing: ≥0.85 → dry-log, 0.50–0.84 → review queue, <0.50 → skip. WRITE_TO_QBO still false.
   - Admin UI (D6) already live: `app/portal/bookkeeping/page.tsx`, `review-queue/page.tsx`, `projects/page.tsx`
3. **Weekly Summary Email** (FOX-114) — Mondays 7:00 AM America/Toronto
   - Aggregates QBO stats + review queue + deferred schedules → Resend email to mfox@foxmortgage.ca
   - n8n workflow ID: TBD (pending FOX-114 completion)

#### QBO Realms
- **Sandbox:** `9341456901231490` — all dev/test here
- **Production:** `9341456900727321` — DO NOT touch until Intuit App Assessment approved

#### Zoho Creator
- **App:** `creator.zoho.com/2802551ontarioinc/bookkeeping`
- **Forms:** Bookkeeping_Review, Production_Projects, Production_Milestones, Master_Bookkeeping_Rules, Deferred_Revenue_Schedule
- **Creator utility:** `lib/zoho-creator.ts` — uses isolated `ZOHO_CREATOR_*` env vars (NOT the CRM token)
- **Env vars (Vercel):** `ZOHO_CREATOR_CLIENT_ID`, `ZOHO_CREATOR_CLIENT_SECRET`, `ZOHO_CREATOR_REFRESH_TOKEN`
  - Scopes: `ZohoCreator.report.READ`, `ZohoCreator.form.CREATE`, `ZohoCreator.report.UPDATE`, `ZohoCreator.meta.READ`
  - These are Creator-specific — completely isolated from CRM `ZOHO_REFRESH_TOKEN`

#### Proxy Routes (`/api/bookkeeping/*`)
| Route | Method(s) | Data source | Status |
|---|---|---|---|
| `/review-queue` | GET | Zoho Creator — Bookkeeping_Review | ✅ live |
| `/projects` | GET, POST, PATCH | Zoho Creator — Production_Projects | ✅ live |
| `/milestones` | GET, POST | Zoho Creator — Production_Milestones | ✅ live |
| `/rules` | GET, POST, PATCH | Zoho Creator — Master_Bookkeeping_Rules | ✅ live |
| `/schedules` | GET, POST, PATCH | Zoho Creator — Deferred_Revenue_Schedule | ✅ live |
| `/deferred-schedules` | GET | Zoho Creator — Deferred_Revenue_Schedule | ✅ live |
| `/chart-of-accounts` | GET, POST | Static seeded list (QBO OAuth pending) | ✅ live |
| `/dry-run-log` | GET, POST | In-memory (n8n calls POST when WRITE_TO_QBO=false) | ✅ live |
| `/weekly-summary` | GET | Zoho Creator (live) + QBO (stub until FOX-112 QBO OAuth) | ✅ live |

#### Known Footguns (Bookkeeping pipeline / Vercel infra)

- **Vercel CLI `vercel env add` poisons env vars as `type=sensitive`.** When you `vercel env add <NAME> <env>` and pipe a value via stdin (or paste it interactively), the CLI silently creates the var with `type: "sensitive"`. Sensitive-type vars are write-only from the API: `vercel env pull` returns them as empty strings, and the Next.js runtime can sometimes read them as `undefined` even though the CLI says "Added". **Never use `vercel env add` from CLI for service-account secrets or any non-sensitive values.** Hit this bug twice on 2026-05-15: once with `BOOKKEEPING_WEBHOOK_SECRET` (FOX-112 first 401 cascade), once with `ZOHO_CREATOR_CLIENT_ID` / `ZOHO_CREATOR_CLIENT_SECRET` / `ZOHO_CREATOR_REFRESH_TOKEN` (FOX-112 503 cascade after the first fix). Use the Vercel dashboard UI or POST directly to the REST API:
  ```
  curl -X POST "https://api.vercel.com/v10/projects/{projectId}/env?teamId={teamId}" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"key":"NAME","value":"plaintext","type":"encrypted","target":["production"]}'
  ```
  Encrypted-type vars ARE readable via `vercel env pull` (returns plaintext) and visible to the runtime. Recovery procedure when you find a poisoned sensitive-type var: pull the value from another scope (often Development still has the working `type=encrypted` copy via `vercel env pull --environment development`), DELETE the poisoned Production entry by id, POST a new entry with `type:"encrypted"`. Same pattern used to recover both incidents.

- **QBO Query Language footgun: nested-property filters not supported on the `Purchase` entity.** `SELECT * FROM Purchase WHERE AccountRef.name = 'X'` is rejected by Intuit with `QueryValidationError: Property AccountRef.name not found for Entity Purchase` (code 4001). QBO's SQL-like dialect only allows filtering on top-level properties of an entity. On `Purchase`, the `AccountRef` field refers to the bank/cash account the Purchase was drawn from (top-level — and queryable as `AccountRef`), while the expense category lives at `Line[].AccountBasedExpenseLineDetail.AccountRef`, which is nested and NOT queryable. For Purchase queries, filter at the top level (`TxnDate`, `DocNumber`, `TotalAmt`, top-level `AccountRef = '<id>'`) and apply line-level filters in JavaScript after fetching. Same principle applies to other transaction entities that have `Line[]` collections (Bill, Invoice, JournalEntry, etc.).

- **Zoho Creator returns HTTP 404 + `{"code":3100,"message":"No records found"}` for empty reports, not `200` + `{"data":[]}`.** All read-side functions in `lib/zoho-creator.ts` must treat 404 as `[]`, not throw. Pattern is documented in `getReviewQueue` and now applied to all four other read functions as of commit `6b9c0ac`. If a future engineer adds a fifth read function, copy the 404→[] guard.

- **n8n public API can't read or update credential data.** `GET /api/v1/credentials/{id}` returns 403, `PATCH` doesn't exist. The only way to update a credential's stored secret is DELETE then POST a new one — which orphans existing workflow-node bindings until each workflow is re-PUT with the new credential id. When rotating an n8n credential, plan to PUT every workflow that referenced the old id.

- **n8n `httpHeaderAuth` credentials require `allowedDomains`.** When creating via the public API: `POST /api/v1/credentials` body must include `data.allowedDomains` (string, comma-separated list of allowed origins) or the call returns 400 `request.body.data requires property "allowedDomains"`. UI creation handles this silently.

#### Admin UI (`/portal/bookkeeping/*`)
- `/portal/bookkeeping` — landing page with queue count, quick actions
- `/portal/bookkeeping/review-queue` — inline approve/correct/reject
- `/portal/bookkeeping/projects` — production contracts + milestones
- Auth: Clerk admin role check (same as `/portal/admin/*`)

#### QBO Class Tracking (business line attribution — QBO Plus)
**SUPERSEDES memo-tag convention.** QBO upgraded to Plus April 18, 2026. Native classes replace memo-tag prefixes.
- `Fox Mortgage` — commissions, FSRA licences, legal
- `Printhub` — shipping, courier, production costs
- `Fox Social` — SaaS revenue, email services
- `Left Bench` — coaching, video conferencing
- `Overhead` — utilities, software, insurance, bank charges
- Classes are assigned via `ClassRef` on each `AccountBasedExpenseLineDetail` line item
- PrivateNote (Memo) field is LEFT UNCHANGED — original vendor description preserved
- `Suggested_Memo_Tag` field in Zoho Creator Bookkeeping_Review now stores QBO class name (string)
- Run QBO Class reports for business line P&L breakdowns natively in QuickBooks

#### n8n Field Names (Submit to Review Queue node)
`Transaction_ID`, `Vendor_Name`, `Amount`, `Transaction_Date`, `Suggested_Account`, `Suggested_Memo_Tag` (stores QBO class name), `Confidence_Score`, `Match_Method`, `AI_Notes`

#### QBO Projects (Research Finding — April 18, 2026)
- QBO Projects available on Plus tier via `ProjectRef` on transactions
- Does NOT support percentage-of-completion natively — tracks actual vs. estimated costs only
- Decision: Keep Zoho Creator `Production_Projects` + `Production_Milestones` for revenue recognition scheduling
- QBO Projects may be added as Phase 1b enhancement for Printhub job cost grouping in QBO reports
- When added: link Printhub transactions to a QBO Project via `ProjectRef` field alongside `ClassRef: Printhub`

#### Dry-Run Safety Procedure
1. `WRITE_TO_QBO=false` in n8n workflow variables → logs to `/api/bookkeeping/dry-run-log`
2. Run 3 consecutive clean nights
3. Post dry-run log summary to FOX-111 for Michael's review
4. Michael signs off → request board approval → flip `WRITE_TO_QBO=true`

#### QBO Account IDs (Sandbox)
| ID | Name | Purpose |
|---|---|---|
| 1150040000 | Fox Social - Subscription Revenue | FSOC recognized revenue |
| 1150040001 | Left Bench - Coaching Revenue | TLB per-session revenue |
| 1150040002 | Left Bench - Platform Revenue | TLB subscription revenue |
| 1150040003 | Deferred Revenue | Unearned revenue parking lot |
| 1150040004 | Printhub - Product Revenue | PHUB product sales |
| 1150040005 | Fox Mortgage - Commission Income | FOXM commissions |

### Pending Webhooks for Agents
- SMM leads webhook — agents need this to check new SMM enrollments
- Investor deals webhook — agents need this to check deal/position status

---

---

## foxmortgage.ca Portal

### Stack
- Next.js 14.2.5, TypeScript, Tailwind CSS
- @clerk/nextjs@5.7.5 (v7 incompatible with Next 14 — do NOT upgrade)
- Vercel auto-deploy on push to main
- GitHub: Foxmortgage2020/foxmortgage-ca
- Live: foxmortgage-ca.vercel.app

### Brand
- Navy: #032133, Lime: #95D600
- font-heading (Poppins Bold), font-body (Montserrat)
- Never: "broker/advisor" → always "Mortgage Agent, Level 2"
- Never: "Ownwell" → always "Strategic Mortgage Monitoring"
- BRX Mortgage in footer/compliance only

### Clerk Auth
- Instance: Fox Mortgage Portal (app_3BY7FSpczB6qgnzpRdoExVjxMiw)
- Middleware: authMiddleware from @clerk/nextjs/server (NOT clerkMiddleware — v5 API)
- Public routes: /, /about, /services, /smm, /contact, /apply, /private-lending, /portal/sign-in, /portal/sign-in/(.*)
- ClerkProvider: afterSignInUrl="/portal" afterSignUpUrl="/portal" (hardcoded literals — NOT env vars)
- currentUser() for server-side metadata access (NOT auth() — sessionClaims don't include publicMetadata in v5)

### Role System (Clerk publicMetadata)
- Admin: { "roles": ["admin"] } → /portal/admin
- Investor only: { "roles": ["investor"] } → /portal/investor/dashboard
- Realtor: { "roles": ["realtor"] } → /portal/dashboard
- Multi-role: { "roles": ["realtor", "investor"] } → /portal/dashboard + switcher
- Always use roles[] array, never role string alone

### Portal Routes
- /portal → redirect hub (reads Clerk metadata, routes to correct portal)
- /portal/admin → admin KPI dashboard
- /portal/dashboard → realtor + financial planner portal (9 pages)
- /portal/investor/dashboard → investor portal (9 pages)
- /portal/(auth)/sign-in/[[...sign-in]] → Clerk SignIn component, no sidebar

### Zoho CRM Integration
- Module: Deals (NOT Potentials — that module doesn't exist)
- Org ID: 906105026
- OAuth client: 1000.MK2DFJKKFZGXXFRULONF16GW8TI81I
- Env vars: ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN, ZOHO_ORG_ID
- CRM utility: lib/zoho.ts — getZohoCRMToken(), getInvestorPositions(), getInvestorOpportunities(), getInvestorDeal()
- Investor fields: Investor_Name (lookup→Partners module), Investor_Amount, Investor_Rate, Deal_Status_Investor
- Investor linked via zoho_partner_id in Clerk publicMetadata

### Test Users
- Admin: mfox@foxmortgage.ca (user_3BYB3x4imxXSRxxWmMpOnmiAcv6)
- Live investor partner: zoho_partner_id below (name + email live in Clerk/Zoho, not recorded here)
  zoho_partner_id: 7112178000001393118
  Production Clerk record exists (do not reference dev-pool userId).
  Clerk metadata shape: {roles: "investor", zoho_partner_id: "..."}
  Note: the Clerk display first name and the Zoho first name differ by one letter; Zoho is canonical — the banner shows the Zoho spelling.
  Two real Zoho positions: IFMS-F002684 (Hamilton, $500K, 12%) + BRXM-F024629 (Thorndale, $85K, 12%)

### Resend Configuration
- Verified domain: app.foxmortgage.ca (verified, North Virginia us-east-1)
- foxmortgage.ca is NOT verified — never use as from address
- All outgoing emails must use @app.foxmortgage.ca
- Sending address: michael@app.foxmortgage.ca
- n8n credential: "Resend API Paperclip" (Header Auth)
  - Name field: Authorization
  - Value field: Bearer re_[key]
- SMM welcome emails: use existing "Resend API" credential
- Paperclip briefing emails: use "Resend API Paperclip" credential

### Paperclip & Automation

**Paperclip** is the Fox Mortgage AI operations platform running locally at `http://localhost:3100`.

#### Infrastructure
- **launchd service:** `ca.foxmortgage.paperclip` — starts on macOS login, auto-restarts on crash
  - Manage: `launchctl start|stop|unload ca.foxmortgage.paperclip`
  - Logs: `~/.paperclip/logs/launchd.log` / `launchd-error.log`
- **Company ID:** `eebfd2ee-304a-49c0-8e20-909291d01583`
- **API:** `http://localhost:3100/api` (no auth in local_trusted mode)

#### Agents
| Agent | Role | Daily Schedule |
|---|---|---|
| CEO | Strategy & board briefings | 6:00 AM |
| CMO | Content & social monitoring | 7:00 AM |
| Client Success Manager | Enrollment check | 9:00 AM |
| Investor Relations Manager | Deal monitoring | 10:00 AM |

All 4 agents have direct n8n MCP access via `--mcp-config /Users/user/.paperclip/mcp/n8n.json`.

#### Email Routing (Paperclip → n8n → Resend)
All agent emails route through n8n webhook `fox-briefing-and-alerts` → Resend API.
- **From address:** `michael@app.foxmortgage.ca` (verified domain only)
- **Credential in n8n:** `Resend API Paperclip` (ID: `iJa8AHPr58GmNMda`)
- **Briefing workflow:** `dceYGLjOIRQAuS0p` (built, awaiting activation by Michael)

#### n8n Webhooks (foxmortgage.ca routes)
- `FP_REFERRAL_WEBHOOK_URL` ✅ — `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-referral` (active)
- `FP_MESSAGE_WEBHOOK_URL` ✅ — `https://foxmortgage.app.n8n.cloud/webhook/fp-portal-message` (active)
- SMM leads webhook — for agents to check new SMM enrollments (not yet built)
- Investor deals webhook — for agents to check deal/position status (not yet built)

### n8n Workflow Status (audited 2026-05-04)
- `dceYGLjOIRQAuS0p` Fox Mortgage — Daily Briefing & Alerts ✅ active
- `CZ1zh0gKvkQuTBMc` Fox Mortgage — SMM Lead Monitor ✅ active (since 2026-04-21)
- `Rupc79GeJ8s6bbJa` QBO Nightly Transaction Categorization (FOX-107 full pipeline, AI + review queue + weekly summary) ❌ inactive — production realm still hardcoded; needs Zoho forms + sandbox realm migration before activation
- `Uu6fsZ2A2gTn0gBs` Bookkeeping — Nightly Transaction Categorization ✅ active, 16 nodes, D2 AI Fallback live (published 2026-05-22, active version `ee34c1f9`). WRITE_TO_QBO=false. Three-night gate met; pending Mike sign-off + board approval to flip write mode.
- `dh1qIttAuctSQ7L0` Daily Deal Briefing ❌ inactive as of 2026-07-09 live check (this file previously said active; n8n reports active=false with no recorded executions)
- `IFDRp2BGHAbzKpHH` Finmo Sync v2 ✅ active — hardened 2026-07-13/14: errorWorkflow `BeRBcxNv1bQjx5v8` attached, early document-event 200, backfill creates missing deals, two pre-existing crash defects fixed (see the 2026-07-13/14 ledger entry)
- `9c6IUbuqA4GIIsQw` Finmo Sync v2 — Heartbeat (dead-man check) ✅ active — every 12h, alerts on sync deactivation or zero executions in 24h (WINDOW_HOURS constant; 72h proposed if noisy)
- `BeRBcxNv1bQjx5v8` Sync Error Handler — Email Michael ✅ published — Error Trigger → Resend; fires on PRODUCTION-mode errors of workflows that name it as errorWorkflow (only Finmo Sync v2 + the heartbeat do; 39 of 41 active workflows carry none, 2026-07-14 inventory)
- Fuller live picture as of 2026-07-09 (incl. the newer UW bridges): config/n8n-workflows.ts + /portal/admin/status

### Known Issues / In Progress
- (fixed 2026-07-09 audit) Investor dashboard crash: resolved. Zero auth() call sites remain; everything reads publicMetadata via currentUser()/getPortalContext.
- Bookkeeping nightly workflow Uu6fsZ2A2gTn0gBs last execution FAILED (error at 2026-07-09T06:00Z, 02:00 Toronto). Regression since the May clean-run streak; triage before any WRITE_TO_QBO decision.
- Realtor/lawyer/mortgage-agent webhook env vars (REALTOR_/LAWYER_/MORTGAGE_AGENT_ REFERRAL/MESSAGE_WEBHOOK_URL) are referenced in code but absent from Vercel; those referral and message POSTs likely fail in production.
- (fixed 2026-07-09 hotfix) /api/contact, /api/investor-inquiry, /api/portal/add-referral were console.log stubs losing every submission; all three now run the persist-first form intake pipeline (see the Form Intake Pipeline section).
- FP referral n8n workflow (j17v139rGek6tjAC) POSTs FP_Name / FP_Firm / FP_Email / Referral_Goal to the Leads module, but NONE of those fields exist on Leads (live fields check 2026-07-09; Zoho silently drops unknown fields). FP attribution has never been stored on webhook-created leads; only the notification emails carried it. Fix the workflow or add the fields in Zoho.
- Paperclip DB missing `pg_trgm` PostgreSQL extension — Paperclip API write operations (PATCH/POST) return 500. Read-only works. Needs Paperclip infrastructure fix.
- Zoho credential leak: .env.local.save was accidentally committed and removed 2026-03-27. ZOHO_REFRESH_TOKEN still NOT rotated (Vercel records date from the incident day; verified 2026-07-09). Rotate it.
- (fixed in fox-underwriting micro-session 2, 2026-07-10) the shadow ratios 500 on deals with no ratio_calcs now returns 422 with a clear validation message.
- statement_reviews/rate_sheet_reviews rows written through the Gates API keep decided_by='michael' (schema default); the acting human's identity lives on the audit_log entry (actor_clerk_id/actor_email per migration 0025). By design: the audit log is the identity record.
- Lender slug vocabulary gap (found in Session 4): rate_quotes carry lender_slug values like 'first-national', 'rfa', 'strive' while the knowledge base uses 'fn', 'td'. The knowledge lender page's approved-quote cross-link counts by exact slug, so FN shows 0 despite 75 first-national quotes. fox-underwriting follow-up: publish slug aliases in the knowledge index (or normalize lender_slug at extraction); the portal will not invent a mapping.
- Session 4 test incident, disclosed for Michael: condition 21 on funded BRXM-F053724 (tax bill confirmation) was marked satisfied at 2026-07-10T03:57:21Z by UI test automation through a stray tap on an armed confirm button in a background tab (audit a8f87b71, no note; annotation appended as portal.s4_test_note audit 5263fca4). The condition's system precheck had already passed on Jul 3, and the deal is funded, so satisfied is likely materially right; re-open it workbench-side if the tax bill still needs collecting. Root cause fixed: confirm windows are now enforced by timestamp at tap time in both the desk and the conditions panel, so a background tab's throttled timer can no longer leave a button armed.
- CLAUDE.md needs update after each session

### API Route Pattern
All investor API routes use currentUser() from @clerk/nextjs:
```
const user = await currentUser()
const metadata = user.publicMetadata as { zoho_partner_id?: string, roles?: string[] }
```

### What NOT to do
- Never install @clerk/nextjs v7+ (breaks Next 14)
- Never use auth() for publicMetadata — use currentUser()
- Never hardcode blogId or investor data — always from Zoho
- Never use MOCK_USER_ROLES — always read from real Clerk user

---

## Session Update — March 28, 2026

### Domain & Production
- Live at foxmortgage.ca (A record → 216.150.1.1)
- www.foxmortgage.ca (CNAME → cname.vercel-dns.com)
- Clerk switched to Production instance (pk_live_ keys active)
- No "Development mode" banner — fully production

### Zoho — New Custom Fields on Deals Module
Three new fields added — use these as source of truth:
- Investor_Status (Picklist): "Active" | "Renewal In Progress" | "Renewed" | "Paid Out" | "Legal"
- Investor_Payout_Date (Date): exact date principal returned to investor
- Renewal_In_Progress (Boolean): true when past maturity but continuing

### Income Calculation Rules (CRITICAL)
Always use Investor_Status as source of truth:
- "Active" | "Renewal In Progress" | "Renewed" → income continues to today
- "Paid Out" → income stops at Investor_Payout_Date (fallback: Maturity_Date)
- "Legal" → income stops at Maturity_Date

Helper functions (copy to any new page):
```
const isIncomeActive = (p) =>
  ['Active', 'Renewal In Progress', 'Renewed'].includes(p.Investor_Status)
  || (!p.Investor_Status && p.Deal_Status_Investor !== 'Matured')

const getIncomeEndDate = (p) => {
  const today = new Date()
  if (p.Investor_Status === 'Paid Out') {
    if (p.Investor_Payout_Date) return new Date(p.Investor_Payout_Date)
    if (p.Maturity_Date) return new Date(p.Maturity_Date)
  }
  if (p.Investor_Status === 'Legal') {
    if (p.Maturity_Date) return new Date(p.Maturity_Date)
  }
  return today
}
```

### Status Badge System
- Active (within 90 days of maturity) → "Maturing Soon" yellow
- Active → "Performing" green
- Renewal In Progress → "Renewal Pending" blue
- Renewed → "Performing" green
- Paid Out → "Paid Out" gray
- Legal → "In Legal" red

### Opportunities System
- Deal_Status_Investor = "Available" → appears on Opportunities page
- When investor commits → change to "Committed"
- Opportunities API handles empty Zoho response (204) gracefully

### Adding New Investors (Process)
1. Create Partners record in Zoho CRM → note record ID
2. Link their deals in Zoho: set Investor_Name, Investor_Amount, Investor_Rate, Investor_Status, Lender_Fee
3. Create Clerk account in Production instance
4. Set publicMetadata: { "roles": ["investor"], "zoho_partner_id": "ZOHO_PARTNER_RECORD_ID" }
5. Investor can log in immediately — all data flows automatically

### Pages Rebuilt This Session
All investor portal pages rewritten with live Zoho data:
- /portal/sign-in → custom form with background image, forgot password
- /portal/investor/dashboard → full rebuild with chart, insights, opportunities, cash flow timeline, Investor_Status-driven KPIs
- /portal/investor/portfolio → My Investments with correct status badges
- /portal/investor/portfolio/[id] → Investment Details with Investment Snapshot, What Happens Next, dynamic notes
- /portal/investor/statements → renamed to "Reports", computed from real deal data, annual summary, request-based PDFs
- /portal/investor/profile → Profile Completion bar, Account Status cards, real Clerk name/email, banking info removed
- /portal/investor/support → Clerk auto-fill, action shortcuts, success state

### Live investor partner — current deal status
- Hamilton IFMS-F002684: Paid Out, payout Aug 13 2024, no lender fee
- Millgrove BRXM-F024213: Renewal In Progress, $500K, 12%, $10K fee
- Thorndale BRXM-F024629: Paid Out, payout May 15 2025, $85K, $1.7K fee
- Active monthly income: $4,167/month (Millgrove only)

### Zoho Fields Required in getInvestorPositions() query
Deal_Name, Amount, Investor_Amount, Investor_Rate, Investor_Name,
Deal_Status_Investor, Investor_Status, Investor_Payout_Date,
Renewal_In_Progress, Mortgage_Type, Mortgage_Rate, Payment_Amount,
Payment_Frequency, Street, City, Province, Purchase_Price_Value,
Maturity_Date, Stage, Rate_Type, Term_Type, Exit_Strategy,
Lender_Notes, First_Payment_Date, Total_Loan_Amount, LTV,
Closing_Date, Lender_Fee

### Pending (Next Session)
- Opportunities page review and cleanup
- Documents page review
- Private lender onboarding flow (Zoho Sign KYC)
- Investor_Status data model prompt still pending (income logic fix across all pages)
- Send the live investor partner their portal invite

## Financial Planner Partner Portal (FOX-8)

### Routes
All FP portal routes live under /portal/fp/:
- /portal/fp/dashboard
- /portal/fp/clients
- /portal/fp/clients/[id]
- /portal/fp/add-referral
- /portal/fp/messages
- /portal/fp/support

API routes live under /api/portal/fp/.

### Auth
- Clerk role key: financial-planner
- Added to publicMetadata.roles[] array
- Always use currentUser() for FP identity and publicMetadata — never auth()
- Clerk publicMetadata fields: fp_name, fp_firm, fp_zoho_id, fp_zoho_contact_id

### Zoho
- Deals filtered by FP_Email field matching logged-in FP's Clerk email
- Custom fields on Leads: FP_Name, FP_Firm, FP_Email, Referral_Goal, Best_Contact_Time, Property_Value, Annual_Income
- Custom fields on Deals: FP_Email, Next_Review_Date, Savings_Identified
- Messages stored as Zoho Activity Notes — never in a separate DB
- Per-client messages: Note_Type = FP_Message on Deal record
- General inbox messages: Note_Type = FP_General_Message on FP Contact record

### n8n Webhooks
- FP_REFERRAL_WEBHOOK_URL — workflow "FP Portal — Referral Submission"
  Triggers: Zoho Lead creation + 3 emails (Michael, FP confirmation, referred client welcome)
- FP_MESSAGE_WEBHOOK_URL — workflow "FP Portal — Messaging"
  Handles two types via IF branch: client_message (Note on Deal) and general_message (Note on Contact)

### Resend in n8n
- Credential name: "Resend API Paperclip" (Header Auth type)
- The Authorization header already contains the full Bearer token
- Select this credential on HTTP Request nodes — do not manually set Authorization header

### Stage Mapping (Zoho Deal Stage → 9-stage UI tracker)
- Qualification → 1. Inquiry
- Needs Analysis → 2. Application
- Value Proposition → 3. Documents
- Id. Decision Makers → 4. Appraisal
- Perception Analysis → 5. Lender Submission
- Proposal/Price Quote → 6. Commitment
- Negotiation/Review → 7. Conditions
- Lawyer → 8. Lawyer
- Closed Won → 9. Funded
- Closed Lost → N/A (closed badge)

### FP Provisioning (manual)
Michael assigns financial-planner role manually in Clerk dashboard.
Set publicMetadata: { "roles": ["financial-planner"], "fp_name": "...", "fp_firm": "...", "fp_zoho_id": "...", "fp_zoho_contact_id": "..." }
To revoke: remove financial-planner from roles array.

### Phase Status
- Phase 1: Complete — all 6 routes live with mock data (commit 8ce7976)
- Phase 2: In progress — live Zoho data wiring + n8n webhooks (FOX-48)
- Phase 3: Pending — DialPad webhook integration

## SMM Page — /smm (FOX-49)

**Status:** Complete — April 7, 2026
**File:** `app/smm/page.tsx`
**Final commit:** c935cdb

### Key facts baked into the page
- Enrolled count: 73 mortgages monitored (update this number as enrollment grows)
- Client touchpoint: monthly homeownership report
- Proactive contact: only when a savings opportunity exists
- No Google reviews yet — star rating omitted until collected
- Testimonials: two approved client testimonials, first name + last initial, both Guelph — approved April 7, 2026

### Design decisions
- One conversion action only — both CTAs link to /smm/enroll
- No exit ramps — "Book a Call" and "View Report" removed
- Em dashes prohibited in all body copy on this page
- Three deliberate em dash exceptions (do not remove):
  1. Hero CTA button: "Enroll Free — Takes 2 Minutes →"
  2. Supporting proof line below testimonials
  3. Testimonials section comment
- Video: Wistia embed, media-id kaon6ntu81, hosted externally
- Narrative section uses lime green divider (w-16 h-px bg-[#95D600]) between problem setup and payoff line

### Page section order
1. Hero (H1, subheadline, CTA, trust bar)
2. Narrative ("Most mortgage advice shows up at the transaction")
3. Video (Wistia embed kaon6ntu81)
4. How It Works (3 navy cards, steps 01/02/03)
5. What We Watch (navy section, 2x2 grid)
6. Testimonials (the two approved)
7. FAQ (accordion, React useState, no external library)
8. Final CTA with curiosity line above button
9. Compliance footer strip

### Wistia embed notes
- media-id: kaon6ntu81
- Loaded via next/script with strategy="afterInteractive"
- TypeScript global declaration added for wistia-player custom element
- Hydration warning on inline style block is pre-existing and benign — do not attempt to fix

### Next actions on this page
- Update enrolled count (currently 73) as SMM grows
- Add Google rating to trust bar once reviews are collected
- Add additional testimonials as collected — see comment in file above testimonials section
- BRX Mortgage compliance review before driving paid or significant organic traffic to this page

## Deal Briefing & Email Monitor Workflows

### Michael — Daily Deal Briefing
- **Workflow ID:** `dh1qIttAuctSQ7L0`
- **n8n instance:** foxmortgage.app.n8n.cloud
- **Status:** Built and tested, currently INACTIVE — Michael to activate from n8n UI after reviewing the two test emails (Resend message IDs `7af9d757-76fb-4e6b-873c-03fc05afe770` and `23135620-a400-434d-9fe0-9fa6c844c9ff`, both sent 2026-04-07 to mfox@foxmortgage.ca)
- **Schedule when activated:** 5:45 AM America/Toronto daily (cron `45 5 * * *`), plus a manual-test webhook at `POST https://foxmortgage.app.n8n.cloud/webhook/deal-briefing-test`
- **Credentials used:**
  - Zoho: `zohoOAuth2Api` id `z1jUVqbuGO3MSJUE` name "Zoho account" (the working Fox Mortgage credential, not "260126-1439-Zoho" from the brief — that credential name does not exist; closest match is "260126-1257-AEST-Zoho" id `a053GmNoQPrMyYAS` but it is `oAuth2Api` generic, not `zohoOAuth2Api` predefined)
  - Resend: `httpHeaderAuth` id `iJa8AHPr58GmNMda` name "Resend API Paperclip"
- **From/To:** michael@app.foxmortgage.ca → mfox@foxmortgage.ca
- **Current report sections:** (1) Tasks Due Today, (2) Pipeline By Stage (ordered: Pending → Collecting Documentation → Options → Conditionally Approved → Underwriting In Progress → Additional Properties-as-summary), (3) Renewals Within 90 Days
- **Sections from the brief that were DROPPED and why:**
  - "Needs Action Today / Stalled Deals" — `Last_Activity_Time` on this Zoho instance is auto-populated by the Finmo sync (every deal shares the same timestamp `2026-04-01T06:06:47-04:00`), so stall detection would flag all 109 open deals every day. No reliable per-deal activity signal exists. Note included at bottom of email. Re-introduce once activity is tracked via Notes or Tasks.
  - "Emails Awaiting Reply" — Zoho CRM's Emails API is per-record only, not queryable in bulk. The brief's assumption of a filterable Emails module with a `Replied` boolean does not match Zoho's data model. Scope explicitly dropped by user.
  - "Days in current stage" warnings — `Stage_Modified_Time` is null on every deal. Brief's stage-age threshold flags would be meaningless.
- **Terminal stages filtered out of pipeline view:** Archive, Closed, Lost, Mortgage Funded, Mortgage Lost (118 deals filtered, 76 kept as open)
- **Zoho fields confirmed working:** Deal_Name, Stage, Contact_Name, Closing_Date, Modified_Time. `Next_Step` and `FP_Email` were requested by the brief but not verified — code tolerates them being absent.

### Inbound Email Monitor
- **NOT BUILT.** Scope explicitly dropped by user because Zoho CRM's Emails API does not support bulk querying of inbound messages with date filters. The brief's every-30-minute polling approach would require per-deal email fetches against a 200-calls/minute rate limit and would not have a reliable way to detect "unanswered" without walking every email thread. Revisit when we have a real mail pipeline (Gmail API, Outlook/Graph API, or Resend inbound routing).

---

## FP Portal — Financial Planner Setup (April 9, 2026)

### First FP partner — Wealth Labs
- Name: in Clerk/Zoho; not recorded here
- Firm: Wealth Labs
- Firm email: hello@wealthlabs.ca
- Zoho Partner record ID: 7112178000003669036
- Clerk user ID (Fox Mortgage Portal production): user_3C8vdzYzbfqsdhhoBl6KHHw7VCN
- Clerk instance: ins_3BajmGzbhbmTjTaZDpsx0ozeU6x (Fox Mortgage Portal production sk_live_)
- Role: financial-planner
- Referred files: BRXM-F053675, BRXM-F053724, BRXM-F053725
- Portal access: foxmortgage.ca/portal
- Invitation sent: April 9, 2026

### Zoho CRM — FP Portal Architecture
- FP partners linked to mortgage files via Referral_Partner lookup field
- Referral_Partner.id = Zoho Partner record ID = fp_zoho_id in Clerk publicMetadata
- FP_Email field does NOT exist on Potentials module — use Referral_Partner instead
- Portal queries: criteria=(Referral_Partner:equals:{fp_zoho_id})
- Module: Potentials (API name) = Mortgages (UI name)

### Clerk publicMetadata for FP role
{
  "roles": ["financial-planner"],
  "fp_name": "(the partner's name)",
  "fp_firm": "Wealth Labs",
  "fp_zoho_id": "7112178000003669036",
  "fp_zoho_contact_id": "7112178000003669036"
}

### FP Portal Routes
- /portal/fp/dashboard — stats filtered by Referral_Partner ID
- /portal/fp/clients — client list filtered by Referral_Partner ID
- /portal/fp/clients/[id] — client detail with progress bar, mortgage details, activity tabs
- /portal/fp/messages — general messages (uses email lookup — update when real email is set)
- /portal/fp/add-referral — referral submission form

### Stage Mapping — Zoho → FP Portal Progress Bar
| Zoho Stage | Milestone # |
|---|---|
| Lead | 1 |
| Application Started | 2 |
| Collecting Documentation | 3 |
| Underwriting In Progress | 4 |
| Ready to Submit | 5 |
| Submitted to Lender | 6 |
| Conditionally Approved | 7 |
| Broker Complete | 8 |
| Mortgage Funded | 9 |
| Mortgage Lost | 0 (Closed badge) |

### FP Portal Confirmed Zoho Fields (Potentials module)
Working: Deal_Name, Contact_Name, Amount, Mortgage_Rate, Stage,
Closing_Date, Mortgage_Type, Referral_Partner, Street, City,
Province, Zip_Code, LTV, Total_Loan_Amount, Purchase_Price_Value
Not working / don't exist: FP_Email, Next_Review_Date,
Savings_Identified, Last_Activity_Time, Term_Years

### Dialpad Integration (Pending)
- Dialpad → Zoho CRM native connection exists but needs verification
- Call summaries not yet appearing in Zoho
- FP portal has Activity tab stubbed with "Call summaries will
  appear here once Dialpad is connected"
- Build this in a future session

### Adding Future FP Partners
1. Create Partner record in Zoho CRM → note record ID from URL
2. Create Clerk user in Fox Mortgage Portal production instance
   (NOT Content OS instance — different Clerk instance)
3. Set publicMetadata with roles, fp_name, fp_firm, fp_zoho_id
4. Link their referred mortgage files via Referral_Partner field in Zoho
5. Send portal invite email

---

## Booking engine, current state (all four sessions shipped)

Session entries live in `docs/ledger/2026-07.md` from 2026-07-27 onward. This
section is current state only.

- **Public pages** at `/book/<host>/<event-type>`, unlinked from public nav.
  Manage page at `/book/manage/<token>`. Four event types seeded for host `mike`:
  discovery-call 15 / strategy-session 45 / smm-strategy-call 30 / signing-review
  20, all with 5 to 10 minute after-buffers. **Durations and buffers CONFIRMED by
  Michael 2026-07-27.**
- **Graph is READ AND WRITE.** The roles claim carries `Calendars.Read` and
  `Calendars.ReadWrite`. `lib/booking/outlook.ts` gates on that claim rather than
  hardcoding, so a revoked grant degrades to honest refusals rather than errors.
  The permission is tenant-wide; an ApplicationAccessPolicy to scope it to one
  mailbox is still open (it covers the Today band's read grant too).
- **Availability fails closed.** No calendar visibility means no times offered.
- **Storage** is FOXCA, RLS on, no policies, grants revoked, security-definer
  functions each demanding `p_operator_secret`. There is no FOXCA service-role
  key and one is not to be minted.
- **Consent** writes the four `CASL_*` fields on the Contact with method
  `Express`, and ONLY ever on a tick. An unticked box writes nothing at all.
- **No Zoho Tasks are created by the booking flow**, deliberately. The calendar is
  the operational surface.
- **`/api/book/cron`** runs the hourly reminder and calendar-reconcile jobs. TWO
  auth paths, both valid: `Authorization: Bearer <CRON_SECRET>` (what Vercel's
  cron sends — now the PRIMARY path, since it is the one on the schedule) and
  `x-bridge-secret` / `UW_BRIDGE_SECRET` (the original machine path, still used
  for by-hand runs; it retires when n8n does). Session four's "booking needs its
  own secret" debt is therefore mostly PAID: the scheduled path rides
  `CRON_SECRET`, booking's own value, and only the manual path still shares the
  sweep's secret. **GET and POST both work and run identical
  work — GET exists because Vercel invokes crons with GET, not POST.** The run's
  counts go to the runtime log as one `book.cron` line (via, job, ok, ms, and
  per-run counts) because the Vercel cron discards the response body that n8n
  used to keep; the line carries counts and ids only, never notes, never a
  client's details.
- **THE CLOCK IS VERCEL'S (2026-07-28).** `vercel.json` (the repo's first) holds
  one cron: `/api/book/cron` on `0 * * * *`, UTC. It replaced n8n
  `Uc9CoYm4B2XSpN5m`, which never ran once — `active: false` with no credential
  bound to its HTTP node. **THE RENEWAL-DAY PLAN FOR THAT WORKFLOW IS NOW
  DEACTIVATION, NOT REBINDING.** The jobs are idempotent, so a revived n8n trigger
  would only double-fire harmlessly.
  **NOTHING IS OUTSTANDING — the clock is running.** `CRON_SECRET` is already set
  on the project with Production scope, proven live: the first native invocation
  (2026-07-28 23:01:22 UTC, 200) authenticated as `via: "vercel-cron"`, reachable
  only when `process.env.CRON_SECRET` is set AND the incoming Bearer matches it.
  Both jobs ran clean. Cron timing is APPROXIMATE (`0 * * * *` fired at :01:22);
  a minute of drift is the platform, not a fault.
  CAUTION for a future session: the project env CANNOT be read from here — the
  Vercel CLI token has been 403 `invalidToken` three times (2026-07-10, -17, -28)
  and the Vercel MCP has NO env-var tool. On 2026-07-28 the repo evidence pointed
  hard at `CRON_SECRET` being absent and that inference was WRONG. Repo contents
  are not evidence about Vercel's environment; prove it with a runtime log.
- **Rate limiting** (`lib/booking/rate-limit.ts`) is SLIDING-window, two tiers per
  surface (a burst in seconds plus a sustained one in minutes or hours), keyed by
  IP everywhere and ALSO by sha256 of the email on confirm. Refused attempts are
  never recorded and the check is all-or-nothing, so Retry-After is truthful and a
  burst refusal cannot spend the sustained budget. It is IN-PROCESS by decision,
  not by omission: the real guards are the database's (one active booking per
  email per event type per day, the partial unique index on
  `(agent_id, starts_at)`, the per-day cap), and a durable limiter would add a
  FOXCA round trip to the hot path to stop an attacker already stopped below. The
  reasoning is written in the file. Revisit only if booking moves to the edge.
- **Every dead end is a page, and they all share one card**
  (`components/booking/BookingNotice.tsx`, which writes no copy of its own — every
  word is passed in and gated at its call site). Outage, no times, `/book`
  not-found, plus four manage states. **The manage page's vagueness is
  deliberate and load bearing:** a token that does not RESOLVE gets ONE identical
  card so the page is not an oracle for guessing tokens; the already-happened,
  already-cancelled, and closed-out states ARE distinguished, because the token
  resolving means the reader already proved the capability.
- **Stuck calendar writes email Michael once a day per booking**, never once an
  hour. FOXCA migration `20260728120000`: one row per `(booking, Toronto day)`,
  primary key on the pair, insert-on-conflict-do-nothing, and
  `booking_claim_stuck_alert` returns whether THIS call created it. The claim runs
  BEFORE the retry. An unreachable store returns false and sends nothing; the
  stuck row is still named in the job log every run.
- **The Availability page** (`/portal/admin/availability`, authority key
  `booking.manage`, admin only) is where hours, closed days, and meeting-type
  settings are changed. Four tabs, each saving on its own. PER-AGENT BY DESIGN:
  every store function takes an agent id, the id is resolved SERVER-SIDE from
  `BOOKING_HOST_SLUG` through `booking_agent_for_slug`, and NO route accepts an
  agent id from the browser (a test asserts this, because a client-supplied
  agent id on an admin write is how one host would edit another's calendar).
  Meeting types are EDIT ONLY and the slug is immutable, because the slug IS the
  public URL. Migration `20260728140000`.
- **The admin cancel IS the client cancel.** `bookingForAdmin(id)` returns the
  identical `TokenBooking` the token lookup returns (one shared
  `mapTokenBooking`), so the desk calls `cancelBooking({ by: 'admin' })` and the
  client email, the calendar removal, and the Zoho note cannot be skipped by
  taking a different door. Never add a second cancel path.
- **Two validators, deliberately different.** `normalizeWindows` (read path)
  DROPS malformed windows so a bad row can never widen availability.
  `lib/booking/admin.ts validateWindows` (write path) is LOUD: it refuses and
  names the problem, and refuses overlaps rather than merging them. Do not
  "simplify" one into the other. `EVENT_TYPE_BOUNDS` is tested against the
  column checks in migration 20260727160000, so the page and Postgres cannot
  drift.
- **`lib/booking/copy-gate.ts` is the one home for the client copy rules** (no
  em dash, en dash, semicolon, exclamation point, never "broker"). The tests
  sweep with it and the Availability editor warns with it, because a meeting
  type's name and description are typed by an admin and read by a client.
- **`lib/booking/signature.ts` is the ONE home for Michael's e-signature** on
  the client emails (confirmation, reminder, reschedule, cancel), in both a text
  and an html form. The phone and email are read from `lib/contact.ts`, NEVER
  written here, because tests/contact-number.test.ts forbids a phone literal
  outside that file. The client mail is MULTIPART as of this: `BuiltMail.html`
  is derived from the same authored body as `BuiltMail.text` by `finish()`, so
  the two parts cannot drift, and it exists because "Click HERE" cannot be a
  link in plain text. The text part spells the application address out instead.
  The note to Michael stays text-only on purpose.
- **SWAP DAY 2026-07-28, PARTIAL BY DESIGN.** Two of the three booking
  populations now run native, the third was scoped out of the swap-day brief and
  is still on Zoho. NATIVE: the renewal drip (`RENEWAL_CALENDAR_URL` set by
  Michael in fox-underwriting, which releases every held touch on the next tick)
  and the six public CTAs including the SMM enroll wizard (`9d2db8e`, discovery
  call only per gate JG-1). The CTA retarget is a verified commit. The env var is
  Michael's assertion, NOT verifiable from this repo, and it was not verified
  here. **STILL ON ZOHO:** `lib/contact.ts` `bookingUrl` is a HARDCODED
  CONSTANT (not an env var), read by eight portal surfaces (client status page,
  qualification explorer, six Support pages), and four of those Support pages
  carry the literal client-visible string "Schedule time via Zoho Bookings".
  That is the whole remaining swap, one constant plus four subtitles, and it is
  cutover-inventory section A. Full inventory and steps:
  `docs/booking-cutover-inventory-2026-07-28.md`.
- **Zoho Bookings retires 2026-10-27**, three months past the swap, and only if
  the account shows zero bookings in the previous 30 days. If it shows any, the
  date moves out a month. It stays live until then for links Michael pasted by
  hand, the only population that outlives the swap, because every portal surface
  renders live and the drip never sent a Zoho link at all. `/book` is NOT in
  public navigation and stays out until Michael asks for it.
- **Still open, none of it code:** deactivate n8n `Uc9CoYm4B2XSpN5m` on renewal
  day (the cron replaced it and it never ran); the duplicate-event residual (Graph's
  `transactionId` is the identified fix, unwired because it needs a live Graph
  experiment); creating meeting types and editing intake wording (both wait for
  a real second agent); and deleting Zoho lead `7112178000006506006`, junk from
  session three's proof booking.
- Reference: `docs/booking-engine-session-one-2026-07-27.md`,
  `docs/booking-cutover-inventory-2026-07-28.md`.

The session ledger moved verbatim to `docs/ledger/2026-07.md`.
