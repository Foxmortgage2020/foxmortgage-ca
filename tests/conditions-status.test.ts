// Phase B2: the pure conditions-checklist derivations. The pill maps two axes
// (decision status + document presence) onto one displayed chip, and the lime
// token is reserved for needs_input (the only "a human action is queued" pill).

import { describe, expect, it } from 'vitest'
import {
  CLOSING_SOON_DAYS,
  canVerify,
  closingHeaderAmber,
  closingPillAmber,
  conditionCounts,
  conditionStatusPill,
  isCollected,
  type PillTone,
} from '../lib/conditions-status'

describe('conditionStatusPill: all six displayed states', () => {
  it('satisfied is green regardless of presence', () => {
    expect(conditionStatusPill({ status: 'satisfied', presence: 'requested' })).toEqual({
      label: 'satisfied',
      tone: 'green',
    })
  })

  it('waived is gray regardless of presence', () => {
    expect(conditionStatusPill({ status: 'waived', presence: 'obtained' })).toEqual({
      label: 'waived',
      tone: 'gray',
    })
  })

  it('needs_input is lime (human action queued)', () => {
    expect(conditionStatusPill({ status: 'open', presence: 'needs_input' })).toEqual({
      label: 'needs input',
      tone: 'lime',
    })
  })

  it('requested is neutral', () => {
    expect(conditionStatusPill({ status: 'open', presence: 'requested' })).toEqual({
      label: 'requested',
      tone: 'gray',
    })
  })

  it('obtained is amber (presence is not verification)', () => {
    expect(conditionStatusPill({ status: 'open', presence: 'obtained' })).toEqual({
      label: 'obtained · in review',
      tone: 'amber',
    })
  })

  it('verified is green', () => {
    expect(conditionStatusPill({ status: 'open', presence: 'verified' })).toEqual({
      label: 'verified',
      tone: 'green',
    })
  })

  it('a null/unknown presence is neutral pending, never lime', () => {
    expect(conditionStatusPill({ status: 'open', presence: null })).toEqual({
      label: 'pending',
      tone: 'gray',
    })
  })
})

describe('lime is attention currency (only needs_input yields it)', () => {
  it('across every (status, presence) combination, lime appears only on needs_input', () => {
    const statuses = ['open', 'evidence_attached', 'satisfied', 'waived', 'pre_checked']
    const presences: (string | null)[] = ['needs_input', 'requested', 'obtained', 'verified', null]
    for (const status of statuses) {
      for (const presence of presences) {
        const pill = conditionStatusPill({ status, presence })
        const isLime: boolean = pill.tone === ('lime' as PillTone)
        // Lime is only ever produced by a needs_input presence that no terminal
        // human decision has overridden.
        const shouldBeLime = presence === 'needs_input' && status !== 'satisfied' && status !== 'waived'
        expect(isLime).toBe(shouldBeLime)
      }
    }
  })
})

describe('isCollected and canVerify', () => {
  it('collected = obtained/verified presence OR satisfied status', () => {
    expect(isCollected({ status: 'open', presence: 'obtained' })).toBe(true)
    expect(isCollected({ status: 'open', presence: 'verified' })).toBe(true)
    expect(isCollected({ status: 'satisfied', presence: null })).toBe(true)
    expect(isCollected({ status: 'open', presence: 'requested' })).toBe(false)
    expect(isCollected({ status: 'open', presence: 'needs_input' })).toBe(false)
  })

  it('verify is offered on obtained/requested/needs_input, never on terminal rows', () => {
    expect(canVerify({ status: 'open', presence: 'obtained' })).toBe(true)
    expect(canVerify({ status: 'open', presence: 'requested' })).toBe(true)
    expect(canVerify({ status: 'open', presence: 'needs_input' })).toBe(true)
    expect(canVerify({ status: 'open', presence: 'verified' })).toBe(false)
    expect(canVerify({ status: 'satisfied', presence: 'requested' })).toBe(false)
    expect(canVerify({ status: 'waived', presence: 'obtained' })).toBe(false)
  })
})

describe('conditionCounts shape', () => {
  it('total, collected, outstanding per deal; waived removed from outstanding', () => {
    const counts = conditionCounts([
      { dealId: 'd1', status: 'open', presence: 'obtained' }, // collected
      { dealId: 'd1', status: 'open', presence: 'needs_input' }, // outstanding
      { dealId: 'd1', status: 'satisfied', presence: null }, // collected
      { dealId: 'd1', status: 'waived', presence: 'requested' }, // removed
      { dealId: 'd2', status: 'open', presence: 'requested' }, // outstanding
    ])
    expect(counts.d1).toEqual({ total: 4, collected: 2, outstanding: 1 })
    expect(counts.d2).toEqual({ total: 1, collected: 0, outstanding: 1 })
  })

  it('a waived-but-collected row is removed exactly once (no double subtraction)', () => {
    const counts = conditionCounts([
      { dealId: 'd1', status: 'open', presence: 'obtained' }, // collected, done
      { dealId: 'd1', status: 'waived', presence: 'obtained' }, // waived AND collected → done ONCE
      { dealId: 'd1', status: 'open', presence: 'needs_input' }, // outstanding
    ])
    // total 3; done = {obtained, waived-obtained} = 2; outstanding = 1 (NOT 0).
    expect(counts.d1).toEqual({ total: 3, collected: 2, outstanding: 1 })
  })

  it('an empty set yields no deals', () => {
    expect(conditionCounts([])).toEqual({})
  })

  it('outstanding never goes negative', () => {
    const counts = conditionCounts([
      { dealId: 'd1', status: 'waived', presence: null },
      { dealId: 'd1', status: 'satisfied', presence: null },
    ])
    expect(counts.d1.outstanding).toBe(0)
  })
})

describe('closing countdown (amber inside ten days)', () => {
  it('the window is ten days', () => {
    expect(CLOSING_SOON_DAYS).toBe(10)
  })

  it('board pill: amber only when close (0..10) AND outstanding remains', () => {
    expect(closingPillAmber(9, 2)).toBe(true)
    expect(closingPillAmber(10, 1)).toBe(true)
    expect(closingPillAmber(0, 1)).toBe(true) // closes today, work remains
    expect(closingPillAmber(11, 5)).toBe(false) // far enough out
    expect(closingPillAmber(3, 0)).toBe(false) // nothing outstanding
    expect(closingPillAmber(null, 4)).toBe(false) // no closing date
    // A PAST closing (negative days, e.g. a funded deal) is not "closing soon".
    expect(closingPillAmber(-2, 1)).toBe(false)
    expect(closingPillAmber(-30, 5)).toBe(false)
  })

  it('header: proximity alone (0..10), no outstanding gate', () => {
    expect(closingHeaderAmber(10)).toBe(true)
    expect(closingHeaderAmber(0)).toBe(true)
    expect(closingHeaderAmber(11)).toBe(false)
    expect(closingHeaderAmber(null)).toBe(false)
    // Past closing is never amber.
    expect(closingHeaderAmber(-1)).toBe(false)
    expect(closingHeaderAmber(-100)).toBe(false)
  })
})
