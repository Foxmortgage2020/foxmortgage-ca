// The qualification explorer (B9). Two things earn their keep here: the math is
// the SAME engine the public tools use (golden-tested to the cent), and the
// surface never tells a person no (asserted over the band copy).

import { describe, expect, it } from 'vitest'
import {
  QUALIFICATION_CALC_VERSION,
  computeQualification,
  qualifyingMortgage,
  validateBaseline,
  proposeQualificationBaseline,
  type QualificationBaseline,
} from '../lib/qualification'
import {
  bandKeyForRatios,
  QUALIFICATION_BANDS,
  QUALIFICATION_FOOTER,
  QUALIFICATION_COPY,
  QUALIFICATION_NEVER_SAYS_NO,
} from '../config/qualification'
import { presentationHash } from '../lib/client-presentation'
import type { IncomeCalcRow } from '../lib/underwriting'

// A baseline used across the compute tests. Michael's numbers; the client moves
// price/down/tax/condo.
const baseline = (over: Partial<QualificationBaseline> = {}): QualificationBaseline => ({
  annualIncome: 120000,
  monthlyDebts: 500,
  heatMonthly: 100,
  contractRatePct: 4.79,
  stressMode: 'b20',
  amortizationMonths: 300,
  condoInclusionRate: 0.5,
  gdsLimit: 0.39,
  tdsLimit: 0.44,
  compounding: 'semi-annual',
  defaultPrice: 600000,
  defaultDownPayment: 120000,
  defaultPropertyTaxMonthly: 400,
  defaultCondoMonthly: 0,
  ...over,
})

const round2 = (n: number) => Math.round(n * 100) / 100

// ─── Engine parity: the same numbers the public tools produce ─────────────────

describe('engine parity (the qualifying payment reconciles to the cent)', () => {
  it('a 500,000 mortgage at 5.00% over 25 years qualifies at 2908.02/mo', () => {
    // 625,000 price with 20% down (125,000) is exactly an 80% LTV, no premium,
    // so the mortgage is 500,000. Contract mode qualifies at the contract rate.
    const b = baseline({ contractRatePct: 5.0, stressMode: 'contract', amortizationMonths: 300 })
    const r = computeQualification(b, { price: 625000, downPayment: 125000, propertyTaxMonthly: 0, condoMonthly: 0 })
    expect(r.mortgage).toBe(500000)
    expect(r.insured).toBe(false)
    expect(round2(r.qualifyingPaymentMonthly)).toBe(2908.02)
  })

  it('a 650,000 mortgage at 3.75% over 30 years qualifies at 2999.58/mo', () => {
    const b = baseline({ contractRatePct: 3.75, stressMode: 'contract', amortizationMonths: 360 })
    const r = computeQualification(b, { price: 812500, downPayment: 162500, propertyTaxMonthly: 0, condoMonthly: 0 })
    expect(r.mortgage).toBe(650000)
    expect(round2(r.qualifyingPaymentMonthly)).toBe(2999.58)
  })

  it('the B20 stress rate is the greater of contract + 2 and 5.25', () => {
    expect(computeQualification(baseline({ contractRatePct: 4.79 }), controls()).qualifyingRatePct).toBe(6.79)
    // A low contract rate floors at 5.25.
    expect(computeQualification(baseline({ contractRatePct: 2.5 }), controls()).qualifyingRatePct).toBe(5.25)
    // Contract mode qualifies at the bare contract rate.
    expect(
      computeQualification(baseline({ contractRatePct: 4.79, stressMode: 'contract' }), controls()).qualifyingRatePct,
    ).toBe(4.79)
  })
})

function controls(over: Partial<{ price: number; downPayment: number; propertyTaxMonthly: number; condoMonthly: number }> = {}) {
  return { price: 600000, downPayment: 120000, propertyTaxMonthly: 400, condoMonthly: 0, ...over }
}

// ─── The insured fold (below 20% down folds the CMHC premium) ─────────────────

