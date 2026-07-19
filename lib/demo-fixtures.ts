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

import { clientJourneyFor, journeyForStage } from '@/config/lifecycle'
// The agent card comes from the LEAF module, and the view is a TYPE-ONLY
// import: this file must never take a runtime dependency on a fetcher (the
// header rule at the top), or it cycles back through lib/zoho.
import { AGENT_MEMBER } from '@/lib/client-team'
import type { ClientFileView } from '@/lib/client-file'
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
  DocumentRequestRow,
  RequestReviewRow,
  RequestDecisionRow,
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
  KnowledgeClaimRow,
  KnowledgeDocumentRow,
  KnowledgePageHit,
  PendingCommitmentCondition,
  LenderNotesRow,
  FinmoSnapshotRow,
  DealContextCounts,
  RenewalDripQueueItem,
  RenewalSequenceState,
  CommsQueueItem,
  CommsTimeline,
  CommsSettingsRead,
} from '@/lib/underwriting'
import type { ConditionCount } from '@/lib/conditions-status'
import type { SlimDeal, OpenTask, SlimLead, DealCloseout } from '@/lib/zoho-admin'
import type { RevenueDeal } from '@/lib/revenue'
import type { RenewalDeal } from '@/lib/renewals'
import type { PartnerListItem, PartnerDocument } from '@/lib/zoho'
import type { ComplianceCredential } from '@/lib/compliance'

// The workbench-shaped success wrapper. Structurally assignable to both
// UwResult<T> and ComplianceResult<T> (their ok branches are identical), so
// the compliance guard reuses it too.
export function demoResult<T>(data: T): { configured: true; ok: true; data: T } {
  return { configured: true, ok: true, data }
}

// ─── Zoho: renewal deals (the Renewal Radar) — all fictional ────────────────

function renewalFixture(over: Partial<RenewalDeal>): RenewalDeal {
  return {
    id: 'demo-r',
    dealName: 'DEMO',
    contactName: null,
    amount: 500000,
    maturityDate: null,
    mortgageRate: null,
    rateType: 'Fixed',
    termYears: 60,
    amortizationYears: 25,
    paymentAmount: null,
    renewalStatus: null,
    renewalInProgress: false,
    renewalOptedOut: false,
    lenderName: null,
    closingDate: null,
    ...over,
  }
}

export const demoRenewalDeals: RenewalDeal[] = [
  renewalFixture({ id: 'demo-r-1', dealName: 'DEMO-F0101', contactName: 'Marty McFixture', amount: 500000, maturityDate: '2026-02-01', mortgageRate: 5.49 }),
  renewalFixture({ id: 'demo-r-2', dealName: 'DEMO-F0102', contactName: 'Ada Testwell', amount: 320000, maturityDate: '2026-05-01', mortgageRate: 6.2 }),
  renewalFixture({ id: 'demo-r-3', dealName: 'DEMO-F0103', contactName: 'Sample Borrower', amount: 640000, maturityDate: '2026-09-10', mortgageRate: 2.14, rateType: 'Variable' }),
  renewalFixture({ id: 'demo-r-4', dealName: 'DEMO-F0104', contactName: 'Placeholder Family Trust', amount: 880000, maturityDate: '2026-10-20', mortgageRate: 1.89, lenderName: 'Sample Bank' }),
  renewalFixture({ id: 'demo-r-5', dealName: 'DEMO-F0105', contactName: 'Faux Renner', amount: 415000, maturityDate: '2026-11-25', mortgageRate: 4.55 }),
  renewalFixture({ id: 'demo-r-6', dealName: 'DEMO-F0106', contactName: 'Example Estates', amount: 1150000, maturityDate: '2027-06-01', mortgageRate: 3.24 }),
  renewalFixture({ id: 'demo-r-7', dealName: 'DEMO-F0107', contactName: 'Dummy Holdings Inc', amount: 300000, maturityDate: '2025-12-01', renewalStatus: 'Renewed Elsewhere' }),
  renewalFixture({ id: 'demo-r-8', dealName: 'DEMO-F0108', contactName: 'Prototype Partners', amount: 560000, maturityDate: null, mortgageRate: 4.04 }),
]

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

// ─── Zoho: deal closeout (B2b — the room's Complete-and-paid section) ───────
// Two card states on the demo rooms: an in-review package (demo-z-2) and an
// approved one with the commission recorded (demo-z-10). Everything else
// reads not started. Zero real reads in demo (tests/demo.test.ts asserts).

const DEMO_CLOSEOUTS: Record<string, DealCloseout> = {
  'demo-z-1': {
    dealName: 'Marty McFixture — Purchase',
    complianceStatus: null,
    complianceRead: true,
    totalCommission: null,
    closingDate: null,
  },
  'demo-z-2': {
    dealName: 'Ada Testwell — Refinance',
    complianceStatus: 'In Review',
    complianceRead: true,
    totalCommission: null,
    // A refi where Zoho carries a date the workbench may not: the closing-date
    // helper (B8b Task 0) falls back to this when the workbench has none.
    closingDate: '2026-09-15',
  },
  'demo-z-10': {
    dealName: 'Prototype Partners — Purchase',
    complianceStatus: 'Approved',
    complianceRead: true,
    totalCommission: 7140,
    closingDate: null,
  },
}

export function demoDealCloseout(zohoDealId: string): DealCloseout | null {
  return DEMO_CLOSEOUTS[zohoDealId] ?? null
}

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

const submissionDefaults = {
  targetLender: null as string | null, targetLenderSetAt: null as string | null,
  insuredStatus: null as DealDetail['insuredStatus'], insuredStatusSetAt: null as string | null,
  rateOverride: null as number | null, rateOverrideNote: null as string | null,
  finmoDocsPulledAt: null as string | null,
}

