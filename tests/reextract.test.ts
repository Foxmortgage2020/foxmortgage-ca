// The re-extract control (handoff 53) — the retry for a commitment whose
// condition extraction failed. BRXM-F060561 is the file this exists for: an
// approved commitment, ten approved terms, zero conditions, one failed
// extraction attempt on 2026-07-31, and no production caller able to retry it
// short of re-uploading the document.
//
// Census 2026-08-05 through portal_readonly, before anything was built: the
// target document is 9424b55c… (real, signed_commitment), the book carries
// ZERO pending conditions anywhere, and F057400's real commitment d1af3684…
// sits on a file with 157 condition rows, which is what a succeeded attempt
// looks like and what the gate's refusal exists to protect.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  REEXTRACT_MODES,
  REEXTRACT_PENDING_COPY,
  REEXTRACT_REASON_MAX,
  REEXTRACT_REFUSED_COPY,
  REEXTRACT_TERMS_COPY,
  checkReextractReason,
} from '@/lib/reextract'
import { PERMISSIONS } from '@/config/authority'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Comments off, because the files explain guardrail 19 in prose that names
 *  the very tokens the scan bans from CODE. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const control = read('components/admin/deals-beta/ReextractControl.tsx')
const route = read(
  'app/api/portal/admin/gates/commitment-extractions/[documentId]/retry/route.ts',
)
const gates = read('lib/gates.ts')
const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
const commitmentTab = read('components/admin/deals-beta/FileCommitment.tsx')

