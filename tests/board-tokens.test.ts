// The Deals (Beta) design tokens, and the rules that keep the board on them
// (handoff 57).
//
// WHY THESE EXIST. Michael spent a morning iterating on mockups until he
// approved a look, and three separate builds this week drifted from prose
// descriptions of a design, each costing a session. Prose does not hold. These
// do:
//
//   1. NO HARDCODED HEX outside lib/design-tokens.ts, across the whole board
//      surface, walked as a directory so a file nobody has written yet is
//      covered the moment it exists.
//   2. NO FONT WEIGHT ABOVE 500 anywhere on that surface. Only 400 and 500
//      exist, and nothing heavier appears.
//   3. THE COUNT PILL IS NOT RIGHT-ALIGNED, and the countdown's red fires on
//      exactly the two states that were specified for it.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RADIUS, ROLE, STROKE, SURFACE, TEXT, TYPE, typeStyle } from '@/lib/design-tokens'
import {
  CLOSING_URGENT_DAYS,
  closingCountdown,
  daysBetweenYMD,
  emptyStagesNote,
  foldStages,
  isTerminalCategory,
  phaseIsQuiet,
  phaseWeighted,
  spellSmall,
} from '@/lib/board-layout'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** THE FILE PAGE IS A DIFFERENT SURFACE AND KEEPS ITS CURRENT APPEARANCE.
 *
 *  Handoff 57 rebuilt the BOARD. The file page at deals-beta/[dealId] shares
 *  the directory but not the pass, and the brief required it to stay visually
 *  untouched, so its components are held out by name rather than the rules
 *  being softened to accommodate them. Each carries hardcoded hex, weights
 *  above 500 or all-caps utilities today.
 *
 *  THIS LIST IS A DEBT REGISTER, NOT A PERMISSION. It shrinks to nothing when
 *  the file page gets its own pass, and a NEW file on this surface is covered
 *  by default because it is not on it. */
const NOT_YET_PASSED = [
  'app/portal/admin/deals-beta/[dealId]/page.tsx',
  'components/admin/deals-beta/FileClient.tsx',
  'components/admin/deals-beta/FileCommitment.tsx',
  'components/admin/deals-beta/FileConditions.tsx',
  'components/admin/deals-beta/FileFlagStrip.tsx',
  'components/admin/deals-beta/FileOverview.tsx',
  'components/admin/deals-beta/FileTabs.tsx',
  'components/admin/deals-beta/TabEmpty.tsx',
  // Unreferenced since handoff 50, kept so restoring the preview panel is one
  // line. Nothing renders it, so it cannot be off-design on screen.
  'components/admin/deals-beta/DealPreview.tsx',
  // SHARED CONTROLS, and the reason they are held out is the file page rather
  // than the board. Both render on the file page as well as here, so restyling
  // their buttons would have changed a surface the brief required to stay
  // visually untouched. RecordWithdrawal's buttons therefore still carry weight
  // 600 where they render on a card, which is the board's one live deviation
  // from the two-weight rule and is named in the handoff 57 report.
  'components/admin/deals-beta/RecordWithdrawal.tsx',
  'components/admin/deals-beta/ReextractControl.tsx',
]

/** Every source file on the board surface. Walked, so a file added by a later
 *  session is audited without anyone remembering to list it here. */
function boardFiles(): string[] {
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
  // The orchestrator lives one directory up and renders most of what is on the
  // page, so the walk would miss the largest file on the surface.
  out.push('components/admin/DealsBetaBoard.tsx')
  // The two modules that own the board's values and its layout rules.
  out.push('lib/board-layout.ts')
  out.push('lib/phase-palette.ts')
  return out.filter(f => !NOT_YET_PASSED.includes(f))
}

/** Comments are not rendered, so a comment naming a hex is documentation rather
 *  than a hardcoded colour. Block comments first, then whole-line `//`. */
function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => (l.trim().startsWith('//') ? '' : l))
    .join('\n')
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g

