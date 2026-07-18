// Roadmap: the command center build plan and its real history, so anyone
// onboarded later can see where the platform is going and what already
// shipped. Updated every session as part of the CLAUDE.md closing ritual
// (session ledger, config/changelog.ts entry, this page). Staleness here
// is a bug.

import { requirePermission } from '@/lib/authz'

export const dynamic = 'force-dynamic'

type SessionStatus = 'shipped' | 'current' | 'next' | 'planned'

const SESSIONS: {
  n: string
  title: string
  status: SessionStatus
  repo: string
  items: string[]
}[] = [
  {
    n: '1',
    title: 'Command center foundation',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Repo audit (docs/portal-audit-2026-07.md)',
      'Full navigation architecture with permission gating',
      'Exception-first Home with live read-only data',
      'Status page and authority matrix groundwork',
      'Read-only workbench wiring (lib/underwriting.ts)',
    ],
  },
  {
    n: '1.5',
    title: 'Hotfix: public forms were dropping submissions',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Persist-first form intake pipeline (Supabase capture, then Zoho, then Resend, then an honest response)',
      'Honeypot and validation on the public pair; attribution on the referral endpoint',
    ],
  },
  {
    n: '2',
    title: 'Gates API and read-only database role',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'Database-enforced portal_readonly role replaced the service key posture (service key deleted)',
      'Gates API for approval decisions, enforcing the same permission keys as this portal',
      'Amended guardrail: dependency points one direction only (this portal depends on fox-underwriting, never the reverse)',
    ],
  },
  {
    n: '3',
    title: 'Deals, Approvals, Audit Log',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Approvals desk live over the four gate queues with two-tap confirms and 409 reconciliation',
      'Deals list and deal room joining Zoho stages with workbench evidence, conditions, and flags',
      'Audit viewer with filters, server pagination, and capped CSV export',
      'Browser-minted gates token contract verified live and documented',
    ],
  },
  {
    n: '3.5',
    title: 'Workbench micro-sessions 1 and 2',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'Micro-session 1: shadow empty-calcs 422, token-mint contract correction, deal room grants (16-table surface), decided_by convention',
      'Micro-session 2: knowledge read endpoints, conditions decision gate, zoho_potential_id backfill for the deal rooms',
    ],
  },
  {
    n: '4',
    title: 'Rates, Intel, Knowledge, Changelog, Directory',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rates browser over the approved quote set with digest strip and promo countdowns',
      'Knowledge base pages with as-of discipline, draft and withheld-profile handling',
      'Intel feed with review outcomes; changelog; staff directory',
      'Conditions decisions in the deal room; terminal-deal filtering; form intake acknowledged path',
    ],
  },
  {
    n: '5',
    title: 'Rates v2: scenario-driven decision tool',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Describe the deal, see which lenders win it, best rate first, from Michael-approved sheets',
      'Three levels: lender results, lender drill-in, product detail with approval provenance',
      'Pin up to three products, compare side by side, export the client-ready PDF (download only)',
      'Deal room prefill: find rates for this deal, read-only',
    ],
  },
  {
    n: '5.5',
    title: 'Workbench: variable rates and parser coverage',
    status: 'shipped',
    repo: 'fox-underwriting',
    items: [
      'rate_type, signed prime_variance, cashback_pct, program_notes on rate_quotes (migration 0029); rate nullable behind the priced check',
      'Prime reference and floating mechanism notes served on /api/knowledge/rates-reference; quote_slugs aliases published on the knowledge index',
      'Parser book 5 to 21 lenders; number_links granted as the 17th read-only table; addendum decisions on the sheet gate',
      'Left Michael a 25-sheet, 719-quote review queue',
    ],
  },
  {
    n: '6',
    title: 'Floating rates on screen, and Compliance',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rate type as identity everywhere: fixed plain, adjustable and variable badged distinctly, discount-first with effective rates computed against served prime and labeled with its as-of',
      'Cash back tiers as first-class rows with verbatim program conditions; promo offers as badged scenario results (the Scotia 60-day special)',
      'Approvals sheet cards print floating ranges and cash back tier counts for the 719-quote sitting; Directory renders the learned numbers',
      'Compliance module: credential register feeding the attention rail (60 and 14 day thresholds), complaint and incident register, versioned policy library with acknowledgments, per-file compliance cards with an honest posture rule',
    ],
  },
  {
    n: '6.5',
    title: 'Ask Fox: the practice agent (Call Prep and Call Review)',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'In-portal chat over the Anthropic API with six enumerated read tools (Zoho, workbench, the approved rate book, lender knowledge); every figure sourced, gaps named, never guessed',
      'Call Prep one-tap briefs from deal rooms; Call Review grades pasted transcripts against the versioned rubric with evidence',
      'CRM changes and tasks only as confirm cards Michael taps; no gate actions, no send capability; every conversation kept as a supervision record',
      'Needs ANTHROPIC_API_KEY on Vercel to answer; renders the honest not-configured state until then',
      'v2 (planned): Dialpad-automatic Call Review, transcripts flowing in through the existing n8n call pipeline without paste',
    ],
  },
  {
    n: '7',
    title: 'Revenue and Partners',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Commission forecast by close month: stage-weighted, recorded commissions first, comp model estimates labeled everywhere else (config/comp.ts, confirm-bps placeholders for Michael)',
      'Funded trends with mix charts that render only at real field coverage; conversion funnel with its honest method caveat; goal pacing deep view with the gap in dollars and files',
      'Partners ranked for Monday attention: health tiers (config/partner-tiers.ts), referral stats, attributed revenue, portal sign-in recency read server-side; detail pages gain referred files and cadence',
      'Business-line P&L tile renders its honest not-connected state; the exact requirements to light it are listed on the page (no production QBO path exists yet)',
      'Ask Fox v2 prompt: checks open Zoho tasks before proposing a card, references covering tasks instead of duplicating; chat gained the thinking indicator',
    ],
  },
  {
    n: '8',
    title: 'Multi-user hardening',
    status: 'shipped',
    repo: 'foxmortgage-ca + fox-underwriting',
    items: [
      'Roles live and verified: ops / underwriting-reviewer / agent baselines recorded in the authority matrix, every admin page and API gates on permission keys (zero role literals), per-role surfaces proven with dev-instance test users',
      'Settings gains the effective-access view: pick a role, see every page and action it reaches — the supervision answer to "what can your staff do"',
      'View-as formalized: picker under the portals nav, structurally read-only (controls absent + server rejection, both tested), every session logged to FOXCA and listed under Audit Log',
      'Provisioning wizard at Settings → People: staff, partner (Zoho id picked never typed), agent (workbench half via POST /api/gates/agents with setup_remaining rendered honestly); who-provisioned-whom recorded',
      'Offboarding rehearsed: one two-tap action bans and revokes sessions, a persisted checklist covers grants, partner attribution, agent scope, and compliance credentials; nothing deletes',
    ],
  },
  {
    n: '9',
    title: 'The finale — PWA, notifications, search, demo mode',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'PWA: on-brand manifest + icon set (maskable), a security-first service worker that never caches an authenticated response, an offline fallback, and polite dismissible install hints on the admin and partner shells',
      'Notification center: a bell + badge backed by a FOXCA table (per-user read state, per-category toggles) producing five categories from signals the portal already computes — including off-portal CLI gate decisions, so the desk and the terminal are one world',
      'Global search: cmd-K across deals (workbench refs + Zoho names), contacts and partners (Zoho), lender knowledge, and navigation — grouped, keyboard-driven, debounced server-side, honest when a source is slow',
      'Demo mode: an admin-only, env-fenced toggle that swaps the whole command center to fictional fixtures at the fetcher boundary — zero real reads, writes disabled, a persistent banner — the recruiting instrument with no client on screen',
      'Finale sweep: legacy mock pages removed, the Daily Deal Briefing retired (the Home rail serves it live), the partner shell made responsive, and the roadmap graduated',
    ],
  },
  {
    n: '10',
    title: 'Rates v3: tabs, lender browse, logos, and the promos board',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'Rates restructured into four URL-addressable tabs (Scenario default, Lenders, Promos, All quotes); the scenario lender-card click fixed with a real affordance and a scroll-to-top drill-in',
      'LenderMark: a real logo from public/lenders/ or an on-brand navy monogram fallback, everywhere a lender is named; no manifest to maintain',
      'Lenders tab: browse the approved book with honest per-class headline rates and the deepest floating discount (adjustable and variable kept apart), plus the three-state coverage map (live / awaiting approval / coverage pending)',
      'Promos tab: the offer book as its own board, soonest to expire first, each card citing its announcement; saved scenarios per user through FOXCA narrow functions',
      'A test locks the client rate PDF against ever disclosing lender compensation to a borrower',
      'Regression fix (2026-07-13 late): the database service caps every read at 1,000 rows, and when the approved-plus-superseded book outgrew one page the grid silently dropped whole lenders (11 cards, 24 false pending chips; the Opportunities board lost two act-now calls the same way). Every large workbench read now pages through the full result. Coverage-pending redefined: only a lender whose NEWEST rates-class sheet failed extraction or has no parser, with the failing sheet named on the chip; an approved lender can never chip; a live lender with a failed newest sheet gets a needs-attention badge, never a demotion. Province-excluded lenders’ sheets park out of the approval queue onto a visible auto-releasing shelf, and unattributed rates sheets (null lender guess) surface on the Lenders tab',
    ],
  },
  {
    n: '11',
    title: 'The offers desk: promotional offers become approvable',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A fifth Offers queue on the Approvals desk decides pending promos through the gate (approvals.offer.decide); each card shows priced elements as identity, expandable evidence with page citations, verbatim conditions, and the window rendered loudly',
      'A null expiry is unmistakable everywhere it appears — the approval card, the Promos board, the scenario promo chips, the lender pages, and the client PDF — never a bare dash (19 of 23 pending offers had none)',
      'Offers match a scenario permissively where eligibility could not be extracted (and say so), a winning offer sorts first, and a pinned offer carries its conditions and expiry onto the client PDF with compensation scrubbed from every field',
      'Pending offers feed the Home attention rail and the notification bell; lender_offers is the 18th granted read table',
    ],
  },
  {
    n: '15',
    title: 'Lender eligibility, client constraints, and the cost of a preference',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'The live bug: Kootenay Savings and Coast Capital are BC credit unions that cannot do an Ontario deal, yet Kootenay (deepest floating discount in the book) led almost every floating scenario and was proposed as a real client’s best comparable. Every ranking surface now filters structural eligibility first (scenario, compare tray, opportunities, rates browser Lenders and Promos, Ask Fox, every PDF). Ineligible is excluded not deprioritized; unconfirmed-province lenders show flagged internally and never on a client document (fail-closed). Ported the fox-underwriting eligibility derivation exactly (golden-test parity) because the workbench columns are unpopulated',
      'Program eligibility: the sub-4% ladder was physician-only / banking-bundle / exclusive-channel and hid the real best rate. Default results are now only what the client can definitely have; qualifier toggles unlock restricted rates, a show-restricted view reveals them with their requirement sentence, and a manual pin records a confirmation before a restricted product reaches a client PDF',
      'Transaction type determines product class (Part 1c): a monitoring client who breaks is a refinance, priced against conventional only, with an 80% LTV hard cap and a requalification line on the card and client PDF; a switch ports the original class with no penalty. Re-ran the export: 20 of 41 opportunities changed bucket. The client file that surfaced the bug had its comparable corrected from the Kootenay fantasy to First National conventional adjustable P−0.50, 3.95% effective',
      'Client lender constraints (excluded / required / preferred, each with a required reason, retired with history never deleted), kept in FOXCA, editable from the deal room, applied to eligibility (a required-but-ineligible lender yields an honest empty state). The cost of the preference is computed by the shared engine and quantified as documented suitability on the compliance card',
      'Ask Fox returns eligible lenders only and never quotes an unconfirmed-province lender to a client (prompt v3). Renewals and the rates browser inherit the filter. Adversarial review run; the client-PDF offer leak, a floating negative-rate guard, and the compliance zero-cost inflation were fixed',
      'Reported gaps: the workbench eligibility backfill has not populated the approved book (the portal derives); provinces are confirmed for only the 2 BC lenders so client PDFs withhold every comparison until Michael confirms provinces (the visible count drives it); the live cost-of-constraint readout on the scenario board is deferred',
    ],
  },
  {
    n: '14',
    title: 'Opportunities: the Strategic Mortgage Monitoring engine',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A new Opportunities section turns the monthly monitoring CSV into a call pipeline. Upload is persist-first (every raw row captured to FOXCA before any parse), then parsed with a strict sign convention (positive savings = act now, negative = costs, a dash stays uncomputed and never a zero), dollar-one placeholder detection, co-borrower collapse keeping every borrower, and lender normalization to the book. Verified against the live export: 41 mortgages from 49 rows, 1 placeholder, 0 parse failures, 0 unmapped lenders, 0 sign violations',
      'Fox’s own analysis sits beside the service’s figure: the best gate-approved comparable with its sheet date, the payment change from the validated engine, the early-break penalty framed honestly (3MI for floating; IRD-vs-3MI for fixed with the lender method named or the gap stated), break-even, and a net benefit after the penalty that buckets the board (act now / marginal / stay put / insufficient) ranked by dollars. A low rate near maturity is told to WAIT, never sold a switch; disagreement between Fox and the service is flagged',
      'Each card opens the priced scenario in one tap, preps a call, sets a portal-side status (FOXCA), and downloads a grade-six savings-analysis PDF with compensation scrubbed from every line and wait-for-maturity framing where it applies (download only, no send path)',
      'Backfill matches each file to Zoho (email, then phone, then name) and proposes filling only the EMPTY maturity dates and rates the export knows and the CRM does not — confirm one at a time or all at once, every value recomputed server-side from the persisted export and a live Zoho read (client values never trusted), each write recorded to a new FOXCA backfill audit; conflicts are shown, never overwritten; Lender_Name is a Zoho lookup so it is reported as a gap, not written',
      'The Renewals lapsed alarm now reconciles against the export: still-with-lender past maturity is a recoverable auto-renewal (the highest-value call), lender-changed is flagged won-or-lost-unknown, unmonitored is not in the export, and a retention signal is computed. Home gained an act-now opportunities rail line',
      'Payment correction (2026-07-13): the stated current payment now reconstructs the ORIGINAL schedule (original amount over the original amortization) instead of re-amortizing the current balance, which understated every seasoned mortgage. The analysis carries months elapsed and the remaining amortization, prices the comparison over the months actually left, and a reconciliation gate models the balance forward from origination; drift over 0.5% blocks the file into a Needs-review board bucket with both figures and the drift shown, and its client PDF states no figure at all',
      'Shared-identity backfill fix (2026-07-13): a match is a (contact, mortgage) pair, never a contact alone. When several export mortgages share an email, phone, or name (six groups covering 13 of the 41 live mortgages), the contact’s deals are attributed by property address then amount; a deal claimed by none or several is contested and NEVER proposed into — it goes to a needs-manual-match card where Michael binds each deal to its mortgage, with the pick recorded in the backfill audit. The empty-field-only, server-recomputed write gate is unchanged',
      'Tiers, renewals, overrides (2026-07-13, Part 1): every lender carries a paper grade (a/b/private, registry-seeded unconfirmed, program-level overrides — FN Prime a, Excalibur b); comparables are same-tier only (B prices the b_side book; private is honest-insufficient; unknown tier or a rate that contradicts the map routes to review); graduation to better paper is a flagged opportunity requiring Michael’s two-tap approval, never an automatic price. The radar detects renewals the CRM missed (feed start past deal close, lender/rate contradictions), suppresses them from action pools with the phantom delta shown, and confirms with the new Renewed With Us picklist value (exactly one field) or declines with a persisted reason. Michael can override any comparable (eligible book pick validated by construction, or a desk rate with mandatory source note and reason), POST-only, badged on board and PDF, recorded on the savings log. The log is append-only by trigger; $1 placeholders route to review and never propose backfills',
      'Final correctness pass (2026-07-13): the savings PDF states three months’ interest as a MINIMUM with the break-even penalty, and draws no positive net-benefit conclusion on ANY fixed-rate break — adversarial review strengthened this past the brief, since a documented IRD method still produces no figure (a wait conclusion at the floor stays — a larger penalty only strengthens it). The comparable is like-for-like by rate family (fixed→fixed; adjustable and variable never collapsed); the cheaper cross-family option is a labelled alternative with a quantified risk line, and headline-ing it on a client PDF takes a two-tap manage-gated approval recorded on the log. Floating ranks on the effective rate from the per-lender prime everywhere (variance is display, never sort order; convention corrected in fox-underwriting §3). Every board render and client PDF writes an append-only savings_analysis_log row (calc_version 2, inputs hash, quotes with sheet dates, figures) that replays exactly; demo writes nothing',
      'Term policy + the client report rebuilt (2026-07-13, Task 0 + Part 2): every comparable carries its TERM beside its rate (board, log, client report); the default comparable must cover the comparison horizon (months left for a break, the client’s own term at a renewal) or the projection shortens to the quote’s term — a short rate is never projected past its term, and a deliberately short-term play is a flagged strategy taking Michael’s two-tap approval, never an automatic act now. Graduation prices conventional only (better paper never inherits an insurance class). The renewal pool is funded-stage deals only with property-row children excluded by name; the three 2023 lapsed rows were verified by hand to be prior-term private-lending records, not children, listed for one-tap resolution. The savings report is rebuilt as the three-page choice document: option cards (lower payment / same payment, mortgage-free sooner), a dated rate strip with the term and never the lender’s name, drawn amortization bars, the side-by-side table at the horizon end, the penalty minimum with a drawn break-even gauge, and conditional next steps in place of any fixed-break verdict (calc_version 3; every printed figure logged and replayable)',
    ],
  },
  {
    n: '13',
    title: 'The Renewal Radar',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A new Renewals section reads every funded deal by maturity window: Lapsed (matured, no outcome, a red non-collapsible alarm sorted by amount), Action now (0-130 days), Monitoring (130-150), Watching (150+), and Resolved. Reconciles live to 18 lapsed files ($11.0M), 8 action files ($4.37M), and a $17.95M renewal book',
      'A missing-maturity block lists every funded deal with no maturity date (6, $2.96M) and persists until empty. Each renewal card carries the payment-shock preview (file rate against the best approved fixed rate with its sheet date, monthly change from the validated engine, honest where the current rate is not on file), a one-tap Ask Fox call prep, and enumerated status actions written to Zoho through the confirmed-action path, recorded with who and when in a new FOXCA audit',
      'Home gained lapsed-renewal, action-window, and missing-maturity rail alarms plus a compact five-number KPI strip; the bell fires on the crossing and lapse transitions',
      'Revenue restored the practice KPIs (funded all time, average deal, best year, years active), partner tiles by type with attributed volume and the caveat once, recent referrals, and the renewal book, all reconciled to the corrected data',
      'Investigation: the Strategic Mortgage Monitoring renewal drip does not exist as an n8n workflow, and all four renewal fields sit null across every deal, so it has never fired. Reported, nothing modified. Zoho also has no picklist value for a renewal won with us, so retention cannot be recorded yet',
    ],
  },
  {
    n: '12',
    title: 'Pipeline truth, and the Practice History chart',
    status: 'shipped',
    repo: 'foxmortgage-ca',
    items: [
      'A self-defending pipeline: Additional Properties stay out by stage, and any open file whose close date is more than 90 days past, or that has sat open more than 180 days without moving, drops into a visible, groomable stale bucket on Revenue that links to Zoho (activity timestamps are Finmo-synced to one value, so deal age is the reliable proxy). Nothing is deleted',
      'The active pipeline reconciles to 8 real files worth $4.71M; the weighted pipeline fell from $4.14M to $2.19M and the pace now reads honestly behind target, not ahead',
      'Both funded stage names are covered everywhere (grep-verified), and one investor-page filter that missed "Mortgage Funded" is fixed',
      'The Practice History chart is restored on Revenue: funded volume by year from 2021 with deal counts, the current year split into funded solid and weighted pipeline hatched (a projection, never an actual), the three 2026 milestones marked plainly at the right edge, and no trend device; a one-tap export renders it as a slide-ready image in the house style with the Fox mark',
    ],
  },
]

