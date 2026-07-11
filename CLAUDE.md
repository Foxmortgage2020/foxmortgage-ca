# foxmortgage.ca — Claude Code Build Context

## Last Updated: July 11, 2026 (Rates v3 shipped — the Rates page became four URL-addressable tabs (Scenario default / Lenders / Promos / All quotes); a `<LenderMark>` component renders a real logo from public/lenders/ or an on-brand navy+lime monogram fallback everywhere a lender is named; the Lenders tab browses the approved book with honest per-class headline rates and deepest floating discounts plus a three-state coverage map; the Promos tab is the offer board; saved scenarios persist per user in FOXCA; the scenario lender-card click was root-caused and fixed (affordance + scroll-to-top drill-in, NOT a broken handler); and a test locks the client PDF against ever disclosing compensation. Session 9 (below) was THE FINALE of the original nine-session map; Rates v3 is a post-finale enhancement session.)

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
- Granted tables (SELECT only; 17 since fox-underwriting migration 0028, verified
  live 2026-07-10): agents, audit_log, borrowers, conditions, deals, documents,
  flags, income_calcs, intake_events, lender_intel_items, number_links,
  rate_quotes, rate_sheet_reviews, ratio_calcs, shadow_scores, statement_fields,
  statement_reviews. NOT granted: evidence (still 42501).
  No submission-notes table exists yet (notes are report artifacts, not rows).
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

### Nav IA (names are stable; renames need a note here)
Home | Deals (S3) | Approvals (S3) | Rates (S4) | Intel (S4) | Knowledge (S4) |
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
  in tests: 650000 @ 3.75 over 30yr = 2999.58 (Zinger cross-validated);
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
  because Zoho word search does not match Nick against Nicholas),
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
  find_client resolves Nick Aitken to IFMS-F001515 with Maturity_Date
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
  instead of duplicating). Live proof: the Aitken deal carries 5 open
  tasks including "Backfill Aitken deal fields from commitment" due
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
- Live investor partner: tersignicorp@gmail.com — Dominic Tersigni
  zoho_partner_id: 7112178000001393118
  Production Clerk record exists (do not reference dev-pool userId).
  Clerk metadata shape: {roles: "investor", zoho_partner_id: "..."}
  Note: Clerk has display name "Domenic" (with e); Zoho has "Dominic" (with i). Zoho is canonical — banner will show "Dominic".
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

### Domenic Tersigni — Current Deal Status
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
- Send Domenic his portal invite

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
- Testimonials: Ian C. (Guelph) and Joe J. (Guelph) — approved April 7, 2026

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
6. Testimonials (Ian C. and Joe J.)
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

### Ben Zavitz — First FP Partner
- Name: Ben Zavitz
- Firm: Wealth Labs
- Real email: hello@wealthlabs.ca
- Zoho Partner record ID: 7112178000003669036
- Clerk user ID (Fox Mortgage Portal production): user_3C8vdzYzbfqsdhhoBl6KHHw7VCN
- Clerk instance: ins_3BajmGzbhbmTjTaZDpsx0ozeU6x (Fox Mortgage Portal production sk_live_)
- Role: financial-planner
- Referred files: BRXM-F053675 (Melissa Cohoe), BRXM-F053724 (Gianna Reinders), BRXM-F053725 (Tyler Bannerman)
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
  "fp_name": "Ben Zavitz",
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

## Session Ledger

### 2026-07-11 — Rates v3 (tabs, lender browse, logos, promos board, saved scenarios)
- Part 0 root cause (git-verified, stated in the report): the scenario
  lender-card click was NEVER a broken handler. The `<button
  onClick={navigate({lender},true)}>` is byte-identical across Session 5 and
  Session 6 (git diff proved it); Session 6 only rewrote the card's inner
  rate rendering. What failed was (a) affordance — a `<button>` gets
  `cursor:default` in Tailwind v3 (Preflight sets no pointer) and the only
  hover cue was a faint border tint, so the card read as a static tile; and
  (b) the drill-in used `router.push(url, {scroll:false})`, so clicking a
  card below the fold swapped in the shorter lender view without moving the
  viewport and read as "nothing happened". Fix: unmistakable affordance
  (cursor-pointer, hover shadow + border, a "View products ›" chevron) and
  drill-in pushes now scroll to top (filter changes still hold scroll).
- Rates is four URL-addressable tabs (?tab=scenario|lenders|promos|all),
  Scenario default; components/admin/RatesTabs.tsx owns the tab bar,
  sessionStorage tab memory (URL wins; a ?from deal prefill always forces
  Scenario), and renders each tab. The Session 5 cards/table toggle was
  removed from RatesScenario; the dense table (RatesBrowser) is now the
  "All quotes" tab (fetches the prime reference itself).
