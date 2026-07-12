// Demo mode fixtures (Session 9) — a small, believable, OBVIOUSLY-fictional
// book that stands in for every real read while demo mode is on. The names
// are plainly synthetic (Marty McFixture, Ada Testwell, Sample Borrower) so
// nobody could mistake a demo screen for a real client.
//
// Every export matches the exact return shape of the fetcher it replaces
// (verified against the interfaces in lib/underwriting.ts, lib/zoho-admin.ts,
// lib/zoho.ts, lib/compliance.ts). Dates are fixed ISO strings — nothing
// here reads a clock — anchored loosely around 2026-07 so overdue vs.
// upcoming states render.
//
// Type-only imports keep this module free of any runtime dependency on the
// fetchers it fixtures (no import cycle): the guards import the data from
// here, this file imports only their types.

import type {
  UwResult,
  WorkbenchDeal,
  DealDetail,
  DealConditionRow,
  DealFlagRow,
  DealStatementDoc,
  DealShadowScore,
  BorrowerRow,
  IncomeCalcRow,
  RatioCalcRow,
  DocumentRow,
  AuditEntry,
  OpenFlag,
  ConditionsDue,
  PendingStatementReview,
  PendingSheetReview,
  ShadowQueueCard,
  RateQuoteStats,
  IntakeFreshness,
  StatementQueueCard,
  DiscrepancyFlag,
  SheetQueueCard,
  OpenFlagCard,
  LastDecided,
  StatementFieldRow,
} from '@/lib/underwriting'
import type { SlimDeal, OpenTask, SlimLead } from '@/lib/zoho-admin'
import type { RevenueDeal } from '@/lib/revenue'
import type { PartnerListItem, PartnerDocument } from '@/lib/zoho'
import type { ComplianceCredential } from '@/lib/compliance'

// The workbench-shaped success wrapper. Structurally assignable to both
// UwResult<T> and ComplianceResult<T> (their ok branches are identical), so
// the compliance guard reuses it too.
export function demoResult<T>(data: T): { configured: true; ok: true; data: T } {
  return { configured: true, ok: true, data }
}

// ─── Zoho: slim deals (Home pipeline, closings) ─────────────────────────────

export const demoSlimDeals: SlimDeal[] = [
  { id: 'demo-z-1', dealName: 'Marty McFixture — Purchase', stage: 'Underwriting In Progress', amount: 640000, closingDate: '2026-07-24', createdTime: '2026-05-30' },
  { id: 'demo-z-2', dealName: 'Ada Testwell — Refinance', stage: 'Conditionally Approved', amount: 415000, closingDate: '2026-08-05', createdTime: '2026-06-04' },
  { id: 'demo-z-3', dealName: 'Sample Borrower — Renewal', stage: 'Options', amount: 512000, closingDate: '2026-08-19', createdTime: '2026-06-10' },
  { id: 'demo-z-4', dealName: 'Placeholder Family Trust — Purchase', stage: 'Collecting Documentation', amount: 880000, closingDate: '2026-09-02', createdTime: '2026-06-20' },
  { id: 'demo-z-5', dealName: 'Dummy Holdings Inc — Investment', stage: 'Pending', amount: 305000, closingDate: null, createdTime: '2026-06-25' },
  { id: 'demo-z-6', dealName: 'Faux Renner — Purchase', stage: 'Approved', amount: 725000, closingDate: '2026-07-30', createdTime: '2026-06-09' },
  { id: 'demo-z-7', dealName: 'Testina Mockford — Refinance', stage: 'Qualification', amount: 268000, closingDate: '2026-09-16', createdTime: '2026-06-28' },
  { id: 'demo-z-8', dealName: 'Example Estates — Purchase', stage: 'Options', amount: 1150000, closingDate: '2026-10-01', createdTime: '2026-06-15' },
  { id: 'demo-z-9', dealName: 'Sandbox Singh — Renewal', stage: 'Underwriting In Progress', amount: 398000, closingDate: '2026-08-11', createdTime: '2026-06-01' },
  { id: 'demo-z-10', dealName: 'Prototype Partners — Purchase', stage: 'Funded', amount: 560000, closingDate: '2026-06-18', createdTime: '2026-03-02' },
  { id: 'demo-z-11', dealName: 'Mockwell Chen — Purchase', stage: 'Funded', amount: 472000, closingDate: '2026-05-27', createdTime: '2026-02-19' },
  { id: 'demo-z-12', dealName: 'Fixture Fields — Refinance', stage: 'Mortgage Funded', amount: 331000, closingDate: '2026-04-14', createdTime: '2026-01-08' },
]

