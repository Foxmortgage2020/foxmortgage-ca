// Rate limiting for the public booking endpoints.
//
// SESSION THREE DECIDED THE OPEN QUESTION session one left here, and the answer
// is: SLIDING WINDOWS, TWO KEYS, STILL IN PROCESS. The reasoning, written down so
// a later session does not have to guess.
//
// WHAT CHANGED. Fixed windows became sliding ones. A fixed window is trivially
// beaten by a script that waits for the boundary and fires 2x the limit across
// it; a sliding log has no boundary to aim at. Every surface now carries TWO
// tiers — a burst window measured in seconds and a sustained window measured in
// minutes or hours — because one number cannot be both generous to a person who
// reloads twice and hostile to a script that never stops. And confirm now limits
// PER EMAIL as well as per IP, so rotating addresses through a proxy pool no
// longer buys a clean budget for every request.
//
// WHAT DID NOT CHANGE, and why it is still honest: this is module state on one
// serverless instance. A cold start resets it, and a request routed elsewhere
// does not see it. It is DEFENCE IN DEPTH. It raises the cost of a naive script
// and bounds the resource burn of a loud one. It does not bound a determined
// distributed one.
//
// WHY NOT A DURABLE LIMITER, stated as a decision rather than an omission: the
// damage a limiter would prevent is already prevented in the database, where it
// cannot be evaded by hitting another instance —
//   * one active booking per email, per event type, per day (booking_create),
//   * a partial unique index on (agent_id, starts_at) for live rows,
//   * the per-day cap from the event type.
// Plus the honeypot, which costs a bot nothing to trip and everything to notice.
// A durable limiter would add a FOXCA round trip to the front of every slots
// request — the hot path, on the public page — to protect against a class of
// attacker who is already stopped one layer down. That is a real latency cost
// for no real gain. If booking ever moves to the edge, the limiter goes with it.
//
// NOTHING HERE IS STORED. A refusal happens before any write, and the keys are
// held in memory only: the IP is never logged or persisted, and the email is
// keyed by SHA-256 so a heap dump holds no addresses.

import { createHash } from 'crypto'

export interface Window {
  limit: number
  windowMs: number
}

/** Timestamps of allowed hits, oldest first. Bounded by the widest window. */
const hits = new Map<string, number[]>()
const MAX_KEYS = 5_000

export interface RateLimitVerdict {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

const ALLOWED: RateLimitVerdict = { allowed: true, remaining: 0, retryAfterSeconds: 0 }

function sweep(nowMs: number, widestWindowMs: number): void {
  if (hits.size <= MAX_KEYS) return
  const cutoff = nowMs - widestWindowMs
  const dead: string[] = []
  hits.forEach((stamps, key) => {
    if (stamps.length === 0 || stamps[stamps.length - 1] <= cutoff) dead.push(key)
  })
  for (const key of dead) hits.delete(key)
  // Still over after evicting everything idle: drop the lot rather than leak.
  // Losing counters costs a moment of leniency; leaking costs the instance.
  if (hits.size > MAX_KEYS) hits.clear()
}

/**
 * Sliding-window check across one or more tiers on the same key.
 *
 * REFUSED ATTEMPTS ARE NOT RECORDED. Counting them would make every window
 * self-extending, so a person who trips a tier once would be held out for the
 * whole window no matter how long they waited quietly, and Retry-After would be
 * a lie. The tiers are generous enough that refusing to count costs nothing.
 *
 * The check is ALL-OR-NOTHING: if any tier is full, nothing is recorded, so a
 * refusal on the burst tier does not silently spend the sustained budget.
 */
export function rateLimit(
  key: string,
  tiers: Window | Window[],
  opts?: { nowMs?: number },
): RateLimitVerdict {
  const list = Array.isArray(tiers) ? tiers : [tiers]
  if (list.length === 0) return ALLOWED
  const now = opts?.nowMs ?? Date.now()
  const widest = Math.max(...list.map(t => t.windowMs))

  sweep(now, widest)

  const stamps = hits.get(key) ?? []
  // Drop anything outside the widest window. Every tier reads this one array.
  const cutoff = now - widest
  let first = 0
  while (first < stamps.length && stamps[first] <= cutoff) first += 1
  const live = first === 0 ? stamps : stamps.slice(first)

  let worst: RateLimitVerdict | null = null
  let tightestRemaining = Number.POSITIVE_INFINITY

  for (const tier of list) {
    const tierCutoff = now - tier.windowMs
    // `live` is ascending, so counting from the back stops early in the common
    // case where almost nothing is in the short window.
    let count = 0
    let oldestInTier = now
    for (let i = live.length - 1; i >= 0; i -= 1) {
      if (live[i] <= tierCutoff) break
      count += 1
      oldestInTier = live[i]
    }
    if (count >= tier.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((oldestInTier + tier.windowMs - now) / 1000))
      if (!worst || retryAfterSeconds > worst.retryAfterSeconds) {
        worst = { allowed: false, remaining: 0, retryAfterSeconds }
      }
    } else {
      tightestRemaining = Math.min(tightestRemaining, tier.limit - count - 1)
    }
  }

