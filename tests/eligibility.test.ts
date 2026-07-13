// Eligibility tests, column-truth edition. The workbench classifier populates
// the five eligibility columns on rate_quotes (backfill verified 2026-07-13:
// 947 of 949 approved rows carry eligibility_source); the portal READS them and
// derives nothing. The golden suite asserts portal verdicts match the columns
// as the workbench writes them (fixtures shaped exactly like live rows), that
// the derivation is gone from the module, and that the two fail-close
// conditions (eligibility_unknown = true, eligibility_source IS NULL) exclude a
// quote from every client-facing surface.

import { describe, expect, it } from 'vitest'
import * as eligibilityModule from '@/lib/eligibility'
import {
  evaluateQuote,
  includedInClientDoc,
  includedInRanking,
  resolveProvince,
  type QuoteEligibilityFields,
} from '@/lib/eligibility'
import { DEFAULT_SCENARIO, lenderResults, matchQuote, scenarioVerdict, type Scenario } from '@/lib/scenario'
import { lenderCards } from '@/lib/lender-browse'
import { bestApprovedFixed, type ApprovedFixedQuote } from '@/lib/renewals'
import { analyzeMortgage } from '@/lib/smm-analysis'
import { parseSmmRow } from '@/lib/smm'
import type { BookQuote } from '@/lib/smm-match'
import type { RateQuoteFullRow } from '@/lib/underwriting'

// ─── The derivation is gone (the acceptance proof) ──────────────────────────
describe('the portal derives nothing: the classifier lives in fox-underwriting only', () => {
  it('the module exports no derivation surface', () => {
    const m = eligibilityModule as Record<string, unknown>
    expect(m.deriveEligibility).toBeUndefined()
    expect(m.baseStem).toBeUndefined()
    expect(m.effectiveEligibility).toBeUndefined()
    expect(m.eligibilityIsWorkbenchServed).toBeUndefined()
  })
})

// ─── Fixtures shaped exactly like the live backfilled columns ────────────────
const Q = (over: Partial<QuoteEligibilityFields & { id: string }> = {}): QuoteEligibilityFields & { id: string } => ({
  id: 'q1',
  lenderSlug: 'neo',
  borrowerRequirement: null,
  clientCommitment: null,
  channelRequirement: null,
  transactionTypes: null,
  eligibilityUnknown: false,
  eligibilitySource: 'variant:(none)',
  ...over,
})

// The live Scotia physician row, verbatim column values (verified 2026-07-13).
const PHYSICIAN = Q({
  lenderSlug: 'scotia',
  borrowerRequirement: 'physician',
  clientCommitment: 'banking_bundle',
  eligibilitySource: 'variant:physician | notes:Available to eligible professionals only.\nDeal must be Mortgage +.',
})

describe('portal verdicts match the workbench columns (golden)', () => {
  it('the physician row is program_restricted by default, with its requirement sentences', () => {
    const v = evaluateQuote(PHYSICIAN, 'ON', {})
    expect(v.category).toBe('program_restricted')
    expect(v.requirementCodes).toEqual(['physician', 'banking_bundle'])
    expect(v.requirementSentences[0]).toContain('physician')
    expect(includedInRanking(v)).toBe(false)
    expect(includedInRanking(v, true)).toBe(true)
  })
  it('the physician row unlocks only with BOTH qualifiers the columns require', () => {
    expect(evaluateQuote(PHYSICIAN, 'ON', { borrowerProfiles: ['physician'] }).category).toBe('program_restricted')
    const unlocked = evaluateQuote(PHYSICIAN, 'ON', { borrowerProfiles: ['physician'], commitments: ['banking_bundle'] })
    expect(unlocked.category).toBe('eligible')
    expect(unlocked.unlocked).toBe(true)
  })
  it('a unionlink row (channel_requirement from the workbench) is eligible because the channel is held', () => {
    const v = evaluateQuote(Q({ lenderSlug: 'unionlink', channelRequirement: 'exclusive_partner', eligibilitySource: 'variant:ltv<=65' }), 'ON', {})
    expect(v.category).toBe('eligible')
  })
  it('a pmpp row on a lender whose channel Fox does not hold is channel_unavailable, never unlockable', () => {
    const v = evaluateQuote(Q({ lenderSlug: 'b2b', channelRequirement: 'exclusive_partner', eligibilitySource: 'variant:pmpp' }), 'ON', {})
    expect(v.category).toBe('channel_unavailable')
    expect(includedInRanking(v, true)).toBe(false)
  })
  it('a transaction-restricted row (Radius promo columns) mismatches a refinance and fits a purchase', () => {
    const radius = Q({ lenderSlug: 'radius', transactionTypes: ['purchase', 'transfer'], eligibilitySource: 'variant:promo-purchase-transfer' })
    expect(evaluateQuote(radius, 'ON', { transaction: 'refinance' }).category).toBe('transaction_mismatch')
    expect(evaluateQuote(radius, 'ON', { transaction: 'purchase' }).category).toBe('eligible')
  })
  it('a structural row (all requirement columns null, source recorded) is simply eligible', () => {
    const v = evaluateQuote(Q({ eligibilitySource: 'variant:ltv<=65' }), 'ON', {})
    expect(v.category).toBe('eligible')
    expect(v.requirementCodes).toEqual([])
  })
})