// ─── Zoho: revenue deals (Revenue, Partners, funnel) ────────────────────────
// A believable mix: some carry a real Total_Commission (basis 'actual'),
// some carry only bps for the model to price, some carry a referral partner.

export const demoRevenueDeals: RevenueDeal[] = [
  {
    id: 'demo-z-10', dealName: 'Prototype Partners — Purchase', stage: 'Funded', amount: 560000,
    closingDate: '2026-06-18', createdTime: '2026-03-02', totalCommission: 7140,
    bps: 145, vbBps: 15, splitToNetwork: 0.15, lenderName: 'Sample Bank', lenderClassification: 'A',
    referralPartnerId: 'demo-p-1', referralPartnerName: 'Faux Financial', rateType: 'Fixed',
    termYears: 5, mortgageType: 'Conventional', transactionType: 'Purchase', mortgageRate: 4.59,
  },
  {
    id: 'demo-z-11', dealName: 'Mockwell Chen — Purchase', stage: 'Funded', amount: 472000,
    closingDate: '2026-05-27', createdTime: '2026-02-19', totalCommission: 6018,
    bps: 140, vbBps: 10, splitToNetwork: 0.15, lenderName: 'Placeholder Trust', lenderClassification: 'A',
    referralPartnerId: null, referralPartnerName: null, rateType: 'Fixed',
    termYears: 5, mortgageType: 'Conventional', transactionType: 'Purchase', mortgageRate: 4.74,
  },
  {
    id: 'demo-z-12', dealName: 'Fixture Fields — Refinance', stage: 'Mortgage Funded', amount: 331000,
    closingDate: '2026-04-14', createdTime: '2026-01-08', totalCommission: 0,
    bps: 120, vbBps: null, splitToNetwork: 0.15, lenderName: 'Dummy Credit Union', lenderClassification: 'B',
    referralPartnerId: 'demo-p-2', referralPartnerName: 'Testwell Realty', rateType: 'Variable',
    termYears: 5, mortgageType: 'Insurable', transactionType: 'Refinance', mortgageRate: 5.20,
  },
  {
    id: 'demo-z-1', dealName: 'Marty McFixture — Purchase', stage: 'Underwriting In Progress', amount: 640000,
    closingDate: '2026-07-24', createdTime: '2026-05-30', totalCommission: 0,
    bps: 150, vbBps: 15, splitToNetwork: 0.15, lenderName: 'Sample Bank', lenderClassification: 'A',
    referralPartnerId: 'demo-p-1', referralPartnerName: 'Faux Financial', rateType: 'Fixed',
    termYears: 5, mortgageType: 'Conventional', transactionType: 'Purchase', mortgageRate: 4.64,
  },
  {
    id: 'demo-z-2', dealName: 'Ada Testwell — Refinance', stage: 'Conditionally Approved', amount: 415000,
    closingDate: '2026-08-05', createdTime: '2026-06-04', totalCommission: 0,
    bps: null, vbBps: null, splitToNetwork: null, lenderName: 'Placeholder Trust', lenderClassification: 'A',
    referralPartnerId: null, referralPartnerName: null, rateType: 'Fixed',
    termYears: 3, mortgageType: 'Conventional', transactionType: 'Refinance', mortgageRate: 4.89,
  },
  {
    id: 'demo-z-6', dealName: 'Faux Renner — Purchase', stage: 'Approved', amount: 725000,
    closingDate: '2026-07-30', createdTime: '2026-05-12', totalCommission: 0,
    bps: 145, vbBps: 10, splitToNetwork: 0.15, lenderName: 'Example Bank', lenderClassification: 'A',
    referralPartnerId: 'demo-p-2', referralPartnerName: 'Testwell Realty', rateType: 'Fixed',
    termYears: 5, mortgageType: 'Insured', transactionType: 'Purchase', mortgageRate: 4.44,
  },
]

