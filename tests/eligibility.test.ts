// Eligibility model tests. The derivation block mirrors fox-underwriting's
// golden suite (src/skills/extract/eligibility.test.ts) so the portal port
// stays in lockstep. The composite tests cover province exclusion, channel
// access, transaction mismatch, program restriction + qualifier/pin unlock, and
// the client-doc fail-closed rule.

import { describe, expect, it } from 'vitest'
import {
  baseStem,
  deriveEligibility,
  effectiveEligibility,
  evaluateQuote,
  includedInClientDoc,
  includedInRanking,
  resolveProvince,
  type QuoteEligibilityFields,
} from '@/lib/eligibility'

const d = (v: string | null, lender = 'x', notes: string | null = null) => deriveEligibility(v, lender, notes)

describe('baseStem strips structural suffixes to the program stem', () => {
  it('LTV / beacon / amort / product-class suffixes fall away', () => {
    expect(baseStem('ltv<=65')).toBe('')
    expect(baseStem('ltv65-70')).toBe('')
    expect(baseStem('ltv>70.01')).toBe('')
    expect(baseStem('beacon-680+')).toBe('')
    expect(baseStem('ltv50-65-beacon-680+')).toBe('')
    expect(baseStem('mortgage-plus-25yr')).toBe('mortgage-plus')
    expect(baseStem('60-day-quick-close-ltv<=65')).toBe('60-day-quick-close')
    expect(baseStem('partner-exclusive-beacon-680+')).toBe('partner-exclusive')
    expect(baseStem('fusion-uninsurable')).toBe('fusion')
    expect(baseStem('near-prime-flex-640-679')).toBe('near-prime-flex')
    expect(baseStem('rental-ltv75')).toBe('rental')
    expect(baseStem('frontline-ltv75-80')).toBe('frontline')
    expect(baseStem(null)).toBe('')
  })
})

describe('derivation acceptance targets (fox-underwriting golden parity)', () => {
  it('Scotia physician: borrower physician AND banking bundle', () => {
    const r = d('physician', 'scotia', 'Available to eligible professionals only.\nDeal must be Mortgage +.')
    expect(r.borrower_requirement).toBe('physician')
    expect(r.client_commitment).toBe('banking_bundle')
    expect(r.eligibility_unknown).toBe(false)
    expect(r.eligibility_source).toContain('variant:physician')
    expect(r.eligibility_source).toContain('Mortgage +')
  })
  it('Scotia mortgage-plus: banking bundle only', () => {
    for (const v of ['mortgage-plus', 'mortgage-plus-25yr', 'mortgage-plus-30yr']) {
      const r = d(v, 'scotia')
      expect(r.client_commitment).toBe('banking_bundle')
      expect(r.borrower_requirement).toBeNull()
    }
  })
  it('UnionLink 60-day-quick-close: quick_close_60d AND exclusive_partner', () => {
    const r = d('60-day-quick-close', 'unionlink')
    expect(r.client_commitment).toBe('quick_close_60d')
    expect(r.channel_requirement).toBe('exclusive_partner')
  })
  it('every UnionLink quote carries the exclusive-partner channel', () => {
    expect(d('ltv<=65', 'unionlink').channel_requirement).toBe('exclusive_partner')
    expect(d('near-prime-680-719', 'unionlink').channel_requirement).toBe('exclusive_partner')
  })
  it('Radius promo-purchase-transfer: purchase and transfer only', () => {
    expect(d('promo-purchase-transfer', 'radius').transaction_types).toEqual(['purchase', 'transfer'])
  })
  it('MCAP safeguard: refinance-only', () => {
    expect(d('safeguard', 'mcap').transaction_types).toEqual(['refinance'])
  })
  it('discovered borrower/client/channel vocabulary', () => {
    expect(d('high-net-worth', 'shinhan').borrower_requirement).toBe('net_worth')
    expect(d('newcomer', 'shinhan').borrower_requirement).toBe('new_to_canada')
    expect(d('stated-income-ltv65-90', 'first-national').borrower_requirement).toBe('business_for_self')
    expect(d('45-day-quick-close', 'neo').client_commitment).toBe('quick_close_45d')
    expect(d('90-day-close', 'rfa').client_commitment).toBe('quick_close_90d')
    expect(d('pmpp', 'b2b').channel_requirement).toBe('exclusive_partner')
    expect(d('partner-exclusive-beacon-680+', 'nbc-optimum').channel_requirement).toBe('exclusive_partner')
  })
  it('structural stems carry no requirement and are not unknown', () => {
    for (const v of ['basic', 'value-flex-ltv<=65', 'fusion-uninsurable', 'axis-540-579', 'near-prime-720-900', 'rental', 'ltv<=65', null]) {
      const r = d(v)
      expect([r.borrower_requirement, r.client_commitment, r.channel_requirement, r.transaction_types].every(x => x == null)).toBe(true)
      expect(r.eligibility_unknown).toBe(false)
    }
  })
  it('fail-closed: undefinable and unrecognized restrictions are unknown', () => {
    expect(d('frontline', 'rfa').eligibility_unknown).toBe(true)
    expect(d('special-homeline', 'cmls').eligibility_unknown).toBe(true)
    expect(d('mystery-program-xyz', 'somelender').eligibility_unknown).toBe(true)
    expect(d('mystery-program-xyz', 'somelender').borrower_requirement).toBeNull()
  })
})

