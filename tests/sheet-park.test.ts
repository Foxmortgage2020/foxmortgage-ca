// Province-excluded sheet parking (the Kootenay loop): a new sheet from a
// lender the registry excludes from every serviceable market never enters
// the actionable queue — it lands on a visible shelf with the registry
// reason, and releases automatically the moment the registry changes,
// because the park is re-derived, never written.

import { describe, expect, it } from 'vitest'
import { partitionSheetQueue, provinceParkVerdict, SERVICEABLE_PROVINCES } from '@/lib/sheet-park'
import type { ProvinceFact } from '@/lib/eligibility'

describe('provinceParkVerdict', () => {
  it('parks a lender the registry confirms cannot lend in any serviceable market', () => {
    // Kootenay is BC-only in the mirror (the proving loop: every fresh
    // Kootenay sheet refilled the queue with quotes Michael can only reject).
    const v = provinceParkVerdict('kootenay')
    expect(SERVICEABLE_PROVINCES).toContain('ON')
    expect(v.parked).toBe(true)
    expect(v.reason).toContain('BC')
    expect(v.reason).toContain('ON')
    expect(v.asOf).toBeTruthy()
  })

  it('never parks on unknown or national availability, or a null lender', () => {
    // Parking hides work from the queue, so it takes affirmative registry
    // evidence: an unconfirmed lender stays decidable.
    expect(provinceParkVerdict('mcap').parked).toBe(false) // unknown in the mirror
    expect(provinceParkVerdict('some-new-lender').parked).toBe(false)
    expect(provinceParkVerdict(null).parked).toBe(false)
  })

  it('releases automatically when a live registry confirms a serviceable province', () => {
    const live = new Map<string, ProvinceFact>([
      ['kootenay', { provinces: ['BC', 'ON'], source: 'registry (test)', asOf: '2026-08-01' }],
    ])
    expect(provinceParkVerdict('kootenay', live).parked).toBe(false)
  })
})

describe('partitionSheetQueue', () => {
  it('parks province-excluded sheets with the reason and leaves the queue for the rest', () => {
    const cards = [
      { intelItemId: 'a', lenderSlug: 'kootenay' },
      { intelItemId: 'b', lenderSlug: 'duca' },
      { intelItemId: 'c', lenderSlug: null },
    ]
    const { actionable, parked } = partitionSheetQueue(cards)
    expect(actionable.map(c => c.intelItemId)).toEqual(['b', 'c'])
    expect(parked).toHaveLength(1)
    expect(parked[0].card.intelItemId).toBe('a')
    expect(parked[0].reason).toContain('Parked')
    expect(parked[0].asOf).toBeTruthy()
  })
})
