// The Deals surface (B2b) — acceptance proofs:
//   1. Row building: the next action derives from the lifecycle step through
//      the ONE mapping in config/lifecycle.ts (never per-page copy), with
//      real destinations; funded rows carry no action (renewals own them).
//   2. Sorting: closing date ascending, dateless after dated, funded last.
//   3. THE SINGLE-LIME RULE, mechanical: exactly one lime button on the
//      list, on the top-most actionable row; zero when nothing is
//      actionable; manual no-route rows and funded rows never take it.
//   4. Complete & paid (Task 6): the live Compliance_Status vocabulary maps
//      totally; step states move honestly (a rejected package loops back).
//   5. The lime audit: on the new Deals components, lime renders ONLY on
//      the list's single-lime branch — the board, stepper, phase sections,
//      and compliance panel add zero.

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildDealRow,
  buildDealRows,
  clientFromDealName,
  closeoutStepStates,
  complianceStateFor,
  countLine,
  actionHref,
  listClosingAmber,
  markSingleLime,
  phaseCounts,
  boardPhaseColumns,
  sortDealRows,
  type DealSurfaceInput,
} from '../lib/deals-surface'
import { nextActionForJourney, journeyForStage } from '../config/lifecycle'

const input = (over: Partial<DealSurfaceInput>): DealSurfaceInput => ({
  roomId: 'room-1',
  fileRef: 'TEST-F000001',
  zohoDealName: 'TEST-F000001 — Testy Fixture',
  zohoStage: 'Approved',
  transactionType: null,
  roomStage: 'intake',
  column: 'conditions',
  mapped: true,
  positionFromRoom: false,
  amount: 500_000,
  closing: '2026-08-01',
  closeDays: 15,
  checklist: null,
  idleDays: 2,
  ...over,
})

describe('clientFromDealName', () => {
  it('strips the leading file ref and separator', () => {
    expect(clientFromDealName('BRXM-F000001 — Testy Fixture', 'BRXM-F000001')).toBe('Testy Fixture')
    expect(clientFromDealName('IFMS-F011111 - Plain Hyphen', 'IFMS-F011111')).toBe('Plain Hyphen')
  })
  it('passes ref-less names through whole and falls back to the ref', () => {
    expect(clientFromDealName('Marty McFixture — Purchase', 'DEMO-F0001')).toBe(
      'Marty McFixture — Purchase',
    )
    expect(clientFromDealName(null, 'DEMO-F0001')).toBe('DEMO-F0001')
  })
})

describe('the next action derives from the lifecycle step (one mapping)', () => {
  const actionFor = (zohoStage: string) =>
    buildDealRow(input({ zohoStage, column: 'intake' })).action

  it('the five briefed wirings land on their real destinations', () => {
    const collect = buildDealRow(input({ zohoStage: 'Collecting Documentation', column: 'evidence' }))
    expect(collect.action?.label).toBe('Chase documents')
    expect(collect.action?.roomSection).toBe('documents')
    expect(collect.action?.manual).toBe(false)

    const uw = buildDealRow(input({ zohoStage: 'Underwriting In Progress', column: 'evidence' }))
    expect(uw.action?.label).toBe('Generate lender notes')
    expect(uw.action?.roomSection).toBe('notes')

    const cond = buildDealRow(input({ zohoStage: 'Conditionally Approved', column: 'conditions' }))
    expect(cond.action?.label).toBe('Work conditions')
    expect(cond.action?.roomSection).toBe('conditions')

    const approved = buildDealRow(input({ zohoStage: 'Approved', column: 'conditions' }))
    expect(approved.action?.label).toBe('Confirm broker complete')
    expect(approved.action?.manual).toBe(true)
    expect(approved.action?.roomSection).toBe('room')

    const nudge = actionFor('Application Started')
    expect(nudge?.label).toBe('Nudge the application')
    expect(nudge?.manual).toBe(true)
    expect(nudge?.roomSection).toBeUndefined()
    expect(nudge?.note).toBeTruthy()
  })

  it('Broker Complete files point at the compliance package (Task 6 step)', () => {
    const bc = buildDealRow(input({ zohoStage: 'Broker Complete', column: 'ready' }))
    expect(bc.action?.label).toBe('Assemble compliance package')
    expect(bc.action?.manual).toBe(true)
    expect(bc.action?.roomSection).toBe('closeout')
  })

  it('funded rows carry no action (the list renders Moves to renewals)', () => {
    const funded = buildDealRow(input({ zohoStage: 'Funded', column: 'funded' }))
    expect(funded.funded).toBe(true)
    expect(funded.action).toBeNull()
  })

  it('a stage no step claims falls back by phase, never blank', () => {
    const j = journeyForStage({ stage: 'Qualification', shape: 'unknown', space: 'display' })
    expect(j.mapped).toBe(true)
    expect(nextActionForJourney(j)?.label).toBe('Nudge the application')
  })

  it('actionHref builds the room deep links', () => {
    const cond = buildDealRow(input({ zohoStage: 'Conditionally Approved' }))
    expect(actionHref('abc', cond.action!)).toBe('/portal/admin/deals/abc#conditions')
    const approved = buildDealRow(input({ zohoStage: 'Approved' }))
    expect(actionHref('abc', approved.action!)).toBe('/portal/admin/deals/abc')
    const nudge = buildDealRow(input({ zohoStage: 'Application Started' }))
    expect(actionHref('abc', nudge.action!)).toBeNull()
  })
})