// ─── Zoho: tasks due ────────────────────────────────────────────────────────

export const demoOpenTasks: OpenTask[] = [
  { id: 'demo-t-1', subject: 'Collect T4 from Marty McFixture', dueDate: '2026-07-08', priority: 'High', status: 'Not Started', overdue: true },
  { id: 'demo-t-2', subject: 'Send commitment to Ada Testwell', dueDate: '2026-07-10', priority: 'High', status: 'In Progress', overdue: false },
  { id: 'demo-t-3', subject: 'Follow up on appraisal — Example Estates', dueDate: '2026-07-10', priority: 'Normal', status: 'Not Started', overdue: false },
]

// ─── Zoho: leads ────────────────────────────────────────────────────────────

export const demoLeads: SlimLead[] = [
  { id: 'demo-l-1', leadSource: 'Website - SMM Wizard', createdTime: '2026-07-01', leadStatus: 'Contacted' },
  { id: 'demo-l-2', leadSource: 'Website - SMM Wizard', createdTime: '2026-06-28', leadStatus: 'Qualified' },
  { id: 'demo-l-3', leadSource: 'CoPilot Ai', createdTime: '2026-06-20', leadStatus: 'New' },
  { id: 'demo-l-4', leadSource: 'Referral Partner', createdTime: '2026-06-15', leadStatus: 'Qualified' },
  { id: 'demo-l-5', leadSource: 'Website', createdTime: '2026-06-11', leadStatus: 'Contacted' },
]

// ─── Zoho: partners + partner documents ─────────────────────────────────────

export const demoPartners: PartnerListItem[] = [
  { id: 'demo-p-1', name: 'Faux Financial', email: 'hello@fauxfinancial.example', phone: '(000) 555-0101', city: 'Guelph', province: 'ON', partnerType: 'Financial Planner', partnerStatus: 'Active', modifiedTime: '2026-07-02T14:00:00-04:00' },
  { id: 'demo-p-2', name: 'Testwell Realty', email: 'team@testwellrealty.example', phone: '(000) 555-0102', city: 'Hamilton', province: 'ON', partnerType: 'Realtor', partnerStatus: 'Active', modifiedTime: '2026-06-25T09:30:00-04:00' },
  { id: 'demo-p-3', name: 'Sample Capital', email: 'invest@samplecapital.example', phone: '(000) 555-0103', city: 'Toronto', province: 'ON', partnerType: 'Investor', partnerStatus: 'Active', modifiedTime: '2026-05-30T11:15:00-04:00' },
  { id: 'demo-p-4', name: 'Mockford Law', email: 'clerk@mockfordlaw.example', phone: '(000) 555-0104', city: 'London', province: 'ON', partnerType: 'Lawyer', partnerStatus: 'Active', modifiedTime: '2026-06-05T16:45:00-04:00' },
]

export const demoPartnerDocuments: PartnerDocument[] = [
  { id: 'demo-pd-1', name: 'KYC - 2026-05-14', documentType: 'KYC', documentStatus: 'Approved', uploadedDate: '2026-05-14', expiryDate: '2027-05-14', partnerId: 'demo-p-3', reviewerNotes: null },
  { id: 'demo-pd-2', name: 'Void Cheque', documentType: 'Banking', documentStatus: 'Approved', uploadedDate: '2026-05-14', expiryDate: null, partnerId: 'demo-p-3', reviewerNotes: null },
]