describe('effectiveEligibility prefers populated workbench columns', () => {
  it('derives when eligibility_source is absent (backfill has not run)', () => {
    const q: QuoteEligibilityFields = { lenderSlug: 'scotia', variant: 'physician', programNotes: null }
    expect(effectiveEligibility(q).borrower_requirement).toBe('physician')
  })
  it('trusts the workbench columns when eligibility_source is present', () => {
    const q: QuoteEligibilityFields = {
      lenderSlug: 'scotia', variant: 'physician', programNotes: null,
      borrowerRequirement: null, clientCommitment: null, eligibilityUnknown: false,
      eligibilitySource: 'variant:physician (workbench-reclassified)',
    }
    // Workbench says unrestricted; the portal must defer, not re-derive physician.
    expect(effectiveEligibility(q).borrower_requirement).toBeNull()
  })
})

describe('province resolution (mirror + live override)', () => {
  it('the two BC credit unions are ineligible in Ontario', () => {
    expect(resolveProvince('kootenay', 'ON').status).toBe('ineligible')
    expect(resolveProvince('coast-capital', 'ON').status).toBe('ineligible')
  })
  it('an unlisted lender is unknown (fail-closed), not eligible', () => {
    expect(resolveProvince('neo', 'ON').status).toBe('unknown')
    expect(resolveProvince('first-national', 'ON').status).toBe('unknown')
  })
  it('a live registry entry wins over the mirror', () => {
    const live = new Map([['neo', { provinces: ['ON', 'QC'], source: 's', asOf: '2026-07-13' }]])
    expect(resolveProvince('neo', 'ON', live).status).toBe('eligible')
    const liveNat = new Map([['neo', { provinces: 'national' as const, source: 's', asOf: '2026-07-13' }]])
    expect(resolveProvince('neo', 'ON', liveNat).status).toBe('eligible')
    const liveBc = new Map([['neo', { provinces: ['BC'], source: 's', asOf: '2026-07-13' }]])
    expect(resolveProvince('neo', 'ON', liveBc).status).toBe('ineligible')
  })
})

const Q = (over: Partial<QuoteEligibilityFields & { id: string }> = {}): QuoteEligibilityFields & { id: string } => ({
  id: 'q1', lenderSlug: 'neo', variant: null, programNotes: null, ...over,
})

describe('evaluateQuote composite', () => {
  it('BC credit union is province_ineligible everywhere, unlockable by nothing', () => {
    const v = evaluateQuote(Q({ lenderSlug: 'kootenay', variant: 'ltv<=65' }), 'ON', {})
    expect(v.category).toBe('province_ineligible')
    expect(includedInRanking(v, true)).toBe(false)
    expect(includedInClientDoc(v)).toBe(false)
  })
  it('unknown-province lender is eligible for ranking (flagged) but excluded from client docs', () => {
    const v = evaluateQuote(Q({ lenderSlug: 'neo', variant: 'ltv<=65' }), 'ON', {})
    expect(v.category).toBe('eligible')
    expect(v.province.status).toBe('unknown')
    expect(includedInRanking(v)).toBe(true)
    expect(includedInClientDoc(v)).toBe(false)
  })
  it('physician quote is program_restricted by default, unlocked by the physician qualifier', () => {
    const base = evaluateQuote(Q({ lenderSlug: 'scotia', variant: 'physician' }), 'ON', {})
    expect(base.category).toBe('program_restricted')
    expect(base.requirementSentences[0]).toContain('physician')
    expect(includedInRanking(base)).toBe(false)
    expect(includedInRanking(base, true)).toBe(true) // show-restricted reveals it
    const unlocked = evaluateQuote(Q({ lenderSlug: 'scotia', variant: 'physician' }), 'ON', {
      borrowerProfiles: ['physician'], commitments: ['banking_bundle'],
    })
    expect(unlocked.category).toBe('eligible')
    expect(unlocked.unlocked).toBe(true)
  })
  it('a manual pin unlocks a restricted product', () => {
    const v = evaluateQuote(Q({ id: 'pinme', lenderSlug: 'scotia', variant: 'physician' }), 'ON', {
      pinnedIds: new Set(['pinme']),
    })
    expect(v.category).toBe('eligible')
    expect(v.unlocked).toBe(true)
  })
  it('UnionLink is eligible (channel held) but Michael-only channel; a non-held exclusive channel is excluded', () => {
    const ul = evaluateQuote(Q({ lenderSlug: 'unionlink', variant: 'ltv<=65' }), 'ON', {})
    expect(ul.category).toBe('eligible') // channel held
    const pmpp = evaluateQuote(Q({ lenderSlug: 'b2b', variant: 'pmpp' }), 'ON', {})
    expect(pmpp.category).toBe('channel_unavailable')
    expect(includedInRanking(pmpp, true)).toBe(false)
  })
  it('transaction mismatch excludes a transaction-restricted quote, never unlockable', () => {
    const refi = evaluateQuote(Q({ lenderSlug: 'radius', variant: 'promo-purchase-transfer' }), 'ON', { transaction: 'refinance' })
    expect(refi.category).toBe('transaction_mismatch')
    expect(includedInRanking(refi, true)).toBe(false)
    const purch = evaluateQuote(Q({ lenderSlug: 'radius', variant: 'promo-purchase-transfer' }), 'ON', { transaction: 'purchase' })
    expect(purch.category).toBe('eligible')
  })
  it('eligibility_unknown is restricted and never unlocked by a qualifier', () => {
    const v = evaluateQuote(Q({ lenderSlug: 'rfa', variant: 'frontline' }), 'ON', { borrowerProfiles: ['physician'], commitments: ['banking_bundle'] })
    expect(v.category).toBe('program_restricted')
    expect(v.requirementCodes).toContain('eligibility_unknown')
  })
})
