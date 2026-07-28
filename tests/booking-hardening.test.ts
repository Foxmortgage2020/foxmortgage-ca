// Session three's hardening, held to the three things that can silently rot:
// the words on the client-facing pages, the rate limiter's window arithmetic,
// and the guard that stops the reconcile job flooding an inbox.

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  clientKeyFrom,
  emailKeyFrom,
  rateLimit,
  resetRateLimits,
  CONFIRM_EMAIL_LIMIT,
  CONFIRM_IP_LIMIT,
  MANAGE_LIMIT,
  SLOTS_LIMIT,
} from '@/lib/booking/rate-limit'

// ─── The copy gate, over the pages and not just the mail ─────────────────────
//
// tests/booking-email.test.ts gates every word an email sends. Nothing gated
// the words on the PAGES, which is where session three added eight new cards.
// Comments are stripped first: prose in a comment is for the next engineer and
// is allowed its em dashes. Everything left is either markup, class names, or
// copy, and none of those may carry a banned character.

const SURFACES = [
  'app/book/[host]/[eventType]/BookingFlow.tsx',
  'app/book/[host]/[eventType]/page.tsx',
  'app/book/manage/[token]/ManageFlow.tsx',
  'app/book/manage/[token]/page.tsx',
  'app/book/not-found.tsx',
  'components/booking/BookingNotice.tsx',
]

const BANNED: Array<[string, RegExp]> = [
  ['em dash', /—/],
  ['en dash', /–/],
  ['semicolon', /;/],
  ['exclamation point', /!/],
]

/** Drop line and block comments. Prose for the next engineer is not client copy. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/**
 * Pull the words a VISITOR actually reads out of a tsx file.
 *
 * Sweeping the whole source would be wrong, and the first cut of this test
 * proved it: `!` is the negation operator on nearly every line and `;`
 * separates fields in a TypeScript type. Both are banned in COPY and both are
 * unavoidable in CODE, so the gate has to know the difference.
 *
 * A JSX text node is the run between a `>` and the next `<`. It may hold
 * interpolations, so those are STRIPPED FROM the run rather than used to reject
 * it, which is the whole trick: "Times are shown in your timezone ({tz})." is
 * copy and an earlier cut of this test threw it away for having a brace in it.
 * Whatever still carries a code marker after the strip was never text.
 *
 * Copy-bearing attributes are read too, because a notice card's entire sentence
 * arrives as a prop rather than as a child.
 */
const CODEY = /[={}]|\bconst\b|\breturn\b|\bReact\b|\bprops\b|\buse[A-Z]|\bclassName\b/

function visibleCopy(src: string): string[] {
  const clean = stripComments(src)
  const out: string[] = []

  // Array.from, not a bare for-of: the project's TS target predates iterating a
  // RegExp string iterator directly.
  for (const m of Array.from(clean.matchAll(/>([^<>]*)</g))) {
    let text = m[1]
    let prev: string
    do {
      prev = text
      text = text.replace(/\{[^{}]*\}/g, ' ')
    } while (text !== prev)
    text = text.replace(/\s+/g, ' ').trim()
    if (!/[A-Za-z]{2}/.test(text)) continue
    if (CODEY.test(text)) continue
    out.push(text)
  }

  const COPY_ATTRS =
    /\b(?:title|callLabel|emailLabel|aria-label|placeholder)=(?:"([^"]*)"|\{`([^`]*)`\})/g
  for (const m of Array.from(clean.matchAll(COPY_ATTRS))) {
    const text = (m[1] ?? m[2] ?? '').replace(/\$\{[^}]*\}/g, '').trim()
    if (/[A-Za-z]{2}/.test(text)) out.push(text)
  }

  return out
}

function offenders(text: string): string[] {
  const out: string[] = []
  for (const [label, re] of BANNED) if (re.test(text)) out.push(label)
  if (/\bbrokers?\b/i.test(text)) out.push('the word broker')
  return out
}