// ─── Compliance: credentials ────────────────────────────────────────────────

export const demoCredentials: ComplianceCredential[] = [
  {
    id: 'demo-c-1', name: 'FSRA Mortgage Agent Level 2 Licence', holder: 'Marty McFixture',
    expires_on: '2027-03-31', date_confirmed: true, notes: 'Demo record.', status: 'active',
    created_at: '2026-01-05T10:00:00Z', created_by: 'demo@fixture.example',
    updated_at: '2026-01-05T10:00:00Z', updated_by: 'demo@fixture.example',
    retired_at: null, retired_by: null,
  },
  {
    id: 'demo-c-2', name: 'Errors & Omissions Insurance', holder: 'Fox Mortgage (demo)',
    expires_on: '2026-08-20', date_confirmed: true, notes: 'Renews annually.', status: 'active',
    created_at: '2026-01-05T10:00:00Z', created_by: 'demo@fixture.example',
    updated_at: '2026-01-05T10:00:00Z', updated_by: 'demo@fixture.example',
    retired_at: null, retired_by: null,
  },
  {
    id: 'demo-c-3', name: 'Continuing Education — 2026 cycle', holder: 'Marty McFixture',
    expires_on: '2026-12-31', date_confirmed: false, notes: 'Confirm exact date.', status: 'active',
    created_at: '2026-01-05T10:00:00Z', created_by: 'demo@fixture.example',
    updated_at: '2026-01-05T10:00:00Z', updated_by: 'demo@fixture.example',
    retired_at: null, retired_by: null,
  },
]

// ─── Workbench: deals summary + deal room detail ────────────────────────────

export const demoDeals: WorkbenchDeal[] = [
  { id: 'demo-deal-1', fileRef: 'DEMO-F0001', stage: 'underwriting', closingDate: '2026-07-24', zohoPotentialId: 'demo-z-1', status: 'active', updatedAt: '2026-07-09T13:20:00Z' },
  { id: 'demo-deal-2', fileRef: 'DEMO-F0002', stage: 'conditions', closingDate: '2026-08-05', zohoPotentialId: 'demo-z-2', status: 'active', updatedAt: '2026-07-08T18:05:00Z' },
  { id: 'demo-deal-3', fileRef: 'DEMO-F0003', stage: 'funded', closingDate: '2026-06-18', zohoPotentialId: 'demo-z-10', status: 'active', updatedAt: '2026-06-19T09:00:00Z' },
]

const DETAIL_BY_ID: Record<string, DealDetail> = {
  'demo-deal-1': {
    id: 'demo-deal-1', fileRef: 'DEMO-F0001', dealType: 'purchase', stage: 'underwriting', status: 'active',
    purchasePrice: 800000, mortgageAmount: 640000, closingDate: '2026-07-24', lender: 'Sample Bank',
    product: '5yr Fixed', zohoPotentialId: 'demo-z-1', finmoAppId: 'demo-finmo-1',
    createdAt: '2026-05-30T12:00:00Z', updatedAt: '2026-07-09T13:20:00Z',
  },
  'demo-deal-2': {
    id: 'demo-deal-2', fileRef: 'DEMO-F0002', dealType: 'refinance', stage: 'conditions', status: 'active',
    purchasePrice: 620000, mortgageAmount: 415000, closingDate: '2026-08-05', lender: 'Placeholder Trust',
    product: '3yr Fixed', zohoPotentialId: 'demo-z-2', finmoAppId: 'demo-finmo-2',
    createdAt: '2026-06-04T12:00:00Z', updatedAt: '2026-07-08T18:05:00Z',
  },
  'demo-deal-3': {
    id: 'demo-deal-3', fileRef: 'DEMO-F0003', dealType: 'purchase', stage: 'funded', status: 'active',
    purchasePrice: 700000, mortgageAmount: 560000, closingDate: '2026-06-18', lender: 'Sample Bank',
    product: '5yr Fixed', zohoPotentialId: 'demo-z-10', finmoAppId: 'demo-finmo-3',
    createdAt: '2026-03-02T12:00:00Z', updatedAt: '2026-06-19T09:00:00Z',
  },
}