// ─────────────────────────────────────────────────────────────────────────────
describe('one module owns the colours', () => {
  const files = boardFiles()

  it('walks a real surface, so a later file is covered on the day it lands', () => {
    expect(files.length).toBeGreaterThanOrEqual(6)
    // The debt register is real and every entry on it exists.
    for (const f of NOT_YET_PASSED) expect(() => read(f)).not.toThrow()
    for (const f of NOT_YET_PASSED) expect(files).not.toContain(f)
    expect(files).toContain('components/admin/DealsBetaBoard.tsx')
    expect(files).toContain('components/admin/deals-beta/DealCard.tsx')
    expect(files).toContain('app/portal/admin/deals-beta/page.tsx')
  })

  it('NO HARDCODED HEX anywhere on the board surface', () => {
    const offences: string[] = []
    for (const f of files) {
      const src = withoutComments(read(f))
      for (const [i, line] of Array.from(src.split('\n').entries())) {
        const hits = line.match(HEX)
        if (hits) offences.push(`${f}:${i + 1} ${hits.join(', ')} -> ${line.trim().slice(0, 90)}`)
      }
    }
    expect(offences, `hardcoded colour outside lib/design-tokens.ts:\n${offences.join('\n')}`).toEqual([])
  })

  it('the checker is not vacuous: it catches a hex that does not exist in the repo', () => {
    const invented = "  style={{ color: '#BADA55' }}"
    expect(withoutComments(invented).match(HEX)).not.toBeNull()
    // ...and a comment naming one is documentation, not a breach.
    expect(withoutComments('// the old canvas was #EEF1F5').match(HEX)).toBeNull()
  })

  it('the token module actually carries the approved values', () => {
    // If these ever drift, the mockup and the screen have parted company.
    expect(SURFACE.canvas).toBe('#F4F4F0')
    expect(SURFACE.columnGround).toBe('#E4E4DE')
    expect(SURFACE.cardBorder).toBe('#CFCFC7')
    expect(SURFACE.cardHairline).toBe('#EDEDE7')
    expect(SURFACE.sectionHairline).toBe('#EAEAE4')
    expect(TEXT.primary).toBe('#1A1A17')
    expect(TEXT.secondary).toBe('#6E6E67')
    expect(TEXT.muted).toBe('#8C8C85')
    expect(TEXT.absent).toBe('#B4B4AC')
    expect(TEXT.fileRef).toBe('#2E5C96')
    expect(ROLE.urgent).toBe('#B3261E')
    expect(ROLE.projectionInk).toBe('#1D6E56')
    expect(RADIUS.panel).toBe(10)
    expect(RADIUS.column).toBe(9)
    expect(RADIUS.card).toBe(7)
    expect(STROKE.card).toBe(2)
    expect(STROKE.stageRule).toBe(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('only two weights exist', () => {
  const files = boardFiles()

  it('NO FONT WEIGHT ABOVE 500 anywhere on the board surface', () => {
    // Both notations: the Tailwind classes and a numeric fontWeight.
    const CLASS = /(?:^|[\s'"`:{])font-(semibold|bold|extrabold|black)\b/
    const NUMERIC = /fontWeight:\s*(\d{3})/g
    const offences: string[] = []
    for (const f of files) {
      const src = withoutComments(read(f))
      for (const [i, line] of Array.from(src.split('\n').entries())) {
        if (CLASS.test(line)) offences.push(`${f}:${i + 1} ${line.trim().slice(0, 80)}`)
        for (const m of Array.from(line.matchAll(NUMERIC))) {
          if (Number(m[1]) > 500) offences.push(`${f}:${i + 1} fontWeight ${m[1]}`)
        }
      }
    }
    expect(offences, `weights above 500:\n${offences.join('\n')}`).toEqual([])
  })

  it('every type token is 400 or 500, and the helper emits what it holds', () => {
    for (const [name, t] of Object.entries(TYPE)) {
      expect([400, 500], `${name} is not one of the two weights`).toContain(t.weight)
    }
    expect(typeStyle(TYPE.pageTitle)).toEqual({ fontSize: '30px', fontWeight: 500 })
    expect(typeStyle(TYPE.body)).toEqual({ fontSize: '14px', fontWeight: 400 })
    expect(typeStyle(TYPE.context)).toEqual({ fontSize: '12px', fontWeight: 400, lineHeight: 1.65 })
  })

  it('the weight checker is not vacuous', () => {
    const CLASS = /(?:^|[\s'"`:{])font-(semibold|bold|extrabold|black)\b/
    expect(CLASS.test('  className="font-semibold text-navy"')).toBe(true)
    expect(CLASS.test('  className="font-heading"')).toBe(false)
  })

  it('sentence case: no all-caps utility survives on the surface', () => {
    const offences: string[] = []
    for (const f of files) {
      const src = withoutComments(read(f))
      for (const [i, line] of Array.from(src.split('\n').entries())) {
        if (/(?:^|[\s'"`:{])uppercase\b/.test(line)) offences.push(`${f}:${i + 1}`)
      }
    }
    expect(offences, `all caps on the board:\n${offences.join('\n')}`).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the stage column', () => {
  const board = read('components/admin/DealsBetaBoard.tsx')

  it('THE COUNT PILL IS NOT RIGHT-ALIGNED: it sits beside the name', () => {
    // Right-aligning the count puts it against the next column, where it reads
    // as belonging to that one instead. The pill must therefore carry no
    // auto-margin and no justify-end.
    const at = board.indexOf('data-testid={`beta-count-${stage.code}`}')
    expect(at, 'the count pill was not found').toBeGreaterThan(0)
    // The element that holds it, from the opening of its span back to the row.
    const open = board.lastIndexOf('<span', at)
    const pill = board.slice(open, at)
    expect(pill).not.toMatch(/ml-auto/)
    expect(pill).not.toMatch(/justify-end/)
    expect(pill).not.toMatch(/text-right/)
    // And the row it sits in does not push it away either.
    const rowStart = board.lastIndexOf('<div className="flex items-center gap-2">', open)
    expect(board.slice(rowStart, open)).not.toMatch(/ml-auto|justify-between/)
  })

  it('the stage name is navy, never the phase hue', () => {
    // Michael rejected coloured headings: they are not his brand.
    expect(board).toMatch(/typeStyle\(TYPE\.stageName\), color: TEXT\.navy/)
    expect(board).not.toMatch(/color: skin\.accent/)
  })

  it('the 4px rule carries the phase hue and comes from the token', () => {
    expect(board).toMatch(/height: `\$\{STROKE\.stageRule\}px`/)
    expect(board).toMatch(/background: skin\.accent/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the countdown: four states, and only two are red', () => {
  const TODAY = '2026-08-06'
  const at = (closingDate: string | null, stageCategory: string | null = 'open') =>
    closingCountdown({ closingDate, todayYMD: TODAY, stageCategory })

  it('more than fourteen days out is plain, and says how far', () => {
    const c = at('2026-10-06')
    expect(c.state).toBe('far')
    expect(c.urgent).toBe(false)
    expect(c.label).toBe('61 days out')
  })

  it('inside fourteen days is RED, and the boundary is inclusive', () => {
    expect(at('2026-08-20').state).toBe('soon')
    expect(at('2026-08-20').urgent).toBe(true)
    expect(at('2026-08-20').label).toBe('14 days out')
    // One day outside the window is not red.
    expect(at('2026-08-21').state).toBe('far')
    expect(at('2026-08-21').urgent).toBe(false)
    expect(CLOSING_URGENT_DAYS).toBe(14)
  })

  it('one day out reads in the singular, and today reads as today', () => {
    expect(at('2026-08-07').label).toBe('1 day out')
    expect(at('2026-08-06').label).toBe('Closing today')
  })

  it('a passed closing on an OPEN file is RED', () => {
    const c = at('2026-04-01')
    expect(c.state).toBe('passed')
    expect(c.urgent).toBe(true)
    expect(c.label).toBe('Closing passed')
  })

  it('a passed closing on a TERMINAL file is not an alarm', () => {
    // Michael ruled on this 2026-08-06. Applying the passed state literally
    // painted 75 of 97 board cards red, 59 of them funded files whose closing
    // correctly already happened. Red has to keep meaning "this should have
    // closed and did not".
    const c = at('2026-06-12', 'terminal_won')
    expect(c.state).toBe('closed')
    expect(c.urgent).toBe(false)
    expect(c.label).toMatch(/^Closed /)
    expect(at('2026-06-12', 'terminal_lost').urgent).toBe(false)
    // The rule keys on the record layer's own vocabulary, not on a stage code.
    expect(isTerminalCategory('terminal_won')).toBe(true)
    expect(isTerminalCategory('terminal_lost')).toBe(true)
    expect(isTerminalCategory('open')).toBe(false)
    expect(isTerminalCategory(null)).toBe(false)
  })

  it('no date at all recedes rather than alarming', () => {
    for (const v of [null, undefined, '']) {
      const c = closingCountdown({ closingDate: v, todayYMD: TODAY, stageCategory: 'open' })
      expect(c.state).toBe('no_date')
      expect(c.urgent).toBe(false)
      expect(c.label).toBe('No date')
    }
  })

  it('RED FIRES ON EXACTLY TWO STATES AND NO OTHERS', () => {
    const cases: [string | null, string | null][] = [
      ['2026-10-06', 'open'],
      ['2026-08-20', 'open'],
      ['2026-08-06', 'open'],
      ['2026-04-01', 'open'],
      ['2026-04-01', 'terminal_won'],
      [null, 'open'],
    ]
    const urgentStates = new Set(
      cases
        .map(([d, c]) => closingCountdown({ closingDate: d, todayYMD: TODAY, stageCategory: c }))
        .filter(c => c.urgent)
        .map(c => c.state),
    )
    expect(urgentStates).toEqual(new Set(['soon', 'passed']))
  })

  it('a daylight-saving boundary never shifts the count by one', () => {
    // Toronto springs forward on 2026-03-08 and falls back on 2026-11-01.
    expect(daysBetweenYMD('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetweenYMD('2026-10-31', '2026-11-02')).toBe(2)
    expect(daysBetweenYMD('not a date', '2026-01-01')).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the fold: what lets twenty-eight stages read on one screen', () => {
  const stage = (code: string) => ({ code })

  it('splits a phase into the stages that render and the ones that fold', () => {
    const cols = ['a', 'b', 'c', 'd'].map(stage)
    const counts: Record<string, number> = { a: 3, b: 0, c: 1, d: 0 }
    const { occupied, empty } = foldStages(cols, c => counts[c.code] ?? 0)
    expect(occupied.map(c => c.code)).toEqual(['a', 'c'])
    expect(empty.map(c => c.code)).toEqual(['b', 'd'])
  })

  it('the fold line reads as a sentence, and is silent when nothing folds', () => {
    expect(emptyStagesNote(0)).toBeNull()
    expect(emptyStagesNote(1)).toBe('One more stage in this phase has no files.')
    expect(emptyStagesNote(3)).toBe('Three more stages in this phase have no files.')
    // Beyond the spelled range it uses digits rather than inventing prose.
    expect(emptyStagesNote(28)).toBe('28 more stages in this phase have no files.')
    expect(spellSmall(7)).toBe('Seven')
    expect(spellSmall(99)).toBe('99')
  })

  it('a phase with nothing in it folds to its header line', () => {
    expect(phaseIsQuiet(0)).toBe(true)
    expect(phaseIsQuiet(1)).toBe(false)
  })

  it('the board renders every phase rather than one at a time', () => {
    const board = withoutComments(read('components/admin/DealsBetaBoard.tsx'))
    expect(board).toMatch(/ordered\.map\(phase =>/)
    // The phase selector and the collapse control are both gone with the row
    // they existed to survive.
    expect(board).not.toMatch(/parseCollapsed|toggleCollapsed/)
    expect(board).not.toMatch(/activePhase/)
    expect(read('app/portal/admin/deals-beta/page.tsx')).not.toMatch(/searchParams\?\.collapsed/)
  })

  it('the stage grid WRAPS rather than scrolling sideways', () => {
    // This is the whole point of the restructure: the board must not overflow
    // horizontally at any width.
    const board = withoutComments(read('components/admin/DealsBetaBoard.tsx'))
    expect(board).toMatch(/repeat\(auto-fit, minmax\(\d+px, 1fr\)\)/)
    expect(board).not.toMatch(/overflow-x-auto/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('a null probability is still never a zero', () => {
  it('a phase whose stages carry no probability gets NO weighted figure', () => {
    // Intake and Monitor carry null on every stage. Null is not zero, and a
    // fabricated zero in a phase header would be a forecast that lies.
    const none = phaseWeighted([{ code: 'a', probability: null }, { code: 'b' }], () => 500000)
    expect(none).toBeNull()
  })

  it('a phase sums only the stages that are priced', () => {
    const w = phaseWeighted(
      [
        { code: 'a', probability: 50 },
        { code: 'b', probability: null },
        { code: 'c', probability: 100 },
      ],
      code => (code === 'a' ? 200000 : code === 'b' ? 999999 : 100000),
    )
    expect(w).not.toBeNull()
    // 200000 at 50% plus 100000 at 100%. The null stage contributes nothing.
    expect(w!.weighted).toBe(200000)
    expect(w!.isProjection).toBe(true)
  })
})
