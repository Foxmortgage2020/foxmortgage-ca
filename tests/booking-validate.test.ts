// Booking form validation, plus the copy gate over every string this engine can
// show a client, plus the architectural sweeps that stand in for the component
// tests this repo cannot run (no jsdom by design).

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  isHoneypotFilled,
  normalizePhone,
  refusalCopy,
  REFUSAL_COPY,
  validateBooking,
} from '@/lib/booking/validate'
import type { EventType, IntakeQuestion } from '@/lib/booking/types'

function eventType(questions: IntakeQuestion[] = []): EventType {
  return {
    slug: 'strategy-session',
    name: 'Strategy session',
    description: null,
    durationMinutes: 45,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeHours: 0,
    maxAdvanceDays: 30,
    maxPerDay: 5,
    slotIncrementMinutes: 15,
    intakeQuestions: questions,
    ...{},
  }
}

const GOOD = {
  name: 'Sofia Ricci',
  email: 'sofia@example.com',
  phone: '(647) 555-0142',
  start: '2026-07-27T13:00:00Z',
}

describe('normalizePhone', () => {
  it('accepts the shapes people actually type', () => {
    for (const raw of ['6475550142', '(647) 555-0142', '647-555-0142', '+1 647 555 0142', '1 647 555 0142']) {
      expect(normalizePhone(raw)).toEqual({ e164: '+16475550142', display: '(647) 555-0142' })
    }
  })

  it('refuses what cannot be dialled', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('555-0142')).toBeNull() // too short
    expect(normalizePhone('16475550142123')).toBeNull() // too long
    expect(normalizePhone('047 555 0142')).toBeNull() // area code cannot start with 0
    expect(normalizePhone('647 155 0142')).toBeNull() // exchange cannot start with 1
    expect(normalizePhone(null)).toBeNull()
  })
})

describe('validateBooking', () => {
  it('accepts a complete booking and normalizes the phone', () => {
    const out = validateBooking(GOOD, eventType())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.phone).toBe('+16475550142')
    expect(out.value.phoneDisplay).toBe('(647) 555-0142')
    expect(out.value.smsConsent).toBe(false)
    expect(out.value.notes).toBeNull()
  })

  it('requires a phone number, because the agent calls them', () => {
    const out = validateBooking({ ...GOOD, phone: '' }, eventType())
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.errors.phone).toBeTruthy()
  })

  it('names a bad number differently from a missing one', () => {
    const missing = validateBooking({ ...GOOD, phone: '' }, eventType())
    const bad = validateBooking({ ...GOOD, phone: '12345' }, eventType())
    expect(missing.ok).toBe(false)
    expect(bad.ok).toBe(false)
    if (missing.ok || bad.ok) return
    expect(missing.errors.phone).not.toBe(bad.errors.phone)
  })

  it('requires a name and a sane email', () => {
    const out = validateBooking({ ...GOOD, name: '', email: 'not-an-email' }, eventType())
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.errors.name).toBeTruthy()
    expect(out.errors.email).toBeTruthy()
  })

  it('requires a slot in the exact instant shape the engine emits', () => {
    for (const bad of ['', 'tomorrow', '2026-07-27T13:00:00.000Z', '2026-07-27 13:00:00Z']) {
      const out = validateBooking({ ...GOOD, start: bad }, eventType())
      expect(out.ok).toBe(false)
      if (out.ok) continue
      expect(out.errors.start).toBeTruthy()
    }
  })

  it('records consent only when it was actually given', () => {
    const yes = validateBooking({ ...GOOD, smsConsent: true }, eventType())
    const no = validateBooking({ ...GOOD, smsConsent: 'true' }, eventType())
    expect(yes.ok && yes.value.smsConsent).toBe(true)
    // Anything other than a real boolean true is not consent.
    expect(no.ok && no.value.smsConsent).toBe(false)
  })

  it('enforces a required intake question', () => {
    const q: IntakeQuestion = {
      key: 'situation',
      label: 'What are you working on?',
      type: 'select',
      required: true,
      options: ['Buying a home', 'Renewing my mortgage'],
    }
    const missing = validateBooking(GOOD, eventType([q]))
    expect(missing.ok).toBe(false)
    if (missing.ok) return
    expect(missing.errors['answers.situation']).toBeTruthy()

    const good = validateBooking(
      { ...GOOD, answers: { situation: 'Buying a home' } },
      eventType([q]),
    )
    expect(good.ok).toBe(true)
    if (!good.ok) return
    expect(good.value.answers).toEqual({ situation: 'Buying a home' })
  })

  it('refuses a select answer that is not one of the choices', () => {
    const q: IntakeQuestion = {
      key: 'situation',
      label: 'What are you working on?',
      type: 'select',
      required: true,
      options: ['Buying a home'],
    }
    const out = validateBooking({ ...GOOD, answers: { situation: 'Anything I like' } }, eventType([q]))
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.errors['answers.situation']).toBeTruthy()
  })

  it('lets an optional question go unanswered', () => {
    const q: IntakeQuestion = {
      key: 'lender',
      label: 'Who is your mortgage with?',
      type: 'text',
      required: false,
      options: [],
    }
    const out = validateBooking(GOOD, eventType([q]))
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.answers).toEqual({})
  })

  it('drops an answer to a question that was never asked', () => {
    const out = validateBooking({ ...GOOD, answers: { smuggled: 'value' } }, eventType())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.value.answers).toEqual({})
  })

  it('keeps a plausible timezone and drops a silly one', () => {
    const good = validateBooking({ ...GOOD, timezone: 'America/Vancouver' }, eventType())
    const bad = validateBooking({ ...GOOD, timezone: '<script>alert(1)</script>' }, eventType())
    expect(good.ok && good.value.timezone).toBe('America/Vancouver')
    expect(bad.ok && bad.value.timezone).toBeNull()
  })
})

