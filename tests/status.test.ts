// Form intake panel light logic (Session 4): unacknowledged zoho_failed
// rows amber the panel; acknowledged-only history stays green; a fresh
// failure always ambers again.

import { describe, expect, it } from 'vitest'
import { formIntakeLight } from '../lib/status'

const base = { configured: true, reachable: true, error: null as string | null }

describe('formIntakeLight', () => {
  it('is off when not configured', () => {
    expect(formIntakeLight({ configured: false, reachable: false, error: null, zohoFailed: null })).toBe('off')
  })

  it('fails when unreachable', () => {
    expect(formIntakeLight({ configured: true, reachable: false, error: 'unreachable', zohoFailed: null })).toBe('fail')
  })

  it('warns when the stats query errored', () => {
    expect(formIntakeLight({ ...base, error: 'stats query failed (HTTP 500)', zohoFailed: null })).toBe('warn')
  })

  it('is green when every failure is acknowledged, even with failure history', () => {
    // zohoFailed counts only unacknowledged rows; total history may be > 0.
    expect(formIntakeLight({ ...base, zohoFailed: 0 })).toBe('ok')
  })

  it('ambers on a fresh unacknowledged failure', () => {
    expect(formIntakeLight({ ...base, zohoFailed: 1 })).toBe('warn')
    expect(formIntakeLight({ ...base, zohoFailed: 7 })).toBe('warn')
  })

  it('warns rather than fakes green when counts are unavailable', () => {
    expect(formIntakeLight({ ...base, zohoFailed: null })).toBe('warn')
  })
})
