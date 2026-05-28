// Server-side portal authentication + impersonation helpers.
//
// Reads Clerk publicMetadata via currentUser() (NOT auth() — Clerk v5
// sessionClaims do not include publicMetadata) and the custom-crypto
// `fox_impersonation` cookie. Returns the effective Zoho ID to use for
// downstream queries, with admin-impersonation taking priority when active.
//
// Cookie format — single string, four base64url parts joined by '.':
//
//     base64url(iv) . base64url(ciphertext) . base64url(authtag) . base64url(hmac)
//
// - iv          : 12 random bytes, fresh per write (AES-GCM nonce)
// - ciphertext  : AES-256-GCM(plaintext=JSON(ImpersonationContext))
// - authtag     : GCM authentication tag (16 bytes)
// - hmac        : HMAC-SHA256 over (iv || ciphertext || authtag), timing-safe
//                 compared on read. Belt-and-suspenders on top of GCM's
//                 native auth tag — makes tampering unambiguous if anyone
//                 ever swaps cookie parts around.
//
// Both AES key and HMAC key are derived independently from
// SHA-256(SESSION_SECRET). Using the same source twice is fine here —
// they're applied to disjoint operations (GCM is a sealed cipher, HMAC
// signs a separate concatenation).

import { cookies } from 'next/headers'
import { currentUser } from '@clerk/nextjs/server'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'crypto'

// ─── Types ─────────────────────────────────────────────────────────────────

export type ImpersonationContext = {
  role: 'fp' | 'investor' | 'realtor' | 'lawyer'
  partnerId: string
  partnerName: string
  partnerFirm?: string
}

export type PortalContext = {
  actor: {
    userId: string
    email: string
    roles: string[]
  }
  impersonation: ImpersonationContext | null
  // The effective ID to use when querying Zoho:
  //   - If impersonating: the impersonated partner's ID
  //   - If not impersonating: the actor's own fp_zoho_id, realtor_zoho_id,
  //     lawyer_zoho_id, or zoho_partner_id (one per role surface)
  //   - null when neither applies
  effectiveFpId: string | null
  effectivePartnerId: string | null
  effectiveRealtorId: string | null
  effectiveLawyerId: string | null
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const IMPERSONATION_COOKIE = 'fox_impersonation'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const AUTHTAG_BYTES = 16

// ─── Internal crypto helpers ───────────────────────────────────────────────

function getKey(): Buffer {
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    throw new Error(
      'SESSION_SECRET is not set. Add it to .env.local and Vercel env vars.',
    )
  }
  // SHA-256 normalizes any-length input to a 32-byte key suitable for
  // aes-256-gcm. The HMAC step uses the same 32-byte key — see file
  // header for why that's safe.
  return createHash('sha256').update(secret).digest()
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}

function b64urlDecode(s: string): Buffer {
  return Buffer.from(s, 'base64url')
}

function signAndEncode(data: ImpersonationContext): string {
  const key = getKey()
  const iv = randomBytes(IV_BYTES)

  const cipher = createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(data), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authtag = cipher.getAuthTag()

  const hmac = createHmac('sha256', key)
    .update(iv)
    .update(ciphertext)
    .update(authtag)
    .digest()

  return [
    b64urlEncode(iv),
    b64urlEncode(ciphertext),
    b64urlEncode(authtag),
    b64urlEncode(hmac),
  ].join('.')
}

function verifyAndDecode(cookieValue: string): ImpersonationContext | null {
  const parts = cookieValue.split('.')
  if (parts.length !== 4) return null

  let iv: Buffer
  let ciphertext: Buffer
  let authtag: Buffer
  let hmac: Buffer
  try {
    iv = b64urlDecode(parts[0])
    ciphertext = b64urlDecode(parts[1])
    authtag = b64urlDecode(parts[2])
    hmac = b64urlDecode(parts[3])
  } catch {
    return null
  }

  // Sanity-check buffer sizes before any crypto. Wrong sizes mean
  // tampering or a stale cookie from a different format — bail.
  if (iv.length !== IV_BYTES || authtag.length !== AUTHTAG_BYTES) return null
  if (hmac.length !== 32) return null

  const key = getKey()

  // Step 1: timing-safe HMAC check. Failing here means the cookie was
  // tampered with or signed under a different secret.
  const expected = createHmac('sha256', key)
    .update(iv)
    .update(ciphertext)
    .update(authtag)
    .digest()
  if (expected.length !== hmac.length) return null
  if (!timingSafeEqual(expected, hmac)) return null

  // Step 2: AES-GCM decryption. Failing here means the GCM auth tag
  // didn't validate — also tampering, just caught at a different layer.
  let plaintext: Buffer
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(authtag)
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    return null
  }

  // Step 3: parse + shape-validate.
  let parsed: unknown
  try {
    parsed = JSON.parse(plaintext.toString('utf8'))
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const p = parsed as Record<string, unknown>
  if (
    p.role !== 'fp' &&
    p.role !== 'investor' &&
    p.role !== 'realtor' &&
    p.role !== 'lawyer'
  ) {
    return null
  }
  if (typeof p.partnerId !== 'string' || p.partnerId.length === 0) return null
  if (typeof p.partnerName !== 'string' || p.partnerName.length === 0) return null
  const partnerFirm =
    typeof p.partnerFirm === 'string' && p.partnerFirm.length > 0
      ? p.partnerFirm
      : undefined

  return {
    role: p.role,
    partnerId: p.partnerId,
    partnerName: p.partnerName,
    partnerFirm,
  }
}

