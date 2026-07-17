// The phone-number guard (Task 0, 2026-07-17).
//
// The Fox Mortgage phone number lived in five different places and drifted:
// lib/contact.ts and the demo FP support page still said 519-226-8880 while
// the two PDFs already said 226-770-8880. This test makes that impossible to
// repeat. lib/contact.ts is the single source of truth; a phone-shaped
// literal anywhere in the code tree must be either an obvious fake
// (a 555 exchange or a run of zeros) or the one explicitly-allowlisted SMM
// number — never the Fox line, never an unrecognized real number.
//
// Scope is the CODE tree (app / lib / components / config). Docs are prose and
// legitimately quote the number (the B-brief reports do); tests and fixtures
// are exempt by the brief. Placeholders like "(416) 555-0123" and demo-fixture
// numbers are fine — they are fictional by construction.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CONTACT } from '../lib/contact'

const CODE_DIRS = ['app', 'lib', 'components', 'config']
const SELF = join('lib', 'contact.ts')

// The Fox number, current and the retired one, as bare digit strings. Neither
// may appear anywhere but lib/contact.ts.
const FOX_DIGITS = new Set(['2267708880', '5192268880'])

// The SMM enrollment page's number. Left in place per the Task 0 brief and
// flagged for Michael (intentional second line, or wrong?). Allowlisted here
// so the guard passes while that question is open; remove this entry if the
// number is ever unified or corrected.
const SMM_DIGITS = '5196548173'

// Phone shapes: NNN-NNN-NNNN, (NNN) NNN-NNNN, NNN NNN NNNN, tel:+1NNNNNNNNNN,
// +1NNNNNNNNNN, and bare 10/11-digit runs of the Fox/SMM numbers.
const PHONE_RE =
  /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}|tel:\+?\d{10,11}|\+1\d{10}|\b1?(?:2267708880|5192268880|5196548173)\b/g

function last10(match: string): string {
  const digits = match.replace(/\D/g, '')
  return digits.length >= 10 ? digits.slice(-10) : digits
}

/** Fictional by construction: a 555 exchange, or a run of four or more zeros. */
function isObviousFake(digits: string): boolean {
  const exchange = digits.slice(3, 6)
  return exchange === '555' || /0{4,}/.test(digits)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const p = join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|js|jsx)$/.test(entry) && !/\.test\.[tj]sx?$/.test(entry)) out.push(p)
  }
  return out
}

describe('the phone number is unified on lib/contact.ts', () => {
  it('lib/contact.ts carries the confirmed number', () => {
    expect(CONTACT.phone.display).toBe('226-770-8880')
    expect(CONTACT.phone.href).toBe('tel:+12267708880')
  })

  it('no Fox number and no unrecognized real number is hand-typed anywhere in code', () => {
    const files = CODE_DIRS.flatMap(d => walk(d))
    // Sanity: the walk found a real tree, not nothing.
    expect(files.length).toBeGreaterThan(100)

    const offenders: string[] = []
    for (const file of files) {
      if (file === SELF) continue
      const src = readFileSync(file, 'utf8')
      const lines = src.split('\n')
      for (const [i, line] of Array.from(lines.entries())) {
        for (const match of line.match(PHONE_RE) ?? []) {
          const digits = last10(match)
          if (FOX_DIGITS.has(digits)) {
            offenders.push(`${file}:${i + 1} hardcodes the Fox number (${match.trim()}) — read it from lib/contact.ts`)
          } else if (digits === SMM_DIGITS || isObviousFake(digits)) {
            // Allowed: the flagged SMM line, or a fictional placeholder/fixture.
          } else {
            offenders.push(`${file}:${i + 1} has an unrecognized phone literal (${match.trim()}) — route it through lib/contact.ts or make it clearly fictional`)
          }
        }
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('the guard would actually catch a stray Fox number (self-check)', () => {
    // If someone pastes the Fox number into a component, this classification
    // is what fails the test above.
    expect(FOX_DIGITS.has(last10('226-770-8880'))).toBe(true)
    expect(FOX_DIGITS.has(last10('tel:+12267708880'))).toBe(true)
    expect(FOX_DIGITS.has(last10('519-226-8880'))).toBe(true)
    // And a fictional placeholder is correctly waved through.
    expect(isObviousFake(last10('(416) 555-0123'))).toBe(true)
    expect(isObviousFake(last10('(519) 000-0000'))).toBe(true)
  })
})
