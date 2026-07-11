// Demo mode (Session 9) — an admin-only toggle that swaps the command
// center to bundled fictional fixtures with ZERO real reads and ZERO
// writes. Fixtures replace data at the fetcher boundary (see the guards in
// lib/underwriting.ts, lib/zoho-admin.ts, lib/zoho.ts, lib/compliance.ts,
// lib/gates.ts, and the agent chat route); this module owns the single
// predicate every guard calls plus the signed cookie that carries the flag.
//
// Two fences protect it:
//   1. Env fence: demoModeAvailable() reads DEMO_MODE_ENABLED === 'true'.
//      Where the flag is unset the capability is inert — isDemoMode() is
//      always false, the toggle renders disabled, and the route 404s.
//   2. Signed cookie: the fox_demo cookie is HMAC-signed under
//      SESSION_SECRET (the same secret lib/auth.ts derives its keys from),
//      so a user cannot hand-craft a cookie to flip themselves into demo
//      and mask real alerts. Encryption is unnecessary (the payload is a
//      constant, and demo data is synthetic), but the signature is not.
//
// The cookie is a session cookie (no maxAge) so it dies on browser close —
// that is the auto-exit-on-close backstop.

import { cookies } from 'next/headers'
import { createHash, createHmac, timingSafeEqual } from 'crypto'

export const DEMO_COOKIE = 'fox_demo'

// The tenant anchor every workbench fetcher is handed in demo mode. It is
// never used to query anything (the guards short-circuit before any I/O);
// it exists only so the fixtures have a stable id to key on.
export const DEMO_AGENT_ID = 'demo-agent'

// Thrown by any write path that is reached while demo mode is on. Nothing
// should ever hit this in normal use — the UI hides write controls in demo
// — but it is the structural guarantee that a stray write cannot touch a
// real system.
export class DemoWriteBlocked extends Error {
  constructor(op: string) {
    super(`Demo mode is read-only; the operation "${op}" was blocked.`)
    this.name = 'DemoWriteBlocked'
  }
}

export function blockInDemo(op: string): never {
  throw new DemoWriteBlocked(op)
}

// Env fence: the whole capability is inert unless the flag is set. Read at
// call time (never cached) so a deploy that sets the flag lights it up.
export function demoModeAvailable(): boolean {
  return process.env.DEMO_MODE_ENABLED === 'true'
}

// ─── Cookie signing (HMAC over a constant payload) ──────────────────────────

const DEMO_PAYLOAD = 'demo.v1'

function signingKey(): Buffer {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error('SESSION_SECRET is not set. Add it to .env.local and Vercel env vars.')
  }
  return createHash('sha256').update(secret).digest()
}

function signDemoValue(): string {
  const mac = createHmac('sha256', signingKey()).update(DEMO_PAYLOAD).digest()
  return `${Buffer.from(DEMO_PAYLOAD, 'utf8').toString('base64url')}.${mac.toString('base64url')}`
}

function verifyDemoValue(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 2) return false
  let payload: Buffer
  let mac: Buffer
  try {
    payload = Buffer.from(parts[0], 'base64url')
    mac = Buffer.from(parts[1], 'base64url')
  } catch {
    return false
  }
  if (payload.toString('utf8') !== DEMO_PAYLOAD) return false
  const expected = createHmac('sha256', signingKey()).update(DEMO_PAYLOAD).digest()
  if (expected.length !== mac.length) return false
  return timingSafeEqual(expected, mac)
}

// ─── The single predicate every guard calls ─────────────────────────────────
// A plain exported function so tests can vi.mock('@/lib/demo') and force it.
// Returns false unless the env flag is set AND a validly-signed cookie is
// present. Any failure (no secret, no request scope, tampered cookie)
// degrades to false — demo mode never turns on by accident.
export function isDemoMode(): boolean {
  if (!demoModeAvailable()) return false
  try {
    const c = cookies().get(DEMO_COOKIE)
    if (!c) return false
    return verifyDemoValue(c.value)
  } catch {
    return false
  }
}

// ─── Cookie I/O ──────────────────────────────────────────────────────────────

export async function setDemoCookie(): Promise<void> {
  cookies().set(DEMO_COOKIE, signDemoValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // No maxAge — a session cookie so it dies on browser close.
  })
}

export async function clearDemoCookie(): Promise<void> {
  cookies().delete(DEMO_COOKIE)
}