describe('fail-closed: eligibility_unknown and a NULL eligibility_source', () => {
  it('eligibility_unknown=true is restricted, never unlocked by qualifiers, never on a client doc — even pinned', () => {
    const q = Q({ lenderSlug: 'rfa', eligibilityUnknown: true, eligibilitySource: 'variant:frontline' })
    const v = evaluateQuote(q, 'ON', { borrowerProfiles: ['physician'], commitments: ['banking_bundle'] })
    expect(v.category).toBe('program_restricted')
    expect(v.requirementCodes).toContain('eligibility_unknown')
    const pinnedV = evaluateQuote(q, 'ON', { pinnedIds: new Set(['q1']) })
    expect(pinnedV.category).toBe('eligible') // pin unlocks internal ranking
    expect(includedInClientDoc(pinnedV)).toBe(false) // but never a client document
  })
  it('a NULL eligibility_source (an unclassified row, e.g. fresh from Roam) is restricted as unclassified', () => {
    const q = Q({ eligibilitySource: null })
    const v = evaluateQuote(q, 'ON', {})
    expect(v.category).toBe('program_restricted')
    expect(v.requirementCodes).toContain('unclassified')
    expect(v.requirementSentences.join(' ')).toContain('not been classified')
    expect(includedInRanking(v)).toBe(false)
    expect(includedInRanking(v, true)).toBe(true) // visible flagged, never silent
    const pinnedV = evaluateQuote(q, 'ON', { pinnedIds: new Set(['q1']) })
    expect(includedInClientDoc(pinnedV)).toBe(false) // a pin cannot confirm an unnameable restriction
  })
  it('an ABSENT eligibilitySource (undefined) fail-closes the same as null', () => {
    const v = evaluateQuote({ lenderSlug: 'neo' }, 'ON', {})
    expect(v.category).toBe('program_restricted')
    expect(v.requirementCodes).toContain('unclassified')
  })
})

describe('province resolution (mirror + live override)', () => {
  it('the two BC credit unions are ineligible in Ontario', () => {
    expect(resolveProvince('kootenay', 'ON').status).toBe('ineligible')
    expect(resolveProvince('coast-capital', 'ON').status).toBe('ineligible')
  })
  it('an unlisted lender is unknown (fail-closed), not eligible', () => {
    expect(resolveProvince('neo', 'ON').status).toBe('unknown')
  })
  it('a live registry entry wins over the mirror', () => {
    const live = new Map([['neo', { provinces: ['ON', 'QC'], source: 's', asOf: '2026-07-13' }]])
    expect(resolveProvince('neo', 'ON', live).status).toBe('eligible')
    const liveBc = new Map([['neo', { provinces: ['BC'], source: 's', asOf: '2026-07-13' }]])
    expect(resolveProvince('neo', 'ON', liveBc).status).toBe('ineligible')
  })
  it('a BC credit union is province_ineligible: no ranking, no client doc, no unlock', () => {
    const v = evaluateQuote(Q({ lenderSlug: 'kootenay' }), 'ON', {})
    expect(v.category).toBe('province_ineligible')
    expect(includedInRanking(v, true)).toBe(false)
    expect(includedInClientDoc(v)).toBe(false)
  })
  it('an unknown-province lender ranks flagged but never reaches a client doc', () => {
    const v = evaluateQuote(Q({ lenderSlug: 'neo' }), 'ON', {})
    expect(v.category).toBe('eligible')
    expect(v.province.status).toBe('unknown')
    expect(includedInRanking(v)).toBe(true)
    expect(includedInClientDoc(v)).toBe(false)
  })
})

