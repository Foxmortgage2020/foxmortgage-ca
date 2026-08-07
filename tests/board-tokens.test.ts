// The Deals (Beta) design tokens, and the rules that keep the board on them
// (handoff 58, replacing handoff 57's version).
//
// WHAT MAKES THIS DIFFERENT FROM A LIST OF EXPECTED VALUES: most of it reads
// the DESIGN EXPORT and compares the token module against it. The export is the
// visual source of truth, so a token that drifts away from it fails here rather
// than being noticed on screen three sessions later. Prose does not hold; a
// diff against the artefact does.
//
//   1. NO HARDCODED HEX outside lib/design-tokens.ts, walked as a directory.
//   2. THE TOKENS MATCH THE EXPORT, colour for colour, read out of the file.
//   3. NAVY AND LIME DO NOT match the export, and DO match the repo's own
//      Tailwind tokens. Michael ruled on both 2026-08-06.
//   4. FOUR WEIGHTS, 400 500 600 700. This REPLACES handoff 57's two-weight
//      test, which the export legitimately supersedes. It is a replacement
//      rather than a deletion: anything outside the four still fails.
//   5. The card's left bar carries exactly two values.
//   6. Only one phase expands at a time, which is what makes the geometry work.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import tailwind from '../tailwind.config'
import {
  MISSING_NOTE,
  MISSING_VALUE,
  PHASE_HUE,
  RADIUS,
  ROLE,
  STROKE,
  SURFACE,
  TEXT,
  TYPE,
  phaseHue,
  stageTone,
  typeStyle,
} from '@/lib/design-tokens'
import {
  CLOSING_URGENT_DAYS,
  PHASE_WORD,
  STAGE_WORD,
  cardBar,
  closingCountdown,
  daysBetweenYMD,
  isTerminalCategory,
  openPhaseCode,
  phaseFigures,
  phaseWord,
  stageShowsCards,
  stageShowsSummary,
  stageWord,
} from '@/lib/board-layout'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** The design export, unescaped. It is a bundled page, so the design lives
 *  inside an escaped JS string; the constants block reads cleanly once the
 *  escaping is undone. */
