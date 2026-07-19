// The client portal (B5). This surface shows a real person's own file to
// whoever holds a link, so these tests are about two things only: the link is
// hard to abuse, and the words are the client's.
//
// The vocabulary sweep at the bottom is the one that earns its keep. It reads
// the actual rendered strings out of the client-facing sources and fails on
// any internal word, so nobody can leak "underwriting" onto a client's page by
// writing a well-meaning sentence six months from now.

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CLIENT_LINK_TTL_DAYS,
  clientLinkExpiry,
  hashClientToken,
  hashesMatch,
  isClientTokenShape,
  isUsable,
  linkState,
  mintClientToken,
  type ClientLinkRow,
} from '../lib/client-links'
import {
  CLIENT_PHASES,
  CLIENT_STEPS,
  CLIENT_UNMAPPED,
  LIFECYCLE_PHASES,
  PHASE_STEPS,
  allStepKeys,
  clientJourneyFor,
  journeyForStage,
} from '../config/lifecycle'

// ─── The token ───────────────────────────────────────────────────────────────

describe('the client token', () => {
  it('is 256 bits of opaque hex, and never repeats', () => {
    const a = mintClientToken()
    expect(isClientTokenShape(a)).toBe(true)
    expect(a).toHaveLength(64)
    const many = new Set(Array.from({ length: 200 }, () => mintClientToken()))
    expect(many.size).toBe(200)
  })

  it('carries nothing about the client (it is random, not encoded)', () => {
    // A token is meaningless without the stored row: nothing to decode.
    expect(mintClientToken()).toMatch(/^[a-f0-9]{64}$/)
  })

  it('is stored hashed, never raw', () => {
    const t = mintClientToken()
    const h = hashClientToken(t)
    expect(h).not.toBe(t)
    expect(h).toMatch(/^[a-f0-9]{64}$/)
    // Deterministic, so a lookup works; one-way, so a table read is not a key.
    expect(hashClientToken(t)).toBe(h)
  })

  it('the shape gate rejects everything that is not a bare hex token', () => {
    expect(isClientTokenShape('')).toBe(false)
    expect(isClientTokenShape('nope')).toBe(false)
    expect(isClientTokenShape('a'.repeat(63))).toBe(false)
    expect(isClientTokenShape('a'.repeat(65))).toBe(false)
    expect(isClientTokenShape('A'.repeat(64))).toBe(false) // uppercase
    expect(isClientTokenShape('../../etc/passwd')).toBe(false)
    // Load-bearing: a dot would route the request around Clerk's middleware
    // (its matcher skips any path ending .<word>), so dots must never pass.
    expect(isClientTokenShape(`${'a'.repeat(60)}.js`)).toBe(false)
    expect(isClientTokenShape('eyJhbGciOi.eyJzdWIi.sig')).toBe(false)
  })

  it('compares hashes without leaking timing', () => {
    const h = hashClientToken('x')
    expect(hashesMatch(h, h)).toBe(true)
    expect(hashesMatch(h, hashClientToken('y'))).toBe(false)
    expect(hashesMatch(h, 'short')).toBe(false) // no throw on length mismatch
  })

  it('expires 90 days out', () => {
    expect(CLIENT_LINK_TTL_DAYS).toBe(90)
    const now = new Date('2026-07-17T12:00:00.000Z')
    const exp = clientLinkExpiry(now)
    expect(Math.round((exp.getTime() - now.getTime()) / 86_400_000)).toBe(90)
  })
})

// ─── Link states: valid, expired, revoked, garbage ───────────────────────────

const link = (over: Partial<ClientLinkRow> = {}): ClientLinkRow => ({
  id: 'l1',
  zohoDealId: '7112178000000000001',
  fileRef: 'FOX-1004',
  createdAt: '2026-07-01T00:00:00.000Z',
  expiresAt: '2026-09-29T00:00:00.000Z',
  revokedAt: null,
  ...over,
})