// The forward list once the original nine-session map is complete: the
// side-quests and follow-ups decided along the way. Kept honest and current.
const BACKLOG: { title: string; note: string }[] = [
  { title: 'Command Centre Phase B: page interiors + the client portal (B1 through B6.3 shipped)', note: 'The 2026-07-14 shell redesign (Phase A) shipped the grouped sidebar, the Desk strip, decision badges, and the lime-as-decisions rule. B1 (the lifecycle spine) shipped ONE canonical lifecycle definition (config/lifecycle.ts). B2a (stage truth) made Zoho the position source: every board card sits where its Zoho display stage says (six of seven live files moved to their true columns). B2b (Direction 2, "the control room") made the surface Deals: the list-first daily driver with exactly one lime on the top-most actionable row, the board behind a per-user toggle, the phase-led deal room with the read-only compliance package card, the website type pair, and the new-version toast (which shipped mute: the served worker’s bytes never changed and nothing asked the browser to look, so it could not fire until the 2026-07-17 toast fix). B3 (the consistency pass, 2026-07-17) extracted the design system into components/admin/ds/ and gave the menu the lifecycle\u2019s shape: eight working destinations across The book and The practice, the three market pages merged into Lenders (rates, intel, knowledge tabs), Renewals and Opportunities merged into Beyond funding with one summed badge, Bookkeeping folded into Revenue, every old path redirecting permanently, and the flagged decorative limes (ClientConstraints, the roadmap markers) demoted to calm ink. B4 (2026-07-17) shipped both finishing sweeps: real client names left the repo tip entirely (the standing PII exception is ended; the rewritten rule and its two carve-outs live in CLAUDE.md), the remaining admin surfaces moved onto the shared design system, the mechanical token pass retired the legacy lime, navy-hex, gray, and font classes, and the lime audit now walks the whole admin tree so a decorative lime anywhere fails the suite. B5 (2026-07-17) shipped the first CLIENT-FACING surface: a private status page at /portal/file/[token] that shows a client where their mortgage stands, in their own words, from the same lifecycle truth the admin reads, with no internal word and no other client\u2019s data, and it never tells a person no. It reuses nothing from the magic-link machinery (that lives in Zoho, plaintext, one token per record); links are opaque, hashed, 90-day, revocable FOXCA rows created and killed from a deal-room card, and a public-route PII leak on /onboard/expired was fixed along the way. B6 (2026-07-17) shipped the documents desk: the deal room’s document area, once one long table, is now compact per-document cards grouped into Needs your eyes, Waiting on the client, and Done, so a whole file’s document state reads in one glance; where the workbench has a per-document verdict (reachable read-only through the condition analysis’ document_id), the card carries it as a named draft, and it is all presentation over reads the page already made (no fetcher, gate, or write changed). B6.2 (2026-07-18) rebuilt that desk around the right noun — the Finmo document REQUEST — reading the synced request list (document_index, newly granted to portal_readonly by fox-underwriting migration 0048, the one pre-authorized exception) and reporting borrower-sectioned by state (waiting on the client / needs your look, AI-flagged first / done), with the evidence and verdict reparented into each request’s expansion; it also fixed two live defects Michael found on F053107 — a refinance header that showed a stale purchase price (now the fresh estimated value, or nothing) and a calc stack that stacked superseded recomputes (now current full-size, prior behind History). W2 workbench follow-ups: pull-time borrower attribution, and a per-request approve action so the desk can show “Approved by you”. B6.3 (2026-07-18) added freshness and attribution: an approval names its source (“Approved in Finmo”, never bare, never “by you”); a per-doc-kind freshness table (config/doc-freshness.ts, Michael-adjustable) flags an aged document with an amber “may be stale” advisory that counts into needs-your-look and sorts below AI flags but NEVER demotes the approval chip; and same-given-name sections disambiguate by relationship (“Lyntje (spouse)”). W2 content-date freshness (needs B7): extract document-internal dates per kind (tax year, current-year, on-face expiry), re-evaluate on a schedule, and turn a stale request into a one-tap re-request to the client. NEXT, in order: client comms (automated link delivery + the review-collection system that lets real testimonials return), then presentation, then the qualification module co-designed with Michael. Agent mode and agent onboarding come after. A persisted backfill-scan result would also light the Desk strip\u2019s manual-match fragment; a rate limiter on the client token page (the one anonymous Zoho-touching route) is a near-term follow-up.' },
  { title: 'Hold province-excluded extractions at the source', note: 'fox-underwriting: land new extractions from registry-province-excluded lenders as status held with held_reason province_ineligible (extraction pipeline, or a hold action on the rate-sheets gate), audited. The portal parks them out of the queue meanwhile (lib/sheet-park.ts), but the park is presentation, not a recorded hold.' },
  { title: 'Assign the alterna intel slug', note: "fox-underwriting: the ingest has no 'alterna' slug, so Alterna Savings sheets arrive with a null lender guess (item b1cfd0c1, 2026-07-13). Add the slug and backfill the guess; the portal surfaces null-slug rates items on the Lenders tab meanwhile." },
  { title: 'Collapse mirror 2: provinces', note: 'config/lender-provinces.ts mirrors the workbench lender registry. Make the registry server-readable (a portal_readonly-granted table is the cheapest path), read it live everywhere, and delete the mirror. A fetch failure must fall back to last-known-good with its as-of, never to empty, or every lender silently downgrades to unknown.' },
  { title: 'Collapse mirror 3: prime', note: 'config/prime.ts mirrors the workbench prime reference for server surfaces that cannot mint a gates token. Same fix shape as provinces, and more urgent: prime moves, and a stale mirror misprices every floating effective rate. Collapse before the next prime change.' },
  { title: 'Collapse mirror 4: the calculation engine', note: 'lib/mortgage-engine.ts and the workbench calc engine are parallel code. The dependency rule puts the engine in fox-underwriting, published as a package the portal consumes; interim containment is a shared golden-vector file asserted on both sides.' },
  { title: 'Parser history backfill', note: 'Backfill the rate-quote parser over the full sheet history so superseded books read complete.' },
  { title: 'Five compliance workbench fields + penalty methodology', note: 'fox-underwriting to add suitability, exit-strategy, identity-verification, disclosure-delivered, and package-state fields, plus a penalty-methodology field on machine profiles (the compare tray lights up when it lands).' },
  { title: 'Fox Grade', note: 'A single practice-health grade rolling up pacing, pipeline, compliance posture, and partner health.' },
  { title: 'Dialpad-automatic Call Review', note: "Ask Fox's v2: transcripts flowing in through the existing n8n call pipeline, no paste." },
  { title: 'RLS-per-user before direct credentials', note: 'Per-user row-level security on the FOXCA stores before any partner gets a direct (non-service) key.' },
  { title: 'Pipeline agent scoping', note: 'Scope the ingest/intel CLI paths off agent 1 before a second agent’s deals flow (from the gates setup_remaining contract).' },
  { title: 'Identity-linkage columns', note: 'A holder id on compliance credentials and a Clerk id on the workbench agents row, so offboarding matches exactly instead of by name/email.' },
  { title: 'MFA second factor', note: 'A second-factor step on the custom sign-in form for when production turns MFA on.' },
  { title: 'Reinstate path', note: 'A decision + UI for un-disabling an offboarded person (today one-way; reinstate is a Clerk-dashboard action).' },
]

