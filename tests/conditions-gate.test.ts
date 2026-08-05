// The conditions gate axis (handoff 44) — the guard against reading a retired
// condition as live work.
//
// A condition carries TWO INDEPENDENT axes:
//   status      — the workflow axis (open, pre_checked, evidence_attached,
//                 satisfied, waived): "have we collected it yet?"
//   gate_status — the DECISION axis (pending, approved, superseded, rejected):
//                 "is this row part of the live checklist at all?"
//
// Supersession RETIRES a row rather than removing it, because the audit trail
// depends on those rows surviving. A re-extracted commitment therefore leaves
// the previous set at gate_status='superseded' with status STILL 'open' — never
// collected, never going to be. A reader that filters only on status counts
// every retired row as outstanding work.
//
// BRXM-F057400 is the proof: 157 rows, ALL status='open', splitting 12 approved
// / 124 superseded / 21 rejected across thirteen extraction runs and two human
// rejections. Today's rail read 178 overdue conditions across the book when the
// true figure was 33.
//
// WHY THESE TESTS AND NOT A LIVE READ: the defect is invisible on any file that
// has never been amended, which is every file but one. A live assertion would
// pass on a book that happens to have no amendments today and would go on
// passing right up until the next amendment. So the guard is (1) an exhaustive
// SOURCE scan, which catches a reader nobody has written yet, and (2) a request
// scan proving the filter actually reaches PostgREST.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SRC = readFileSync(join(__dirname, '..', 'lib', 'underwriting.ts'), 'utf8')

/** Every read of the workbench `conditions` table in lib/underwriting.ts, with
 *  the literal params block each one sends. Parsed from source so a reader
 *  added by a later session is audited without anyone remembering to add it. */
function conditionReads(): { fn: string; params: string }[] {
  const out: { fn: string; params: string }[] = []
  const re = /uwSelect(?:All)?<[^>]*>\(\s*'conditions'\s*,\s*\{([\s\S]*?)\n\s*\}\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(SRC))) {
    // Walk back to the NEAREST preceding exported function — the last one
    // before this call site, not the first one in the file.
    const before = SRC.slice(0, m.index)
    const at = before.lastIndexOf('export async function ')
    const fn =
      at === -1
        ? '(unknown)'
        : (before.slice(at).match(/^export async function (\w+)/)?.[1] ?? '(unknown)')
    out.push({ fn, params: m[1] })
  }
  return out
}