const DETAIL_BY_ID: Record<string, DealDetail> = {
  'demo-deal-1': {
    id: 'demo-deal-1', fileRef: 'DEMO-F0001', dealType: 'purchase', stage: 'underwriting', status: 'active',
    purchasePrice: 800000, mortgageAmount: 640000, closingDate: '2026-07-24', lender: 'Sample Bank',
    product: '5yr Fixed', zohoPotentialId: 'demo-z-1', finmoAppId: 'demo-finmo-1',
    ...submissionDefaults, targetLender: 'Sample Bank', targetLenderSetAt: '2026-07-09T13:00:00Z', insuredStatus: 'insured', insuredStatusSetAt: '2026-07-09T13:00:00Z',
    finmoDocsPulledAt: '2026-07-09T13:18:00Z',
    createdAt: '2026-05-30T12:00:00Z', updatedAt: '2026-07-09T13:20:00Z',
  },
  'demo-deal-2': {
    id: 'demo-deal-2', fileRef: 'DEMO-F0002', dealType: 'refinance', stage: 'conditions', status: 'active',
    purchasePrice: 620000, mortgageAmount: 415000, closingDate: '2026-08-05', lender: 'Placeholder Trust',
    product: '3yr Fixed', zohoPotentialId: 'demo-z-2', finmoAppId: 'demo-finmo-2',
    ...submissionDefaults,
    createdAt: '2026-06-04T12:00:00Z', updatedAt: '2026-07-08T18:05:00Z',
  },
  'demo-deal-3': {
    id: 'demo-deal-3', fileRef: 'DEMO-F0003', dealType: 'purchase', stage: 'funded', status: 'active',
    purchasePrice: 700000, mortgageAmount: 560000, closingDate: '2026-06-18', lender: 'Sample Bank',
    product: '5yr Fixed', zohoPotentialId: 'demo-z-10', finmoAppId: 'demo-finmo-3',
    ...submissionDefaults, targetLender: 'Sample Bank', targetLenderSetAt: '2026-06-17T12:00:00Z',
    createdAt: '2026-03-02T12:00:00Z', updatedAt: '2026-06-19T09:00:00Z',
  },
}

export function demoDealDetail(dealId: string): DealDetail | null {
  return DETAIL_BY_ID[dealId] ?? null
}

export function demoDealFinmoSnapshot(dealId: string): FinmoSnapshotRow | null {
  // demo-deal-1 (purchase) and demo-deal-2 (refinance) have a "pulled" Finmo
  // snapshot; demo-deal-3 does not. All synthetic.
  if (dealId === 'demo-deal-1') {
    return {
      pulledAt: '2026-07-09T13:05:00Z',
      mapped: {
        goal: 'purchase', province: 'ON',
        requested: { amount: 640000, rate: 4.79, interest_type: 'fixed', product_label: '5-yr Fixed', term_months: 60, amortization_months: 300, payment_frequency: 'monthly', lender_name: null, gds: null, tds: null, ltv: null },
        existing_mortgages: [],
        subject_property: { type: 'detached', use: 'owner_occupied', worth: 800000, annual_taxes: 5200 },
        incomes: [{ borrower: 'Marty McFixture', title: 'Analyst', employer: 'Sample Corp', income_annual: 140000, active: true, bonuses: false }],
      },
    }
  }
  if (dealId === 'demo-deal-2') {
    // A refinance: the deals row carries a stale purchase price (620,000); the
    // fresh application worth is what the header shows as "Estimated value".
    return {
      pulledAt: '2026-07-08T10:15:00Z',
      mapped: {
        goal: 'refinance', province: 'ON',
        requested: { amount: 415000, rate: 5.14, interest_type: 'fixed', product_label: '5-yr Fixed', term_months: 60, amortization_months: 300, payment_frequency: 'monthly', lender_name: null, gds: null, tds: null, ltv: null },
        existing_mortgages: [{ balance: 360000, lender: 'Existing Bank' }],
        subject_property: { type: 'detached', use: 'owner_occupied', worth: 705000, appraised_value: null, purchase_price: null, annual_taxes: 4800 },
        incomes: [],
      },
    }
  }
  return null
}