describe('link states', () => {
  const now = new Date('2026-07-17T12:00:00.000Z')

  it('a live link inside its window is usable', () => {
    expect(linkState(link(), now)).toBe('usable')
    expect(isUsable(link(), now)).toBe(true)
  })

  it('an expired link is not usable', () => {
    const l = link({ expiresAt: '2026-07-01T00:00:00.000Z' })
    expect(linkState(l, now)).toBe('expired')
    expect(isUsable(l, now)).toBe(false)
  })

  it('a revoked link is not usable, and revoked outranks expired', () => {
    expect(linkState(link({ revokedAt: '2026-07-10T00:00:00.000Z' }), now)).toBe('revoked')
    // Revoked AND expired reads revoked: an explicitly killed link is killed.
    const both = link({ revokedAt: '2026-07-02T00:00:00.000Z', expiresAt: '2026-07-03T00:00:00.000Z' })
    expect(linkState(both, now)).toBe('revoked')
  })

  it('the expiry boundary does not leave a link alive on its last instant', () => {
    const exact = link({ expiresAt: now.toISOString() })
    expect(linkState(exact, now)).toBe('expired')
  })
})

// ─── The client's words: total, and never internal ───────────────────────────

describe('the clientJourney mapping is total', () => {
  it('every lifecycle phase has client words', () => {
    for (const p of LIFECYCLE_PHASES) {
      const w = CLIENT_PHASES[p.key]
      expect(w, `phase ${p.key} has no client words`).toBeTruthy()
      expect(w.label.length).toBeGreaterThan(0)
      expect(w.happening.length).toBeGreaterThan(0)
    }
  })

  it('every lifecycle STEP has client words — a new step fails loudly here', () => {
    const keys = allStepKeys()
    // Sanity: the sweep is walking a real tree, not an empty one.
    expect(keys.length).toBeGreaterThanOrEqual(20)
    for (const key of keys) {
      const w = CLIENT_STEPS[key]
      expect(w, `lifecycle step "${key}" has no client words in CLIENT_STEPS`).toBeTruthy()
      expect(w.label.length, `step "${key}" has an empty client label`).toBeGreaterThan(0)
      expect(w.happening.length, `step "${key}" has no "what's happening" sentence`).toBeGreaterThan(0)
    }
  })

  it('carries no client words for steps that do not exist (no rot)', () => {
    const keys = new Set(allStepKeys())
    for (const key of Object.keys(CLIENT_STEPS)) {
      expect(keys.has(key), `CLIENT_STEPS has "${key}" but no lifecycle step does`).toBe(true)
    }
  })
})

describe('the client journey', () => {
  it('speaks the client phase labels, not ours', () => {
    const j = clientJourneyFor(
      journeyForStage({ stage: 'Collecting Documentation', shape: 'purchase', space: 'display' }),
    )
    expect(j.mapped).toBe(true)
    expect(j.current?.key).toBe('underwriting')
    // The internal label is "Underwriting". The client never reads that.
    expect(j.current?.label).toBe('Reviewing your file')
    expect(j.phases.map(p => p.label)).not.toContain('Underwriting')
  })

  it('surfaces what we need from the client only when the step needs something', () => {
    const docs = clientJourneyFor(
      journeyForStage({ stage: 'Collecting Documentation', shape: 'refi', space: 'display' }),
    )
    expect(docs.needFromYou).toBeTruthy()

    const withLender = clientJourneyFor(
      journeyForStage({ stage: 'Submitted to Lender', shape: 'refi', space: 'display' }),
    )
    // Nothing is needed from them while the lender decides. Say nothing.
    expect(withLender.needFromYou).toBeNull()
  })

  it('a funded file reads as beyond funding, not as an ending', () => {
    const j = clientJourneyFor(
      journeyForStage({ stage: 'Mortgage Funded', shape: 'renewal', space: 'display' }),
    )
    expect(j.current?.key).toBe('beyond_funding')
    expect(j.current?.label).toBe('Looking after it')
  })

  it('an unmapped stage renders the calm generic, never an error or a raw stage', () => {
    const j = clientJourneyFor(
      journeyForStage({ stage: 'Some Future Stage', shape: 'unknown', space: 'display' }),
    )
    expect(j.mapped).toBe(false)
    expect(j.current).toBeNull()
    expect(j.step).toBeNull()
    expect(j.needFromYou).toBeNull()
    expect(CLIENT_UNMAPPED.happening).toContain('working on your file')
  })

  it('never renders a planned step to a client (no placeholders)', () => {
    // Planned steps carry no stage matchers, so they can never be current.
    for (const phase of Object.values(PHASE_STEPS)) {
      for (const steps of Object.values(phase)) {
        for (const s of steps) {
          if (s.status === 'planned') {
            expect(s.stages ?? [], `planned step "${s.key}" must claim no stage`).toEqual([])
          }
        }
      }
    }
  })
})

