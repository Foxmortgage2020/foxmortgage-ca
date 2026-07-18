// Client comms — the pure model (B7-P). Labels, grouping, the catch-up
// staleness signal, and the fail-closed settings read (Task 4).

import { describe, it, expect } from 'vitest'
import {
  COMMS_TOUCH_KINDS,
  COMMS_KIND_LABEL,
  isCommsTouchKind,
  commsTouchLabel,
  deriveCommsSettings,
  daysSinceYMD,
  isCatchUpTouch,
  groupCommsByDeal,
  COMMS_STALE_DAYS,
  type GroupableTouch,
} from '@/lib/comms'

describe('comms touch labels', () => {
  it('names every touch family', () => {
    expect(COMMS_TOUCH_KINDS).toEqual(['stage_update', 'app_chase', 'doc_chase', 'review_ask'])
    expect(COMMS_KIND_LABEL.stage_update).toBe('Stage update')
    expect(COMMS_KIND_LABEL.review_ask).toBe('Review request')
    expect(isCommsTouchKind('doc_chase')).toBe(true)
    expect(isCommsTouchKind('renewal')).toBe(false)
  })

  it('renders a human label per skeleton', () => {
    expect(commsTouchLabel('stage-funded')).toBe('Stage update · funded')
    expect(commsTouchLabel('stage-submitted_to_lender')).toBe('Stage update · submitted to the lender')
    expect(commsTouchLabel('app-chase-d5')).toBe('Application nudge · day 5')
    expect(commsTouchLabel('doc-chase-2')).toBe('Document chase · 2 of 3')
    expect(commsTouchLabel('review-ask')).toBe('Review request')
    // An unknown skeleton falls back to itself, never a crash.
    expect(commsTouchLabel('stage-mystery')).toBe('Stage update')
    expect(commsTouchLabel('nonsense')).toBe('nonsense')
  })
})

describe('deriveCommsSettings — fail closed (Task 4)', () => {
  it('an ABSENT settings row reads as OFF: no send is possible with the table empty', () => {
    // The load-bearing invariant. The live renewal_settings table is EMPTY, so
    // the kill switch is off by ABSENCE. The portal must never present the
    // engine as enabled without an explicit comms_enabled = true row.
    for (const row of [null, undefined]) {
      const s = deriveCommsSettings(row)
      expect(s.commsEnabled).toBe(false)
      expect(s.hasSettingsRow).toBe(false)
      expect(s.mailingAddress).toBeNull()
    }
  })

  it('only a literal comms_enabled=true enables; every other value is OFF', () => {
    expect(deriveCommsSettings({ comms_enabled: true }).commsEnabled).toBe(true)
    expect(deriveCommsSettings({ comms_enabled: false }).commsEnabled).toBe(false)
    // A row that exists but never set comms_enabled is still dark.
    expect(deriveCommsSettings({}).commsEnabled).toBe(false)
    expect(deriveCommsSettings({}).hasSettingsRow).toBe(true)
    // Truthy-but-not-true values (a legacy string, a 1) never enable.
    expect(deriveCommsSettings({ comms_enabled: 1 as unknown as boolean }).commsEnabled).toBe(false)
  })

  it('carries the address and caps with sane defaults', () => {
    const s = deriveCommsSettings({
      comms_enabled: true,
      comms_mailing_address: '1 Main St',
      comms_max_per_client_per_day: 2,
      comms_max_per_client_per_week: 5,
    })
    expect(s.mailingAddress).toBe('1 Main St')
    expect(s.maxPerDay).toBe(2)
    expect(s.maxPerWeek).toBe(5)
    // A blank address is null, not the empty string.
    expect(deriveCommsSettings({ comms_mailing_address: '   ' }).mailingAddress).toBeNull()
    // Absent caps default to 1/day, 3/week.
    expect(deriveCommsSettings({}).maxPerDay).toBe(1)
    expect(deriveCommsSettings({}).maxPerWeek).toBe(3)
  })
})

describe('catch-up staleness', () => {
  it('measures whole days between YMD strings', () => {
    expect(daysSinceYMD('2026-07-18', '2026-07-18')).toBe(0)
    expect(daysSinceYMD('2026-07-11', '2026-07-18')).toBe(7)
    expect(daysSinceYMD('2026-07-20', '2026-07-18')).toBe(-2)
    expect(daysSinceYMD(null, '2026-07-18')).toBeNull()
  })

  it('flags a touch scheduled COMMS_STALE_DAYS or more in the past', () => {
    const today = '2026-07-18'
    expect(isCatchUpTouch('2026-07-17', today)).toBe(false)
    expect(isCatchUpTouch(`2026-07-11`, today)).toBe(true) // exactly 7 days
    expect(isCatchUpTouch('2026-06-18', today)).toBe(true) // a month ago
    expect(isCatchUpTouch('2026-07-25', today)).toBe(false) // in the future
    expect(COMMS_STALE_DAYS).toBe(7)
  })
})

describe('groupCommsByDeal', () => {
  const t = (over: Partial<GroupableTouch>): GroupableTouch => ({
    zohoDealId: 'd1', clientName: 'Sofia Ricci', firstName: 'Sofia', fileRef: null,
    touchKind: 'stage_update', skeletonId: 'stage-funded', scheduledFor: '2026-07-17', ...over,
  })

  it('groups by deal, orders touches by kind, and deals by earliest scheduled', () => {
    const items = [
      t({ zohoDealId: 'd2', clientName: 'Jordan Wells', touchKind: 'doc_chase', skeletonId: 'doc-chase-1', scheduledFor: '2026-07-10' }),
      t({ zohoDealId: 'd1', touchKind: 'doc_chase', skeletonId: 'doc-chase-2', scheduledFor: '2026-07-15' }),
      t({ zohoDealId: 'd1', touchKind: 'stage_update', skeletonId: 'stage-funded', scheduledFor: '2026-07-17' }),
    ]
    const groups = groupCommsByDeal(items)
    expect(groups.map((g) => g.zohoDealId)).toEqual(['d2', 'd1']) // d2 earliest (07-10)
    const d1 = groups.find((g) => g.zohoDealId === 'd1')!
    // Within d1: stage_update (kind 0) before doc_chase (kind 2).
    expect(d1.touches.map((x) => x.skeletonId)).toEqual(['stage-funded', 'doc-chase-2'])
    expect(d1.clientName).toBe('Sofia Ricci')
  })

  it('falls back to the first name when the full name is absent', () => {
    const groups = groupCommsByDeal([t({ clientName: null, firstName: 'Sofia' })])
    expect(groups[0]!.clientName).toBe('Sofia')
  })
})