export function demoDealContextCounts(dealId: string): DealContextCounts {
  if (dealId === 'demo-deal-1') return { calls: 2, emails: 3 }
  return { calls: 0, emails: 0 }
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

const condBase = {
  dealRef: null,
  presenceDetail: null as Record<string, unknown> | null,
  verifiedBy: null as string | null,
  verifiedAt: null as string | null,
  gateStatus: 'approved' as const,
  loadBearing: false,
  humanEditedFields: [] as string[],
  requirement: null as { kind?: string; target?: number; source?: string } | null,
}

export function demoDealConditions(dealId: string): DealConditionRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      {
        // Bridges the Finmo Pay Stub request (matched_request_id) and carries the
        // paystub statement evidence (analysis.document_id -> demo-doc-1), which
        // reparents into that request's expansion.
        ...condBase, id: 'demo-cond-pay', text: 'Confirm employment income from the most recent pay stubs', owner: 'broker',
        status: 'open', dueDate: '2026-07-08', condNumber: '1', source: 'commitment', evidenceRefCount: 1,
        category: 'general_verification', kind: 'document_chase', precheckStatus: 'pass',
        presence: 'obtained', presenceDetail: { matched_finmo_name: 'Pay Stub(s) — most recent', matched_request_id: 'fin-req-pay', finmo_status: 'approved', recomputed_at: '2026-07-09T13:20:00Z', analysis: { verdict: 'meets', reasoning: 'Gross pay annualises to $78,000, at or above the requirement.', rule_note: 'Two most recent stubs on file; income confirmed.', document_id: 'demo-doc-1', as_of: '2026-07-05', confidence: 95, analyzed_at: '2026-07-09T13:20:00Z' } },
        docKind: 'pay_stub', borrowerId: 'demo-b-1', sourcePage: 1,
        sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 95,
      },
      {
        // Bridges the Finmo Letter of Employment request; a stale-dated verdict
        // makes that request AI-flagged with a plain-words reason.
        ...condBase, id: 'demo-cond-loe', text: 'Letter of employment for the primary applicant dated within 30 days', owner: 'broker',
        status: 'open', dueDate: '2026-07-15', condNumber: '2', source: 'commitment', evidenceRefCount: 1,
        category: 'general_verification', kind: 'document_chase', precheckStatus: 'pass',
        presence: 'obtained', presenceDetail: { matched_finmo_name: 'Letter of Employment', matched_request_id: 'fin-req-loe', finmo_status: 'for_review', recomputed_at: '2026-07-09T13:20:00Z', analysis: { verdict: 'stale', reasoning: 'The letter is dated 2026-05-20, more than 30 days before the application.', rule_note: 'Dated over 30 days ago', document_id: null, as_of: '2026-05-20', recency: { days: 30, doc_age_days: 51, ok: false }, confidence: 90, analyzed_at: '2026-07-09T13:20:00Z' } },
        docKind: 'letter_of_employment', borrowerId: 'demo-b-1', sourcePage: 1,
        sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 90,
        humanEditedFields: ['owner'],
      },
      {
        // Bridges the Finmo Gift Letter request; a passing verdict makes it AI-passed.
        ...condBase, id: 'demo-cond-gift', text: 'Gift letter from the guarantor', owner: 'broker',
        status: 'open', dueDate: '2026-07-16', condNumber: '3', source: 'commitment', evidenceRefCount: 1,
        category: 'general_verification', kind: 'document_chase', precheckStatus: 'pass',
        presence: 'obtained', presenceDetail: { matched_finmo_name: 'Gift Letter', matched_request_id: 'fin-req-gift', finmo_status: 'for_review', recomputed_at: '2026-07-09T13:20:00Z', analysis: { verdict: 'meets', reasoning: 'Signed gift letter naming the guarantor and amount.', rule_note: 'Signed and complete.', document_id: null, as_of: '2026-07-06', confidence: 92, analyzed_at: '2026-07-09T13:20:00Z' } },
        docKind: 'gift_letter', borrowerId: 'demo-b-3', sourcePage: 1,
        sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 92,
      },
      {
        // Commitment-only request (no Finmo request row): still waiting.
        ...condBase, id: 'demo-cond-fire', text: 'Fire insurance binder naming the lender as first loss payee', owner: 'borrower',
        status: 'open', dueDate: '2026-07-18', condNumber: 'M-1a2b3c', source: 'manual', evidenceRefCount: 0,
        category: 'property_valuation', kind: 'document_chase', precheckStatus: null,
        presence: 'needs_input', presenceDetail: { manual: true },
        docKind: 'fire_insurance_binder', borrowerId: null, sourcePage: null,
        sourceSnippet: null, confidence: null,
      },
      {
        // Commitment-only request satisfied by an in-hand document (Task 3).
        ...condBase, id: 'demo-cond-disc', text: 'Broker disclosure signed by the co-applicant', owner: 'borrower',
        status: 'open', dueDate: '2026-07-12', condNumber: '4', source: 'commitment', evidenceRefCount: 1,
        category: 'general_verification', kind: 'document_chase', precheckStatus: 'pass',
        presence: 'obtained', presenceDetail: { matched_finmo_name: 'Signed disclosure — co-applicant', finmo_status: 'accepted', recomputed_at: '2026-07-09T13:20:00Z' },
        docKind: 'disclosure', borrowerId: 'demo-b-2', sourcePage: 1,
        sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 94,
      },
      {
        // A non-document condition (docKind null) — stays on the checklist, never
        // a documents-desk card.
        ...condBase, id: 'demo-cond-title', text: 'Solicitor to confirm title insurance', owner: 'solicitor',
        status: 'open', dueDate: '2026-07-20', condNumber: '5', source: 'commitment', evidenceRefCount: 0,
        category: 'solicitor', kind: null, precheckStatus: null,
        presence: 'needs_input', presenceDetail: { reason: 'no matching document in Finmo' },
        docKind: null, borrowerId: null, sourcePage: 3,
        sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 90,
      },
    ]
  }
  if (dealId === 'demo-deal-2') {
    return [
      {
        ...condBase, id: 'demo-cond-3', text: 'Signed commitment returned', owner: 'borrower',
        status: 'satisfied', dueDate: '2026-07-02', condNumber: '1', source: 'commitment', evidenceRefCount: 2,
        category: 'borrower_execution', kind: null, precheckStatus: 'pass',
        presence: 'verified', docKind: 'signed_commitment', borrowerId: null, sourcePage: 1,
        sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 98,
        verifiedBy: 'demo-agent', verifiedAt: '2026-07-03T10:00:00Z',
      },
    ]
  }
  return []
}

// The approval banner: conditions extracted from a commitment, still pending
// the list gate. demo-deal-1 shows a two-item pile so the banner renders.
export function demoPendingCommitmentConditions(dealId: string): PendingCommitmentCondition[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-pc-1', documentId: 'demo-commit-1', condNumber: '1', text: 'Letter of employment for the primary applicant dated within 30 days', owner: 'borrower', docKind: 'letter_of_employment', borrowerId: 'demo-b-1', category: 'general_verification', kind: 'document_chase', sourcePage: 1, sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 94, loadBearing: false },
      { id: 'demo-pc-2', documentId: 'demo-commit-1', condNumber: '2', text: 'Fire insurance binder naming the lender as first loss payee', owner: 'borrower', docKind: 'fire_insurance_binder', borrowerId: null, category: 'property_valuation', kind: 'document_chase', sourcePage: 2, sourceSnippet: 'Demo commitment — synthetic condition, not a real document.', confidence: 91, loadBearing: false },
    ]
  }
  return []
}

