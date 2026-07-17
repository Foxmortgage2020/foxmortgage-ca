// Client portal links (B5, 2026-07-17) — the pure half: minting a token,
// hashing it, and deciding whether a link is usable. No I/O, so it tests in
// node. The store half is lib/client-links-store.ts.
//
// WHY NOT REUSE THE MAGIC-LINK MACHINERY: the onboarding links are stored in
// ZOHO, in plaintext, as three fields on the Partners record
// (Magic_Link_Token / _Expires_At / _Used_At). That shape cannot carry a
// client link: it holds ONE token per record (a second link overwrites the
// first), there is no revoked_at (revocation exists only as a side effect of
// overwriting), the TTL is a hardcoded 14 days, and a plaintext token in the
// CRM is a live credential visible to anyone with CRM read or an export.
// What IS worth copying, and is copied here: 32 bytes of crypto randomness
// rendered hex, a strict shape gate before any lookup, and constant-time
// comparison. See docs/client-portal-b5-2026-07-17.md.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/** 90 days, per the brief. Re-issuing is one click; expiry is not a wall. */
export const CLIENT_LINK_TTL_DAYS = 90

/**
 * 32 bytes = 256 bits, hex. Opaque: it carries no payload and means nothing
 * without the stored row, so nothing about the client is guessable from the
 * URL. Hex (not base64url) on purpose — see the shape gate below.
 */
export function mintClientToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * The token is stored HASHED, never raw. A read of the links table (or a
 * database backup, or a support query) must not hand anyone a working key to
 * a client's file. sha256 is right here: the token is already 256 bits of
 * uniform randomness, so there is nothing to brute force and no need for a
 * slow KDF.
 */
export function hashClientToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

/**
 * The shape gate: 64 lowercase hex characters.
 *
 * Cheap rejection before any database call, but it also does something
 * load-bearing — Clerk's middleware matcher excludes any path ending in
 * `.<word>`, so a token containing a dot would route AROUND the middleware
 * entirely. Hex has no dots, so /portal/file/<token> is always seen by the
 * middleware, and the page validates regardless. Never widen this to a
 * charset that includes a dot.
 */
export function isClientTokenShape(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token)
}

/** Constant-time equality for two hashes. Same-length by construction. */
export function hashesMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'))
}

export function clientLinkExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + CLIENT_LINK_TTL_DAYS * 24 * 60 * 60 * 1000)
}

export interface ClientLinkRow {
  id: string
  zohoDealId: string
  fileRef: string | null
  createdAt: string
  expiresAt: string
  revokedAt: string | null
}

export type LinkState = 'usable' | 'expired' | 'revoked'

/**
 * Revoked outranks expired: an explicitly killed link is killed, whatever
 * the clock says.
 *
 * NOTE FOR THE CALLER: this distinction is for MICHAEL's card only. The
 * client-facing route must never render the difference — invalid, expired,
 * revoked, and never-existed all show one identical not-found page, or the
 * page becomes an oracle that confirms which tokens were once real.
 */
export function linkState(link: ClientLinkRow, now: Date = new Date()): LinkState {
  if (link.revokedAt) return 'revoked'
  if (new Date(link.expiresAt).getTime() <= now.getTime()) return 'expired'
  return 'usable'
}

export function isUsable(link: ClientLinkRow, now: Date = new Date()): boolean {
  return linkState(link, now) === 'usable'
}