- config/lenders.ts: display names keyed by the QUOTE slug (a THIRD slug
  space, distinct from knowledge slugs fn/td and the penalty slugs in
  lib/lenders.ts). Verified live against rate_quotes: the 23 hand-written
  names cover EVERY distinct real lender_slug in the book exactly (mcap,
  first-national, strive, rfa, scotia, merix, unionlink, rmg,
  first-national-excalibur, neo, cmls, npx, highclere, nbc-optimum,
  haventree, b2b, bridgewater, kootenay, shinhan, manulife, coast-capital,
  radius, home-trust); test-portal intentionally unnamed and excluded.
  Unknown future slugs fall back to a title-cased slug (lenderInitials +
  lenderDisplayName pure, unit-tested).
- components/admin/LenderMark.tsx (client): renders /lenders/{slug}.svg →
  .png → an on-brand navy circle + lime ring monogram fallback (the DEFAULT
  state, not an error). onError chain terminates at step 2 (a span, no
  loop). No manifest: drop a file into public/lenders/ and it appears with
  no code change. Wired everywhere a lender is named: the scenario result
  cards / lender level / product detail / compare tray, RatesLenders, the
  approvals sheet cards, the intel feed, RatesBrowser, and both knowledge
  pages. NOT added to the client PDF (trademarked assets on a client-facing
  doc is a separate decision left to Michael). public/lenders/ ships empty
  (monogram everywhere) by design. IMPORTANT for Michael: a
  `Lender Logos/` folder of 21 PNG/JPEG logos named by DISPLAY NAME already
  sits in the repo root (untracked). To light them up, rename to the quote
  slug + .png/.svg under public/lenders/ (e.g. "MCAP.png" → mcap.png,
  "First National.png" → first-national.png, "RFA.jpeg" → convert to
  rfa.png since the fallback chain is svg→png only). Several of those logos
  (MCAN, Marathon, Meridian, Peoples Bank, QuestBank, First Ontario, TD) are
  for lenders not yet in the book; they light up when those quote slugs
  appear.
- lib/lender-browse.ts (pure, tested): the Lenders tab model. Cards print
  the best approved FIXED rate PER product class (never one unqualified
  "lowest") and the deepest floating discount with adjustable and variable
  kept apart; only approved rows count; TEST lender excluded; staleness at
  30 days. lenderCoverage partitions lenders into three disjoint states —
  live (has approved quotes), awaiting your approval (has extracted sheets,
  no approved yet; links to /portal/admin/approvals?tab=sheets), and
  coverage pending (intel captured, no quotes and no pending — format has no
  parser yet). Live cards carry an awaiting nudge when a live lender also
  has pending sheets. NOTE the book today has 0 extracted rows, so the
  awaiting state is currently empty; superseded history exists for mcap
  (168), first-national (47), strive (54), rfa (7), scotia (2).
- components/admin/RatesLenders.tsx (lender cards + coverage groups + lender
  page: products grouped by rate type then term, term/class/rate-type
  filters, superseded toggle, "price a deal with this lender" → scenario
  tab, product rows deep-link to the scenario product detail). Cross-link
  discipline: the lender page keys on the quote slug; promo deep links use
  the knowledge entry's quote_slugs alias first, then the offer slug.
- components/admin/RatesPromos.tsx (the offer board): active offers sorted
  by expiry ascending, amber inside 14 days / red inside 5, conditions
  verbatim behind an expand, provenance = the announcement (never a sheet).
  DATA LIMIT recorded: the offers endpoint serves ONLY active offers
  ("Expired offers are never served by the workbench"), so the
  recently-expired toggle renders the honest attempt-and-fallback state and
  lights up automatically if the endpoint ever returns expired entries.