// Board-card counts — BROKER conditions only (the work Michael owns, Task 2).
// demo-deal-1 has two broker conditions: the T4/NOA (collected) and the
// added-by-hand strata certificate (outstanding).
export const demoConditionCountsByDeal: Record<string, ConditionCount> = {
  'demo-deal-1': { total: 2, collected: 1, outstanding: 1 },
  // demo-deal-2's only condition is a borrower condition, so its broker-scoped
  // count is zero — matching what the live broker-scoped counter would produce.
  'demo-deal-2': { total: 0, collected: 0, outstanding: 0 },
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
      { id: 'demo-b-1', role: 'primary', fullName: 'Marty McFixture', dob: '1988-04-12', maritalStatus: 'married', employment: { employer: 'Fixture Manufacturing Ltd', type: 'salaried' }, finmoBorrowerId: 'fin-b-1', relationship: null },
      { id: 'demo-b-2', role: 'co-applicant', fullName: 'Sample Borrower', dob: '1990-09-30', maritalStatus: 'married', employment: { employer: 'Testwell Clinic', type: 'salaried' }, finmoBorrowerId: 'fin-b-2', relationship: 'spouse' },
      // Two borrowers share the given name "Jordan" — the sections disambiguate by
      // relationship ("Jordan (parent)" / "Jordan (spouse)").
      { id: 'demo-b-3', role: 'guarantor', fullName: 'Jordan Wells', dob: '1962-02-08', maritalStatus: 'single', employment: { employer: 'Retired', type: 'other' }, finmoBorrowerId: 'fin-b-3', relationship: 'parent' },
      { id: 'demo-b-4', role: 'co-applicant', fullName: 'Jordan Anand', dob: '1991-03-14', maritalStatus: 'married', employment: { employer: 'Northwind Design', type: 'salaried' }, finmoBorrowerId: 'fin-b-4', relationship: 'spouse' },
    ]
  }
  return []
}

// The Finmo document REQUEST inventory (document_index) for the demo file — the
// unit the documents desk renders. Shaped like a real degenerate file: a
// three-borrower deal with General + per-borrower requests, every state
// (waiting / received / AI-flagged / AI-passed / reviewed), a duplicate-versions
// request (5 files), and a missing requested date.
export function demoDealDocumentRequests(dealId: string): DocumentRequestRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      // General (account-level, no borrower).
      { finmoRequestId: 'fin-req-psa', borrowerFinmoId: null, borrowerName: null, documentName: 'Purchase and Sale Agreement', status: 'requested', numberOfFiles: 0, hasSrc: false, filename: null, requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-02T12:00:00Z', withdrawnAt: null },
      // Received, no bridging condition — an AI request verdict of `passed`.
      { finmoRequestId: 'fin-req-ptax', borrowerFinmoId: null, borrowerName: null, documentName: 'Property Tax Bill', status: 'for_review', numberOfFiles: 1, hasSrc: false, filename: 'tax-bill-2026.pdf', requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-06T09:30:00Z', withdrawnAt: null },
      // Marty (primary).
      { finmoRequestId: 'fin-req-pay', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', documentName: 'Pay Stub(s) — most recent', status: 'approved', numberOfFiles: 2, hasSrc: false, filename: 'paystub-jun.pdf', requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-05T10:00:00Z', withdrawnAt: null },
      // Duplicate versions (5 files); bridged by a stale-dated verdict -> AI flagged.
      { finmoRequestId: 'fin-req-loe', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', documentName: 'Letter of Employment', status: 'for_review', numberOfFiles: 5, hasSrc: true, filename: 'loe-v5.pdf', requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-06T14:00:00Z', withdrawnAt: null },
      { finmoRequestId: 'fin-req-void', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', documentName: 'Void Cheque', status: 'approved', numberOfFiles: 1, hasSrc: false, filename: 'void.pdf', requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-04T11:00:00Z', withdrawnAt: null },
      // Received NOA with a soft annual-cycle verdict (stale_cycle): a newer cycle
      // should be available now; never amber, never demotes.
      { finmoRequestId: 'fin-req-noa2', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', documentName: 'Notice of Assessment (2 years)', status: 'for_review', numberOfFiles: 1, hasSrc: true, filename: 'noa-2024.pdf', requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-06T11:00:00Z', withdrawnAt: null },
      // Sample (co-applicant).
      // Received image ID, no readable text -> an AI request verdict of `questions`.
      { finmoRequestId: 'fin-req-id', borrowerFinmoId: 'fin-b-2', borrowerName: 'Sample Borrower', documentName: '2 Main Forms of Identification', status: 'for_review', numberOfFiles: 4, hasSrc: false, filename: 'id-front.jpg', requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-05T16:00:00Z', withdrawnAt: null },
      // Missing requested date (degenerate).
      { finmoRequestId: 'fin-req-noa', borrowerFinmoId: 'fin-b-2', borrowerName: 'Sample Borrower', documentName: 'Notice of Assessment (2 years)', status: 'requested', numberOfFiles: 0, hasSrc: false, filename: null, requestedAt: null, finmoUpdatedAt: null, withdrawnAt: null },
      // Jordan (guarantor); bridged by a passing verdict -> AI passed.
      { finmoRequestId: 'fin-req-gift', borrowerFinmoId: 'fin-b-3', borrowerName: 'Jordan Wells', documentName: 'Gift Letter', status: 'for_review', numberOfFiles: 1, hasSrc: false, filename: 'gift.pdf', requestedAt: '2026-07-03T12:00:00Z', finmoUpdatedAt: '2026-07-07T09:00:00Z', withdrawnAt: null },
      // Approved in Finmo, flagged by the AI review (stale), AND approved by you —
      // all three truths render side by side (Task 5 fixture).
      { finmoRequestId: 'fin-req-bank', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', documentName: 'Bank Statement (90 days)', status: 'approved', numberOfFiles: 1, hasSrc: false, filename: 'bank-apr.pdf', requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-04-20T10:00:00Z', withdrawnAt: null },
      // The second "Jordan" — disambiguates the section header by relationship.
      { finmoRequestId: 'fin-req-jw2', borrowerFinmoId: 'fin-b-4', borrowerName: 'Jordan Anand', documentName: 'Notice of Assessment (2 years)', status: 'requested', numberOfFiles: 0, hasSrc: false, filename: null, requestedAt: '2026-07-03T12:00:00Z', finmoUpdatedAt: null, withdrawnAt: null },
      // Withdrawn pair (Task 2): deleted in Finmo, retained but hidden from the
      // active groups; shown under a per-borrower "Withdrawn (N)" expandable.
      { finmoRequestId: 'fin-req-sale', borrowerFinmoId: null, borrowerName: null, documentName: 'Sale Agreement (Accepted Offer)', status: 'requested', numberOfFiles: 0, hasSrc: false, filename: null, requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-02T12:00:00Z', withdrawnAt: '2026-07-09T13:18:00Z' },
      { finmoRequestId: 'fin-req-cms', borrowerFinmoId: 'fin-b-1', borrowerName: 'Marty McFixture', documentName: 'Current Mortgage Statement', status: 'requested', numberOfFiles: 0, hasSrc: false, filename: null, requestedAt: '2026-07-02T12:00:00Z', finmoUpdatedAt: '2026-07-02T12:00:00Z', withdrawnAt: '2026-07-09T13:18:00Z' },
    ]
  }
  return []
}

// The AI request verdicts (document_request_reviews) for the demo file. Only the
// received requests WITHOUT a bridging commitment condition earn a review-sourced
// verdict here (the desk prefers the condition verdict where one exists); all four
// verdict states are represented. One row per document; the desk groups by request.
export function demoDealRequestReviews(dealId: string): RequestReviewRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { documentId: 'demo-rev-ptax', finmoRequestId: 'fin-req-ptax', docKind: 'property_tax', borrowerId: null, verdict: 'passed', reasons: [], contentDate: '2026-01-15', contentDates: { issued: '2026-01-15' }, analyzedAt: '2026-07-06T09:35:00Z' },
      { documentId: 'demo-rev-id', finmoRequestId: 'fin-req-id', docKind: 'id', borrowerId: 'demo-b-2', verdict: 'questions', reasons: [{ code: 'illegible', severity: 'question', message: 'almost no text could be read from this file (it may be a scan needing a manual look)', citation: null }], contentDate: null, contentDates: null, analyzedAt: '2026-07-05T16:05:00Z' },
      { documentId: 'demo-rev-noa', finmoRequestId: 'fin-req-noa2', docKind: 't4_noa', borrowerId: 'demo-b-1', verdict: 'stale_cycle', reasons: [{ code: 'newer_cycle_available', severity: 'advisory', message: 'a newer Notice of Assessment should be available now (this one was issued 2024-05-09). Usable at lender discretion.', citation: { page: 1, snippet: 'Tax year 2023 Date issued May 9, 2024 Notice of assessment' } }], contentDate: '2024-05-09', contentDates: { issued: '2024-05-09' }, analyzedAt: '2026-07-06T11:05:00Z' },
      { documentId: 'demo-rev-bank', finmoRequestId: 'fin-req-bank', docKind: 'bank_statement', borrowerId: 'demo-b-1', verdict: 'flagged', reasons: [{ code: 'stale', severity: 'high', message: 'this bank statement is dated 2026-04-18 (89 days old); a document within 60 days is expected', citation: { page: 1, snippet: 'Statement period ending 04 18 2026 Closing balance $12,840.10' } }], contentDate: '2026-04-18', contentDates: { issued: '2026-04-18' }, analyzedAt: '2026-07-06T09:40:00Z' },
    ]
  }
  return []
}