// ─── The acceptance sweep: a NULL-source quote is excluded on every surface ──
const fullRow = (over: Partial<RateQuoteFullRow>): RateQuoteFullRow => ({
  id: 'q-null-src',
  intelItemId: 'intel-1',
  lenderSlug: 'neo',
  productClass: 'insurable',
  variant: null,
  termMonths: 60,
  rate: 3.99, // deliberately the best rate on offer: it must STILL be excluded
  rateType: 'fixed',
  primeVariance: null,
  cashbackPct: null,
  programNotes: null,
  compBps: null,
  asOfDate: '2026-07-09',
  expiryDate: null,
  sourcePage: 1,
  sourceSnippet: 'TEST synthetic',
  confidence: 0.9,
  status: 'approved',
  extractedBy: 'test',
  createdAt: '2026-07-10T00:00:00Z',
  reviewedAt: null,
  approvedVia: null,
  heldReason: null,
  borrowerRequirement: null,
  clientCommitment: null,
  channelRequirement: null,
  transactionTypes: null,
  eligibilityUnknown: false,
  eligibilitySource: null, // the fail-close condition under test
  ...over,
})

const SCEN: Scenario = { ...DEFAULT_SCENARIO, amount: 500_000, propertyValue: 700_000 }

describe('a quote with eligibility_source IS NULL is excluded from every surface', () => {
  const nullSrc = fullRow({})
  const classified = fullRow({ id: 'q-ok', rate: 4.49, eligibilitySource: 'variant:(none)' })

  it('scenario + Ask Fox (matchQuote/lenderResults, the shared gate): excluded from default results', () => {
    expect(matchQuote(nullSrc, SCEN)).toBeNull()
    const results = lenderResults([nullSrc, classified], SCEN)
    expect(results).toHaveLength(1)
    expect(results[0].matches[0].quote.id).toBe('q-ok') // the worse-but-classified rate wins
  })

  it('compare tray -> client rates PDF: includedInClientDoc refuses it, even pinned', () => {
    const pinnedScenario: Scenario = SCEN
    const v = scenarioVerdict(nullSrc, pinnedScenario)
    expect(includedInClientDoc(v)).toBe(false)
  })

  it('lender-browse: no card is built from it', () => {
    expect(lenderCards([nullSrc], '2026-07-13')).toHaveLength(0)
    expect(lenderCards([classified], '2026-07-13')).toHaveLength(1)
  })

  it('Opportunities + savings PDF (analyzeMortgage): never the comparable', () => {
    const row = parseSmmRow({
      'Household ID': 'H', 'File reference': 'F', 'First name': 'A', 'Last name': 'B', 'Client type': 'CLIENT',
      Email: 'a@b.com', Phone: '1', 'Property address': '1 St', 'Property type': 'detached', 'Property occupancy': 'owner_occupied',
      'Estimated home value': '$700,000.00', 'Mortgage amount': '$500,000.00', 'Mortgage outstanding balance': '$480,000.00',
      'Mortgage rate': '6.49%', 'Mortgage rate type': 'fixed', 'Mortgage closing date': '2024-02-07', 'Mortgage start date': '2024-02-07',
      'Mortgage maturity date': '2030-02-07', 'Mortgage amortization (months)': '300', 'Mortgage term (months)': '60',
      'Mortgage lender': 'MCAP', 'Mortgage insurance type': 'Uninsurable', 'Savings potential': '$800.00',
      'Payment relief (monthly)': '$400.00', 'Accessible equity': '$150,000.00', 'Purchasing power': '$100,000.00',
    })
    const nullBook: BookQuote[] = [
      { rate: 3.99, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'neo', primeVariance: null, eligibilityUnknown: false, eligibilitySource: null },
      { rate: 4.59, rateType: 'fixed', termMonths: 60, productClass: 'conventional', asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', primeVariance: null, eligibilityUnknown: false, eligibilitySource: 'variant:(none)' },
    ]
    const { analysis } = analyzeMortgage(row, nullBook, '2026-07-13')
    expect(analysis.comparable?.rate).toBe(4.59) // never the unclassified 3.99
  })

  it('Renewals benchmark (bestApprovedFixed): never the benchmark', () => {
    const quotes: ApprovedFixedQuote[] = [
      { rate: 3.99, rateType: 'fixed', termMonths: 60, asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'neo', eligibilityUnknown: false, eligibilitySource: null },
      { rate: 4.59, rateType: 'fixed', termMonths: 60, asOfDate: '2026-07-09', status: 'approved', lenderSlug: 'first-national', eligibilityUnknown: false, eligibilitySource: 'variant:(none)' },
    ]
    expect(bestApprovedFixed(quotes)?.rate).toBe(4.59)
    expect(bestApprovedFixed([quotes[0]])).toBeNull() // only the unclassified row = honest null
  })
})