describe('every client-facing booking surface passes the copy gate', () => {
  for (const file of SURFACES) {
    it(file, () => {
      const bad = visibleCopy(readFileSync(file, 'utf8'))
        .map(text => ({ text, problems: offenders(text) }))
        .filter(r => r.problems.length > 0)
      expect(bad).toEqual([])
    })
  }

  // A gate that extracts nothing passes everything. This is what stops the
  // extractor silently rotting into a no-op when the markup changes.
  it('the extractor actually finds the sentences on the page', () => {
    const copy = visibleCopy(readFileSync(SURFACES[0], 'utf8')).join(' ')
    expect(copy).toContain('Times are shown in your timezone')
    expect(copy).toContain('This is the number we call.')
    // Interpolated sentences are the ones an earlier cut of this test dropped.
    expect(copy).toContain('will call you at the number you gave us')
    expect(visibleCopy(readFileSync('app/book/not-found.tsx', 'utf8')).length).toBeGreaterThan(2)
    expect(visibleCopy(readFileSync(SURFACES[2], 'utf8')).join(' ')).toContain('One moment')
  })

  it('the shared notice writes no copy of its own, so callers own every word', () => {
    // If this ever finds copy, the gate above still covers it. The point of the
    // assertion is the ARCHITECTURE: one card, many voices, each gated at its
    // own call site.
    expect(visibleCopy(readFileSync('components/booking/BookingNotice.tsx', 'utf8'))).toEqual([])
  })

  it('and it would catch a banned character if one appeared', () => {
    expect(offenders('Book now — it is easy!')).toEqual(['em dash', 'exclamation point'])
    expect(offenders('Talk to your broker')).toEqual(['the word broker'])
  })
})

describe('the edge surfaces say what they are supposed to say', () => {
  const flow = visibleCopy(readFileSync(SURFACES[0], 'utf8')).join(' ')
  const managePage = readFileSync('app/book/manage/[token]/page.tsx', 'utf8')

  it('the outage state states that we fail closed rather than guess', () => {
    expect(flow).toContain('rather show you nothing than show you a time we cannot keep')
  })

  it('every dead end offers email as well as phone', () => {
    // A phone-only dead end loses everyone who cannot take a call right now.
    // Each of these cards passes BOTH an emailHref and an emailLabel.
    const src = stripComments(readFileSync(SURFACES[0], 'utf8'))
    const cards = src.split('<BookingNotice').slice(1)
    expect(cards.length).toBe(3) // booked, outage, no times
    for (const card of cards) {
      const head = card.slice(0, card.indexOf('>'))
      expect(head).toContain('emailHref')
      expect(head).toContain('callHref')
    }
  })

  it('a token that does not resolve gets ONE shape, so the page is not an oracle', () => {
    expect(managePage).toContain('We could not find that')
    // The distinguishable states all sit behind a RESOLVED booking.
    const found = managePage.indexOf('const now = Date.now()')
    expect(managePage.indexOf('That call has already happened')).toBeGreaterThan(found)
    expect(managePage.indexOf('That is already cancelled')).toBeGreaterThan(found)
    expect(managePage.indexOf('That booking is not open any more')).toBeGreaterThan(found)
  })
})

// ─── The limiter ─────────────────────────────────────────────────────────────

const T = (limit: number, windowMs: number) => ({ limit, windowMs })