// ─── The demo fixture must not lie about the not-found path ─────────────────

describe('the demo client file', () => {
  it('resolves only its own tokens, and nothing for anything else', async () => {
    const { demoClientFileView, DEMO_CLIENT_TOKEN } = await import('../lib/demo-fixtures')
    expect(demoClientFileView(DEMO_CLIENT_TOKEN)).toBeTruthy()
    // No fallback: an unknown token in demo must behave exactly as it does in
    // production. It first shipped with a convenience fallback that rendered
    // the demo file for ANY well-formed token, which hid the not-found state
    // from the very proofs meant to check it.
    expect(demoClientFileView('f'.repeat(64))).toBeNull()
    expect(demoClientFileView('not-a-token')).toBeNull()
  })

  it('its tokens are real token shapes (the gate runs before the demo check)', async () => {
    const { DEMO_CLIENT_TOKEN } = await import('../lib/demo-fixtures')
    expect(isClientTokenShape(DEMO_CLIENT_TOKEN)).toBe(true)
  })
})

// ─── The vocabulary sweep: no internal word reaches a client ─────────────────

const CLIENT_FACING_SOURCES = [
  'app/portal/file/[token]/ClientFilePage.tsx',
  'app/portal/file/[token]/NotFoundCard.tsx',
  'app/portal/file/[token]/ClientFooter.tsx',
]

// Words that mean something to us and nothing (or the wrong thing) to a
// client. "broker" is here because Michael is a Mortgage Agent Level 2 and
// calling him a broker is both wrong and a licensing problem.
const BANNED = [
  'underwriting',
  'underwrite',
  'packaging',
  'evidence',
  'zoho',
  'finmo',
  'broker',
  'workbench',
  'gate',
  'stage',
  'pipeline',
]

// The document-checklist verdict vocabulary (B8a). The desk reads AI verdicts,
// flags, freshness advisories, stale-cycle notes, and review reasons — every
// one of these is an INTERNAL draft and must never reach a client's markup. The
// client checklist reads only the raw Finmo request state, so this list can
// never appear by construction; the assertion locks that in the way the stage
// ban above locks internal stage names.
const BANNED_VERDICTS = [
  'flagged',
  'stale',
  'illegible',
  'verdict',
  'needs review',
  'for_review',
  'stale_cycle',
  'needs_input',
  'looks right',
  'worth a glance',
  'requirement',
]

/** The words a client actually reads: JSX text and quoted strings. */
function renderedStrings(src: string): string[] {
  const withoutComments = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const out: string[] = []
  // Quoted copy.
  const quoted = Array.from(withoutComments.matchAll(/'([^'\\]{4,})'|"([^"\\]{4,})"/g))
  for (const m of quoted) out.push(m[1] ?? m[2] ?? '')
  // Bare JSX text between tags.
  const jsx = Array.from(withoutComments.matchAll(/>([^<>{}]{4,})</g))
  for (const m of jsx) out.push(m[1])
  return out.map(s => s.trim()).filter(Boolean)
}

