// Re-running a commitment's condition extraction (handoff 53) — the rules and
// the copy, in one pure module. No next, no Clerk, no fetch imports: the twin
// of lib/rec-withdrawal.ts, so the route, the control and the tests share one
// definition of every bound and every sentence.
//
// WHY THIS EXISTS AT ALL: BRXM-F060561 carries an approved commitment, ten
// approved terms and an EMPTY conditions checklist, because its extraction
// failed once on 2026-07-31 (a region bug, since fixed) and the extractor's
// only production caller was the upload endpoint. The gate's retry is live;
// this module is the portal half of pressing it.

export type ReextractMode = 'dry_run' | 'apply'

export const REEXTRACT_MODES: readonly ReextractMode[] = ['dry_run', 'apply']

/** Mirrors the withdrawal reason ceiling. The gate revalidates and its 422
 *  surfaces verbatim, so a drifted bound fails loud rather than silently. */
export const REEXTRACT_REASON_MAX = 2000

/** What the gate records for a preview. A dry run writes nothing and nobody
 *  has decided anything yet when preview is pressed, so the route supplies
 *  this literal and the browser never invents a reason. */
export const DRY_RUN_REASON = 'Preview from the portal. Nothing is written in this mode.'

/** The two facts a broker pressing this control needs before touching it.
 *  Rendered above the buttons on the control, asserted by test, and written
 *  once here so the control and the tests cannot drift apart. */
export const REEXTRACT_PENDING_COPY =
  'Everything this drafts lands as pending. Nothing becomes the checklist until the condition list is approved, the same gate every commitment upload feeds.'
export const REEXTRACT_TERMS_COPY =
  'The approved committed terms are untouched. A re-extraction never overwrites an approved term row, so what is already decided cannot be damaged from here.'

/** The apply reason: required, trimmed, sent exactly as written or refused. */
export function checkReextractReason(
  raw: unknown,
): { ok: true; reason: string } | { ok: false; message: string } {
  if (typeof raw !== 'string' || !raw.trim()) {
    return {
      ok: false,
      message:
        'A reason is required to apply a re-extraction. It becomes the record of why the checklist was re-drafted.',
    }
  }
  const reason = raw.trim()
  if (reason.length > REEXTRACT_REASON_MAX) {
    return {
      ok: false,
      message: `That reason is ${reason.length} characters. Shorten it to ${REEXTRACT_REASON_MAX} or fewer and it will send exactly as written.`,
    }
  }
  return { ok: true, reason }
}
