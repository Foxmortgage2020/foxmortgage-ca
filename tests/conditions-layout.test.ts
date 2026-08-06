// The conditions checklist LAYOUT rebuild (handoff 56).
//
// Michael read the shipped checklist on a live file and called the layout
// unreadable. Two causes, both specific and both pinned below:
//
//   1. EVERY CONDITION RENDERED TWICE. The text rendered, then the identical
//      string rendered again beneath it in grey quotes as the source snippet.
//      On BRXM-F060561 the two are byte-identical on all twelve rows, so
//      twelve conditions filled twenty-four paragraphs and the second copy read
//      as new information.
//   2. FULL PARAGRAPH TEXT ON EVERY ROW defeated the one job a checklist has.
//
// Nothing here invents a stored state, a write path, or a link between a
// condition and a person. Handoff 55's contract lives in
// tests/conditions-checklist.test.ts and passes unmodified beside this.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  borrowerGroupingNote,
  checklistTally,
  conditionChecklistState,
  conditionShortLabel,
  disambiguateLabels,
  sourceQuoteToShow,
  type ChecklistStateKey,
} from '@/lib/conditions-status'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const checklist = read('components/admin/ConditionsChecklist.tsx')
const statusLib = read('lib/conditions-status.ts')

/** Comments off, so prose explaining a rule is never mistaken for a breach. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

// ─────────────────────────────────────────────────────────────────────────────
describe('the defect: a condition rendered twice', () => {
  it('drops the quote when it is the same string as the text (the F060561 shape)', () => {
    const text = 'Broker to provide a signed and completed copy of the UnionLink consent form.'
    expect(sourceQuoteToShow(text, text)).toBeNull()
    // Whitespace and case are normalised first: the extractor stores the line
    // wrapping it read off the page, which differs from the stored text only in
    // spacing on some rows.
    expect(sourceQuoteToShow(text, `  ${text.toUpperCase().replace(/ /g, '\n')}  `)).toBeNull()
  })

  it('drops a quote wholly contained in the text, and one that contains it', () => {
    const text = 'Confirm the exact civic address and postal code of the property.'
    expect(sourceQuoteToShow(text, 'exact civic address and postal code')).toBeNull()
    expect(sourceQuoteToShow(text, `12. ${text} Prior to advance.`)).toBeNull()
  })

  it('keeps a quote that genuinely says something else', () => {
    const kept = sourceQuoteToShow('Fire insurance binder naming the lender.', 'Loss payable to the Lender, first loss payee.')
    expect(kept).toBe('Loss payable to the Lender, first loss payee.')
  })

  it('is silent on an absent or blank quote', () => {
    expect(sourceQuoteToShow('anything', null)).toBeNull()
    expect(sourceQuoteToShow('anything', undefined)).toBeNull()
    expect(sourceQuoteToShow('anything', '   ')).toBeNull()
  })

  it('BOTH surfaces render the quote through the helper, and neither renders a bare snippet', () => {
    // The pending banner is where the doubling was photographed, and the
    // working list is where it would have landed next.
    const src = stripComments(checklist)
    expect(src).toMatch(/const quote = sourceQuoteToShow\(cond\.text, cond\.sourceSnippet\)/)
    expect((src.match(/sourceQuoteToShow\(cond\.text, cond\.sourceSnippet\)/g) ?? []).length).toBe(2)
    // No path renders sourceSnippet directly any more.
    expect(src).not.toMatch(/\{cond\.sourceSnippet\}/)
    expect(src).not.toMatch(/cond\.sourceSnippet &&/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('one line per condition, the detail behind expansion', () => {
  it('the row header is a toggle that reports its own state', () => {
    expect(checklist).toMatch(/aria-expanded=\{expanded\}/)
    expect((checklist.match(/aria-expanded=\{expanded\}/g) ?? []).length).toBe(2)
    expect(checklist).toMatch(/const \[userOpen, setUserOpen\] = useState<boolean \| null>\(null\)/)
  })

  it('a failed check opens on arrival, and an explicit tap still wins', () => {
    // userOpen null means "no opinion", so a row whose state CHANGES on refresh
    // picks up the new default instead of staying stuck at the old one.
    expect(checklist).toMatch(/const expanded = userOpen \?\? state\.openByDefault/)
    expect(conditionChecklistState({ status: 'open', presence: 'obtained', analysisVerdict: 'short' }).openByDefault).toBe(true)
    expect(conditionChecklistState({ status: 'open', presence: 'obtained' }).openByDefault).toBe(false)
  })

  it('NO CONTROL renders on a collapsed row: every control sits inside the expanded branch', () => {
    // The four control regions handoff 55 pinned still carry their guards, and
    // all four now live after the `{expanded && (` opening. Twelve rows of
    // buttons is what made the old list unreadable.
    const row = checklist.slice(checklist.indexOf('function ChecklistRow'))
    const expandAt = row.indexOf('{expanded && (')
    expect(expandAt).toBeGreaterThan(0)
    for (const guard of [
      '{!latched && (!quiet || manage) && (canDecide || canWaive) && !decided',
      '{!latched && (!quiet || manage) && canDecide',
      '{!latched && canDecide && editOpen',
      '{!latched && canDecide && removeOpen',
      'mark-satisfied-',
    ]) {
      expect(row.indexOf(guard), `${guard} must sit inside the expanded branch`).toBeGreaterThan(expandAt)
    }
  })

  it('the metadata line carries the number, the page and the link to the source', () => {
    expect(checklist).toMatch(/condition \{cond\.condNumber\}/)
    expect(checklist).toMatch(/p\{cond\.sourcePage\}/)
    expect(checklist).toMatch(/openDocument\(cond\.documentId!, cond\.sourcePage\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the four states, and the two that had no home in them', () => {
  const key = (i: Parameters<typeof conditionChecklistState>[0]): ChecklistStateKey =>
    conditionChecklistState(i).key

  it('maps every status and presence live in the book today', () => {
    // The book carries exactly these, verified through portal_readonly on
    // 2026-08-05: status open / pre_checked / evidence_attached / satisfied /
    // waived, presence null / needs_input / obtained.
    expect(key({ status: 'open', presence: null })).toBe('nothing')
    expect(key({ status: 'open', presence: 'needs_input' })).toBe('nothing')
    expect(key({ status: 'open', presence: 'requested' })).toBe('nothing')
    expect(key({ status: 'pre_checked', presence: null })).toBe('nothing')
    expect(key({ status: 'open', presence: 'obtained' })).toBe('on_file')
    expect(key({ status: 'evidence_attached', presence: null })).toBe('on_file')
    expect(key({ status: 'open', presence: 'verified' })).toBe('on_file')
    expect(key({ status: 'satisfied', presence: null })).toBe('done')
  })

  it('WAIVED has no home in the brief four, so it is named rather than forced', () => {
    // Three live rows carry it. It recedes with the done family because it IS
    // finished, and its line says waived rather than satisfied, because the two
    // are different facts about a file.
    const w = conditionChecklistState({ status: 'waived', presence: null })
    expect(w.key).toBe('done')
    expect(w.line).toMatch(/^Waived with a note\./)
    expect(w.line).not.toMatch(/satisfied/)
  })

  it('an UNDERWRITING constraint has no home either, and is never a chase', () => {
    const u = conditionChecklistState({ status: 'open', presence: 'not_applicable' })
    expect(u.key).toBe('underwriting')
    expect(u.line).toMatch(/no document to collect/)
    // It sits in neither figure, so neither can read as work outstanding.
    const t = checklistTally(['underwriting', 'nothing', 'on_file'])
    expect(t).toEqual({ total: 3, collected: 1, outstanding: 1, needsYou: 1, settled: 1 })
  })

  it('the DONE line never invents who or when, because the row does not carry it', () => {
    // `conditions` has verified_by / verified_at and nothing else. The acting
    // human on a satisfy or a waive lives on the audit_log entry by design
    // (guardrail 19), so the line points at the record instead of guessing.
    for (const status of ['satisfied', 'waived']) {
      expect(conditionChecklistState({ status, presence: null }).line).toMatch(/audit log records who and when/)
    }
    // Verify DOES record both, so where they exist they are named.
    const v = conditionChecklistState({
      status: 'open',
      presence: 'verified',
      verifiedBy: 'michael',
      verifiedOn: '3 Jul',
    })
    expect(v.line).toBe('On file, confirmed by hand by michael on 3 Jul.')
  })

  it('THE INTERIM READING claims nothing about a document having been read', () => {
    // Not one condition in the book carries presence_detail.analysis, so the
    // check does not exist yet. A present document says it is present.
    expect(conditionChecklistState({ status: 'open', presence: 'obtained' }).line).toBe(
      'On file. Nothing has read it yet.',
    )
    // And the branch that replaces it the day the check ships is already here.
    expect(conditionChecklistState({ status: 'open', presence: 'obtained', analysisVerdict: 'meets' }).line).toMatch(
      /the check passed/,
    )
    for (const verdict of ['short', 'stale', 'rule_unmet', 'needs_review', 'kind_mismatch']) {
      expect(key({ status: 'open', presence: 'obtained', analysisVerdict: verdict })).toBe('problems')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the header: three counts and a navy bar', () => {
  it('collected, outstanding and settled partition the list exactly once each', () => {
    const states: ChecklistStateKey[] = ['nothing', 'nothing', 'on_file', 'problems', 'done', 'underwriting']
    const t = checklistTally(states)
    expect(t.total).toBe(6)
    expect(t.collected + t.outstanding + t.settled).toBe(t.total)
    // needsYou is a highlighted SUBSET, not a third slice: the unread document
    // and the failed check are both waiting on a person.
    expect(t.needsYou).toBe(2)
  })

  it('an empty list divides by nothing', () => {
    expect(checklistTally([])).toEqual({ total: 0, collected: 0, outstanding: 0, needsYou: 0, settled: 0 })
  })

  it('renders three figures and a navy progress bar, with lime on needs-you alone', () => {
    expect(checklist).toMatch(/\{tally\.collected\}<\/span> collected/)
    expect(checklist).toMatch(/\{tally\.outstanding\}<\/span> outstanding/)
    expect(checklist).toMatch(/needs you/)
    expect(checklist).toMatch(/h-full rounded-full bg-navy/)
    // The tally block spends the decision token exactly once, on needs-you.
    const at = checklist.indexOf('data-testid="conditions-tally"')
    const block = checklist.slice(at, at + 1400)
    expect((block.match(/bg-decision/g) ?? []).length).toBe(1)
    expect(block).toMatch(/bg-decision px-2 py-0\.5 font-semibold text-decision-ink/)
  })

  it('the figures are derived from the SAME states the rows render', () => {
    // Two derivations would eventually disagree, and a count contradicting a
    // glyph on the same screen is worse than no count.
    expect(checklist).toMatch(/checklistTally\(\s*brokerRows\.map\(/)
    expect(checklist).toMatch(/conditionChecklistState\(\{/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the short label, and the gap it is papering over', () => {
  it('names the document where the kind names one', () => {
    expect(conditionShortLabel({ docKind: 'letter_of_employment', text: 'x'.repeat(300) })).toEqual({
      label: 'Letter of employment',
      from: 'doc_kind',
      truncated: false,
    })
    expect(conditionShortLabel({ docKind: 'id', text: 'x' }).label).toBe('Photo identification')
    expect(conditionShortLabel({ docKind: 't4_noa', text: 'x' }).label).toBe('T4 and notice of assessment')
  })

  it('NEVER takes a label from `other`, which four of F057400 twelve carry', () => {
    // Four rows reading "other" down one page is worse than four truncations.
    const r = conditionShortLabel({ docKind: 'other', text: 'Provide confirmation of the legal description of the property.' })
    expect(r.from).toBe('text')
    expect(r.label).toBe('Provide confirmation of the legal description of the property.')
  })

  it('truncates at a word boundary and says it truncated', () => {
    const long =
      'Prior to advance, the Solicitor shall provide a report on title confirming a first charge in favour of the Lender.'
    const r = conditionShortLabel({ docKind: null, text: long })
    expect(r.from).toBe('text')
    expect(r.truncated).toBe(true)
    expect(r.label.endsWith('…')).toBe(true)
    expect(r.label.length).toBeLessThanOrEqual(73)
    // A word boundary, not a mid-word chop.
    expect(long.startsWith(r.label.slice(0, -1))).toBe(true)
    expect(r.label.slice(0, -1).endsWith(' ')).toBe(false)
  })

  it('a short text renders whole, and an empty one says so', () => {
    expect(conditionShortLabel({ docKind: null, text: 'Both/All to sign as Joint Tenants' })).toEqual({
      label: 'Both/All to sign as Joint Tenants',
      from: 'text',
      truncated: false,
    })
    expect(conditionShortLabel({ docKind: null, text: '   ' }).label).toBe('Condition text not recorded')
  })

  it('two rows that derive the SAME label are separated by their condition number', () => {
    // The live case: a two-borrower file carries two letters of employment and
    // the kind names both identically.
    expect(
      disambiguateLabels([
        { condNumber: '2', label: 'Letter of employment' },
        { condNumber: '3', label: 'Letter of employment' },
        { condNumber: '1', label: 'Fire insurance binder' },
      ]),
    ).toEqual(['Letter of employment (2)', 'Letter of employment (3)', 'Fire insurance binder'])
  })

  it('an unnumbered duplicate is left alone rather than given a fake marker', () => {
    expect(
      disambiguateLabels([
        { condNumber: null, label: 'Appraisal' },
        { condNumber: null, label: 'Appraisal' },
      ]),
    ).toEqual(['Appraisal', 'Appraisal'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('grouping, and the fallback that matters more than the grouping', () => {
  it('says why everything sits under General when no borrower is on record', () => {
    // BRXM-F060561: twelve conditions, zero borrower rows.
    const note = borrowerGroupingNote({ borrowerCount: 0, linkedRowCount: 0, rowCount: 6 })
    expect(note).toMatch(/no borrower is on record/)
    expect(note).toMatch(/nothing here guesses/)
  })

  it('distinguishes borrowers-on-file-but-unlinked, and counts them', () => {
    // BRXM-F053724: two borrowers, zero of thirty-three conditions linked.
    const note = borrowerGroupingNote({ borrowerCount: 2, linkedRowCount: 0, rowCount: 12 })
    expect(note).toMatch(/2 borrowers on record/)
    expect(note).not.toMatch(/no borrower is on record/)
  })

  it('is SILENT the moment one row is genuinely linked', () => {
    // BRXM-F057400: five of twelve carry a borrower_id, so the grouping speaks
    // for itself and an explainer would be noise.
    expect(borrowerGroupingNote({ borrowerCount: 2, linkedRowCount: 5, rowCount: 12 })).toBeNull()
    expect(borrowerGroupingNote({ borrowerCount: 0, linkedRowCount: 0, rowCount: 0 })).toBeNull()
  })

  it('NOTHING parses a name out of condition text', () => {
    // The extractor captured the names only as a text prefix. Parsing one out
    // would break silently the first time a lender wrote it differently, and
    // it would put one client on another client's row.
    const grouping = checklist.slice(
      checklist.indexOf('function groupByBorrower'),
      checklist.indexOf('function labelsFor'),
    )
    expect(grouping).toMatch(/c\.borrowerId/)
    expect(grouping).not.toMatch(/\.text/)
    // And the module that owns the rule never reads text to decide a person.
    expect(stripComments(statusLib)).not.toMatch(/borrowerGroupingNote[\s\S]{0,600}\btext\b/)
  })

  it('both surfaces group General-first and both carry the fallback', () => {
    expect((checklist.match(/groupByBorrower\(/g) ?? []).length).toBe(2)
    expect((checklist.match(/borrowerGroupingNote\(\{/g) ?? []).length).toBe(2)
    expect(checklist).toContain('conditions-grouping-note')
    expect(checklist).toContain('pending-grouping-note')
  })

  it('section headings are quiet navy sentence case, not shouted caps', () => {
    expect(checklist).toMatch(/function SectionHeading/)
    expect(checklist).toMatch(/font-heading text-xs font-semibold text-navy border-b border-cool-100/)
    expect(checklist).not.toMatch(/uppercase tracking-\[0\.05em\] text-cool-600/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the palette: navy did the job, lime needs you, done recedes, no red', () => {
  it('a missing document is never red: overdue and load-bearing read in navy', () => {
    expect(checklist).toMatch(/overdue \? 'text-navy font-semibold' : 'text-cool-500'/)
    expect(checklist).not.toMatch(/border-red-200 bg-red-50'\s*:\s*'border-cool-100/)
    // The load-bearing chip lost its red-100 fill for the navy MetaChip.
    expect(checklist).not.toMatch(/bg-red-100 px-2 py-0\.5 font-semibold text-red-700/)
  })

  it('the findings block reads lime for a gap and navy for a pass', () => {
    for (const verdict of ['short', 'stale', 'rule_unmet', 'needs_review', 'kind_mismatch']) {
      expect(checklist).toMatch(new RegExp(`${verdict}: \\{ box: 'bg-decision/10 border-cool-200 text-decision-ink'`))
    }
    expect(checklist).toMatch(/meets: \{ box: 'bg-cool-50 border-cool-200 text-navy'/)
  })

  it('the only red left is destructive controls and error text, and it is enumerated', () => {
    // Red keeps ONE meaning here: this press cannot be taken back. Reject list
    // and Remove are the two, and an error message is not state.
    const reds = checklist
      .split('\n')
      .map((l, i) => [i + 1, l] as const)
      .filter(([, l]) => /\b(?:bg|text|border|decoration|hover:decoration|focus:border)-red-/.test(l))
    for (const [line, src] of reds) {
      const ok =
        /errors\[/.test(src) || // an error message
        /bg-red-(600|700) text-white/.test(src) || // Reject list / Remove, armed and unarmed
        /setRemoveOpen/.test(src) || // the Remove link
        /removeReason|border-red-200 bg-red-50 p-2\.5|focus:border-red-400/.test(src) // the Remove panel
      expect(ok, `line ${line} carries red outside the destructive controls: ${src.trim()}`).toBe(true)
    }
    expect(reds.length).toBeGreaterThan(0)
  })

  it('done recedes: grey and struck through, never a colour that competes', () => {
    expect(checklist).toMatch(/state\.key === 'done' \? 'text-cool-400 line-through' : 'text-navy'/)
    expect(checklist).toMatch(/done: 'bg-cool-200 text-cool-500'/)
  })

  it('the glyph is decoration: the state is stated in words beside it', () => {
    expect(checklist).toMatch(/aria-hidden="true"/)
    expect(checklist).toMatch(/\{state\.line\}/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('what was NOT built, on purpose', () => {
  it('no new write path: the fetch allowlist is unchanged', () => {
    const fetches = Array.from(stripComments(checklist).matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)).map(m => m[1])
    expect(fetches.length).toBeGreaterThan(0)
    for (const f of fetches) {
      expect(
        f!.startsWith('/api/portal/admin/gates/') || f!.startsWith('/api/portal/admin/commitments/'),
        `${f} is outside the allowlist`,
      ).toBe(true)
    }
  })

  it('no document check, no email, no chase state on the row', () => {
    // All three are scoped separately. Adding any of them here is how this
    // rebuild goes wrong.
    const src = stripComments(checklist) + stripComments(statusLib)
    expect(src).not.toMatch(/sendReminder|mailto:|chaseState|chase_state|lastChasedAt/)
  })

  it('no condition status is written by the layout: the verbs are handoff 55 unchanged', () => {
    const posts = Array.from(stripComments(checklist).matchAll(/action: '(\w+)'/g)).map(m => m[1])
    expect(new Set(posts)).toEqual(new Set(['satisfied', 'waived', 'approve']))
    // The list gate's two are passed through as a variable, so they are pinned
    // on the signature instead of as literals in a body.
    expect(checklist).toMatch(/action: 'approve' \| 'reject'/)
  })
})