export function demoDealDetail(dealId: string): DealDetail | null {
  return DETAIL_BY_ID[dealId] ?? null
}

const stmtField = (
  id: string,
  fieldName: string,
  valueText: string | null,
  valueNumeric: number | null,
  status = 'extracted',
): StatementFieldRow => ({
  id,
  fieldName,
  valueText,
  valueNumeric,
  unit: valueNumeric !== null ? 'CAD' : null,
  sourcePage: 1,
  sourceSnippet: 'Demo statement — synthetic figure, not a real document.',
  confidence: 0.97,
  heldReason: null,
  status,
})

export function demoDealConditions(dealId: string): DealConditionRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-cond-1', dealRef: null, text: 'Confirm down payment source (90-day history)', owner: 'borrower', status: 'open', dueDate: '2026-07-08', condNumber: '1', source: 'lender', evidenceRefCount: 1, category: 'general_verification', kind: null, precheckStatus: 'pass' },
      { id: 'demo-cond-2', dealRef: null, text: 'Solicitor to confirm title insurance', owner: 'solicitor', status: 'open', dueDate: '2026-07-20', condNumber: '2', source: 'lender', evidenceRefCount: 0, category: 'solicitor', kind: null, precheckStatus: null },
    ]
  }
  if (dealId === 'demo-deal-2') {
    return [
      { id: 'demo-cond-3', dealRef: null, text: 'Signed commitment returned', owner: 'borrower', status: 'satisfied', dueDate: '2026-07-02', condNumber: '1', source: 'lender', evidenceRefCount: 2, category: 'borrower_execution', kind: null, precheckStatus: 'pass' },
    ]
  }
  return []
}

export function demoDealFlags(dealId: string): DealFlagRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-flag-1', severity: 'warning', kind: 'income_variance', status: 'open', detail: { note: 'Demo: stated income differs from documented by 6%.' }, createdAt: '2026-07-05T10:00:00Z', resolution: null, reason: null, resolvedAt: null },
    ]
  }
  return []
}

export function demoDealStatementDocs(dealId: string): DealStatementDoc[] {
  if (dealId === 'demo-deal-1') {
    return [
      {
        documentId: 'demo-doc-1', docClass: 'paystub',
        fields: [
          stmtField('demo-sf-1', 'employer_name', 'Fixture Manufacturing Ltd', null, 'approved'),
          stmtField('demo-sf-2', 'gross_pay', null, 3250, 'approved'),
        ],
        review: { decision: 'approved', fieldsTotal: 2, fieldsActioned: 2, fieldsHeld: 0, decidedBy: 'michael', decidedAt: '2026-07-06T15:00:00Z' },
      },
    ]
  }
  return []
}

export function demoDealShadowHistory(dealId: string): DealShadowScore[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-ss-1', dimension: 'checklist', agreement: true, systemValue: 'complete', michaelValue: 'complete', disagreementNote: null, rulingRef: null, scoredAt: '2026-07-07T11:00:00Z' },
      { id: 'demo-ss-2', dimension: 'income', agreement: false, systemValue: 82000, michaelValue: 78000, disagreementNote: 'Demo: excluded a one-time bonus.', rulingRef: null, scoredAt: '2026-07-07T11:05:00Z' },
    ]
  }
  return []
}

export function demoDealBorrowers(dealId: string): BorrowerRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-b-1', role: 'primary', fullName: 'Marty McFixture', dob: '1988-04-12', maritalStatus: 'married', employment: { employer: 'Fixture Manufacturing Ltd', type: 'salaried' } },
      { id: 'demo-b-2', role: 'co-applicant', fullName: 'Sample Borrower', dob: '1990-09-30', maritalStatus: 'married', employment: { employer: 'Testwell Clinic', type: 'salaried' } },
    ]
  }
  return []
}