// ─── Cookie I/O ────────────────────────────────────────────────────────────

export async function setImpersonationCookie(
  data: ImpersonationContext,
): Promise<void> {
  const value = signAndEncode(data)
  cookies().set(IMPERSONATION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // No maxAge — cookie expires when the browser closes.
  })
}

export async function clearImpersonationCookie(): Promise<void> {
  cookies().delete(IMPERSONATION_COOKIE)
}

export async function readImpersonationCookie(): Promise<ImpersonationContext | null> {
  const cookie = cookies().get(IMPERSONATION_COOKIE)
  if (!cookie) return null
  return verifyAndDecode(cookie.value)
}

// ─── Public API ────────────────────────────────────────────────────────────

export async function getPortalContext(): Promise<PortalContext | null> {
  const user = await currentUser()
  if (!user) return null

  const metadata = (user.publicMetadata ?? {}) as {
    roles?: string[]
    role?: string
    fp_zoho_id?: string
    zoho_partner_id?: string
    realtor_zoho_id?: string
    lawyer_zoho_id?: string
  }
  // Normalize the three role shapes (array, single string in `roles`,
  // legacy `role` field) — same logic the rest of the portal uses.
  const rawRoles = metadata.roles
  const roles: string[] = Array.isArray(rawRoles)
    ? rawRoles
    : typeof rawRoles === 'string'
      ? [rawRoles]
      : metadata.role
        ? [metadata.role]
        : []
  const isAdmin = roles.includes('admin')

  // Read impersonation cookie (always — but only honor it when actor is admin).
  // Tampered / unsigned / wrong-secret cookies return null here and are
  // ignored without error.
  const cookieImpersonation = await readImpersonationCookie()

  // Admin role is required at request time to honor the cookie. Defense in
  // depth: if a non-admin somehow has the cookie, we ignore it.
  const impersonation = isAdmin ? cookieImpersonation : null

  // Resolve effective IDs.
  // FP:       impersonating-as-fp       → cookie.partnerId, else publicMetadata.fp_zoho_id
  // Investor: impersonating-as-investor → cookie.partnerId, else publicMetadata.zoho_partner_id
  // Realtor:  impersonating-as-realtor  → cookie.partnerId, else publicMetadata.realtor_zoho_id
  // Lawyer:   impersonating-as-lawyer   → cookie.partnerId, else publicMetadata.lawyer_zoho_id
  // The four channels are independent — an admin impersonating as fp still
  // has no effectivePartnerId for the investor portal and no
  // effectiveRealtorId / effectiveLawyerId for the realtor / lawyer portals.
  const effectiveFpId =
    impersonation?.role === 'fp'
      ? impersonation.partnerId
      : metadata.fp_zoho_id ?? null

  const effectivePartnerId =
    impersonation?.role === 'investor'
      ? impersonation.partnerId
      : metadata.zoho_partner_id ?? null

  const effectiveRealtorId =
    impersonation?.role === 'realtor'
      ? impersonation.partnerId
      : metadata.realtor_zoho_id ?? null

  const effectiveLawyerId =
    impersonation?.role === 'lawyer'
      ? impersonation.partnerId
      : metadata.lawyer_zoho_id ?? null

  return {
    actor: {
      userId: user.id,
      email: user.emailAddresses[0]?.emailAddress ?? '',
      roles,
    },
    impersonation,
    effectiveFpId,
    effectivePartnerId,
    effectiveRealtorId,
    effectiveLawyerId,
  }
}

export async function isImpersonating(): Promise<boolean> {
  const ctx = await getPortalContext()
  return ctx?.impersonation !== null && ctx?.impersonation !== undefined
}

export async function getImpersonation(): Promise<ImpersonationContext | null> {
  const ctx = await getPortalContext()
  return ctx?.impersonation ?? null
}
