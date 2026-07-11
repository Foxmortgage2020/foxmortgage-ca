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