// Michael's human review of a request (document_request_decisions). The
// Finmo-approved, AI-flagged bank statement is ALSO approved by him — three truths.
export function demoDealRequestDecisions(dealId: string): RequestDecisionRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { finmoRequestId: 'fin-req-bank', verdict: 'approved', note: null, decidedByEmail: 'michael@app.foxmortgage.ca', decidedAt: '2026-07-09T13:15:00Z' },
    ]
  }
  return []
}

export function demoDealIncomeCalcs(dealId: string): IncomeCalcRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      // A superseded first pass folds into History; the current row leads.
      { id: 'demo-ic-0', borrowerId: 'demo-b-1', lenderSlug: 'sample-bank', basis: 'salaried', resultAnnual: 61000, calcVersion: 'v2', inputsHash: 'demohash0', createdAt: '2026-07-04T11:00:00Z' },
      { id: 'demo-ic-1', borrowerId: 'demo-b-1', lenderSlug: 'sample-bank', basis: 'salaried', resultAnnual: 78000, calcVersion: 'v3', inputsHash: 'demohash1', createdAt: '2026-07-06T15:10:00Z' },
    ]
  }
  return []
}

export function demoDealRatioCalcs(dealId: string): RatioCalcRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      // A superseded recompute with an implausible LTV — folds into History, never
      // beside the current row.
      { id: 'demo-rc-0', lenderSlug: 'sample-bank', qualRate: 6.59, pmtContract: 3550, pmtStress: 4100, gds: 0.44, tds: 0.61, ltv: 1.42, calcVersion: 'v2', inputsHash: 'demohash-old', createdAt: '2026-07-04T10:00:00Z' },
      { id: 'demo-rc-1', lenderSlug: 'sample-bank', qualRate: 6.59, pmtContract: 3550, pmtStress: 4100, gds: 0.31, tds: 0.38, ltv: 0.80, calcVersion: 'v3', inputsHash: 'demohash2', createdAt: '2026-07-06T15:12:00Z' },
    ]
  }
  return []
}

// No stored draft in demo: the card shows the Generate button, and clicking it
// produces the canned demo note client-side (zero real reads, zero writes).
export function demoDealLenderNotes(_dealId: string): LenderNotesRow | null {
  return null
}

