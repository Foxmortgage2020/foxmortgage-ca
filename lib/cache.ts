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
