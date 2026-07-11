// Offers model tests (the offers desk session): the window classification
// (the null-expiry centerpiece), the priced-shape derivation, and evidence
// normalization.

import { describe, expect, it } from 'vitest'
import {
  classifyWindow,
  daysUntil,
  hasNoExpiry,
  normalizeEvidence,
  offerCashbackLabel,
  offerPricingShape,
  offerRateTypeLabel,
  offerRatesText,
  offerTermsLabel,
} from '@/lib/offers'

describe('classifyWindow — the window, honestly', () => {
  it('flags a null expiry as the loud no-expiry state, never a dash', () => {
    expect(classifyWindow(null, null, null)).toEqual({ kind: 'no-expiry', started: null })
    expect(classifyWindow('2026-07-06', null, null)).toEqual({ kind: 'no-expiry', started: '2026-07-06' })
    expect(hasNoExpiry(null)).toBe(true)
    expect(hasNoExpiry('2026-07-17')).toBe(false)
  })

  it('tones a dated window red inside 5 days, amber inside 14, calm otherwise, and marks expired', () => {
    expect(classifyWindow(null, '2026-07-20', 3)).toMatchObject({ kind: 'dated', tone: 'red', expired: false })
    expect(classifyWindow(null, '2026-07-25', 10)).toMatchObject({ tone: 'amber', expired: false })
    expect(classifyWindow(null, '2026-09-01', 40)).toMatchObject({ tone: 'calm', expired: false })
    expect(classifyWindow(null, '2026-07-01', -2)).toMatchObject({ tone: 'red', expired: true })
  })

  it('daysUntil is calendar-day exact', () => {
    expect(daysUntil('2026-07-11', '2026-07-17')).toBe(6)
    expect(daysUntil('2026-07-11', '2026-07-11')).toBe(0)
    expect(daysUntil('2026-07-11', '2026-07-06')).toBe(-5)
  })
})

describe('offerPricingShape — a clean rate only where one normalized', () => {
  it('returns a shape for a fixed printed rate and a floating discount', () => {
    expect(offerPricingShape({ lenderSlug: 'eq', rate: 4.19, rateType: 'fixed', primeVariance: null })).toMatchObject({
      rateType: 'fixed',
      rate: 4.19,
    })
    expect(offerPricingShape({ lenderSlug: 'mcap', rate: null, rateType: 'adjustable', primeVariance: -0.8 })).toMatchObject({
      rateType: 'adjustable',
      primeVariance: -0.8,
    })
  })

  it('returns null for mixed, absent, or cashback-only priced offers (never forced into a rate)', () => {
    expect(offerPricingShape({ lenderSlug: 'x', rate: null, rateType: 'mixed', primeVariance: null })).toBeNull()
    expect(offerPricingShape({ lenderSlug: 'x', rate: null, rateType: null, primeVariance: null })).toBeNull()
    expect(offerPricingShape({ lenderSlug: 'x', rate: null, rateType: 'fixed', primeVariance: null })).toBeNull()
  })
})

describe('offer field labels', () => {
  it('cash back prefers the percentage, then the verbatim amount text', () => {
    expect(offerCashbackLabel(3, null)).toBe('3% cash back')
    expect(offerCashbackLabel(null, '$2,000 at closing')).toBe('$2,000 at closing')
    expect(offerCashbackLabel(null, null)).toBeNull()
  })

  it('terms render a list or a single term', () => {
    expect(offerTermsLabel(null, [12, 24])).toBe('1yr, 2yr')
    expect(offerTermsLabel(60, null)).toBe('5yr')
    expect(offerTermsLabel(null, null)).toBeNull()
  })

  it('rate type never coerces mixed into one of the three', () => {
    expect(offerRateTypeLabel('mixed')).toBe('Mixed rates')
    expect(offerRateTypeLabel('fixed')).toBe('Fixed')
    expect(offerRateTypeLabel('adjustable')).toBe('Adjustable')
    expect(offerRateTypeLabel(null)).toBeNull()
  })

  it('offerRatesText pulls the extracted priced text as the honest fallback', () => {
    expect(offerRatesText({ rates_or_amounts: { value: 'fixed 4.89% / 5.09%' } })).toBe('fixed 4.89% / 5.09%')
    expect(offerRatesText({ rates_or_amounts: {} })).toBeNull()
    expect(offerRatesText(null)).toBeNull()
  })
})

describe('normalizeEvidence', () => {
  it('normalizes the extracted evidence array and drops non-objects', () => {
    const ev = normalizeEvidence([
      { page: 2, field: 'rate', value: '4.89%', snippet: '4.89%', confidence: 1 },
      'garbage',
      { snippet: 'no page' },
    ])
    expect(ev).toHaveLength(2)
    expect(ev[0]).toEqual({ page: 2, field: 'rate', value: '4.89%', snippet: '4.89%', confidence: 1 })
    expect(ev[1]).toEqual({ page: null, field: 'element', value: '', snippet: 'no page', confidence: null })
    expect(normalizeEvidence(null)).toEqual([])
  })
})