describe('sliding window arithmetic', () => {
  beforeEach(() => resetRateLimits())

  it('allows exactly the limit inside a window', () => {
    const tier = [T(5, 60_000)]
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit('k', tier, { nowMs: 1_000 + i }).allowed).toBe(true)
    }
    expect(rateLimit('k', tier, { nowMs: 1_010 }).allowed).toBe(false)
  })

  it('THE BOUNDARY ATTACK a fixed window loses to: 2x the limit across the seam', () => {
    const tier = [T(5, 60_000)]
    // Five at the very end of what a fixed 60s window would have been.
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit('k', tier, { nowMs: 59_000 + i }).allowed).toBe(true)
    }
    // A fixed window resets here and would hand out five more. A sliding one
    // still sees the first five, because they are 1 second old.
    expect(rateLimit('k', tier, { nowMs: 60_001 }).allowed).toBe(false)
  })

  it('lets the window slide: budget returns as the oldest hits age out', () => {
    const tier = [T(3, 10_000)]
    rateLimit('k', tier, { nowMs: 0 })
    rateLimit('k', tier, { nowMs: 5_000 })
    rateLimit('k', tier, { nowMs: 9_000 })
    expect(rateLimit('k', tier, { nowMs: 9_500 }).allowed).toBe(false)
    // At 10_001 the t=0 hit has aged out and exactly one seat opens.
    expect(rateLimit('k', tier, { nowMs: 10_001 }).allowed).toBe(true)
    expect(rateLimit('k', tier, { nowMs: 10_002 }).allowed).toBe(false)
  })

  it('does NOT count refused attempts, so hammering cannot self-extend the block', () => {
    const tier = [T(2, 10_000)]
    rateLimit('k', tier, { nowMs: 0 })
    rateLimit('k', tier, { nowMs: 1 })
    // Hammer. If refusals were recorded, these would push the window forward
    // and the caller would still be blocked well past 10_001.
    for (let i = 0; i < 50; i += 1) {
      expect(rateLimit('k', tier, { nowMs: 5_000 + i }).allowed).toBe(false)
    }
    expect(rateLimit('k', tier, { nowMs: 10_002 }).allowed).toBe(true)
  })

  it('reports a truthful Retry-After', () => {
    const tier = [T(1, 60_000)]
    rateLimit('k', tier, { nowMs: 0 })
    const v = rateLimit('k', tier, { nowMs: 30_000 })
    expect(v.allowed).toBe(false)
    expect(v.retryAfterSeconds).toBe(30)
  })

  it('keys are independent', () => {
    const tier = [T(1, 60_000)]
    expect(rateLimit('a', tier, { nowMs: 0 }).allowed).toBe(true)
    expect(rateLimit('b', tier, { nowMs: 0 }).allowed).toBe(true)
    expect(rateLimit('a', tier, { nowMs: 1 }).allowed).toBe(false)
  })
})

describe('two tiers on one key', () => {
  beforeEach(() => resetRateLimits())

  const tiers = [T(3, 1_000), T(5, 60_000)]

  it('the burst tier stops a fast caller the sustained tier would allow', () => {
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit('k', tiers, { nowMs: i }).allowed).toBe(true)
    }
    expect(rateLimit('k', tiers, { nowMs: 4 }).allowed).toBe(false)
  })

  it('the sustained tier stops a slow grinder the burst tier would allow', () => {
    // One every two seconds never trips the burst tier. It still runs out.
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit('k', tiers, { nowMs: i * 2_000 }).allowed).toBe(true)
    }
    expect(rateLimit('k', tiers, { nowMs: 10_000 }).allowed).toBe(false)
  })

  it('a burst refusal does NOT spend the sustained budget', () => {
    for (let i = 0; i < 3; i += 1) rateLimit('k', tiers, { nowMs: i })
    // Twenty refusals against the burst tier.
    for (let i = 0; i < 20; i += 1) rateLimit('k', tiers, { nowMs: 10 + i })
    // Once the burst window clears, the sustained tier has 5 minus 3 left, not
    // 5 minus 23. All-or-nothing recording is what makes that true.
    expect(rateLimit('k', tiers, { nowMs: 2_000 }).allowed).toBe(true)
    expect(rateLimit('k', tiers, { nowMs: 2_001 }).allowed).toBe(true)
    expect(rateLimit('k', tiers, { nowMs: 2_002 }).allowed).toBe(false)
  })
})

