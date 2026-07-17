# foxmortgage.ca — Claude Code Build Context

## Last Updated: July 14, 2026, ninth session (COMMAND CENTRE SHELL REDESIGN, PHASE A — calm machine, loud exceptions: the admin shell is rebuilt around ONE RULE, lime (`decision` token #C6F53F) renders only where a human decision is queued (nav dots, decision badges, the Waiting-on-you Desk strip, decision-card primary actions, plus the brief-sanctioned dark focus ring) — enforced by tests/shell.test.ts. Sixteen flat nav items became FIVE GROUPS (Pipeline/Market/Practice/System + Today) with Ask Fox as the persistent sidebar footer; renames per the nav-IA rule: Home→Today, Intel→Lender intel, Audit Log→Audit log, Settings→Users & settings. THE DESK: lib/desk.ts computes decision counts from the OWNING pages' own loaders (getApprovalsData actionable queues; appearsRenewedPending extracted into lib/renewals.ts and shared by the Renewals page + desk; the board's review bucket), rendered as the navy Waiting-on-you strip on Home (proud empty state) + sidebar badges/dots via GET /api/portal/admin/desk. Home above the fold: Fraunces greeting (the one serif moment; Archivo is the shell face — both OFL, vendored via fontsource), Desk strip, three decision cards, compact pipeline table with plain-words next steps (lib/desk nextStepForStage). BELL COUNTS DECISIONS: Decide/Watch/Log lanes (lib/notifications NOTIFICATION_LANES); the route auto-marks-read stale Decide items whose signal is gone — live 63→1. Palette + Ask Fox merged (⌘K "Or ask" row → agent?q=…). Agent-only roles see Today/Pipeline/Market/Ask Fox (presentation scoping, server authz untouched — verified live). Collapsible 68px rail persisted per user. FINDINGS: the companion mockup file is NOT on this machine (built from the brief's written spec); the IA table missed Roadmap (→System) + the portals block (kept, own section); manual matches have NO passive source (fragment exists, null until a scan result persists — backlogged); the OLD shell's active-nav bg-lime was itself a rule violation, gone. Phase A only: every page interior renders unchanged inside the new shell (route-inventory test = the nothing-removed proof). See the 2026-07-14 shell ledger entry. The stage-guard addendum + eighth session follow.)

### 2026-07-17 note — B4: the name sweep and the token sweep
THE PII EXCEPTION IS ENDED (the rewritten standing rule sits in the PII DISCIPLINE block below): real personal names are out of the repo TIP — 64 harvested name tokens (incl. a previously-unrecorded investor worked example in lib/investor-calc.ts, the full open-book fixture in tests/pipeline-hygiene.test.ts, and SEVEN committed CSV fixture surnames verified locally, counts only, as derivations of real export surnames) now zero-hit repo-wide outside three documented carve-outs: the /smm consented testimonials; app/page.tsx's two testimonial names FLAGGED for Michael (real = same carve-out, placeholder = fabricated reviews to remove); and the live FP-handoff webhook slug documented verbatim only in docs/integrations/finmo-fp-handoff-field-map.md (file RENAMED off the partner's name). Git HISTORY still carries pre-B4 names — private repo or history rewrite stays Michael's open decision. FINDING with teeth: .qbo-history/ was documented as gitignored but never was — .gitignore now actually covers it, the raw QBO export pattern, Terminal Saved Output.txt, worktrees, supabase/.temp, Lender Logos/, knowledge/. TOKEN SWEEP: legacy lime is EXTINCT in admin scope — the ONLY lime is the `decision` token on queued human decisions; three conversions joined the allowed set (ApprovalsDesk armed decide buttons, AgentChat confirm-card execute, DealsList single-lime — the brief's "approval-pending chips stay" case was VACUOUS, those indicators were already amber), ~132 lime sites ruled individually (full table in the report): hovers→ink, action buttons→navy, healthy/approved states→StatusChip green, Revenue/PracticeHistory projection hatch + milestones→PROJECTION_GRAY #7E8E97 beside solid navy, DemoBanner/Toggle→caution (mode loudness without lime), PracticeHistorySlide keeps the brand hex as the ONE enumerated brand-mark exception (client-facing export mark, like the PDFs). Mechanically: 1,174 gray→cool, 42 slate→cool, 821 font-body→font-ui, accent hexes→accent-navy across 68 files; the six SVG fontFamily attrs + two SVG NAVY consts are functional and stay. DS ADOPTION on every remaining surface (Today below the fold, Approvals, Partners, Compliance, the ten System pages, Ask Fox chrome, the room cards) via four parallel agents on disjoint file sets, every diff integration-reviewed: StatusChip delegations (~60 chip sites), the card/type/hairline/tabular contract, real-`<table>` pages take the contract classes in place (the div-grid TABLE_* constants' rhythm doesn't fit), client-state tab bars (Approvals, Compliance) restyled to the TabBar LOOK with buttons + handlers byte-identical — behavior outranks component reuse. THE AUDIT IS EXHAUSTIVE (tests/shell.test.ts): walks every admin .ts/.tsx, zero lime classes + zero lime-family hex (#95D600/#AAE620/#7AB800/#C6F53F) outside the slide, decision token ONLY in eight enumerated surfaces each restricted to its role regex; the B2b deals-surface audit speaks the same vocabulary. ORPHANS: ConditionsPanel + StubPage have zero consumers (demoted in place; B5 deletes). 634 tests. See the 2026-07-17 B4 ledger entry + docs/token-sweep-b4-2026-07-17.md.

