// Withdrawing a record from the record layer (handoff 50) — the rules, the
// refusal, and the two behaviour changes on the board.
//
// EVERY NUMBER BELOW WAS READ LIVE on 2026-08-05 through portal_readonly, not
// assumed: 160 rec.deals rows; source_system zoho_csv 153 / workbench 5 /
// finmo 2; finmo_application_id NOT NULL on 106; 38 rows with no file_ref, of
// which 17 are Finmo-fed and ZERO carry a workbench room; and zero active
// withdrawals in the book.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  LIVE_FEED_COPY,
  REFUSE_ROOM_COPY,
  ROOM_ONLY_COPY,
  WITHDRAWAL_EXPLAINER,
  WITHDRAWAL_PERMANENCE,
  WITHDRAW_ENTITY_TYPE,
  WITHDRAW_REASON_MAX,
  WITHDRAW_REASON_MIN,
  checkReason,
  feedPosture,
  indexWithdrawals,
  isDecisionId,
  isRefused,
  isSourceId,
  isWithdrawn,
  partitionWithdrawn,
  postureNotice,
  withdrawalFor,
  type WithdrawalLike,
} from '@/lib/rec-withdrawal'
import { COPY_RULES } from '@/lib/booking/copy-gate'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Source with comments removed. These files explain their own rules at length
 *  and quote the copy they replaced, so a scan that did not strip comments
 *  would flag the explanation of a rule as a breach of it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

/** Whether a piece of copy describes the ACTION as a delete.
 *
 *  A NEGATED USE IS THE POINT, NOT A BREACH: "the record is not deleted" is the
 *  sentence this whole rule exists to produce. Only an unnegated use, which
 *  would be describing a withdrawal as a deletion, counts against it. */
function callsItADelete(s: string): boolean {
  const hits = Array.from(s.matchAll(/\b(delete[sd]?|deleting|erase[sd]?)\b/gi))
  for (const hit of hits) {
    const at = hit.index ?? 0
    const before = s.slice(Math.max(0, at - 40), at)
    if (/\b(not|never|no|nothing|without)\b[^.]*$/i.test(before)) continue
    return true
  }
  return false
}