export function demoDealIncomeCalcs(dealId: string): IncomeCalcRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-ic-1', borrowerId: 'demo-b-1', lenderSlug: 'sample-bank', basis: 'salaried', resultAnnual: 78000, calcVersion: 'v3', inputsHash: 'demohash1', createdAt: '2026-07-06T15:10:00Z' },
    ]
  }
  return []
}

export function demoDealRatioCalcs(dealId: string): RatioCalcRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-rc-1', lenderSlug: 'sample-bank', qualRate: 6.59, pmtContract: 3550, pmtStress: 4100, gds: 0.31, tds: 0.38, ltv: 0.80, calcVersion: 'v3', inputsHash: 'demohash2', createdAt: '2026-07-06T15:12:00Z' },
    ]
  }
  return []
}

export function demoDealDocuments(dealId: string): DocumentRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-d-1', docType: 'paystub', source: 'borrower_upload', receivedAt: '2026-07-04T09:00:00Z', reviewStatus: 'reviewed', createdAt: '2026-07-04T09:00:00Z' },
      { id: 'demo-d-2', docType: 'void_cheque', source: 'borrower_upload', receivedAt: '2026-07-04T09:05:00Z', reviewStatus: 'pending', createdAt: '2026-07-04T09:05:00Z' },
    ]
  }
  return []
}

export function demoDealAudit(dealId: string): AuditEntry[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-a-1', createdAt: '2026-07-06T15:00:00Z', actor: 'portal', actorClerkId: 'demo', actorEmail: 'demo@fixture.example', action: 'statements.doc_approved', dealId: 'demo-deal-1', dealRef: 'DEMO-F0001', detail: { documentId: 'demo-doc-1' } },
    ]
  }
  return []
}

// ─── Workbench: Home rail + approvals + status aggregates ────────────────────

export const demoOpenFlags: OpenFlag[] = [
  { id: 'demo-flag-1', severity: 'warning', kind: 'income_variance', dealRef: 'DEMO-F0001', createdAt: '2026-07-05T10:00:00Z' },
  { id: 'demo-flag-2', severity: 'info', kind: 'address_mismatch', dealRef: 'DEMO-F0002', createdAt: '2026-07-06T12:30:00Z' },
]

export const demoConditionsDue: ConditionsDue = {
  overdue: [
    { id: 'demo-cond-1', dealRef: 'DEMO-F0001', text: 'Confirm down payment source (90-day history)', owner: 'borrower', status: 'open', dueDate: '2026-07-08', condNumber: '1' },
  ],
  dueSoon: [
    { id: 'demo-cond-2', dealRef: 'DEMO-F0001', text: 'Solicitor to confirm title insurance', owner: 'solicitor', status: 'open', dueDate: '2026-07-20', condNumber: '2' },
  ],
  openNoDueDate: 1,
  totalOpen: 3,
}

export const demoOpenConditionCounts: Record<string, number> = {
  'demo-deal-1': 2,
  'demo-deal-2': 1,
}

export const demoPendingStatementReviews: PendingStatementReview[] = [
  { documentId: 'demo-doc-2', docClass: 'bank_statement', dealRef: 'DEMO-F0002', fieldCount: 4 },
]

export const demoPendingSheetReviews: PendingSheetReview[] = [
  { intelItemId: 'demo-intel-1', lenderSlug: 'sample-bank', asOfDate: '2026-07-09', quoteCount: 12 },
]

export const demoShadowQueue: ShadowQueueCard[] = [
  {
    dealId: 'demo-deal-2', fileRef: 'DEMO-F0002', stage: 'conditions', closingDate: '2026-08-05',
    dimensions: [
      { dimension: 'checklist', lastAgreement: true, lastScoredAt: '2026-07-07T11:00:00Z', lastSystemValue: 'complete', lastDisagreementNote: null },
      { dimension: 'income', lastAgreement: null, lastScoredAt: null, lastSystemValue: null, lastDisagreementNote: null },
      { dimension: 'ratios', lastAgreement: null, lastScoredAt: null, lastSystemValue: null, lastDisagreementNote: null },
      { dimension: 'shortlist', lastAgreement: null, lastScoredAt: null, lastSystemValue: null, lastDisagreementNote: null },
    ],
    scoredCount: 1,
  },
]