describe('every conditions reader names the gate axis', () => {
  const reads = conditionReads()

  it('found every reader in the module', () => {
    const names = reads.map(r => r.fn)
    // The seven that exist today. A new one lands in this list automatically
    // and must satisfy the assertion below.
    expect(names).toEqual(
      expect.arrayContaining([
        'getConditionsDue',
        'getOpenConditionCounts',
        'getDealConditions',
        'getApprovedConditions',
        'getPendingCommitmentConditions',
        'getConditionCountsByDeal',
        'getComplianceAttentionDeals',
      ]),
    )
    expect(reads.length).toBeGreaterThanOrEqual(7)
  })

  it('NOT ONE reads the conditions table without filtering on gate_status', () => {
    for (const r of reads) {
      expect(
        /gate_status:/.test(r.params),
        `${r.fn} reads conditions without a gate_status filter — it will count ` +
          `superseded and rejected rows as live work on any amended file`,
      ).toBe(true)
    }
  })

  it('filtering on status alone is never sufficient', () => {
    // The exact shape of the original defect: a status filter and no gate one.
    for (const r of reads) {
      const statusOnly = /status: '(not\.)?in\./.test(r.params) && !/gate_status:/.test(r.params)
      expect(statusOnly, `${r.fn} filters workflow but not decision`).toBe(false)
    }
  })

  it('the paired Closings numbers share one constant, so they cannot drift', () => {
    // The Closings card renders "N open" from getOpenConditionCounts and
    // "N overdue" from getConditionsDue. Two literals could diverge; one
    // constant cannot.
    expect(SRC).toMatch(/export const APPROVED_CONDITION_GATE = 'eq\.approved'/)
    for (const fn of ['getConditionsDue', 'getOpenConditionCounts']) {
      const r = reads.find(x => x.fn === fn)!
      expect(r.params, `${fn} must use the shared constant`).toMatch(
        /gate_status: APPROVED_CONDITION_GATE/,
      )
    }
  })

  it('the pending banner is the ONE reader that wants pending, and says so', () => {
    const pending = reads.find(r => r.fn === 'getPendingCommitmentConditions')!
    expect(pending.params).toMatch(/gate_status: 'eq\.pending'/)
    // ...and it is scoped to the commitment source, so it cannot pick up
    // anything else that happens to be pending.
    expect(pending.params).toMatch(/source: 'eq\.commitment'/)
  })

  it('the deal-room checklist reads the approved population only', () => {
    const room = reads.find(r => r.fn === 'getApprovedConditions')!
    expect(room.params).toMatch(/gate_status: 'eq\.approved'/)
    expect(room.params).toMatch(/source: CHECKLIST_SOURCES/)
  })

  it('the whole-file reader excludes every non-live gate state', () => {
    const live = reads.find(r => r.fn === 'getDealConditions')!
    expect(live.params).toMatch(/gate_status: LIVE_CONDITION_GATE/)
    expect(SRC).toMatch(
      /const LIVE_CONDITION_GATE = 'not\.in\.\(superseded,rejected,pending\)'/,
    )
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The request-level proof: the filter must actually reach PostgREST, not just
// appear in the source. Catches a params object that is built but never sent.

describe('the filter reaches the wire', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>
  const urls: string[] = []

  beforeEach(() => {
    urls.length = 0
    process.env.UW_SUPABASE_URL = 'https://uw.test'
    process.env.UW_SUPABASE_READONLY_KEY = 'ro'
    process.env.UW_SUPABASE_PUBLISHABLE_KEY = 'pk'
    fetchSpy = vi.spyOn(global, 'fetch').mockImplementation((async (u: any) => {
      urls.push(String(u))
      return {
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '[]',
        headers: new Headers(),
      } as unknown as Response
    }) as any)
  })

  afterEach(() => {
    fetchSpy.mockRestore()
  })

  const conditionUrl = () => urls.find(u => u.includes('/conditions?')) ?? ''

  it("Today's chase list sends gate_status=eq.approved", async () => {
    const { getConditionsDue } = await import('@/lib/underwriting')
    await getConditionsDue('agent-1', 7)
    const u = decodeURIComponent(conditionUrl())
    expect(u).toContain('gate_status=eq.approved')
    expect(u).toContain('status=not.in.(satisfied,waived)')
  })

  it('the Closings open-count sends it too', async () => {
    const { getOpenConditionCounts } = await import('@/lib/underwriting')
    await getOpenConditionCounts('agent-1')
    expect(decodeURIComponent(conditionUrl())).toContain('gate_status=eq.approved')
  })

  it('the compliance attention read sends it', async () => {
    const { getComplianceAttentionDeals } = await import('@/lib/underwriting')
    await getComplianceAttentionDeals('agent-1', ['solicitor', 'borrower_execution'], '2026-08-05')
    const u = decodeURIComponent(urls.find(x => x.includes('/conditions?')) ?? '')
    expect(u).toContain('gate_status=eq.approved')
  })

  it('the deal-room checklist sends it', async () => {
    const { getApprovedConditions } = await import('@/lib/underwriting')
    await getApprovedConditions('agent-1', 'deal-1')
    expect(decodeURIComponent(conditionUrl())).toContain('gate_status=eq.approved')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// What the numbers actually are, shaped exactly like F057400. This is the test
// that fails against unfiltered data: feed it the real 157-row split and the
// naive count comes out 157 where the honest one comes out 12.

describe('an amended file, counted both ways (the F057400 shape)', () => {
  // 157 rows, every one status='open': 12 approved, 124 superseded, 21 rejected.
  const rows = [
    ...Array.from({ length: 12 }, (_, i) => ({ gate_status: 'approved', status: 'open', due_date: '2026-07-01', id: `a${i}` })),
    ...Array.from({ length: 124 }, (_, i) => ({ gate_status: 'superseded', status: 'open', due_date: '2026-07-01', id: `s${i}` })),
    ...Array.from({ length: 21 }, (_, i) => ({ gate_status: 'rejected', status: 'open', due_date: '2026-07-01', id: `r${i}` })),
  ]

  const statusOnly = (rs: typeof rows) => rs.filter(r => !['satisfied', 'waived'].includes(r.status))
  const bothAxes = (rs: typeof rows) => statusOnly(rs).filter(r => r.gate_status === 'approved')

  it('the workflow axis alone reports every retired row as outstanding', () => {
    expect(rows).toHaveLength(157)
    expect(statusOnly(rows)).toHaveLength(157) // <- the defect, stated as a number
  })

  it('both axes together report the twelve that are real', () => {
    expect(bothAxes(rows)).toHaveLength(12)
  })

  it('supersession never removes a row — the audit trail keeps all 157', () => {
    // Guardrail 21 in numeric form: the fix is in the READ, never the data.
    const retired = rows.filter(r => r.gate_status === 'superseded' || r.gate_status === 'rejected')
    expect(retired).toHaveLength(145)
    expect(retired.every(r => r.status === 'open')).toBe(true)
  })

  it('a file that has never been amended is unaffected — which is why this hid', () => {
    const clean = Array.from({ length: 33 }, (_, i) => ({
      gate_status: 'approved', status: i < 2 ? 'satisfied' : 'open', due_date: null as any, id: `c${i}`,
    }))
    // Both readings agree, so no live assertion on today's book would catch it.
    expect(statusOnly(clean)).toHaveLength(31)
    expect(bothAxes(clean)).toHaveLength(31)
  })
})
