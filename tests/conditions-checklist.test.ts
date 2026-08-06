// The conditions checklist redesign (handoff 55) — Michael's verdict on the
// first real re-extraction was that the checklist was poor, with two
// instructions: solicitor conditions are not his concern (sectioned off, never
// removed), and he works conditions ONE AT A TIME, each knocked off as it is
// fulfilled by him and accepted by the lender.
//
// The redesign is a RENDERING job on a model that already fits: the status
// axis (open, pre_checked, evidence_attached, satisfied) already exists and is
// in live use; `satisfied` was already accepted by the /decision proxy and
// simply lost its renderer when ConditionsPanel was deleted in July. Nothing
// here invents a state or a write path.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { compareCondNumber, isUnassignedOwnership, sortConditions } from '@/lib/conditions-status'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const checklist = read('components/admin/ConditionsChecklist.tsx')
const conditionsTab = read('components/admin/deals-beta/FileConditions.tsx')
const roomPage = read('app/portal/admin/deals/[id]/page.tsx')

/** Comments off, so prose explaining a rule is never mistaken for a breach. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

// ─────────────────────────────────────────────────────────────────────────────
describe('numeric order everywhere conditions render', () => {
  it('sorts 1, 2, 10, 11 — never 1, 10, 11, 2', () => {
    const rows = ['1', '10', '11', '12', '2', '3', '9'].map(n => ({ condNumber: n }))
    expect(sortConditions(rows).map(r => r.condNumber)).toEqual(['1', '2', '3', '9', '10', '11', '12'])
  })

  it('handles lender suffixes, prose numbers and missing numbers honestly', () => {
    // 7 before 7a before 8; numbered before non-numeric; unnumbered LAST.
    expect(compareCondNumber('7', '7a')).toBeLessThan(0)
    expect(compareCondNumber('7a', '8')).toBeLessThan(0)
    expect(compareCondNumber('12', 'A')).toBeLessThan(0)
    expect(compareCondNumber(null, '1')).toBeGreaterThan(0)
    expect(compareCondNumber('', '1')).toBeGreaterThan(0)
    expect(compareCondNumber(null, null)).toBe(0)
    const rows = [{ condNumber: null }, { condNumber: '2' }, { condNumber: 'A' }, { condNumber: '10' }]
    expect(sortConditions(rows).map(r => r.condNumber)).toEqual(['2', '10', 'A', null])
  })

  it('dotted sub-numbers sort numerically too: 1.2 before 1.10 (review catch)', () => {
    // The photographed defect reproduced one level down: a lexicographic
    // tie-break rendered 1.1, 1.10, 1.11, 1.2. The tie-break is numeric-aware.
    const rows = ['1.1', '1.10', '1.11', '1.2', '1.3'].map(n => ({ condNumber: n }))
    expect(sortConditions(rows).map(r => r.condNumber)).toEqual(['1.1', '1.2', '1.3', '1.10', '1.11'])
    expect(compareCondNumber('2.9', '2.10')).toBeLessThan(0)
  })

  it('is applied at BOTH render sites: the pending banner and the working list', () => {
    // The fetchers order by document/text-number (pending) and due date
    // (approved); neither order may reach the screen. The component sorts.
    const banner = checklist.slice(checklist.indexOf('function PendingBanner'), checklist.indexOf('function PendingRow'))
    expect(banner).toMatch(/sortConditions\(rows\)/)
    const approvedList = checklist.slice(checklist.indexOf('function ApprovedChecklist'))
    expect(approvedList).toMatch(/sortConditions\(approved\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the knock-off: Mark satisfied, an existing verb rewired', () => {
  it('posts action satisfied to the SAME /decision proxy Waive already used', () => {
    // conditions.decide accepts satisfied | moot | waived; satisfied needs no
    // note. No new route, no new key, no new state — the verb lost its
    // renderer when ConditionsPanel was deleted (commit 7107031) and this
    // gives it one.
    expect(checklist).toMatch(/\{ action: 'satisfied' \}/)
    expect(checklist).toMatch(/conditions\/\$\{cond\.id\}\/decision/)
    expect(checklist).toContain('mark-satisfied-')
    // moot stays unwired: Michael did not ask for it and scope is scope.
    expect(stripComments(checklist)).not.toContain("'moot'")
  })

  it('arms by timestamp and LATCHES after success, EXPIRING on the server truth', () => {
    expect(checklist).toMatch(/armed\?\.key === satisfyKey && armed && Date\.now\(\) - armed\.at <= ARM_WINDOW_MS/)
    // THE REVIEW'S HIGH FINDING: client state survives router.refresh on a
    // stable key, so a never-cleared latch would block the row forever — a
    // successful Verify would permanently hide Mark satisfied. The latch
    // snapshots the row's state at press time and holds only while the props
    // still match, so the refresh's truth releases it.
    expect(checklist).toMatch(/latch\.status === cond\.status/)
    expect(checklist).toMatch(/latch\.presence === cond\.presence/)
    expect(checklist).toMatch(/latch\.owner === cond\.owner/)
    expect(checklist).not.toContain('setLatch(null)')
    // EVERY terminal verb latches: satisfied, verify, waive, remove, reassign.
    const latchSites = checklist.match(/if \(ok\) setRowLatch\(/g) ?? []
    expect(latchSites.length).toBe(5)
    // The latch suppresses ALL FOUR control regions: the decision row, the
    // manual row, and both panels (the review caught the panels staying live).
    expect(checklist).toMatch(/\{!latched && \(!quiet \|\| manage\) && \(canDecide \|\| canWaive\) && !decided/)
    expect(checklist).toMatch(/\{!latched && \(!quiet \|\| manage\) && canDecide/)
    expect(checklist).toMatch(/\{!latched && canDecide && editOpen/)
    expect(checklist).toMatch(/\{!latched && canDecide && removeOpen/)
  })

  it('the banner latches per document, and the rows FREEZE with it', () => {
    expect(checklist).toMatch(/const \[decided, setDecided\] = useState<Record<string, string>>\(\{\}\)/)
    expect(checklist).toContain('pending-list-decided')
    expect(checklist).not.toContain('setDecided({})')
    // The review caught per-row controls staying pressable after the
    // document-level decision: rows now freeze the moment the banner latches.
    expect(checklist).toMatch(/frozen=\{Boolean\(decided\[docId\]\)\}/)
    expect(checklist).toMatch(/const locked = frozen \|\| done !== null/)
  })

  it("the pending row's own Approve latches too (review catch)", () => {
    expect(checklist).toMatch(/if \(ok\) \{\s*setEditing\(false\)\s*setDone\('Approved\. This row is leaving the pending set\.'\)/)
    expect(checklist).toContain('pending-row-latched')
    expect(checklist).toMatch(/canDecide && !locked && \(/)
    expect(checklist).toMatch(/canDecide && editing && !locked && \(/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the split Michael asked for', () => {
  it('the pending set reads broker first, solicitor sectioned off with a count', () => {
    const banner = checklist.slice(checklist.indexOf('function PendingBanner'), checklist.indexOf('function PendingRow'))
    expect(banner).toMatch(/isBrokerCondition\(r\.owner\)/)
    expect(banner).toMatch(/Broker conditions · \{brokerSide\.length\}/)
    expect(banner).toMatch(/handled at the lawyer's office and elsewhere/)
  })

  it("the working list's non-broker section says where the work happens", () => {
    expect(checklist).toContain('lawyer-office-section')
    expect(checklist).toMatch(/Handled at the lawyer's office and elsewhere · \{nonBrokerRows\.length\}/)
    expect(checklist).toMatch(/Not the broker's to fulfil/)
    // Quiet rows: status renders, controls sit behind a manage toggle.
    expect(checklist).toMatch(/quiet \{\.\.\.rowProps\}/)
    expect(checklist).toMatch(/setManage\(true\)/)
  })

  it("the explainer never claims statuses show while the Hide box hides them (review catch)", () => {
    // "their status still shows" must render only while the rows can.
    const at = checklist.indexOf("Not the broker's to fulfil")
    const before = checklist.slice(Math.max(0, at - 400), at)
    expect(before).toMatch(/\{!hideNonBroker && \(/)
  })

  it("the banner's solicitor group opens by default: a pending set is being READ (review catch)", () => {
    const banner = checklist.slice(checklist.indexOf('function PendingBanner'), checklist.indexOf('function PendingRow'))
    expect(banner).toMatch(/<Disclosure\s+defaultOpen/)
    // The working list's groups stay collapsed: information, not a decision.
    const working = checklist.slice(checklist.indexOf('function ApprovedChecklist'), checklist.indexOf('function Disclosure'))
    expect(working).not.toMatch(/<Disclosure\s+defaultOpen/)
  })

  it('the armed state stays in the house palette: no green-filled press states', () => {
    expect(checklist).not.toContain('bg-green-700')
  })

  it('unassigned ownership lands in the broker list, visibly flagged', () => {
    // The two general_verification conditions on F060561 carry owner broker
    // but no clear lender assignment. Ambiguity defaults to where it is SEEN.
    expect(isUnassignedOwnership('general_verification')).toBe(true)
    expect(isUnassignedOwnership('broker_deliverable')).toBe(false)
    expect(isUnassignedOwnership('solicitor')).toBe(false)
    expect(isUnassignedOwnership(null)).toBe(false)
    const chips = checklist.match(/unassigned ownership/g) ?? []
    // Once on the pending row, once on the approved row, once in the explainer
    // line's flag name.
    expect(chips.length).toBeGreaterThanOrEqual(3)
    expect(checklist).toMatch(/isUnassignedOwnership\(cond\.category\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the three screen defects', () => {
  it('reject carries its true weight: destructive solid, never the escape-hatch outline', () => {
    const banner = checklist.slice(checklist.indexOf('function PendingBanner'), checklist.indexOf('function PendingRow'))
    expect(banner).toMatch(/bg-red-600 text-white/)
    expect(banner).toMatch(/bg-red-700 text-white/)
    // The old outline treatment is gone from the banner.
    expect(banner).not.toMatch(/bg-white border border-cool-300 text-navy/)
  })

  it('one line of copy says a rejected set cannot be redrafted from here', () => {
    expect(checklist).toMatch(/Reject is final for this document/)
    expect(checklist).toMatch(/cannot be redrafted from here/)
    expect(checklist).toMatch(/amendment upload/)
  })

  it('the beta header says PENDING while a set is pending', () => {
    expect(conditionsTab).toMatch(/pending\.length > 0/)
    expect(conditionsTab).toMatch(/pending your decision/)
    expect(conditionsTab).toMatch(/open\} open of \$\{approved\.length\}/)
  })

  it('the room header says PENDING while a set is pending', () => {
    expect(roomPage).toMatch(/pendingCommit\.length > 0/)
    expect(roomPage).toMatch(/pending your decision/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('what was NOT built, on purpose', () => {
  it('no new write path: every fetch still targets the two allowed prefixes', () => {
    // tests/beta-file.test.ts enforces this too and passes unmodified; this is
    // the redesign's own record of it.
    const fetches = Array.from(stripComments(checklist).matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)).map(m => m[1])
    expect(fetches.length).toBeGreaterThan(0)
    for (const f of fetches) {
      expect(
        f.startsWith('/api/portal/admin/gates/') || f.startsWith('/api/portal/admin/commitments/'),
        `${f} is outside the allowlist`,
      ).toBe(true)
    }
  })

  it('no invented state: the status vocabulary in the component is the stored one', () => {
    // "Accepted by the lender" has NO distinct state in the model. satisfied
    // is the closest existing verb and the one wired. If Michael needs
    // lender-acceptance recorded as its own fact, that is a workbench change,
    // reported rather than silently added here.
    expect(stripComments(checklist)).not.toMatch(/accepted_by_lender|lender_accepted/)
  })
})