function exportSource(): string {
  const raw = read('docs/design/Fox_Mortgage_Pipeline_Board.html')
  return raw.replace(/\\u002F/g, '/').replace(/\\"/g, '"').replace(/\\n/g, '\n')
}

/** The export's named colour constants, read rather than transcribed. */
function exportConstants(): Record<string, string> {
  const src = exportSource()
  const line = /const NAVY='([^']+)',\s*DIM='([^']+)',\s*FAINT='([^']+)',\s*GHOST='([^']+)',\s*MISS='([^']+)',\s*RED='([^']+)',\s*LIME='([^']+)',\s*FOREST='([^']+)'/.exec(src)
  if (!line) throw new Error('the export no longer carries its constants block in the expected shape')
  const [, NAVY, DIM, FAINT, GHOST, MISS, RED, LIME, FOREST] = line
  return { NAVY: NAVY!, DIM: DIM!, FAINT: FAINT!, GHOST: GHOST!, MISS: MISS!, RED: RED!, LIME: LIME!, FOREST: FOREST! }
}

// ─────────────────────────────────────────────────────────────────────────────
describe('the export is the source of truth, and the tokens match it', () => {
  const K = exportConstants()

  it('the export is present and parseable, so this suite is not vacuous', () => {
    expect(Object.keys(K)).toHaveLength(8)
    expect(K.RED).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('every colour except navy and lime is taken from the export verbatim', () => {
    expect(TEXT.dim).toBe(K.DIM)
    expect(TEXT.dim).toBe(K.FAINT) // the export gives DIM and FAINT one value
    expect(TEXT.ghost).toBe(K.GHOST)
    expect(TEXT.missing).toBe(K.MISS)
    expect(ROLE.red).toBe(K.RED)
    expect(ROLE.forest).toBe(K.FOREST)
  })

  it('NAVY AND LIME COME FROM THE REPO, not from the export', () => {
    // The export was produced from screenshots of the live product, so its
    // navy and lime are a second-hand read of colours this repo already owns,
    // and both had drifted. Michael ruled on the replacements.
    const colors = (tailwind as any).theme.extend.colors
    expect(TEXT.navy).toBe(colors.navy.DEFAULT)
    expect(ROLE.lime).toBe(colors.decision.DEFAULT)
    // And they are genuinely NOT the export's, which is the whole point.
    expect(TEXT.navy).not.toBe(K.NAVY)
    expect(ROLE.lime).not.toBe(K.LIME)
  })

  it('the five phase hues are the export\'s, muted rather than saturated', () => {
    const src = exportSource()
    for (const [code, hex] of Object.entries(PHASE_HUE)) {
      expect(src.includes(hex), `${code} hue ${hex} is not in the export`).toBe(true)
    }
    expect(Object.keys(PHASE_HUE)).toEqual(['attract', 'intake', 'underwriting', 'fulfilment', 'monitor'])
    // A phase the record layer adds later still gets a tone.
    expect(phaseHue('something_new')).toMatch(/^#[0-9A-F]{6}$/i)
  })

  it('the surfaces and the two card rules are the export\'s', () => {
    const src = exportSource()
    // NOTE the canvas is NOT in this list any more: see the deviation test
    // below. Everything else on this surface is still the export's verbatim.
    for (const v of [SURFACE.border, SURFACE.hairline, SURFACE.chaseBg, TEXT.metaMono, TEXT.body, TEXT.faintMono]) {
      expect(src.includes(v), `${v} is not in the export`).toBe(true)
    }
  })

  it('THE CANVAS IS WHITE, the third deliberate deviation (handoff 59)', () => {
    // Michael's instruction after seeing the board on production: take the
    // background off every screen. The export's warm paper goes with it.
    expect(SURFACE.canvas).toBe('#FFFFFF')
    expect(SURFACE.canvas).not.toBe('#EFEDE8')
    expect(exportSource().includes('#EFEDE8'), 'the export still carries the tone we dropped').toBe(true)
    // White canvas under white cards only works because the card carries both
    // a border and a left colour bar. Both are still there.
    const card = read('components/admin/deals-beta/DealCard.tsx')
    expect(card).toMatch(/borderLeft: `\$\{STROKE\.cardBar\}px solid/)
    expect(card).toMatch(/border: `\$\{STROKE\.hairline\}px solid \$\{navyAlpha\(0\.11\)\}`/)
  })

  it('no page in the portal keeps a blue-grey ground', () => {
    // The one Michael actually meant was the Command Centre's `fog`.
    expect(read('components/admin/AdminShell.tsx')).toMatch(/min-h-screen bg-white font-ui/)
    expect(read('app/portal/PortalLayoutClient.tsx')).toMatch(/min-h-screen bg-white/)
    // `fog` survives ONLY as a hover tint on controls, never as a ground.
    const shell = read('components/admin/AdminShell.tsx')
    for (const line of shell.split('\n')) {
      if (/\bbg-fog\b/.test(line) && !line.trim().startsWith('//')) {
        expect(line, `bg-fog used as a ground: ${line.trim()}`).toMatch(/hover:bg-fog/)
      }
    }
  })

  it('a missing value is muted, italic AND dotted, all three at once', () => {
    // A gap in a column of monospaced figures has to be legible as a gap.
    expect(MISSING_VALUE.color).toBe(TEXT.missing)
    expect(MISSING_VALUE.fontStyle).toBe('italic')
    expect(MISSING_VALUE.textDecoration).toBe('underline dotted')
  })

  it('a SENTENCE ABOUT missing values is italic but NOT underlined (handoff 60)', () => {
    // "5 with no amount recorded" is a true statement about the phase, not a
    // gap standing in for a figure, and the dotted underline made it read as a
    // link to somewhere it does not go. Michael read it that way on production.
    expect(MISSING_NOTE.color).toBe(TEXT.missing)
    expect(MISSING_NOTE.fontStyle).toBe('italic')
    expect(MISSING_NOTE).not.toHaveProperty('textDecoration')
    // And the board actually uses it for that line rather than MISSING_VALUE.
    const board = read('components/admin/DealsBetaBoard.tsx')
    const at = board.indexOf('with no amount recorded')
    expect(board.slice(Math.max(0, at - 300), at)).toMatch(/MISSING_NOTE/)
  })

  it('THE STAGE HEADER GREY IS THE EXPORT\'S OWN PAPER TONE (handoff 60)', () => {
    // Michael asked for the light grey back so a column reads as one object.
    // Rather than invent a second grey, the header cap takes the value that WAS
    // the canvas until handoff 59 took the background off every screen: the
    // same grey he lost, scoped from the whole page down to the stage header.
    expect(SURFACE.stageHeader).toBe('#EFEDE8')
    expect(exportSource().includes(SURFACE.stageHeader)).toBe(true)
    // And it is emphatically NOT the canvas any more, which is the whole point.
    expect(SURFACE.canvas).not.toBe(SURFACE.stageHeader)
    // It is a warm neutral. It must never creep toward lime or navy.
    const [r, g, b] = [1, 3, 5].map(i => parseInt(SURFACE.stageHeader.slice(i, i + 2), 16))
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(16) // near-neutral
    expect(Math.min(r, g, b)).toBeGreaterThan(0xE0) // and genuinely light
  })
})

// ─────────────────────────────────────────────────────────────────────────────

/** THE FILE PAGE IS A DIFFERENT SURFACE AND KEEPS ITS CURRENT APPEARANCE, and
 *  the two shared controls render on it as well as here. A debt register, not a
 *  permission: it shrinks to nothing when the file page gets its own pass, and
 *  a NEW board file is covered by default because it is not on the list. */
const NOT_YET_PASSED = [
  'app/portal/admin/deals-beta/[dealId]/page.tsx',
  'components/admin/deals-beta/FileClient.tsx',
  'components/admin/deals-beta/FileCommitment.tsx',
  'components/admin/deals-beta/FileConditions.tsx',
  'components/admin/deals-beta/FileFlagStrip.tsx',
  'components/admin/deals-beta/FileOverview.tsx',
  'components/admin/deals-beta/FileTabs.tsx',
  'components/admin/deals-beta/TabEmpty.tsx',
  'components/admin/deals-beta/DealPreview.tsx',
  'components/admin/deals-beta/RecordWithdrawal.tsx',
  'components/admin/deals-beta/ReextractControl.tsx',
]

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
  out.push('components/admin/DealsBetaBoard.tsx')
  out.push('lib/board-layout.ts')
  out.push('lib/board-fonts.ts')
  out.push('lib/phase-palette.ts')
  return out.filter(f => !NOT_YET_PASSED.includes(f))
}

function withoutComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(l => (l.trim().startsWith('//') ? '' : l))
    .join('\n')
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g

describe('one module owns the colours', () => {
  const files = boardFiles()

  it('walks a real surface, so a later file is covered on the day it lands', () => {
    expect(files.length).toBeGreaterThanOrEqual(6)
    for (const f of NOT_YET_PASSED) expect(() => read(f)).not.toThrow()
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

  it('the checker is not vacuous', () => {
    expect("  style={{ color: '#BADA55' }}".match(HEX)).not.toBeNull()
    expect(withoutComments('// the old canvas was #EEF1F5').match(HEX)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('four weights, which REPLACES the two-weight rule', () => {
  const files = boardFiles()

  // Handoff 57's brief said two weights and pinned it. The export uses four,
  // and the export outranks the brief. This is a replacement rather than a
  // deletion: a weight outside the four still fails, and 800/900 still fail.
  const ALLOWED: number[] = [400, 500, 600, 700]

  it('every type token is one of the four', () => {
    for (const [name, t] of Object.entries(TYPE)) {
      expect(ALLOWED, `${name} carries weight ${t.weight}`).toContain(t.weight)
    }
  })

  it('the export itself uses exactly these four and nothing heavier', () => {
    const src = exportSource()
    const used = new Set(
      Array.from(src.matchAll(/font:\s*(\d{3})\s/g), m => Number(m[1])),
    )
    expect(Array.from(used).sort()).toEqual(ALLOWED)
  })

  it('NO WEIGHT ABOVE 700 anywhere on the board surface', () => {
    const CLASS = /(?:^|[\s'"`:{])font-(extrabold|black)\b/
    const NUMERIC = /fontWeight:\s*(\d{3})/g
    const offences: string[] = []
    for (const f of files) {
      const src = withoutComments(read(f))
      for (const [i, line] of Array.from(src.split('\n').entries())) {
        if (CLASS.test(line)) offences.push(`${f}:${i + 1} ${line.trim().slice(0, 80)}`)
        for (const m of Array.from(line.matchAll(NUMERIC))) {
          if (!ALLOWED.includes(Number(m[1]))) offences.push(`${f}:${i + 1} fontWeight ${m[1]}`)
        }
      }
    }
    expect(offences, `weights outside 400/500/600/700:\n${offences.join('\n')}`).toEqual([])
  })

  it('the type scale runs 7.5px to 21px, the export\'s range', () => {
    const sizes = Object.values(TYPE).map(t => t.size)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(7.5)
    expect(Math.max(...sizes)).toBeLessThanOrEqual(21)
  })

  it('typeStyle emits the right face: mono for figures, Hanken for everything else', () => {
    expect(typeStyle(TYPE.cardAmount).fontFamily).toMatch(/plex-mono/)
    expect(typeStyle(TYPE.kpiValue).fontFamily).toMatch(/plex-mono/)
    expect(typeStyle(TYPE.cardWho).fontFamily).toMatch(/hanken/)
    expect(typeStyle(TYPE.pageTitle)).toMatchObject({ fontSize: '21px', fontWeight: 600 })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('both faces load, and both survive failing', () => {
  const fonts = read('lib/board-fonts.ts')

  it('loads Hanken Grotesk and IBM Plex Mono through next/font, self-hosted', () => {
    expect(fonts).toMatch(/from 'next\/font\/google'/)
    expect(fonts).toMatch(/Hanken_Grotesk\(/)
    expect(fonts).toMatch(/IBM_Plex_Mono\(/)
  })

  it('both use display swap, so a slow font never leaves the board blank', () => {
    // Comments off: the header explains the swap and naming it is not using it.
    expect((withoutComments(fonts).match(/display: 'swap'/g) ?? []).length).toBe(2)
  })

  it('the fallback chain keeps figures MONOSPACED even if the webfont never arrives', () => {
    // If the mono fallback were a sans, a column of amounts would stop
    // aligning, which is the whole reason the face is there.
    const tokens = read('lib/design-tokens.ts')
    expect(tokens).toMatch(/--font-plex-mono\), ui-monospace/)
    expect(tokens).toMatch(/--font-hanken\), system-ui/)
  })

  it('the faces are scoped to this surface, not the root layout', () => {
    expect(read('app/layout.tsx')).not.toMatch(/Hanken|Plex/)
    expect(read('app/portal/admin/deals-beta/page.tsx')).toMatch(/BOARD_FONT_CLASS/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the card, and its left bar', () => {
  const card = read('components/admin/deals-beta/DealCard.tsx')

  it('THE BAR CARRIES EXACTLY TWO VALUES', () => {
    const far = closingCountdown({ closingDate: '2026-10-06', todayYMD: '2026-08-06', stageCategory: 'open' })
    const soon = closingCountdown({ closingDate: '2026-08-10', todayYMD: '2026-08-06', stageCategory: 'open' })
    const passed = closingCountdown({ closingDate: '2026-04-01', todayYMD: '2026-08-06', stageCategory: 'open' })
    const closed = closingCountdown({ closingDate: '2026-04-01', todayYMD: '2026-08-06', stageCategory: 'terminal_won' })
    expect(cardBar(soon)).toBe('needs')
    expect(cardBar(passed)).toBe('needs')
    expect(cardBar(far)).toBe('controlled')
    expect(cardBar(closed)).toBe('controlled')
  })

  it('lime renders on the bar and the status square, and nowhere else on the card', () => {
    const src = withoutComments(card)
    const limeUses = src.match(/ROLE\.lime/g) ?? []
    expect(limeUses.length).toBe(2) // the border-left, and the small square
    // Both are gated on the SAME bar value, so they cannot disagree.
    expect(src).toMatch(/bar === 'needs' \? ROLE\.lime : TEXT\.navy/)
  })

  it('red is the countdown only, inside the card', () => {
    const src = withoutComments(card)
    const redUses = src.match(/ROLE\.red/g) ?? []
    expect(redUses.length).toBe(1)
    expect(src).toMatch(/countdown\.urgent \? ROLE\.red/)
  })

  it('the card carries NO projection green, and the figure carries no lime', () => {
    const imports = card.split('\n').filter(l => /^\s*import\b|^\s+[A-Za-z{}, ]+from '/.test(l)).join('\n')
    expect(imports).not.toMatch(/PROJECTION_GREEN|ProjectionFigure/)
    const figure = read('components/admin/deals-beta/ProjectionFigure.tsx')
    expect(figure).not.toMatch(/ROLE\.lime|bg-decision/)
  })

  it('every tier the export drew is on the card', () => {
    for (const marker of ['TYPE.cardMeta', 'TYPE.cardWho', 'TYPE.cardAmount', 'TYPE.cardAddress', 'TYPE.cardDue', 'TYPE.cardInStage', 'TYPE.cardChase']) {
      expect(card, `${marker} is missing from the card`).toContain(marker)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('three levels, and only one phase open at a time', () => {
  const board = withoutComments(read('components/admin/DealsBetaBoard.tsx'))

  it('the five phases render as ONE row', () => {
    expect(board).toMatch(/data-testid="beta-phases"/)
    expect(board).toMatch(/repeat\(auto-fit, minmax\(\d+px, 1fr\)\)/)
  })

  it('exactly one phase expands, and an unknown code opens nothing', () => {
    const phases = [{ code: 'underwriting' }, { code: 'fulfilment' }]
    expect(openPhaseCode('fulfilment', phases)).toBe('fulfilment')
    expect(openPhaseCode('nonsense', phases)).toBeNull()
    expect(openPhaseCode(null, phases)).toBeNull()
    expect(openPhaseCode(undefined, phases)).toBeNull()
    // The board renders at most one expanded section.
    expect((board.match(/<ExpandedPhase/g) ?? []).length).toBe(1)
  })

  it('EVERY FILE RENDERS, with no scroll box inside a column (handoff 59)', () => {
    // Michael: if Submitted holds two hundred files he wants two hundred
    // listed down the page. He will scroll or use the search at the top. The
    // tall page is a chosen outcome now, and it was never what made the old
    // board 24,000px long: that was five phases stacked at once.
    expect(board).not.toMatch(/maxHeight: '\d+vh'/)
    expect(board).not.toMatch(/overflow-y-auto/)
    // Nothing is capped or sliced.
    expect(board).toMatch(/inColumn\.map\(d =>/)
    expect(board).not.toMatch(/inColumn\.slice\(/)
  })

  it('the STAGE ROW scrolls sideways, and it is the only thing that does', () => {
    // This deliberately reverses handoff 57's no-horizontal-scroll rule, for
    // this row and nothing else. The reasoning is better than the rule it
    // replaces: the stage set is bounded at seven, so sideways scrolling here
    // is finite and predictable, while the file set is unbounded, so files
    // belong on the vertical axis.
    expect((board.match(/overflow-x-auto/g) ?? []).length).toBe(1)
    expect(board).toMatch(/data-testid=\{`beta-stage-row-\$\{phase\.code\}`\}/)
    // And it does NOT wrap: wrapping was the thing being fixed.
    const at = board.indexOf('beta-stage-row-')
    const row = board.slice(Math.max(0, at - 300), at)
    expect(row).toMatch(/flex items-start gap-2 overflow-x-auto/)
    expect(row).not.toMatch(/flex-wrap/)
    // The column is a FIXED width, so the card's shape does not change with
    // however many stages a phase happens to carry.
    expect(board).toMatch(/const STAGE_COLUMN_WIDTH = \d+/)
    expect(board).toMatch(/width: `\$\{STAGE_COLUMN_WIDTH\}px`/)
    // NOTHING SLICES THE LIST TO WHAT FITS. Four of Fulfilment's five columns
    // are visible at 1512 and the fifth is off the right edge, which is the row
    // working rather than a stage going missing.
    expect(board).toMatch(/cols\.map\(\(col, i\) =>/)
    expect(board).not.toMatch(/cols\.slice\(/)
  })

  it('THE PHASE ROW STICKS BELOW THE SHELL\'S OWN TOPBAR, not at zero (handoff 60)', () => {
    // THE DEFECT THIS PINS: `AdminShell` renders a 56px white header at
    // `sticky top-0 z-40`. The phase row was also stuck at top:0, at z-20, so
    // the shell's bar painted over the top 56px of every tile the moment the
    // page scrolled and the tiles read as sliced. Nothing was clipping
    // anything; two sticky elements shared an offset and z-index decided it.
    expect(board).toMatch(/className="sticky z-20 grid gap-2"/)
    expect(board).not.toMatch(/className="sticky top-0 z-20/)
    expect(board).toMatch(/const ADMIN_TOPBAR_HEIGHT = 56/)
    expect(board).toMatch(/top: `\$\{ADMIN_TOPBAR_HEIGHT\}px`/)
    // THE COUPLING IS REAL, so it is asserted rather than trusted: the day the
    // shell's bar changes height, this fails instead of the tiles re-slicing.
    const shell = read('components/admin/AdminShell.tsx')
    expect(shell).toMatch(/className="sticky top-0 z-40"/)
    expect(shell).toMatch(/bg-white border-b border-hairline flex items-center gap-2 h-14/)
    // It still needs an opaque ground or cards scroll through it.
    const at = board.indexOf('data-testid="beta-phases"')
    expect(board.slice(Math.max(0, at - 500), at)).toMatch(/background: SURFACE\.canvas/)
  })

  it('A STAGE COLUMN IS A BORDERED UNIT WITH A GREY CAP AND A WHITE BODY (handoff 60)', () => {
    // The columns used to be white boxes on a white canvas, so adjacent ones
    // merged into a single field of cards. The border says where a column
    // begins and ends; the grey cap says which stage it is; the cards below it
    // stay on white, and the canvas and the gaps between columns stay white.
    const at = board.indexOf('data-testid={`beta-col-${stage.code}`}')
    expect(at).toBeGreaterThan(-1)
    const col = board.slice(Math.max(0, at - 1200), at + 2500)
    expect(col).toMatch(/border: hair/)
    expect(col).toMatch(/borderRadius: radius\(RADIUS\.card\)/)
    expect(col).toMatch(/background: SURFACE\.stageHeader/)
    expect(col).toMatch(/data-testid=\{`beta-col-head-\$\{stage\.code\}`\}/)
    // THE GREY IS THE HEADER'S ALONE. The column body and the board around it
    // are the panel white.
    expect((board.match(/SURFACE\.stageHeader/g) ?? []).length).toBe(1)
    // THE 4px PHASE-HUE RULE STAYS, full width across the top.
    expect(col).toMatch(/height: `\$\{STROKE\.stageRule\}px`/)
    expect(col).toMatch(/background: tone/)
    expect(STROKE.stageRule).toBe(4)
    // NO NEW CLIPPING ANCESTOR around a column: the cap rounds its own corners.
    expect(col).not.toMatch(/overflow: 'hidden'|overflow-hidden/)
  })

  it('a stage holding nothing still teaches what happens there', () => {
    expect(board).toMatch(/stage\.description && \(/)
    // And the phase blurb no longer truncates mid-word (handoff 60).
    expect(board).not.toMatch(/line-clamp/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('one vocabulary now: phases contain stages (handoff 60)', () => {
  // THIS REPLACES THE VOCABULARY-SEAM TEST, and the replacement is Michael's
  // call rather than this session's. Handoffs 58 and 59 carried his words on
  // screen ("stage" for a database phase, "sub-stage" for a database stage) and
  // the database's in the code, and the old test pinned exactly that. Reading
  // the live board he settled it the other way: the database's terms
  // everywhere, and "sub-stage" is not a word this product uses.
  //
  // It is a replacement rather than a deletion. The words are still owned by
  // one module, the seam is still the only place they are defined, and the copy
  // is still asserted to come from it rather than from string literals.

  it('a database PHASE is a phase on screen, a database STAGE is a stage', () => {
    expect(PHASE_WORD).toBe('phase')
    expect(STAGE_WORD).toBe('stage')
    expect(phaseWord(1)).toBe('phase')
    expect(phaseWord(3)).toBe('phases')
    expect(stageWord(1)).toBe('stage')
    expect(stageWord(3)).toBe('stages')
  })

  it('NOT ONE "sub-stage" SURVIVES anywhere the board renders or computes', () => {
    // Comments off, because the word has to survive in exactly one place: the
    // paragraph in lib/board-layout.ts that records why it is gone. Everything
    // a person can read on screen, and every identifier and string the board
    // computes with, is swept.
    const offences: string[] = []
    for (const f of boardFiles()) {
      for (const [i, line] of Array.from(withoutComments(read(f)).split('\n').entries())) {
        if (/sub[- ]?stages?/i.test(line)) offences.push(`${f}:${i + 1} ${line.trim().slice(0, 90)}`)
      }
    }
    expect(offences, `"sub-stage" survives on the board:\n${offences.join('\n')}`).toEqual([])
    // The one surviving mention is the record of the change, and it stays.
    expect(read('lib/board-layout.ts')).toMatch(/SUB-STAGES/)
    // And the check is not vacuous.
    expect(/sub[- ]?stages?/i.test('  <p>the sub-stage row</p>')).toBe(true)
  })

  it('the rendered copy comes from the seam, never from a literal', () => {
    const board = read('components/admin/DealsBetaBoard.tsx')
    expect(board).toMatch(/\{stageWord\(cols\.length\)\}/)
    expect(board).toMatch(/Pick a \{PHASE_WORD\} above/)
  })

  it('and the code still says phase and stage', () => {
    // Nothing renamed a column or a variable, then or now.
    const board = read('components/admin/DealsBetaBoard.tsx')
    expect(board).toMatch(/columnsForPhase|dealsInStage/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the countdown: four states, and only two are red', () => {
  const TODAY = '2026-08-06'
  const at = (d: string | null, c: string | null = 'open') =>
    closingCountdown({ closingDate: d, todayYMD: TODAY, stageCategory: c })

  it('plain beyond the window, red inside it, red when passed on an open file', () => {
    expect(at('2026-10-06')).toMatchObject({ state: 'far', urgent: false, label: '61 days out' })
    expect(at('2026-08-20')).toMatchObject({ state: 'soon', urgent: true, label: '14 days out' })
    expect(at('2026-08-21').state).toBe('far')
    expect(at('2026-08-07').label).toBe('1 day out')
    expect(at('2026-08-06').label).toBe('Closing today')
    expect(at('2026-04-01')).toMatchObject({ state: 'passed', urgent: true })
    expect(CLOSING_URGENT_DAYS).toBe(14)
  })

  it('a passed closing on a TERMINAL file is not an alarm', () => {
    expect(at('2026-06-12', 'terminal_won')).toMatchObject({ state: 'closed', urgent: false })
    expect(at('2026-06-12', 'terminal_lost').urgent).toBe(false)
    expect(isTerminalCategory('terminal_won')).toBe(true)
    expect(isTerminalCategory('open')).toBe(false)
  })

  it('no date recedes rather than alarming', () => {
    expect(at(null)).toMatchObject({ state: 'no_date', urgent: false, label: 'No date' })
  })

  it('RED FIRES ON EXACTLY TWO STATES', () => {
    const states = new Set(
      [['2026-10-06', 'open'], ['2026-08-20', 'open'], ['2026-04-01', 'open'], ['2026-04-01', 'terminal_won'], [null, 'open']]
        .map(([d, c]) => at(d as string | null, c as string))
        .filter(c => c.urgent)
        .map(c => c.state),
    )
    expect(states).toEqual(new Set(['soon', 'passed']))
  })

  it('a daylight-saving boundary never shifts the count', () => {
    expect(daysBetweenYMD('2026-03-07', '2026-03-09')).toBe(2)
    expect(daysBetweenYMD('2026-10-31', '2026-11-02')).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('a null probability is still never a zero', () => {
  it('a phase whose stages carry no probability gets NO weighted figure', () => {
    const f = phaseFigures([{ code: 'a', probability: null }, { code: 'b' }], () => [
      { mortgage_amount: 500000 },
    ])
    expect(f.count).toBe(2)
    expect(f.weighted).toBeNull()
  })

  it('a phase sums only the priced stages, and counts what has no amount', () => {
    const f = phaseFigures(
      [{ code: 'a', probability: 50 }, { code: 'b', probability: null }, { code: 'c', probability: 100 }],
      code =>
        code === 'a'
          ? [{ mortgage_amount: 200000 }]
          : code === 'b'
            ? [{ mortgage_amount: 999999 }]
            : [{ mortgage_amount: 100000 }, { mortgage_amount: null }],
    )
    expect(f.weighted).toBe(200000)
    expect(f.missingAmounts).toBe(1)
    expect(f.count).toBe(4)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('BANKED MONEY IS NEVER WEIGHTED (handoff 60)', () => {
  // THE DEFECT: Fulfilment's tile read 74 files, $39,938,378 and a weighted
  // figure of $38,826,088. Sixty-six of those files sit in `funded`, a terminal
  // stage at probability 100, so the number labelled "weighted" was almost
  // entirely money already in the bank and only eight files were in flight.

  /** Fulfilment's real shape, read live through portal_readonly 2026-08-06. */
  const FULFILMENT = [
    { code: 'submitted', probability: 45, category: 'open' },
    { code: 'lender_response', probability: 90, category: 'open' },
    { code: 'conditions', probability: 95, category: 'open' },
    { code: 'lawyer_closing', probability: 98, category: 'open' },
    { code: 'funded', probability: 100, category: 'terminal_won' },
  ]

  it('splits in flight from funded, and weights only what is still moving', () => {
    const f = phaseFigures(FULFILMENT, code =>
      code === 'submitted'
        ? [{ mortgage_amount: 1_000_000 }, { mortgage_amount: null }]
        : code === 'lender_response'
          ? [{ mortgage_amount: 500_000 }]
          : code === 'funded'
            ? [{ mortgage_amount: 30_000_000 }, { mortgage_amount: 5_000_000 }]
            : [],
    )
    expect(f.inFlightCount).toBe(3)
    expect(f.inFlightValue).toBe(1_500_000)
    expect(f.fundedCount).toBe(2)
    expect(f.fundedValue).toBe(35_000_000)
    // 1,000,000 * 45% + 500,000 * 90%. The 35M of funded money is nowhere in it.
    expect(f.weighted).toBe(900_000)
    // The phase total is still true, and still says what it is missing.
    expect(f.count).toBe(5)
    expect(f.value).toBe(36_500_000)
    expect(f.missingAmounts).toBe(1)
  })

  it('a phase of nothing but terminal stages produces NO weighted figure at all', () => {
    // Not a zero. There is nothing in flight to forecast, so there is no
    // forecast, and `priced` counts in-flight priced stages only.
    const f = phaseFigures([{ code: 'funded', probability: 100, category: 'terminal_won' }], () => [
      { mortgage_amount: 800_000 },
    ])
    expect(f.weighted).toBeNull()
    expect(f.fundedValue).toBe(800_000)
    expect(f.inFlightCount).toBe(0)
  })

  it('IT KEYS ON CATEGORY, never on a stage code', () => {
    // So a terminal stage the record layer adds later behaves correctly on the
    // day it lands, with no change here.
    const lost = phaseFigures([{ code: 'anything_at_all', probability: 0, category: 'terminal_lost' }], () => [
      { mortgage_amount: 250_000 },
    ])
    expect(lost.fundedCount).toBe(1)
    expect(lost.weighted).toBeNull()
    // A stage with no category recorded is treated as still moving, which is
    // the safe reading: it keeps the file in the forecast rather than silently
    // banking it.
    const unknown = phaseFigures([{ code: 'x', probability: 50 }], () => [{ mortgage_amount: 100_000 }])
    expect(unknown.inFlightCount).toBe(1)
    expect(unknown.weighted).toBe(50_000)
  })

  it('the tile renders the split, and only where there is something to split', () => {
    const board = read('components/admin/DealsBetaBoard.tsx')
    expect(board).toMatch(/figures\.fundedCount === 0 \? \(/)
    expect(board).toMatch(/data-testid=\{`beta-phasefunded-\$\{phase\.code\}`\}/)
    // The weighted figure the tile prints is the in-flight one, by construction:
    // there is only one `weighted` on the object and it is computed that way.
    expect(board).not.toMatch(/figures\.value \* /)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the stage tone ramp', () => {
  it('deepens across a phase and never invents a per-stage colour', () => {
    const first = stageTone('underwriting', 0, 6)
    const last = stageTone('underwriting', 5, 6)
    expect(first).toContain(PHASE_HUE.underwriting)
    expect(last).toContain(PHASE_HUE.underwriting)
    expect(first).not.toBe(last)
    // A single-stage phase sits at full strength rather than dividing by zero.
    expect(stageTone('underwriting', 0, 1)).toBe(PHASE_HUE.underwriting)
  })

  it('the shape values are the export\'s', () => {
    expect(RADIUS.card).toBe(7)
    expect(RADIUS.chip).toBe(6)
    expect(RADIUS.pill).toBe(20)
    expect(STROKE.cardBar).toBe(4)
    expect(STROKE.hairline).toBe(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('A FINISHED STAGE SUMMARISES RATHER THAN LISTS (handoff 61)', () => {
  const working = { category: 'open', fileCount: 200, expanded: false }
  const funded = { category: 'terminal_won', fileCount: 66, expanded: false }

  it('a stage being WORKED always lists every file, however many', () => {
    // This is handoff 59's rule and handoff 61 does not touch it. Two hundred
    // files in a working stage is two hundred cards, with no scroll box.
    expect(stageShowsCards(working)).toBe(true)
    expect(stageShowsSummary(working)).toBe(false)
    expect(stageShowsCards({ ...working, expanded: true })).toBe(true)
  })

  it('a FINISHED stage folds to a summary, and unfolds to every file', () => {
    expect(stageShowsCards(funded)).toBe(false)
    expect(stageShowsSummary(funded)).toBe(true)
    // Unfolded it renders the cards, and the summary stays as the way back.
    expect(stageShowsCards({ ...funded, expanded: true })).toBe(true)
    expect(stageShowsSummary({ ...funded, expanded: true })).toBe(true)
  })

  it('both terminal categories fold, won and lost alike', () => {
    expect(stageShowsCards({ category: 'terminal_lost', fileCount: 23, expanded: false })).toBe(false)
    expect(stageShowsCards({ category: 'terminal_won', fileCount: 23, expanded: false })).toBe(false)
  })

  it('a finished stage holding NOTHING does not grow a control that does nothing', () => {
    const empty = { category: 'terminal_won', fileCount: 0, expanded: false }
    expect(stageShowsSummary(empty)).toBe(false)
    expect(stageShowsCards(empty)).toBe(true)
  })

  it('the rule agrees with the countdown\'s terminal test, which is its whole point', () => {
    // One definition of "finished" on this board. If isTerminalCategory ever
    // changes, this rule moves with it rather than drifting apart from it.
    for (const c of ['terminal_won', 'terminal_lost', 'open', null, undefined, 'anything_else']) {
      const folds = !stageShowsCards({ category: c, fileCount: 5, expanded: false })
      expect(folds).toBe(isTerminalCategory(c))
    }
  })

  it('NO STAGE CODE APPEARS IN THE RULE, so a terminal stage added later just works', () => {
    // The defect this guards against is the one handoff 57 already fixed once:
    // a hardcoded stage list silently misclassifies whatever arrives next, and
    // here a misclassification would HIDE LIVE WORK.
    const rule = read('lib/board-layout.ts')
      .slice(read('lib/board-layout.ts').indexOf('export function stageShowsCards'))
      .slice(0, 700)
    for (const code of ['funded', 'lost_to_competition', 'cancelled', 'declined', 'submitted']) {
      expect(rule).not.toContain(`'${code}'`)
    }
  })

  it('NO SCROLL BOX comes back with the disclosure', () => {
    // Handoff 61 hid the cards behind a press. It did not cap, slice, or put
    // them in a box that scrolls, which is the thing Michael ruled out.
    const board = read('components/admin/DealsBetaBoard.tsx')
    const body = board.slice(board.indexOf('function StageColumn'))
    expect(body).not.toMatch(/overflow-y|maxHeight|max-h-|overflow:\s*['"]?auto/)
  })

  it('the disclosure is a LINK, so the board keeps shipping no client JS', () => {
    // Expansion rides the URL exactly as the phase does. A handler here would
    // cross the client boundary and cost the board its server-component status.
    const board = read('components/admin/DealsBetaBoard.tsx')
    const body = board.slice(board.indexOf('function StageColumn'))
    expect(body).toContain('data-testid={`beta-col-disclose-${stage.code}`}')
    expect(body).not.toMatch(/onClick|useState|'use client'/)
  })
})
