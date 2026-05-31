// ─── Demo FP portal — static sample data ──────────────────────────────────────
// SANDBOXED, READ-ONLY DEMO DATA for the public /demo/fp pitch portal.
//
// HARD RULES (verified after build):
//   • Nothing here imports @/lib/zoho, @/lib/auth, or any Clerk runtime.
//   • Field names/types mirror what the real FP UI consumes (the inline
//     interfaces in the live app/portal/fp pages + components/ReferralPartner-
//     ClientFile) so the copied presentational JSX renders unchanged — but the
//     types below are defined LOCALLY here (no cross-import from lib/zoho).
//   • Every client name is obviously fictional. No real client data.
//   • SMM copy presents Fox's OBSERVED analytical finding, never a guarantee.
//
// All values are hand-authored constants. There is no fetch, no API, no Zoho.

// ─── Local type definitions (mirror the real UI's consumed shapes) ─────────────

export interface DemoDashboardStats {
  totalReferrals: number
  activeMonitoring: number
  closedMortgages: number
  fundedVolume: number
  leadToClose: number
  savingsYTD: number
  mortgagesUnderMgmt: number
}

export interface DemoRecentDeal {
  client: string
  dealId: string
  stage: string
  lastActivity: string | null
  savingsIdentified: string | null
}

export interface DemoFPClient {
  id: string
  dealName: string
  contactName: string
  amount: number | null
  mortgageRate: number | null
  stage: string
  nextReviewDate: string | null
  savingsIdentified: string | null
  relationshipTag?: string | null
}

// Mirrors components/ReferralPartnerClientFile ClientDetail (+ its Note).
export interface DemoNote {
  id: string
  body: string
  createdTime: string
  createdBy: string
}

export interface DemoClientDetail {
  id: string
  dealName: string
  contactName: string
  amount: number | null
  mortgageRate: number | null
  stage: string
  stageModifiedTime: string | null
  city: string | null
  province: string | null
  location: string | null
  mortgageType: string | null
  transactionType: string | null
  type: string | null
  termYears: number | null
  amortizationYears: number | null
  termType: string | null
  rateType: string | null
  paymentAmount: number | null
  paymentFrequency: string | null
  downPayment: number | null
  firstPaymentDate: string | null
  lenderName: string | null
  lenderClassification: string | null
  closingDate: string | null
  maturityDate: string | null
  nextReviewDate: string | null
  savingsIdentified: string | null
  finmoCalculatedLtv: number | null
  ltv: number | null
  totalLoanAmount: number | null
  purchasePriceValue: number | null
  description: string | null
  relationshipTag?: string | null
  messages: DemoNote[]
}

export interface DemoMessage {
  id?: string
  from: string
  body: string
  date: string
}

// ─── Booking CTA placeholder ───────────────────────────────────────────────────
// TODO: Michael to provide booking link. Until then this is an inert placeholder;
// the demo never links out to a real scheduler.
export const DEMO_BOOKING_URL = '#'

// Shown across every demo view so the planner always knows this is a sample.
export const DEMO_BANNER_TEXT =
  'Sample data shown for demonstration. This is a preview of the Financial Planner portal, not a live account.'

// ─── Dashboard ─────────────────────────────────────────────────────────────────

export const DEMO_DASHBOARD_STATS: DemoDashboardStats = {
  totalReferrals: 12,
  activeMonitoring: 4,
  closedMortgages: 7,
  fundedVolume: 4_310_000,
  leadToClose: 58.3,
  savingsYTD: 9_840,
  mortgagesUnderMgmt: 6_125_000,
}