- Saved scenarios (Part 5): FOXCA migration 20260711000000
  (saved_scenarios; RLS on, no policies, table grants revoked, three narrow
  security-definer functions granted to anon; nothing hard-deletes — retire
  flips status). Applied live and round-trip verified (create → per-user
  list → retire; cross-user isolation held; anon has function EXECUTE, NOT
  table SELECT; TEST rows retired, retained). lib/saved-scenarios-store.ts
  is the only client (twin of notifications-store); the route
  app/api/portal/admin/rates/scenarios gates rates.view (NO new authority
  key — scenarios are already inside that key's scope), keys on
  gate.user.userId, canonicalizes params server-side, and short-circuits in
  demo mode (never lists or writes real saved scenarios). The
  SavedScenariosBar sits above the scenario rail; hidden when the store is
  unconfigured.
- Part 6 (compliance guard): the client PDF already omitted the structured
  comp field (the compare tray shows it on screen; the PDF never did).
  Locked with a test in tests/rates-pdf.test.ts that inflates the PDF's
  content streams, hex-decodes the drawn text, and asserts a sentinel comp
  figure, "bps", and "Compensation" never appear across fixed/floating/cash
  back and prime-unavailable inputs (non-vacuous: it also asserts a known
  heading IS present).
- Extracted components/admin/rate-display.tsx (TypeBadge, CashbackChip,
  RateHeadline, rate formatters, variantLabel) so the three tabs share one
  honest rate-rendering source; lib/rates-shared.ts holds the
  KnowledgeLenderEntry type + matchKnowledge + promoTone.
- Verified: tsc clean, production build green, 227 unit tests green
  (tests/lender-browse 9, tests/lenders-config 5, PDF comp guard +2), dev
  server boots and serves with no errors, live FOXCA migration + UW slug
  audit done through the read-only paths. Authenticated tab screenshots
  require Michael's Clerk session (agent cannot authenticate); the
  LenderMark monogram fallback + logo-swap were proven with a faithful
  component design preview. Guardrails held: readonly workbench (all reads
  through the existing role; no workbench writes), FOXCA via narrow
  functions only, currentUser(), middleware publicRoutes untouched, no
  ANTHROPIC_API_KEY in build subprocesses, no lender logos on the client
  PDF, partners spot-checked (PortalLayoutClient/knowledge pages unaffected).

### 2026-07-10 — Admin Command Center Session 9 (THE FINALE: PWA, notifications, search, demo)
- PWA shipped: on-brand generated icon set (maskable variants), manifest,
  a SECURITY-FIRST service worker (static cache-first; every /api and
  /portal request network-only and never cached — isCacheable guard +
  tests/pwa.test.ts; offline fallback page), install hints on admin +
  partner shells, SW registration + Viewport/appleWebApp metadata in the
  root layout, /offline added to middleware publicRoutes. Caching posture
  documented in the Session 9 section as a standing security contract.
- Notification center shipped: FOXCA migration 20260710220000 (applied
  live; RLS+functions-only posture), lib/notifications(.ts/-store.ts),
  the bell (mounted once in the top bar, 60s poll) + per-category toggles
  on Settings. Five producers from existing signals; the
  gate_decision_external producer surfaces CLI/off-portal decisions
  (actor !== 'portal') — proven live by a real "michael decided
  rates.sheet_approved" notification. No new authority key (rides
  deals.view + per-category permission filtering).
- Global search shipped: cmd-K palette (mounted once) over lib/search.ts
  + /api/portal/admin/search — deals (workbench refs + Zoho names),
  contacts, partners, knowledge (client, browser-token), and navigation;
  grouped, keyboard-driven, debounced, per-source 'degraded' honesty
  (proven live). 
- Demo mode shipped: authority key demo.mode + DEMO_MODE_ENABLED env
  fence; signed fox_demo cookie; fixtures at the fetcher boundary so ZERO
  real workbench/Zoho reads and no borrower data on any surface
  (bell + cmd-K included); writes throw DemoWriteBlocked; decision
  controls hidden; persistent banner; lender rates/knowledge stay real by
  design. tests/demo.test.ts asserts zero reads + blocked writes. Proven
  live end to end (DEMO-F000x book, exit restores real data).
- Finale sweep: /portal/clients + /portal/reports deleted and unwired
  (zero refs); Daily Deal Briefing RETIRED by decision (inactive since
  inception; Home rail serves it live); PortalLayoutClient made
  responsive (mobile drawer; desktop unchanged); FP table + globals
  overflow-x: clip backstop; roadmap graduated ("original map complete" +
  forward BACKLOG). 375px sweep: admin + partner shells zero horizontal
  scroll, drawers work.
