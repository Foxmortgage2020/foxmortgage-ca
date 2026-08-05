// The copy gate over the Deals (Beta) file page (handoff 46).
//
// Michael's standing copy rules apply to everything rendered in the portal: no
// em dash, no en dash, no semicolon in prose, no exclamation point. This test
// enforces them across the beta surface.
//
// WHY A SOURCE SCAN RATHER THAN A LIST OF STRINGS. The empty-state pattern on
// this page is about to be copied across Documents, Qualification, Submission
// and Compliance. A test that checked today's strings would pass while four new
// copies of the same em dash landed beside them. This one walks the directory,
// so a string nobody has written yet is checked the moment it exists — and a
// whole new tab file is covered without anyone remembering to add it here.
//
// It reuses lib/booking/copy-gate.ts rather than restating the rules, so the
// portal cannot end up with two definitions of what the gate is.
//
// SCOPE. Everything under app/portal/admin/deals-beta and
// components/admin/deals-beta, lib/beta-file.ts, and the three components the
// beta surface RENDERS from elsewhere: CommitmentTermsCard, ConditionsChecklist
// and CommitmentUploader. The last two were knowingly excluded in handoff 46
// because their copy belonged to the deal room; handoff 48 swept them, so the
// exclusion is gone and the gate now covers every string this page renders.
// They are shared, so a violation here is a violation in the deal room too.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { COPY_RULES } from '@/lib/booking/copy-gate'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Every source file on the beta surface, walked so a new file is covered. */
function scannedFiles(): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    let entries: string[]
    try {
      entries = readdirSync(join(ROOT, rel))
    } catch {
      return
    }
    for (const e of entries) {
      const r = join(rel, e)
      if (statSync(join(ROOT, r)).isDirectory()) walk(r)
      else if (/\.tsx?$/.test(e)) out.push(r)
    }
  }
  walk('app/portal/admin/deals-beta')
  walk('components/admin/deals-beta')
  out.push('lib/beta-file.ts')
  // The shared components the beta surface renders from outside its own tree.
  out.push('components/admin/CommitmentTermsCard.tsx')
  out.push('components/admin/ConditionsChecklist.tsx')
  out.push('components/admin/CommitmentUploader.tsx')
  return out
}

/** Comments are not rendered, so they are not copy. Block comments first, then
 *  whole-line `//` comments, both replaced by blank lines so reported line
 *  numbers still point at the real source. */
function withoutComments(src: string): string {
  const noBlocks = src.replace(/\/\*[\s\S]*?\*\//g, m => '\n'.repeat((m.match(/\n/g) ?? []).length))
  return noBlocks
    .split('\n')
    .map(l => (l.trim().startsWith('//') ? '' : l))
    .join('\n')
}

/** The rules that apply to rendered prose. The gate's "broker" rule is
 *  deliberately NOT applied here: this is an internal admin surface, and the
 *  word is the correct term for a broker condition on a lender's checklist.
 *  The typographic rules apply everywhere. */
const PROSE_RULES = COPY_RULES.filter(r =>
  ['em dash', 'en dash', 'exclamation point'].includes(r.label),
)

/** Two or more words: enough to be prose rather than an identifier or a class
 *  string. */
const LOOKS_LIKE_PROSE = /[A-Za-z]{2,}[ ,.][A-Za-z]/

const NOT_COPY =
  /^(https?:|\/api\/|\/portal\/|@\/|data-|aria-|text-|bg-|border-|flex|grid|min-|max-|rounded|font-|hover:|sm:|lg:|md:)/

/** JavaScript that happens to sit between quotes or angle brackets. An
 *  interpolation, an operator or a keyword means the match is code, not copy —
 *  and copy rules do not apply to code. */
const IS_CODE = /!==|!=|=>|&&|\|\||\breturn\b|\.length\b|\?\.|\)\s*\.|\$\{/

/** Rendered strings: quoted literals that read as prose, plus JSX text nodes.
 *  Template interpolations are stripped first, so `${x !== null ? …}` inside an
 *  otherwise-prose template does not read as an exclamation point. */
function renderedStrings(src: string): string[] {
  const code = withoutComments(src)
  const out: string[] = []
  const keep = (raw: string) => {
    // Drop interpolated expressions; what is left is the authored copy.
    const s = raw.replace(/\$\{[^}]*\}/g, '').trim()
    if (!s || !LOOKS_LIKE_PROSE.test(s)) return
    if (NOT_COPY.test(s) || IS_CODE.test(s)) return
    out.push(s)
  }
  // exec loops rather than matchAll, and [\s\S] rather than the `s` flag, to
  // stay inside this repo's TypeScript target.
  const literal = /'([^'\\\n]{6,})'|"([^"\\\n]{6,})"|`([^`\\]{6,}?)`/g
  let m: RegExpExecArray | null
  while ((m = literal.exec(code))) keep(m[1] ?? m[2] ?? m[3] ?? '')
  const jsxText = />([^<>{}]{6,})</g
  while ((m = jsxText.exec(code))) keep(m[1].split(/\s+/).join(' '))
  return out
}