describe('the shipped tiers are generous to a person and tight on a script', () => {
  beforeEach(() => resetRateLimits())

  it('a person loading the booking page five times in a row is fine', () => {
    for (let i = 0; i < 5; i += 1) {
      expect(rateLimit('slots:1.2.3.4', SLOTS_LIMIT, { nowMs: i * 900 }).allowed).toBe(true)
    }
  })

  it('a script hammering slots is stopped inside a second', () => {
    let allowed = 0
    for (let i = 0; i < 200; i += 1) {
      if (rateLimit('slots:9.9.9.9', SLOTS_LIMIT, { nowMs: i * 5 }).allowed) allowed += 1
    }
    expect(allowed).toBeLessThanOrEqual(12)
  })

  it('one person booking one call passes every confirm tier', () => {
    expect(rateLimit('confirm-ip:1.2.3.4', CONFIRM_IP_LIMIT, { nowMs: 0 }).allowed).toBe(true)
    expect(
      rateLimit(`confirm-email:${emailKeyFrom('sofia@example.com')}`, CONFIRM_EMAIL_LIMIT, {
        nowMs: 0,
      }).allowed,
    ).toBe(true)
  })

  it('rotating IPs does not buy a fresh EMAIL budget', () => {
    const key = `confirm-email:${emailKeyFrom('sofia@example.com')}`
    // Three from three different addresses on the network, same person.
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit(key, CONFIRM_EMAIL_LIMIT, { nowMs: i * 1_000 }).allowed).toBe(true)
    }
    expect(rateLimit(key, CONFIRM_EMAIL_LIMIT, { nowMs: 4_000 }).allowed).toBe(false)
  })

  it('the manage surface is limited too', () => {
    for (let i = 0; i < 8; i += 1) {
      expect(rateLimit('manage:1.2.3.4', MANAGE_LIMIT, { nowMs: i * 100 }).allowed).toBe(true)
    }
    expect(rateLimit('manage:1.2.3.4', MANAGE_LIMIT, { nowMs: 900 }).allowed).toBe(false)
  })
})

describe('keys hold no personal data', () => {
  it('the email key is a hash, not an address', () => {
    const key = emailKeyFrom('Sofia.Ricci@Example.COM')
    expect(key).not.toContain('@')
    expect(key).not.toContain('sofia')
    expect(key).toMatch(/^[0-9a-f]{32}$/)
  })

  it('case and whitespace cannot buy a fresh budget', () => {
    expect(emailKeyFrom('  Sofia@Example.com ')).toBe(emailKeyFrom('sofia@example.com'))
  })

  it('different addresses get different keys', () => {
    expect(emailKeyFrom('a@example.com')).not.toBe(emailKeyFrom('b@example.com'))
  })

  it('reads the first hop of x-forwarded-for and falls back honestly', () => {
    expect(clientKeyFrom(new Headers({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }))).toBe('1.2.3.4')
    expect(clientKeyFrom(new Headers({ 'x-real-ip': '9.9.9.9' }))).toBe('9.9.9.9')
    expect(clientKeyFrom(new Headers())).toBe('unknown')
  })
})

// ─── The flood guard ─────────────────────────────────────────────────────────

const claimStuckAlert = vi.fn()
const sendStuckCalendarAlert = vi.fn()
const pendingCalendarBookings = vi.fn()
const markCalendarAttempt = vi.fn()
const createEvent = vi.fn()

vi.mock('@/lib/demo', () => ({ isDemoMode: () => false }))
vi.mock('@/lib/booking/store', () => ({
  claimStuckAlert: (...a: unknown[]) => claimStuckAlert(...a),
  pendingCalendarBookings: (...a: unknown[]) => pendingCalendarBookings(...a),
  markCalendarAttempt: (...a: unknown[]) => markCalendarAttempt(...a),
  dueReminders: vi.fn(),
  markSent: vi.fn(),
}))
vi.mock('@/lib/booking/email', () => ({
  sendStuckCalendarAlert: (...a: unknown[]) => sendStuckCalendarAlert(...a),
  sendReminderMail: vi.fn(),
  factsFrom: (x: unknown) => x,
}))
vi.mock('@/lib/booking/email-copy', () => ({ buildCalendarDescription: () => 'body' }))
vi.mock('@/lib/booking/engine', () => ({
  providerForAgent: () => ({ createEvent: (...a: unknown[]) => createEvent(...a) }),
}))

