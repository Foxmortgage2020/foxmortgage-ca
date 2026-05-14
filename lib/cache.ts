// In-memory LRU caches for portal data. Module-scoped, so each Next.js
// Node lambda has its own cache; cold starts reset state. That's fine
// for these targets — staleness is bounded by TTL, and the goal is to
// absorb tab-switch / refresh bursts within a single warm instance, not
// to provide a global cache (Redis would be the next step if we need
// that).
//
// Failures are NOT cached: the cache wrappers around each fetcher only
// .set() on the success path. If Zoho fails, the next call re-tries.

import { LRUCache } from 'lru-cache'

export function createCache<K extends {}, V extends {}>(opts: {
  max: number
  ttlMs: number
}) {
  return new LRUCache<K, V>({
    max: opts.max,
    ttl: opts.ttlMs,
  })
}

// Public opportunities feed — same query for every investor, so a single
// shared key. 5-min TTL is well within the time it takes Mike to add a
// new opportunity in Zoho and announce it.
//
// Stored as any[] (raw Zoho record shapes) — callers narrow at the call
// site. The lru-cache v11 type signature requires V extends {}, which
// `unknown` doesn't satisfy; any[] does.
export const opportunitiesCache = createCache<string, any[]>({
  max: 4,
  ttlMs: 5 * 60 * 1000,
})

// FP messages — per-FP key. 2-min TTL absorbs tab-switch reloads but
// stays fresh enough that an FP sending a message from this device sees
// the new note within a few minutes. Explicit invalidation on the
// /api/portal/fp/message POST path is a future improvement.
export const fpMessagesCache = createCache<string, any[]>({
  max: 500,
  ttlMs: 2 * 60 * 1000,
})

// Admin partners list — shared key. 2-min TTL is short enough that any
// new Partner Mike creates in Zoho shows up quickly when he navigates
// to the list page, long enough to absorb tab-switch reloads. Two
// keys: 'all' (the full Partner list) and 'docs:all' (full
// Partner_Documents list used for per-partner doc counts on the table).
export const partnersCache = createCache<string, any[]>({
  max: 4,
  ttlMs: 2 * 60 * 1000,
})

// Document hint cache — read-after-write workaround for Zoho's custom
// module search index, which has 1-5 min latency on freshly-created
// records. After an admin upload we cache the new document id keyed
// by partner id; the next getPartnerDocuments call fetches those ids
// directly (immediate consistency) and merges with the search results
// so the investor sees their upload right away even before search
// indexing catches up.
//
// 5-min TTL covers the typical Zoho indexing window. Capped at 100
// partner-key entries; cap on hint count per partner enforced at the
// helper level.
//
// Caveat: each Vercel Node lambda has its own cache instance. If the
// upload lands on instance A and the next read lands on instance B,
// the hint isn't there and the user sees the previous behavior
// (empty until search catches up). Acceptable for Phase 1; the
// COQL migration noted in commit message gives us global immediate
// consistency.
export const documentHintsCache = createCache<string, string[]>({
  max: 100,
  ttlMs: 5 * 60 * 1000,
})

const HINT_KEY = (partnerId: string) => `hints:${partnerId}`
// Per-partner cap. Twenty consecutive uploads within five minutes for
// one investor is already implausible; the cap is a safety belt.
const MAX_HINTS_PER_PARTNER = 20

/**
 * Record a freshly-created document id against a partner. Newest entries
 * win when the cap is exceeded (LRU-style, but the underlying store is
 * an LRUCache of arrays — we manage the per-partner order ourselves).
 *
 * Idempotent: re-adding an id that's already in the list moves it to
 * the end rather than duplicating.
 */
export function addDocumentHint(partnerId: string, documentId: string): void {
  const key = HINT_KEY(partnerId)
  const existing = documentHintsCache.get(key) ?? []
  const next = [...existing.filter(id => id !== documentId), documentId]
    .slice(-MAX_HINTS_PER_PARTNER)
  documentHintsCache.set(key, next)
}

/**
 * Returns the recent-upload hints for this partner, or [] if none.
 * Never null.
 */
export function getDocumentHints(partnerId: string): string[] {
  return documentHintsCache.get(HINT_KEY(partnerId)) ?? []
}

/**
 * Remove ids from the hint cache for this partner — used by the read
 * path once those ids start appearing in the search results, so stale
 * hints don't accumulate.
 */
export function pruneDocumentHints(partnerId: string, idsToRemove: string[]): void {
  if (idsToRemove.length === 0) return
  const key = HINT_KEY(partnerId)
  const existing = documentHintsCache.get(key) ?? []
  const removeSet = new Set(idsToRemove)
  const next = existing.filter(id => !removeSet.has(id))
  if (next.length === 0) {
    documentHintsCache.delete(key)
  } else {
    documentHintsCache.set(key, next)
  }
}

// Magic-link token → partner id cache. Same read-after-write pattern as
// documentHintsCache: Zoho's search-by-criteria has 1-5 min indexing
// latency, so a newly-issued magic link wouldn't resolve via
// /Partners/search?criteria=(Magic_Link_Token:...) for several minutes
// after creation. Investors can click the email immediately.
//
// Populated on send-link write; consulted by the magic-link route's
// findPartnerByMagicLinkToken lookup; falls through to search if no
// hint is present. TTL matches the magic-link lifetime (14 days) so
// stale hints don't linger after the token expires. Caveat: same
// per-lambda-instance limitation as the document hint cache.
export const magicLinkCache = createCache<string, { partnerId: string }>({
  max: 500,
  ttlMs: 14 * 24 * 60 * 60 * 1000,
})

export function rememberMagicLink(token: string, partnerId: string): void {
  magicLinkCache.set(token, { partnerId })
}

export function forgetMagicLink(token: string): void {
  magicLinkCache.delete(token)
}

export function lookupMagicLink(token: string): string | null {
  return magicLinkCache.get(token)?.partnerId ?? null
}