describe('the honeypot', () => {
  it('is tripped by any value in the company field', () => {
    expect(isHoneypotFilled({ company: 'Acme' })).toBe(true)
    expect(isHoneypotFilled({ company: '   ' })).toBe(false)
    expect(isHoneypotFilled({})).toBe(false)
  })
})

// ─── The copy gate ───────────────────────────────────────────────────────────

const BANNED_PUNCTUATION: Array<[string, RegExp]> = [
  ['em dash', /—/],
  ['en dash', /–/],
  ['semicolon', /;/],
  ['exclamation point', /!/],
]

function copyOffenders(text: string): string[] {
  const out: string[] = []
  for (const [label, re] of BANNED_PUNCTUATION) if (re.test(text)) out.push(label)
  if (/\bbrokers?\b/i.test(text)) out.push('the word broker')
  return out
}

describe('client facing copy follows the gate', () => {
  it('every refusal message is clean', () => {
    const offenders: string[] = []
    for (const [key, text] of Object.entries(REFUSAL_COPY)) {
      for (const bad of copyOffenders(text)) offenders.push(`${key}: ${bad}`)
    }
    expect(offenders).toEqual([])
  })

  it('every refusal message tells the person what happens next', () => {
    for (const text of Object.values(REFUSAL_COPY)) {
      expect(text.length).toBeGreaterThan(15)
      expect(text.trim().endsWith('.')).toBe(true)
    }
  })

  it('falls back to a real sentence for a reason it has never heard of', () => {
    expect(refusalCopy('something_new')).toBe(REFUSAL_COPY.unknown)
  })

  it('the booking page and its flow carry no banned punctuation in visible copy', () => {
    // Sweeping raw source would be useless here: `!` and `;` are ordinary
    // TypeScript. So this extracts only what a person can actually READ — the
    // text between JSX tags and the quoted strings — after stripping comments.
    const files = [
      'app/book/[host]/[eventType]/BookingFlow.tsx',
      'app/book/[host]/[eventType]/page.tsx',
    ]
    const offenders: string[] = []
    for (const f of files) {
      for (const chunk of visibleCopyChunks(readFileSync(f, 'utf8'))) {
        for (const bad of copyOffenders(chunk)) offenders.push(`${f}: ${bad} in ${JSON.stringify(chunk.slice(0, 60))}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('the copy extractor actually finds the page copy (so the sweep is not vacuous)', () => {
    const chunks = visibleCopyChunks(readFileSync('app/book/[host]/[eventType]/BookingFlow.tsx', 'utf8'))
    const joined = chunks.join(' ')
    expect(joined).toContain('This is the number we call.')
    expect(joined).toContain('You are booked')
  })
})

/** Strip comments, then return the JSX text nodes and quoted strings. */
export function visibleCopyChunks(src: string): string[] {
  const noBlock = src.replace(/\/\*[\s\S]*?\*\//g, ' ')
  // Only strip `//` when it does not follow a colon, so a URL survives.
  const noLine = noBlock.replace(/(^|[^:])\/\/[^\n]*/g, '$1')

  const chunks: string[] = []

  // JSX text between tags. Braces are excluded so an expression is not read as
  // prose, and a chunk must contain a letter to count.
  for (const m of Array.from(noLine.matchAll(/>([^<>{}]+)</g))) {
    const text = m[1].replace(/\s+/g, ' ').trim()
    if (text && /[A-Za-z]/.test(text)) chunks.push(text)
  }

  // Quoted strings, excluding the ones that are obviously class names or code.
  for (const m of Array.from(noLine.matchAll(/'([^'\\\n]{4,})'|"([^"\\\n]{4,})"/g))) {
    const text = (m[1] ?? m[2]).trim()
    if (!/[A-Za-z]/.test(text)) continue
    if (/^[\w./@-]+$/.test(text)) continue // module paths, ids, single tokens
    if (/(^|\s)(text|bg|border|rounded|px|py|mt|mb|ml|w-|h-|flex|grid|font|hover:|focus:|sm:|md:)/.test(text)) continue
    chunks.push(text)
  }

  return chunks
}

// ─── Architectural sweeps ────────────────────────────────────────────────────

function walkSources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkSources(p, out)
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p)
  }
  return out
}

describe('the booking engine is server only where it must be', () => {
  const roots = ['app', 'components', 'lib', 'config']
  const files = roots.flatMap(r => walkSources(r))

  // Modules that read a secret, talk to a provider, or hold the operator secret.
  // lib/booking/types.ts is deliberately absent: it is a type-only leaf and the
  // client component is meant to import it.
  const SERVER_ONLY = ['store', 'outlook', 'google', 'engine', 'tokens', 'rate-limit']

  it('no client component imports a server only booking module', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = readFileSync(f, 'utf8')
      if (!/^\s*['"]use client['"]/m.test(src)) continue
      for (const mod of SERVER_ONLY) {
        if (new RegExp(`from ['"]@/lib/booking/${mod}['"]`).test(src)) {
          offenders.push(`${f} imports ${mod}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('no booking secret is ever exposed as a NEXT_PUBLIC variable', () => {
    const offenders = files.filter(f =>
      /NEXT_PUBLIC_(MS_|FOXCA_|SESSION_SECRET)/.test(readFileSync(f, 'utf8')),
    )
    expect(offenders).toEqual([])
  })

  it('only the outlook module reads the Microsoft credentials', () => {
    const offenders = files.filter(f => {
      if (f.endsWith('lib/booking/outlook.ts') || f.endsWith('lib/ms-calendar.ts')) return false
      if (f.includes('tests/')) return false
      return /process\.env\.MS_CLIENT_SECRET/.test(readFileSync(f, 'utf8'))
    })
    expect(offenders).toEqual([])
  })

  it('the booking store is the only booking module that talks to FOXCA', () => {
    const offenders = files.filter(f => {
      if (!f.includes('lib/booking/')) return false
      if (f.endsWith('lib/booking/store.ts')) return false
      return /FOXCA_SUPABASE_/.test(readFileSync(f, 'utf8'))
    })
    expect(offenders).toEqual([])
  })
})
