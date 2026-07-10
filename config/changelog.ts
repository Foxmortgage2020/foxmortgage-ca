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