export const DEMO_RECENT: DemoRecentDeal[] = [
  {
    client: 'Jordan Sample',
    dealId: 'demo-001',
    stage: 'Underwriting In Progress',
    lastActivity: '2026-05-22',
    savingsIdentified: null,
  },
  {
    client: 'Riley Placeholder',
    dealId: 'demo-002',
    stage: 'Mortgage Funded',
    lastActivity: '2026-04-30',
    savingsIdentified: '$3,120',
  },
  {
    client: 'Casey Example',
    dealId: 'demo-003',
    stage: 'Collecting Documentation',
    lastActivity: '2026-05-18',
    savingsIdentified: null,
  },
  {
    client: 'Avery Demo',
    dealId: 'demo-004',
    stage: 'Mortgage Funded',
    lastActivity: '2026-03-11',
    savingsIdentified: '$2,540',
  },
  {
    client: 'Morgan Testcase',
    dealId: 'demo-005',
    stage: 'Lead',
    lastActivity: '2026-05-28',
    savingsIdentified: null,
  },
]

// ─── Clients list ────────────────────────────────────────────────────────────

export const DEMO_CLIENTS: DemoFPClient[] = [
  {
    id: 'demo-001',
    dealName: 'Sample Purchase — Fergus',
    contactName: 'Jordan Sample',
    amount: 612_000,
    mortgageRate: 4.79,
    stage: 'Underwriting In Progress',
    nextReviewDate: '2026-06-15',
    savingsIdentified: null,
    relationshipTag: 'Referred by you',
  },
  {
    id: 'demo-002',
    dealName: 'Sample Renewal — Guelph',
    contactName: 'Riley Placeholder',
    amount: 484_500,
    mortgageRate: 4.24,
    stage: 'Mortgage Funded',
    nextReviewDate: '2026-09-01',
    savingsIdentified: '$3,120',
    relationshipTag: 'Referred by you',
  },
  {
    id: 'demo-003',
    dealName: 'Sample Purchase — Elora',
    contactName: 'Casey Example',
    amount: 538_000,
    mortgageRate: 4.99,
    stage: 'Collecting Documentation',
    nextReviewDate: null,
    savingsIdentified: null,
    relationshipTag: 'Referred by you',
  },
  {
    id: 'demo-004',
    dealName: 'Sample Refinance — Kitchener',
    contactName: 'Avery Demo',
    amount: 712_000,
    mortgageRate: 4.34,
    stage: 'Mortgage Funded',
    nextReviewDate: '2026-07-20',
    savingsIdentified: '$2,540',
    relationshipTag: 'Referred by you',
  },
  {
    id: 'demo-005',
    dealName: 'Sample Purchase — Cambridge',
    contactName: 'Morgan Testcase',
    amount: 459_000,
    mortgageRate: null,
    stage: 'Lead',
    nextReviewDate: null,
    savingsIdentified: null,
    relationshipTag: 'Referred by you',
  },
  {
    id: 'demo-006',
    dealName: 'Sample Renewal — Waterloo',
    contactName: 'Quinn Fictional',
    amount: 521_000,
    mortgageRate: 4.49,
    stage: 'Mortgage Funded',
    nextReviewDate: '2026-11-05',
    savingsIdentified: null,
    relationshipTag: 'Referred by you',
  },
]

// ─── Client detail files (keyed by id) ─────────────────────────────────────────
// Two representative files: one in-progress (drives the stage tracker, Next Step
// pill, days-in-stage), one funded (drives the renewal headline + monitoring node).

const DEMO_CLIENT_DETAIL_IN_PROGRESS: DemoClientDetail = {
  id: 'demo-001',
  dealName: 'Sample Purchase — Fergus',
  contactName: 'Jordan Sample',
  amount: 612_000,
  mortgageRate: 4.79,
  stage: 'Underwriting In Progress',
  stageModifiedTime: '2026-05-22T14:30:00-04:00',
  city: 'Fergus',
  province: 'ON',
  location: 'Fergus, ON',
  mortgageType: 'First',
  transactionType: 'Purchase',
  type: 'Purchase',
  termYears: 60,
  amortizationYears: 300,
  termType: 'Fixed',
  rateType: 'Fixed',
  paymentAmount: 3_482.16,
  paymentFrequency: 'Monthly',
  downPayment: 153_000,
  firstPaymentDate: '2026-07-01',
  lenderName: 'Sample Trust (Demo Lender)',
  lenderClassification: 'A',
  closingDate: '2026-06-20',
  maturityDate: null,
  nextReviewDate: '2026-06-15',
  savingsIdentified: null,
  finmoCalculatedLtv: 75.0,
  ltv: null,
  totalLoanAmount: 612_000,
  purchasePriceValue: 765_000,
  description: 'Sample file for demonstration. Not a real client.',
  relationshipTag: 'Referred by you',
  messages: [
    {
      id: 'demo-msg-1',
      body: 'Thanks for the referral. I have reached out to Jordan to start the application.',
      createdTime: '2026-05-10T09:15:00-04:00',
      createdBy: 'Michael Fox',
    },
    {
      id: 'demo-msg-2',
      body: 'Great, they are expecting your call. Let me know if you need anything from me.',
      createdTime: '2026-05-10T11:42:00-04:00',
      createdBy: 'You',
    },
  ],
}

