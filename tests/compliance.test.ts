// Compliance logic tests (Session 6): the credential expiry thresholds
// that feed the home attention rail (60 days amber, 14 days red, past
// due red, no date no alarm) and the per-file posture rule computed only
// from recorded signals.

import { describe, expect, it } from 'vitest'
import {
  CREDENTIAL_AMBER_DAYS,
  CREDENTIAL_RED_DAYS,
  compliancePosture,
  credentialTone,
  daysUntil,
  isComplianceCategory,
} from '@/lib/compliance-logic'

const TODAY = '2026-07-10'

describe('daysUntil', () => {
  it('counts whole days across month and year boundaries', () => {
    expect(daysUntil('2026-07-10', TODAY)).toBe(0)
    expect(daysUntil('2026-07-24', TODAY)).toBe(14)
    expect(daysUntil('2026-09-08', TODAY)).toBe(60)
    expect(daysUntil('2027-01-01', TODAY)).toBe(175)
    expect(daysUntil('2026-07-01', TODAY)).toBe(-9)
  })
})

describe('credential expiry thresholds (acceptance 7)', () => {
  it('goes amber inside 60 days and red inside 14', () => {
    expect(credentialTone('2026-09-09', TODAY)).toBe('ok') // 61 days
    expect(credentialTone('2026-09-08', TODAY)).toBe('amber') // 60 days exactly
    expect(credentialTone('2026-07-25', TODAY)).toBe('amber') // 15 days
    expect(credentialTone('2026-07-24', TODAY)).toBe('red') // 14 days exactly
    expect(credentialTone('2026-07-10', TODAY)).toBe('red') // today
  })

  it('past due stays red; it never falls out of the rail', () => {
    expect(credentialTone('2026-07-01', TODAY)).toBe('red')
    expect(credentialTone('2025-03-31', TODAY)).toBe('red')
  })

  it('no recorded date means no alarm and an explicit confirm state', () => {
    expect(credentialTone(null, TODAY)).toBe('no-date')
  })

  it('threshold constants match the brief', () => {
    expect(CREDENTIAL_AMBER_DAYS).toBe(60)
    expect(CREDENTIAL_RED_DAYS).toBe(14)
  })
})

describe('per-file posture (acceptance 6): computed only from recorded data', () => {
  it('attention when an open compliance_gap flag exists', () => {
    expect(
      compliancePosture({ openComplianceFlags: 1, overdueComplianceConditions: 0, hasAnyRecorded: true }),
    ).toBe('attention')
  })

  it('attention when a compliance-bearing condition is overdue', () => {
    expect(
      compliancePosture({ openComplianceFlags: 0, overdueComplianceConditions: 2, hasAnyRecorded: true }),
    ).toBe('attention')
  })

  it('clear only when signals are quiet AND the file has recorded rows to judge from', () => {
    expect(
      compliancePosture({ openComplianceFlags: 0, overdueComplianceConditions: 0, hasAnyRecorded: true }),
    ).toBe('clear')
  })

  it('an empty file can never claim clear: gaps unrecorded instead', () => {
    expect(
      compliancePosture({ openComplianceFlags: 0, overdueComplianceConditions: 0, hasAnyRecorded: false }),
    ).toBe('gaps-unrecorded')
  })
})

describe('compliance-bearing condition categories', () => {
  it('matches the stored vocabulary pair and nothing else', () => {
    expect(isComplianceCategory('solicitor')).toBe(true)
    expect(isComplianceCategory('borrower_execution')).toBe(true)
    expect(isComplianceCategory('general_verification')).toBe(false)
    expect(isComplianceCategory('broker_deliverable')).toBe(false)
    expect(isComplianceCategory(null)).toBe(false)
  })
})