### Prior note — B3: one design system, a lifecycle-shaped menu
NAV-IA RESHAPE (renames recorded here per the standing rule): the working nav is EIGHT destinations across two honest groups — **Today · The book (Deals, Approvals, Beyond funding) · The practice (Lenders, Revenue, Partners, Compliance)** — plus System (Directory moved into it; otherwise untouched) and Ask Fox pinned. Group keys `pipeline`/`market` → `book`/`practice`. THREE MERGES, engines REPARENTED never rebuilt (git mv → components/admin/{lenders,beyond,revenue}/*Tab.tsx, self-fetching, own requirePermission intact): **/portal/admin/lenders** (?tab=rates|intel|knowledge; strip = approved quotes / lenders in book / pending claims; the rates engine's inner ?tab values are DISJOINT so both layers compose — verified live), **/portal/admin/beyond** (?tab=renewals|opportunities; strip = action/lapsed/watching windows + act-now/review buckets from the same loaders, desk-pattern; the nav badge SUMS the two: verified 3+15=18), and Revenue gains ?tab=bookkeeping (the landing reparented + restyled; /portal/bookkeeping subpages keep their routes + legacy shell). SEVEN 308 REDIRECTS verified live with exact Locations (next.config.js; query params MERGE and the destination's tab wins — scenario deep links survive; an old rates?tab=promos bookmark lands on the Rates tab default). Every in-app link moved to the direct destination (Desk fragments, notifications, Today, funded rows, find-rates, engine cross-links); the manifest Deals shortcut now points at /underwriting directly. DESIGN SYSTEM EXTRACTED to components/admin/ds/ (SummaryStrip, NavyBar, StatusChip, TabBar, table constants — byte-identical classes); Deals list/board/room re-mounted, census live-identical (same 7 rooms, zero fallbacks). LIME: the three flagged demotions landed (ClientConstraints chip + arm control, the roadmap markers); merged pages add zero (audit list extended); the rates-engine internals + Revenue est-chips/chart bars + Home hovers are B4's token sweep. Archivo npm dep REMOVED. Task 0 (own commit f514fa1): the deal-name parsing comments' real-client example → the design cast, in BOTH lib/deals-surface.ts and lib/underwriting-bridge.ts; the wider pre-existing name inventory (test fixtures, changelog, call-rubric, AgentChat copy) stays under the standing PII exception, flagged for Michael in the report. 633 tests. See the 2026-07-17 B3 ledger entry + docs/consistency-b3-2026-07-17.md.

### Prior note — B2b: the Deals surface, Direction 2 (list-first, single lime, phase-led room)
NAV-IA RENAME: **Underwriting → Deals** (the word Underwriting now means only the lifecycle phase; route paths unchanged). The page is LIST-FIRST (lib/deals-surface.ts is the pure model both views share over the SAME B2a position source — census live-verified identical, B2b moved nothing): phase spine, closing-date order, next actions from the ONE step→action mapping in config/lifecycle.ts (`nextActionForJourney`), and THE SINGLE-LIME RULE (exactly one lime button, top-most actionable row, mechanical + tested); the board is a per-user toggle (four phase columns, navy headers, the two dashed planned placeholders in Intake). The deal room is PHASE-LED: navy header band (client name via the new read-only `getDealCloseout`), the stepper restyled to Direction 2 nodes, current phase open first, other phases collapsed `<details>` rows, existing surfaces REPARENTED (Documents+notes → Underwriting, conditions desk → Fulfilment; anchors #documents/#notes/#conditions/#closeout survive and hash-open their section). Complete & paid steps are now **Broker complete → Compliance package → Paid**: the compliance card reads Zoho `Compliance_Status` READ-ONLY (live picklist is richer than briefed: Pending Review/In Review/Approved/Rejected/Re-Review Needed — all mapped, rejected loops back amber), Paid reads the Total_Commission actual (>0), and the workbench package checker is a named gray placeholder. `font-ui` → Montserrat, headings/labels → font-heading (Poppins), Archivo retired (dependency still in package.json, unused); `cool.50–800` neutral scale added. LenderNotesCard's Generate/Regenerate demoted to outline ink (lime in a room = queued decisions only; ClientConstraints' two pre-existing limes flagged for B3, not touched). ServiceWorkerRegister gained the new-version toast (pure detection in lib/sw-update.ts, never auto-reloads). RoomSectionNav + the room's Overview section removed (superseded by the phase-led layout). 631 tests. See the 2026-07-17 ledger entry + docs/deals-b2b-2026-07-17.md.

### Prior note — the pipeline surfaces speak the lifecycle (B1, 2026-07-16)
`config/lifecycle.ts` is the ONE canonical lifecycle (Intake / Underwriting / Fulfilment / Complete & paid / Beyond funding). The Underwriting board renders its SEVEN unchanged columns under four phase headers with relabelled columns (KEYS stable; evidence -> "Documents & review", packaging -> "Package & submit", with_lender -> "With the lender", conditions -> "Conditions"); the Today compact pipeline groups by the same phases (loud amber "Phase not mapped" trailing group, never forced in); every deal-room header mounts `components/admin/JourneyStepper.tsx` (deal-shape-aware BRX-deck steps, live/manual/planned marked with notes, funded = Beyond funding, calm ink never lime). Display-stage phases derive from PIPELINE_STAGE_ORDER positions; board columns map via phaseForBoardColumn; the two stage spaces collide on 'submitted' so journeyForStage takes an explicit space. LIVE FINDING: reads return 'Ready To Close' VERBATIM on one file (the display/actual note said that actual displays 'Broker Complete') — phase-mapped to complete_paid; STAGE_WEIGHTS deliberately untouched, so its weight-unmapped amber stands until mapped in config/pipeline.ts. (RESOLVED same day by B2a: Outcome B — the picklist pair is UNCHANGED; reads normalize through config/pipeline.ts normalizeDisplayStage and the amber is cleared with zero weight edits. See the B2a ledger entry.) Phase A's "every page interior renders unchanged" now carries this one exception set: the board, the Today pipeline card, and the deal-room header speak the lifecycle. See the 2026-07-16 B1 ledger entry.

### Prior: eighth session + STAGE-GUARD ADDENDUM (same night — the load-bearing finding: the Deals Stage picklist carries a DISPLAY/ACTUAL indirection and Zoho READS return DISPLAY values while WRITES take ACTUAL values (verified live: actual 'Underwritting In Progress' double-t displays single-t; actual 'Application Sent To Lender' displays 'Conditionally Approved'; actual 'Application Pending' displays 'Application Started'; actual 'Ready To Close' displays 'Broker Complete'; actual 'Mortgage Closed' displays 'Mortgage Funded') — so the sync's stage guard was comparing display-space reads against an actual-space STAGE_ORDER and only ever matched where the two coincide. FIXED in Finmo Sync v2 (published 5fd50c60): STAGE_ORDER covers all 13 hand-settable stages in ACTUAL space funnel-ordered by picklist probability, reads canonicalize through STAGE_READ_ALIASES, an unknown non-null current stage is PRESERVED loudly (never overwritten — the old guard overwrote unknowns), the COQL-confirm path re-runs the guard (it wrote Stage unguarded when the search index lagged), and the create path names deals '{fileRef} — {primary borrower}' (isMainBorrower, else earliest-created; bare ref when none) matching the book convention. REPORT-ONLY finding: NOTHING renames deals post-creation — the marketplace extension births them named, Michael hand-renamed the F059751 deal tonight (timeline: crm_ui 22:03, no automation). Portal: 'Submitted' weighted 0.15 + 'Conditions Fulfilled' 0.75 in STAGE_WEIGHTS, PIPELINE_STAGE_ORDER rebuilt as the true 13-stage funnel (display space — the brief's 'key on actual values' is inverted, reads speak display), and unmapped active stages render a loud amber flag on Home + Revenue (lib/pacing unmappedPipelineStages) never a silent zero bucket. Live: the F059751 file's $359,000 rides the weighted forecast at $53,850, unmapped list empty. See the stage-guard ledger entry. The eighth-session header follows.)

### Eighth session header (FINMO SYNC V2 HARDENED — n8n Cloud only, ZERO repo code changes beyond this file: Finmo Sync v2 (IFDRp2BGHAbzKpHH) gained an error workflow (BeRBcxNv1bQjx5v8, Error Trigger → Resend email to Michael — verified by 13 REAL firings during the replay, not synthetics), a 12h heartbeat dead-man check (9c6IUbuqA4GIIsQw: alerts when the sync is DEACTIVATED or has zero executions in a labeled 24h WINDOW_HOURS — 72h PROPOSED, not silently widened, because retained history shows healthy 2+ day quiet stretches), an early out-of-scope 200 for document events BEFORE the heavy Library path (the 2026-07-08 burst mechanism: ten concurrent documentRequest events each ran Library/hash/idempotency before their 200; signature verification stays upstream — pin-data verified, Library never ran), and an H13 deal-not-found email that names the ACTUAL event type + the Finmo file ref and carries a one-command per-application backfill repair whose token is PROMPTED at run time, never embedded. FINDINGS: the brief's referenced spec + token files are NOT on this machine (the token's single source of truth is the workflow's own Verify Backfill Token node + 1Password); the backfill is a thin PER-APPLICATION trigger, not a date-range replay, and as built could never repair a missed CREATE (fixed: syncSource==='backfill' now exempts the deal-not-found HITL routing and creates with the full payload); TWO PRE-EXISTING DEFECTS fixed live — Apply COQL Result rebuilt context from the COQL HTTP response, so on the known OAUTH_SCOPE_MISMATCH it obliterated context and PUT to /Deals/undefined, and Build Junction Payload hard-referenced the skippable module-cache node (referencing an unexecuted node THROWS), killing every warm-cache borrower sync. GAP REPLAYED (2026-07-08T13:00Z→now): BRXM-F059751 CREATED in Zoho (7112178000006038003, Finmo_Application_UUID d4e2494a — the named acceptance, COQL-verified), BRXM-F057400 + BRXM-F053725 recovered missed Conditionally Approved → APPROVED transitions, BRXM-F025547 partial (unmapped Finmo Payoff_Status, H16 emailed), BRXM-F050350 clean; FIVE open files un-fetchable on Finmo 403 Forbidden (BRXM-F056361, BRXM-F053107, BRXM-F054033, BRXM-F054420, BRXM-F057623 — realtime fails identically; Michael's hand-reconcile list). Inventory: 41 active workflows, 39 with NO error workflow (reported, not attached, per the brief). See the 2026-07-13/14 ledger entry. The prior seventh-session header follows.)

### Prior header: seventh session (RATES GRID REGRESSION — THE 1,000-ROW CAP: Supabase PostgREST caps EVERY response at 1,000 rows regardless of the limit param; when the approved+superseded book hit 1,765 rows the as_of_date-ordered getRateQuotesFull silently dropped whole lenders off the tail — 11 live cards, 24 false coverage chips, and the Opportunities board quietly down to 1 act_now from 3. NOT a commit (diff-proven; the suspected aa3c1ea touched zero rates surfaces). FIX: uwSelectAll offset pagination (id.asc tiebreak, whole-read failure on any page, loud 20k backstop) across all 13 large-limit fetchers + full-history getIntelItems; coverage pending REDEFINED (only a lender whose NEWEST rates-class item is extraction_failed/no_pipeline, chip names the failing sheet; approved lenders never chip; live cards get a newer-sheet-needs-attention badge instead of demotion); province-excluded lenders' sheets PARK out of the approvals queue onto an auto-releasing shelf (lib/sheet-park.ts — presentation-layer, stated deviation: no gates hold action exists); null-slug rates sheets surface on the Lenders tab (tonight's was Alterna Savings, b1cfd0c1 — workbench follow-up to add the slug). Live after: 22 cards / 6 chips / book 1,257 across 25. See the late-2026-07-13 ledger entry. Sixth session, TASK 0 + PART 2 — TERM POLICY, GRADUATION CLASS, THE LAPSED POOL, AND THE CLIENT REPORT REBUILT: every comparable carries its TERM beside its rate on every surface and in savings_analysis_log (calc_version 3; inputs gained termMonths + shortTermApplied; figures gained breakEvenPenalty, the samePaymentPlan trio, and the horizon-end positions; replay reproduces exactly); the DEFAULT comparable must COVER the comparison horizon (refinance = months left on the current term; switch = the client's OWN term, else 60) or the projection SHORTENS to the quote's term — a short rate is never projected past its term, and a deliberately short-term play is a flagged strategy (labelled, reasoned, logged as quotes role short_term_flag) taking Michael's two-tap stp=approve on the PDF route, NEVER an automatic act_now (demoted to marginal unapproved); GRADUATION prices CONVENTIONAL only (b targets book b_side) — a move to better paper never inherits an insurance class (the Part 1 leak: a switch-basis B file ported 'Insurable' into the graduation target and quoted the insurable 4.29; the flag now prices conventional, live 4.39 3-yr, and the B file's act_now STANDS on term-consistent grounds — the feed says the client is on a 12-MONTH term, so the 4.69 12-month quote genuinely covers their like-for-like horizon); the RENEWAL POOL is funded-stage deals only AND excludes Additional-Property child rows by NAME (config/pipeline isRenewalPoolDeal/isAdditionalPropertyRecord — the org's property rows are one mis-stage away from any stage-filtered pool; two children of lost BRXM-F021892 carry amounts + past maturities today) — LIVE FINDING, stated against the brief's expectation: the three extra 2023 lapsed rows (IFMS-F011671/F002599/F007027, exactly the $1,725,000 difference) are NOT Additional-Properties children — verified record-by-record they are funded-STAGE prior-term private-lending rows whose stories continued elsewhere (F011671 renewed as F012754, the property's BRX file then Mortgage Lost; F002599 renewed as F021782; F007027's BRX file is Archive), so the pool stays 18/$11,004,023 until Michael records their outcomes through the radar's own enumerated actions (residual after appears-renewed suppression 12/$5,204,023; after resolving the three, pool 15/$9,279,023 → true residual 10/$4,479,023 — F002599 is both a phantom AND appears-renewed-flagged); PART 2 SHIPPED: lib/savings-pdf.ts is the three-page choice document (masthead, option cards "$X a month back" / "N yrs sooner" with paymentsAvoided, the no-lender-name rate strip carrying term + sheet date, drawn amortization bars, the side-by-side table at the horizon end from FoxAnalysis.comparison, the penalty MINIMUM + break-even GAUGE, conditional next-step cards in place of ANY fixed-break verdict — and the min-exceeds-break-even shape states does-not-clear-the-bar; stay_put ALWAYS gets the one-page wait document whatever small saving exists; review/insufficient/province-pending state no figure; unapproved cross-family/graduation/short-term escalations NEVER print) rendered ONLY through savingsPdfInputFromAnalysis, the one mapper the route AND the golden tests share; FoxAnalysis gained shortTermStrategy/shortTermRecommended/samePaymentPlan/comparison; fonts are the brief-sanctioned Helvetica + Times-Bold fallback (no OFL TTFs vendored; swap the embed lines when Archivo/Fraunces land). See the 2026-07-13 Task 0 + Part 2 ledger entry. The prior fifth-session header follows; its "Part 2 NOT started" claim is superseded.)

### Prior header: fifth session (TIERS + APPEARS-RENEWED + OVERRIDES, Part 1 of the two-part brief: every lender carries a paper grade (a/b/private; registry-seeded unconfirmed, program-level overrides, explicit feed-string map failing closed to unknown) and comparables are SAME-TIER only — B prices the b_side book (live finding: all approved B quotes are class b_side), private is honest-insufficient, unknown tier or a rate contradicting the map routes to review, and GRADUATION to better paper is a figure-less flag unless Michael's two-tap grad=approve prices it; the radar + board suppress APPEARS_RENEWED files (feed start > Closing_Date+90d, or lender/rate contradictions; live: 5 of 8 action files, 6 of 18 lapsed) pending confirm ('Renewed With Us', exactly one field, NEW picklist value + resolved status) or a persisted reasoned decline; Michael can OVERRIDE any comparable (eligible book pick validated by construction or a desk rate with mandatory source note + reason, POST-only, badged on card + PDF, on the savings log); savings_analysis_log is append-only BY TRIGGER (privileged UPDATE/DELETE refused, proven live) and $1 placeholders route to review + never propose backfills. See the Part 1 ledger entry. Fourth session, FINAL CORRECTNESS PASS, Tasks 5-8: the savings PDF states 3MI as a MINIMUM with the break-even penalty and draws NO positive net-benefit conclusion on ANY fixed-rate break — adversarial review forced the strengthening past the brief: a documented IRD method still yields no figure, so method-known only changes the confirm path; the comparable is LIKE-FOR-LIKE by rate family (fixed→fixed, adjustable and variable never collapsed; the cheaper cross-family option is a labelled alternative with a quantified risk line; headline-ing it takes a two-tap manage-gated ?alt=approve recorded on the log); floating ranks on the EFFECTIVE rate from the per-lender prime everywhere (variance is display — convention corrected in fox-underwriting §3 + gates-api.md); savings_analysis_log (FOXCA 20260713150000, append-only, functions-only, verified 42501) records every board render + client PDF with calc_version 2 + canonical inputs_hash and REPLAYS exactly; approved book live-verified 947 across 23 lenders. See the 2026-07-13 final-pass ledger entry. Third session, BACKFILL SHARED-IDENTITY FIX: decideMatch now resolves a (contact, mortgage) PAIR — an identity signal shared by 2+ export mortgages yields the new 'shared_identity' bucket, the contact's deals attribute by property address then amount via attributeDeals, contested deals are NEVER proposed into and land on a per-contact needs-manual-match card, and the apply route accepts Michael's explicit manualMatch pick only for contested deals, audited as 'ok (manual match)'. Live: 6 shared groups / 13 of 41 mortgages. See the 2026-07-13 backfill ledger entry. Second session, SMM PAYMENT CORRECTION: the Opportunities stated current payment now reconstructs the ORIGINAL schedule — payment(original amount, rate, original amortization), never a re-amortized current balance, which understated every seasoned mortgage's payment; monthsElapsed + remainingAmortizationMonths now ride FoxAnalysis and the comparison prices over the months actually left; a NEW reconciliation gate models the balance forward from origination and >0.5% drift blocks the file into the new 'review' board bucket with both figures + drift shown — a blocked file states NO figure anywhere, savings PDF included. Details in the 2026-07-13 SMM ledger entry. Earlier the same day, MIRROR 1 COLLAPSED: the eligibility backfill RAN in the workbench (verified live 2026-07-13: 947/949 approved rows carried eligibility_source; the only nulls were the 5 test-portal artifacts, 2 approved + 3 superseded — those 2 were themselves superseded later the same day, so the approved book is 947 across 23 lenders, every row classified), so the portal-side deriveEligibility/baseStem port was DELETED per guardrail 1 (deterministic code calculates in one place — the classifier lives ONLY in fox-underwriting src/skills/extract/eligibility.ts). lib/eligibility.ts evaluateQuote now reads the five rate_quotes columns (borrower_requirement/client_commitment/channel_requirement/transaction_types/eligibility_unknown) verbatim through portal_readonly. FAIL-CLOSED, two conditions: eligibility_unknown=true OR eligibility_source IS NULL → program_restricted with the 'unclassified' code, excluded from default ranking, revealable under show-restricted, and NEVER on a client document — not even pinned (includedInClientDoc hard-blocks undisclosedRestriction; a restriction nobody can name cannot be confirmed). A null source is what an unclassified row fresh from Roam looks like. tests/eligibility.test.ts is rewritten: golden = portal verdicts match the workbench columns (fixtures shaped like live rows), a module-absence proof (no deriveEligibility/baseStem/effectiveEligibility export), and a surface sweep asserting a null-source quote is excluded from scenario/Ask Fox (matchQuote), lender-browse (lenderCards), Opportunities+savings PDF (analyzeMortgage comparable), Renewals (bestApprovedFixed), and client docs (includedInClientDoc, pin included). Live parity proven: the fixture re-run under column-truth reproduces the derivation-era buckets exactly (marginal 14 / stay_put 13 / insufficient 6 / act_now 8; the proving client still First National conventional adjustable P−0.50/3.95%). THREE MIRRORS REMAIN (plan recorded in the 2026-07-13 ledger entry; do not re-port them): config/lender-provinces.ts (mirrors knowledge/lender-registry.json), config/prime.ts (mirrors knowledge/prime.json), lib/mortgage-engine.ts (parallel to fox-underwriting/src/calc). The prior session header below is retained for context; its backfill claim is superseded by this note.

### Prior header: Lender eligibility + client constraints shipped. THE LIVE BUG: Kootenay Savings and Coast Capital are BC credit unions (lender-registry.json provinces=['BC']) that cannot do an Ontario deal; Kootenay held the deepest floating discount and led nearly every floating scenario, proposed as a real client's best comparable. FIX — a new lib/eligibility.ts is the single gate for province + program eligibility: resolveProvince (config/lender-provinces.ts server mirror of the workbench registry; live registry overrides on token surfaces; fail-closed — ineligible excluded everywhere, unknown shown flagged internally but EXCLUDED from client docs), deriveEligibility (EXACT port of fox-underwriting src/skills/extract/eligibility.ts, golden-test parity — the workbench 0032 columns EXIST but the backfill NEVER RAN, 949 approved rows all null, so the portal derives from variant+programNotes and prefers the columns via eligibilitySource when populated), channelHeld (HELD_CHANNELS: unionlink only, Michael-confirmed), evaluateQuote → {category: eligible|province_ineligible|province_unknown|channel_unavailable|transaction_mismatch|program_restricted}, includedInRanking/includedInClientDoc. lib/scenario.ts matchQuote=structuralMatch+eligibility gate (attaches verdict), scenarioExclusions for the "N excluded" notes, Scenario gained subjectProvince/borrowerProfiles/commitments/showRestricted (URL params prov/bp/cc/restricted). Wired into: scenario (RatesScenario qualifier toggles + exclusion notes + show-restricted + province flags + requirement sentences), lib/lender-browse.ts (BC + restricted excluded), Ask Fox search_rates (eligible-only, prompt v3 never-quote-unconfirmed), lib/renewals.ts bestApprovedFixed (BC/restricted excluded; switch=no-penalty already correct; insurance-class port has NO Zoho source = documented gap), both client PDFs (savings + rates: withhold province-unknown/ineligible/restricted; rates PDF gates OFFER pins too). PART 1c: transaction from maturity proximity (>120d refinance→conventional+80% LTV hard cap+requalification+penalty; ≤120d switch→original class+no penalty), analyzeMortgage/bestEligibleComparable (fixed+floating via config/prime.ts mirror, SANE_RATE_FLOOR guards a bad variance); re-ran the export: 20/41 opportunities changed bucket; The client corrected to First National conventional adjustable P−0.50/3.95% (was the Kootenay fantasy). CONSTRAINTS (Parts 2/3/4): lib/constraints.ts (excluded/required/preferred, reason required, retire-not-delete, applyConstraints never overrides eligibility → required-but-ineligible = honest empty state), lib/constraint-cost.ts (computeCostOfConstraint/dealConstraintCost via the shared engine), FOXCA migration 20260712160000 (client_constraints + pin_confirmations, RLS+functions-only, applied+round-trip-verified live), routes under /api/portal/admin/constraints (constraints.manage, demo-refused), ClientConstraints editor in the deal room, ComplianceCard documentedSuitability (a constraint with a reason AND a real cost counts as documented suitability). Adversarial review run; fixed the client-PDF offer province leak, the floating negative-rate guard, the compliance zero-cost inflation, the constraint-cost term mismatch. 360 tests, build green. DEFERRED/REPORTED: the workbench eligibility backfill (portal derives meanwhile); provinces confirmed for only the 2 BC lenders so client PDFs withhold every comparison until Michael confirms provinces in fox-underwriting/knowledge/lender-registry.json (the visible count drives it); the live cost-of-constraint readout + manual toggle on the scenario board; constraint application to the rates surface/PDF. Opportunities engine (below) preceded this.

### Prior header: Opportunities — the Strategic Mortgage Monitoring engine shipped. A new /portal/admin/opportunities section turns Michael's monthly SMM CSV export into a call pipeline: persist-first upload to FOXCA (smm_uploads/smm_rows before any parse), parsing with a tested sign convention (dash → null, never zero), $1 placeholder detection, co-borrower collapse, and lender normalization (config/smm-lender-aliases.ts). Fox's own analysis sits beside the service's figure — best gate-approved comparable with sheet date, payment delta from the shared engine, honest penalty framing (3MI floating; IRD-vs-3MI fixed with per-lender method or the gap), break-even, net benefit — bucketed act_now/marginal/stay_put/insufficient by dollars; a low rate near maturity is told to WAIT, never sold a switch. Backfill matches to Zoho (email>phone>name) and fills only EMPTY Maturity_Date/Mortgage_Rate via the confirmed-action apply route (values recomputed server-side, never trusted from the client; new FOXCA smm_backfill_events audit; Lender_Name excluded — it's a lookup). A savings-analysis PDF reuses the rates-PDF generator's redactComp/pdfSafe (compensation scrubbed from every line, wait-for-maturity framing). Renewals gained lapsed reconciliation against the export (still-with-lender/lender-changed/unmonitored + retention signal); Home gained an act-now rail line. Verified live: 41 mortgages from 49 rows, 1 placeholder, 0 parse failures, 0 unmapped lenders; the 1.99% RFA file IFMS-F001515 (maturity 2026-10-01) correctly told to wait, with maturity + rate proposed as backfills. The Renewal Radar and Pipeline truth (below) preceded this.

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

## Session Ledger

### 2026-07-17 — B4: the name sweep and the token sweep
- TASK 1 FIRST (own commit 3c0a08f): the name sweep. The harvest grew from the B3 report's four known sites to 64 name tokens across 21 tracked files — new finds: the lib/investor-calc.ts investor worked examples (a name no prior inventory recorded), tests/pipeline-hygiene.test.ts carrying the FULL live open book with first+last names (fifteen more people), renewal/match fixtures, and the integrations doc whose FILENAME carried the FP partner’s name (git mv → docs/integrations/finmo-fp-handoff-field-map.md). Substitutions per the brief: "REF — Name" → ref alone; prose names → file refs; fixtures → the synthetic cast, stable per file (underwriting-bridge's surname VARIABLES renamed deliberately; pipeline-hygiene needed fourteen distinct people vs the eight-name cast, so the six stale-pool ghosts take neutral inventions — stated deviation). SEVEN committed CSV fixture surnames proved to be suffix-derivations of real export surnames (checked locally against ~/fox-local/SMM, counts only) and were re-cast with their emails; two tainted first names too. Functional names adapted deliberately: the find_client short-form retry now speaks "Jo Wells"/"Jordan Wells"; search ranking + name-index fixtures re-cast with assertions updated. Emails: the investor partner's personal gmail removed (ids stay; identity lives in Clerk/Zoho); the firm address stays (company). ACCEPTANCE: repo-wide case-insensitive word-boundary scan on all 64 tokens = zero hits in tracked files outside three carve-outs — /smm consented testimonials, app/page.tsx's two testimonial names (provenance unknown: FLAGGED, not swept — real = carve-out, placeholder = fake reviews to remove), and the live webhook slug in the renamed integrations doc. REALITY NOTE, verbatim honesty: this cleans the TIP; git history still contains the names — private repo or history rewrite, Michael's open decision, recorded in the rewritten rule. SIDE FINDING with teeth: .qbo-history/ (raw 5-year QBO export) was documented gitignored but NEVER was — a broad git add briefly staged it mid-session before an immediate reset; .gitignore now actually covers it + the export pattern + Terminal Saved Output.txt + .claude/worktrees/ + supabase/.temp/ + Lender Logos/ + knowledge/.
- THE LIME CLASSIFICATION (~132 sites across 38 files, every ruling in the report): legacy lime is EXTINCT. CONVERTED to the decision token (queued human decisions): ApprovalsDesk's armed decide buttons, AgentChat's confirm-card execute tap, DealsList's single-lime button (both branches, still gated by the row.lime flag — the FIELD name stays, it names the rule). The brief's "approval-pending chips are decisions and stay" case was VACUOUS — every pending-approval indicator was already amber; nothing in the rates engine survives as lime. DEMOTIONS: 48 hover accents → ink/navy; action buttons (Ask Fox send, provision, uploads, PDF) → navy; arm controls → outline ink (B3 precedent); healthy/approved semantics (live dot, Active tier, funded chip, view-as active, doc Approved) → StatusChip green; informational chips/tints → cool; emphasis (winning-offer card, best-rate chip) → navy; progress/pacing fills + Revenue bars (and barClass default) → navy beside the pre-existing navy/70 series; the PracticeHistory chart's projection hatch + legend swatch + milestone dots → PROJECTION_GRAY #7E8E97; DemoBanner/DemoToggle → caution (mode loudness without spending lime); LenderMark ring → cool-300. ONE brand-mark exception, enumerated in the audit: PracticeHistorySlide keeps #95D600 in SVG fills only — the Fox mark on a client-facing export, the PDFs' masthead precedent. Late catches: four #7ab800 lime-dark hex checkmarks (settings, ProvisionWizard, OffboardChecklist) → green-600.
- THE MECHANICAL PASS (68 files): 1,174 gray-N → cool-N (no gray-900 existed; 1:1 map), 42 slate-N → cool-N, 821 font-body → font-ui (both Montserrat; one alias now), 2 accent-[#032133] → accent-navy. The six SVG fontFamily attrs + the two SVG NAVY consts are functional (SVG/PNG export cannot take classes) and stay, noted. Raw amber/red/green stay — they ARE the StatusChip vocabulary.
- DS ADOPTION (Task 2, four parallel agents on disjoint sets, every diff integration-reviewed — className-only, handlers/hrefs/test ids/aria byte-identical, zero lime or decision additions): Today below the fold (StatusChip rail, CELL_MONEY pipeline, card contract on the SectionCard/AttentionCard/KpiCell helpers), the deal room interior (CELL_DATE documents, provenance lines tabular), ApprovalsDesk (Chip→StatusChip delegation ~30 sites, nine frames, ds tab LOOK on the client-state pills — buttons kept), ConditionsChecklist/uploaders/LenderNotesCard (contract labels, tabular counters; the decision pill verbatim), Partners ×3 + PartnersHealthTable + PartnerReferralSection + ComplianceModule (16 frames, 13 chip sites) + ComplianceCard, all ten System pages + PeopleList/ProvisionWizard/NotificationSettings + AgentChat chrome (StatusChip ×5, ~40 frames, tabular timestamps). Real-`<table>` pages take the contract's typography/hairline/frame classes IN PLACE (the div-grid TABLE_* constants' px-5/hidden-md rhythm doesn't fit a real table — sanctioned fallback); chat bubbles keep the chat idiom. Client-state tab bars (Approvals, Compliance) restyled to the TabBar look with mechanics untouched — behavior outranks reuse; a client-state TabBar variant is a B5 candidate.
- TASK 4: tests/shell.test.ts's lime audit is EXHAUSTIVE — walks every .ts/.tsx under app/portal/admin/** + components/admin/**, asserts zero lime classes anywhere, zero lime-family hex (#95D600/#AAE620/#7AB800/#C6F53F) outside the enumerated slide, and the decision token ONLY in eight surfaces (AdminShell, DeskStrip, NotificationBell, Today's decision cards, ConditionsChecklist, ApprovalsDesk, AgentChat, DealsList) each restricted to its documented role regex. The B2b deals-surface audit updated to the same vocabulary (the single lime asserted as decision classes on exactly the two row.lime-gated branches). A new decorative lime anywhere now fails the suite.
- VERIFIED: tsc clean; clean `next build` green (BUILD_ID minted); **634 tests** (from 633: +1 the exhaustive audit's tree-sanity test; the two audit rewrites replaced their predecessors, named in the report). Name scan zero-hit as above. CENSUS untouched BY CONSTRUCTION: the Tasks 2–4 diff touches zero lib/, next.config.js, or middleware files (diff-proven — config/changelog.ts's new entry is the only config change); redirects untouched, their test green; demo zero-real-reads asserted green. RENDER PROOFS (dev server + dev-Clerk TEST admin "B4 Proofs", created and DELETED in-session; read-only navigation only per the standing UI-test discipline; the custom sign-in form stops at the dev instance's enforced second factor, so Clerk JS carried sign-in with the fixed dev code — the documented Session 8 limitation): Today desktop + 375px (zero horizontal scroll), Approvals (ds tabs + amber counts), Partners (StatusChip tiers, tabular money), Compliance (ds tabs + tiles), Status (ds panels + health chips), Revenue (the chart's gray hatch + gray milestones beside navy actuals). Screenshots in-session, never committed.
- ORPHANS FOUND (B5 deletes): ConditionsPanel.tsx + StubPage.tsx — zero consumers, demoted in place per the styling-only guardrail. B5 list also carries: the homepage-testimonial decision, the lib/investor-calc status-badge map (shared with the investor portal, off-token there), the ds tone questions (added-by-hand/edited chips, sky/violet badges, StatusChip tabular-nums), and the layout gripes inventoried in the report.
- Guardrails held: styling and strings only (zero logic/fetcher/gate/authz/routing/env/data changes — diff-proven); no redesigns beyond the contract; copy rules on every touched UI string; no client names in the diff (the sweep REMOVES them); committed NOT pushed.

### Prior entry — B3: the consistency pass (one design system, a lifecycle-shaped menu)
- TASK 0 FIRST (own commit f514fa1): the deal-name parsing comments illustrated the book convention with a real client + file ref — replaced with the design cast ("FOX-1004 — Sofia Ricci") in lib/deals-surface.ts (the B2b target) AND lib/underwriting-bridge.ts (the identical pre-B2b example). FINDING: the same name lives on in pre-existing test fixtures, two changelog entries, config/call-rubric.ts, an AgentChat suggestion, and two lib comments — all under the standing CLAUDE.md PII exception; whether that exception should end is Michael's call (report, B4).
- DESIGN SYSTEM (components/admin/ds/): SummaryStrip (the B2b phase spine byte-for-byte, + optional sub/caution), NavyBar (the board's navy header), StatusChip (the room's chip), TabBar (NEW: hairline track, navy active, Poppins, calm count badge), table.ts (card/header/row + tabular money/ref/date cell constants). Deals list/board/room RE-MOUNTED on them, zero visual change: census live-identical via a temp route (same 7 rooms — conditions 3 / evidence 1 / with_lender 1 / ready 1 / funded 1, zero fallbacks; removed, middleware diff-zero) and the live list screenshot matches B2b (spine 0/2/3/2, the single lime on the top-most actionable row).
- THE IA (config/admin-nav.ts): Today · THE BOOK (Deals, Approvals, Beyond funding → /portal/admin/beyond NEW, keyed renewals.view, badge = renewals+review+manual SUMMED in lib/desk.ts — verified live 3+15=18) · THE PRACTICE (Lenders → /portal/admin/lenders NEW keyed knowledge.view (the widest merged key, so agents keep their knowledge path), Revenue, Partners, Compliance) · SYSTEM (Directory moved in per the brief; rest untouched) · Ask Fox pinned. Group keys pipeline/market → book/practice; GROUP_ORDER + scopeNavForRoles updated (agent-only scoping hides System only; can() still narrows). Bookkeeping left the nav (folded into Revenue).
- REDIRECTS (next.config.js, ALL verified live as 308 with exact Locations): renewals→beyond?tab=renewals, opportunities→beyond?tab=opportunities, rates→lenders?tab=rates, intel→lenders?tab=intel, knowledge→lenders?tab=knowledge, /portal/bookkeeping→/portal/admin/revenue?tab=bookkeeping (cross-prefix). SUBROUTES stay live (renewals/drip, opportunities/backfill, knowledge/[slug], bookkeeping/{review-queue,projects}). OBSERVED: incoming query params merge through and the destination's tab wins — /rates?lender=mcap → lenders?lender=mcap&tab=rates (scenario deep links survive); /rates?tab=promos → lenders?tab=rates (old inner-tab bookmarks land on the Rates default, the one casualty). Manifest: the Deals shortcut repointed direct to /underwriting (had ridden the B1 redirect). In-app links ALL direct now: Desk strip fragments + both renewal notification hrefs + Today (KPI cells, rail, decision cards, Rates tile) + DealsList funded rows + the room's Beyond section + find-rates + Opportunities scenario prefills (→ /portal/admin/lenders with params) + Revenue's renewal-book link + changelog's rates link + the rates engine's own cross-tab links (RatesPromos/RatesLenders/LenderKnowledge).
- THE MERGED PAGES (engines git-mv'd to components/admin/{lenders,beyond,revenue}/, self-fetching, requirePermission intact; each page COMPOSES the same per-tab permission keys and lands the user on the first tab they hold — never widening): Lenders (strip: approved quotes / lenders in the book / pending claims via getKnowledgeClaimQueue; IntelTab's filter pills carry tab=intel; the two tab layers compose because the value sets are disjoint — the page claims rates|intel|knowledge, anything else falls through to the Rates tab whose inner RatesTabs reads it, pathname-relative, verified live); Beyond funding (strip from the same loaders the tabs read, desk-pattern headline counts — the strip's simplified act-now matched the board's exactly on live data; the board's override/claim-aware figures live on its tab); Revenue?tab=bookkeeping (BookkeepingTab client component renders before any revenue data loads, only for bookkeeping.view holders — the standalone page's own key).
- POLISH + LIME: the three flagged demotions (ClientConstraints preferred-chip tint + record-constraint arm control → outline ink; roadmap's Shipped chip / navy-card heading / map-complete callout → ink); BookkeepingTab fully restyled (lime pulse → green health dot, lime links → navy/white, yellow → caution token, grays → cool); bounded cool/radius sweep + hover-lime demotions on the reparented Renewals/Opportunities/Intel bodies; Revenue's two touched link hovers demoted. B4 LIST (stated): rates-engine internals (best-rate chip etc.), Revenue est-chips + chart bars, Home hovers. Archivo npm dependency REMOVED (zero references).
- TESTS 633 (from 631: +1 the working-nav-is-eight-labels pin, +1 demo strip-sources zero-real-reads; deliberate updates: route inventory REDIRECTED map + ≥26, group keys, agent scoping, desk fragment hrefs + the summed beyond badge, the seven-redirect config assertion, the no-lime audit list +15 files). tsc clean, next build green.
- VERIFIED LIVE (dev server; TEST admin B3 Proofs on the dev Clerk instance created + DELETED in-session; read-only navigation only per the UI-test discipline): the sidebar both groups desktop + phone drawer (Beyond badge 18), Lenders ×3 tabs (inner rates tabs composing; Knowledge in its documented dev-token state; intel filter href = lenders?tab=intel&lender=mcap), Beyond ×2 tabs (strip + radar / strip + board), Revenue's Bookkeeping tab, phone Lenders zero horizontal scroll, Deals identical through the refactor. LIVE INTEL FINDING for fox-underwriting: a null-slug "People's Bank" rates sheet arrived Jul 16 (joins the Alterna slug follow-up).
- DEVIATIONS, stated: demo's "zero real reads" holds for every borrower-side source (asserted) while the approved rate book stays REAL in demo per the standing Session 9 lender-data contract (identical to the old Rates page's demo behavior); the auth-gated engines cannot render on a public temp route, so the page render proofs used the established dev-Clerk TEST-user pattern instead.
- Guardrails held: presentation + routing only (no fetcher/gate/authz/write changes — the merged pages compose existing permission keys, never widen); every removed path redirects; no new env vars; no client names in the diff (Task 0 removed two); copy rules on every new UI string; committed NOT pushed.

### 2026-07-17 — B2b: the Deals surface, Direction 2 (the control room; fonts are the website pair)
- TASK 0 FIRST (own commits ce5cc61 + c5de71b): the B2a figures corrected — SIX of seven rooms moved (BRXM-F053724 alone stayed) and the weighted delta is $474,995.70 (0.9 × 527,773), not $475,095.70; fixed in the report, the ledger line, the changelog note, and the roadmap entry (the last two carried the census figure too — found beyond the brief's pointer).
- FINDINGS: (1) `Compliance_Status` EXISTS live on Potentials with a RICHER picklist than the brief's four states (Pending Review / In Review / Approved / Rejected / Re-Review Needed + -None-) — all six map through `complianceStateFor` (unknown future values read as in-motion, shown verbatim; unreadable field = its own "not read" state); a sibling `Compliance_Package_Status` exists, deliberately not read (the brief names Compliance_Status). (2) Montserrat's tabular figures HOLD (measured live: 1-runs and 8-runs identical width under tabular-nums) — no mono fallback. (3) The brief's five action wirings don't cover every reachable step: four honest manual entries added to the one mapping (reach_out, present_options, nudge_lender no-route; assemble_compliance routed to #closeout) so no row carries a decorative blank.
- TASK 1 (fonts + tokens): `font-ui` → var(--font-montserrat); headings/page titles/phase+column headers/nav labels → font-heading (Poppins; 500 added, Montserrat 700 added); shell chrome migrated (nav/group labels, brand, Ask Fox, mobile title); Archivo import removed from the admin layout (nothing references the face; the npm dep stays, unused — follow-up); Fraunces greeting untouched; `cool.50–800` (#F6F8F9→#3E5563) joined tailwind as the Deals surfaces' only gray family.
- TASK 2 (rename, nav-IA note): **Underwriting → Deals**, label + title only; /portal/admin/underwriting unchanged, rooms keep /deals/[id], the old /deals redirect stands; "Underwriting" now = the phase only.
- TASKS 3+4 (the surface): lib/deals-surface.ts is the PURE model both views share (buildDealRows = build → sort → markSingleLime) over the SAME B2a position source; LIST default (phase spine tiles, closing-date asc, dateless after dated, funded last + muted + "Moves to renewals"; amber ≤10 days incl. past-due; where-it-is = journey caption + conditions count; tabular-nums money/refs/dates) with THE SINGLE-LIME RULE (exactly one lime button, top-most actionable row = first with a routed action; manual chip precedes platform-can't actions; no-route manual = chip + quiet text + note, never a button); BOARD behind the per-user toggle (fox_deals_view_v1:{clerkId} localStorage, demo-safe, reload-proven): four phase columns, navy header bars, cards per the direction, the two dashed planned placeholders at Intake's bottom with notes SOURCED from PHASE_STEPS (never restated); next actions from `nextActionForJourney` in config/lifecycle.ts — Chase documents → #documents, Generate lender notes → #notes, Work conditions → #conditions, Confirm broker complete → room + manual chip, Nudge the application → manual no-route. Unmapped rows: amber cell, counted in no tile, loud strip on the board. The sweep, not-yet-bridged strip, and parked toggle all survive.
- TASKS 5+6 (the room): navy header band (back link, client name from the new `getDealCloseout` read with fileRef fallback, ref chip, goal-conflict/type/stage chips, Prep-a-call + Find-rates band buttons with test ids, Amount/Closes/Purchase price/Lender stats, Zoho + workbench line); JourneyStepper restyled to Direction 2 nodes (past ✓ outline-navy, current navy-filled number + caption, future outline; steps list moved OUT into the sections; still never lime; unmapped still amber); PHASE-LED body: current phase first + open (PhaseSection = native `<details>` + hash-open effect; StepList with ink "now" pill), others collapsed one-line honest summaries; surfaces REPARENTED not rebuilt (Borrowers→Intake; Documents+uploaders, Ratios/calcs, Statement evidence, Shadow, Submission notes→Underwriting; conditions desk→Fulfilment — force-opens whenever a pending commitment list exists, a queued decision never hides; CloseoutPanel→Complete & paid id=closeout; drip line + renewals→Beyond funding); flags/FSRA posture/constraints/audit stay below as file cards + an open-flags strip. COMPLETE & PAID steps now **broker_complete → compliance_package → paid** (config/lifecycle.ts); `closeoutStepStates` (pure) moves them by compliance status + commission truth (rejected loops back current+amber; funded with no package reads it as owed); CloseoutPanel is READ-ONLY (not-started names the by-hand path: BRX Ontario checklist + the compliance submission skill; Paid = Total_Commission>0 actual, else quiet not-recorded; the package checker is a NAMED gray placeholder, no faked state). `getDealCloseout` (lib/zoho-admin.ts) reads Deal_Name + Compliance_Status + Total_Commission — read-only, demo-fixtured (demoDealCloseout: In Review on demo-z-2, Approved+7140 on demo-z-10), 400-resilient (retries without the new field → "not read"); Ask Fox's fetch untouched. RoomSectionNav DELETED (zero other usages) + the Overview section folded into band/strip/step lists — the one intentional subtraction. ROOM POSITION SOURCE unchanged (room space, per B2a) — the list/board speak Zoho; deep links hash-open the right section either way.
- TASK 7: LenderNotesCard Generate/Regenerate/stale-fallback (3 buttons) demoted to outline ink; room link hovers (hover:text-lime ×4 incl. ComplianceCard) demoted in passing; lime in a room = queued decisions only (ConditionsChecklist's decision token untouched). ClientConstraints' two pre-existing limes (chip tint + arm control) left, flagged for B3.
- TASK 8: lib/sw-update.ts pure detection (waiting-installed behind a controller / updatefound→statechange installed with controller / controllerchange only when the page HAD a controller — first install never toasts) + ServiceWorkerRegister shows the quiet "A new version is ready." toast with Refresh + dismiss, NEVER auto-reloads; unit-tested; manual deploy proof documented in the report.
- VERIFIED: tsc clean; `next build` green (BUILD_ID after clean .next); **631 tests** (from 599: +26 deals-surface incl. the single-lime rule + the B2b lime audit, +5 sw-update, +1 demo closeout zero-fetch). CENSUS LIVE-IDENTICAL before/after (temp census endpoint running the page's own derivation): same 7 rooms, conditions 3 / evidence 1 / with_lender 1 / ready 1 / funded 1 / intake 0, zero fallbacks — B2b moved nothing. LIVE closeout read proven (complianceRead true on BRXM-F054033, status unset → not started, read-only). Render proofs via temp /preview-b2b on synthetic TEST fixtures (screenshots in-session; route + middleware entry removed, middleware diff-zero): the list (single lime, manual chips, amber dates, muted funded), the board (navy headers + both placeholders), a refi room open at Fulfilment, Complete & paid in two states (not-started; Re-Review-Needed amber loop + $7,140 recorded), the 375px list (zero horizontal scroll), the toast. Tabular alignment verified computationally.
- Guardrails held: presentation + ONE read-only field addition (Compliance_Status; Deal_Name/Total_Commission ride the same read — both already read elsewhere, the brief's Paid requires the latter) + deep links; no gate/authz changes; no Zoho or workbench writes; no route path changes; no new env vars; no client names in the diff (synthetic fixtures only); copy rules on every new UI string; committed NOT pushed.

### 2026-07-16 — B2a: stage truth (the board positions from Zoho; reads canonicalize to display space)
- THE VERDICT FIRST (Task 1, metadata-proven): **Outcome B.** The live Stage picklist pair is UNCHANGED — display 'Broker Complete' still pairs with actual 'Ready To Close' (probability 90), no separate 'Ready To Close' display entry exists, and all five 2026-07-14 pairs stand. So the verbatim read was a RECORD-LEVEL value surfacing in ACTUAL space; best-supported mechanism: the Finmo sync writes actual-space values by design and reads return what a sync-written record stores (the 2026-07-14 "reads return display" observation came from UI-written records). STAGE_WEIGHTS and PIPELINE_STAGE_ORDER untouched. SIDE FINDING: the current picklist DROPPED the legacy stages entirely (Pending/Options/Qualification/Archive/Closed/Lost/Mortgage Lost/Additional Properties absent from the 15-entry list) — they live on records only. REPORT-ONLY n8n note: the sync's guard needs NO new alias under Outcome B (its STAGE_ORDER is actual space, so a verbatim actual read matches directly; STAGE_READ_ALIASES already covers display-space reads).
- `normalizeDisplayStage` (config/pipeline.ts DISPLAY_READ_ALIASES): ALL FIVE actual→display pairs, lowercase-keyed (case drift absorbed), display + unknown values pass through. Applied at every portal Stage read-in point in lib/zoho-admin.ts — the SlimDeal mapper, the RevenueDeal mapper, and the renewal-pool filter (a funded record reading verbatim 'Mortgage Closed' can no longer fall out of the renewal pool). Ask Fox agent tools stay verbatim by design; the FP portal's own fetch path is out of scope, noted.
- `columnForDisplayStage` (config/lifecycle.ts): the TOTAL display-stage → board-column map at the brief's granularity (Lead..Submitted → intake; Collecting Documentation/Options/Underwriting In Progress → evidence; Ready to Submit → packaging; Submitted to Lender → with_lender; Conditionally Approved/Conditions Fulfilled/Approved → conditions; Broker Complete → ready; funded terminals → funded; + Qualification/verbatim-actual belts), boundaries positional over the imported funnel order. Tested: totality AND phaseForBoardColumn(columnForDisplayStage(s)) === phaseForDisplayStage(s) for every open stage; funded terminals asserted separately as the documented B1 divergence.
- THE BOARD POSITIONS FROM ZOHO: each card's column = the linked deal's display stage through the new map; the room's own stage is the FALLBACK ONLY (no linked/fetched Zoho stage, or unknown display value) with a quiet "position from the room, not Zoho" marker — COLUMN_BY_STAGE survives for the fallback alone. Sweep, dormant handling, funded-recency bound, TEST exclusion, card contents untouched. Subline now: "Every live file, positioned by its Zoho stage and grouped by lifecycle phase."
- CENSUS (live, before → after, every move cited by the live Zoho display stage, ZERO fallbacks, zero unexplained): F053107 evidence→with_lender (Submitted to Lender); F053725 conditions→ready (Broker Complete, read verbatim as 'Ready To Close' and normalized — the brief's named F053725 expectation); F054033 + F056361 + F057400 intake→conditions (Approved ×3 — incl. the brief's named F057400 expectation); F059751 intake→evidence (Underwriting In Progress); F053724 funded→funded (stay). Board totals: intake 4→0 / evidence 1→1 / with_lender 0→1 / conditions 1→3 / ready 0→1 / funded 1→1. TODAY: same 8 files + amounts + per-stage counts; the RTC row now reads Broker Complete and the unmapped-weight list is EMPTY (was RTC/$527,773); weighted pipeline rises +$474,995.70 (0.9 × 527,773) as the amber clears — zero weight edits, the one number consequence, named. (Corrected 2026-07-16 in B2b Task 0: six of seven rooms moved, BRXM-F053724 alone stayed; the delta is $474,995.70, not the $475,095.70 first reported.)
- Demo: all three demo rooms link demo Zoho deals with mappable display stages, so the demo board takes the Zoho path with zero fallback markers (asserted); zero-real-reads posture unchanged.
- Tests **599** (from 590: +9 lifecycle — normalization pairs/passthrough/case, column totality + granularity + phase-consistency + funded divergence + loud null + the demo Zoho-path assertion). tsc clean, build completed (BUILD_ID verified). Render proof via temp /preview-b2a on synthetic fixtures (screenshot; route + middleware entry removed, middleware diff-zero). Lime audit: zero additions. Report: docs/stage-truth-b2a-2026-07-16.md.
- OPERATIONAL NOTE: the machine's disk hit 100% mid-verification (283 MiB free); npm cache clean recovered ~1 GB to finish the build; the local .next was removed after commit. Clear space before the next build session.
- Guardrails held: NO Zoho writes (metadata + records READS only), no workbench writes, no n8n modifications (the Task 1 note is report-only), STAGE_WEIGHTS untouched (Outcome B), file refs only in the report (no client names), copy rules on the new marker string, committed NOT pushed.

### 2026-07-16 — B1: the lifecycle spine (the board, Today, and deal rooms speak one vocabulary)
- FINDINGS FIRST: (1) live Zoho reads now return stage **'Ready To Close' VERBATIM** on one active file ($527,773 — it is also today's weight-unmapped amber), despite the documented display/actual indirection saying that actual value displays 'Broker Complete'; the brief's phase table missed it. Phase-mapped to `complete_paid` (case-insensitive lookup absorbs the case drift); STAGE_WEIGHTS deliberately NOT touched (guardrail), so the weight-unmapped amber list is IDENTICAL before/after. (2) Legacy 'Qualification' (still in STAGE_WEIGHTS + demo fixture demo-z-7) was also missed — mapped to intake. (3) The two stage spaces COLLIDE on 'submitted' (display space = a fresh application in intake; a workbench room = with the lender), so `journeyForStage` takes an explicit `space: 'display' | 'room'` — callers declare, never guess. (4) Workbench `ready_to_submit` boards under the `ready` column (pre-existing COLUMN_BY_STAGE, a contract) and therefore phases as Complete & paid, while DISPLAY 'Ready to Submit' is Underwriting — the spaces disagree on that stage; no live room carries it; recorded, not "fixed". (5) The brief's table assigns funded terminals to BOTH complete_paid and beyond_funding; resolved per its Task 4 rule — per-file surfaces show Beyond funding, the board's funded column groups under Complete & paid.
- `config/lifecycle.ts` is the single source: LIFECYCLE_PHASES (five, plain-words descriptions), `phaseForDisplayStage` (derives from PIPELINE_STAGE_ORDER POSITIONS — segment boundaries, never a restated stage list; funded terminals → beyond_funding; non-funded terminals + unknown → null, LOUD), `phaseForBoardColumn` (total over the 7 keys), `boardPhaseGroups`, `groupByPhase` (lifecycle order + trailing loud 'Phase not mapped' group), `PHASE_STEPS` (per phase per shape purchase/refi/renewal/switch/unknown; every step {label, status live|manual|planned, note} — manual notes name the manual path so the dashboard doubles as the SOP; the two mandated planned placeholders are intake 'Application chase' and purchase-only 'Pre-approved · shopping'; planned steps carry NO stage matchers, tested — a missing capability is never where a file is), `stepShapeFor` (the house dealShapeOf, never re-derived; the Finmo goal wins a conflict, the header chip's own honesty rule; switch folds into renewal today), `journeyForStage`.
- BOARD (/portal/admin/underwriting): the SAME seven columns render under four phase section headers (small uppercase + hairline, ink, no lime); labels relabelled per the model (keys byte-stable); xl keeps the 1:3:1:2 relative widths, below xl the board stacks phase by phase (better mobile read than the old arbitrary 7-column wrap). Clutter pass: the page sub-line shortened to one sentence; a single-column phase no longer repeats its own name under the phase header (the INTAKE/INTAKE stack — the count stays); h1 to the shell face. Card contents byte-identical.
- TODAY: the compact pipeline table groups rows under quiet phase group rows (group rows over per-row chips — a chip would put a second pill on every row and repeat each phase word per file; groups say it once, in the board's words); closing-date order holds within groups; an unmapped stage lands under an amber 'Phase not mapped' group row; the pacing card's weight-unmapped flag is untouched.
- DEAL ROOM: `components/admin/JourneyStepper.tsx` (server component, display only, zero reads) mounts under the title strip — five phases (muted ✓ past / ink-navy current with the phase description as the title / gray future), the current phase's steps beneath (current step ink; manual + planned gray with a ◦ marker and the note on hover), funded files show Beyond funding + an 'Open renewals' link, an unmapped stage renders the loud amber state. Rendered for active rooms and funded rooms; a dormant/closed room shows no journey (a dead file has no current phase). Header sweep: both h1s + the back link to the shell face and ink tokens, back link renamed '← Underwriting', and 'Find rates for this deal' lost its bg-lime (a nav affordance is not a queued decision) for a quiet secondary style.
- CENSUS (the Task 0 anchor; live before/after BYTE-IDENTICAL, diff-proven; counts only): board 7 live rooms = intake 4 / evidence 1 / conditions 1 / funded 1 / others 0, parked 0; Today 8 active files = Application Started 2 / Underwriting In Progress 1 / Submitted to Lender 1 / Approved 3 / Ready To Close 1; unmapped-weight list = Ready To Close alone, before and after.
- Tests **590** (from 567: +23 tests/lifecycle.test.ts — boundary assignments, no phase interleaving along BOARD_COLUMNS, step/note completeness, shape-aware sets, planned-never-current, funded → beyond, the space collision, groupByPhase; the underwriting-bridge label assertion updated; tests/shell.test.ts SHELL_FILES gained JourneyStepper as AUDITED-not-allowed — zero additions to the decision-allowed set). tsc clean, production build green. Render proofs on synthetic fixtures via a temp public /preview-b1 route (screenshotted, then route deleted + middleware entry reverted — middleware diff-zero). Report: docs/lifecycle-b1-2026-07-16.md, incl. the read-only visual debt inventory (72 of 81 admin files off-token: 150 legacy lime / 728 legacy navy / 1,321 raw grays / 1,010 font-heading|body classes — the B2/B3 feed).
- Guardrails held: presentation layer only (no fetcher query, authz, gates, STAGE_WEIGHTS, admin-nav, env, or migration change), column KEYS + COLUMN_BY_STAGE untouched, the lime rule intact (the stepper is audited lime-free), demo zero-real-reads (no new fetchers; the stepper renders from room props), copy rules on every new string, no client names or live file refs in code/fixtures/tests/the report, committed NOT pushed (Michael reviews and pushes).

### 2026-07-16 — Length-aware note + goal-conflict header honesty (small session)
- **The lender-notes card shows an over-length draft labelled for a manual trim instead of nothing.** The workbench length gate is now recoverable: a draft that passes the style + pinned-figure gates but exceeds the 3,750 character ceiling comes back flagged (`overCeiling` + `chars`), and the card shows "over the 3,750 ceiling, not auto-trimmed; the figures are validated, only the length is not; trim ~N characters by hand". `lib/lender-notes-client.ts` surfaces `overCeiling`/`chars` (only when over); `lib/gates.ts` type extended. A normal note is unchanged.
- **The deal-room header stops presenting the deal-record type as fact when it conflicts with the Finmo goal.** NEW `lib/deal-goal.ts` `dealGoalDisplay(dealType, finmoGoal)` (shape mirror of the workbench `dealShapeOf`; conflict only when BOTH are KNOWN and DIFFERENT). On a conflict the header chip shows the FINMO GOAL in amber with a marker ("Refinance · record says Purchase", tooltip names both + says correct in Zoho); else the record type as before. Display only — the deals row is Michael's to fix in Zoho. Verified: F053107 (record purchase vs Finmo refinance) renders the amber conflict chip. Portal **565 tests** green, `next build` green, tsc clean. See fox-underwriting CLAUDE.md "Length-aware generation + goal-conflict header honesty".

### 2026-07-16 — Lender notes: fresh pull + stale-snapshot second click (workbench 0048)
- **The Generate Lender Notes flow now ALWAYS pulls the current Finmo application server-side before building the note** (workbench Step 1); there is no freshness window. If the fresh pull fails, the workbench returns a loud `502` whose message ends "…confirm the stale-snapshot fallback", and the card (`components/admin/LenderNotesCard.tsx`) offers an explicit second click, "Generate from the snapshot pulled N ago", which re-calls with `allow_stale_snapshot: true` — never silently stale. `lib/lender-notes-client.ts runLenderNotesGeneration` gained `allowStale` and surfaces `staleFallbackAvailable` by detecting that marker; `lib/gates.ts generateLenderNotes` forwards `allow_stale_snapshot`; the proxy route passes it through. The readiness strip already shows the snapshot age.
- The note's figures are now deterministic and deal-type aware workbench-side (a refinance no longer renders a purchase/down payment; LTV is against the property value; a pinned-figure gate rejects a prose figure that contradicts the computed one). No portal rendering change — the note is text the card displays. Portal **559 tests** green, `next build` green, tsc clean. See fox-underwriting CLAUDE.md "The lender note reads the full application" and reports/refi-lender-note-2026-07-16.md.

### 2026-07-16 — The Renewal Drip approval desk (portal side; nothing sends)
- **The outbound renewal drip's approval surface, riding the workbench engine (fox-underwriting CLAUDE.md "The renewal outbound drip"; migration 0047 handed to the architect — the desk renders empty until it applies).** NEW `/portal/admin/renewals/drip`: each pending touch shows the client, the touch tier, the FULL rendered draft, per-sentence provenance for personalized content (text + the source id the sentence cited, plus a refused-sentence count from the fences), and Approve & send / Edit / Skip. Approve is human-only + gated (`renewal.decide`, admin, CONTRACT key added both repos) and the SEND is mode-gated workbench-side (`RENEWAL_SEND_MODE` ships unset = off; approving surfaces the reason). Held touches (e.g. "calendar link not configured") show the reason and cannot be approved. Edit saves a superseding human_edited draft (Michael's corrections are the skill's highest authority, fed to future drafts for this client). NEW fetchers `getRenewalDripQueue`/`getRenewalSequenceStates` (portal_readonly over the 0047 tables, `uwSelectAll` paginated); gates clients approve/edit/skip/exclude/autosend + 5 proxy routes under `/api/portal/admin/gates/renewal/`. **Visibility:** the Renewal Radar header links the drip queue ("N waiting"); every Radar card carries a drip-state chip (`dripState` prop on RenewalCard); the deal room shows the sequence state line (matched by the deal's Zoho id). **Demo mode: canned synthetic queue (Dana Whitfield / Priya Raman incl. a held example), ZERO workbench reads, every drip write DemoWriteBlocked — asserted in tests/demo.test.ts.** Portal **567 tests** (+2) green, tsc clean, `next build` green.

### 2026-07-16 — Cleanup loop: requirement provenance renders; verify may return an evidence id; the F053107 conflict chip cleared
- **Three small portal touches riding a workbench cleanup session** (see fox-underwriting CLAUDE.md "Cleanup loop"). (1) `components/admin/ConditionsChecklist.tsx` `AnalysisBlock` renders the requirement-side provenance: "Requirement from [pN]: “<matched text>”" when the workbench parsed the target (the blob's new-filled `requirement_citation`), or "Requirement target set by hand" when `requirement_source='manual'` — the analysis is now cited on BOTH sides (value and requirement). (2) `lib/gates.ts ConditionVerifyResponse` gains optional `evidenceId`: verifying a condition whose analysis carries an extracted value now promotes it to a provenanced workbench `evidence` row (additive response field; the audit detail carries `evidence_id` or the skip reason). (3) `lib/deal-goal.ts` comment corrected: an ingest-written deal_type is fixed via the workbench's `deal:type-from-goal` (F053107 corrected live, `purchase`→`refi`) — **the amber goal-conflict chip clears on its own** (`dealGoalDisplay('refi','refinance')` → no conflict); only a bridge-provisioned room's type is Zoho's to fix. Portal **565 tests** green, tsc clean, `next build` green.

### 2026-07-16 — Cross-repo note: refi payout fixed + the fresh pull actually persists (workbench, no portal code change)
- **Two production defects on `BRXM-F053107`, both workbench-side, both now fixed.** (1) The "always pull fresh before generating" step (the entry above) was SILENTLY not persisting: `pullFinmoAppSnapshot` set the `superseded_by` self-FK to a not-yet-inserted id, the UPDATE FK-failed unchecked, the re-insert hit the `one_current` index, and a fallback returned the STALE snapshot while reporting `refreshed`. It now supersedes → inserts → backfills the pointer with every error checked, so a generate grows the `finmo_app_snapshots` chain by one (proven live 1→2). (2) The note's DEBT RETIRED / NET PROCEEDS dropped the from-proceeds consumer debts (the stale `mapped` blob had no `liabilities` field); the note is now always built from the CURRENT mapper applied to the raw payload, and DEBT RETIRED = existing subject mortgage + every `payOffType==='from_proceeds'` liability, pinned.
- **Portal impact: none.** The note and its DEAL SNAPSHOT are workbench-generated text the card displays; the readiness strip's "pulled N ago" now reflects a chain that genuinely advances each generate. No portal code changed. See fox-underwriting CLAUDE.md "The refi payout was wrong and the fresh pull never fired" and reports/refi-payoff-and-fresh-pull-2026-07-16.md.

### 2026-07-15 — Cross-repo note: snapshot income/credit keyed by Finmo id (workbench 0047)
- **Workbench-side change (fox-underwriting), no portal code changed.** Follow-on to the borrower-identity fix: the Finmo application snapshot mapper now keys `mapped.incomes` and `mapped.credit` by the Finmo borrower id (each `MappedIncome`/`MappedCredit` gains `finmo_borrower_id`), not by name, so two same-named co-borrowers no longer merge their income/credit in the lender note (the file's two identically-named applicants now render as three distinct people). `finmo_app_snapshots.mapped` was re-derived for current snapshots (`npm run remap:snapshots`) — no schema change.
- **Portal impact: none today.** The only portal read of the snapshot (`getDealFinmoSnapshot` in `lib/underwriting.ts`, demo-guarded) uses `mapped.requested` only and renders no income/credit/borrowers. **If the portal ever renders `mapped.incomes`/`mapped.credit`, group by `finmo_borrower_id`, never by the display name** — two applicants on one deal can share a full name and are different people. See fox-underwriting CLAUDE.md "attributes income + credit by id" and reports/income-credit-attribution-2026-07-15.md.

### 2026-07-15 — Cross-repo note: borrower identity is the Finmo id (workbench migration 0046)
- **Workbench-side change (fox-underwriting), no portal code changed this note.** The workbench borrower unique key was `(deal_id, full_name, role)`, which collapsed two people who share a name+role into one row (deal `BRXM-F053107` had two identically-named co-borrowers and only two of three rows). Migration **0046** makes identity the **Finmo borrower id**: `borrowers` gains `finmo_borrower_id` (stable identity), `email`, `phone`, `relationship`, `identifiers_source`; the unique key becomes partial `(deal_id, finmo_borrower_id) where not null`. Same-named borrowers are now **distinct rows**.
- **What the portal must know:** the new columns are covered by the existing `portal_readonly` SELECT grant on `borrowers` (0026) — no new grant. **Anywhere the portal keys borrowers by name (a React key, a dedupe, a join), switch to `finmo_borrower_id`** — two borrowers on one deal can share a full name and are different people. `email`/`phone` are FULL in the row (masked in logs/reports); `relationship` is the structured kinship field per person. `zoho_contact_id` linking is now per-borrower by her own email (two same-named borrowers with distinct emails link to distinct contacts; a shared email stays unmatched).
- **Live status:** 0046 apply is a one-command follow-up (the Supabase MCP was unreachable from the workbench sandbox this session, `net::ERR_FAILED`); the fix is proven on the real F053107 data read-only (2 existing + 1 insert = 3 rows). Until 0046 lands, `borrowers.finmo_borrower_id` does not exist — a portal query selecting it would 400. See fox-underwriting CLAUDE.md "Borrower identity is the Finmo id" and reports/borrower-identity-2026-07-15.md.

### 2026-07-15 — Contact-bridge tail: COMPLETE (0045 applied live; getDealContextCounts now reads real contact ids)
- The architect applied workbench migration 0045 + the `lender_notes_one_current` index live. `npm run link:backfill` ran (1 linked / 9 unmatched / 0 ambiguous): **the F059751 borrower → contact `7112178000001403205`** (exact email match); one borrower unmatched (no tagged emails). Verified live through the real `borrowers.zoho_contact_id`: the deployed `.or(contact_zoho_id.in.(…),deal_id.eq.…)` shape surfaces the linked 2 emails + 2 calls (by-deal-only returned 0/0 — the Zoho churn). So `getDealContextCounts` (shipped last session) now returns his real contact ids and the readiness-strip Calls/Emails counts reflect the linked correspondence. No portal code changed. Supersedes the "still MCP-blocked" note below. See fox-underwriting CLAUDE.md "Contact-bridge tail: COMPLETE".

### 2026-07-15 — Contact-bridge tail: still MCP-blocked (portal side unchanged)
- The workbench's DDL tail did NOT land this session — the Supabase MCP was unreachable from the sandbox (`net::ERR_FAILED` on every call; `borrowers.zoho_contact_id` verifiably still does not exist). So `getDealContextCounts` (the readiness-strip bridge, shipped last session) still reads zero contact ids until migration 0045 + `npm run link:backfill` land workbench-side. No portal code changed; this note records the live status. the F059751 borrower rows WERE created (workbench `npm run sync:borrowers`), and the deployed read-path query shape was verified live (the linked 2 emails + 2 calls surface by contact vs 0 by the churned deal id). See fox-underwriting CLAUDE.md "Contact-bridge tail: PARTIAL".

### 2026-07-15 — The readiness strip counts reach the linked correspondence (contact bridge)
- **`getDealContextCounts` now reads via the contact bridge** (workbench migration 0045): the deal's borrowers' STABLE Zoho contact ids UNIONED with the deal id, so the Calls/Emails counts on the lender-notes readiness strip reflect the correspondence that is actually linked — even when the deal's Zoho id churned (the F059751 deal was re-created 2026-07-14, so its linked emails carry a stale deal id; reading by contact finds them, reading by deal does not). Calls windowed 60 days; emails since deal creation FLOORED to 180 days (a re-created deal's created_at is recent while the correspondence predates it). Still COUNTS ONLY — call/email content is intent-only (guardrail 11), never rendered. Uses a PostgREST `or=(contact_zoho_id.in.(...),deal_id.eq...)` filter; propagates a not-connected/error result rather than reporting 0/0. `getDealContextCounts` gained a `createdAt` param (the deal page passes `deal.createdAt`).
- Workbench-side: the bridge column, the exact-email matcher, the read path, and the queue resolver (fox-underwriting migration 0045 + reports/contact-bridge-2026-07-15.md). Live diagnosis + the F059751 proof ran on supabase-js (both MCPs were down this session; the borrowers column is a one-command follow-up). Portal **557 tests** green, tsc clean, `next build` green. No new surface, no fence change. Contract: fox-underwriting docs/gates-api.md.

### 2026-07-15 — The lender-notes card becomes readiness-first (the figure substrate)
- **The Generate Lender Notes card gets a readiness strip and inline setters.** The workbench (fox-underwriting migration 0044) now pulls the Finmo application into a structured cited snapshot, gives the submission decisions Finmo does not hold a settable home, and feeds calls/emails as fenced context; this repo is the SURFACE. The design thesis holds: code assembles figures, the model writes prose, nothing is sent.
- **`components/admin/LenderNotesCard.tsx` rebuilt:** above Generate, a **readiness strip** — Application (pulled N hours ago / not pulled + Pull from Finmo), Target lender (set / not set + inline field), Insured status (set / not + inline select + the platform's read as a labelled suggestion), Rate (override / Finmo / not set + inline override), Calls N in window, Emails N linked. **Generate is disabled ONLY for a missing target lender** (the note opens with the lender by name); everything else generates with what exists (a thin honest note beats a blocked agent). The draft edits in place; **Save edit** writes an append-only `human_edited` row (workbench); Regenerate warns when it replaced a saved edit. Copy remains the exit; the validation gate runs on generated drafts, never on manual edits; char count stays live against 3750.
- **Plumbing:** isomorphic `lib/lender-notes-client.ts` gains `runFinmoPull` / `runSubmissionSet` / `runNoteEdit` (each mints a fresh gates token and POSTs; each a zero-network no-op in demo, asserted). Three proxy routes under `app/api/portal/admin/gates/deals/[dealId]/` (finmo-snapshot, submission, lender-notes/edit — POST-only, permission-gated, demo-refused, forward the browser-minted token). `lib/gates.ts` += pullFinmoSnapshot / setSubmissionField / saveLenderNoteEdit (demo-blocked, surfaceError). `config/authority.ts` += `finmo.snapshot.pull` / `submission.set` / `notes.edit` (CONTRACT keys, admin) + labels.
- **Fetchers:** `getDealDetail` carries target_lender / insured_status / rate_override; `getDealLenderNotes` returns the newest NON-superseded note (draft OR human_edited); NEW `getDealFinmoSnapshot` (current snapshot for "pulled N hours ago" + mapped rate) and `getDealContextCounts` (**COUNTS ONLY** of linked calls/emails — content is intent-only, guardrail 11, never rendered). Demo fixtures added.
- **Render proof captured** (real `LenderNotesCard`, both states — pulled+target+draft green, and not-pulled+no-target with Generate disabled + amber gaps + the platform-read suggestion — via a temp `/preview-lender-notes` route, screenshotted, removed; middleware reverted).
- **Adversarial review** ran on the workbench figure path (mapping / fence / supersede); the one portal-lens confirmed finding — inverted PURCHASE source priority — was fixed workbench-side. Portal **557 tests** (+6) green, tsc clean, `next build` green. Contract + full detail: fox-underwriting docs/gates-api.md + reports/finmo-substrate-2026-07-15.md.

### 2026-07-15 — Generate Lender Notes on the deal-room card
- **The proven lender-notes skill is now a button on the deal room's Submission notes card** (the pre-built notes stub is replaced). The workbench (fox-underwriting) does the assembling, model call, validation, and persistence through the lender-notes skill; this repo is the SURFACE + the proxy. Nothing is sent anywhere — the result is a DRAFT Michael copies out himself.
- **`components/admin/LenderNotesCard.tsx`** (client): a **Generate Lender Notes** button (lime — the human action; every other control calm navy/gray) that opens an optional **advisor-context** field, then calls the workbench. The result renders as an **editable draft, plainly labelled DRAFT**, with **copy-to-clipboard**, **Regenerate**, and the **character count against 3750** (amber over). Logic extracted to isomorphic `lib/lender-notes-client.ts` (`runLenderNotesGeneration` + `DEMO_LENDER_NOTE`) so it is unit-testable in node (no jsdom in this repo). **Demo mode produces the canned note client-side — zero token mint, zero fetch, asserted by test.**
- **Plumbing:** proxy `app/api/portal/admin/gates/deals/[dealId]/lender-notes/route.ts` (POST-only, `apiPermission('notes.generate')`, refuses demo cleanly, forwards the browser-minted x-gates-token); `lib/gates.ts generateLenderNotes` (demo-blocked; `surfaceError` widened to 502/503 ONLY so the button shows the workbench's exact diagnostic — "ANTHROPIC_API_KEY is not configured", "the note failed validation: contains an em dash" — never a raw 500); read-only `getDealLenderNotes` fetcher (portal_readonly SELECT on `lender_notes`, workbench migration 0043) renders the current draft on page load. `notes.generate` added to `config/authority.ts` PERMISSIONS + PERMISSION_LABELS (CONTRACT key with the workbench). The deal page fetches the draft in the existing Promise.all and mounts the card in the `#notes` section.
- **Style note (so it is not "corrected" in review):** the lender NOTE follows the SKILL's style rules, not the client-facing copy rules — semicolons are permitted inside the note; the no-dash rule is absolute. Client copy rules still govern the surrounding UI chrome (no dashes there).
- **Render proof captured** (real `LenderNotesCard`, real props, temp `/preview-lender-notes` route + middleware entry, screenshotted, both removed): draft state (lime Regenerate, DRAFT pill, "786 / 3,750", editable note, Copy) + empty-state CTA + no-permission copy all render. The live click-through is Michael's, later. **Adversarial review ran on the figure path (workbench side); findings + fixes in fox-underwriting reports/lender-notes-2026-07-15.md.** Portal **551 tests** (+6) green, tsc clean, `next build` green. Contract: fox-underwriting docs/gates-api.md.

### 2026-07-15 — Analysis fires and RENDERS on a live condition (the full result card)
- The Task-3 surface only showed a one-line reasoning note and never received data (the workbench produced `analyzed:0` — see fox-underwriting CLAUDE.md for the three blockers). This session makes the card render the full result on the live F057400 income condition: `components/admin/ConditionsChecklist.tsx` gains an **`AnalysisBlock`** that shows, from `presenceDetail.analysis` (all pre-computed on the workbench — NO arithmetic in the render layer): the extracted value vs the requirement, the **delta** with a meets/short indicator, the **60-day recency check** (pass ✓ OR fail ✗, shown either way), the **rule note** (2-year-average / addressee / stale), and a **citation link** ("open source") that mints a 60-second signed URL and opens the document at its page. Tone: green meets / red gap (+ "requirement gap" pill) / amber needs-review — never lime (lime stays reserved for Verify, the human action; verify stays human-only).
- **Settable requirement target:** the Add / Edit / edit-then-approve forms gain a "Requirement target ($)" field (shown for value-bearing doc-kinds) → `requirement_amount` / `edited_requirement_amount`; a "target $X" chip shows the captured requirement on the row. `lib/underwriting.ts DealConditionRow` carries `requirement`; the three condition proxies forward the amount. `lib/gates.ts getDealDocumentUrl` + proxy `app/api/portal/admin/gates/documents/[documentId]/url` (demo-blocked — a deal document is client PII). `config/authority.ts` gains `document.view` (all internal roles; CONTRACT key with the workbench). Demo fixture `demo-cond-4` exercises the full short-verdict render.
- **Render proof captured** (real `ConditionsChecklist` under real F057400-shaped props: the live needs_review income card + short + stale + meets; temporary public preview route, screenshotted, removed). The live click-through is Michael's from a verified session. Portal **545 tests** green, tsc clean, `next build` green.

### 2026-07-15 — Analysis fires and RENDERS on a live condition (the missing surface, completed)
- **The Task-3 note existed but never received data on a live file.** On BRXM-F057400 the borrower's income condition showed "obtained · in review" with a blank analysis, because the workbench read `analyzed:0` (see fox-underwriting CLAUDE.md — 0-page pay stubs + a columnar-format miss). This session makes the workbench fire AND enriches the render to the full analysis the brief asks for.
- **`components/admin/ConditionsChecklist.tsx` — the analysis block rewritten** (`AnalysisBlock`): extracted-value vs requirement with the pre-computed **delta** (meets/short indicator), the **60-day recency check shown whether it passes or fails** ("Dated … · N days old · within 60 days ✓"), the **rule note** (2-year average / addressee / stale) in words, a **"requirement gap" pill** on a red verdict, and a **citation link** ("open source") that mints a 60-second signed URL and opens the source at its page. NO arithmetic in the render — every number is pre-computed on the workbench and displayed. Tone: green meets / red gap / amber needs-review; **lime ONLY on Verify** (the one queued human action — verify stays human-only).
- **Michael sets/corrects the requirement target** on Add, Edit, and edit-then-approve (`requirement_amount` / `edited_requirement_amount`, shown only for value-bearing doc-kinds; the "target $X" chip renders on the row); a "target" chip shows the captured requirement even before analysis.
- **New surface, demo-safe:** `getDealDocumentUrl` + proxy `app/api/portal/admin/gates/documents/[id]/url/route.ts` + authority `document.view` (all internal roles; CONTRACT key). Demo-blocked (a deal document is client PII → zero reads in demo). Fetcher passes `requirement` through `DealConditionRow`; a demo fixture carries the full analysis shape (needs_review with recency + rule note).
- **Render proof captured** (real `ConditionsChecklist` under real F057400-shaped props on a temporary public route: the live needs_review income card + short + stale + meets; route + middleware entry removed after the screenshot). The live click-through is Michael's from a verified session (guardrail 19). Portal **545 tests** green, tsc clean, `next build` green.
- **DEFERRED at ship (architect review, 2026-07-15) — workbench-side, close next loop (see fox-underwriting CLAUDE.md):** (a) the requirement side of the analysis is uncited (`analysis.requirement_citation` empty on parsed targets) — the card renders "requirement $X" with no source chip yet; (b) the extracted income is not yet an `evidence` row. Neither is fixed this session; nothing moves to verified.

### 2026-07-14 — Task 1: manual document upload to the deal room
- **The gap:** the deal room had no way to upload any document except the commitment, so the reading engine + matcher + analysis layer (all built on the workbench) sat idle — no borrower document could enter. This adds the general uploader (shipped alone first, per brief).
- **DocumentUploader** (`components/admin/DocumentUploader.tsx`): a doc-kind selector (the closed vocabulary) + a borrower selector (each borrower by name / General) + a dropzone (PDF/DOCX/DOC/TXT, 3 MB), demo-blocked, mounted in the Documents section (always available). On success it reports how many conditions moved. Proxy route `app/api/portal/admin/gates/deals/[dealId]/documents/route.ts` (POST-only, `apiPermission('document.upload')`, 3 MB ceiling, forwards x-gates-token); `lib/gates.ts uploadDealDocument` (demo-blocked). `document.upload` added to `config/authority.ts` PERMISSIONS + PERMISSION_LABELS (CONTRACT key with the workbench).
- **Documents section**: gains a **Borrower** column (`DocumentRow.borrowerId` → name via the deal's borrower list). `getDealDocuments` selects `borrower_id`. Demo doc fixtures updated (pay stub tagged to a borrower, source='upload').
- The workbench stores the upload (source='upload', provenance='real'), indexes it, and recomputes presence so the matching condition moves needs-input → obtained — the matcher now reads the `documents` table, not only the Finmo inventory (workbench deviation, see fox-underwriting CLAUDE.md). Render proof: real DocumentUploader + Documents table with the Borrower column. Portal **545 tests** green, tsc clean, `next build` green. Report: fox-underwriting reports/document-pull-2026-07-14.md.

### 2026-07-14 — Conditions the user controls: manual edit first, broker-first view
- **The reframe:** extraction is a DRAFT Michael corrects, never an oracle. The deal room's Conditions section gets full MANUAL control + a broker-first layout (fox-underwriting migration 0039 + gate; this repo = the surface + edit actions). All condition writes still route through lib/gates.ts → the fox-underwriting Gates API (this repo has no direct workbench write surface); demo-safe by construction (every new write DemoWriteBlocked, every control gated `... && !isDemoMode()`).
- **Task 1 (manual control):** `components/admin/ConditionsChecklist.tsx` gains an "Add condition" bar (always available, even with no commitment) and per-row **Edit / Owner move… (one-control re-assign) / Remove** on the approved checklist. Four new proxy routes under `app/api/portal/admin/gates/` (deals/[dealId]/conditions POST=add; conditions/[id]/{edit,reassign,remove}) — POST-only, `approvals.conditions.decide`, forward the browser-minted x-gates-token; owner options are exactly the gate's 5 classes (broker/solicitor/borrower/underwriting/product_mechanics). `lib/gates.ts` gains addManualCondition/editCondition/reassignConditionOwner/removeCondition (demo-blocked). A manual condition shows an "added by hand" chip; a human-edited one shows an "edited" chip (`DealConditionRow.humanEditedFields`, mapped from migration 0039).
- **Task 2 (broker-first):** the room leads with BROKER conditions (progress over broker, General-first then per-borrower); solicitor/borrower/underwriting/product_mechanics are present but COLLAPSED behind labelled disclosures ("3 solicitor conditions"); a per-user "hide non-broker" preference (localStorage keyed by clerk user id — demo-safe, no DB write). The board card "N of M outstanding" counts BROKER (`conditionCounts` gains `ownerScope:'broker'`; `getConditionCountsByDeal` scopes to broker; `isBrokerCondition` = owner==='broker'). `manual` joins `CHECKLIST_SOURCES` so hand-added conditions render.
- **Render proof:** real ConditionsChecklist under real F057400 props via a temporary /preview-conditions route (removed after screenshot; middleware reverted) — 12 broker conditions lead, per-borrower groups, Edit/Owner-move/Remove controls, collapsed non-broker with the hide toggle.
- **Adversarial review (2 reviewers + 1 verifier):** the portal side was clean (3 LOW fixed: demo-deal-2 broker-scoped count, PendingRow textarea 2000→1000 to match the gate cap, edit-form client min-4 guard); the workbench merge had a HIGH borrower-blind bug fixed there. Portal **545 tests** (+3) green, tsc clean, `next build` green. Contract + full detail: fox-underwriting docs/gates-api.md + reports/manual-condition-control-2026-07-14.md.

### 2026-07-14 — Phase B2: the deal room, and commitments become conditions
- Board ladder → SEVEN columns (lib/underwriting-bridge.ts BOARD_COLUMNS/COLUMN_BY_STAGE):
  Intake → Evidence → Packaging → With lender → Commitment · conditions → Ready to close →
  Funded. approved/conditionally_approved/'application sent to lender' → conditions;
  'ready to close'/broker_complete → ready; funded is its own column (capped to recently-
  funded by updated_at idle ≤30d; older funded joins dormant behind the toggle). Cards in
  the conditions column show "{outstanding} of {total} conditions outstanding · closes in N
  days", closing pill amber only when 0 ≤ days ≤ 10 AND outstanding > 0.
- **Deal room interior** (app/portal/admin/deals/[id]/page.tsx + components/admin/
  ConditionsChecklist.tsx + RoomSectionNav.tsx): sticky Overview/Conditions/Documents/Notes/
  Activity nav + closing countdown. Conditions centerpiece: pending-approval banner (approve
  list / reject / per-condition edit-then-approve) then the approved checklist — progress
  line, grouped General first then per-borrower, status pill (lime ONLY on needs_input + the
  Verify tap), one-tap verify, waive-with-reason. Presence recomputes on room open (client
  effect, fire-and-forget, demo-silent, non-admin-inert).
- lib/underwriting.ts: getApprovedConditions (the room checklist — source in commitment/
  condition_template, gate_status=approved), getPendingCommitmentConditions (the banner),
  getConditionCountsByDeal (board "N of M", same population as the checklist); getDeal
  Conditions (Ask Fox) excludes pending/superseded/rejected; getOpenConditionCounts gained
  gate_status=approved. lib/gates.ts: uploadCommitment, decideCommitmentList, approveCondition
  (edit), verifyCondition, recomputePresence (DemoWriteBlocked-guarded). config/authority.ts
  +commitment.upload +approvals.conditions.decide +conditions.recompute (additive cross-repo).
- **The workbench matcher/extractor had real bugs an adversarial review caught pre-commit**
  (fixed workbench-side): real PDF commitments never parsed (newline anchoring vs space-joined
  pdfjs text — the whole feature was inert on the dominant format; now re-extracts 25
  conditions from the golden PDF); cross-borrower false match via shared surname; presence
  recompute clobbering a human verify. Portal-side confirmed + fixed here: gate_status leak
  into the checklist/board readers, conditionCounts double-subtracting a waived row, the
  closing-amber lower bound, the funded-column bound, the waive permission/route alignment.
- 542 tests (+18) green, tsc clean, build green. Workbench contract:
  fox-underwriting docs/gates-api.md; report fox-underwriting/reports/phase-b2-2026-07-14.md.
  The Finmo Sync v2 document-event branch (n8n) still needs wiring to
  POST /api/bridge/presence-recompute — the one deploy step, the early-200 hardening not
  reverted.

### 2026-07-14 — Lender knowledge: claims-backed pages, Knowledge approvals tab, Ask Fox retrieval, penalty consumer
- The workbench grew `lender_knowledge_claims` (migration 0034 there; portal_readonly
  SELECT on claims + document_pages) and two gates-API surfaces this portal now drives:
  `POST /api/gates/knowledge/upload` (dropzone, `knowledge.upload` admin, 3MB decoded cap —
  Vercel's body ceiling is the real wall) and knowledge-claims/knowledge-docs decisions
  (`approvals.knowledge.decide` admin; edit-then-approve; as-of supply for undated claims;
  batch per document with held-for-as-of feedback). Authority keys additive in BOTH repos.
- Knowledge pages render **Approved knowledge** sections by topic with citation chips
  (document, page, as-of via the 60s signed-URL proxy; plain-words staleness past 12 months)
  above the existing markdown; pages now render for registry lenders with NO markdown page
  ("claims only" note) so uploads/claims are never orphaned. Per-document status trail;
  failures loud. Approvals desk gained the Knowledge tab (grouped by document, verbatim
  snippets, per-claim + batch decisions). New underwriting.ts fetchers (agent_id-filtered,
  demo-first): claims, claim queue, knowledge docs, page search. Ask Fox knowledge_lookup
  answers approved-claims-first — `APPROVED KNOWLEDGE (source, p.N, as of DATE)` vs
  `FROM THE DOCUMENT (UNREVIEWED)` — distinction always stated.
- **Penalty consumer (the proving path):** an approved lender-wide `ird_comparison_basis`
  claim flips savings-analysis method-known for lenders the hardcoded LENDERS table does
  not cover — `posted_rate`→standard, `discounted_rate`→discounted, everything else fails
  closed, and **program-scoped claims never apply lender-wide** (adversarial-review catch;
  the fallback that did is deleted and the test inverted). `savings_analysis_log` inputs
  carry `methodology_source: knowledge_claim:<id>@<as_of>` | `lenders_table`;
  SAVINGS_CALC_VERSION 3→4 (methodology_source joined the hashed inputs). Bucket math
  untouched — 3MI floor stands; method-known changes framing only.
- KNOWN ISSUE (named, deferred, pre-existing): `lenderMethodologyFor`'s prefix match makes
  "First National Excalibur" table-known as First National Prime (A-paper methodology
  asserted for a B-side program; the claim path is unreachable for it). Fix needs an
  exact-slug/alias-aware pass over all 37 table lenders.
- MCAP proving run lives workbench-side (84 claims from 28 documents; `ird_comparison_basis`
  NOT found — penalty structure is printed, the comparison basis lives in standard charge
  terms; note the LENDERS table marks MCAP known via "Industry standard", the grade of
  unsourced assumption the claims system retires). Full report:
  fox-underwriting/reports/knowledge-pipeline-2026-07-14.md. 524 tests green (+23), build
  green, tsc clean.

### 2026-07-14 — Phase B1: the Underwriting surface (the bridge, the board, the rename)
- FINDINGS FIRST: (1) the sweep provisions ACTIVE (non-stale) Submitted+
  deals only — the brief's bare rule would room 14 dead Options ghosts and
  15 more stale files; the brief's own ~10 expectation confirms the
  active-only reading. Stale files get rooms when groomed back to life.
  (2) VOCABULARY: the workbench stage field already carries the intake
  pipeline's words (in_progress, underwriting, approved, funded); the board
  MAPS both vocabularies onto its five columns (lib/underwriting-bridge
  COLUMN_BY_STAGE; unknown stage lands in Evidence with a loud amber raw-
  stage chip) rather than rewriting rooms. (3) Days-in-state has NO history
  column; the card shows days since updated_at, labelled days idle.
  (4) DEVIATION: the bridge is a NEW workbench write path (service-secret
  machine path on fox-underwriting, the CRON_SECRET pattern) — a system
  actor like the intake pipeline, NOT a human decision path; decisions stay
  gates-only. Manual "Start underwriting early" rides the same endpoint but
  gates on the NEW admin-only key underwriting.provision. (5) Screenshots
  not captured this session (session limits); the board's data path was
  verified live end-to-end instead (sweep + census below).
- SHIPPED: fox-underwriting migration 0033 (partial unique index on
  deals.zoho_potential_id — race-proof idempotency; deal_type gains
  'unknown') + POST /api/bridge/rooms (BRIDGE_SECRET; empty containers
  only, stage 'intake'; funded→stage funded; Cancelled/Declined/Lost→status
  dormant; audit entries provisioned_by bridge|manual with the Zoho stage).
  Portal: lib/underwriting-bridge.ts (pure plan, display-space Submitted+
  from PIPELINE_STAGE_ORDER, tested), lib/underwriting-sweep.ts (runner),
  sweep route (Clerk deals.view or x-bridge-secret; publicRoutes additive,
  bookkeeping precedent), n8n schedule 3GoLqTD9SyGxLdmN (6h, credential
  ju9Qj1NJTOg8P0SB, errorWorkflow BeRBcxNv1bQjx5v8), and the board at
  /portal/admin/underwriting (Intake→Evidence→Conditions→Ready to submit→
  With lender; funded+dormant behind a toggle; not-yet-bridged strip with
  two-tap Start underwriting early; sweep on page load). NAV RENAME (IA
  note): Deals → Underwriting; /portal/admin/deals redirects permanently
  (next.config.js); deal ROOMS keep /deals/[id]; Today strip Open falls
  back to the not-yet-bridged strip, never a page missing the file.
- TEST ROOMS OUT, STRUCTURALLY: lib/test-rooms.ts isTestRoom (TEST- prefix
  or status marker) applied at the getDealsSummary fetcher boundary — one
  predicate, every consumer. TEST-GATES-COND-1 superseded live with audit
  5838848d (it was still active — the seam Michael found). Test rooms stay
  visible to the suite and demo fixtures.
- LIVE ACCEPTANCE: first sweep provisioned EXACTLY 4 rooms — BRXM-F059751
  (in Intake untouched), BRXM-F057400, BRXM-F056361, BRXM-F054033 —
  reconciling exactly to the 6 active Submitted+ files minus the 2 already
  roomed (BRXM-F053107, BRXM-F053725). Second sweep planned 0 (idempotent live).
  Census after: 10 rows = 7 real (4 intake + in_progress + approved +
  funded) + 3 TEST all superseded. deal_type mapped renewal/refi/renewal/
  purchase; Zoho ids + Finmo UUIDs linked. tsc clean both repos, build
  green, suite 501 tests green.
- Guardrails: nothing deleted anywhere; gates decision paths untouched;
  readonly portal role untouched (the bridge lives server-side in
  fox-underwriting); no payloads logged; env via REST (encrypted).


### 2026-07-14 — Command Centre shell redesign, Phase A: calm machine, loud exceptions
- FINDINGS FIRST: (1) the brief's companion mockup
  (fox-command-centre-redesign-mockup.html) is NOT in the repo, the docs, or
  anywhere on this machine (repo find + Spotlight) — the brief's own written
  spec (tokens table, IA table, Desk copy, component standards) served as
  the visual contract. (2) The IA table MISSED two nav surfaces, both kept:
  ROADMAP (placed in System) and the PORTALS block (View-as + five portal
  quick links; kept as its own sidebar section above the footer,
  portals.view-as-gated as before). (3) The brief's Desk example includes
  "1 manual match" and says all sources are already computed — manual
  matches are NOT passively computable (the backfill scan is on-demand and
  priced in Zoho contact searches; no scan result persists). DEVIATION: the
  fragment type exists in the pure builder and lights up the day a scan
  result is persisted; until then the count stays null (backlogged).
  (4) lib/renewals-store.ts carries NO demo guard (pre-existing); the desk
  path skips it in demo (files re-flag, the conservative direction).
  (5) One place the lime rule needed its sanctioned exception: the keyboard
  focus ring on dark surfaces is decision-lime BY THE BRIEF'S OWN RULE 4 —
  enumerated in the audit test, not quietly broken.
- THE LIME RULE, enforced by test: the new `decision` token (#C6F53F, ink
  #3D4F0A) renders ONLY in group dots, item badges, the Desk strip's
  fragment links, decision-card top borders + primary actions, the bell's
  decision badge + Decide-lane unread dot, and the dark focus ring.
  tests/shell.test.ts walks the shell component sources and fails on any
  lime/decision class outside the enumerated files and roles. Active nav is
  ink-navy3 (the OLD shell's active state was bg-lime — a rule violation on
  day one, gone). Tokens in tailwind.config.ts: ink.navy/.navy2/.navy3,
  fog, hairline, muted/.2, decision/.ink, caution/.bg, danger, shadow-card.
  Fonts VENDORED via @fontsource-variable/archivo + fraunces (OFL),
  imported in the admin layout only; font-ui = Archivo, font-greeting =
  Fraunces (the Home greeting line ONLY — the face clients see on Fox
  documents).
- IA: config/admin-nav.ts became five groups (Today | Pipeline: Deals,
  Approvals, Renewals, Opportunities | Market: Rates, Lender intel,
  Knowledge | Practice: Revenue, Partners, Compliance, Bookkeeping,
  Directory | System: Audit log, Changelog, Status, Users & settings,
  Roadmap) + ASK_FOX as the sidebar footer button. RENAMES (nav-IA note per
  the standing rule): Home → Today, Intel → Lender intel, Audit Log →
  Audit log, Settings → Users & settings; Ask Fox left the mid-list nav.
  S-session tags came off the nav. scopeNavForRoles: agent-ONLY role sets
  see Today/Pipeline/Market/Ask Fox (presentation scoping on top of can(),
  never widening; verified live — a direct URL to /portal/admin/revenue as
  agent bounces exactly as server authz always did). lib/effective-access
  gained ASK_FOX so the Settings matrix still states it per role.
- THE DESK: lib/desk.ts is the count layer — computeDeskCounts(user)
  sources the SAME loaders the owning pages render (getApprovalsData's
  actionable queues; appearsRenewedPending — a pure shared walk EXTRACTED
  into lib/renewals.ts and now called by BOTH the Renewals page and the
  desk, reconciliation by construction; the review bucket via the board's
  own analyzeMortgage path). deskFragments/deskBadges are pure and
  unit-tested. GET /api/portal/admin/desk (deals.view; sections filtered by
  the caller's permissions) feeds the sidebar badges + group dots (mount +
  focus + 5-minute poll). Home computes the same counts server-side for the
  strip — and its four separate approvals fetchers were REPLACED by the one
  shared getApprovalsData call, so Home's rail, the strip, and the
  Approvals page count the same actionable (park-partitioned) queues.
- HOME above the fold: Fraunces greeting (Good morning/afternoon/evening,
  {first name} + date + funded-YTD sub-line behind revenue.view), the
  navy DeskStrip ("Waiting on you: … Everything else is running on its
  own." / the proud empty "Nothing needs you right now."), up to three
  decision cards (lime top border = decide, amber = review, verb CTAs),
  and the compact pipeline table (client, stage pill, amount, closes,
  NEXT STEP in plain words via nextStepForStage — display-space keys,
  unknown stage gets an honest generic; Open links into the deal room
  where the workbench join matches). computePipeline gained activeDeals
  (additive). EVERYTHING below the fold kept: rail, KPI strip, stage
  table, tasks, pacing, rates tile, closings.
- BELL: badge counts DECISIONS — unread Decide-lane items only
  (NOTIFICATION_LANES in lib/notifications.ts: decide = sheet_review +
  pending_offers; watch = renewals/credentials/sync/intake; log =
  gate_decision_external). THE 88-UNREAD FIX with teeth: the notifications
  route now auto-marks-read any unread Decide item whose dedupKey is not in
  the freshly produced current-signal set — a decision made on the desk or
  in the CLI is not pending. Live: decide-lane unread went 63 → 1 (the one
  genuinely pending sheet); Watch keeps its read state; nothing deleted.
- PALETTE: one box, two talents — the existing ⌘K search plus an "Or ask"
  row handing the raw query to Ask Fox (/portal/admin/agent?q=…;
  AgentChat auto-sends q like prep). Restyled to tokens (its active-row
  lime highlight is gone). Trigger copy: "Search or ask".
- SHELL: components/admin/AdminShell.tsx rebuilt — ink-navy sidebar
  (248px), collapsible 68px icon rail persisted per user
  (localStorage fox_rail_v1:{userId}; badges become lime dots on icons
  when collapsed), white topbar on fog with the collapse toggle + palette
  + bell, mobile drawer preserved, DemoBanner intact, focus-visible rings
  (decision on dark, ink-navy on light), motion-safe transitions only.
- TESTS (tests/shell.test.ts, 26): route inventory walks
  app/portal/admin/**/page.tsx and asserts every route has a nav ancestor
  (the nothing-removed proof) + every nav href resolves to a real page;
  agent scoping fixtures; desk fragment/badge builders incl. the brief's
  exact sentence; appearsRenewedPending flag/decline/no-export cases; the
  lime audit; lane mapping; nextStepForStage; rail/motion/focus statics.
  tests/demo.test.ts gained the desk zero-real-reads proof (fetch spy;
  getRateQuotesFull skipped in demo — the demo export is empty anyway).
- VERIFIED LIVE (dev server + dev Clerk instance; TEST users
  shell-admin/shell-agent +clerk_test created and REMOVED after):
  admin Home renders the strip with the real live sentence ("1 rate sheet
  to approve · 53 flags to resolve · 1 file to score · 3 renewals to
  confirm · 15 files in review"), decision cards, the compact pipeline
  (incl. tonight's BRXM-F059751 at Submitted → "Review the application and
  collect documents"), badges Approvals 55 / Renewals 3 / Opportunities 15
  with group dots; bell 63 → 1 after the stale-decide reconciliation;
  collapsed rail persists across navigation; the legacy Rates page renders
  unchanged inside the new shell; agent Home shows the scoped nav + the
  proud empty Desk + no funded figure; the palette hands "best 3 year
  fixed for a rental" to Ask Fox. tsc clean, production build green,
  suite green (count in the report).
- Guardrails held: no route deleted or feature dropped (test-proven), no
  new authority keys, server-side authz untouched, readonly workbench
  (desk reads ride existing loaders), demo zero-real-reads on the new
  surfaces (tested), copy rules on all new UI strings (sentence case,
  verbs on buttons, no em dashes), PII discipline (TEST users only on the
  dev instance, removed; screenshots not committed), fonts vendored not
  hotlinked, public site fonts/pages untouched.

### 2026-07-13/14 (night, addendum) — Stage guard, portal stage vocabulary, deal naming
- THE FINDING FIRST (contradicts the brief's parenthetical): the Deals Stage
  picklist carries DISPLAY/ACTUAL pairs that differ on five used stages, and
  Zoho READS (records API + COQL, everything the portal and the sync's
  searches consume) return the DISPLAY value while WRITES take the ACTUAL
  value. Verified live by getFields + a grouped COQL read ('Mortgage Funded'
  48, 'Conditionally Approved' 2, 'Underwriting In Progress' single-t 1 —
  all display forms). The brief said "portal reads must key on actual
  values"; the truth is inverted — the portal correctly keys on display, the
  sync correctly writes actual, and the GUARD was broken precisely because it
  compared the two spaces directly. The double-t typo is real and lives in
  the ACTUAL value only: 'Underwritting In Progress' (displays single-t).
  Pairs: 'Application Pending'→'Application Started', 'Underwritting In
  Progress'→'Underwriting In Progress', 'Application Sent To Lender'→
  'Conditionally Approved', 'Ready To Close'→'Broker Complete', 'Mortgage
  Closed'→'Mortgage Funded' (+ unused 'Closed Lost to Competition'→
  'Mortgage Lost').
- CHECK 1 (Finmo Sync v2, Build Deal Payload + Apply COQL Result; atomic ops
  + publish, active version 5fd50c60): STAGE_ORDER was 7 actual-space stages;
  the guard's unknown-current branch OVERWROTE — so every display-space read
  ('Conditionally Approved', 'Underwriting In Progress'…) and every hand-set
  stage outside the list (Collecting Documentation, legacy Options/Pending/
  Archive) fell to currentIdx===-1 and was clobbered by whatever Finmo
  mapped. Now: STAGE_ORDER = all 13 hand-settable stages (used picklist) in
  ACTUAL space, funnel-ordered by picklist probability, 'Underwritting In
  Progress' matched as stored, 'Mortgage Closed' last so funded history
  never rewrites; STAGE_READ_ALIASES canonicalizes display-space reads
  before comparison; an unknown NON-NULL current stage is PRESERVED with a
  loud 'Stage preserved (unknown to stage order)' error on Finmo_Sync_Error
  (null current still writes — the create path); borrower.update strips the
  new noise like the old. ADJACENT GAP fixed while in there: the COQL-confirm
  path (search-index lag) wrote dp.Stage UNGUARDED because Build Deal Payload
  had guarded against a null current stage — Apply COQL Result now re-runs
  the guard against the COQL-found live stage using the order/aliases
  EXPORTED from Build Deal Payload (_stageOrder/_stageReadAliases/
  _terminalStages — one definition, never duplicated).
- CHECK 3 (deal naming): create-only Deal_Name is now '{fileRef} — {primary
  borrower full name}' (space em-dash space; primary = isMainBorrower, else
  earliest-created, mirroring Extract Borrowers Array so the name matches
  Contact #1; bare reference when no borrower name). REPORT-ONLY finding:
  NO automated renamer exists — the fimoextension marketplace flow births
  deals already named (one file's creation event carries the full name), and
  bare sync-created ones were Michael's to fix by hand (the F059751 deal renamed
  crm_ui 22:03 tonight, no automation attached; workflow rules BLU023E/
  BLU055 fire on deal edits but never touch Deal_Name). One legacy stray:
  the F057400 deal name carries a plain hyphen, hand-typed variant.
- VERIFICATION (n8n side): a local harness ran the REAL node code (fetched
  back from n8n post-update, byte-identical to the reviewed files modulo a
  trailing newline) against 22 fixtures — the acceptance pair (Collecting
  Documentation + in_progress keeps its stage with the loud error; create
  with primary borrower → 'BRXM-FTEST01 — First Last'; without → bare ref),
  alias forward-motion ('Conditionally Approved' + approved → writes),
  alias protection ('Underwriting In Progress' + in_progress → kept),
  unknown-legacy preservation (Options + funded → kept + loud), terminal
  still writes, the backfill missed-create exemption intact (now with the
  named Deal_Name), COQL re-guard suppress/forward/error-as-not-found, and
  borrower.update noise-stripping. 22/22.
- CHECK 2 (portal, display space by design): STAGE_WEIGHTS gained
  'Submitted': 0.15 (re-enabled stage, probability 25, between Application
  Started .1 and Collecting Documentation .2) and 'Conditions Fulfilled':
  0.75 (probability 50, beside Conditionally Approved — an initial .8 was
  caught by the new monotonicity test contradicting the funnel);
  PIPELINE_STAGE_ORDER rebuilt as the true 13-stage funnel (Lead → Pending →
  Application Started → Submitted → Collecting Documentation → Options →
  Underwriting In Progress → Ready to Submit → Submitted to Lender →
  Conditionally Approved → Conditions Fulfilled → Approved → Broker
  Complete — the old 5-stage order had Conditionally Approved BEFORE
  Underwriting In Progress); the display/actual indirection documented at
  the top of config/pipeline.ts. UNMAPPED IS LOUD: lib/pacing.ts
  unmappedPipelineStages (pure, tested; a configured zero weight is mapped,
  not flagged) renders an amber unmapped-stage flag on the Home pacing card
  and the Revenue goal-pacing section (stage, files, volume, "counted at
  zero weight until mapped"), and the conversion-funnel row shows an amber
  'unmapped' chip instead of the old quiet 'w 0'. The deal board already
  derives its stage list from live data (never silent). Tests: pacing suite
  gained the unmapped helper cases + a stage-vocabulary contract (every
  funnel stage weighted, weights non-decreasing along the funnel, every
  sync-written display value resolves). tsc clean, 461 tests green,
  production build green.
- ACCEPTANCE, live: BRXM-F059751 | Stage Submitted |
  $359,000 | closing 2026-09-29 | not stale → rides the weighted pipeline
  at $53,850 (0.15 × 359,000; weighted total $2,462,280); unmapped-stage
  list EMPTY (all seven live open display stages weighted). Temp verify
  script deleted.
- Guardrails held: n8n edits atomic + publish (never deactivated;
  errorWorkflow BeRBcxNv1bQjx5v8 intact), no Zoho record writes (reads +
  field metadata only; the timeline read is a read), readonly workbench
  untouched, PII discipline (file refs only in prose; borrower
  fixtures synthetic), copy rules on the new UI copy.

### 2026-07-13/14 (night) — Finmo Sync v2 hardened: error workflow, heartbeat, burst-proofing, the repairable H13, and the gap replayed
- WHERE: the n8n Cloud instance via the MCP connector; no repo code changed
  (this ledger entry is the only commit). FINDINGS FIRST:
  (1) The brief's two referenced files are NOT on this machine —
  .tokens-DO-NOT-COMMIT.txt and phase3-finmo-zoho-sync-spec.md exist nowhere
  in foxmortgage-ca or fox-underwriting (and the token filename is not even
  gitignored). The backfill token's single source of truth is the constant
  inside the workflow's own Verify Backfill Token node (plus 1Password); the
  replay extracted it from there programmatically, never printed. The spec
  checks for Task 3 were grounded in the workflow itself + the live
  executions instead.
  (2) The backfill contract is NOT a date-range replay: it is a thin
  per-application trigger ({applicationId, dealId?}) that forces
  _eventType='application.statusChange' and was built for EXISTING deals
  (Zoho-button refresh). As built it could never repair a missed create —
  a missing deal routed straight back to H13 (execution 15155 proved it).
  FIXED with a one-line exemption in Build Deal Payload
  (_dealNotFoundForStatusChange now false for syncSource==='backfill'), so
  Michael's token-gated backfill CREATES when the deal is missing (full
  payload already built: the statusChange field-trim always exempted
  backfill); the realtime path still never guesses.
  (3) TWO PRE-EXISTING DEFECTS found live during the replay and fixed:
  Apply COQL Result rebuilt context from its own INPUT — but its input is
  the COQL HTTP node's response body, so on the (also-broken:
  OAUTH_SCOPE_MISMATCH, the Zoho credential lacks ZohoCRM.coql.READ — the
  documented prod gap) COQL error, the ENTIRE context was obliterated,
  _isNewDeal read undefined, and the flow PUT to /Deals/undefined
  (INVALID_URL_PATTERN). Now the context re-reads from Build Deal Payload
  and an error response counts as not-found, never confirmation. AND Build
  Junction Payload hard-referenced the skippable 'Update Module-Exists
  Cache' node — referencing an unexecuted node THROWS (the author's own
  ternary guard threw before falling through), killing every warm-cache
  borrower sync; now probed via try/catch. Both shipped as atomic updates
  + publish on the ACTIVE workflow (never deactivated).
- TASK 1: error handler workflow BeRBcxNv1bQjx5v8 ('Sync Error Handler —
  Email Michael': Error Trigger → Resend httpRequest, credential Resend API
  Paperclip iJa8AHPr58GmNMda, from michael@app.foxmortgage.ca, carries
  workflow name + execution id + failed node + error + execution link) set
  as errorWorkflow on Finmo Sync v2. VERIFIED BY LIVE FIRE, not synthetic:
  the replay's real failures fired it 13/13 successes (mode 'error'), each
  an email to Michael. INVENTORY (counts only, per the brief): 41 active
  workflows; 39 carry NO errorWorkflow — only Finmo Sync v2 and the new
  heartbeat do. Attaching to the rest is Michael's prioritization call.
- TASK 2: heartbeat 9c6IUbuqA4GIIsQw ('Finmo Sync v2 — Heartbeat
  (dead-man check)', ACTIVE, every 12h, America/Toronto, errorWorkflow set
  to the handler): reads the n8n API with the EXISTING X-N8N-API-KEY
  credential (Z6kTlazhhYUsONyS — no new credential minted), alerts when the
  sync is DEACTIVATED (the incident class: deactivation makes absence, not
  errors) or has zero executions in WINDOW_HOURS. Dry-runs: happy path
  (active, recentCount 1, no alert) and the forced-alert branch (FORCE_ALERT
  flag; Resend message b6fcf52b sent, flag reverted). CADENCE FINDING per
  the brief's ask: retained history shows 2+ day quiet stretches while the
  sync was healthy (zero executions 07-06→07-08 12:59 within the retention
  window), so zero-in-24h WILL false-alarm on quiet stretches. Shipped at
  the brief's 24h anyway (not silently widened); PROPOSAL: widen to 72h by
  editing the one labeled WINDOW_HOURS constant if the alerts read as noise
  — Michael's call.
- TASK 3: document events now terminate BEFORE the heavy path. New IF
  'Document Event? (early out)' between Signature Valid? and Library
  (signature verification stays upstream — nothing unauthenticated gets a
  200) matching the document signature (body.documentTemplate.id + body.id
  + body.status — the same structural test the classifier used, which is
  why the 2026-07-08 burst's documentRequest events were headed through
  Library/hash/idempotency before their out-of-scope 200: TEN concurrent
  heavy preludes crashed the instance). Verified by pinned-data manual
  execution 15167: a synthetic documentRequest-created payload routed to
  'Respond 200 — Document Event (early, out-of-scope)' and Library NEVER
  RAN. (A live signed simulation is impossible by design: Finmo signs
  RSA-PSS and only Finmo holds the private key.) The crashed executions
  and all history retained; nothing deleted.
- TASK 4: the H13 email now carries the repair. Prepare HITL — H13 states
  the actual event type (the old template hardcoded application.statusChange
  — 15155 was actually borrower.update), names the Finmo file ref
  (_lendeskApplicationId), and appends a copy-paste Terminal command that
  PROMPTS for the backfill token (paste from 1Password; never embedded in
  the email) and triggers the per-application backfill. With fix (2) above,
  a confirmed missed create is now a one-command repair; wrong-match and
  stale-event cases stay with Michael's eyes. Test render verified incl.
  the token-not-in-email check.
- TASK 5, THE REPLAY: Finmo's list endpoint is 403 no_access for
  integration tokens (fox-underwriting finding, cross-checked), so the gap
  cannot be enumerated from Finmo — the replay set was BRXM-F059751's
  create (UUID recovered from execution 15155's retained data) plus a
  refresh of every OPEN-stage Finmo-linked Zoho deal (9; terminal-stage
  deals left alone — the stage guard would block regressions and nothing
  actionable changes post-terminal). Backfill bypasses idempotency by
  design (user-initiated force-resync), so the second pass after the fixes
  fully re-ran. RECOVERED: BRXM-F059751 CREATED in Zoho
  (7112178000006038003, Finmo_Application_UUID d4e2494a-d375-41b0-b483-
  7e13ed05daa7, Synced/Backfill, Stage Submitted, Renewal, $359,000,
  closing 2026-09-29 — the named acceptance, verified by COQL);
  BRXM-F057400 Conditionally Approved → APPROVED (a real missed transition);
  BRXM-F053725 Conditionally Approved → APPROVED; BRXM-F025547 →
  Approved (Partial: unmapped Finmo Payoff_Status value, H16 emailed);
  BRXM-F050350 refreshed clean. NOT RECOVERABLE, for Michael's hand
  reconciliation: (a) five open files whose Finmo applications the
  integration token cannot fetch — 403 Forbidden resource on
  BRXM-F056361, BRXM-F053107, BRXM-F054033,
  BRXM-F054420, BRXM-F057623 (their REALTIME syncs fail the same way;
  hypothesis: archived or cross-team applications — ties to the open
  FP-partner cross-team question; each failure emailed via the new handler);
  (b) any OTHER application created during the outage is structurally
  invisible until its next Finmo event fires an H13 — which is now a
  one-command repair.
- Ancillary observations, not acted on: 'application_update_event' rows in
  Zoho (e.g. one contact record synced 23:14Z tonight) come from a DIFFERENT flow
  than Finmo Sync v2 — its event vocabulary contains no such type;
  TEMP-named workflows and the archived TEMP errorWorkflow-inventory
  workflow (yPMel3O2aWPsA5mp, mine, archived after one run) remain for
  housekeeping. Michael's inbox received ~13 error-handler emails + assorted
  H3/H13/H16/H11 HITLs + one TEST heartbeat alert tonight — each one honest,
  and the volume itself is the error workflow proving it works.
- Guardrails held: workflow never deactivated (atomic ops + publish), token
  neither rotated nor committed nor printed, HITL sender/pattern unchanged,
  crashed executions + history retained, PII from execution payloads not
  propagated beyond deal refs/UUIDs, no repo code commits beyond this entry.

### 2026-07-13 (late) — Rates grid regression: the 1,000-row response cap, not the deploy
- THE FINDING, against the brief's expectation: NO commit caused this — neither
  aa3c1ea (Part 2; touched zero rates surfaces, diff-proven) nor the two other
  same-day portal deploys (8698c2c's lib/eligibility.ts change is comment-only;
  0139325 touched only the RatesScenario tier-count display). The mechanism:
  Supabase's PostgREST caps EVERY response at 1,000 rows (db-max-rows)
  regardless of the limit param. getRateQuotesFull asked for limit=5000,
  ordered as_of_date.desc — the moment last night's parser-session approvals
  (duca 58, radius 34, meridian 10, cmls/highclere refreshes + the superseded
  rows they minted) pushed approved+superseded to 1,765 rows, the fetch
  silently kept only the newest-sheet 1,000 and whole lenders whose sheets are
  older fell off the tail. Reproduced EXACTLY: the page's own functions over
  the ordered first-1000 yield 11 live cards + the brief's exact 24-chip list;
  unordered they yield 20; paginated they yield 22. The chips never demoted
  anyone (coveragePending always excluded live slugs) — the truncation emptied
  the live set and every lender has intel history, so they fell through to
  chips. BLAST RADIUS (the real severity): getRateQuotesFull feeds the
  scenario matcher, Opportunities, the savings PDF, Ask Fox, and Renewals —
  on tonight's truncated book the Opportunities board read act_now 1 /
  stay_put 12 (two genuine calls suppressed because their best comparables
  fell off the page); the full book restores act_now 3 / stay_put 10, the
  verified buckets.
- THE FIX (fetch layer, systemic): lib/underwriting.ts uwSelectAll — offset
  pagination at the 1,000-row server page size until a short page, an id.asc
  tiebreak appended to the order (offset pages are unstable under equal sort
  keys), a mid-pagination failure fails the WHOLE read (partial data must
  never present as complete), and a loudly-logged 20k-row runaway backstop.
  All 13 fetchers with limits >= 1000 converted (the rate-quote family,
  queues, counts), plus getIntelItems (full history — a failing parser's
  newest item can be arbitrarily old, so a recent-300 window would hide
  exactly the lenders coverage exists to name) and its rate_sheet_reviews
  join (agent-scoped + in-memory, the in.(ids) URL grew without bound).
- COVERAGE METRIC, redefined per the brief's policy (lib/lender-browse.ts):
  the grid is "who can Michael quote", the chips are "whose sheets can't we
  read". A chip now requires the lender's NEWEST rates-class intel item to be
  extraction_failed or no_pipeline; deferred history (status new, behind the
  extract-floor) and promo/program/guidelines/unknown classes never count; a
  lender with ANY approved quotes never chips (belt: approvedSlugs excluded
  even when the card is withheld by an eligibility fail-close — a restricted
  book is a quoting question, not a parser question); a LIVE lender whose
  newest rates sheet failed keeps its card with a "newer sheet needs
  attention" badge naming the failing file (LenderCard.newestSheetFailed),
  never a demotion. Chips carry {status, receivedAt, fileName} so each is
  explainable by a named failing item. The live CMLS shape is the tiebreak
  test: failed AVEO sheets at 14:59Z under an extracted 15:02Z main sheet →
  no badge, no chip.
- PROVINCE-EXCLUDED ARRIVALS, parked (lib/sheet-park.ts + approvals-data +
  desk + bell): sheets from lenders whose registry provinces exclude every
  serviceable market (SERVICEABLE_PROVINCES = ['ON']; kootenay/coast-capital
  today) are partitioned out of the actionable sheets queue onto a collapsed
  "Parked: province-excluded" shelf with the registry fact + as-of; the tab
  count and the notification bell see only the actionable queue; release is
  AUTOMATIC (the park re-derives from the registry each render — a live
  registry confirming a serviceable province un-parks with no action).
  Parking requires affirmative evidence: unknown/national never parks.
  STATED DEVIATION from the brief's item 5: the literal status='held' +
  held_reason + audit entry is NOT portal-implementable — the portal cannot
  write the workbench (database-enforced) and the rate-sheets gate vocabulary
  is approve|reject only (no hold; gates tokens are browser-minted, so no
  server-side auto-decision path exists either). True held-at-arrival belongs
  in the fox-underwriting extraction pipeline (or a new gates hold action) —
  follow-up recorded on the roadmap backlog.
- THE NULL-SLUG ITEM (brief item 6): identified — b1cfd0c1, received
  2026-07-13T15:54Z, "Alterna Rates July 13 2026.pdf", class rates, status
  new: the lender is ALTERNA SAVINGS (Ontario credit union); the ingest has
  no 'alterna' slug so lender_slug_guess stayed null. The portal cannot
  assign it (intel lifecycle is workbench-owned; no gates endpoint) —
  fox-underwriting follow-up: add the alterna slug and backfill the guess.
  VISIBILITY shipped: the Lenders tab now renders an "N captured rates
  sheets with no lender identified" panel naming each null-slug rates item
  and its received date — never silently unbucketed again.
- LIVE AFTER (computed through the fixed pipeline against the live book):
  approved book 1,257 across 25 lenders (matches the brief's verified
  numbers; the earlier 947/23 and 1,000/24 reads were the cap's lie); live
  cards 22 (scotia, first-national, rfa, b2b, neo, npx, manulife,
  nbc-optimum, radius, meridian all back; withheld by DESIGN: kootenay +
  coast-capital province-ineligible, shinhan restricted-only book);
  awaiting 0; coverage pending 6 (aspire, bloom, first-ontario, sdc, servus,
  tru — each with its named failing sheet); parked shelf currently empty
  (tonight's kootenay quotes are no longer pending); Opportunities buckets
  act_now 3 / marginal 9 / stay_put 10 / review 15 / insufficient 4.
- Verified: tsc clean, production build green, suite 455 tests green
  (lender-browse rewritten to the new policy + the acceptance fixtures,
  sheet-park 4, demo coverage of the touched fetchers with the documented
  lender-data-stays-real posture). Temp readers deleted.
- Guardrails held: readonly workbench (pagination is GETs through the same
  role; no writes anywhere), no Zoho writes, no gate decisions fired, demo
  silent on the queue/coverage surfaces, no client-facing copy changes
  beyond internal-surface labels, PII discipline (counts/slugs only; the one
  temp export read deleted).

### 2026-07-13 — Task 0 (term policy, graduation class, the lapsed pool) + Part 2 (the client report rebuilt)
- TASK 0a (graduation prices conventional only): the Part 1 leak was the
  SWITCH path — analyzeMortgage's graduation target class inherited baseClass,
  and a near-maturity B file ports insuranceToProductClass(feed 'Insurable'),
  so the A-target graduation flag priced the insurable 4.29 an uninsurable
  move to new paper can never have. FIX: gradClassFor(target) = target 'b' →
  'b_side', else 'conventional' — ALWAYS; a graduation is a new application on
  better paper and the current mortgage's insurance class never travels with
  it, whatever the transaction window. Tests: the switch-basis B fixture
  (insurable 4.29 + conventional 4.59 A quotes) graduates on 4.59; a
  refinance-basis B fixture with ONLY insurable+insured A quotes gets NO
  graduation flag. Live: the B file's flag now reads conventional 4.39 (3-yr),
  never 4.29.
- TASK 0b (term policy): the comparison horizon is the CLIENT's
  (naturalComparisonHorizon: refinance = months left on the current term;
  switch = clientTermMonths(feed term, plausible 6-120, else 60)), and
  eligibleComparablesRanked ranks covering quotes (term >= horizon) by
  effective rate FIRST, then shorter terms longest-first — so the default
  headline covers the projection or, when nothing covers, the longest
  available leads and analyzeOpportunity SHORTENS the horizon to its term
  (never projecting a short rate past its term). A shortened projection or a
  cheaper shorter same-tier same-family quote beside a covering headline is a
  ShortTermStrategy flag (applied vs beside; reasoned note; logged with role
  short_term_flag), and act_now on a shortened horizon is DEMOTED to marginal
  until Michael's two-tap stp=approve (POST-only on the PDF route, exactly the
  alt/grad pattern; approval headlines the play, shortens the projection, and
  records shortTermApplied on the log). Term renders beside every rate:
  board headline/alternative/graduation/override/short-play lines
  (comparableTermLabel), the log's quotes[] (already carried termMonths;
  asserted), OverrideInfo gained termMonths, and the client report (Part 2
  amendment). savings_analysis_log: SAVINGS_CALC_VERSION 3; inputs gained
  termMonths + shortTermApplied (v2 rows replay gracefully: absent fields
  default to the 60-month standard and unapproved); replay passes
  shortTermApproved through and reproduces the shortened bucket exactly.
  LIVE RE-RUN (real export, counts only, temp readers deleted): buckets
  UNCHANGED — act_now 3 / marginal 9 / stay_put 10 / review 15 /
  insufficient 4 (identical to Part 1's after-buckets). The CONTENT moved:
  the B file's act_now was re-evaluated and STANDS because the feed says the
  client's own term is 12 months, so the 4.69% 12-month b_side quote
  genuinely covers the like-for-like horizon (the brief's 5.04 5-year concern
  presumed a longer horizon; net $3,619 over 12 months, switch basis, no
  penalty); 0 files carry a shortened-horizon headline; 11 A-tier files carry
  a beside short-term-play flag (a cheaper shorter quote exists under their
  covering headline — informational, approval-gated).
- TASK 0c (the lapsed pool): shipped the durable structural rule —
  isRenewalPoolDeal(stage, dealName) = isFundedStage (both spellings) AND NOT
  isAdditionalPropertyRecord (name conventions: '- Additional Property',
  '<addr> - REF - first/second/third Mortgage', '<addr> - BRXM/IFMS-ref');
  the fetcher applies it and fixtures assert a funded-staged Additional
  Properties child (including the two children of lost BRXM-F021892) never
  enters the pool while bare refs always do. FINDING FIRST, against the
  brief's expectation: the three extra rows (IFMS-F011671 $375k, IFMS-F002599
  $1M, IFMS-F007027 $350k = exactly the $1,725,000 difference; pinned by
  arithmetic AND by the 2024-25 + 2026 subtotal reconciliation) are NOT
  Additional-Properties children. Verified record-by-record via live COQL +
  getRecord: all three are stage 'Mortgage Funded' with bare-ref names and
  full deal fields — prior-TERM private-lending rows whose stories continued
  (F011671 → renewed as F012754, and the property's BRX file BRXM-F020719 is
  Mortgage Lost; F002599 → renewed as F021782; F007027 → BRXM-F020722 is
  Archive). The pool query already filtered funded stages; no structural
  marker distinguishes these rows, and hardcoding ids or writing their
  outcomes without Michael was out of bounds. So LIVE: pool 18/$11,004,023
  under the corrected rule; appears-renewed suppression recomputed against it
  flags 6/$5,800,000 (F002599 + F002684 + F021782 + F034244 start_after_close
  and/or rate_changed, BRXM-F024213 rate_changed, IFMS-109548
  start_after_close) → TRUE RESIDUAL 12 files/$5,204,023. Michael's path to
  the brief's 15/$9,279,023: record the three rows' outcomes on the radar
  (renewed elsewhere / no longer needs — F002599 already sits in the
  appears-renewed strip with its confirm/decline) or groom their stage; after
  that the residual reads 10/$4,479,023.
- PART 2 (the client report, rebuilt): lib/savings-pdf.ts is the three-page
  choice document per the design brief, faithfully translated in pdf-lib
  (draw-at-coordinates, manual wrap): PAGE 1 masthead (lime square + wordmark,
  SAVINGS ANALYSIS + date, navy rule, client name on pages 2-3), eyebrow +
  serif display headline ("Two ways this refinance can pay you" / renewal
  variant / "One way" when option 2 cannot compute), lede, OPTION CARDS (navy
  "OPTION 1 | LOWER PAYMENT: $X a month back, payment A to B, same payoff
  plan" beside white/lime-top "OPTION 2 | SAME PAYMENT: N yrs sooner, about
  $Y never paid, on today's rate"), the RATE STRIP (rate + TERM + sheet date,
  "from a lender we work with" — NEVER the comparable lender's name; desk
  rates carry source framing; same-category line; share-on-the-call line),
  and DRAWN AMORTIZATION BARS (staying the course vs same payment at the new
  rate, lime tail = years returned). PAGE 2: the side-by-side table at the
  HORIZON END (rate with term, payment highlight, balance today, payoff plan,
  interest paid by <month year>, balance at <month year> highlight — Today /
  Option 1 / Option 2), then the penalty POLICY-BOUND: 3MI stated as the
  MINIMUM, the break-even penalty stated ("this works if your penalty comes
  in under about $X"), a drawn GAUGE (green to the break-even tick, red
  beyond, navy dot at the minimum), the method-known/unknown confirm path,
  and the why-we-won't-guess callout box; floating prints the exact-penalty
  read; a switch prints no-penalty-at-renewal. PAGE 3: conditional framing
  cards for a fixed break (at the minimum / near the break-even / above it —
  no verdict anywhere), the SMM callout ("even a wait is a win... finds the
  month the numbers flip"), three steps, the navy CTA band (phone in lime),
  and bold-led fine print (estimates + date; the rate is real + term + sheet
  date or desk framing; pricing category + requalification; the
  penalty-not-knowable paragraph for fixed; lifetime-figures assumption; the
  legal part). Option 3 (debt consolidation) never renders — the SMM feed
  carries no debt data, exactly as the brief anticipated. NEW ANALYSIS
  DERIVATIONS (no arithmetic in the render layer): FoxAnalysis.samePaymentPlan
  (monthsToRetire closed-form inversion; months sooner; payments avoided) and
  FoxAnalysis.comparison (balanceForward generalization of the schedule;
  today/option1/option2 positions at the horizon end), both computed in
  analyzeOpportunity and logged in figures (breakEvenPenalty logged too), so
  every figure on the page is in the savings_analysis_log row and replays.
  savingsPdfInputFromAnalysis is the ONE mapper (route + golden tests share
  it; the route's inline mapping deleted). Unapproved escalations NEVER
  print: the cross-family alternative block is gone from the document (card
  only); approved cross-family/graduation/short-term qualify the headline
  with their risk/approval/strategy note.
- ADVERSARIAL REVIEW (self, before commit; all fixed + regression-tested):
  (1) a stay_put file with a small positive saving would have received the
  three-page "choice" document — the dispatcher now routes ANY stay_put to
  the one-page wait document; (2) when the 3MI MINIMUM already exceeds the
  break-even (marginal fixed shapes), page 3's "at the minimum we move"
  conditional was dishonest — that shape now states even-the-minimum-does-
  not-clear-the-bar; (3) a marginal FLOATING file reached the conclusion
  branch and would print "worth about $-800" — conclusions now require
  act_now AND positive net; (4) breakEvenPenalty printed on the page but was
  not a logged figure — added to savingsLogFigures; (5) the golden fixtures
  initially did not reconcile (wrong invented balances) — recomputed on
  schedule via balanceAfter. DEVIATIONS from the briefs, stated: fonts are
  the sanctioned Helvetica/Times fallback (no OFL TTFs vendored, fetching
  binaries out of session bounds); demo mode still REFUSES the PDF route
  (the brief's "watermarked demo output" presumes demo fixtures this surface
  does not have — zero real reads and zero log writes hold trivially);
  Task 0c's corrected pool did not move to 15 because the three rows are
  verifiably not child records (finding above).
- Verified: tsc clean, production build green, suite 445 tests green
  (smm-analysis +11 incl. Task 0a/0b acceptance, smm +7 term primitives +
  horizon caps + report derivations, savings-log v3 + short-term replay +
  quote-term sweep, renewals +4 pool membership, savings-pdf rewritten as 20
  golden/honesty/scrub tests incl. three-pages-exactly, no-lender-name,
  no-forbidden-punctuation, term-string, and the 9137-bps sentinel sweep over
  every string field on every branch shape). Golden page 1 rendered and
  eyeballed (faithful: cards, strip, bars, no lender name).
- Guardrails held: readonly workbench (reads only, temp verification reader
  used the same readonly key and was deleted), NO Zoho writes (COQL reads
  only; the three phantom rows were NOT resolved or re-staged — Michael
  decides), FOXCA narrow functions only (log append-only by trigger,
  untouched), approved-only quoting with sheet dates + terms, adjustable/
  variable + tier families never collapsed, no estimate stated as an actual,
  redactComp over every client string (sweep extended to the new fields),
  demo silent, copy rules on all new client copy (no em dashes, no
  exclamation points, no semicolons in prose, contractions, grade 6, "finds",
  Mortgage Agent Level 2), PII discipline (real export outside the repo,
  counts/refs only, temp readers deleted), no ANTHROPIC_API_KEY in
  subprocesses.

### 2026-07-13 — Tiers, appears-renewed, overrides (Part 1 of the two-part brief; Part 2 = the report rebuild, NOT started)
- TASK 1 (lender tiers, like-for-like by default): tier ('a'|'b'|'private',
  absent = unknown) seeded on fox-underwriting/knowledge/lender-registry.json
  (22 of 24 entries; npx + highclere honestly absent; program-level override
  modeled — fn.programs.excalibur tier b while fn is a; every seed
  tier_confirmed:false, Michael confirms with provinces). Portal mirror
  config/lender-tiers.ts (quote-slug keyed, tierFor fail-closed null,
  graduationTargets, unconfirmedTierCount surfaced on the Rates page beside
  the province count). The FEED map is explicit per string:
  SMM_LENDER_ALIASES entries gained tier (+program); NormalizedLender.tier;
  unmapped strings fail closed to null. analyzeMortgage: mortgage tier =
  current-paper tier; unknown tier OR an A-tier rate >= 8% / > prime+3
  (tierRateMismatch) routes to 'review' via opts.tierBlockReason;
  comparables are SAME-TIER only (quote lender tier must be KNOWN and
  equal); B paper prices class 'b_side' (LIVE FINDING: every approved
  B-tier quote is b_side — the hard 'conventional' class starved B files
  until classForTier mapped it); private has no book class at all →
  honest-insufficient. GRADUATION (b→a, private→b/a, per-target-tier class)
  is a FLAG (rate + sheet date, NO payment figures) attached even to
  insufficient analyses; pricing it takes Michael's two-tap POST
  (grad=approve on the PDF route, manage-gated) which headlines it with the
  qualification note. Acceptance locked in tests: Westboro-shaped 9.99%
  private never receives an A comparable (insufficient + graduation flag);
  Excalibur-shaped prices b_side only; seasoned A fixture unchanged
  (4.59/$244.12); unknown tier → review; 9.5% on an A-mapped lender →
  review.
- TASK 2 (appears_renewed): detectAppearsRenewed (lib/smm-match.ts) fires on
  feed start date > Zoho Closing_Date + 90d (RENEWAL_START_TOLERANCE_DAYS
  absorbs the closing-to-first-payment offset), lendersDiffer, or rate delta
  > 0.1; missing data never fires a signal. RENEWAL_FIELDS + RenewalDeal
  gained Closing_Date. Radar: flagged files are SUPPRESSED out of Action
  now + Lapsed into a violet Appears renewed section with both sides'
  evidence and the pre-suppression delta stated; the Opportunities board
  suppresses flagged households out of act_now into a strip linking to
  Renewals. Confirm = the existing enumerated status route with the NEW
  action renewed_with_us writing EXACTLY ONE field (Renewal_Status =
  'Renewed With Us' — the picklist value arrived 2026-07-13; it joins
  RESOLVED_STATUSES so a confirmed win resolves; the old "no won value"
  note is deleted). Decline = new POST route recording
  appears_renewed_declined + mandatory reason to renewal_events; detection
  excludes declined deals. LIVE: radar Action 8/$4,142,100 → 5 flagged
  ($2,840,300); Lapsed 18/$11,004,023 → 6 flagged ($5,800,000); signals
  skew rate_changed (10) + start_after_close (7) — rate-only flags can be
  stale Zoho data rather than renewals, which is exactly what
  confirm/decline is for.
- TASK 3 (manual override): FOXCA smm_overrides (migration 20260713200000,
  applied live; retire-not-delete; functions smm_override_set/-_retire/
  -_active). POST-only route /api/portal/admin/opportunities/override
  (opportunities.manage, demo-refused, mandatory reason 5+): book_quote is
  VALIDATED BY CONSTRUCTION — the card picker is populated from
  overrideCandidates (approved + eligible + SAME tier, every family; b →
  b_side class) and the route re-derives the list and matches
  comparableKey, so a BC/restricted/wrong-tier/unapproved quote can never
  be picked OR matched; desk_rate takes lender/rate(0.5-25)/type/term
  (6-120mo) + MANDATORY source note — Michael is the gate, but the figure
  renders with source framing ("quoted to Michael directly (…), not a
  published sheet rate"), never a sheet date, and bypasses the province
  gate on the PDF (his quote is the confirmation). The override drives
  analyzeMortgage (suppresses alternative/graduation; the reconciliation
  and tier review gates still OUTRANK it — a blocked file stays blocked),
  badges the card (Override active + reason) and the PDF ("Prepared with
  Michael's desk rate."), and rides savings_analysis_log (inputs.override +
  top-level override column). Tests: log row with reason+actor, exact
  replay of overridden figures, BC-pick refusal, POST-only file assertions,
  demo-silent store.
- TASK 4 (hygiene): savings_analysis_log is append-only BY PHYSICS —
  BEFORE UPDATE OR DELETE row trigger + BEFORE TRUNCATE statement trigger
  raise (proven live: privileged UPDATE and DELETE both refused P0001).
  Placeholder guard COMPLETED this session: a $1 amount/balance routes to
  'review' (was insufficient) and the backfill scan skips + apply REFUSES
  placeholder rows (the live proving case was a $1 file offering a
  2030-01-01 maturity write); panel shows the placeholder count. Task-8
  leftovers CONFIRMED ALREADY DONE last session (stated, not redone):
  monthsElapsed boundary fixtures (tests/smm.test.ts BOUNDARY +
  tests/smm-analysis.test.ts), the drift-denominator docstring
  (reconcileBalance: denominator = MODELED balance, always), the
  ahead/grew direction word (BalanceReconciliation.direction + the review
  card blockReason).
- ADVERSARIAL REVIEW (mandatory; verdict initially BLOCKED on findings 1-4,
  all fixed before commit): (1) HIGH — the board's appears-renewed scan
  covered EVERY maturity-bearing deal while decision cards exist only for
  the radar's action/lapsed pools, so a monitoring/watching file could be
  suppressed with no confirm/decline affordance anywhere, and confirms
  never cleared the strip (fixed: board detection scope = EXACTLY the
  radar action+lapsed pools; a confirm resolves the deal out of those
  pools and the strip together); (2) MED-HIGH — rate_changed fired on
  floating clients (feed rate moves with prime vs Zoho's origination
  rate: one prime move would flag the whole floating book) and declines
  were forever (fixed: rate_changed is a FIXED-feed signal only, and a
  decline is scoped to appearsRenewedEvidenceKey — the flag returns when
  the feed later changes; live effect: action-pool flags 5/$2.84M →
  2/$1.42M, the floating false positives gone); (3) MED-HIGH — a stored
  floating book-quote override froze its effective rate + prime at set
  time and the PDF paired it with TODAY's prime as-of, a false statement
  (fixed: refreshComparablePricing reprices variance-carrying overrides at
  today's per-lender prime at use time; desk rates pass through as
  stated); (4) MED — the override route derived candidates with a UTC
  date, flipping the transaction window near midnight ET (fixed:
  torontoTodayYMD); (5) MED — the b2b 'a' seed contradicted its own
  source note (prime AND alternative programs): b2b is now deliberately
  UNKNOWN on both maps + the registry (the live B2B file now routes
  fail-closed to tier review), and a lockstep test pins the two
  hand-written tier maps together; (6) LOW — the desk-rate PDF's
  disclaimer claimed a sheet date that document does not have (fixed:
  conditional copy); (7) LOW — comp-scrub sweep gained the
  overrideSourceNote + approvalNote sentinel shape (closed pre-verdict);
  (8) LOW — board kept the OLDEST active override while the PDF kept the
  newest under a concurrency race (fixed: both keep newest); (10) LOW —
  a B file's empty state said "conventional" (fixed: productClass is
  tier-aware, b_side). ACCEPTED, noted: (9) decline durability rides
  recentRenewalEvents(500) — past 500 events old declines resurface
  (conservative direction); overrides have no staleness bound beyond the
  visible sheet date + one-tap retire; smm_override_set is
  retire-then-insert without a lock (rare double-active now resolves
  identically on both surfaces). Reviewer confirmed clean: no path where
  an unapproved, wrong-tier, placeholder, or blocked figure reaches a
  client PDF; replay sound for overridden/tier-blocked/graduation/
  placeholder/legacy rows; copy rules clean.
- LIVE COUNTS (real export + live Zoho/workbench, counts only; temp readers
  deleted): tiers of the 41 monitored mortgages: a 37 / b 1 / private 1 /
  unknown 2 (one EMPTY lender string — already honest-insufficient on its
  missing rate — plus the B2B file, fail-closed after review finding 5).
  Buckets AFTER: act_now 3, marginal 9, stay_put 10, review 15,
  insufficient 4 (insufficient = 3 LTV-capped refinances at 91.9/80.1/104%
  + the no-rate row; the placeholder moved from insufficient into review).
  The all-A emulation (closest before-proxy; the true pre-tier bucket
  split was never measured with the book) reads act 3 / marginal 9 /
  stay 10 / review 16 / insufficient 3 — totals barely move; the CONTENT
  moved: the B file's act_now is now a same-tier b_side saving (Excalibur
  4.69, graduation flag to A 4.29 beside it), not a manufactured A-rate
  one, and the private file shows only the graduation flag.
  Appears-renewed after the fixed-rate guard: Action now 2 of 8 files
  ($1,424,800 of $4,142,100) and Lapsed 6 of 18 ($5,800,000 of
  $11,004,023) — the $910k proving case flags on start_after_close.
- Verified: tsc clean, production build green, suite green (count in the
  session report), fox-underwriting registry + CLAUDE.md guardrail 18
  added (tier fail-closed).
- Guardrails held: readonly workbench (reads only), Zoho writes only through
  the enumerated confirmed-action routes (one new: appears-renewed decline,
  FOXCA-only), FOXCA narrow functions only + append-only log by trigger,
  approved-only quoting with sheet dates (desk rates framed as
  direct quotes, never sheet rates), adjustable/variable + tier families
  never collapsed, redactComp on every new client string, demo silent on
  every new store surface (tested), copy rules on client-facing text, git
  push only, no ANTHROPIC_API_KEY in subprocesses. PII: real export outside
  the repo, counts/strings only, temp readers deleted.

### 2026-07-13 — Final correctness pass (Tasks 5+6+7+8): penalty honesty, like-for-like, the reproducible record
- STEP 0: the stacked Task 3+4 work committed as two clean commits (977c778
  payment correction, 5bf4d03 backfill fix + session docs) and deployed via
  git push; production deploy dpl_9JeGhEfLymQsKJN4wyhZ5qVTpVtB READY on
  foxmortgage.ca before any new edit.
- TASK 5 (lib/savings-pdf.ts): the PDF no longer concludes on the penalty
  floor. For a FIXED penalty the 3MI figure is stated as "the minimum, not
  the final figure"; the BREAK-EVEN PENALTY (monthly saving x horizon — the
  number that decides it) is stated; the act-now conclusion is replaced by
  the honest block (differential could exceed the break-even and erase the
  gain; "Nothing is recommended until it is in hand") and the floor-based
  pays-for-itself line is suppressed — for EVERY fixed break, method known
  or not. DELIBERATE DEVIATION from the brief's item 4 (which kept the
  conclusion where the method is documented), forced by adversarial review
  finding 1: knowing a lender's IRD METHOD never produces an IRD FIGURE
  (penaltyEstimate uses the 3MI floor either way), so a known-method
  conclusion was the same indefensible claim behind a predicate that
  guarantees nothing. Method-known changes only the confirm path ("Michael
  knows how <lender> calculates it and will walk the estimate through; the
  lender confirms the exact amount"); unknown-method says only the lender
  can state it. The MARGINAL branch (review finding 2) qualifies its claim
  for a fixed break: "Counting only the minimum penalty, the numbers are
  close to even... the real penalty can only be that minimum or more, so
  moving today does not clear the bar." DESIGN CALL: wait/stay-put
  conclusions at the 3MI floor stand — a larger true penalty only
  strengthens them. Floating unchanged (3MI IS the penalty); a switch keeps
  its conclusion (no penalty, nothing floor-based); board bucketing
  unchanged (3MI floor, IRD disclosed).
- TASK 6a (ranking): every floating ranking is on the EFFECTIVE rate from the
  per-lender prime; prime_variance is display, never sort order.
  lib/scenario.ts compareMatches' floating-only deepest-discount branch
  deleted (every view now sorts by effective; unpriceable rows still sort
  last, deepest discount first); dead bestFloatingDiscount deleted from
  lib/smm-match.ts (zero callers; it ranked on variance). FINDING, stated
  honestly: the cross-lender rankings in THIS repo (lenderResults lender
  ordering, bestEligibleComparable) already ranked on effective rate — the
  variance-primary sort was within-lender only (one prime, same order) plus
  the dead function; the convention LINE was the live hazard and is corrected
  in fox-underwriting CLAUDE.md §3 AND docs/gates-api.md ranking-semantics
  (both dated 2026-07-13). Locked by a two-prime test (bestEligibleComparable:
  P-1.00 on 5.50 PLR = 4.50 loses to P-0.40 on 4.45 = 4.05) and a scenario
  test (cu-own-prime override: deepest discount sorts last).
- TASK 6b (like-for-like): bestEligibleComparable gained a rateFamilies
  param (exact rateType match — adjustable and variable NEVER collapse).
  analyzeMortgage: headline = the client's own family (clientRateFamily;
  unknown defaults to fixed, the payment-stable family); the cheaper
  cross-family option attaches as FoxAnalysis.alternative (same remaining
  amortization, monthlySaving, rateFamilyRiskLine with the ~$64/0.25%-prime
  quantifier for adjustable targets); crossFamilyApproved flips the headline
  ONLY when the cross option is actually better, sets crossFamilyRecommended
  + headlineRiskLine, and demotes the like-for-like to the labelled steady
  option. Surfaces: OpportunityCard renders the alternative + risk line and a
  TWO-TAP "Report with the adjustable option" link (canManage only); the PDF
  route accepts ?alt=approve gated by opportunities.manage, province-gates
  the alternative like the headline (fail-closed), and the generator prints
  the labelled alternative block + mandatory risk line under an approved
  cross-family headline. ACCEPTANCE LOCKED: seasoned fixture headlines
  conventional FIXED 4.59 (sheet 2026-06-30) relief $244.12; the P-0.50
  adjustable (3.95) is the labelled alternative at $409.84 with the risk line;
  fixed never floating-headlined without the flag; variable client never
  silently headlines an adjustable (honest-insufficient when the family has
  no quote). BEHAVIOR CHANGE flagged: a client whose rate family has no
  eligible comparable is now insufficient (was: priced against any family).
  BRXM-F053724 anchor stands at $3,357.46, now headlined by the ADJUSTABLE book.
- TASK 7 (reproducibility): FOXCA migration 20260713150000 applied live —
  savings_analysis_log, APPEND-ONLY by grants (RLS on, no policies, table
  grants revoked; verified live: select/update/delete all 42501; the only
  surface is savings_analysis_record/-_batch/-_recent, security definer,
  anon EXECUTE; no update/delete function exists). lib/savings-log.ts:
  SAVINGS_CALC_VERSION = 2 (v1 = the implicit pre-Task-3 math), canonical
  sorted-key sha256 inputs_hash, buildSavingsLogEntry (household id, upload,
  surface, quotes with sheet dates + role, prime as-of from the mirror,
  bucket, cent-rounded figures, cross_family_approved, acting email),
  replaySavingsAnalysis reconstructs the row and RECOMPUTES through the same
  analyzeOpportunity + monthlyPayment (alternative recomputed from its quote,
  never echoed). The PDF route logs EVERY generation (dedupe false); the
  board render logs one batch deduped on (household, surface, calc_version,
  inputs_hash) so a re-view writes nothing and a new upload/book/math writes
  fresh rows. Tests: replay reproduces figures exactly (default + approved
  cross-family), hash canonical + moves with inputs, demo writes nothing
  (fetch-spy). Live: dedupe proven (second insert returns null), TEST row
  retained per append posture; workbench portal_readonly write still refused
  42501.
- TASK 8: monthsElapsed boundary fixtures (started the 21st, analysed the
  12th/13th → not yet a full month; the completing day counts) at both the
  pure and analyzeMortgage level (23 elapsed / 277 remaining / reconciles);
  reconcileBalance docstring states the drift DENOMINATOR = the MODELED
  balance, always, plus a direction field ('ahead' = feed below model, a
  prepaying client; 'grew' = feed above model, a readvance/refi/interest-only
  story — the three biggest live drifts are all 'grew') carried into the
  review card's blockReason; 949/24-lender staleness swept in both repos
  (lib/eligibility.ts + tests/eligibility.test.ts comments, CLAUDE.md header,
  fox-underwriting provincial-availability report annotated) — live-verified
  2026-07-13: approved book 947 rows across 23 lenders, zero test slugs.
  lib/rates-pdf.ts uses pdf-lib (draw-at-coordinates; wrap measures with
  font.widthOfTextAtSize). Backfill click path: /portal/admin → Opportunities
  (nav) → "Backfill Zoho" button on the Latest upload card →
  /portal/admin/opportunities/backfill → "Scan N files".
- ADVERSARIAL REVIEW (mandatory, run over the full diff; verdict initially
  BLOCKED the commit): (1) HIGH — the known-IRD-method act-now conclusion was
  still floor-based (fixed as above: no fixed break concludes); (2) MED-HIGH
  — the marginal branch claimed "close to even" on the floor (fixed:
  qualified copy); (3) MED — the cross-family approval was a replayable GET
  query param and logged an approval even when nothing applied (fixed: the
  approved variant is POST-only from the card's two-tap form, GET can never
  approve, and the log records the APPLIED state); (4) MED — the alternative
  block and approved headline stated a computed floating effective rate as a
  printed sheet figure (fixed: pricedPhrase renders discount-first with the
  effective labeled "at today's prime of X%, as of <prime as-of>", on the
  PDF and the card); (5) LOW — "A adjustable rate" article (fixed by the
  reword); (6) LOW — the comp-scrub sweep did not cover the four new string
  fields (fixed: alternative + risk-line sentinel shape added); (7) LOW —
  the board discarded the batch log result (fixed: loud console.error) and
  dedupe is best-effort under concurrency (documented in the migration —
  harmless, append-only). Review confirmed clean: fail-closed alternative
  province gate, review/insufficient never print figures, null rate type
  resolves to fixed everywhere, families never collapse, replay genuinely
  recomputes, no client name in the log, no em dash/exclamation/broker/
  vendor-name in new client copy.
- Verified: tsc clean, production build green, full suite green (count in the
  session report).
- Guardrails held: readonly workbench (42501 write refusal re-proven), FOXCA
  narrow functions only (new log table functions-only + append-only), Zoho
  untouched, approved-only quoting with sheet dates everywhere (the log
  carries them), adjustable/variable never conflated (now a tested family
  boundary), redactComp over every new client string (scrub suite extended),
  demo silent on the new store writes (tested), copy rules on all new client
  copy, git push only, no ANTHROPIC_API_KEY in subprocesses.

### 2026-07-13 — Backfill shared-identity fix: a match is a (contact, mortgage) pair
- THE COLLISION (not the collapse — collapseCoBorrowers stays untouched): six
  people hold 2+ mortgages each with the same email on every export row. The
  backfill matched by email > phone > name to a CONTACT and proposed each
  mortgage's Maturity_Date/Mortgage_Rate into ALL of that contact's deals — so
  both mortgages resolved to one person and proposed DIFFERENT values into the
  same records. Live stake: the BRXM-F053724 client's Zoho maturity reads 2026-11-18
  (wrong; the export confirms 2031-06-18), inflating the Renewal Radar
  Action-now bucket by $635,000 — and the repair system was the one most
  likely to overwrite it with the other mortgage's date.
- THE FIX (lib/smm-match.ts, pure): identityClaimants(m, all) computes the
  export mortgages sharing any borrower identity signal (email, normalized
  phone last-10, full name — union over co-borrowers). decideMatch now takes
  the claimant count and a single contact hit with claimants > 1 resolves to
  the NEW bucket 'shared_identity' (contactId known, mortgage binding not) —
  a signal mapping to more than one export mortgage is ambiguous by
  definition, never 'matched'. attributeDeals(claimants, deals) then binds the
  contact's deals by evidence: property address first (addressKey = house
  number + first street token, so "22 Birch Ave" = "22 Birch Avenue"; a
  non-numbered line only matches on normalized equality), amount second (1%
  tolerance). A deal matched by none or by SEVERAL claimants is contested
  (null) and is never proposed into.
- SCAN route: shared_identity households propose ONLY into deals uniquely
  attributed to them (contested count noted on the card); when nothing is
  attributed, the result is 'needs_manual_match' carrying every claimant
  (household, name, address, amount, maturity, rate) and every contested deal
  (street/city/amount + current values). The BackfillPanel dedupes those to
  ONE card per CONTACT and renders per-deal radio picks ("this deal belongs
  to:") + the field checkboxes + the two-tap confirm.
- APPLY route — the confirmed-action write gate is UNCHANGED and stricter:
  same server-side re-match, deal-belongs-to-contact check, empty-at-write-
  time-only recomputed fills, enumerated field keys, FOXCA audit. Added: for
  shared_identity the dealId must be evidence-attributed to THIS household,
  OR carry Michael's explicit manualMatch pick — accepted only for a
  CONTESTED deal (a deal the evidence attributes to a DIFFERENT mortgage is
  refused even manually) and recorded in the audit as 'ok (manual match)'.
- lib/zoho-admin.ts AGENT_DEAL_FIELDS gained Street (additive; the
  disambiguator needs the address evidence; FP-portal-confirmed field).
- TESTS (tests/smm-match.test.ts, +8, suite 376): identityClaimants (shared
  email, co-borrower email with distinct phones/names so only the email can
  link), decideMatch shared_identity, addressKey tolerance, attribution by
  address/amount, contested-never-guessed (no evidence, and an amount BOTH
  mortgages carry), and the ACCEPTANCE fixture: two mortgages + one email +
  one contact + evidence-less deals → both households shared_identity, zero
  deals attributed (zero automatic proposals), one card keyed by the contact.
- LIVE (real export, counts only per the PII rule; temp reader deleted):
  41 mortgages → 6 shared-identity groups covering 13 households (five pairs
  + one THREE-mortgage person; 7 distinct shared emails). All 13 now route
  through attribution/manual-match instead of proposing automatically. The
  live Zoho attribution outcome (how many auto-attribute by address/amount vs
  land on cards) needs an authenticated scan — manual step for Michael:
  open Backfill, re-scan, and expect the needs-a-manual-match section; the
  BRXM-F053724 household pair is the proving case (fix the 2026-11-18 maturity via the
  card or directly in Zoho — the export says 2031-06-18, a CONFLICT the
  backfill will list but never write).
- Verified: tsc clean, production build green, 376 tests. NOT COMMITTED —
  working tree left for Michael's review (stacked on the same-day SMM payment
  correction below).
- Guardrails held: Zoho writes only through the confirmed-action apply route
  (now stricter), no workbench writes, PII discipline (synthetic committed
  fixtures, live run counts-only), copy rules in new UI copy, demo posture
  untouched.

### 2026-07-13 — SMM payment correction: the stated current payment + the reconciliation gate
- THE BUG (client-catchable, on a client document): lib/smm.ts analyzeOpportunity
  derived currentPayment as payment(current balance, current rate, feed
  amortization) — but the feed's "Mortgage amortization (months)" is the
  ORIGINAL amortization, so every seasoned mortgage's stated payment was
  understated ($2,930.59 printed vs the true $3,051.96 on a 24-month-old
  $500k/5.50%/300mo file: $121.37/mo off). The commitment calc anchor
  ($3,357.46, BRXM-F053724, $635k @ prime−0.40=4.05% adjustable, 300mo) is
  STRUCTURALLY incapable of catching it — the file closed 2026-06-18, zero
  months elapsed, balance = original amount, both methods agree exactly. That
  is how a validated engine and a green suite shipped a wrong payment.
- THE FIX (lib/smm.ts; analyzeMortgage in lib/smm-analysis.ts unchanged as the
  ONE shared per-mortgage path — board, savings PDF, Home rail all confirmed
  still calling it): currentPayment = monthlyPayment(original amount, rate,
  original amortization), NEVER a re-amortized balance; monthsElapsed(start,
  analysisDate) whole-month convention (day-of-month not reached = not
  counted, future start clamps to 0); remainingAmortizationMonths = original −
  elapsed, carried on FoxAnalysis (this is also what makes a
  shorter-amortization option computable later); newPayment prices the balance
  at the comparable rate over remainingAmort — since the gate proves the
  balance sits on the original schedule, subtracting currentPayment IS the
  rate-isolated delta at the remaining amortization (identity within the
  drift bound). Rate isolation itself untouched per the task.
- THE GATE (new, fail-closed): balanceAfter/reconcileBalance model the balance
  forward from origination (closed form over the same semi-annual compounding
  core — periodicRateForFrequency imported from refinance-engine, engine
  reused never forked) and compare to the feed balance. Drift >
  RECONCILIATION_DRIFT_BLOCK_PCT (0.5%, denominator = modeled) → NEW bucket
  'review': no figure stated (currentPayment/newPayment/netBenefit all null),
  blockReason carries both figures + drift %, reconciliation object attached.
  The gate runs BEFORE the LTV gates (a balance that does not reconcile makes
  the LTV claim undefendable too) and jointly validates an assumed
  amortization (a wrong assumption presents as drift). Missing amount or start
  date → insufficient with the gap named (an unverifiable payment is never
  stated). Prepayments, ARM rate changes, and bad vendor data all present as
  drift BY DESIGN — an accelerated-biweekly client's real payment genuinely
  differs from the monthly reconstruction.
- SURFACES: Opportunities board gained the "Needs review" bucket (amber,
  between Act now and Marginal; hint states both-figures-and-drift show on the
  card); OpportunityCard renders blockReason for review and excludes review
  from the Fox-vs-service disagree banner; the savings PDF gained a review
  branch that prints NO figure at all (not even the feed balance — it is the
  thing in question) placed before the current-mortgage section, and the PDF
  route lets 'review' outrank the showComparable/'insufficient' mapping.
- GOLDEN SET (tests/smm-analysis.test.ts + tests/smm.test.ts): SEASONED
  fixture (24 months elapsed) asserts $3,051.96 stated, 276 remaining, drift
  <0.01%, and explicitly that the re-amortized $2,930.59 is >$100 away (the
  divergence the old anchor could never show); corrupt-balance ($455,000)
  fixture asserts the gate blocks to review with both figures in blockReason
  (drift 5.23%); unseasoned commitment-anchor fixture still returns $3,357.46
  (±$0.01 per policy 5.1); missing-start-date → insufficient. Pure-model
  tests: monthsElapsed conventions, balanceAfter reproduces the worked
  example to the cent ($480,116.51 after 24), reconcileBalance both ways.
  Existing fixtures updated to be schedule-coherent (smm.test.ts rowFor now
  starts 2026-06-05 at balance=amount; the LTV-cap test carries amount $665k /
  start 2026-03-01 so the gate passes at 0.21% and the LTV block is what
  fires; the smm-analysis base row start 2024-02-07/480k already reconciled
  at 0.25%). savings-pdf tests: review branch prints no balance/payment/rate,
  + a review shape in the comp-scrub sweep. All figures cross-validated
  against the engine formula independently (python) before coding.
- LIVE IMPACT (real export, counts only per the PII rule; temp test read
  ~/fox-local/SMM/ and was deleted): 41 mortgages, 0 missing amount, 0
  missing start date; 25 reconcile (median drift 0.02% — the schedule model
  is essentially exact on clean files); 14 route to review (drifts 0.53–1.7%
  ×11, consistent with accelerated/prepay clients; 7.28/8.92/13.72% ×3,
  consistent with bad vendor data); 2 already insufficient. Board buckets
  will shift accordingly — this is the intended fail-closed cost: those 14
  were previously analyzed on figures that do not withstand reconciliation.
- Verified: tsc clean, production build green, 368 tests (was 358).
  smm_report.py (the task's reference implementation) was not present on this
  machine; the logic was ported from the task's worked example and
  cross-validated to the cent against the engine and the FN commitment anchor
  (fox-underwriting fixtures/extractions/BRXM-F053724-commitment.json).
  NOT COMMITTED — changes left in the working tree for Michael's review.
- Guardrails held: readonly workbench untouched, no Zoho writes, calculator
  reused never forked, no estimate stated as an actual (an unreconciled
  figure is now never stated at all), compensation scrubber intact (review
  shape added to the sweep), PII discipline (real export outside the repo,
  counts only, temp reader deleted), copy rules in all new UI copy.

### 2026-07-13 — Collapse mirror 1: the eligibility derivation is deleted
- FINDING FIRST (task step 1): the preference DID fire — no silent fall-through.
  All five evaluateQuote call sites (scenario eligFields, smm-analysis
  comparableEligible + bookQuoteFromRow, renewals renewalBenchmarkEligible,
  lender-browse ×2) mapped eligibilitySource from the row; getRateQuotesFull
  selects the columns; the backfill is confirmed run (947/949 approved rows
  carry eligibility_source; the 5 nulls are test-portal, 2 approved + 3
  superseded; all 62 unionlink rows carry channel_requirement). The derivation
  was a dead fallback reachable only by test rows already excluded as TEST.
- DELETED: deriveEligibility, baseStem, all six stem maps,
  EXCLUSIVE_PARTNER_LENDERS, effectiveEligibility, eligibilityIsWorkbenchServed.
  QuoteEligibilityFields lost variant/programNotes (no longer eligibility
  inputs); BookQuote and ApprovedFixedQuote lost them too. evaluateQuote reads
  the five columns verbatim. Grep proof: the only remaining references are the
  module-absence assertions in tests/eligibility.test.ts.
- FAIL-CLOSED (two conditions): eligibility_unknown=true OR eligibility_source
  IS NULL → 'unclassified'/'eligibility_unknown' program_restricted; never
  qualifier-unlocked; a pin unlocks INTERNAL ranking only — includedInClientDoc
  hard-blocks undisclosedRestriction even pinned (an unnameable restriction
  cannot be confirmed). A null source is an unclassified Roam arrival.
- GOLDEN TEST REWRITTEN: portal verdicts vs the workbench columns (fixtures
  byte-shaped like live rows incl. the Scotia physician row), the absence
  proof, fail-close, and the acceptance surface sweep (a 3.99% null-source
  quote loses to a 4.59% classified one on scenario/Ask Fox, lender-browse,
  Opportunities/savings-PDF comparable, Renewals benchmark; client docs refuse
  it outright). Fixtures across scenario/renewals/smm-analysis/lender-browse
  tests now model classified rows (eligibilitySource 'variant:(none)'); the
  physician/mortgage-plus scenario tests carry the columns, not the variant.
- LIVE PARITY: fixture re-run under column-truth reproduces the derivation-era
  outcomes exactly (41 mortgages: marginal 14 / stay_put 13 / insufficient 6 /
  act_now 8; the proving client = First National conventional adjustable P−0.50/3.95%).
  tsc clean, build green, 358 tests.
- THE OTHER THREE MIRRORS (plan, not rewritten — each needs a decision):
  1. config/lender-provinces.ts ← knowledge/lender-registry.json. Blocker: the
     Gates knowledge endpoints need a browser-minted Clerk token (azp), which
     server surfaces (Opportunities board, savings PDF, Ask Fox) cannot mint.
     Cheapest authoritative path: fox-underwriting publishes the registry into
     a portal_readonly-granted table (or bundles it into the health-style
     unauthenticated surface — it is lender data, not borrower data); portal
     then reads it live everywhere and the config mirror deletes. Failure mode
     to design for: fail-closed means a fetch failure downgrades every lender
     to 'unknown', which silently REINTRODUCES the Kootenay bug's inverse
     (everything withheld from client docs) — so the fetch must fall back to
     last-known-good with its as-of, never to empty. Provinces change ~never;
     a stale cache is safe if labeled.
  2. config/prime.ts ← knowledge/prime.json. Same token blocker for server
     surfaces; the Rates page already reads rates-reference live. Same fix
     shape (granted table or FOXCA last-known-good cache of the served
     reference). Failure mode: floating comparables become unpriceable — the
     honest degradation is discount-only display (already the house pattern)
     and the Opportunities comparable falls back to best fixed. Riskier than
     provinces because prime MOVES: a stale mirror misprices every floating
     effective rate, so this mirror should collapse BEFORE the next prime move.
  3. lib/mortgage-engine.ts ∥ fox-underwriting/src/calc. Not a data mirror —
     parallel deterministic CODE. The dependency rule (foxmortgage-ca depends
     on fox-underwriting, never the reverse) means the engine belongs in
     fox-underwriting, published as a package the portal consumes; interim
     containment is a shared golden-vector file asserted on both sides (cent
     anchors already exist). No live-fetch failure mode; the cost is packaging
     and release discipline.
- Guardrail 15: BOTH CLAUDE.md files updated (this header + ledger; the
  fox-underwriting CLAUDE.md gains the backfill-confirmed + portal-reads-columns
  note so its classifier is documented as the single source).

### 2026-07-12 — Lender eligibility, client constraints, and the cost of a preference
- THE LIVE BUG (found by Michael on a live client): Kootenay Savings + Coast
  Capital are BC credit unions that cannot write an Ontario deal; Kootenay held
  the deepest floating discount (P−1.91) and led nearly every floating scenario,
  proposed as her best comparable. Prereq verification (live, read-only role +
  the local fox-underwriting repo at ~/Desktop/fox-underwriting): the
  provincial-availability micro-session SHIPPED (knowledge/lender-registry.json
  serves provinces; only coast-capital=['BC'] + kootenay=['BC'] confirmed, all
  22 others "unknown"); the eligibility micro-session's migration 0032 is
  applied (rate_quotes has borrower_requirement/client_commitment/
  channel_requirement/transaction_types/eligibility_unknown/eligibility_source)
  but the BACKFILL NEVER RAN — 949 approved rows, ZERO with any eligibility
  column set. No channel-access registry or program definitions populated.
- CORE MODEL (mine, careful, tested): lib/eligibility.ts — deriveEligibility +
  baseStem + all stem maps are an EXACT port of fox-underwriting
  src/skills/extract/eligibility.ts (golden-test parity, byte-identical logic
  confirmed by a reviewer diff); the portal derives from variant+programNotes
  because the workbench columns are empty, and prefers them via eligibilitySource
  when the backfill lands (effectiveEligibility). resolveProvince over
  config/lender-provinces.ts (server mirror of the registry; a live registry map,
  passed on token surfaces, overrides per-slug; UNKNOWN_FACT default = fail-
  closed). channelHeld (config HELD_CHANNELS: unionlink held per Michael
  2026-07-12; pmpp/other exclusive channels excluded). evaluateQuote → category
  {eligible | province_ineligible | province_unknown | channel_unavailable |
  transaction_mismatch | program_restricted}; includedInRanking (eligible +
  program_restricted under showRestricted; province-unknown IN, flagged),
  includedInClientDoc (eligible AND province-confirmed only). REQUIREMENT_SENTENCE
  fallback for restricted-card sentences (registry programs preferred when
  populated). tests/eligibility.test.ts (22).
- SCENARIO (lib/scenario.ts): matchQuote = structuralMatch + the eligibility
  gate (attaches verdict); scenarioExclusions buckets the excluded lenders for
  the "N excluded" notes; Scenario gained subjectProvince/borrowerProfiles/
  commitments/showRestricted with the URL round-trip (prov/bp/cc/restricted).
  RatesScenario UI (via a build workflow): qualifier toggles (physician/net
  worth/business-for-self/new-to-Canada + move-banking/quick-close), show-
  restricted, restricted rows amber with their requirement sentence, province
  "availability not confirmed" chips, five collapsible exclusion notes. Fail-
  closed change is intended: an unrecognized variant is now eligibility_unknown
  → restricted → excluded from default (two scenario tests updated to assert it).
- PART 1c (transaction → product class): lib/smm.ts deriveTransaction (maturity
  >120d or unknown = refinance; ≤120d = switch), computeLtv, MAX_REFI_LTV 80 hard
  block, analyzeOpportunity gained transaction/ltv/ltvBlocked/requalification/
  penaltyApplies/horizonMonths/blockReason (refinance horizon = remaining,
  switch = new term; switch no penalty). lib/smm-match.ts bestEligibleComparable
  (HARD product-class match, eligibility-filtered, fixed printed + floating
  effective via config/prime.ts mirror, SANE_RATE_FLOOR 0.5 guards a bad
  variance, prefers a floating quote's printed rate). lib/smm-analysis.ts
  analyzeMortgage: refinance→conventional, switch→original class; bookQuoteFromRow
  shared by board+PDF+Home rail. Fixture re-run (real export, PII-safe, counts
  only): 20 of 41 opportunities change bucket (9 stay_put→marginal, 3
  stay_put→act_now, 4 stay_put→insufficient [LTV cap / no eligible comparable],
  4 marginal→act_now). the corrected comparable = First National
  conventional adjustable P−0.50 → 3.95% (was the Kootenay ~2.54/3.59% fantasy);
  both of the client's files are refinances under 80% LTV.
- ASK FOX: search_rates returns eligible lenders only (BC excluded via the
  scenario gate; province_confirmed flag per lender + an excluded summary),
  prompt v3 rule 2a (never quote an ineligible or unconfirmed-province lender to
  a client). RENEWALS: bestApprovedFixed now filters province+program
  eligibility (switch=transfer); no-penalty already correct; insurance-class
  port has no Zoho source (documented gap). lib/lender-browse.ts: BC + restricted
  excluded from the Lenders tab; browseProvinceExcluded for the note.
- CLIENT-DOC FAIL-CLOSED: savings PDF withholds a province-unknown/ineligible
  comparable (provincePending state) + prints the requalification line for a
  refinance; rates PDF filters quote pins AND offer pins through
  includedInClientDoc/resolveProvince (an offer for a province-unconfirmed lender
  can no longer print — an adversarial-review HIGH). Since only the 2 BC lenders
  are province-confirmed today, client PDFs currently withhold every comparison
  and print the honest "confirming availability" state — the intended fail-closed
  cost; the Rates unconfirmed-lender count drives Michael to fill the registry.
- CONSTRAINTS (Parts 2/3/4): lib/constraints.ts (excluded/required/preferred,
  reason required, retire-not-delete, applyConstraints never overrides eligibility
  → required-but-ineligible = honest empty state, unit-tested). lib/constraint-
  cost.ts (computeCostOfConstraint + dealConstraintCost via the shared cent-
  validated monthlyPayment; same-term comparison after the review flagged a
  1yr-vs-5yr mismatch). FOXCA migration 20260712160000 (client_constraints +
  pin_confirmations; RLS on, grants revoked, 6 security-definer functions;
  applied live + round-trip verified: add→list→retire, retained, 42501 on the
  table). lib/constraints-store.ts (twin, demo-inert). Routes under
  /api/portal/admin/constraints (list rates.view; add/retire/pin
  constraints.manage NEW authority key, demo-refused). ClientConstraints editor
  in the deal room. ComplianceCard documentedSuitability = a constraint with a
  reason AND a real (cost>0) trade-off, attributed to the driving
  excluded/required constraint (both review fixes). tests/constraints.test.ts (13)
  + tests/constraints-demo.test.ts (2).
- ADVERSARIAL REVIEW (3 dimensions, plain-text workflow): fixed the client-PDF
  OFFER province leak (HIGH), the floating negative-rate guard (MEDIUM), the
  compliance zero-cost-preferred inflation (MEDIUM), the constraint-cost term
  mismatch (MEDIUM), the savings-PDF switch copy (LOW), printed-floating
  preference (LOW). Considered-and-reverted: an IRD-in-bucketing estimate — an
  accurate IRD needs the lender's own comparison rate (not the best market rate),
  and approximating it overstates the penalty and flips genuine calls to
  stay-put, a worse error on a call list than a slightly optimistic act-now that
  Michael confirms on the call; 3MI stays the bucket floor with the IRD caveat
  disclosed on the card and PDF.
- Verification: tsc clean, production build green, 360 tests. FOXCA posture +
  constraints round-trip proven live; the approved-book pricing by class
  validated live (best unrestricted conventional adjustable = First National
  P−0.50/3.95%, conventional fixed 4.59%, matching the brief to the cent);
  eligibility golden parity confirmed against the source. Authenticated page
  screenshots need Michael's Clerk session (agent cannot authenticate); the
  savings PDF (refinance + requalification, and the province-pending state) was
  rendered and eyeballed.
- Guardrails held: readonly workbench (all reads through the existing role; no
  workbench writes), FOXCA narrow functions only, Zoho writes only through the
  confirmed-action routes, approved quotes only with sheet dates,
  adjustable/variable never conflated, calculator reused never forked, no
  estimate rendered as an actual (floating effective labeled with the prime
  mirror as-of; computed figures never on a client PDF today via the province
  gate), compensation scrubber on every client string, currentUser(), middleware
  publicRoutes untouched, no ANTHROPIC_API_KEY in build subprocesses, demo mode
  proven zero-real-reads for the new constraints store (tested), copy rules
  throughout.

### 2026-07-12 — Opportunities: the Strategic Mortgage Monitoring engine
- The mandate: turn Michael's monthly SMM CSV export (real client PII, kept
  OUTSIDE the repo at ~/fox-local/SMM/, gitignored) into a call pipeline, the
  Renewal Radar's sibling, reusing its FOXCA + confirmed-action plumbing. PII
  discipline held throughout: the real file was NEVER copied into the repo,
  committed, or logged; the committed suite runs on synthetic fixtures
  (tests/fixtures/smm-sample*.csv, exact column structure); local verification
  reported counts/buckets/outcomes only (file refs only; no client names).
- Model (pure, unit-tested): lib/smm.ts (parseCsv RFC-4180, parseMoney/Percent
  with dash→null-never-zero, isPlaceholder ≤$1, collapseCoBorrowers by
  address|balance|maturity, checkSignConvention with a sub-2%/+$500 sanity trip,
  penaltyEstimate (3MI always; IRD-vs-3MI framing for fixed with per-lender
  method or honest gap), analyzeOpportunity → FoxAnalysis with netBenefit =
  monthlySaving×horizon − penalty and act_now/marginal/stay_put/insufficient at
  ±MARGINAL_BAND 1500, diffUploads). config/smm-lender-aliases.ts normalizeLender
  (the real export's lender strings all map — 0 unmapped live). lib/smm-match.ts
  (decideMatch email>phone>name, proposeBackfill empty-fields-only with conflicts
  listed never proposed, WRITABLE_SCALAR_BACKFILL_FIELDS = Maturity_Date +
  Mortgage_Rate ONLY (Lender_Name is a Zoho lookup, excluded), reconcileLapsed +
  retentionSummary, bestFixedComparable approved+dated+non-test, name-index
  helpers). lib/smm-analysis.ts analyzeMortgage = the ONE per-mortgage path both
  the board and the PDF route use (no drift). Tests: tests/smm.test.ts (26),
  tests/smm-match.test.ts (16), tests/smm-analysis.test.ts (4),
  tests/savings-pdf.test.ts (8). Suite 315 green.
- Persistence: FOXCA migration 20260712120000 (smm_uploads/smm_rows persist-first
  + smm_opportunity_status; 7 functions) applied last session; this session added
  20260712140000 (smm_backfill_events; smm_backfill_record + _recent), applied
  live to skfeivzhqvrefnkqjwtj. House posture verified live with the anon key:
  direct table select on smm_backfill_events refused 42501, smm_backfill_events_recent
  RPC returns []. lib/smm-store.ts is the only client (twin of renewals-store);
  logs function+status+counts, never row payloads.
- Upload (POST .../opportunities/upload, opportunities.manage, demo-refused):
  persist-first — createUpload + insertRawRows BEFORE parse, then parse/collapse/
  sign-check + finalizeUpload with a notes summary. Board
  (/portal/admin/opportunities): parses the latest non-superseded upload, reads
  the approved book (read-only role) for bestFixedComparable, computes Fox's
  analysis per mortgage beside the service figure, buckets ranked by netBenefit,
  delta vs the prior upload, per-card scenario prefill + Prep-a-call + status
  (FOXCA, enumerated). Home rail gained an act-now line (opportunities.view).
- Backfill: SCAN route (POST .../backfill, opportunities.view) matches a small
  client-chunked batch to Zoho (searchZohoContacts email→phone→name, short-
  circuited) and computes empty-field proposals per deal; APPLY route (POST
  .../backfill/apply, opportunities.manage, demo-refused) is the ONLY write path
  — re-reads the persisted export AND live Zoho, recomputes proposeBackfill,
  writes only approved-key fills still empty at write time through
  updateZohoRecordFields('Potentials'), records who/record/fields to
  smm_backfill_events (failed attempts too). Client sends field KEYS only; the
  server owns every value. BackfillPanel scans with a progress bar and confirms
  per deal with a two-tap.
- Savings PDF (GET .../opportunities/[householdId]/pdf, opportunities.view,
  demo-refused): lib/savings-pdf.ts reuses lib/rates-pdf.ts's exported
  redactComp/pdfSafe/wrap (compensation scrubbed from EVERY string field:
  client name, lender names, penalty framing, note — tested with a 9137-bps
  sentinel across act-now/stay-put/insufficient shapes), grade-6 copy, and the
  wait-for-maturity recommendation when netBenefit ≤ 0 (never a manufactured
  saving). Filename savings-analysis-[date].pdf, download only, no send path.
- Renewals lapsed reconciliation: the Lapsed alarm now matches each lapsed deal
  to the latest export by borrower name (in memory, no per-deal Zoho call) and
  classifies still_with_lender (recoverable auto-renewal, highest-value call),
  lender_changed (won-or-lost unknown), or unmonitored, with a retention signal
  and conflicts flagged never overwritten.
- Live real-file verification (outcomes only, PII-safe): 41 mortgages from 49
  raw rows (8 co-borrower dups collapsed), 1 placeholder, 0 parse failures, 0
  unmapped lenders, 0 sign violations. The reference file IFMS-F001515:
  1.99% fixed, RFA (mapped), maturity 2026-10-01 → bucket stay_put (netBenefit
  −$1,788, so wait for maturity, NOT act_now), backfill proposes Maturity_Date
  2026-10-01 + Mortgage_Rate 1.99 into empty Zoho. ACCEPTANCE CAVEAT (honest,
  per the UI-test discipline): a live backfill WRITE + status decision through
  the real UI on a marked TEST record could NOT be run — the agent cannot
  authenticate to Clerk, and writing to a real Zoho record is out of bounds. The
  write path mirrors the live-proven renewals confirmed-action route exactly and
  is unit-covered; manual step for Michael: scan the board, confirm a backfill
  on a file whose Zoho maturity is genuinely empty, and confirm the
  smm_backfill_events row + the Zoho value.
- Guardrails held: readonly workbench (comparable via getRateQuotesFull through
  the existing role; no workbench writes), Zoho writes ONLY through the
  confirmed-action apply route with enumerated fields, approved quotes only,
  every rate carries its sheet date, adjustable/variable never conflated,
  estimates labeled, the calculator reused never forked, currentUser(),
  middleware publicRoutes untouched, no ANTHROPIC_API_KEY in build subprocesses,
  demo mode reads/writes nothing real. tsc clean, build green, 315 tests.

### 2026-07-12 — The Renewal Radar (renewals become visible; the leak is closed)
- The mandate: the practice was losing renewals silently. All figures verified
  live by read-only COQL via the MCP connector (the app refresh token lacks
  COQL scope). NO n8n workflow modified; NO Zoho status write against a real
  client (proven on a created-and-deleted TEST deal only).
- Renewal fields on the Deals module (live 2026-07-12): Renewal_Status (STRICT
  picklist: Attempted To Contact Once/Twice/Three Times, Renewed Elsewhere, No
  Longer Needs Mortgage, Ready To Renew - Sent New Application; NO retained/won
  value, NO in-discussion value), Renewal_In_Progress (bool), Renewal_Opted_Out
  (bool), Renewal_Sequence_Stage (int), Last_Renewal_Email_Date (date),
  Amortization_Years (int, MIXED UNITS live), Payment_Amount (currency). ALL
  renewal fields sit null/false/0 across every one of the 97 maturity-bearing
  deals — the automation has never written one.
- Part 1 — /portal/admin/renewals (renewals.view, admin; renewals.decide gates
  writes). lib/renewals.ts is the pure model (bucketFor/bucketRenewals/
  renewalBook/paymentShock/bestApprovedFixed/RENEWAL_ACTIONS/termYearsLabel,
  unit-tested tests/renewals.test.ts). Funded = Mortgage Funded + Funded stage
  with a maturity date. Buckets (TODAY 2026-07-12): Lapsed 18 files $11,004,023
  (2026 subtotal $3,569,023 matches the brief exactly; the full total exceeds
  the brief's ~$8.76M because it includes 3 older 2023 maturities the brief did
  not name — more honest), Action now (0-130d) 8 files $4,368,600, Monitoring
  (130-150d) 0, Watching (150+d) 22 files $13,583,615, Resolved 0. Lapsed is a
  red non-collapsible alarm sorted by amount. Missing-maturity block at the top:
  6 funded deals ($2,958,500) with no maturity date, persists until empty.
- The renewal card (components/admin/RenewalCard.tsx, client for the two-tap
  status actions): payment-shock preview (current Mortgage_Rate vs best approved
  FIXED rate from getRateQuotesFull via the read-only role, monthly payment
  delta from lib/mortgage-engine monthlyPayment at a stated 25yr amort on the
  original balance, both sides same amort to isolate the rate; honest "not on
  file" when Mortgage_Rate null; sheet date shown), one-tap Prep a call
  (/portal/admin/agent?prep=<contact or file ref>), deal-room link where a
  workbench file matches (zoho id join, same as Home), Open in Zoho, Term_Years
  rendered as months (60=5yr) with anomalies flagged (300 = amortization in the
  term field; 5 = a year count in a months field), and the enumerated status
  actions.
- Status write path: POST /api/portal/admin/renewals/[dealId]/status gates
  renewals.decide, refuses demo, takes ONLY an enumerated action key, maps it
  server-side to a fixed valid payload (RENEWAL_ACTIONS: only real picklist
  values + booleans, no free text), writes through updateZohoRecordFields (the
  single confirmed-action Zoho write fn), and records who+when to FOXCA
  renewal_events. GAP REPORTED: no "retained/won" picklist value exists, so a
  retention cannot be recorded (a disabled-affordance note on the page + a Zoho
  follow-up). FOXCA migration 20260712000000_renewal_events (applied live to
  skfeivzhqvrefnkqjwtj): RLS on, no policies, grants revoked, three narrow
  security-definer functions granted anon; lib/renewals-store.ts is the only
  client (twin of notifications-store). Posture verified live: function record +
  list work via the anon key; direct table select refuses 42501.
- Part 2 — Home: rail gains lapsed renewals (red), the action window (amber),
  and missing maturities (amber), ranked near the top; a compact 5-number KPI
  strip (funded YTD, signed pace vs $12M, active pipeline, renewals to action,
  lapsed renewals) each linking out. Notifications: two producers
  (renewal_crossing at 0-130d, renewal_lapsed) in lib/notifications.ts, gated on
  renewals.view, wired into the route (getRenewalDeals is demo-guarded so it
  runs in demo over fixtures). demoRenewalDeals fixture added so demo never
  leaks a real client.
- Part 3 — Revenue: restored all-time practice KPIs (practiceKpis over the
  corrected year series — funded volume/count, avg deal, best year, years
  active), the renewal book KPI (under management $17.95M / next 12mo $7.71M /
  lapsed $11.0M), partner tiles by type (byType extended with mortgageAgent;
  classifyPartnerType now maps it) with per-type attributed funded volume
  (attributedFundedByType over the corrected deals), recent referrals, and the
  attribution caveat once. getAdminDashboardPayload is reused for partner counts
  + recent referrals ONLY (not its uncorrected inProgress/currentYearPipeline);
  it and listAllPartners are NOT demo-guarded, so the page skips them in demo.
- Part 4 — SMM investigation (report only, no n8n change): the Strategic
  Mortgage Monitoring renewal drip (150-day lead, six-email drip writing
  Renewal_Status/Sequence_Stage/Last_Renewal_Email_Date) DOES NOT EXIST as an
  n8n workflow. The only renewal-adjacent workflows are SMM Lead Enrollment
  Webhook (JO7ZXIY1MKogKXzj, new-lead email alerts), SMM Lead Monitor
  (CZ1zh0gKvkQuTBMc, new-enrollment checks), and IRM Investor Deal Monitor
  (investor payouts to a briefing) — none reads borrower Maturity_Date on a
  150-day lead or writes any renewal field. Combined with the pristine-null
  renewal fields across all 97 deals, the automation has never fired. The portal
  makes the failure visible regardless of whether the drip is ever built.
- Verified: tsc clean, production build green, 274 unit tests green (renewals 16,
  revenue +2 practiceKpis/attributed), FOXCA audit proven live, the Zoho status
  write proven on a created-and-deleted TEST deal (Renewal_Status
  'Attempted To Contact Once' accepted + read back + cleaned up), the renewal
  cards + buckets + payment shock rendered with real figures and screenshotted.
  Authenticated page screenshots need Michael's Clerk session (agent cannot
  authenticate); acceptance #5's through-the-UI two-tap is the one manual step,
  everything under it proven.
- Guardrails held: readonly workbench (best-rate read through the existing role;
  no workbench writes), Zoho writes only through updateZohoRecordFields with
  enumerated payloads, demo mode leak-free (Revenue partner fetches skipped, the
  renewal fetcher demo-guarded), no estimate rendered as an actual (payment
  shock labeled, sheet date carried), currentUser(), middleware publicRoutes
  untouched, no ANTHROPIC_API_KEY in build subprocesses, copy rules in all new
  UI copy (no em dashes / no exclamation points / "finds" not "surfaces" /
  Mortgage Agent Level 2 / Strategic Mortgage Monitoring never the vendor name).

### 2026-07-12 — Pipeline truth (staleness rule) and the Practice History chart
- The mandate: three data problems were distorting every open-pipeline figure
  going into a presentation, plus a chart to restore and a slide export to
  build. All figures verified live against Zoho by read-only COQL (via the MCP
  connector, which unlike the app's refresh token carries COQL scope); NO Zoho
  writes this session (Michael is grooming the records himself).
- Part 1 — pipeline pollution, fixed self-defendingly:
  - Additional Properties (49 records) already excluded as a summary stage
    (config/pipeline.ts SUMMARY_STAGES); reason recorded there and above.
  - NEW staleness rule (config/pipeline.ts STALE_CLOSING_DAYS 90 /
    STALE_CREATED_DAYS 180; pure predicate lib/pipeline-hygiene.ts, unit-tested):
    an open deal is stale when Closing_Date is >90 days past OR Created_Time is
    >180 days ago. The created-age arm substitutes for the brief's "no activity
    180d" because Last_Activity_Time is Finmo-mass-synced (every deal shows one
    shared value) and Stage_Modified_Time is null — no usable per-deal activity
    signal exists (documented data limitation, not a shortcut).
  - RECONCILIATION (the money anchor, tests/pipeline-hygiene.test.ts): the 31
    open deals split into exactly 8 real active files ($4,714,239.74) and 23
    stale (15 dead 2021-2022 files with past close dates, 7 "- Additional
    Property" records mis-staged in Options that the stage filter cannot catch,
    and BRXM-F025547 which has a FUTURE close but was created 2024). The 8:
    BRXM-F050350, BRXM-F054033, BRXM-F054420, BRXM-F053107, BRXM-F057623,
    BRXM-F056361, BRXM-F053725, BRXM-F057400.
  - computePipeline(deals, todayYMD) now partitions active vs stale and returns
    the stale bucket; SlimDeal + SLIM_DEAL_FIELDS gained createdTime/Created_Time.
    Both Home and Revenue pass todayYMD. The Revenue commissionForecast excludes
    stale (new optional isStale param, default no-op keeps other callers/tests
    unchanged). Stale is a visible, groomable bucket on Revenue (each row links to
    the Zoho record); Home's pipeline card shows the stale count. Nothing deleted.
- Part 2 — funded vocabulary and the double count:
  - Full stage vocabulary with counts and date ranges recorded (Pipeline + pacing
    decisions section above). No live double count exists: 'Funded' is in
    TERMINAL_STAGES (the load-bearing guard, config/pipeline.ts), so the 6 Funded
    2026 deals count in funded-YTD and are excluded from open pipeline. Impact if
    that line were removed: $3,280,925.94 double-counted. Grep-verified that every
    funded/terminal check across the admin surfaces covers BOTH spellings; the one
    single-spelling defect (app/portal/investor/(active)/opportunities/page.tsx,
    'Funded' only) is fixed to use isFundedStage.
- Part 3 — Practice History chart (components/admin/PracticeHistoryChart.tsx,
  bespoke inline SVG, server-rendered): funded volume by year 2021-present with
  deal counts; the current year split into funded-to-date solid navy and the
  corrected weighted pipeline stacked above as a lime hatch labeled a projection
  (a forecast can never read as an actual); 2021 flagged partial (earliest funded
  Apr 2021); the three milestones (config/milestones.ts: FoxSocial onboarded
  2026-03, FoxSocial full capacity 2026-07, AI underwriting live 2026-07) rendered
  plainly at the right edge with the honest "weeks old, mortgages take 60-90 days"
  note; a dashed complete-years average line (horizontal reference, not a trend);
  NO trend line/curve/projection device. lib/revenue.ts gained fundedByYear +
  practiceHistoryYears (contiguous year fill). config/targets.ts already carried
  $12,000,000 with no placeholder.
- Part 4 — the export (app/portal/admin/revenue/export + PracticeHistorySlide.tsx
  wrapping the chart in one self-contained SVG with the Fox mark, title, and
  licence footer): a client Download PNG (SVG rasterized at 2.5x with the brand
  fonts embedded from the page's own @font-face, graceful fallback) plus Print /
  Save as PDF with print-isolation CSS. foreignObject was replaced with plain
  <text> so the raster never blanks or taints the canvas.
- BEFORE/AFTER stated (every affected surface): open pipeline 31 files /
  $11,576,445 → 8 files / $4,714,240; weighted pipeline $4,138,535 → $2,194,123;
  combined $7,419,461 → $5,475,049; pace vs $12M +$1,074,255 (read AHEAD) →
  -$870,156 (actually BEHIND, day 193/365, straight-line target $6,345,205).
  The widget had been reporting ahead of pace on the strength of ghost deals.
- Verification: tsc clean, production build green, full suite green (256 tests;
  the tests/pipeline-hygiene reconciliation anchor + revenue fundedByYear/
  practiceHistoryYears/forecast-stale-exclusion added). The chart + export slide
  were rendered with the real verified figures and screenshotted (faithful,
  house style, honest split). Live authenticated page screenshots need Michael's
  Clerk session (the agent cannot authenticate). Adversarial money-figures review
  run per standing policy.
- Guardrails held: no Zoho writes (COQL reads only), readonly workbench untouched,
  no estimate rendered as an actual (projection hatched + labeled), no trend
  device, currentUser() unaffected, env unchanged, copy rules (no em dashes / no
  exclamation points / "finds" not "surfaces" / Mortgage Agent Level 2) in all new
  UI copy, portals spot-checked (only the one investor filter touched, for the
  better).

### 2026-07-11 — The offers desk (offers become approvable; the Promos tab goes live)
- Prerequisite consumed: the fox-underwriting promo pipeline session.
  lender_offers is the 18th granted read table (portal_readonly SELECT
  verified live). The offers gate lives at POST
  /api/gates/offers/[offerId]/decision behind approvals.offer.decide (new
  authority key, admin only, additive contract with fox-underwriting). GET
  /api/knowledge/offers now serves approved unexpired offers from the table
  in the same KnowledgeOffer shape the Promos tab already consumed.
- Live data shape at build (23 pending, status='extracted'): 19/23 have a
  NULL expiry (the dangerous field is the COMMON case), 0 have structured
  eligibility, 0 carry offer_rates tiers, rate is null on 18 (priced value
  in offer_payload.rates_or_amounts text), rate_type includes 'mixed' and
  null, all 23 carry an evidence array. Approved offers: scotia special
  (structured offer_rates + eligibility), two TD cashbacks (prose). So the
  ONLY structured first-class scenario offer today is Scotia; everything
  else is prose (chips) — honest and by design.
- Part 1 — Offers queue (5th tab ?tab=offers on the approvals desk):
  components/admin/ApprovalsDesk.tsx gained the offers tab (TabKey +
  CanDecide + the four Record<TabKey> maps), the decideOffer handler
  (mirrors decideSheet: key offer:<uuid>, gate proxy URL, optimistic
  filter, two-tap confirm with the timestamp arm-window, 409 "Already
  decided" + refetch), and the offer card. lib/underwriting.ts
  getOfferQueue (status='extracted', demo-guarded to []) returns the rich
  OfferQueueCard (normalized priced columns + conditions[] + eligibility
  jsonb + evidence[] + started/expiry + offer_payload). lib/approvals-data.ts
  wires offers into ApprovalsData + the queues refetch (no LastDecided
  change — offers use lastDecidedFor: null). The queues route needed no
  change. Home rail (app/portal/admin/page.tsx) gained an "Offers to
  review" AttentionCard (approvals.view) noting the null-expiry count;
  notifications gained the pending_offers category + pendingOfferNotifications
  producer (approvals.view), wired in the route.
- components/admin/offer-display.tsx (shared, the honest-render source):
  OfferWindowBadge (banner + chip; a null expiry is a LOUD red warning
  "no stated end date, will not auto-retire, confirm before quoting",
  NEVER a dash; dated countdown amber<=14 red<=5, expired only d<0),
  OfferPricedElements (reuses the rate-display atoms; clean rate where one
  normalized, else the rates_or_amounts text; adjustable/variable distinct;
  'mixed'/null rate types never forced into one of the three; cash back its
  own chip), OfferConditions (verbatim), OfferEvidenceList (statement-review
  style p<page>: "snippet" citations). lib/offers.ts is the pure model
  (classifyWindow / hasNoExpiry / daysUntil / offerPricingShape /
  offerCashbackLabel / offerTermsLabel / offerRateTypeLabel / offerRatesText
  / normalizeEvidence), unit-tested (tests/offers.test.ts).
- Part 2 — the Promos tab (components/admin/RatesPromos.tsx): full priced
  rendering (offer_rates tiers with comp/buydown, or the rates_or_amounts
  text), OfferWindowBadge with the loud null-expiry warning, evidence via
  attempt-and-fallback (renders if offer_payload carries evidence), active/
  expired split fixed so a null-expiry offer is ACTIVE and days_left===0
  (expires today) stays active — matching classifyWindow everywhere. The
  null-expiry warning also reaches the scenario promo chips (result cards +
  PromoOfferCard) and the lender pages (RatesLenders card + lender-page
  offer chips): no surface renders a missing expiry as a bare dash (grep
  clean; the old promoTone(days_left) chip math that broke on null is gone).
- Part 3 — scenario + PDF: offerFitsScenario gained min_amount + class
  gates; offerScenarioResult now returns a result for fits OR unknown
  eligibility (permissive with a stated caveat, OFFER_PERMISSIVE_CAVEAT),
  ruled_out → null — never silently excluded, never silently included. A
  winning offer (beats every priced sheet quote for the scenario) sorts
  FIRST as a lime "beats every sheet quote" card; the dominance claim is
  only made when the comparison is real (not when matched quotes are
  unpriceable with prime unavailable — review fix). Offers are pinnable
  into the compare tray and the client PDF via o:<offerId> pin tokens; the
  PDF route fetches pins from the APPROVED-offers endpoint only (a pending
  offer can never reach a client doc). lib/rates-pdf.ts renders a
  "Promotional offers included" section: rate, the window (null expiry = a
  warning, never a dash), and conditions verbatim, with redactComp run over
  EVERY offer string (lenderName, description, ratesText, each condition).
  tests/rates-pdf.test.ts extended: comp injected into offer conditions AND
  the priced text (two non-vacuous branches) plus a positive
  conditions/expiry/null-expiry test.
- Verified: tsc clean, production build green, 245 unit tests green
  (offers 8, scenario +5 permissive/gates, rates-pdf +4 offer scrub +
  conditions), live workbench schema + status introspected through the
  read-only paths. The offer approval card (loud null-expiry vs dated
  countdown) proven with a faithful component preview screenshot.
  ACCEPTANCE #3 CAVEAT (honest): a live offer decision through the real UI
  on a marked TEST offer with the 409 repeat + audit identity could NOT be
  run this session — the agent cannot authenticate to Clerk (no browser
  gates token) and there are 0 TEST offers in lender_offers (test_extracted
  0). The decision path is built and mirrors the live-proven rate-sheet
  path exactly; per the standing UI-test discipline this is verified by
  unit test + a manual step for Michael: seed a TEST-marked extracted offer
  workbench-side (fox-underwriting owns the table), then approve/reject it
  through ?tab=offers and confirm the audit entry + the 409 on a stale tab.
- Offers contract awkwardness (for the report + fox-underwriting): the
  knowledge offers endpoint serves offer_payload as `offer`, which for
  prose offers has no structured priced fields or eligibility — so the
  Promos/scenario surfaces can only render what offer_payload carries;
  evidence on the Promos board is attempt-and-fallback because offer_payload
  may not include the evidence array; and rate_type 'mixed'/null needed
  explicit handling (never coerced into the strict three). The desk reads
  the full row so it is always rich.
- Guardrails held: readonly workbench (getOfferQueue through the existing
  role; no workbench writes — decisions go through the Gates API only),
  approved-only quoting (pending offers are counts/badges/queue cards,
  never quotable rates), adjustable/variable never conflated, every rate
  carries its date, floating leads with the discount + prime as-of, NO
  compensation on the client PDF (scrubbed + tested), currentUser(),
  middleware publicRoutes untouched, no ANTHROPIC_API_KEY in build
  subprocesses, portals spot-checked.

### 2026-07-11 — Rates v3 follow-up: lender logos wired into public/lenders/
- Wired the 21-file `Lender Logos/` folder (root, named by display name)
  into public/lenders/ using the QUOTE-slug convention <LenderMark> reads.
  All are PNG now (RFA.jpeg converted to rfa.png via `sips`; the fallback
  chain is svg→png). Mapping by category:
  - IN THE BOOK (14, live immediately): mcap, first-national, strive, rfa,
    scotia, merix, unionlink, rmg, neo, cmls, highclere, haventree, b2b,
    radius.
  - INTEL-confirmed coverage-pending slug (3, light up when they get
    approved quotes): first-ontario, meridian, quest (the file was
    "QuestBank.png" but the live intel slug is `quest`, not `questbank` —
    mapped to the real slug).
  - GUESSED future slugs (4, not in the book and not in intel; slug is a
    best-guess slugification, VERIFY when the lender enters the book):
    mcan (MCAN.png), marathon (Marathon.png), td (TD.png), peoples-bank
    (Peoples Bank.png — most uncertain: could be `peoples` or
    `peoples-trust`).
  - Files could not fully map: none — all 21 placed. The 4 "guessed" ones
    are placed but flagged above; a wrong guess is harmless (the asset
    sits unused until the real slug appears).
  - 9 book lenders keep the monogram fallback (no logo file): npx,
    nbc-optimum, bridgewater, shinhan, manulife, coast-capital,
    home-trust, kootenay, first-national-excalibur. NOTE:
    first-national-excalibur (45 approved quotes) shows an "FN" monogram;
    per the wiring instruction only First National.png → first-national.png
    was mapped, so if you want Excalibur on the FN logo, copy
    public/lenders/first-national.png to
    public/lenders/first-national-excalibur.png (one file, same brand).
  - Verified: all 21 are valid PNGs and render in the real <LenderMark>
    img box (rounded, object-contain, white bg); monogram fallback intact
    for unmatched slugs (screenshotted). The `Lender Logos/` source folder
    is left in place (untracked); public/lenders/*.png are committed.
  - ADDENDUM (same day): Michael added 12 more logos; folder is now 33
    files, public/lenders/ holds 33 PNGs. New (all validated + rendered):
    IN THE BOOK now on logos — first-national-excalibur (the earlier "FN"
    monogram, now a real Excalibur acorn), nbc-optimum (file "NB Optimum"),
    npx, bridgewater, shinhan, manulife, home-trust (file "Hometrust").
    INTEL coverage-pending now on logos — aspire, duca, eq, bloom (Bloom.jpg
    converted to bloom.png). GUESSED future slug — wealthone (WealthOne.png;
    not in book/intel, verify slug when it enters the book). After this,
    only TWO book lenders remain on the monogram (no logo file):
    coast-capital and kootenay. Intel coverage-pending lenders still without
    a logo (monogram): cmi-us, sdc, sequence, servus, tru.

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
  yielding zero cards plus the reference line, and live by the IFMS-F001515
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
  design): real-read tool runs (IFMS-F001515 resolves with the maturity gap;
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
