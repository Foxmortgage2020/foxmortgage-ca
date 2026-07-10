// Portal engagement recency (Session 7): last sign-in per partner, read
// SERVER-SIDE ONLY through the Clerk backend client with the existing
// CLERK_SECRET_KEY. Nothing here is client-exposed; the pages receive a
// plain map of partnerId to timestamp. Partners link to Clerk users
// through publicMetadata (zoho_partner_id on investors, fp_zoho_id on
// financial planners) with a lowercase email match as the fallback.
// A failed Clerk read degrades honestly: ok:false and the pages render
// "not read", never "no account".

import { clerkClient } from '@clerk/nextjs/server'
import { createCache } from '@/lib/cache'

export interface PartnerEngagement {
  hasAccount: boolean
  lastSignInAt: number | null
}

export interface PartnerEngagementResult {
  ok: boolean
  map: Map<string, PartnerEngagement>
}

interface ClerkUserIndex {
  byMetaId: Map<string, PartnerEngagement>
  byEmail: Map<string, PartnerEngagement>
}

// The cached thing is the partner-agnostic user index, so a detail-page
// call for one partner can never poison the list page's view.
const indexCache = createCache<string, ClerkUserIndex>({ max: 1, ttlMs: 5 * 60 * 1000 })

async function getClerkUserIndex(): Promise<ClerkUserIndex | null> {
  const cached = indexCache.get('all')
  if (cached !== undefined) return cached
  try {
    const res: any = await clerkClient.users.getUserList({ limit: 500 })
    const users: any[] = Array.isArray(res) ? res : (res?.data ?? [])
    const byMetaId = new Map<string, PartnerEngagement>()
    const byEmail = new Map<string, PartnerEngagement>()
    for (const u of users) {
      const engagement: PartnerEngagement = {
        hasAccount: true,
        lastSignInAt: typeof u.lastSignInAt === 'number' ? u.lastSignInAt : null,
      }
      const meta = (u.publicMetadata ?? {}) as Record<string, unknown>
      for (const key of ['zoho_partner_id', 'fp_zoho_id']) {
        const v = meta[key]
        if (typeof v === 'string' && v.length > 0) byMetaId.set(v, engagement)
      }
      for (const e of u.emailAddresses ?? []) {
        const addr = String(e.emailAddress ?? '').toLowerCase()
        if (addr) byEmail.set(addr, engagement)
      }
    }
    const index = { byMetaId, byEmail }
    indexCache.set('all', index)
    return index
  } catch (err) {
    console.error(
      '[partner-engagement] Clerk read failed:',
      err instanceof Error ? err.message.slice(0, 120) : 'error',
    )
    return null
  }
}

export async function getPartnerEngagementMap(
  partners: { id: string; email: string | null }[],
): Promise<PartnerEngagementResult> {
  const index = await getClerkUserIndex()
  const map = new Map<string, PartnerEngagement>()
  if (!index) return { ok: false, map }
  for (const p of partners) {
    const hit =
      index.byMetaId.get(p.id) ?? (p.email ? index.byEmail.get(p.email.toLowerCase()) : undefined)
    if (hit) map.set(p.id, hit)
  }
  return { ok: true, map }
}
