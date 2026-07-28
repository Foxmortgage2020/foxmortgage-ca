// A basic in-process rate limiter for the public booking endpoints.
//
// HONEST ABOUT WHAT IT IS: module state on one serverless instance. A cold start
// resets it, and a request routed to another instance does not see it. This repo
// already writes that rule down (lib/cache.ts: never use in-process state for
// correctness, only for latency), so this limiter is DEFENCE IN DEPTH and nothing
// more. It raises the cost of a naive script. It does not bound a determined one.
//
// THE REAL GUARDS ARE IN THE DATABASE, where they cannot be evaded by hitting a
// different instance:
//   * one active booking per email, per event type, per day (booking_create),
//   * a partial unique index on (agent_id, starts_at) for live rows,
//   * the per-day cap from the event type.
// Plus the honeypot, which costs a bot nothing to trip and everything to notice.
//
// A durable limiter belongs in FOXCA or at the edge and is a deliberate later
// choice, not something to fake here. Session three's hardening pass is where it
// gets decided.

interface Bucket {
  count: number
  resetAtMs: number
}

const buckets = new Map<string, Bucket>()
const MAX_KEYS = 5_000

export interface RateLimitVerdict {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

/**
 * Fixed-window counter. `key` should already be scoped by purpose, for example
 * `confirm:<ip>`, so the slots endpoint and the confirm endpoint do not share a
 * budget.
 */
export function rateLimit(
  key: string,
  opts: { limit: number; windowMs: number; nowMs?: number },
): RateLimitVerdict {
  const now = opts.nowMs ?? Date.now()

  // Cheap eviction: the map is bounded, and an unbounded one on a long-lived
  // instance is a slow leak.
  if (buckets.size > MAX_KEYS) {
    const expired: string[] = []
    buckets.forEach((b, k) => {
      if (b.resetAtMs <= now) expired.push(k)
    })
    for (const k of expired) buckets.delete(k)
    if (buckets.size > MAX_KEYS) buckets.clear()
  }

  const existing = buckets.get(key)
  if (!existing || existing.resetAtMs <= now) {
    buckets.set(key, { count: 1, resetAtMs: now + opts.windowMs })
    return { allowed: true, remaining: Math.max(0, opts.limit - 1), retryAfterSeconds: 0 }
  }

  existing.count += 1
  if (existing.count > opts.limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAtMs - now) / 1000)),
    }
  }
  return {
    allowed: true,
    remaining: Math.max(0, opts.limit - existing.count),
    retryAfterSeconds: 0,
  }
}

/** Test seam. Never called by application code. */
export function resetRateLimits(): void {
  buckets.clear()
}

/**
 * Best-effort client address from the proxy headers Vercel sets. Only ever used
 * as a rate-limit key, never stored, never logged, never shown.
 */
export function clientKeyFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

export const SLOTS_LIMIT = { limit: 60, windowMs: 60_000 }
export const CONFIRM_LIMIT = { limit: 8, windowMs: 10 * 60_000 }
