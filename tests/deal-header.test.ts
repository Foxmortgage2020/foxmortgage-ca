// The deal-room header value stat (B6.2 Task 4): a refinance never shows a
// purchase price, even when the deals row carries a stale one (the live F053107
// defect). Shape resolves with the Finmo goal winning.

import { describe, it, expect } from 'vitest'
import { resolveShape, headerValue } from '@/lib/deal-goal'

describe('resolveShape — the Finmo goal wins when known', () => {
  it('F053107: record says refi, Finmo goal refinance -> refinance', () => {
    expect(resolveShape('refi', 'refinance')).toBe('refinance')
  })
  it('a stale purchase record with a refinance goal resolves to refinance (goal wins)', () => {
    expect(resolveShape('purchase', 'refinance')).toBe('refinance')
  })
  it('falls back to the record type when the Finmo goal is unknown/absent', () => {
    expect(resolveShape('purchase', null)).toBe('purchase')
    expect(resolveShape('renewal', '')).toBe('renewal')
  })
  it('both unknown -> other', () => {
    expect(resolveShape(null, null)).toBe('other')
  })
})

describe('headerValue — shape-aware, never a stale purchase price on a non-purchase', () => {
  it('purchase shows the purchase price', () => {
    expect(headerValue('purchase', 800000, null)).toEqual({ label: 'Purchase price', amount: 800000 })
  })
  it('purchase with no price shows nothing (not a wrong figure)', () => {
    expect(headerValue('purchase', null, 1046923)).toBeNull()
  })
  it('F053107: a refinance shows the estimated value from the fresh application, NOT the stale purchase price', () => {
    // The deals row carries a stale purchase_price of 1,100,000; the snapshot
    // worth is 1,046,923. The header must show the estimated value.
    expect(headerValue('refinance', 1100000, 1046923)).toEqual({ label: 'Estimated value', amount: 1046923 })
  })
  it('a refinance with NO fresh estimated value shows nothing — never the stale purchase price', () => {
    expect(headerValue('refinance', 1100000, null)).toBeNull()
  })
  it('a renewal behaves like a refinance (estimated value only)', () => {
    expect(headerValue('renewal', 500000, 720000)).toEqual({ label: 'Estimated value', amount: 720000 })
  })
  it('an unknown/other shape never leaks a purchase price', () => {
    expect(headerValue('other', 900000, null)).toBeNull()
    expect(headerValue('other', 900000, 850000)).toEqual({ label: 'Estimated value', amount: 850000 })
  })
})