describe('the insured premium folds in below 20 percent down', () => {
  it('at 20 percent down there is no premium', () => {
    const r = qualifyingMortgage(600000, 120000, 300)
    expect(r.ltv).toBeCloseTo(0.8, 10)
    expect(r.insured).toBe(false)
    expect(r.premium).toBe(0)
    expect(r.mortgage).toBe(480000)
  })

  it('at 10 percent down the 3.10% premium is capitalized into the mortgage', () => {
    const r = qualifyingMortgage(600000, 60000, 300)
    expect(r.ltv).toBeCloseTo(0.9, 10)
    expect(r.insured).toBe(true)
    expect(r.premiumRate).toBe(0.031)
    expect(r.premium).toBe(540000 * 0.031) // 16,740
    expect(r.mortgage).toBe(540000 + 540000 * 0.031) // 556,740
  })

  it('a 30-year amortization adds the 0.20% insured surcharge', () => {
    const r = qualifyingMortgage(600000, 60000, 360)
    expect(r.premiumRate).toBe(0.033) // 0.031 + 0.002
    expect(r.mortgage).toBe(540000 + 540000 * 0.033)
  })

  it('below 5 percent down there is no insurable path — the bare loan qualifies, no NaN', () => {
    const r = qualifyingMortgage(400000, 10000, 300) // 97.5% LTV
    expect(r.insured).toBe(false)
    expect(r.premium).toBe(0)
    expect(Number.isFinite(r.mortgage)).toBe(true)
    expect(r.mortgage).toBe(390000)
  })

  it('over 1.5M with less than 20 percent down is uninsurable — the bare loan qualifies', () => {
    const r = qualifyingMortgage(2000000, 300000, 300) // 85% LTV but over the insured cap
    expect(r.insured).toBe(false)
    expect(r.premium).toBe(0)
    expect(r.mortgage).toBe(1700000)
  })
})

// ─── The minimum-down helper (never a failure state) ──────────────────────────

describe('the minimum-down helper', () => {
  it('names the tiered federal minimum (5% to 500k, 10% to 1.5M, 20% above)', () => {
    expect(computeQualification(baseline(), controls({ price: 400000, downPayment: 20000 })).minimumDown).toBe(20000)
    // 600k: 25,000 + 10% of 100,000 = 35,000.
    expect(computeQualification(baseline(), controls({ price: 600000, downPayment: 35000 })).minimumDown).toBe(35000)
    // 1.6M: 20% = 320,000.
    expect(computeQualification(baseline(), controls({ price: 1600000, downPayment: 320000 })).minimumDown).toBe(320000)
  })

  it('flags a down payment below the minimum but still computes a band', () => {
    const r = computeQualification(baseline(), controls({ price: 600000, downPayment: 20000 }))
    expect(r.belowMinimumDown).toBe(true)
    expect(r.band).toBeTruthy() // never a failure state
    expect(Number.isFinite(r.gds)).toBe(true)
  })

  it('does not flag a down payment exactly on the minimum', () => {
    expect(computeQualification(baseline(), controls({ price: 400000, downPayment: 20000 })).belowMinimumDown).toBe(false)
  })
})

// ─── The four bands: the 39/44, 48, 60 edges land in the right band ───────────

describe('band boundaries (evaluated as a cascade, first match wins)', () => {
  it('green fits: GDS within 39 AND TDS within 44', () => {
    expect(bandKeyForRatios(39, 44)).toBe('fits')
    expect(bandKeyForRatios(30, 40)).toBe('fits')
    expect(bandKeyForRatios(0, 0)).toBe('fits')
  })

  it('the moment either the 39 or the 44 is passed, it leaves green (TDS still within 48 keeps it options)', () => {
    expect(bandKeyForRatios(39.01, 44)).toBe('options') // GDS just over, TDS 44 <= 48
    expect(bandKeyForRatios(39, 44.01)).toBe('options') // TDS just over 44, still <= 48
  })

  it('the stretch bands drive on TDS, not GDS (the case the GDS reading got wrong)', () => {
    // A low GDS with a high TDS lands on the TDS band. TDS carries the whole
    // obligation picture, so the band reflects the client's full situation.
    expect(bandKeyForRatios(30, 45)).toBe('options') // TDS 45 <= 48
    expect(bandKeyForRatios(30, 55)).toBe('alternatives') // TDS 55 in (48, 60]
    expect(bandKeyForRatios(30, 70)).toBe('conversation') // TDS 70 > 60 (was 'options' when GDS drove it)
  })

  it('the 48 edge is on TDS: within 48 is options, just past is alternatives', () => {
    expect(bandKeyForRatios(45, 48)).toBe('options')
    expect(bandKeyForRatios(45, 48.01)).toBe('alternatives')
  })

  it('the 60 edge is on TDS: within 60 is alternatives, beyond is a conversation', () => {
    expect(bandKeyForRatios(50, 60)).toBe('alternatives')
    expect(bandKeyForRatios(50, 60.01)).toBe('conversation')
    expect(bandKeyForRatios(65, 100)).toBe('conversation')
  })
})

