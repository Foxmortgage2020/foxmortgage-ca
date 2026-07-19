import { describe, it, expect } from 'vitest'
import { resolveClosingDate } from '@/lib/closing-date'

describe('resolveClosingDate — one closing-date truth (B8b Task 0)', () => {
  it('prefers the workbench date over Zoho (the B8a finding)', () => {
    // F053107 shape: Zoho null, workbench has the real July 28 date.
    expect(resolveClosingDate('2026-07-28', null)).toBe('2026-07-28')
    // And when both are present, the workbench date wins over a stale Zoho one.
    expect(resolveClosingDate('2026-07-28', '2026-01-01')).toBe('2026-07-28')
  })

  it('falls back to the Zoho date only when the workbench has none', () => {
    expect(resolveClosingDate(null, '2026-09-15')).toBe('2026-09-15')
    expect(resolveClosingDate(undefined, '2026-09-15')).toBe('2026-09-15')
  })

  it('returns null when neither source has a real date', () => {
    expect(resolveClosingDate(null, null)).toBeNull()
    expect(resolveClosingDate('', '  ')).toBeNull()
    expect(resolveClosingDate(undefined, undefined)).toBeNull()
  })

  it('treats blank strings as absent, not as a value', () => {
    // A blank workbench value must not shadow a real Zoho date.
    expect(resolveClosingDate('   ', '2026-09-15')).toBe('2026-09-15')
  })
})