// ─────────────────────────────────────────────────────────────────────────────
describe('the apply reason', () => {
  it('is required, and says what it becomes', () => {
    for (const bad of [undefined, null, '', '   ', 42, {}]) {
      const r = checkReextractReason(bad)
      expect(r.ok, `${JSON.stringify(bad)} is not a reason`).toBe(false)
      if (!r.ok) expect(r.message).toMatch(/record of why/i)
    }
  })

  it('REFUSES an over-long reason rather than truncating it', () => {
    const r = checkReextractReason('x'.repeat(REEXTRACT_REASON_MAX + 1))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.message).toContain(String(REEXTRACT_REASON_MAX + 1))
      expect(r.message).toMatch(/exactly as written/i)
    }
    expect(checkReextractReason('x'.repeat(REEXTRACT_REASON_MAX)).ok).toBe(true)
  })

  it('trims, and returns exactly what will be sent', () => {
    const r = checkReextractReason('  the extraction failed on upload  ')
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.reason).toBe('the extraction failed on upload')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the route', () => {
  it('gates on commitment.reextract, which is admin only', () => {
    expect(route).toContain("apiPermission('commitment.reextract')")
    expect(PERMISSIONS['commitment.reextract']).toEqual(['admin'])
  })

  it('accepts exactly two modes', () => {
    expect(REEXTRACT_MODES).toEqual(['dry_run', 'apply'])
    expect(route).toContain('REEXTRACT_MODES.includes(mode)')
  })

  it('THE DRY RUN BODY IS {mode} AND NOTHING ELSE (handoff 54, corrected live)', () => {
    // The first production press of preview answered 422 `Unrecognized key:
    // "reason"` because the route injected a literal into every call. The
    // gate's schema is strict PER MODE: reason is an apply-only field, and the
    // strictness protects the identity fields, so the fix lives here. The
    // payload is built in exactly one place — the gates client — with the
    // conditional shape, so nothing the browser sends can widen it.
    expect(gates).toMatch(/mode === 'apply' \? \{ mode, reason \} : \{ mode \}/)
    expect(route).toContain('let reason: string | null = null')
    expect(route).toMatch(/mode === 'apply'[\s\S]{0,200}checkReextractReason/)
    // The retired literal must not come back under any name.
    expect(route).not.toContain('DRY_RUN_REASON')
    expect(stripComments(read('lib/reextract.ts'))).not.toContain('DRY_RUN_REASON')
  })

  it('sends only mode and reason: no human identity rides the body (guardrail 19)', () => {
    for (const banned of ['instructed_by', 'instructedBy', 'actor', 'decided_by', 'user_email']) {
      expect(stripComments(route)).not.toContain(banned)
      expect(stripComments(control)).not.toContain(banned)
    }
    // The gates client builds the payload conditionally and forwards the
    // token: {mode} alone on dry_run, {mode, reason} on apply, nothing wider.
    expect(gates).toMatch(
      /commitment-extractions\/\$\{documentId\}\/retry`,\s*mode === 'apply' \? \{ mode, reason \} : \{ mode \}/,
    )
    expect(route).toContain("req.headers.get('x-gates-token')")
  })

  it('the path segment is commitment-extractions, and the slug conflict is documented', () => {
    // app/api/portal/admin/commitments/ already carries [dealId]; a second
    // dynamic segment named differently at that level will not build. The
    // route must say so, so a tidy-minded session reads why before renaming.
    expect(route).toContain('/api/gates/commitment-extractions/')
    expect(route).toMatch(/slug conflict/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the control', () => {
  it('THE PREVIEW IS NOT OPTIONAL: apply renders only after a dry run succeeds', () => {
    // The apply button, the reason box and the arming all live inside the
    // forecast branch, so no code path shows them before a preview has
    // returned in this mount.
    const previewBranch = control.indexOf('forecast === null ? (')
    const applyControl = control.indexOf('beta-reextract-apply')
    const reasonBox = control.indexOf('beta-reextract-reason')
    expect(previewBranch).toBeGreaterThan(0)
    expect(applyControl).toBeGreaterThan(previewBranch)
    expect(reasonBox).toBeGreaterThan(previewBranch)
    // And the preview posts dry_run, never apply.
    expect(control).toMatch(/preview = useCallback[\s\S]{0,120}post\('dry_run'\)/)
  })

  it('the forecast renders IN FULL, not as a count', () => {
    expect(control).toContain('beta-reextract-forecast')
    expect(control).toMatch(/forecast\.map\(/)
    // Every row shows its text; owner and category render when present.
    expect(control).toMatch(/String\(c\.text/)
    expect(control).toMatch(/c\.owner/)
  })

  it('reads the forecast from data.preview.conditions, the shape captured live', () => {
    // Established empirically on 2026-08-05: the gate nests the forecast under
    // `preview` with `would_draft` and `coverage_notes` beside it. The first
    // cut guessed `data.conditions` and rendered zero rows over a successful
    // twelve-row dry run. The captured response is the record; do not
    // re-derive this from a brief.
    expect(control).toMatch(/json\.data\?\.preview/)
    expect(control).toMatch(/p\?\.conditions/)
    expect(control).toMatch(/p\?\.coverage_notes/)
    expect(control).toContain('beta-reextract-notes')
    expect(control).not.toMatch(/json\.data\?\.conditions/)
  })

  it('the reason is typed: required, and NEVER prefilled', () => {
    expect(control).toMatch(/\[reason, setReason\] = useState\(''\)/)
    expect(control).not.toMatch(/setReason\((?!e\.target\.value)[^)]+\)/)
    expect(control).toContain('disabled={busy || !reasonCheck.ok}')
  })

  it('apply arms by timestamp and LATCHES after success, like the Remove control', () => {
    expect(control).toMatch(/Date\.now\(\) - armed <= ARM_WINDOW_MS/)
    expect(control).toMatch(/const \[done, setDone\] = useState/)
    expect(control).toMatch(/if \(done \|\| busy\) return/)
    expect(control).not.toContain('setDone(null)')
  })

  it('a conflict on APPLY latches too, because pressing again cannot help', () => {
    const applyFn = control.slice(control.indexOf('const apply = useCallback'))
    const conflictAt = applyFn.indexOf("kind === 'conflict'")
    expect(conflictAt).toBeGreaterThan(0)
    expect(applyFn.slice(conflictAt, conflictAt + 260)).toContain('setDone')
  })

  it('a conflict on PREVIEW is the refusal, surfaced as a reason, not a hidden button', () => {
    const previewFn = control.slice(
      control.indexOf('const preview = useCallback'),
      control.indexOf('const apply = useCallback'),
    )
    expect(previewFn).toMatch(/kind === 'conflict'[\s\S]{0,320}setRefused/)
    expect(control).toContain('beta-reextract-refused')
    // The refusal state renders INSTEAD of the buttons: the branch order is
    // refused, then done, then the working control.
    expect(control).toMatch(/\{refused \? \(/)
  })

  it('the refusal copy says what a conflict MEANS here, not "Already decided."', () => {
    // The gates client's generic conflict copy is wrong on this endpoint:
    // nothing was decided, the extraction succeeded. Both conflict branches
    // render the module's own sentence, established by the handoff 54 probes.
    expect(REEXTRACT_REFUSED_COPY).toMatch(/succeeded extraction/)
    expect(REEXTRACT_REFUSED_COPY).toMatch(/nothing to retry/i)
    expect(control).toMatch(/setRefused\(REEXTRACT_REFUSED_COPY\)/)
    expect(control).toMatch(/setDone\(REEXTRACT_REFUSED_COPY\)/)
    // Comments may QUOTE the wrong copy to explain why it is wrong; the code
    // must not render it.
    expect(stripComments(control)).not.toContain('Already decided')
  })

  it('says what lands and what cannot be damaged, above the buttons', () => {
    expect(control).toContain('REEXTRACT_PENDING_COPY')
    expect(control).toContain('REEXTRACT_TERMS_COPY')
    expect(REEXTRACT_PENDING_COPY).toMatch(/pending/i)
    expect(REEXTRACT_PENDING_COPY).toMatch(/list is approved/i)
    expect(REEXTRACT_TERMS_COPY).toMatch(/approved committed terms are untouched/i)
    expect(REEXTRACT_TERMS_COPY).toMatch(/never overwrites an approved term/i)
  })

  it('the only network call is the gates proxy', () => {
    const fetches = Array.from(control.matchAll(/fetch\(\s*[`'"]([^`'"]+)/g)).map(m => m[1])
    expect(fetches).toHaveLength(1)
    expect(fetches[0]).toContain('/api/portal/admin/gates/commitment-extractions/')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the two empty states (handoff 54)', () => {
  const conditionsTab = read('components/admin/deals-beta/FileConditions.tsx')
  const checklist = read('components/admin/ConditionsChecklist.tsx')

  it('zero conditions with NO commitment says upload one', () => {
    expect(conditionsTab).toContain('beta-conditions-empty-nocommitment')
    expect(conditionsTab).toMatch(/because no lender commitment is on file/)
  })

  it('zero conditions WITH a commitment says the extraction failed and points at the control', () => {
    expect(conditionsTab).toContain('beta-conditions-empty-failed')
    expect(conditionsTab).toMatch(/the condition extraction failed/i)
    expect(conditionsTab).toMatch(/Commitment tab/)
    expect(conditionsTab).toMatch(/\?tab=commitment/)
    // The sentence that sent Michael toward a second upload is countered
    // explicitly: a second upload is the 157-row churn.
    expect(conditionsTab).toMatch(/Do not upload the commitment again/)
    expect(conditionsTab).toMatch(/second document and a\s+second extraction/)
  })

  it('the branch keys on hasRealCommitment, the guardrail-20 computation', () => {
    expect(conditionsTab).toMatch(/emptyStateFor\(hasRealCommitment\)/)
  })

  it('the ROOM keeps its own copy: the shared default is unchanged and only overridable', () => {
    // The deal room passes no emptyState, so its sentence stays exactly as it
    // was. Changing the room's copy is the room's own change, not this one.
    expect(checklist).toContain(
      'No conditions on this file yet. Upload the commitment to draft the checklist, or add one by hand above.',
    )
    expect(checklist).toMatch(/emptyState \?\? \(/)
    const room = read('app/portal/admin/deals/[id]/page.tsx')
    expect(room).not.toContain('emptyState')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the mount', () => {
  it('renders per REAL commitment document, on the same family the uploader keys on', () => {
    expect(page).toMatch(/reextractTargets = documentRows[\s\S]{0,400}provenance === 'real'/)
    expect(page).toMatch(/reviewStatus !== 'rejected'/)
    expect(commitmentTab).toContain('ReextractControl')
    expect(commitmentTab).toMatch(/canReextract &&/)
  })

  it('is gated on the key and hidden in demo, like every decision control', () => {
    expect(page).toContain("can(user, 'commitment.reextract') && !isDemoMode()")
  })

  it('the drafted set lands where the badge and the list gate already read', () => {
    // The chain the brief asks about: the gate drafts gate_status=pending,
    // getPendingCommitmentConditions filters exactly that, buildTabBadges
    // counts it, and ConditionsChecklist renders the approval banner. All four
    // links exist today, so the first real apply lights the badge with no
    // further wiring.
    const uw = read('lib/underwriting.ts')
    const pendingFn = uw.slice(uw.indexOf('export async function getPendingCommitmentConditions'))
    expect(pendingFn.slice(0, 800)).toContain("gate_status: 'eq.pending'")
    expect(page).toContain('buildTabBadges({ pendingConditions: pendingConds.length })')
    const checklist = read('components/admin/ConditionsChecklist.tsx')
    expect(checklist).toContain('/api/portal/admin/gates/commitment-conditions/')
  })
})