describe('the whole explorer reaches all four bands (the client moving the controls)', () => {
  const b = baseline() // income 120k, debts 500, heat 100, 4.79% b20, 25yr
  it('a comfortable buy fits', () => {
    expect(computeQualification(b, { price: 545000, downPayment: 109000, propertyTaxMonthly: 200, condoMonthly: 0 }).band.key).toBe('fits')
  })
  it('a modest stretch shows options', () => {
    expect(computeQualification(b, { price: 565000, downPayment: 56500, propertyTaxMonthly: 300, condoMonthly: 0 }).band.key).toBe('options')
  })
  it('a bigger stretch shows alternative paths', () => {
    expect(computeQualification(b, { price: 690000, downPayment: 69000, propertyTaxMonthly: 400, condoMonthly: 0 }).band.key).toBe('alternatives')
  })
  it('a large stretch asks for a conversation', () => {
    expect(computeQualification(b, { price: 1127000, downPayment: 225400, propertyTaxMonthly: 500, condoMonthly: 0 }).band.key).toBe('conversation')
  })
})

// ─── Snapshot immutability: a file change never moves a published baseline ────

describe('a published baseline is a frozen snapshot', () => {
  it('the baseline is plain data, cited by a stable hash', () => {
    const b = baseline()
    const hash = presentationHash({ v: QUALIFICATION_CALC_VERSION, baseline: b })
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    // Same baseline, same citation. Different baseline, different citation.
    expect(presentationHash({ v: QUALIFICATION_CALC_VERSION, baseline: b })).toBe(hash)
    expect(presentationHash({ v: QUALIFICATION_CALC_VERSION, baseline: baseline({ annualIncome: 130000 }) })).not.toBe(hash)
  })

  it('recomputing the proposal from changed file truth does not touch a stored baseline', () => {
    const b = baseline()
    const frozen = JSON.parse(JSON.stringify(b))
    // The file's income later changes; the proposal recomputes with new numbers.
    const later = proposeQualificationBaseline({
      incomeCalcs: [income('b1', 200000)],
      finmoRatePct: 6.2,
      dealPrice: 900000,
    })
    expect(later.baseline.annualIncome).not.toBe(b.annualIncome)
    // The stored baseline is unchanged — it is data the client already saw.
    expect(b).toEqual(frozen)
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe('validateBaseline', () => {
  it('accepts a real baseline', () => {
    const v = validateBaseline(baseline())
    expect(v.ok).toBe(true)
  })
  it('refuses a zero income, so a nonsense baseline never publishes', () => {
    const v = validateBaseline(baseline({ annualIncome: 0 }))
    expect(v.ok).toBe(false)
    if (!v.ok) expect(v.missing.join(' ')).toContain('income')
  })
  it('refuses a down payment at or above the price', () => {
    const v = validateBaseline(baseline({ defaultPrice: 500000, defaultDownPayment: 500000 }))
    expect(v.ok).toBe(false)
  })
  it('refuses a wild rate', () => {
    expect(validateBaseline(baseline({ contractRatePct: 40 })).ok).toBe(false)
  })
})

// ─── The proposal ─────────────────────────────────────────────────────────────

const income = (borrowerId: string | null, resultAnnual: number, createdAt = '2026-07-18T00:00:00Z'): IncomeCalcRow => ({
  id: `ic-${borrowerId}-${resultAnnual}`,
  borrowerId,
  lenderSlug: null,
  basis: 'employment',
  resultAnnual,
  calcVersion: '1',
  inputsHash: 'h',
  createdAt,
})

describe('proposeQualificationBaseline', () => {
  it('sums the latest income per borrower and cites the file', () => {
    const { baseline: b, sources } = proposeQualificationBaseline({
      // newest-first order; the older b1 row is ignored.
      incomeCalcs: [income('b1', 90000), income('b2', 60000), income('b1', 80000)],
      finmoRatePct: 5.19,
      dealPrice: 720000,
    })
    expect(b.annualIncome).toBe(150000)
    expect(sources.annualIncome).toBe('file')
    expect(b.contractRatePct).toBe(5.19)
    expect(sources.contractRatePct).toBe('file')
    expect(b.defaultPrice).toBe(720000)
    expect(sources.defaultPrice).toBe('file')
    // Heat has no source in the repo; it is always a default the broker confirms.
    expect(b.heatMonthly).toBe(100)
    expect(sources.heatMonthly).toBe('default')
    expect(b.monthlyDebts).toBe(0)
    expect(b.stressMode).toBe('b20')
  })

  it('falls back to sane defaults, cited as defaults, when the file is silent', () => {
    const { baseline: b, sources } = proposeQualificationBaseline({ incomeCalcs: [], finmoRatePct: null, dealPrice: null })
    expect(b.annualIncome).toBe(0)
    expect(sources.annualIncome).toBe('default')
    expect(b.contractRatePct).toBe(4.79)
    expect(sources.contractRatePct).toBe('default')
    expect(b.defaultPrice).toBe(600000)
    expect(sources.defaultPrice).toBe('default')
    // A silent-file proposal is honestly incomplete — it will not validate for
    // publishing until Michael sets the income.
    expect(validateBaseline(b).ok).toBe(false)
  })
})

// ─── Never says no, and the house copy rules ──────────────────────────────────

describe('the qualification copy never tells a person no', () => {
  const allStrings = () => {
    const bands = Object.values(QUALIFICATION_BANDS).flatMap(band => [band.headline, band.blurb])
    const copy = [
      QUALIFICATION_FOOTER,
      QUALIFICATION_COPY.sectionTitle,
      QUALIFICATION_COPY.sectionIntro,
      QUALIFICATION_COPY.lockedTitle,
      QUALIFICATION_COPY.gdsLabel,
      QUALIFICATION_COPY.tdsLabel,
      QUALIFICATION_COPY.reset,
      QUALIFICATION_COPY.mortgageLabel,
      QUALIFICATION_COPY.insuredNote,
      QUALIFICATION_COPY.minimumDownLead,
      ...Object.values(QUALIFICATION_COPY.controls).flatMap(c => [c.label, c.helper]),
      ...Object.values(QUALIFICATION_COPY.locked),
    ]
    return [...bands, ...copy]
  }

  it('contains none of the never-says-no words, in any band', () => {
    for (const s of allStrings()) {
      const lower = s.toLowerCase()
      for (const banned of QUALIFICATION_NEVER_SAYS_NO) {
        expect(lower.includes(banned.toLowerCase()), `qualification copy tells someone no: ${JSON.stringify(s)} (${banned})`).toBe(false)
      }
      // The shared client never-says-no list too.
      for (const banned of ['declined', 'denied', 'rejected', 'not approved', 'unfortunately', 'qualify for']) {
        expect(lower.includes(banned), `qualification copy tells someone no: ${JSON.stringify(s)} (${banned})`).toBe(false)
      }
    }
  })

  it('follows the house copy rules (no em dash, no exclamation, no semicolon)', () => {
    for (const s of allStrings()) {
      expect(s.includes('—'), `em dash in qualification copy: ${s}`).toBe(false)
      expect(s.includes('!'), `exclamation point in qualification copy: ${s}`).toBe(false)
      expect(s.includes(';'), `semicolon in qualification copy: ${s}`).toBe(false)
    }
  })

  it('uses none of our internal words', () => {
    const BANNED = ['underwriting', 'underwrite', 'packaging', 'evidence', 'zoho', 'finmo', 'broker', 'workbench', 'gate', 'stage', 'pipeline']
    for (const s of allStrings()) {
      for (const word of BANNED) {
        expect(new RegExp(`\\b${word}\\b`, 'i').test(s), `qualification copy uses "${word}": ${s}`).toBe(false)
      }
    }
  })

  it('the four bands are the four the brief names, in order', () => {
    expect(Object.keys(QUALIFICATION_BANDS)).toEqual(['fits', 'options', 'alternatives', 'conversation'])
    expect(QUALIFICATION_BANDS.fits.tone).toBe('green')
    expect(QUALIFICATION_BANDS.options.tone).toBe('amber')
    expect(QUALIFICATION_BANDS.alternatives.tone).toBe('amber')
    expect(QUALIFICATION_BANDS.conversation.tone).toBe('navy')
  })
})