describe('sorting: closing ascending, dateless after dated, funded last', () => {
  const rows = [
    buildDealRow(input({ roomId: 'a', fileRef: 'T-A', zohoStage: 'Funded', column: 'funded', closing: '2026-07-01', closeDays: -10 })),
    buildDealRow(input({ roomId: 'b', fileRef: 'T-B', closing: null, closeDays: null })),
    buildDealRow(input({ roomId: 'c', fileRef: 'T-C', closing: '2026-09-01', closeDays: 45 })),
    buildDealRow(input({ roomId: 'd', fileRef: 'T-D', closing: '2026-07-20', closeDays: 3 })),
  ]
  it('orders dated, then dateless, then funded', () => {
    expect(sortDealRows(rows).map(r => r.roomId)).toEqual(['d', 'c', 'b', 'a'])
  })
})

describe('THE SINGLE-LIME RULE (mechanical, tested)', () => {
  it('exactly one lime, on the top-most actionable row', () => {
    const rows = buildDealRows([
      // Top of the sort but NOT actionable (manual, no route).
      input({ roomId: 'nudge', fileRef: 'T-1', zohoStage: 'Application Started', column: 'intake', closing: '2026-07-18', closeDays: 1 }),
      // First actionable row in sort order: takes the lime.
      input({ roomId: 'cond', fileRef: 'T-2', zohoStage: 'Conditionally Approved', column: 'conditions', closing: '2026-07-25', closeDays: 8 }),
      // Actionable but later: outline.
      input({ roomId: 'uw', fileRef: 'T-3', zohoStage: 'Underwriting In Progress', column: 'evidence', closing: '2026-08-10', closeDays: 24 }),
      // Funded, sorted last, never lime.
      input({ roomId: 'fun', fileRef: 'T-4', zohoStage: 'Funded', column: 'funded', closing: '2026-06-01', closeDays: -46 }),
    ])
    expect(rows.filter(r => r.lime).length).toBe(1)
    expect(rows.find(r => r.lime)?.roomId).toBe('cond')
  })

  it('zero lime when no row is actionable', () => {
    const rows = buildDealRows([
      input({ roomId: 'n1', zohoStage: 'Application Started', column: 'intake' }),
      input({ roomId: 'f1', fileRef: 'T-9', zohoStage: 'Funded', column: 'funded' }),
    ])
    expect(rows.filter(r => r.lime).length).toBe(0)
  })

  it('a manual action WITH a destination can take the lime (top actionable)', () => {
    const rows = buildDealRows([
      input({ roomId: 'appr', zohoStage: 'Approved', column: 'conditions', closing: '2026-07-19', closeDays: 2 }),
      input({ roomId: 'cond', fileRef: 'T-2', zohoStage: 'Conditionally Approved', column: 'conditions', closing: '2026-08-01', closeDays: 15 }),
    ])
    expect(rows.find(r => r.lime)?.roomId).toBe('appr')
  })

  it('markSingleLime is idempotent over re-marked rows', () => {
    const rows = buildDealRows([
      input({ roomId: 'a', zohoStage: 'Approved' }),
      input({ roomId: 'b', fileRef: 'T-2', zohoStage: 'Approved' }),
    ])
    const again = markSingleLime(rows)
    expect(again.filter(r => r.lime).length).toBe(1)
  })
})