describe('no internal vocabulary reaches the client', () => {
  it('the client-facing pages carry none of our words', () => {
    for (const file of CLIENT_FACING_SOURCES) {
      const strings = renderedStrings(readFileSync(file, 'utf8'))
      expect(strings.length, `${file}: the sweep found no strings — it is not testing anything`)
        .toBeGreaterThan(3)
      for (const s of strings) {
        for (const word of BANNED) {
          // className strings are not read by anyone; skip them.
          if (/^[a-z0-9:_\- [\]/.#()%]+$/i.test(s) && /\b(text|bg|border|rounded|font|flex|grid|mt|mx|px|py|gap)-/.test(s)) continue
          expect(
            new RegExp(`\\b${word}\\b`, 'i').test(s),
            `${file} shows a client the word "${word}": ${JSON.stringify(s)}`,
          ).toBe(false)
        }
      }
    }
  })

  it('no verdict vocabulary reaches the client (AI flags, freshness, review reasons)', () => {
    for (const file of CLIENT_FACING_SOURCES) {
      const strings = renderedStrings(readFileSync(file, 'utf8'))
      for (const s of strings) {
        if (/^[a-z0-9:_\- [\]/.#()%]+$/i.test(s) && /\b(text|bg|border|rounded|font|flex|grid|mt|mx|px|py|gap)-/.test(s)) continue
        for (const word of BANNED_VERDICTS) {
          expect(
            new RegExp(`\\b${word}\\b`, 'i').test(s),
            `${file} shows a client the verdict word "${word}": ${JSON.stringify(s)}`,
          ).toBe(false)
        }
      }
    }
  })

  it('the demo document checklist exercises all three states and carries no internal words', async () => {
    const { demoClientFileView, DEMO_CLIENT_TOKEN } = await import('../lib/demo-fixtures')
    const view = demoClientFileView(DEMO_CLIENT_TOKEN)!
    expect(view.documents, 'the demo purchase file must carry a checklist for the proofs').toBeTruthy()
    const c = view.documents!
    // All three states populated, so a render proof shows the full card.
    expect(c.done).toBeGreaterThan(0)
    expect(c.received).toBeGreaterThan(0)
    expect(c.waiting).toBeGreaterThan(0)
    // The runtime request NAMES + borrower headers carry no internal or verdict word.
    const blob = c.groups
      .flatMap(g => [g.borrower ?? '', ...g.names])
      .join(' ')
      .toLowerCase()
    for (const word of [...BANNED, ...BANNED_VERDICTS]) {
      expect(blob.includes(word.toLowerCase()), `demo checklist leaks the word "${word}"`).toBe(false)
    }
  })

  it('every client word in the config is clean', () => {
    const all = [
      ...Object.values(CLIENT_PHASES),
      ...Object.values(CLIENT_STEPS),
      CLIENT_UNMAPPED,
    ]
    expect(all.length).toBeGreaterThanOrEqual(25)
    for (const w of all) {
      for (const s of [w.label, w.happening, w.needFromYou ?? '']) {
        if (!s) continue
        for (const word of BANNED) {
          expect(
            new RegExp(`\\b${word}\\b`, 'i').test(s),
            `client copy uses the word "${word}": ${JSON.stringify(s)}`,
          ).toBe(false)
        }
      }
    }
  })

  it('client copy follows the house copy rules', () => {
    const all = [...Object.values(CLIENT_PHASES), ...Object.values(CLIENT_STEPS), CLIENT_UNMAPPED]
    for (const w of all) {
      for (const s of [w.label, w.happening, w.needFromYou ?? '']) {
        if (!s) continue
        expect(s.includes('—'), `em dash in client copy: ${s}`).toBe(false)
        expect(s.includes('!'), `exclamation point in client copy: ${s}`).toBe(false)
        expect(s.includes(';'), `semicolon in client copy: ${s}`).toBe(false)
      }
    }
  })

  it('never tells a person no (the standing rule, asserted)', () => {
    const all = [...Object.values(CLIENT_PHASES), ...Object.values(CLIENT_STEPS), CLIENT_UNMAPPED]
    const NO_WORDS = ['declined', 'denied', 'rejected', 'not approved', 'unfortunately', 'qualify for']
    for (const w of all) {
      for (const s of [w.label, w.happening, w.needFromYou ?? '']) {
        for (const n of NO_WORDS) {
          expect(s.toLowerCase().includes(n), `client copy tells someone no: ${s}`).toBe(false)
        }
      }
    }
  })
})