function stuckRow(ageHours: number, id = 'b1') {
  return {
    id,
    agentId: 'a1',
    hostSlug: 'mike',
    hostTimezone: 'America/Toronto',
    hostDisplayName: 'Michael Fox',
    eventTypeSlug: 'discovery-call',
    eventTypeName: 'Discovery call',
    durationMinutes: 15,
    startsAt: '2026-07-29T13:00:00Z',
    endsAt: '2026-07-29T13:15:00Z',
    clientName: 'Sofia Ricci',
    clientPhone: '+16475550142',
    clientEmail: 'sofia@example.com',
    clientTimezone: 'America/Toronto',
    notes: null,
    intakeAnswers: {},
    smsConsent: false,
    calendarEventId: null,
    calendarAttempts: 9,
    calendarDetail: 'Forbidden',
    createdAt: '2026-07-27T00:00:00Z',
    ageHours,
  }
}

describe('the reconcile job alerts once per booking per day, never per run', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    createEvent.mockResolvedValue({ ok: false, reason: 'Forbidden', permanent: false })
    markCalendarAttempt.mockResolvedValue(undefined)
  })

  it('claims, then emails, when a row is past the threshold', async () => {
    const { runReconcileJob } = await import('@/lib/booking/jobs')
    pendingCalendarBookings.mockResolvedValue({ configured: true, ok: true, data: [stuckRow(30)] })
    claimStuckAlert.mockResolvedValue(true)
    sendStuckCalendarAlert.mockResolvedValue(true)

    const log = await runReconcileJob(new Date('2026-07-28T12:00:00Z'))

    expect(claimStuckAlert).toHaveBeenCalledTimes(1)
    expect(sendStuckCalendarAlert).toHaveBeenCalledTimes(1)
    expect(log.stuck).toHaveLength(1)
    expect(log.stuck[0].alerted).toBe(true)
  })

  it('SENDS NOTHING when the claim is refused, which is what stops 24 emails a day', async () => {
    const { runReconcileJob } = await import('@/lib/booking/jobs')
    pendingCalendarBookings.mockResolvedValue({ configured: true, ok: true, data: [stuckRow(30)] })
    claimStuckAlert.mockResolvedValue(false)

    const log = await runReconcileJob(new Date('2026-07-28T12:00:00Z'))

    expect(sendStuckCalendarAlert).not.toHaveBeenCalled()
    // Still NAMED in the log every run. Silence to the inbox is not silence to
    // the operator.
    expect(log.stuck).toHaveLength(1)
    expect(log.stuck[0].alerted).toBe(false)
  })

  it('does not alert on a row that is not stuck yet', async () => {
    const { runReconcileJob } = await import('@/lib/booking/jobs')
    pendingCalendarBookings.mockResolvedValue({ configured: true, ok: true, data: [stuckRow(2)] })

    const log = await runReconcileJob(new Date('2026-07-28T12:00:00Z'))

    expect(claimStuckAlert).not.toHaveBeenCalled()
    expect(sendStuckCalendarAlert).not.toHaveBeenCalled()
    expect(log.stuck).toHaveLength(0)
  })

  it('still retries the calendar write for a stuck row', async () => {
    const { runReconcileJob } = await import('@/lib/booking/jobs')
    pendingCalendarBookings.mockResolvedValue({ configured: true, ok: true, data: [stuckRow(30)] })
    claimStuckAlert.mockResolvedValue(false)

    await runReconcileJob(new Date('2026-07-28T12:00:00Z'))

    // Alerting is not a substitute for trying again.
    expect(createEvent).toHaveBeenCalledTimes(1)
  })
})