describe('closing amber and the strip', () => {
  it('ambers at ten days or fewer, including past-due', () => {
    expect(listClosingAmber(10)).toBe(true)
    expect(listClosingAmber(0)).toBe(true)
    expect(listClosingAmber(-3)).toBe(true)
    expect(listClosingAmber(11)).toBe(false)
    expect(listClosingAmber(null)).toBe(false)
  })

  it('phaseCounts renders four tiles with funded under Complete & paid', () => {
    const rows = buildDealRows([
      input({ roomId: 'a', zohoStage: 'Underwriting In Progress', column: 'evidence' }),
      input({ roomId: 'b', fileRef: 'T-2', zohoStage: 'Approved', column: 'conditions' }),
      input({ roomId: 'c', fileRef: 'T-3', zohoStage: 'Funded', column: 'funded' }),
    ])
    const tiles = phaseCounts(rows)
    expect(tiles.map(t => t.key)).toEqual(['intake', 'underwriting', 'fulfilment', 'complete_paid'])
    expect(tiles.find(t => t.key === 'underwriting')?.count).toBe(1)
    expect(tiles.find(t => t.key === 'complete_paid')?.count).toBe(1)
    // The board groups the same rows the same way.
    const cols = boardPhaseColumns(rows)
    expect(cols.map(c => c.rows.length)).toEqual(tiles.map(t => t.count))
  })

  it('an unmapped row is counted in no tile and stays loud on the row', () => {
    const row = buildDealRow(
      input({ zohoDealName: null, zohoStage: null, roomStage: 'mystery', column: 'evidence', mapped: false, positionFromRoom: true }),
    )
    expect(row.unmapped).toBe(true)
    expect(row.phase).toBeNull()
    expect(row.action).toBeNull()
    expect(phaseCounts([row]).reduce((n, t) => n + t.count, 0)).toBe(0)
  })

  it('countLine states the book and the clock', () => {
    const rows = buildDealRows([
      input({ roomId: 'a', closing: '2026-07-20', closeDays: 3 }),
      input({ roomId: 'b', fileRef: 'T-2', closing: '2026-09-01', closeDays: 45 }),
    ])
    expect(countLine(rows)).toBe('2 live files · 1 closes inside 10 days')
  })
})

describe('Complete & paid (Task 6): compliance states and step motion', () => {
  it('maps the live picklist vocabulary totally', () => {
    expect(complianceStateFor(null, true, true)).toBe('not_started')
    expect(complianceStateFor('Pending Review', true, true)).toBe('under_review')
    expect(complianceStateFor('In Review', true, true)).toBe('under_review')
    expect(complianceStateFor('Approved', true, true)).toBe('approved')
    expect(complianceStateFor('Rejected', true, true)).toBe('rejected')
    expect(complianceStateFor('Re-Review Needed', true, true)).toBe('rejected')
    // A future value the portal does not know reads as in motion.
    expect(complianceStateFor('Some Future Value', true, true)).toBe('under_review')
    // Unreadable field and missing Zoho link are their own honest state.
    expect(complianceStateFor('Approved', false, true)).toBe('unread')
    expect(complianceStateFor(null, true, false)).toBe('unread')
  })

  it('a Broker Complete file with no package: broker current, package upcoming', () => {
    const s = closeoutStepStates({ phaseState: 'current', compliance: 'not_started', commissionRecorded: false })
    expect(s).toEqual({ broker: 'current', compliance: 'upcoming', paid: 'upcoming' })
  })

  it('a submitted package moves broker done, package current', () => {
    const s = closeoutStepStates({ phaseState: 'current', compliance: 'under_review', commissionRecorded: false })
    expect(s).toEqual({ broker: 'done', compliance: 'current', paid: 'upcoming' })
  })

  it('a rejected package loops back honestly (still current, never done)', () => {
    const s = closeoutStepStates({ phaseState: 'done', compliance: 'rejected', commissionRecorded: false })
    expect(s).toEqual({ broker: 'done', compliance: 'current', paid: 'upcoming' })
  })

  it('a funded file with no package reads the package as the now-work', () => {
    const s = closeoutStepStates({ phaseState: 'done', compliance: 'not_started', commissionRecorded: false })
    expect(s).toEqual({ broker: 'done', compliance: 'current', paid: 'upcoming' })
  })

  it('approved package and recorded commission read done across', () => {
    const s = closeoutStepStates({ phaseState: 'done', compliance: 'approved', commissionRecorded: true })
    expect(s).toEqual({ broker: 'done', compliance: 'done', paid: 'done' })
  })

  it('approved with no commission leaves paid as the now-work', () => {
    const s = closeoutStepStates({ phaseState: 'done', compliance: 'approved', commissionRecorded: false })
    expect(s.paid).toBe('current')
  })

  it('a file before the phase shows everything upcoming, commission truth excepted', () => {
    expect(closeoutStepStates({ phaseState: 'upcoming', compliance: 'not_started', commissionRecorded: false })).toEqual({
      broker: 'upcoming',
      compliance: 'upcoming',
      paid: 'upcoming',
    })
    expect(
      closeoutStepStates({ phaseState: 'upcoming', compliance: 'not_started', commissionRecorded: true }).paid,
    ).toBe('done')
  })
})