export const demoRateQuoteStats: RateQuoteStats = {
  approvedCurrent: 312,
  superseded: 119,
  extracted: 24,
  newestApprovedAsOf: '2026-07-09',
}

export const demoIntakeFreshness: IntakeFreshness = {
  lastActivity: '2026-07-09T13:20:00Z',
}

export const demoStatementQueue: StatementQueueCard[] = [
  {
    documentId: 'demo-doc-2', docClass: 'bank_statement', dealId: 'demo-deal-2', dealRef: 'DEMO-F0002',
    fields: [
      stmtField('demo-sf-3', 'account_holder', 'Ada Testwell', null),
      stmtField('demo-sf-4', 'closing_balance', null, 18450),
      stmtField('demo-sf-5', 'nsf_count', null, 0),
      stmtField('demo-sf-6', 'statement_period', 'May 2026', null),
    ],
  },
]

export const demoDiscrepancyFlags: DiscrepancyFlag[] = [
  {
    id: 'demo-disc-1', dealId: 'demo-deal-2', dealRef: 'DEMO-F0002',
    statementField: 'closing_balance', statementValue: '18450', statementDocumentId: 'demo-doc-2', statementSource: 'p.1',
    applicationField: 'savings', applicationValue: '22000', applicationSource: 'application',
    wideGap: false, policy: 'demo-policy',
  },
]

export const demoRateSheetQueue: SheetQueueCard[] = [
  {
    intelItemId: 'demo-intel-1', lenderSlug: 'sample-bank', asOfDate: '2026-07-09',
    quotes: [
      {
        id: 'demo-q-1', productClass: 'conventional', variant: null, termMonths: 60, rate: 4.59,
        rateType: 'fixed', primeVariance: null, cashbackPct: null, programNotes: null, compBps: 145,
        asOfDate: '2026-07-09', expiryDate: null, sourcePage: 2, sourceSnippet: 'Demo sheet — synthetic.',
        confidence: 0.98, heldReason: null,
      },
      {
        id: 'demo-q-2', productClass: 'conventional', variant: null, termMonths: 60, rate: null,
        rateType: 'variable', primeVariance: -0.85, cashbackPct: null, programNotes: 'Demo: prime minus 0.85.',
        compBps: 140, asOfDate: '2026-07-09', expiryDate: null, sourcePage: 2, sourceSnippet: 'Demo sheet — synthetic.',
        confidence: 0.96, heldReason: null,
      },
    ],
  },
]

export const demoOpenFlagCards: OpenFlagCard[] = [
  { id: 'demo-flag-1', severity: 'warning', kind: 'income_variance', dealId: 'demo-deal-1', dealRef: 'DEMO-F0001', createdAt: '2026-07-05T10:00:00Z', detail: { note: 'Demo: stated income differs by 6%.' }, evidenceRefCount: 1, dealTerminal: false },
  { id: 'demo-flag-2', severity: 'info', kind: 'address_mismatch', dealId: 'demo-deal-2', dealRef: 'DEMO-F0002', createdAt: '2026-07-06T12:30:00Z', detail: {}, evidenceRefCount: 0, dealTerminal: false },
]

export const demoLastDecided: LastDecided = {
  statements: '2026-07-06T15:00:00Z',
  rates: '2026-07-05T09:30:00Z',
  flags: '2026-07-04T14:00:00Z',
  shadow: '2026-07-07T11:05:00Z',
}

export const demoOpenFlagCountsByDeal: Record<string, number> = {
  'demo-deal-1': 1,
  'demo-deal-2': 1,
}

export const demoShadowScoredDimCounts: Record<string, number> = {
  'demo-deal-1': 4,
  'demo-deal-2': 1,
}