- New modules: lib/search.ts, lib/notifications.ts, lib/notifications-store.ts,
  lib/demo.ts, lib/demo-fixtures.ts, components/admin/{CommandPalette,
  NotificationBell,NotificationSettings,DemoBanner,DemoToggle}.tsx,
  components/{InstallHint,ServiceWorkerRegister}.tsx, public/{sw.js,
  manifest.webmanifest,icons/*}, app/offline. Suite 208 tests; build
  green. Delivered by a parallel discovery workflow → a 4-agent
  implementation workflow (disjoint file sets) → my shell integration +
  demo hardening → an adversarial review workflow. Guardrails held
  (readonly workbench, gates-only writes, FOXCA narrow functions, Clerk
  server-side, publicRoutes additive-only). THE ORIGINAL NINE-SESSION MAP
  IS COMPLETE.

### 2026-07-10 — Admin Command Center Session 8 (Multi-user hardening)
- Roles went live: shipped baselines recorded and exactly asserted
  (tests/authority.test.ts) — ops (views only), underwriting-reviewer
  (ops + approvals visibility + agent.use, strict superset tested),
  agent (own scope); decision and provisioning keys admin-only. New keys
  people.manage and agents.provision (gates contract). Zero role-literal
  gates remain repo-wide: 3 partner admin pages, 2 impersonate routes,
  13 bookkeeping routes, 5 admin API routes, and 31 partner-portal
  routes (admin allowance → portals.view-as) all converted to permission
  keys; grep proof clean; the /portal dispatcher now routes internal
  roles to /portal/admin; Home is permission-composed per section; the
  shell footer prints real roles. Settings gained the effective-access
  view (lib/effective-access.ts, pure, tested for all four roles) plus
  the People link.
- View-as governed: portals.view-as gates both impersonate routes; every
  session logs to FOXCA (view_as_start/end; logId rides the encrypted
  cookie) and lists under Audit Log → View-as sessions; picker page +
  portals-nav entry; structural read-only proven both ways live (form
  absent with the read-only notice AND a forced POST refused 403
  ImpersonationReadOnly); the rejection is one pure tested helper
  (lib/view-as.ts) across all 10 partner write routes.
- Provisioning wizard shipped (Settings → People → Provision someone):
  staff/partner/agent flows, exact grants before confirm, Zoho partner
  picked never typed and re-verified server-side, agent flow consuming
  POST /api/gates/agents (micro-session 4) with setup_remaining rendered
  verbatim and gates failures reported honestly; invitation via Resend
  optional; who-provisioned-whom in FOXCA people_provisioning.
- Offboarding rehearsed: two-tap Disable = Clerk ban + session revoke in
  one action (ban failure aborts; self-offboard refused), persisted
  checklist (lib/offboarding.ts pure + tested) covering grants void,
  partner attribution with real referred counts, agent book +
  FINMO_API_KEY_<AGENT> revoke, compliance credentials by holder;
  nothing deletes.
- FOXCA migration 20260710210000 applied and posture-verified live
  (42501 on all three tables; nine functions answer; TEST view-as row
  round-tripped). Full dev-instance cycle proven: TEST users
  user_3GKKLYoWq27OvDBkAx8aRJfRsgG (ops),
  user_3GKKLUFxuEEpcPPgppS2e42R2VF (UR),
  user_3GKKLcV5NP2F5Y7q9eGssPJbr65 (agent),
  user_3GKLWrJkzHKfLtkbMHXVWDyGkFa (admin),
  user_3GKM5c0RM8gKUwQZzcKXkXUZkli (provisioned through the wizard, then
  offboarded — banned + sign-in refused user_banned, checklist record
  24949cfa persisted and toggled) — all five removed after; per-role
  screenshots captured. Suite at 171 tests; build green; production
  Clerk untouched.
- New modules: lib/effective-access.ts, lib/view-as.ts, lib/people.ts,
  lib/people-store.ts, lib/provisioning.ts, lib/offboarding.ts;
  lib/gates.ts gained provisionWorkbenchAgent. New tests:
  view-as/provisioning/offboarding + authority baselines. Guardrails
  held: no workbench writes, gates-only workbench mutation, FOXCA
  narrow functions only, Clerk backend server-side only, middleware
  publicRoutes untouched, no invitation sends during testing.

### 2026-07-10 — Admin Command Center Session 7 (Revenue and Partners)
- Part 0: Ask Fox task awareness (get_open_tasks as the seventh
  enumerated tool over the Zoho related-records API; prompt v2 with the
  CHECK OPEN TASKS FIRST rule; dedup proven by mocked-loop unit test
  yielding zero cards plus the reference line, and live by the Aitken
  deal's 5 real open tasks covering what v1 would have duplicated) and
  the thinking indicator (in-thread dots from submit to first token,
  shimmer on the running tool line, motion-safe with a static
  reduced-motion form).
- Part 1 discovery recorded above: real commission fields with verified
  formula semantics but partial coverage (actuals on 5/11 funded-t12),
  Lead_Source absent from Potentials (100% on Leads), Referral_Partner
  34.3% on created-t12, funded mix coverage per dimension, the stale
  closing-date picture, and the no-QBO-path answer.
- Revenue shipped: forecast by close month (stage weights x actuals-first
  deal revenue through config/comp.ts), funded trends with the
  actual/model split visible, mix at real coverage only, funnel with the
  census-not-cohort caveat (Zoho stage history is not bulk-queryable via
  the records API, so no cohort view), pacing deep view with the gap in
  dollars and estimated files, P&L graceful state with exact
  requirements, comp model card with confirm-bps chips.
- Partners shipped: health-ranked list (tiers in config/partner-tiers.ts,
  investors untier-ed as funding partners), attributed volume and revenue
  with est chips, server-side Clerk last sign-in, detail referral section
  with cadence and referred files; attribution caveat exactly once on the
  list page. PartnersFilterTable deleted (replaced by
  PartnersHealthTable); management surfaces (invites, documents, view-as,
  investor KPIs) untouched.
- New modules: lib/revenue.ts, lib/partners-health.ts,
  lib/partner-engagement.ts, lib/pnl.ts, config/comp.ts,
  config/partner-tiers.ts. Suite at 142 tests (tests/revenue.test.ts 15,
  tests/partners.test.ts 7, agent tests grew to cover the seventh tool,
  prompt v2, and the dedup fixture).
- Guardrails held: no new Zoho writes (get_open_tasks is a read; the two
  write functions unchanged), workbench untouched, FOXCA untouched (no
  new migrations), Clerk read server-side with the existing secret,
  no QBO writes (WRITE_TO_QBO untouched), env unchanged.

### 2026-07-10 — Agent session (Ask Fox: Call Prep and Call Review)
- Shipped the in-portal practice agent: streaming chat at
  /portal/admin/agent behind the new agent.use key (agent.execute gates
  card execution), a manual Anthropic tool-use loop (claude-sonnet-4-6
  default, AGENT_MODEL override, adaptive thinking, cached system prompt)
  over EXACTLY six enumerated tools wrapping code the portal already
  trusts: find_client, get_deal_file, search_rates (the Rates page's own
  matching module; approved rows only, floating discount-first with
  labeled effective rates, offers with conditions, pending counts by
  type), knowledge_lookup, propose_zoho_update, propose_task. No gate
  actions, no send capability anywhere (unit-asserted and grepped).
- Confirm cards are the only write path: propose_* mints a card in FOXCA;
  the execute route (admin) loads the STORED payload and runs it through
  the only two Zoho write functions in the admin surface; one decision
  per card; who, when, and the result stamp the row. Draft emails return
  as text; nothing sends.
- Persistence per the house pattern: FOXCA migration 20260710190000,
  narrow functions only, direct table access refuses 42501 (verified with
  the actual key), nothing deletes; the chat refuses to run unlogged;
  history page lists every conversation.
- Call Prep is one tap from every deal room (?prep=<fileRef>) and renders
  the reference-shaped brief (What we hold, Where the book sits, The
  doors, Ask on the call, The clock) with the maturity-gap prominence
  encoded in the prompt. Call Review grades pasted or uploaded
  transcripts against config/call-rubric.ts v1 (ten items) with
  transcript evidence per score, extracted facts with quotes, and
  proposed actions as cards; the Dialpad CSV parser sniffs headers and
  falls back to plain text (the Jul 10 reference CSV lives on Michael's
  machine, so live acceptance of that exact file runs the day he pastes
  it).
- Caps enforced and unit-tested: 12 tool calls per message, 25 messages
  per conversation, capped threads say so and link a new one. Suite at
  116 tests (tests/agent.test.ts adds 18: mocked-API loop, budget
  exhaustion, refusal, unconfigured state, transcript shapes, tool
  surface enumeration, stripped-fixture not-captured contract).
- Live verification without the runtime key (none exists here by
  design): real-read tool runs (Aitken resolves with the maturity gap;
  BRXM-F053724 workbench composite; approved-book search with honest
  prime-unavailable) and the confirm write path on TEST artifacts (Zoho
  task 7112178000005988001 created from the stored card and completed;
  card 0c70fd74; conversation f0f90f9e). Michael switches the feature on
  by adding ANTHROPIC_API_KEY (and optionally AGENT_MODEL) in Vercel;
  the build-subprocess guardrail for that key stands unchanged.
- Roadmap: agent session recorded as 6.5 shipped; Session 7 Revenue
  still next; Dialpad-automatic Call Review noted as the agent's v2
  through the existing n8n call pipeline.

### 2026-07-10 — Admin Command Center Session 6 (floating rates on screen, and Compliance)
- Part 0 consumed the fox-underwriting variable-rates session: all three
  quote row types gained rate_type / prime_variance / cashback_pct /
  program_notes with rate nullable; lib/scenario.ts grew the effective-rate
  layer (quoteRateDisplay / quoteEffectiveRate / primeForLender /
  mechanismForLender / fmtDiscount) computing prime + variance at display
  time against GET /api/knowledge/rates-reference (new proxy route, same
  browser-minted-token posture), always labeled with the prime as-of,
  honouring the Kootenay-style per-lender overrides through the published
  coverage map, and rendering the honest prime-unavailable state when the
  reference is unreachable (never stale, never guessed; unit-tested).
- Ranking per the workbench contract: floating-only sorts by deepest
  discount, mixed sorts by effective rate, unpriceable floating rows sort
  last by discount; adjustable (sky) and variable (violet) badge
  distinctly with mechanism tooltips from the reference payload plus the
  pending-confirmation caveat on printed_label_plus_convention notes; cash
  back tiers are first-class rows with chips and verbatim program
  conditions and never become a lender headline. Scenario gained the
  three-way rate-type filter, the cash back filter, and the extended
  product-class vocabulary (b_side/heloc/reverse/other observed live);
  Scenario.insuranceClass renamed to productClass.
- Promo offers render inside matching scenario results when structured
  eligibility fits and structured rate tiers exist (offerScenarioResult,
  tested on the Scotia 60-day 3yr special at 4.19: badged, conditioned,
  countdown, announcement provenance); prose-only offers stay chips.
- Approvals sheet cards reworked for the 719-quote sitting: per-mechanism
  summary ranges (fixed printed ranges, floating discount ranges), cash
  back tier counts, discount-first quote rows, program notes expandable;
  the old min/max math would have crashed on null rates. Table view gained
  the type column and filter; compare tray and the client PDF carry rate
  type, labeled effective rates, mechanism lines (grade 6), cash back
  rows, verbatim program conditions, and a sources section with page,
  snippet, and extraction confidence; the PDF paginates and puts the
  licence line on every page.
- Directory renders number_links (17th granted table, learned call-triage
  numbers with Zoho links); CLAUDE.md dimension inventory refreshed from
  live (1150 rows; pending book carries 133 adjustable, 32 variable, 95
  cashback tiers across 21 lenders).
- Compliance module shipped. FOXCA migration 20260710120000 (+ table
  revokes): credentials, complaints, versioned policies with acks, and the
  append-only compliance_events trail, behind 13 narrow security-definer
  functions only (table select refuses 42501, verified live);
  lib/compliance.ts sole client; compliance.manage (admin) added to the
  authority matrix; routes under app/api/portal/admin/compliance record
  who-and-when on every change; nothing deletes. /portal/admin/compliance
  went from stub to dashboard + credential register (seeded FSRA licence /
  E&O / CE rows with confirm-date placeholders) + complaint and incident
  register (FSRA-shaped empty state) + policy library
  (read-and-acknowledge per version, suggestion-only empty state).
- Deal room gained the compliance card (posture computed by the pure
  tested rule from open compliance_gap flags and overdue
  solicitor/borrower_execution conditions; empty files read gaps
  unrecorded, never clear; the five uncaptured workbench fields stated
  honestly); Home rail gained credential renewals at 60/14 day thresholds
  (unit-tested). Deal conditions fetcher now carries category, kind, and
  precheck status.
- Suite at 98 tests (tests/compliance.test.ts and tests/rates-pdf.test.ts
  new; scenario tests grew the floating vocabulary). Workbench follow-up
  list for a future
  fox-underwriting session: suitability assessment, exit-strategy notes,
  identity-verification status, disclosure-delivered dates, package state;
  plus a penalty-methodology field on machine profiles (the compare tray
  lookup lights up when it lands).

### 2026-07-10 — Admin Command Center Session 5 (Rates v2, scenario-driven)
- Shipped the three-level scenario tool as the Rates landing (lib/scenario.ts
  pure model + components/admin/RatesScenario.tsx; Session 4 table behind the
  toggle): describe the deal (purpose, occupancy, insurance class, term,
  amount, property value with LTV computed and locked, amortization), lender
  cards lowest-rate-first with promo chips from the offers endpoint, lender
  drill-in cards with sheet dates, product detail rendering every stored
  column plus the approval provenance block (sheet review + decided date +
  audit entry link) and the knowledge cross-link (exact slug or published
  quote_slugs alias only).
- Dimension inventory recorded above from the live schema; sparse variant
  handling (LTV bands, rental markers, Mortgage Plus amortization markers)
  matches-all-with-note where data cannot rule out, proven in
  tests/scenario.test.ts (25 tests) including the cent anchors 2999.58 and
  2908.02 against lib/mortgage-engine.ts (already the shared library; no
  extraction needed).
- Compare tray pins up to three across lenders with payments and honest
  penalty lines (no profile documents a methodology yet; as-of dates shown).
  Client PDF at POST /api/portal/admin/rates/pdf: pdf-lib server-side,
  server re-fetches pins and recomputes payments, knowledge names through
  the forwarded browser-minted token, grade 6 disclaimer, licence line,
  rates-comparison-[date].pdf, download only, no send path.
- Deal room gains the read-only find-rates prefill button
  (scenarioParamsFromDeal; banner names the source file; nothing writes).
- Part 0: roadmap page brought current (Sessions 1 through 4 shipped with
  the hotfix and workbench micro-sessions as interstitial rows; Session 5 in
  progress; remainder renumbered 6 compliance, 7 revenue and partners,
  8 multi-user hardening, 9 PWA and polish). Micro-session 3 (quote_slugs
  aliases) had NOT run at build time, so the roadmap lists it pending and
  every cross-link degrades gracefully; the component and PDF route already
  consume the aliases the moment they publish.
- Standing policies recorded: the three-part closing ritual (ledger,
  changelog, roadmap) and the UI test automation discipline (test ids
  scoped to TEST-prefixed rows; no pointer or keyboard events on pages
  listing live records; decision testing on preview deploys with TEST
  seeds; otherwise unit test plus a manual step for Michael).
- Deps: pdf-lib added. New tests: tests/scenario.test.ts. Suite at 62.

### 2026-07-09 — Admin Command Center Session 4 (knowledge, rates, intel, opening fixes)
- Part 0 fixes: deal room sections rebuilt attempt-and-fallback over the 16-table
  surface (borrowers, income_calcs, ratio_calcs, documents fetchers; graceful only
  on a real 403); terminal-deal filtering on the Home rail and Approvals badges
  (isTerminalWorkbenchDeal; flags on closed files collapse below the queue, still
  decidable); conditions decisions in the deal room through the new gates
  conditions endpoint (satisfied/moot/waived, ConditionsPanel); form intake
  acknowledged path (FOXCA migration 20260710000000, admin-only ack route, panel
  counts unacknowledged only, light logic unit-tested); knowledge_bundled on the
  Gates status panel (amber at 0).
- Reference layer shipped: Rates (browser + digest strip with honest WoW +
  promo countdowns), Knowledge (index + lender pages, as-of discipline, stale
  flag unit-tested, draft and withheld handling), Intel (read-only feed with
  review outcomes), Changelog (config/changelog.ts platform notes + data-derived
  events, week-grouped), Directory (staff; lender contacts gap stated).
  Authority additions: conditions.decide, status.acknowledge; knowledge.view
  widened to all internal roles per the contract. Deps added: react-markdown,
  remark-gfm.
- Knowledge fetches happen in the browser (same azp posture as gates) through
  three read-only proxy routes; lib/gates.ts gained gateGet and stayed the only
  Gates API caller.
- Verification on production with Michael's real session: BRXM-F053724 deal room
  renders borrowers, calcs with provenance, and documents, plus its Zoho Funded
  stage from the backfill; rail counts moved overdue 33 to 0, flags 42 to 37,
  pending approvals 2 to 1 after terminal filtering; TEST condition
  a0c47fe9 (seed audit 93514fa0) decided moot through the UI (audit 3a4a16f0,
  status waived, note preserved) with the stale-tab repeat returning 409
  rendered as Already decided; the first authenticated knowledge fetch and
  first portal conditions decision closed micro-session 2's verification debt;
  the hotfix zoho_failed row acknowledged (recorded mfox@foxmortgage.ca,
  04:12Z) turning the form intake panel green with the triaged-history line.
  Test residuals: the TEST condition stays waived on the superseded
  TEST-PORTAL-S3-001 deal; nothing deleted. One unintended live decision
  during testing is disclosed in Known Issues (condition 21, BRXM-F053724)
  with its annotation audit entry and the arm-window fix that prevents
  recurrence.

### 2026-07-09 — Admin Command Center Session 3 (approvals live, deals, audit viewer)
- Part 0: lib/underwriting.ts swapped to the portal_readonly role
  (UW_SUPABASE_READONLY_KEY bearer + UW_SUPABASE_PUBLISHABLE_KEY apikey, both live in
  Vercel all targets); granted 12-table surface enumerated live and recorded above;
  UW_SUPABASE_SERVICE_ROLE_KEY DELETED from the Vercel project after preview and
  production verification; GATES_API_URL added (all targets, encrypted, via REST).
- Shipped: lib/gates.ts (sole Gates API caller, error-mapping unit tests),
  lib/gates-token.ts (browser mint; backend-minted template tokens carry no azp and
  the API refuses them, a live-verified contract correction for docs/gates-api.md),
  four gate proxy routes behind the authority matrix, the approvals desk (four live
  queues, two-tap confirms, optimistic updates with reconcile refetch, 409 handling),
  deals list with Zoho stage join, deal room with provenance-visible statement
  evidence and graceful not-granted sections, audit viewer with filters, server
  pagination, capped CSV export, and Status panels for the Gates API and form intake
  capture (form_submission_stats security-definer function on the FOXCA project).
- Part 6 test cycle on production with Michael's real session against TEST-PORTAL
  seeds (deal 568b0f48, doc bc44816d, intel b1fd6b91): statement hold, approve with
  note (2 promoted, 1 anomalous held, discrepancy flag auto-resolved), reject; sheet
  approve; flag accept with note; stale-tab double-dispose returned 409 rendered as
  "Already decided" with refetch (gates log: same flag 200 then 409); shadow
  checklist agree, income disagree with note, shortlist agree on the mobile layout.
  All portal audit entries carry actor_clerk_id + actor_email. Test rows superseded
  per convention (statuses superseded/ignored), never deleted; seed and supersede
  audit entries retained (portal.s3_test_seed 6c023054, portal.s3_test_supersede).
- Found for fox-underwriting: shadow ratios dimension 500s on a deal with no
  ratio_calcs (see Known Issues); docs/gates-api.md needs the browser-mint note.

### 2026-07-09 — Admin Command Center Session 1 (foundation)
- Shipped: repo audit (docs/portal-audit-2026-07.md), 14-section admin nav with its
  own responsive shell, exception-first Home (Needs Attention rail, pipeline by stage,
  tasks due, goal pacing, rates tile, closings strip), Status page (workbench / Zoho /
  n8n / bookkeeping / deploy), authority matrix (config/authority.ts + can()),
  read-only workbench wiring (lib/underwriting.ts), Settings matrix view, Roadmap
  page, styled stubs for Deals/Approvals/Rates/Intel/Knowledge/Compliance/Revenue/
  Audit with session tags. Approvals stub shows live pending counts.
- Guardrails held: no workbench writes (select-only wrapper), no new Zoho writes,
  partner portals and bookkeeping pages untouched (one early-return added to
  PortalLayoutClient for /portal/admin paths only), middleware publicRoutes untouched,
  @clerk/nextjs unchanged.
- Infra: N8N_API_URL + N8N_API_KEY added to Vercel (REST API, encrypted). vitest added
  as the test runner (npm test). BUILD_TIME baked via next.config.js.
- Resolved during audit: Deals vs Potentials (same module; Deals canonical),
  funded-volume field (Amount), funded-stage duality (Funded + Mortgage Funded),
  investor crash confirmed fixed, ZOHO_REFRESH_TOKEN confirmed NOT rotated.
- New findings logged, not fixed: bookkeeping nightly errored 2026-07-09 02:00
  Toronto; six partner webhook env vars missing from Vercel; three console.log stub
  APIs losing submissions; Daily Deal Briefing workflow inactive.
- Next: Session 2 in fox-underwriting (gates API + read-only DB role). Its CLAUDE.md
  records the amended guardrail 8: dependency points one direction only
  (foxmortgage-ca depends on fox-underwriting, never the reverse).

### 2026-07-09 — Hotfix: public forms were dropping submissions
- Fixed the three console.log stub endpoints (contact, investor-inquiry,
  portal/add-referral) with the persist-first form intake pipeline (see the
  Form Intake Pipeline section): Supabase capture first, then Zoho Lead, then
  Resend email to Michael, then an honest response. Honeypot + validation on
  the public pair; handler-enforced partner auth and attribution on the
  referral endpoint. Front ends now show errors instead of false success.
- Infra: created the foxmortgage-ca Supabase project (skfeivzhqvrefnkqjwtj,
  us-east-1, $10/month) with the form_submissions table and the
  mark_form_submission security-definer function. Added FOXCA_SUPABASE_URL
  and FOXCA_SUPABASE_KEY to Vercel (REST API, encrypted, all targets).
- Verified end to end: live test submissions on all three endpoints (rows +
  Zoho leads + Resend ids), a simulated Zoho outage (row zoho_failed, email
  still sent, 200 because the row exists), and a total-outage test (503, no
  false success). Test leads in Zoho are marked TEST, safe to delete.
- New finding logged: the FP referral webhook writes FP_* fields that do not
  exist on Leads; Zoho drops them silently (see Known Issues).