export function demoDealDocuments(dealId: string): DocumentRow[] {
  if (dealId === 'demo-deal-1') {
    return [
      { id: 'demo-d-1', docType: 'pay_stub', source: 'upload', receivedAt: '2026-07-04T09:00:00Z', reviewStatus: 'reviewed', createdAt: '2026-07-04T09:00:00Z', provenance: 'real', borrowerId: 'demo-b-1', finmoRequestId: 'fin-req-pay' },
      { id: 'demo-d-2', docType: 'void_cheque', source: 'finmo', receivedAt: '2026-07-04T09:05:00Z', reviewStatus: 'pending', createdAt: '2026-07-04T09:05:00Z', provenance: 'real', borrowerId: null, finmoRequestId: 'fin-req-void' },
      { id: 'demo-d-3', docType: 't4_noa', source: 'upload', receivedAt: '2026-07-05T14:20:00Z', reviewStatus: 'pending', createdAt: '2026-07-05T14:20:00Z', provenance: 'real', borrowerId: 'demo-b-1', finmoRequestId: 'fin-req-noa2' },
      // Request-less documents (Task 3): collected but not tied to any Finmo
      // request (an older pull, a consent) — the desk's "Not tied to a request"
      // residual block, so nothing collected becomes invisible.
      { id: 'demo-d-4', docType: 'credit_report', source: 'finmo', receivedAt: '2026-06-28T08:00:00Z', reviewStatus: 'reviewed', createdAt: '2026-06-28T08:00:00Z', provenance: 'real', borrowerId: 'demo-b-1', finmoRequestId: null },
      { id: 'demo-d-5', docType: 'consent_form', source: 'upload', receivedAt: '2026-06-29T10:30:00Z', reviewStatus: 'reviewed', createdAt: '2026-06-29T10:30:00Z', provenance: 'real', borrowerId: null, finmoRequestId: null },
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

// ─── Workbench: lender knowledge claims + documents ─────────────────────────
// Obviously-sample content for the demo lender ('sample-bank', the slug the
// demo rate sheet queue uses). One approved claim per showcase topic, one
// pending claim so the count line and the approvals tab have something to
// show, and one failed document so the loud red state renders.

export const demoKnowledgeDocuments: KnowledgeDocumentRow[] = [
  {
    id: 'demo-kd-1', docType: 'Sample Bank broker guide 2026 (demo)', knowledgeKind: 'broker_guide',
    knowledgeStatus: 'extracted', knowledgeError: null, receivedAt: '2026-07-02T10:00:00Z', lenderSlug: 'sample-bank',
  },
  {
    id: 'demo-kd-2', docType: 'Sample Bank comp schedule (demo)', knowledgeKind: 'comp_schedule',
    knowledgeStatus: 'extraction_failed', knowledgeError: 'Demo: scanned pages below the OCR confidence floor.',
    receivedAt: '2026-07-05T10:00:00Z', lenderSlug: 'sample-bank',
  },
]

function knowledgeClaimFixture(over: Partial<KnowledgeClaimRow>): KnowledgeClaimRow {
  return {
    id: 'demo-kc',
    lenderSlug: 'sample-bank',
    program: null,
    topic: 'policy',
    claimKey: 'demo_claim',
    claimValue: null,
    claimText: 'Demo claim text.',
    sourceDocumentId: 'demo-kd-1',
    sourcePage: 1,
    sourceSnippet: 'Demo knowledge document — synthetic text, not a real lender guide.',
    asOfDate: '2026-07-02',
    asOfSource: 'document date (demo)',
    status: 'approved',
    confidence: 0.95,
    extractedBy: 'demo-extractor',
    createdAt: '2026-07-02T10:05:00Z',
    decidedAt: '2026-07-03T09:00:00Z',
    ...over,
  }
}

export const demoKnowledgeClaims: KnowledgeClaimRow[] = [
  knowledgeClaimFixture({
    id: 'demo-kc-1', topic: 'penalty_methodology', claimKey: 'ird_comparison_basis',
    claimValue: { basis: 'posted_rate' },
    claimText: 'Demo: fixed-rate IRD compares against the posted rate for the nearest comparable term.',
    sourcePage: 12,
  }),
  knowledgeClaimFixture({
    id: 'demo-kc-2', topic: 'compensation', claimKey: 'base_comp_bps',
    claimValue: { bps: 105 },
    claimText: 'Demo: base compensation is 105 bps on 5-year fixed terms.',
    sourcePage: 3,
  }),
  knowledgeClaimFixture({
    id: 'demo-kc-3', topic: 'program_criteria', claimKey: 'rental_max_ltv',
    claimValue: { max_ltv_pct: 80 },
    claimText: 'Demo: rental program caps LTV at 80 percent.',
    sourcePage: 7, asOfDate: null, asOfSource: null, status: 'pending', decidedAt: null,
  }),
]

export const demoKnowledgePageHits: KnowledgePageHit[] = [
  { documentId: 'demo-kd-1', pageNo: 4, snippet: 'Demo guide text — synthetic passage matching the search term, kept short.' },
]

// ─── Renewal drip (2026-07-16): the canned approval queue ────────────────────
// Synthetic clients only. Demo mode performs zero workbench reads and every
// drip write is DemoWriteBlocked; this is the whole surface a demo sees.
export const demoRenewalDripQueue: RenewalDripQueueItem[] = [
  {
    touchId: 'demo-rt-1', sequenceId: 'demo-rs-1', skeletonId: 'touch-150',
    status: 'pending_approval', heldReason: null, scheduledFor: '2026-07-14',
    clientName: 'Dana Whitfield', firstName: 'Dana', clientEmail: 'dana@example.com',
    zohoDealId: 'demo-zoho-1', maturityDate: '2026-12-11',
    subject: 'quick heads up about your mortgage',
    body: "Hi Dana,\n\nI wanted to give you a quick heads up.\n\nYour mortgage is set to renew on December 11, 2026 for your place on Maple Crescent. It's still a few months away, but this is the window where you actually have choices. Waiting too long tends to narrow them.\n\nIt's hard to believe it's been almost five years since we set this one up.\n\nThere's no urgency right now.\n\nMichael",
    sentences: [{ text: "It's hard to believe it's been almost five years since we set this one up.", source: 'zoho:deal' }],
    dropped: [],
    pins: {
      first_name: { value: 'Dana', source: 'zoho:Contacts.First_Name (demo)' },
      maturity_date: { value: 'December 11, 2026', source: 'zoho:Potentials.Maturity_Date (demo)' },
      property_reference: { value: 'your place on Maple Crescent', source: 'zoho:Potentials.Street (demo)' },
    },
    skeletonHash: 'demo-hash', draftSource: 'generated',
  },
  {
    touchId: 'demo-rt-2', sequenceId: 'demo-rs-2', skeletonId: 'touch-60',
    status: 'held', heldReason: 'calendar link not configured', scheduledFor: '2026-07-15',
    clientName: 'Priya Raman', firstName: 'Priya', clientEmail: 'priya@example.com',
    zohoDealId: 'demo-zoho-2', maturityDate: '2026-09-13',
    subject: "60 days left, here's what to do",
    body: "Hi Priya,\n\nYou're now about 60 days away from your mortgage renewal on September 13, 2026.\n\nThis is the point where we want to start making decisions.\n\nMichael",
    sentences: [], dropped: [],
    pins: {
      first_name: { value: 'Priya', source: 'zoho:Contacts.First_Name (demo)' },
      maturity_date: { value: 'September 13, 2026', source: 'zoho:Potentials.Maturity_Date (demo)' },
    },
    skeletonHash: 'demo-hash', draftSource: 'generated',
  },
]

export const demoRenewalSequenceStates: RenewalSequenceState[] = [
  {
    sequenceId: 'demo-rs-1', zohoDealId: 'demo-zoho-1', status: 'active', exitReason: null,
    maturityDate: '2026-12-11', clientName: 'Dana Whitfield',
    nextTouch: { skeletonId: 'touch-150', scheduledFor: '2026-07-14', status: 'pending_approval' },
    sentCount: 0,
  },
  {
    sequenceId: 'demo-rs-2', zohoDealId: 'demo-zoho-2', status: 'active', exitReason: null,
    maturityDate: '2026-09-13', clientName: 'Priya Raman',
    nextTouch: { skeletonId: 'touch-60', scheduledFor: '2026-07-15', status: 'held' },
    sentCount: 1,
  },
]

// ─── Client comms (B7-P, 2026-07-18): the canned approval queue, a per-deal
// timeline, and the settings + suppression list. Synthetic design cast only;
// demo performs zero workbench reads and every comms write is DemoWriteBlocked.
// The queue carries all four touch families plus a held draft and a catch-up
// (stale-dated) draft, so a demo shows the whole surface with no client on it.
export const demoCommsQueue: CommsQueueItem[] = [
  {
    touchId: 'demo-ct-1', sequenceId: 'demo-cs-1', zohoDealId: 'demo-zoho-10',
    touchKind: 'stage_update', skeletonId: 'stage-funded', status: 'pending_approval',
    heldReason: null, scheduledFor: '2026-07-17', createdAt: '2026-07-17T14:00:00Z',
    clientName: 'Sofia Ricci', firstName: 'Sofia', clientEmail: 'sofia@example.com',
    subject: 'Your mortgage is funded',
    body: 'Hi Sofia,\n\nIt is official. Your mortgage has funded and everything is done. Congratulations.\n\nI will keep an eye on your mortgage for you through my Strategic Mortgage Monitoring service, so you always have someone watching the market on your behalf.\n\nIt was a pleasure working with you.\n\nTalk soon,\nMichael',
    mergeFields: ['first_name'], copyGate: 'ok', draftSource: 'generated',
  },
  {
    touchId: 'demo-ct-2', sequenceId: 'demo-cs-2', zohoDealId: 'demo-zoho-11',
    touchKind: 'app_chase', skeletonId: 'app-chase-d5', status: 'pending_approval',
    heldReason: null, scheduledFor: '2026-07-16', createdAt: '2026-07-16T09:00:00Z',
    clientName: 'Jordan Wells', firstName: 'Jordan', clientEmail: 'jordan@example.com',
    subject: 'A quick nudge on your application',
    body: 'Hi Jordan,\n\nI noticed your mortgage application is not quite finished yet. No worries, it happens.\n\nWhen you have a few minutes, please pop back in and finish it so I can get to work for you. Just reply to this email if you hit a snag.\n\nTalk soon,\nMichael',
    mergeFields: ['first_name'], copyGate: 'ok', draftSource: 'generated',
  },
  {
    touchId: 'demo-ct-3', sequenceId: 'demo-cs-3', zohoDealId: 'demo-zoho-12',
    touchKind: 'doc_chase', skeletonId: 'doc-chase-2', status: 'pending_approval',
    heldReason: null, scheduledFor: '2026-07-15', createdAt: '2026-07-09T09:00:00Z',
    clientName: 'Marcus Tran', firstName: 'Marcus', clientEmail: 'marcus@example.com',
    subject: 'A couple of documents I still need',
    body: 'Hi Marcus,\n\nI am still waiting on a few documents to keep your file moving. Here is what I need:\n- your latest pay stub\n- a recent bank statement\n\nWhenever you get a chance to send those over, I will take it from there. Just reply to this email if you have any questions.\n\nTalk soon,\nMichael',
    mergeFields: ['first_name', 'documents'], copyGate: 'ok', draftSource: 'human_edited',
  },
  {
    touchId: 'demo-ct-4', sequenceId: 'demo-cs-4', zohoDealId: 'demo-zoho-13',
    touchKind: 'review_ask', skeletonId: 'review-ask', status: 'held',
    heldReason: 'the review link is not configured yet', scheduledFor: '2026-07-14', createdAt: '2026-07-14T09:00:00Z',
    clientName: 'Priya Anand', firstName: 'Priya', clientEmail: 'priya.a@example.com',
    subject: 'A quick favour',
    body: 'Hi Priya,\n\nI hope you are settling in and enjoying your new mortgage. It was great working with you.\n\nIf you have a minute, a short Google review would mean a lot and helps other families find me. Here is the link:\n[review link not set]\n\nThank you either way,\nMichael',
    mergeFields: ['first_name'], copyGate: 'held', draftSource: 'generated',
  },
  {
    // A catch-up crop example: a stage transition from weeks ago, scheduled in
    // the past, so the queue flags it for fast review.
    touchId: 'demo-ct-5', sequenceId: 'demo-cs-5', zohoDealId: 'demo-zoho-14',
    touchKind: 'stage_update', skeletonId: 'stage-conditions_cleared', status: 'pending_approval',
    heldReason: null, scheduledFor: '2026-06-18', createdAt: '2026-06-18T09:00:00Z',
    clientName: 'Dana Okafor', firstName: 'Dana', clientEmail: 'dana.o@example.com',
    subject: 'You are cleared to close',
    body: 'Hi Dana,\n\nMore good news. All the conditions on your mortgage are cleared. You are set to close on August 1, 2026.\n\nYour lawyer will handle the final signing. I am here if anything comes up before then.\n\nTalk soon,\nMichael',
    mergeFields: ['first_name', 'closing_date'], copyGate: 'ok', draftSource: 'generated',
  },
]

export const demoCommsTimeline: CommsTimeline = {
  hasSequences: true,
  sent: [
    { skeletonId: 'stage-application_received', touchKind: 'stage_update', status: 'sent', scheduledFor: '2026-06-30', sentAt: '2026-06-30T15:12:00Z', sentMode: 'live' },
    { skeletonId: 'stage-submitted_to_lender', touchKind: 'stage_update', status: 'sent', scheduledFor: '2026-07-08', sentAt: '2026-07-08T11:04:00Z', sentMode: 'live' },
  ],
  pending: [
    { skeletonId: 'doc-chase-1', touchKind: 'doc_chase', status: 'pending_approval', scheduledFor: '2026-07-15', sentAt: null, sentMode: null },
  ],
  suppression: null,
}

export const demoCommsSettings: CommsSettingsRead = {
  settings: {
    comms_enabled: false,
    comms_mailing_address: '123 Example Street, Guelph ON N1H 0A0',
    comms_max_per_client_per_day: 1,
    comms_max_per_client_per_week: 3,
  },
  suppressions: [
    { clientEmail: 'eli@example.com', reason: 'client used the unsubscribe link', source: 'unsubscribe', suppressedAt: '2026-07-10T12:00:00Z' },
  ],
}

// ─── The client's own status page (B5, 2026-07-17) ──────────────────────────
// A synthetic file from the design cast, so the client page can be shown,
// screenshotted, and demoed without any real client's link ever being opened.
// Fixed dates, obviously fictional people, and a token that resolves only in
// demo mode (isDemoMode() gates it before any store call, so this token is
// inert in production).

// 64 hex chars: the shape gate runs BEFORE the demo check, so even the demo
// token has to be a real token shape. ('demo' repeated is not hex.)
export const DEMO_CLIENT_TOKEN = 'de'.repeat(32)

export function demoClientFileView(token: string): ClientFileView | null {
  // NO fallback. An unknown token must resolve to nothing here exactly as it
  // does in production, or demo mode quietly lies about the one behaviour this
  // surface most needs to get right: an unusable link shows the not-found page.
  // (It first shipped with a convenience fallback, which made every
  // well-formed token render the demo file and hid the not-found state.)
  return DEMO_CLIENT_FILES[token] ?? null
}

// A mid-underwriting purchase: documents in all three states across two
// borrowers, a closing date, a realtor on the team. The full page, for proofs.
const demoPurchaseFile: ClientFileView = {
  fileRef: 'FOX-1004',
  firstName: 'Sofia',
  journey: clientJourneyFor(
    journeyForStage({ stage: 'Collecting Documentation', shape: 'purchase', space: 'display' }),
  ),
  closingDate: '2026-09-18',
  documents: {
    total: 12,
    done: 4,
    received: 3,
    waiting: 5,
    groups: [
      { borrower: 'Sofia', names: ['Photo ID', 'Most recent pay stub', 'Void cheque'] },
      { borrower: 'Marco', names: ['Notice of Assessment for 2025', 'Property tax bill'] },
    ],
  },
  team: [
    AGENT_MEMBER,
    {
      role: 'realtor',
      roleLabel: 'Your realtor',
      name: 'Marcus Tran',
      email: 'marcus@example.com',
      phone: '519-555-0142',
    },
  ],
}

// A refinance clearing conditions: the lender said yes, a lawyer is on, and
// everything is in with a couple still being looked over (nothing waiting).
const demoRefiFile: ClientFileView = {
  fileRef: 'FOX-1011',
  firstName: 'Jordan',
  journey: clientJourneyFor(
    journeyForStage({ stage: 'Conditionally Approved', shape: 'refi', space: 'display' }),
  ),
  closingDate: '2026-08-04',
  documents: { total: 8, done: 6, received: 2, waiting: 0, groups: [] },
  team: [
    AGENT_MEMBER,
    {
      role: 'lawyer',
      roleLabel: 'Your lawyer',
      name: 'Noor Haddad',
      email: 'noor@example.com',
      phone: '519-555-0177',
    },
  ],
}

// A funded file: beyond funding, no closing date (the dateless proof), and
// every document done.
const demoFundedFile: ClientFileView = {
  fileRef: 'FOX-0994',
  firstName: 'Ava',
  journey: clientJourneyFor(
    journeyForStage({ stage: 'Mortgage Funded', shape: 'renewal', space: 'display' }),
  ),
  closingDate: null,
  documents: { total: 5, done: 5, received: 0, waiting: 0, groups: [] },
  team: [AGENT_MEMBER],
}

const DEMO_CLIENT_FILES: Record<string, ClientFileView> = {
  [DEMO_CLIENT_TOKEN]: demoPurchaseFile,
  ['a1'.repeat(32)]: demoRefiFile,
  ['b2'.repeat(32)]: demoFundedFile,
}
