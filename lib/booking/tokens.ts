// Two token families for the booking engine, in one place.
//
// 1. THE PREFILL TOKEN — identifies a known client on a booking link the renewal
//    drip or a client email sends them.
//
//    IT CARRIES RECORD IDS ONLY. No name, no email, no phone, no file reference.
//    This matters and is easy to get wrong: an HMAC-signed token is SIGNED, not
//    ENCRYPTED. Its payload is base64, which anyone can read. Putting a client's
//    email in it would put their email in the URL — in their browser history, in
//    any referrer header, in server logs, in a forwarded link — which is exactly
//    what "personal data never rides a URL" forbids. Opaque record ids are the
//    house-sanctioned thing to put in a URL (the PII rule names them explicitly).
//
//    Contact details are therefore NOT prefilled in session one. Session two,
//    which adds the Zoho linkage, looks the ids up server-side and prefills from
//    that. The person still types their number once here, which is a smaller cost
//    than leaking it.
//
// 2. THE RESCHEDULE TOKEN — the capability that lets someone change or cancel
//    their own booking without an account. Minted once at booking time, returned
//    to the caller once, and stored ONLY as a sha256 hash, exactly as
//    lib/client-links.ts does. A database reader cannot use what they read.
//
// PURE CORE, thin env wrapper: every function takes its secret as an argument so
// it is testable without stubbing env, and `prefillSecret()` is the one place the
// env is read.

import { createHmac, createHash, randomBytes, timingSafeEqual } from 'crypto'
import type { PrefillClaims } from '@/lib/booking/types'

// ─── Encoding ────────────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromB64url(value: string): Buffer {
  const pad = value.length % 4 === 0 ? '' : '='.repeat(4 - (value.length % 4))
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/') + pad, 'base64')
}

// ─── The prefill token ───────────────────────────────────────────────────────

const PREFILL_VERSION = 1

/** The signing secret. Reuses SESSION_SECRET, which is already set in every
 *  target — no new environment variable, which this session is not allowed to
 *  provision. Throws when unset so a misconfigured deploy fails loud rather than
 *  signing with an empty key. */
export function prefillSecret(): string {
  const s = process.env.SESSION_SECRET
  if (!s) {
    throw new Error('SESSION_SECRET is not set. Booking prefill links cannot be signed.')
  }
  return s
}

interface PrefillPayload {
  v: number
  z?: string
  d?: string
  t?: string
  e: number // expiry, epoch seconds
}

function sign(body: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(body).digest())
}

/**
 * Mint a prefill token. `ttlDays` defaults to 120, comfortably longer than the
 * renewal drip's 150-day-to-30-day sequence needs for any single touch, and short
 * enough that an old forwarded link stops working.
 */
export function signPrefillToken(
  claims: PrefillClaims,
  secret: string,
  opts: { nowMs: number; ttlDays?: number },
): string {
  const payload: PrefillPayload = {
    v: PREFILL_VERSION,
    e: Math.floor(opts.nowMs / 1000) + Math.round((opts.ttlDays ?? 120) * 86_400),
  }
  if (claims.zohoContactId) payload.z = claims.zohoContactId
  if (claims.dealId) payload.d = claims.dealId
  if (claims.touchId) payload.t = claims.touchId
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${body}.${sign(body, secret)}`
}

export type PrefillVerdict =
  | { ok: true; claims: PrefillClaims }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' | 'bad_version' }

/**
 * Verify and open a prefill token. Every failure mode is distinct in the return
 * value and IDENTICAL to the caller's visitor: an unrecognised token simply means
 * no prefill, never an error page. Signature comparison is constant time.
 */
export function verifyPrefillToken(token: string, secret: string, nowMs: number): PrefillVerdict {
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return { ok: false, reason: 'malformed' }
  }
  const dot = token.indexOf('.')
  if (dot <= 0 || dot === token.length - 1) return { ok: false, reason: 'malformed' }
  const body = token.slice(0, dot)
  const provided = token.slice(dot + 1)

  const expected = sign(body, secret)
  const a = Buffer.from(expected)
  const b = Buffer.from(provided)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }

  let payload: PrefillPayload
  try {
    payload = JSON.parse(fromB64url(body).toString('utf8')) as PrefillPayload
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (payload?.v !== PREFILL_VERSION) return { ok: false, reason: 'bad_version' }
  if (typeof payload.e !== 'number' || payload.e * 1000 <= nowMs) return { ok: false, reason: 'expired' }

  return {
    ok: true,
    claims: {
      zohoContactId: typeof payload.z === 'string' ? payload.z : null,
      dealId: typeof payload.d === 'string' ? payload.d : null,
      touchId: typeof payload.t === 'string' ? payload.t : null,
    },
  }
}

/** Verify with the ambient secret, swallowing a missing secret into "no prefill". */
export function readPrefill(token: string | null | undefined, nowMs: number): PrefillClaims | null {
  if (!token) return null
  let secret: string
  try {
    secret = prefillSecret()
  } catch {
    return null
  }
  const verdict = verifyPrefillToken(token, secret, nowMs)
  return verdict.ok ? verdict.claims : null
}

// ─── The reschedule token ────────────────────────────────────────────────────

/** 256 bits of randomness, hex. Dot-free by construction, so a URL carrying it in
 *  a PATH segment still passes through Clerk middleware (the matcher skips any
 *  path whose last segment contains a dot). */
export function mintRescheduleToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Shape gate for a reschedule token, used before any lookup. */
export function isRescheduleTokenShape(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}
