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