// ─── The B2b lime audit: the single list lime and nothing else ───────────────

const DEALS_FILES_NO_LIME = [
  'components/admin/deals/DealsBoard.tsx',
  'components/admin/deals/DealsView.tsx',
  'components/admin/deals/PhaseSection.tsx',
  'components/admin/deals/StepList.tsx',
  'components/admin/deals/CloseoutPanel.tsx',
  'components/admin/JourneyStepper.tsx',
  'components/admin/LenderNotesCard.tsx',
  'app/portal/admin/underwriting/page.tsx',
  'app/portal/admin/deals/[id]/page.tsx',
  // B3: the design system itself and the merged pages add zero lime; the
  // three flagged demotions (ClientConstraints ×2, the roadmap marker) hold.
  'components/admin/ds/SummaryStrip.tsx',
  'components/admin/ds/NavyBar.tsx',
  'components/admin/ds/StatusChip.tsx',
  'components/admin/ds/TabBar.tsx',
  'components/admin/ds/table.tsx',
  'app/portal/admin/lenders/page.tsx',
  'app/portal/admin/beyond/page.tsx',
  'components/admin/lenders/RatesTab.tsx',
  'components/admin/lenders/IntelTab.tsx',
  'components/admin/lenders/KnowledgeTab.tsx',
  'components/admin/beyond/RenewalsTab.tsx',
  'components/admin/beyond/OpportunitiesTab.tsx',
  'components/admin/revenue/BookkeepingTab.tsx',
  'components/admin/ClientConstraints.tsx',
  'app/portal/admin/roadmap/page.tsx',
]

const LIME_RENDER = /(?:bg|text|border|decoration|outline|from|to|ring|fill|stroke)-lime\b|#95D600|#C6F53F/

describe('the B2b lime audit', () => {
  it('the board, stepper, phase sections, compliance panel, and both pages add zero lime', () => {
    for (const file of DEALS_FILES_NO_LIME) {
      const src = readFileSync(file, 'utf8')
      for (const [i, line] of Array.from(src.split('\n').entries())) {
        expect(
          LIME_RENDER.test(line),
          `${file}:${i + 1} renders lime outside the single-lime list rule: ${line.trim()}`,
        ).toBe(false)
      }
    }
  })

  it('DealsList renders the decision token ONLY on the single-lime branch (B4: legacy lime retired)', () => {
    const src = readFileSync('components/admin/deals/DealsList.tsx', 'utf8')
    const lines = src.split('\n')
    // B4: the single lime speaks the decision token now; legacy lime is gone.
    expect(lines.some(l => LIME_RENDER.test(l))).toBe(false)
    const DECISION_RENDER = /(?:bg|border|text)-decision/
    const decisionLines = lines
      .map((line, i) => ({ line, i }))
      .filter(({ line }) => DECISION_RENDER.test(line))
    // Two render branches (desktop table + phone cards), nothing else.
    expect(decisionLines.length).toBe(2)
    for (const { i } of decisionLines) {
      const context = lines.slice(Math.max(0, i - 3), i + 1).join('\n')
      expect(
        /(?:row|r)\.lime/.test(context),
        `DealsList.tsx:${i + 1} decision token is not gated by the single-lime flag`,
      ).toBe(true)
    }
  })
})
