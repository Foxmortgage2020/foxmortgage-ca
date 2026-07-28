// Booking tokens: the prefill link's signed claims and the reschedule capability.
//
// The load-bearing test in this file is the one that proves the prefill payload
// carries NO personal data. A signed token is readable by anyone holding it, so a
// name or an email inside it is a name or an email in the URL.

import { describe, it, expect } from 'vitest'
import {
  hashToken,
  isRescheduleTokenShape,
  mintRescheduleToken,
  signPrefillToken,
  verifyPrefillToken,
} from '@/lib/booking/tokens'

const SECRET = 'test-secret-not-a-real-one'
const NOW = Date.parse('2026-07-27T12:00:00Z')

const CLAIMS = {
  zohoContactId: '7112178000001403205',
  dealId: 'wb-deal-1',
  touchId: 'touch-9',
}

describe('the prefill token', () => {
  it('round trips its claims', () => {
    const token = signPrefillToken(CLAIMS, SECRET, { nowMs: NOW })
    const out = verifyPrefillToken(token, SECRET, NOW)
    expect(out).toEqual({ ok: true, claims: CLAIMS })
  })

  it('carries nulls for claims that were not supplied', () => {
    const token = signPrefillToken(
      { zohoContactId: 'c1', dealId: null, touchId: null },
      SECRET,
      { nowMs: NOW },
    )
    const out = verifyPrefillToken(token, SECRET, NOW)
    expect(out.ok && out.claims).toEqual({ zohoContactId: 'c1', dealId: null, touchId: null })
  })

  it('puts NO personal data in the payload, only record ids and an expiry', () => {
    // The payload is base64, not encrypted. Anyone holding the link can read it.
    // The only keys allowed are the version, the three ids, and the expiry.
    const token = signPrefillToken(CLAIMS, SECRET, { nowMs: NOW })
    const body = token.slice(0, token.indexOf('.'))
    const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    const payload = JSON.parse(json) as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['d', 'e', 't', 'v', 'z'].sort())
    for (const banned of ['@', 'name', 'email', 'phone']) {
      expect(json.toLowerCase()).not.toContain(banned)
    }
  })

  it('refuses a tampered payload', () => {
    const token = signPrefillToken(CLAIMS, SECRET, { nowMs: NOW })
    const forged = signPrefillToken({ ...CLAIMS, dealId: 'someone-elses-deal' }, 'other-secret', {
      nowMs: NOW,
    })
    const spliced = `${forged.slice(0, forged.indexOf('.'))}.${token.slice(token.indexOf('.') + 1)}`
    expect(verifyPrefillToken(spliced, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('refuses a token signed with a different secret', () => {
    const token = signPrefillToken(CLAIMS, 'a-different-secret', { nowMs: NOW })
    expect(verifyPrefillToken(token, SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })

  it('refuses an expired token', () => {
    const token = signPrefillToken(CLAIMS, SECRET, { nowMs: NOW, ttlDays: 1 })
    const later = NOW + 2 * 86_400_000
    expect(verifyPrefillToken(token, SECRET, later)).toEqual({ ok: false, reason: 'expired' })
  })

  it('accepts a token right up to its expiry', () => {
    const token = signPrefillToken(CLAIMS, SECRET, { nowMs: NOW, ttlDays: 1 })
    const justBefore = NOW + 86_400_000 - 1000
    expect(verifyPrefillToken(token, SECRET, justBefore).ok).toBe(true)
  })

  it('refuses malformed input without throwing', () => {
    for (const bad of ['', 'no-dot-here', '.', 'abc.', '.abc', 'x'.repeat(4000)]) {
      const out = verifyPrefillToken(bad, SECRET, NOW)
      expect(out.ok).toBe(false)
    }
  })

  it('refuses a signature of the wrong length without a timing crash (regression)', () => {
    // timingSafeEqual throws when the buffers differ in length. The length check
    // has to come first or a one character signature crashes the route.
    expect(verifyPrefillToken('body.x', SECRET, NOW)).toEqual({ ok: false, reason: 'bad_signature' })
  })
})

describe('the reschedule token', () => {
  it('mints 64 hex characters and is dot free', () => {
    const token = mintRescheduleToken()
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    expect(token).not.toContain('.')
  })

  it('mints a different token every time', () => {
    const seen = new Set(Array.from({ length: 50 }, () => mintRescheduleToken()))
    expect(seen.size).toBe(50)
  })

  it('hashes to a stable sha256 hex that is not the token', () => {
    const token = mintRescheduleToken()
    const hash = hashToken(token)
    expect(hash).toMatch(/^[a-f0-9]{64}$/)
    expect(hash).not.toBe(token)
    expect(hashToken(token)).toBe(hash)
  })

  it('gates the shape', () => {
    expect(isRescheduleTokenShape(mintRescheduleToken())).toBe(true)
    expect(isRescheduleTokenShape('short')).toBe(false)
    expect(isRescheduleTokenShape('A'.repeat(64))).toBe(false) // uppercase is not the shape
    expect(isRescheduleTokenShape(null)).toBe(false)
  })
})