const DEMO_CLIENT_DETAIL_FUNDED: DemoClientDetail = {
  id: 'demo-002',
  dealName: 'Sample Renewal — Guelph',
  contactName: 'Riley Placeholder',
  amount: 484_500,
  mortgageRate: 4.24,
  stage: 'Mortgage Funded',
  stageModifiedTime: '2026-04-30T10:00:00-04:00',
  city: 'Guelph',
  province: 'ON',
  location: 'Guelph, ON',
  mortgageType: 'First',
  transactionType: 'Refinance',
  type: 'Refinance',
  termYears: 60,
  amortizationYears: 240,
  termType: 'Fixed',
  rateType: 'Fixed',
  paymentAmount: 2_976.55,
  paymentFrequency: 'Monthly',
  downPayment: null,
  firstPaymentDate: '2026-05-01',
  lenderName: 'Sample Bank (Demo Lender)',
  lenderClassification: 'A',
  closingDate: '2026-04-30',
  maturityDate: '2031-04-30',
  nextReviewDate: '2026-09-01',
  savingsIdentified: '$3,120',
  finmoCalculatedLtv: 64.6,
  ltv: null,
  totalLoanAmount: 484_500,
  purchasePriceValue: 750_000,
  description: 'Sample funded file enrolled in Strategic Mortgage Monitoring. Not a real client.',
  relationshipTag: 'Referred by you',
  messages: [
    {
      id: 'demo-msg-3',
      body: 'Riley\'s renewal funded today. They are now enrolled in Strategic Mortgage Monitoring.',
      createdTime: '2026-04-30T16:05:00-04:00',
      createdBy: 'Michael Fox',
    },
  ],
}

const DEMO_CLIENT_DETAILS: Record<string, DemoClientDetail> = {
  'demo-001': DEMO_CLIENT_DETAIL_IN_PROGRESS,
  'demo-002': DEMO_CLIENT_DETAIL_FUNDED,
}

// Returns a sample client file by id. Unknown ids fall back to the in-progress
// sample so every demo deep-link renders something (read-only, no fetch).
export function getDemoClientDetail(id: string): DemoClientDetail {
  return DEMO_CLIENT_DETAILS[id] ?? DEMO_CLIENT_DETAIL_IN_PROGRESS
}

// ─── Messages thread (general inbox) ───────────────────────────────────────────

export const DEMO_MESSAGES: DemoMessage[] = [
  {
    id: 'demo-thread-1',
    from: 'Michael Fox',
    body: 'Hi! Welcome to the Fox Mortgage Financial Planner Portal. Feel free to use this space to ask questions or discuss anything not specific to a single client file.',
    date: '2026-05-01T09:00:00-04:00',
  },
  {
    id: 'demo-thread-2',
    from: 'You',
    body: 'Thanks Michael. A couple of my clients are coming up for renewal this fall. How does the monitoring work in the meantime?',
    date: '2026-05-02T13:20:00-04:00',
  },
  {
    id: 'demo-thread-3',
    from: 'Michael Fox',
    body: 'Every enrolled mortgage is checked against the market daily. In our experience, about 20% of clients see an immediate savings opportunity and the rest are positioned to benefit over their term. Your clients get a monthly report either way, and I reach out before renewal when there is a real opportunity.',
    date: '2026-05-02T15:05:00-04:00',
  },
]