  if (worst) {
    // Keep the pruned array so a long-idle key does not hold old timestamps.
    if (live !== stamps) hits.set(key, live)
    return worst
  }

  live.push(now)
  hits.set(key, live)
  return {
    allowed: true,
    remaining: Number.isFinite(tightestRemaining) ? Math.max(0, tightestRemaining) : 0,
    retryAfterSeconds: 0,
  }
}

/** Test seam. Never called by application code. */
export function resetRateLimits(): void {
  hits.clear()
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

/**
 * A stable key for an email address that is not the email address. Lowercased
 * and trimmed first so one person cannot buy a fresh budget with a capital
 * letter.
 */
export function emailKeyFrom(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

// ─── The tiers ───────────────────────────────────────────────────────────────
//
// Sized against what a person actually does. Loading the booking page is ONE
// slots call. Picking a different day is zero more (the window is fetched once).
// A stale-slot refusal returns a fresh list in the same response, so even the
// race path does not spend a second call. Booking is ONE confirm.
//
// So the burst tiers below sit roughly an order of magnitude above a person
// having a bad connection and reloading, and the sustained tiers make a slow
// grinder no cheaper than a fast one.

/** Slots is a read. Generous, because reloading is the normal human response
 *  to a page that looks stuck. */
export const SLOTS_LIMIT: Window[] = [
  { limit: 12, windowMs: 10_000 }, // burst: a dozen reloads in ten seconds
  { limit: 90, windowMs: 10 * 60_000 }, // sustained
]

/** Confirm is the write, keyed by IP. */
export const CONFIRM_IP_LIMIT: Window[] = [
  { limit: 4, windowMs: 60_000 }, // burst
  { limit: 12, windowMs: 60 * 60_000 }, // sustained
]

/**
 * Confirm keyed by EMAIL, checked after validation so the address is clean.
 * Deliberately tighter than the IP tiers: an address is the thing a person
 * actually has one of, and the database already refuses a second active booking
 * for the same address, event type, and day. This stops the attempts before they
 * reach the database rather than after.
 */
export const CONFIRM_EMAIL_LIMIT: Window[] = [
  { limit: 3, windowMs: 60 * 60_000 },
  { limit: 6, windowMs: 24 * 60 * 60_000 },
]

/**
 * The manage surface (slots, reschedule, cancel) is token-gated already, so the
 * limiter here is about resource burn and token guessing, not about booking
 * volume. Someone genuinely rearranging a call touches this a handful of times.
 */
export const MANAGE_LIMIT: Window[] = [
  { limit: 8, windowMs: 60_000 },
  { limit: 40, windowMs: 60 * 60_000 },
]