const STATUS_CHIP: Record<SessionStatus, { label: string; cls: string }> = {
  shipped: { label: 'Shipped', cls: 'bg-cool-100 text-navy border border-cool-250' },
  current: { label: 'In progress', cls: 'bg-navy text-white' },
  next: { label: 'Next', cls: 'bg-navy/80 text-white' },
  planned: { label: 'Planned', cls: 'bg-cool-100 text-cool-600' },
}

export default async function RoadmapPage() {
  await requirePermission('roadmap.view')

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="font-heading text-navy text-2xl font-bold">Roadmap</h1>
        <p className="text-cool-500 font-ui text-sm mt-1">
          The command center build: what shipped, what is in progress, and what follows. This page
          updates every session alongside the ledger and the changelog; the interstitial rows are
          hotfixes and workbench micro-sessions, kept so the history reads true.
        </p>
      </div>

      {/* Architecture primer */}
      <div className="bg-navy text-white rounded-[9px] p-5 mb-6">
        <h2 className="font-heading font-bold text-white text-base mb-2">Three-layer architecture</h2>
        <ul className="text-sm font-ui text-cool-300 space-y-1.5">
          <li>
            <span className="text-white font-semibold">Zoho CRM</span> stays the system of record
            for relationships, stages, and tasks.
          </li>
          <li>
            <span className="text-white font-semibold">fox-underwriting workbench</span> (separate
            repo and Supabase project) is the system of record for underwriting truth: evidence,
            calcs, conditions, flags, reviews, audit log.
          </li>
          <li>
            <span className="text-white font-semibold">This portal</span> reads both through a
            database-enforced read-only role. Every decision write flows through the gates API;
            workbench logic is never re-implemented here.
          </li>
        </ul>
      </div>

      <div className="space-y-4">
        {SESSIONS.map(s => (
          <div key={s.n} className="bg-white border border-cool-200 rounded-[9px] p-5">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-heading text-navy font-bold">Session {s.n}</span>
              <span className="font-ui text-cool-700">{s.title}</span>
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_CHIP[s.status].cls}`}
              >
                {STATUS_CHIP[s.status].label}
              </span>
              <span className="text-[11px] text-cool-500 ml-auto">{s.repo}</span>
            </div>
            <ul className="mt-2 text-sm font-ui text-cool-600 list-disc pl-5 space-y-1">
              {s.items.map(item => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-8 bg-cool-50 border border-cool-200 rounded-[9px] p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-navy font-bold text-lg">&#10003;</span>
          <h2 className="font-heading text-navy font-bold text-base">The original map is complete.</h2>
        </div>
        <p className="text-sm font-ui text-cool-600">
          Nine sessions (plus the hotfix and the workbench micro-sessions) took the command center
          from an audit to an installable, multi-user, demo-ready operations platform. What follows
          is the living forward list — the side-quests and follow-ups decided along the way.
        </p>
      </div>

      <div className="mt-6 bg-white border border-cool-200 rounded-[9px] p-5">
        <h2 className="font-heading text-navy font-bold text-base mb-3">Forward backlog</h2>
        <ul className="space-y-3">
          {BACKLOG.map(b => (
            <li key={b.title} className="text-sm font-ui">
              <span className="text-navy font-semibold">{b.title}</span>
              <span className="text-cool-500"> — {b.note}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 pt-3 border-t border-cool-100 text-xs text-cool-500">
          Tracked as decided; this page updates each session. Section names in the sidebar are
          stable; a rename requires a CLAUDE.md note.
        </p>
      </div>
    </div>
  )
}