const W = (over: Partial<WithdrawalLike> = {}): WithdrawalLike => ({
  id: '11111111-2222-4333-8444-555555555555',
  source_system: 'zoho_csv',
  source_id: '7112178000001410274',
  instructed_by: 'Michael Fox',
  instructed_on: '2026-08-05',
  reason: 'migration artifact with no file reference',
  ...over,
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the reason', () => {
  it('is required, and says why rather than just refusing', () => {
    const r = checkReason('')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/only record of why/i)
  })

  it('refuses a missing field, a non-string and whitespace alike', () => {
    for (const bad of [undefined, null, 42, {}, '   ', '\n\t ']) {
      expect(checkReason(bad as unknown).ok, `${JSON.stringify(bad)} is not a reason`).toBe(false)
    }
  })

  it('refuses anything under the gate minimum, and names the length', () => {
    const r = checkReason('ab')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toContain('2 characters')
    expect(checkReason('abc').ok).toBe(true)
    expect(WITHDRAW_REASON_MIN).toBe(3)
  })

  it('REFUSES an over-long reason rather than truncating it', () => {
    // Silently shortening what a person wrote changes the record they meant to
    // leave, and this record is the only answer to "why did this go away".
    const long = 'x'.repeat(WITHDRAW_REASON_MAX + 1)
    const r = checkReason(long)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain(String(WITHDRAW_REASON_MAX + 1))
      expect(r.message).toMatch(/exactly as written/i)
    }
    expect(checkReason('x'.repeat(WITHDRAW_REASON_MAX)).ok).toBe(true)
  })

  it('trims, and returns exactly what will be sent', () => {
    const r = checkReason('  duplicate of BRXM-F053724  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.reason).toBe('duplicate of BRXM-F053724')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the live feed decides the posture, and source_system does not', () => {
  it('keys on finmo_application_id, NOT on source_system', () => {
    // THE WHOLE POINT. source_system='finmo' is 2 of 160 records;
    // finmo_application_id is 106, including 17 of the 38 Michael is clearing.
    // Keying on source_system would stay silent on all 17 while cutting their
    // feed. feedPosture cannot even see source_system, which is the guarantee.
    expect(feedPosture({ finmoApplicationId: 'app_123', hasRoom: false })).toBe('live_feed')
    expect(feedPosture({ finmoApplicationId: null, hasRoom: false })).toBe('plain')
  })

  it('an empty or whitespace application id is not a live feed', () => {
    expect(feedPosture({ finmoApplicationId: '', hasRoom: false })).toBe('plain')
    expect(feedPosture({ finmoApplicationId: '   ', hasRoom: false })).toBe('plain')
    expect(feedPosture({ hasRoom: false })).toBe('plain')
  })

  it('a live feed AND a workbench room is REFUSED, not warned', () => {
    expect(feedPosture({ finmoApplicationId: 'app_123', hasRoom: true })).toBe('refused')
    expect(isRefused({ finmoApplicationId: 'app_123', hasRoom: true })).toBe(true)
    expect(isRefused({ finmoApplicationId: 'app_123', hasRoom: false })).toBe(false)
    expect(isRefused({ finmoApplicationId: null, hasRoom: true })).toBe(false)
  })

  it('a room with no live feed is a caution, never a refusal', () => {
    // Not in the brief and deliberately NOT refused: the brief scopes the
    // refusal to the Finmo population. Today all 5 rows carrying a direct
    // workbench_deal_id are also Finmo-fed, so this branch changes nothing
    // observable and exists so it cannot become a silent gap later.
    expect(feedPosture({ finmoApplicationId: null, hasRoom: true })).toBe('room_only')
    expect(isRefused({ finmoApplicationId: null, hasRoom: true })).toBe(false)
  })

  it('every posture that matters says something, and a plain one stays quiet', () => {
    expect(postureNotice('refused')).toBe(REFUSE_ROOM_COPY)
    expect(postureNotice('live_feed')).toBe(LIVE_FEED_COPY)
    expect(postureNotice('room_only')).toBe(ROOM_ONLY_COPY)
    // A caveat on a record that needs none teaches Michael to read past the
    // two that do.
    expect(postureNotice('plain')).toBeNull()
  })

  it('the live-feed warning names the feed, so nobody is surprised by it', () => {
    expect(LIVE_FEED_COPY).toMatch(/Finmo/)
    expect(LIVE_FEED_COPY).toMatch(/stop updating|stops the loader/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('matching a decision to a record', () => {
  it('matches on source_system plus source_id', () => {
    const ix = indexWithdrawals([W()])
    expect(
      withdrawalFor({ source_system: 'zoho_csv', source_id: '7112178000001410274' }, ix)?.id,
    ).toBe(W().id)
  })

  it('a decision that names a DIFFERENT system does not match', () => {
    const ix = indexWithdrawals([W({ source_system: 'finmo' })])
    expect(withdrawalFor({ source_system: 'zoho_csv', source_id: '7112178000001410274' }, ix)).toBeNull()
  })

  it('source_system is OPTIONAL on the write, so a decision without one still matches', () => {
    const ix = indexWithdrawals([W({ source_system: null })])
    expect(
      withdrawalFor({ source_system: 'zoho_csv', source_id: '7112178000001410274' }, ix)?.id,
    ).toBe(W().id)
  })

  it('a record with no source id matches nothing, and never everything', () => {
    const ix = indexWithdrawals([W({ source_system: null })])
    expect(withdrawalFor({ source_system: 'zoho_csv', source_id: null }, ix)).toBeNull()
    expect(withdrawalFor({ source_system: null, source_id: '' }, ix)).toBeNull()
  })

  it('a decision row with no source id is dropped rather than indexed as blank', () => {
    const ix = indexWithdrawals([W({ source_id: '' }), W({ source_id: '   ' })])
    expect(ix.size).toBe(0)
  })

  it('withdrawn records leave the working book, and the rest are untouched', () => {
    const deals = [
      { id: 'a', source_system: 'zoho_csv', source_id: '7112178000001410274' },
      { id: 'b', source_system: 'zoho_csv', source_id: '7112178000001410275' },
      { id: 'c', source_system: 'workbench', source_id: 'ba8d8b01' },
    ]
    const { live, withdrawn } = partitionWithdrawn(deals, indexWithdrawals([W()]))
    expect(withdrawn.map(d => d.id)).toEqual(['a'])
    expect(live.map(d => d.id)).toEqual(['b', 'c'])
  })

  it('zero withdrawals leaves the whole book live, which is the state today', () => {
    const deals = [{ id: 'a', source_system: 'zoho_csv', source_id: '1' }]
    const { live, withdrawn } = partitionWithdrawn(deals, indexWithdrawals([]))
    expect(live).toHaveLength(1)
    expect(withdrawn).toHaveLength(0)
    expect(isWithdrawn(deals[0], indexWithdrawals([]))).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('identifiers', () => {
  it('a decision id must be a uuid, because the reverse endpoint is keyed on one', () => {
    expect(isDecisionId('11111111-2222-4333-8444-555555555555')).toBe(true)
    expect(isDecisionId('  11111111-2222-4333-8444-555555555555  ')).toBe(true)
    for (const bad of ['', 'nope', '7112178000001410274', null, undefined, 42, '1111-2222']) {
      expect(isDecisionId(bad as unknown), `${bad} is not a decision id`).toBe(false)
    }
  })

  it('a source id is bounded and non-empty, and nothing more is claimed', () => {
    // A Zoho id and a workbench uuid are both valid source ids. Guessing at a
    // vocabulary this repo does not own is how a valid id gets refused.
    expect(isSourceId('7112178000001410274')).toBe(true)
    expect(isSourceId('ba8d8b01-09e5-444f-98f4-3a2450061865')).toBe(true)
    expect(isSourceId('mtg:7112178000001410322')).toBe(true)
    expect(isSourceId('')).toBe(false)
    expect(isSourceId('   ')).toBe(false)
    expect(isSourceId('x'.repeat(201))).toBe(false)
  })

  it('the entity type is the one the gate filters on', () => {
    expect(WITHDRAW_ENTITY_TYPE).toBe('deal')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the copy never says delete', () => {
  const surfaces = [
    'lib/rec-withdrawal.ts',
    'components/admin/deals-beta/RecordWithdrawal.tsx',
    'components/admin/DealsBetaBoard.tsx',
    'app/portal/admin/deals-beta/[dealId]/page.tsx',
    'app/portal/admin/deals-beta/page.tsx',
  ]

  it('no rendered string on any withdrawal surface calls this a delete', () => {
    // Saying delete would send Michael looking for a bin that does not exist,
    // and would misdescribe what he did to whoever explains it later.
    //
    // A NEGATED USE IS THE POINT, NOT A BREACH: "the record is not deleted" is
    // the sentence this whole rule exists to produce. Only an unnegated use,
    // which would be describing the action as a delete, counts against it.
    const offences: string[] = []
    for (const f of surfaces) {
      const src = stripComments(read(f))
      const literals = Array.from(
        src.matchAll(/'([^'\\\n]{6,})'|"([^"\\\n]{6,})"|>([^<>{}]{6,})</g),
      )
      for (const m of literals) {
        const s = (m[1] ?? m[2] ?? m[3] ?? '').trim()
        if (callsItADelete(s)) offences.push(`${f}: "${s.slice(0, 80)}"`)
      }
    }
    expect(offences, `copy calls a withdrawal a delete:\n${offences.join('\n')}`).toEqual([])
  })

  it('and the negation check is not vacuous: an unnegated delete WOULD be caught', () => {
    expect(callsItADelete('Delete this record permanently.')).toBe(true)
    expect(callsItADelete('This deletes the file from the book.')).toBe(true)
    expect(callsItADelete('The record is not deleted.')).toBe(false)
    expect(callsItADelete('Nothing here was deleted.')).toBe(false)
  })

  it('the explainer says the record stays and the loader declines to recreate it', () => {
    expect(WITHDRAWAL_EXPLAINER).toMatch(/not deleted/i)
    expect(WITHDRAWAL_EXPLAINER).toMatch(/loader/i)
    expect(WITHDRAWAL_EXPLAINER).toMatch(/recreate/i)
  })

  it('the permanence copy states BOTH honest limits of a reversal', () => {
    // It does not restore a row removed by hand, and it does not undo anything
    // else. Both were discovered facts, and both belong in the words.
    expect(WITHDRAWAL_PERMANENCE).toMatch(/removed by hand/i)
    expect(WITHDRAWAL_PERMANENCE).toMatch(/own reason/i)
  })

  it('every constant in the module obeys the typographic copy rules', () => {
    const typographic = COPY_RULES.filter(r =>
      ['em dash', 'en dash', 'exclamation point', 'semicolon'].includes(r.label),
    )
    const strings = [
      WITHDRAWAL_EXPLAINER,
      WITHDRAWAL_PERMANENCE,
      REFUSE_ROOM_COPY,
      LIVE_FEED_COPY,
      ROOM_ONLY_COPY,
    ]
    for (const s of strings) {
      for (const rule of typographic) {
        expect(rule.test(s), `"${s.slice(0, 50)}" ${rule.problem}`).toBe(false)
      }
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('THE WRITE PATH: one gate proxy, a human actor, nothing deleted', () => {
  it('the two proxy routes exist and both ride rec.withdraw', () => {
    for (const f of [
      'app/api/portal/admin/gates/rec/withdrawals/route.ts',
      'app/api/portal/admin/gates/rec/withdrawals/[decisionId]/reverse/route.ts',
    ]) {
      const src = read(f)
      expect(src, `${f} must enforce the key before anything else`).toContain(
        "apiPermission('rec.withdraw')",
      )
    }
  })

  it('the client NEVER supplies a human actor or a date (guardrail 19)', () => {
    // instructed_by comes from the verified session at the far end and
    // instructed_on from the server clock. The gate's schema is strict, so
    // sending either is a 422 rather than a silently ignored field.
    for (const f of [
      'lib/gates.ts',
      'components/admin/deals-beta/RecordWithdrawal.tsx',
      'app/api/portal/admin/gates/rec/withdrawals/route.ts',
      'app/api/portal/admin/gates/rec/withdrawals/[decisionId]/reverse/route.ts',
    ]) {
      const src = read(f)
      expect(src, `${f} must not put instructed_by in a payload`).not.toMatch(
        /instructed_by\s*:/,
      )
      expect(src, `${f} must not put instructed_on in a payload`).not.toMatch(
        /instructed_on\s*:/,
      )
    }
  })

  it('the withdraw route computes the room ITSELF and never trusts the browser', () => {
    const src = read('app/api/portal/admin/gates/rec/withdrawals/route.ts')
    expect(src).toContain('resolveRoom')
    expect(src).toContain('feedPosture')
    // The body is read for exactly two fields. A hasRoom or a posture arriving
    // from a browser would make the refusal advisory rather than enforced.
    expect(src).not.toMatch(/body\?\.(hasRoom|posture|has_room|finmo)/)
  })

  it('a workbench read that FAILS refuses the withdrawal rather than assuming no room', () => {
    // Treating an outage as an absent room would switch the refusal off exactly
    // when the portal cannot see what it is refusing.
    const src = read('app/api/portal/admin/gates/rec/withdrawals/route.ts')
    expect(src).toMatch(/!roomsRes\.configured \|\| !roomsRes\.ok/)
    expect(src).toMatch(/Nothing was withdrawn/)
  })

  it('the route refuses a bad reason BEFORE it spends a token or a workbench read', () => {
    // Measured inside the handler, not from the top of the file: the import
    // block names getAgentIdByEmail first and would make any ordering look
    // wrong.
    const src = read('app/api/portal/admin/gates/rec/withdrawals/route.ts')
    const body = src.slice(src.indexOf('export async function POST'))
    const reasonAt = body.indexOf('checkReason(body?.reason)')
    const agentAt = body.indexOf('await getAgentIdByEmail')
    expect(reasonAt).toBeGreaterThan(0)
    expect(agentAt).toBeGreaterThan(reasonAt)
  })

  it('nothing on the withdrawal path can delete anything (guardrail 21)', () => {
    for (const f of [
      'lib/rec-withdrawal.ts',
      'lib/gates.ts',
      'components/admin/deals-beta/RecordWithdrawal.tsx',
      'app/api/portal/admin/gates/rec/withdrawals/route.ts',
      'app/api/portal/admin/gates/rec/withdrawals/[decisionId]/reverse/route.ts',
    ]) {
      const src = read(f)
      for (const forbidden of ['SERVICE_ROLE', 'service_role', 'Content-Profile', '.delete(']) {
        expect(src, `${f} must not contain ${forbidden}`).not.toContain(forbidden)
      }
      expect(src, `${f} must never send a DELETE`).not.toMatch(/method:\s*['"]DELETE['"]/)
    }
  })

  it('the read carries ALL FOUR filters, and status most of all', () => {
    const src = read('lib/underwriting.ts')
    const block = src.slice(src.indexOf('export async function getRecWithdrawals'))
    const fn = block.slice(0, block.indexOf('\n}\n') + 3)
    expect(fn).toContain("'source_decisions'")
    expect(fn).toContain("entity_type: 'eq.deal'")
    expect(fn).toContain("decision: 'eq.record_withdrawn'")
    // WITHOUT THIS FILTER a reversed record renders as withdrawn forever: a
    // reversal sets the row to superseded, it does not remove it.
    expect(fn).toContain("status: 'eq.active'")
    expect(fn).toContain('agent_id:')
    // Accept-Profile is the whole reason handoff 48 believed there was no read
    // path: without it PostgREST looks in `public` and 404s exactly as it would
    // for a table nobody exposed.
    expect(fn).toContain("'rec'")
  })

  it('the reverse client sends only a reason, on the decision id', () => {
    const src = read('lib/gates.ts')
    const at = src.indexOf('export function reverseRecWithdrawal')
    const fn = src.slice(at, at + 600)
    expect(fn).toContain('/reverse')
    expect(fn).toContain('{ reason }')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('THE CARD CLICK: straight to the file, preview left behind', () => {
  it('a card links to the file page, not to a preview selection', () => {
    const board = read('components/admin/DealsBetaBoard.tsx')
    expect(board).toContain('/portal/admin/deals-beta/${encodeURIComponent(d.id)}')
    // The old behaviour put the file ref in the URL as ?deal=. No card does.
    expect(board).not.toMatch(/href=\{href\(\{[^}]*deal:/)
  })

  it('the preview is UNREFERENCED, not removed from the repo', () => {
    // Left in the repo on purpose: restoring the old behaviour is one line if
    // Michael misses it, rather than a rebuild. The board may still NAME it in
    // a comment saying exactly that, so the check is on code rather than prose.
    const board = stripComments(read('components/admin/DealsBetaBoard.tsx'))
    expect(board).not.toContain('DealPreview')
    expect(() => read('components/admin/deals-beta/DealPreview.tsx')).not.toThrow()
  })

  it('the preview keeps its own read-only grep, which still passes', () => {
    // tests/phase-model.test.ts owns that assertion and stays pointed at the
    // file. This proves the file it points at is still there to be grepped.
    const preview = read('components/admin/deals-beta/DealPreview.tsx')
    for (const bad of ['<form', 'onSubmit', 'onClick', '<button', '<input', '<select', '<textarea']) {
      expect(preview, `the preview stays read-only: no ${bad}`).not.toContain(bad)
    }
  })

  it('the Remove control sits OUTSIDE the link, because a button in an anchor is invalid', () => {
    const card = read('components/admin/deals-beta/DealCard.tsx')
    const linkEnd = card.indexOf('</Link>')
    const removeAt = card.indexOf('{remove &&')
    expect(linkEnd).toBeGreaterThan(0)
    expect(removeAt).toBeGreaterThan(linkEnd)
  })

  it('the card itself stays a server component with no handler and no state', () => {
    const card = read('components/admin/deals-beta/DealCard.tsx')
    expect(card).not.toContain("'use client'")
    expect(card).not.toContain('useState')
    expect(card).not.toContain('onClick')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('THE WITHDRAWN VIEW', () => {
  const board = read('components/admin/DealsBetaBoard.tsx')

  it('is reached the same way the Archive is: a view on the URL, no client state', () => {
    // The switch is a link and the view rides searchParams, exactly as Archive
    // does, so the board stays a server component.
    expect(board).toContain("view: 'withdrawn'")
    const page = read('app/portal/admin/deals-beta/page.tsx')
    expect(page).toContain("searchParams?.view === 'withdrawn'")
    expect(page).toContain("searchParams?.view === 'archive'")
  })

  it('shows its count ALWAYS, including at zero', () => {
    // The count is the only place a shrinking board can be read against what
    // left it. Hiding it when empty would mean the explanation appears only
    // after the board has already shrunk.
    const at = board.indexOf('beta-view-withdrawn')
    const chunk = board.slice(at - 700, at + 300)
    expect(chunk).toContain('withdrawnCount')
    expect(chunk).not.toMatch(/withdrawnCount\s*>\s*0\s*&&/)
  })

  it('reverses from there, with its own required reason', () => {
    expect(board).toContain('ReverseWithdrawalControl')
    const control = read('components/admin/deals-beta/RecordWithdrawal.tsx')
    const at = control.indexOf('export function ReverseWithdrawalControl')
    const fn = control.slice(at)
    expect(fn).toContain('checkReason')
    expect(fn).toMatch(/disabled=\{busy \|\| !check\.ok\}/)
  })

  it('THE ARCHIVE CARRIES THE CONTROL TOO, because 4 of the 38 live there', () => {
    // Verified live 2026-08-05: of the 160 records, 98 sit in a phased stage
    // and 29 in a terminal one. Of the 38 no-reference records Michael is
    // clearing, 34 are on the board and 4 are in the Archive in
    // lost_to_competition. A control that existed only on cards would have left
    // him no way to reach those four short of typing a URL.
    const at = board.indexOf('function ArchiveView')
    expect(at).toBeGreaterThan(0)
    // ArchiveView is the last function in the file, so this is its whole body.
    const archive = board.slice(at)
    expect(archive).toContain('RemoveRecordControl')
    expect(archive).toContain('feedPosture')
    // ...and the row links to the file page, which it never did before.
    expect(archive).toContain('/portal/admin/deals-beta/${encodeURIComponent(deal.id)}')
  })

  it('records the board cannot place get a VIEW, not a footnote (handoff 52)', () => {
    // Handoff 50 named the stageless records in a note that also said they
    // could not be removed from here. Handoff 52 replaced the note with the No
    // stage view, because Michael reconciles the book by what he can see, and
    // a record in no view is a record he finishes the sitting believing he
    // handled. The note and its counter are GONE, not merely joined.
    expect(board).not.toContain('UnplacedNote')
    expect(board).not.toContain('function unplacedCount')
    expect(board).not.toMatch(/cannot be removed from here/)
    // The view exists, keyed on the MODEL's complement so membership shares
    // one definition with the partition test in tests/phase-model.test.ts.
    expect(board).toContain('function NoStageView')
    expect(board).toMatch(/unplacedDeals\(stages, deals\)/)
    const at = board.indexOf('function NoStageView')
    const view = board.slice(at)
    // Rows are reachable and actionable: file link, Remove control, posture.
    expect(view).toContain('/portal/admin/deals-beta/${encodeURIComponent(deal.id)}')
    expect(view).toContain('RemoveRecordControl')
    expect(view).toContain('feedPosture')
    // The reason renders per row, and no stage is ever invented to place one.
    expect(view).toContain('No stage recorded')
    // The switch carries the count even at zero, like Withdrawn.
    expect(board).toContain('beta-view-nostage')
    // Handoff 58 rebuilt the switch on the design export's chips, so the
    // markup changed while the guarantee did not: the count still renders, and
    // it still renders at zero.
    expect(board).toMatch(/No stage \{nostageCount\}/)
  })

  it('the FILE PAGE fails closed on the withdrawal read, like the route does', () => {
    // An empty result and a failed read are indistinguishable downstream, and
    // both roads out of an empty array are wrong the same way: a withdrawn
    // record renders as ordinary, AND the destructive control is re-offered on
    // a record that may already carry a withdrawal.
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    expect(page).toMatch(/const withdrawalsOk = withdrawalsR\.configured && withdrawalsR\.ok/)
    expect(page).toContain('beta-withdrawal-state-unknown')
    // The control is suppressed on both branches when the state is unknown.
    expect(page).toMatch(/withdrawalsOk && posture === 'refused'/)
    expect(page).toMatch(/withdrawalsOk && posture !== 'refused'/)
  })

  it('a withdrawn record is in exactly ONE view, never two', () => {
    // The page partitions before boardDeals and before archiveRows, so a
    // withdrawn terminal file cannot appear in both Archive and Withdrawn
    // claiming two different things.
    const page = read('app/portal/admin/deals-beta/page.tsx')
    expect(page).toContain('partitionWithdrawn')
    expect(page).toContain('boardDeals(stages, liveDeals)')
    expect(page).toContain('deals={liveDeals}')
    expect(page).toContain('buildInsights(liveDeals')
  })

  it('the page no longer CLAIMS nothing here writes', () => {
    // An untrue guarantee is worse than none. The sentence now names the one
    // write instead of denying it. The comment above it still quotes the old
    // wording so the change is legible, which is why comments are stripped.
    const page = stripComments(read('app/portal/admin/deals-beta/page.tsx'))
    const rendered = page.slice(page.indexOf('function Shell'), page.indexOf('function Notice'))
    expect(rendered).not.toContain('Nothing here writes')
    expect(rendered).toMatch(/recorded decision rather than a deletion/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('ARMED, NOT A CLICK-THROUGH', () => {
  const control = read('components/admin/deals-beta/RecordWithdrawal.tsx')

  it('the confirm window is checked BY TIMESTAMP at tap time', () => {
    // A background tab's throttled timer once left a confirm button armed and a
    // stray tap decided a live condition (the Session 4 incident).
    expect(control).toMatch(/Date\.now\(\) - armed <= ARM_WINDOW_MS/)
  })

  it('the reason is never prefilled and never carried between records', () => {
    expect(control).toContain("useState('')")
    expect(control).not.toMatch(/useState\(\s*(fileRef|sourceId|defaultReason)/)
    // Cancelling clears it too, so the next record starts empty.
    expect(control).toMatch(/setReason\(''\)/)
  })

  it('the button cannot fire until the reason clears the same bounds the gate enforces', () => {
    expect(control).toMatch(/disabled=\{busy \|\| !check\.ok\}/)
  })

  it('PRESSED ONCE PER MOUNT: success latches the control shut', () => {
    // router.refresh() is fire and forget and the page it refreshes re-runs a
    // dozen workbench reads, so there is a real window between the gate
    // answering and the screen catching up. Going merely un-busy in that window
    // would leave the reason typed and the button live on a record that has
    // already been withdrawn.
    expect(control).toMatch(/const \[done, setDone\] = useState/)
    expect(control).toMatch(/if \(done \|\| busy\) return/)
    // Nothing ever clears it.
    expect(control).not.toMatch(/setDone\(null\)/)
    // Both controls render the latched state instead of their buttons.
    expect(control).toContain('beta-remove-done-')
    expect(control).toContain('beta-reverse-done-')
  })

  it('409 latches too, because pressing again cannot help', () => {
    // Either it was already decided or it is in a state that refuses. Both are
    // terminal for this press, and the refresh brings back which one it was.
    const at = control.indexOf("json?.kind === 'conflict'")
    expect(at).toBeGreaterThan(0)
    const branch = control.slice(at, at + 260)
    expect(branch).toContain('setDone')
    expect(branch).toContain('router.refresh()')
  })

  it('a refused record renders NO control at all, not a disabled one', () => {
    // A disabled button is still a button: it says "you could do this" and
    // then refuses. A refused record gets the reason instead.
    const at = control.indexOf("if (posture === 'refused')")
    expect(at).toBeGreaterThan(0)
    const branch = control.slice(at, control.indexOf('if (!open)'))
    expect(branch).not.toContain('beta-remove-confirm')
    expect(branch).not.toContain('ReasonField')
    // It renders the sentence the route returns on the same refusal.
    expect(branch).toContain('{notice}')
    expect(control).toContain('postureNotice(posture)')
  })

  it('the refusal the BUTTON shows and the refusal the ROUTE returns are one string', () => {
    // Two copies of a rule is how a rule starts disagreeing with itself.
    const route = read('app/api/portal/admin/gates/rec/withdrawals/route.ts')
    expect(route).toContain('postureNotice(posture)')
    expect(control).toContain('postureNotice(posture)')
    expect(REFUSE_ROOM_COPY).toMatch(/cannot be done from here/i)
  })
})
