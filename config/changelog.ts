// Platform notes for the changelog page. Each build session appends its
// entry here (newest first); the page merges these with data-derived
// events (sheet approvals, intel arrivals) into one week-grouped feed.
// Convention: date is the ship date (Toronto), title is one line, detail
// is one or two sentences of what changed for the reader.

export interface PlatformNote {
  date: string // YYYY-MM-DD, Toronto
  title: string
  detail: string
}

export const PLATFORM_NOTES: PlatformNote[] = [
  {
    date: '2026-07-16',
    title: 'One lifecycle, spoken everywhere: Intake, Underwriting, Fulfilment, Complete & paid, Beyond funding',
    detail:
      'The pipeline surfaces stop speaking three vocabularies at once. One canonical lifecycle now drives them all: the Underwriting board groups its seven columns under four phase headers (Underwriting runs until a commitment is in hand, so a lender decline loops back through packaging without leaving the phase), the columns themselves got plain-words names (Documents & review, Package & submit, With the lender, Conditions), and the Today pipeline table groups its rows under the same phase names, so the board and the morning view finally read as one system. Every deal room header gains a journey stepper: the five phases in a row with the current one emphasized, and under it the current phase steps in the training-deck words, shaped to the file (a purchase shows the pre-approval letter and shopping steps, a refinance does not). Steps are marked honestly: what the platform does on its own, what Michael does by hand today (hover shows the how, so the dashboard doubles as the standing procedure), and what is coming (application chase reminders, a pre-approved-and-shopping signal, renewal outreach sends). Funded files read Beyond funding and link straight to Renewals. Nothing moved: every file sits in exactly the column and stage it did yesterday, only the headers and labels changed, and a stage the lifecycle does not know renders a loud amber flag instead of being forced into a group.',
  },
  {
    date: '2026-07-14',
    title: 'Underwriting: every file gets its room, automatically',
    detail:
      'The Deals page is now Underwriting, and the gap Michael found is closed: the Today view read the Zoho pipeline while the deals list read workbench rooms, and only three files had rooms. A standing bridge now guarantees that any active file at Submitted or beyond has an underwriting room the moment it needs one — created empty (no evidence, no conditions, no decisions; the work still starts with people), linked to the CRM record, and audited. It runs on a schedule and again every time the page loads, so the board is never stale while you look at it. The page itself is a work queue: five columns from Intake to With lender, each card showing the file, the amount, days without movement, and the next step in plain words; funded and dormant rooms sit behind a toggle, and files still below Submitted appear in a quiet strip above the board with a Start underwriting early action. Files that close in the CRM mark their rooms dormant, never deleted. Test fixtures are now structurally invisible on every live surface.',
  },
  {
    date: '2026-07-14',
    title: 'The Command Centre gets its shell: a calm machine with loud exceptions',
    detail:
      'The whole admin shell is redesigned around one rule: the bright green appears only where a decision is waiting on you. Sixteen flat sidebar items became five groups (Pipeline, Market, Practice, System) with Ask Fox as a persistent button at the bottom; a group shows a green dot when something inside it needs a decision, and badges count decisions, never events. The top of Home is now the Desk: a navy strip that says in one sentence everything waiting on you (rate sheets to approve, flags to resolve, renewals to confirm, files in review), each phrase linking straight to its queue — and when nothing is waiting it says so plainly, because an empty desk is the system working. Under it: up to three decision cards, then every active file with its stage and the next step in plain words. The sidebar collapses to an icon rail that remembers your choice, the notification bell now counts only genuine pending decisions (stale ones mark themselves read — the 88-unread pile is gone), the notification list splits into Decide, Watch, and Log, and search and Ask Fox share one box: anything the search cannot resolve hands to the practice agent as a question. Nothing was removed — every page is where it was, most renamed only where the old name described the plumbing instead of the job (Intel is now Lender intel, Settings is Users & settings). Page interiors are untouched; they adopt the new standards one surface at a time next.',
  },
  {
    date: '2026-07-13',
    title: 'Stage guard hardened, sync-created deals named properly, and no silent stages',
    detail:
      'Michael re-enabled the Submitted stage, and the checks around it found something bigger: Zoho stores two names for several stages (what you read is the display name, what integrations write is the internal one — Conditionally Approved is internally "Application Sent To Lender", and Underwriting In Progress internally carries a double-t typo). The Finmo sync’s stage guard was comparing across those two name spaces, so a hand-set stage like Collecting Documentation could be silently overwritten by an incoming Finmo event. The guard now knows every stage Michael can set, translates what it reads before comparing, and when it meets a stage it does not recognize it preserves the hand-set value and says so on the deal record instead of overwriting. Deals the sync creates are also now born with the book’s naming convention — file reference, em dash, primary borrower — instead of the bare reference Michael had to fix by hand. On the portal, Submitted now carries its own forecast weight (Nicholas Aitken’s $359,000 renewal rides the weighted pipeline at 15%), the funnel renders in true stage order, and any deal volume sitting in a stage the forecast does not know shows as a visible unmapped-stage flag on Home and Revenue rather than quietly counting for zero.',
  },
  {
    date: '2026-07-13',
    title: 'The vanished lenders: a hidden 1,000-row ceiling, found and removed',
    detail:
      'Tonight the Rates page dropped to 11 lender cards and listed quoted lenders like Scotiabank and First National as coverage-pending. No data moved and no deploy caused it: the database service caps every read at 1,000 rows, and the moment the approved-plus-superseded book grew past that (1,765 rows after tonight’s approvals), whole lenders whose sheets were older silently fell off the end of the fetch. The same ceiling was quietly shrinking the Opportunities board — two genuine act-now calls were sitting in stay-put because their best comparables never arrived. Every large read now pages through the full result, so the grid shows all 22 quotable lenders again and the board’s buckets are back to their verified counts. Coverage-pending also means something precise now: a lender appears there only when its newest rates sheet could not be read (a failed extraction or no parser for the format), with the failing sheet named on the chip — old unprocessed history and promo documents no longer count, and a lender with an approved book can never appear there. A live lender whose newest sheet failed gets a small needs-attention badge instead of vanishing. Two smaller things rode along: sheets from lenders the registry says cannot lend in any market the practice serves (the fresh Kootenay sheet loop) now park on a visible shelf instead of refilling the approval queue, returning automatically if the registry ever confirms a serviceable province; and a captured rates sheet the ingest could not attribute to a lender (tonight’s was Alterna Savings) now shows plainly on the Lenders tab instead of disappearing into no bucket.',
  },
  {
    date: '2026-07-13',
    title: 'Every rate carries its term, and the client report is rebuilt around the choice',
    detail:
      'Three corrections, then the new report. First, term honesty: a 1-year rate and a 5-year rate are different products, so every comparable now states its term beside its rate — on the board, in the reproducibility log, and on client documents — and the default comparison must use a rate whose term covers the projection window (the months left on the client’s term for a break, their own term length at a renewal). When only shorter terms exist, the projection stops at the term’s end instead of pretending the rate runs longer, and a deliberately short-term play (a cheap 1-year term with a plan at renewal) is a flagged strategy that takes Michael’s explicit two-tap approval, never an automatic call-list item. Second, a step up to better paper is now always priced as conventional lending: moving to a new lender on better terms is a new application, and the old mortgage’s insurance status never travels with it, so an insured-pricing rate can no longer appear on a graduation flag. Third, the renewal radar’s pools now formally exclude property-tracking rows by name as well as stage, so a property record carrying an amount and a maturity date can never be counted as a mortgage — and the three oldest lapsed entries were confirmed record-by-record to be prior terms of loans whose stories continued elsewhere, listed for Michael to resolve with one tap each. The savings report itself is rebuilt as a three-page document: the choice up front (lower payment, or same payment and mortgage-free sooner), one clearly dated rate with its term and never the lender’s name in writing, a side-by-side table of where each path stands by the end of the window, the penalty stated as a minimum with the break-even figure drawn on a gauge, and next steps framed as conditions rather than verdicts — because on a fixed rate, only the lender’s payout statement can decide it.',
  },
  {
    date: '2026-07-13',
    title: 'Paper grades, renewals the CRM missed, and the desk override',
    detail:
      'Three additions to the Opportunities engine. First, every lender now carries a paper grade — A, B, or private — and a monitored mortgage prices only against its own grade: a $1.29M private-paper file at 9.99% and a $1.35M alternative-program file were both being compared against prime monoline rates, which manufactures savings those clients may not qualify for. B paper now prices against the B book, private paper is honest about the book carrying nothing comparable, and a possible step up to better paper shows as a flagged opportunity with the rate and sheet date only — Michael assesses qualification, and pricing it on a client report takes his explicit two-tap approval, recorded. A mortgage whose lender the map does not know, or whose rate does not fit its mapped grade, routes to review rather than trusting the map. Second, the radar now catches renewals Zoho never heard about: when the monitoring feed shows a mortgage that started well after the deal closed, or a different lender or rate, the file moves to an appears-renewed section with both sides of the evidence, held out of the call pools until Michael confirms it (one click records Renewed With Us, the picklist value that arrived today) or clears it with a reason. Live, that finds five of the eight action-window files and six of the eighteen lapsed ones. Third, Michael can now override the comparison on any file: pick a different approved eligible quote, or enter a desk rate he was quoted directly with its source and a mandatory reason. Every override is recorded as a documented suitability decision, shows on the board and on the report as his call, and the report frames a desk rate as a direct quote, never a sheet rate. The savings log is also now append-only by database triggers, not just permissions, and dollar-one placeholder rows can no longer offer their garbage into the CRM.',
  },
  {
    date: '2026-07-13',
    title: 'Savings analysis: honest penalties, like-for-like comparisons, and a reproducible record',
    detail:
      'Three corrections land together. First, the client savings report stops concluding on the penalty floor: three months of interest is the minimum a fixed-rate penalty can be, and on a fixed mortgage priced above today’s market the interest rate differential is usually the larger figure that actually applies. For every fixed-rate break the report now states the minimum in that word, states the break-even penalty — the single number that decides whether the switch pays — and draws no conclusion until the real penalty is in hand, because knowing how a lender calculates its penalty is not the same as knowing the figure. Where the method is on file Michael estimates it on the call; either way the lender confirms the exact amount before anything moves. Second, the comparison itself is now like-for-like: a fixed client is compared against the best fixed rate, a floating client against their own kind, because a lower floating rate shown to a fixed client is not savings, it is rate risk the client does not carry today (on the proving file, $244.12 a month of true relief against a floating option showing $409.84 — the extra $165.72 is exposure, about $64 a month per quarter-point prime move). The cheaper cross-family option still shows, clearly labelled with a plain-language risk line, and recommending it on a client document takes Michael’s explicit two-tap approval, recorded. Floating rates also now rank on the effective rate computed from each lender’s own prime, never on the discount alone — a deep discount off a credit union’s higher internal prime is not a better rate. Third, every savings analysis that reaches the board or a client document now writes one append-only log row with the calculation version, a fingerprint of every input, the quotes used with their sheet dates, and the figures rendered, so any document handed to a client can be reproduced exactly, later, by anyone.',
  },
  {
    date: '2026-07-13',
    title: 'Backfill: a shared email can no longer write the wrong mortgage’s dates',
    detail:
      'Six people in the monitoring export hold more than one mortgage and carry the same email on every row. The Zoho backfill matched each mortgage to a contact by email, so both mortgages resolved to the same person and each proposed its own maturity date and rate into that person’s records — the system built to repair a wrong date was the one most likely to overwrite it with the other mortgage’s. A match is now a pair, the contact AND the specific mortgage, never the contact alone. When several export mortgages share an identity, the contact’s deals are attributed by evidence: the property address first, the amount second, and a deal that no mortgage — or more than one mortgage — can claim is contested and nothing is proposed into it. Contested deals land on a needs-manual-match card showing every claimant mortgage with its address, amount, and maturity beside each candidate deal, and Michael picks which record belongs to which mortgage; the pick is recorded in the backfill audit as his decision, and the server still refuses to fill anything but a field that is empty at write time. Against the live export, six shared-identity groups covering thirteen of the forty-one mortgages now route through this path instead of proposing automatically.',
  },
  {
    date: '2026-07-13',
    title: 'Opportunities: the stated payment is now the client’s actual payment',
    detail:
      'The savings analysis was deriving a client’s current payment by re-amortizing today’s balance over the original amortization period, which understates the payment on every seasoned mortgage (on a two-year-old $500,000 file at 5.50%, by $121.37 a month). A client knows what leaves their account, so this is the error a client catches. The payment now reconstructs the original schedule — the original amount over the original amortization — and the comparison prices the new rate over the months the client actually has left, which the analysis now carries. A new reconciliation gate defends every figure: the balance is modeled forward from origination and compared to the monitoring feed, and when the two disagree by more than half a percent the analysis is blocked into a Needs-review bucket on the board showing both figures and the drift, because prepayments, adjustable-rate changes, and bad vendor data all look exactly like this. A blocked file’s savings report states no figure at all, not even the balance, until Michael confirms the true position with the lender. Against the live export, 25 of 41 mortgages reconcile to a median drift of two hundredths of a percent, and 14 route to review — most consistent with accelerated-payment clients whose real payment genuinely differs from the monthly schedule, which is precisely why an unreconciled figure is never stated. The golden test set now carries a seasoned fixture where the wrong and right methods diverge, alongside the unseasoned commitment anchor where they agree to the cent.',
  },
  {
    date: '2026-07-13',
    title: 'One classifier: the portal reads eligibility straight from the workbench',
    detail:
      'The workbench finished classifying the rate book (947 of 949 approved quotes now carry their eligibility columns; the only unclassified rows are test artifacts), so the portal deleted its copy of the classification rule and reads the columns directly. One classifier now lives in one place, in the workbench, where the sheets are extracted. The fail-closed rule got stricter with it: a quote the workbench has not classified yet, which is exactly what a fresh arrival from the intel pipeline looks like, is treated as carrying an undisclosed restriction. It is excluded from default results, visible under show-restricted with a plain not-yet-classified note, and it can never reach a client document, not even pinned, because a restriction nobody can name is a restriction nobody can confirm the client meets. Re-running the monitoring export under the new reads reproduced every outcome exactly, which is the point: same answers, one source.',
  },
  {
    date: '2026-07-12',
    title: 'Lender eligibility, client constraints, and the cost of a preference',
    detail:
      'Two British Columbia credit unions were leading Ontario rate results. Kootenay Savings holds the deepest floating discount in the book, so it won the top slot on almost every floating scenario, and the Opportunities engine proposed it as a real client’s best comparable. It cannot do an Ontario deal. Now every surface that ranks a lender filters for structural eligibility first: the subject province governs (Ontario is the default and the only one today), an ineligible lender is excluded not deprioritized, and a lender whose provincial availability the workbench has not confirmed shows internally with an availability-not-confirmed flag and never on a client document. Program eligibility bites harder: the entire sub-four-percent ladder that was ranking as available is physician-only, banking-bundle-only, or exclusive-channel, so it hid the real best rate an ordinary borrower can genuinely have. The default results are now only what the client can definitely have, with qualifier toggles (physician, high net worth, business for self, new to Canada, willing to move banking, quick close) that unlock restricted rates, a show-restricted view that reveals them each carrying its requirement in a plain sentence, and a manual pin that records a confirmation before a restricted product can reach a client. Transaction type now determines product class: a monitoring client who breaks their mortgage is a refinance, which is uninsurable and priced against conventional rates only, with an eighty-percent loan-to-value hard cap and a requalification line on every card and client page. Re-running the monitoring export, twenty of forty-one opportunities changed bucket once conventional pricing, the cap, and eligibility were applied. Client lender constraints arrived as a first-class feature: per-client rules (exclude a lender, require one, prefer one), each with a required reason, kept with their history and never deleted, and the cost of the preference computed by the shared engine. A client choosing a lender for a stated reason with the cost quantified is the documented suitability assessment a regulator asks for, and it now counts on the deal room’s compliance card. Ask Fox inherited all of it: its rate tool returns eligible lenders only and it will not quote an unconfirmed one to a client. The savings and rate comparison documents withhold any lender whose province is not confirmed. The count of unconfirmed lenders is on the Rates page so the gap gets filled.',
  },
  {
    date: '2026-07-12',
    title: 'Opportunities: the Strategic Mortgage Monitoring engine',
    detail:
      'The monitoring service watches every enrolled mortgage and mails a savings figure; until now that intelligence lived in a monthly spreadsheet nobody worked. Opportunities turns the export into a pipeline. Upload the CSV and every raw row is captured first, before any parsing can fail, then parsed: money and percents read cleanly, a dash stays uncomputed and never becomes a zero, dollar-one placeholder rows are flagged not analyzed, co-borrowers collapse to one mortgage keeping every borrower, and lender names normalize to the book. Beside the service’s own figure the portal shows Fox’s independent analysis: the best gate-approved comparable with its sheet date, the payment change from the validated engine, the early-break penalty framed honestly (three months’ interest for floating; for fixed, the greater of that and the rate differential, with the lender’s method named or the gap stated), the break-even, and a net benefit after the penalty. That net benefit buckets the board — act now, marginal, stay put, insufficient — ranked by dollars, so the call list is ordered by what it is worth. The honest half matters most: a client on a low rate near maturity is told to WAIT, never sold a switch that costs more than it saves, and where the two figures disagree the disagreement is shown. One tap opens the priced scenario, preps a call, or downloads a grade-six savings report (compensation scrubbed from every line, wait-for-maturity framing where it applies). A backfill tool matches each file to Zoho by email, then phone, then name, and proposes filling only the EMPTY maturity dates and rates the export knows and the CRM does not — each a confirmation approved one at a time or all at once, every write recomputed server-side and recorded; conflicts are shown, never overwritten. On Renewals, the lapsed alarm now reconciles against the export: still-with-lender past maturity is a recoverable auto-renewal and the highest-value call on the board, lender-changed is flagged as won-or-lost-unknown, and a retention signal is computed. Home gained an act-now opportunities line. Verified against the live export: 41 mortgages from 49 rows, one placeholder caught, zero parse failures, zero unmapped lenders, and Nicholas Aitken’s 1.99% file correctly told to wait with its maturity and rate proposed as backfills.',
  },
  {
    date: '2026-07-12',
    title: 'The Renewal Radar: no renewal slips again',
    detail:
      'The practice was losing renewals silently. The renewal automation that was designed with a 150-day lead and a six-email drip has never fired on a single deal, so funded mortgages were maturing with no contact and no record. A new Renewals section reads every funded deal by maturity window and makes the failure impossible to miss. Lapsed is an alarm, not a status: 18 funded files worth $11.0M matured with no recorded outcome, sorted by amount, in red that cannot be collapsed away. Eight files worth $4.37M mature before year end and are actionable now. Six funded deals have no maturity date at all and are invisible to the whole system until it is backfilled, so they sit in their own block at the top that persists until it is empty. Every card carries the payment-shock preview, the reason a client answers the phone: the file rate against the best approved fixed rate today with its sheet date, and the monthly payment change from the validated engine, honest where the current rate is not on file. One tap preps an Ask Fox call brief; the status actions (contacted, in discussion, application sent, renewed elsewhere, no longer needs, unreachable) write to Zoho through the same confirmed-action path the agent cards use, each an enumerated choice recorded with who and when. Home gained a lapsed-renewal alarm, an action-window count, a missing-maturity count, and a compact five-number strip; the bell fires when a renewal crosses into the action window and when one lapses. Revenue restored its practice KPIs (funded all time, average deal, best year, years active) alongside the renewal book, a number the practice had never seen: $17.95M under management, $7.71M maturing in the next year. Every figure reconciles to the corrected pipeline data. One honest gap found and reported: Zoho has no picklist value for a renewal won with us, so a retention cannot be recorded until that value is added.',
  },
  {
    date: '2026-07-12',
    title: 'Pipeline truth, and the Practice History chart',
    detail:
      'The pipeline was counting things that are not deals. Forty-nine property records sat in an Additional Properties stage, and two dozen dead files from 2021 and 2022 sat open in Options and Pending, never closed and never marked lost. Together they inflated every open-pipeline figure and, worse, flipped goal pacing to read ahead of target when the true position was behind. The fix is a self-defending pipeline: property records stay out by stage, and any open file whose close date is more than 90 days past, or that has sat open more than 180 days without moving, drops into a visible, groomable stale bucket on Revenue that links straight to Zoho. Nothing is deleted; groom a file and it leaves the bucket on the next read. The active pipeline now reconciles to 8 real files worth $4.71M, the weighted pipeline fell from $4.14M to $2.19M, and the pace reads honestly behind. Both funded stage names are covered everywhere ("Mortgage Funded" for the history, "Funded" for 2026), and one investor-page filter that missed one of them is fixed. The Practice History chart is also back on Revenue: funded volume by year from 2021 with deal counts on every bar, the current year split into funded-to-date solid and the weighted pipeline stacked above it as a hatched projection so a forecast is never read as an actual, the three 2026 milestones marked plainly at the right edge, and no trend line pretending the automation has moved numbers it cannot have moved yet. A one-tap export renders it as a slide-ready image in the house style with the Fox mark, for the room of mortgage professionals it was built for.',
  },
  {
    date: '2026-07-11',
    title: 'The offers desk: promotional offers become approvable',
    detail:
      'Twenty-three lender promos were waiting in a terminal for approval; now they sit on the desk. A new Offers tab on Approvals decides each one with a two-tap approve or reject that flows through the audited gate under your name, and each card shows the offer priced as identity, the extraction evidence with page citations, the conditions verbatim, and — the field that matters most — the window, rendered loudly. Nineteen of the twenty-three had no stated end date, so every one of those now carries an unmissable warning that it will not retire on its own and must be confirmed before quoting, on the desk and everywhere the offer appears afterward. Once approved, an offer lands on the Promos board with its full detail, matches a scenario permissively where its eligibility could not be read (and says so), sorts first when it beats every sheet quote, and can be pinned into a client PDF with its conditions and expiry — never its compensation. Pending offers also join the Home attention rail and the notification bell.',
  },
  {
    date: '2026-07-11',
    title: 'Lender logos are live',
    detail:
      'Thirty-three lender logos are now dropped in, so nearly every lender shows its real mark across Rates, Knowledge, Intel, and the approvals desk instead of a monogram. Lenders without a logo keep the on-brand monogram, and any logo added later appears on its own with no code change.',
  },
  {
    date: '2026-07-11',
    title: 'Rates v3: tabs, lender browse, logos, and the promos board',
    detail:
      'Rates is now four tabs. Scenario still answers who wins a deal and stays the default (the find-rates button from a deal room lands here with its file banner), and its lender cards now open with an unmistakable click — a pointer, a hover lift, a chevron, and a drill-in that scrolls to the top. A new Lenders tab browses the whole approved book with no scenario: each lender shows its best rate per product class and its deepest floating discount (adjustable and variable kept apart, never one misleading lowest number), and the cards group into three honest states — live, awaiting your approval (links to the sheets queue), and coverage pending (a sheet was captured but its format has no parser yet). A new Promos tab is the offer book on its own board, soonest to expire first, each card citing the announcement it came from. Every lender now carries a mark: a real logo the moment one is dropped into public/lenders/, an on-brand navy-and-lime monogram until then, shown everywhere a lender is named. Michael can name and save the scenarios he runs often and recall them in a tap. And the client rate PDF is now guarded by a test that proves it never shows lender compensation to a borrower.',
  },
  {
    date: '2026-07-10',
    title: 'Session 9: The finale — an app, a bell, a search bar, and a demo',
    detail:
      'The command center becomes an installable app. Add it to your home screen from admin or a partner portal; a security-first service worker caches the shell and static assets but never a page or an API response carrying client data, and an offline screen stands in when you lose signal. A notification bell now gathers five kinds of signal the portal already computes — new rate sheets to review, sync-freshness alarms, form-intake failures, credential renewals entering the 60- and 14-day windows, and gate decisions made from the command line — so the desk and the terminal are one world; each category is a toggle, per-user read state is remembered, and nothing replaces the existing emails. Press ⌘K anywhere to search deals, contacts, partners, lender knowledge, and the navigation itself, grouped and keyboard-driven, honest when a source is slow. And a new admin-only demo mode swaps the whole platform to believable fictional data — zero real clients on screen, every write disabled — so the command center can be shown to a prospect with nothing real exposed. The finale sweep retired the last mock pages and the dormant daily-briefing email (the Home rail serves it live now), made the partner portals fully responsive, and marked the original nine-session map complete.',
  },
  {
    date: '2026-07-10',
    title: 'Session 8: Multi-user hardening',
    detail:
      'The platform is ready for its second human before the second human exists. Roles are live and verified: ops, underwriting reviewer, and agent each see exactly their surface, every admin page gates on a permission key, and Settings gains an effective-access view (pick a role, see everything it reaches). View-as is now a governed capability: a picker under the portals nav, structurally read-only (controls absent, server refuses writes), every session logged with viewer and viewed under Audit Log. Provisioning is a wizard at Settings → People — staff, partner (Zoho id picked, never typed), and agent (workbench half through the Gates API with its honest setup checklist). Offboarding is one two-tap action: access disabled and sessions revoked immediately, with a persisted cleanup checklist built from what the system knows. Nothing deletes.',
  },
  {
    date: '2026-07-10',
    title: 'Session 7: Revenue and Partners',
    detail:
      'The money layer and the relationship layer. Revenue: commission forecast by close month (stage-weighted, priced from recorded commissions where they exist and the comp model everywhere else, every estimate labeled), funded trends with honest mix charts, the conversion funnel with its method caveat, goal pacing deep view, and the business-line P&L tile with its honest not-connected state. Partners: ranked for Monday attention with health chips, referral stats, attributed revenue, and portal sign-in recency; detail pages gain referred files and cadence. Ask Fox learned to check open Zoho tasks before proposing a card (prompt v2), and the chat gained a thinking indicator.',
  },
  {
    date: '2026-07-10',
    title: 'Ask Fox: the practice agent',
    detail:
      'A chat in the sidebar that preps and reviews calls from the systems the portal already trusts: Zoho records, the gate-approved rate book, lender knowledge with its as-of dates, and the workbench file where one exists. Every number carries its source, gaps say not captured, and CRM changes only happen through confirm cards you tap. Decisions stay on the Approvals desk. Add ANTHROPIC_API_KEY in Vercel to switch it on; rubric v1 and the system prompt are versioned in the repo.',
  },
  {
    date: '2026-07-10',
    title: 'Session 6: floating rates on screen, and Compliance',
    detail:
      'Adjustable and variable rates now render as what they are: discount first, with the effective rate computed against the served prime and labeled with its date. Cash back tiers are their own rows with the printed conditions, promo offers appear inside matching scenarios, and the approvals cards print floating sheets correctly. New Compliance module: credential renewals on the attention rail, the complaint and incident register, and a versioned policy library with acknowledgments. Nothing in it ever deletes.',
  },
  {
    date: '2026-07-10',
    title: 'Session 5: Rates becomes a scenario tool',
    detail:
      'Describe the deal and see which lenders win it, lowest rate first, from sheets Michael approved through the audited gate. Drill into products with full provenance, pin up to three to compare, and download a client-ready PDF. Deal rooms gain a find-rates button. The dense table stays behind a toggle.',
  },
  {
    date: '2026-07-09',
    title: 'Session 4: Knowledge, Rates, Intel, and the reference layer',
    detail:
      'Lender knowledge base with as-of dates and stale flags, the rates browser with superseded history, promo countdowns, the intel feed, conditions decisions in the deal room, terminal files out of the attention rail, and this changelog.',
  },
  {
    date: '2026-07-09',
    title: 'Session 3: the desk goes live',
    detail:
      'Approvals desk with four decision queues through the Gates API, deals list and deal room, the audit viewer with CSV export, and the database-enforced read-only posture (service key removed).',
  },
  {
    date: '2026-07-09',
    title: 'Session 2: the Gates API (workbench repo)',
    detail:
      'Every portal decision now flows through the fox-underwriting Gates API with the authority matrix enforced server-side and full audit identity.',
  },
  {
    date: '2026-07-09',
    title: 'Session 1: the command center foundation',
    detail:
      'Admin shell and navigation, the exception-first Home, Status page, authority matrix, and read-only workbench wiring.',
  },
]