describe('the beta file page obeys the copy rules', () => {
  const files = scannedFiles()

  it('walks the whole surface, so a file a later session adds is covered', () => {
    expect(files.length).toBeGreaterThanOrEqual(13)
    expect(files).toContain('app/portal/admin/deals-beta/[dealId]/page.tsx')
    expect(files).toContain('components/admin/deals-beta/TabEmpty.tsx')
    expect(files).toContain('components/admin/CommitmentTermsCard.tsx')
  })

  it('no em dash, en dash or exclamation point in any rendered string', () => {
    const offences: string[] = []
    for (const f of files) {
      for (const s of renderedStrings(read(f))) {
        for (const rule of PROSE_RULES) {
          if (rule.test(s)) offences.push(`${f}: ${rule.problem} -> "${s.slice(0, 90)}"`)
        }
      }
    }
    expect(offences, `copy-rule violations:\n${offences.join('\n')}`).toEqual([])
  })

  it('no semicolon in rendered prose (a TypeScript type annotation is not prose)', () => {
    const offences: string[] = []
    for (const f of files) {
      for (const s of renderedStrings(read(f))) {
        // A type annotation like `{ label: string; value: string }` is code
        // that happens to match a string-ish pattern; real prose ends its
        // clauses with a full stop.
        if (s.includes(';') && !/:\s*(string|number|boolean|null|React\.)/.test(s)) {
          offences.push(`${f}: semicolon in prose -> "${s.slice(0, 90)}"`)
        }
      }
    }
    expect(offences, `semicolon violations:\n${offences.join('\n')}`).toEqual([])
  })

  it('the checker itself catches a violation, on a string that does not exist in the repo', () => {
    // Proves the scan is not vacuous: the same rules, run over invented copy.
    const invented = [
      'This file has no room — it was never opened.',
      'Nothing is waiting here!',
      'The lender replied – the terms are below.',
    ]
    for (const s of invented) {
      expect(PROSE_RULES.some(r => r.test(s)), `should have caught: ${s}`).toBe(true)
    }
    // ...and passes the corrected forms.
    for (const s of [
      'This file has no room. It was never opened.',
      'Nothing is waiting here.',
      'The lender replied. The terms are below.',
    ]) {
      expect(PROSE_RULES.some(r => r.test(s)), `should have passed: ${s}`).toBe(false)
    }
  })

  it('the extractor actually sees the empty-state copy it is meant to guard', () => {
    // If renderedStrings ever stopped matching JSX text, the suite above would
    // go quietly green. This pins one real sentence from each empty state.
    const conds = renderedStrings(read('components/admin/deals-beta/FileConditions.tsx'))
    expect(conds.join(' ')).toMatch(/no underwriting room yet/)
    const empty = renderedStrings(read('components/admin/deals-beta/TabEmpty.tsx'))
    expect(empty.join(' ')).toMatch(/no Deals file page/)
    const card = renderedStrings(read('components/admin/CommitmentTermsCard.tsx'))
    expect(card.join(' ')).toMatch(/Both choices are permanent/)
  })
})

describe('the irreversibility copy on the committed-terms card', () => {
  const card = read('components/admin/CommitmentTermsCard.tsx')

  it('states that both choices are permanent, above the buttons', () => {
    expect(card).toMatch(
      /Both choices are permanent\. The gate moves only pending terms, so there is no way back to\s+this state\. A correction means a new commitment, not an undo\./,
    )
    // Above, not below: the sentence must precede the button row in source.
    expect(card.indexOf('Both choices are permanent')).toBeLessThan(card.indexOf("fire('approve'"))
  })

  it('both buttons carry (final), and the count stays dynamic', () => {
    expect(card).toContain('`Approve all ${s.pending} (final)`')
    expect(card).toContain("'Reject the set (final)'")
    // Never hardcoded to ten.
    expect(card).not.toMatch(/Approve all 10/)
  })

  it('both arm, and the armed copy says what the press does', () => {
    expect(card).toContain("'Press again to confirm. This cannot be undone.'")
    expect(card).toContain("'Press again to confirm. Rejecting is also permanent.'")
    // Arming is enforced by timestamp at press time for BOTH keys.
    expect(card).toMatch(/armed\?\.key === 'approve'/)
    expect(card).toMatch(/armed\?\.key === 'reject'/)
    expect(card).toMatch(/Date\.now\(\) - armed\.at <= ARM_WINDOW_MS/)
  })

  it('reject is never described as the safe or cautious option', () => {
    // RENDERED strings only. Scanning the whole file caught the comment that
    // explains why reject must not read as safe, which is the opposite of a
    // violation. What matters is that no words a person SEES say it.
    const copy = renderedStrings(card).join(' ').toLowerCase()
    for (const word of ['cancel', 'safe', 'go back', 'discard', 'nevermind', 'never mind']) {
      expect(copy, `reject must not read as "${word}"`).not.toContain(word)
    }
  })

  it('both buttons are solid and equal weight, and neither is an outline', () => {
    // An outline button beside a solid one is the visual grammar of Cancel.
    // Reject carries the palette's destructive token instead, so the emphasis
    // it takes marks it destructive rather than safe (handoff 48).
    expect(card).toContain('bg-danger text-white')
    expect(card).toContain('bg-navy text-white')
    // Neither decision button may be a bordered white button again.
    const buttonBlock = card.slice(card.indexOf("fire('approve'"), card.indexOf('{error &&'))
    expect(buttonBlock).not.toMatch(/bg-white border/)
  })
})
