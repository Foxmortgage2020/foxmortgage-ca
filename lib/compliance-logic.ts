// Pure compliance derivations (Session 6), unit-tested in
// tests/compliance.test.ts. Two jobs: the credential expiry thresholds
// that feed the home Needs Attention rail, and the per-file posture
// summary computed ONLY from what the workbench actually records. Nothing
// here fabricates a compliance signal from adjacent data; unknowns stay
// unknowns.

// ─── Credential expiry thresholds ───────────────────────────────────────────
// Within 60 days of expiry a credential joins the attention rail amber;
// within 14 days (or past due) it goes red. No date recorded means no
// alarm and an explicit confirm-the-date state instead.

export const CREDENTIAL_AMBER_DAYS = 60
export const CREDENTIAL_RED_DAYS = 14

export type CredentialTone = 'red' | 'amber' | 'ok' | 'no-date'

/** Whole days from today to the date, negative when past. Both arguments
 * are YYYY-MM-DD strings (Toronto day for today). */
export function daysUntil(dateYMD: string, todayYMD: string): number {
  const [y1, m1, d1] = todayYMD.split('-').map(Number)
  const [y2, m2, d2] = dateYMD.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000)
}

export function credentialTone(expiresOn: string | null, todayYMD: string): CredentialTone {
  if (!expiresOn) return 'no-date'
  const days = daysUntil(expiresOn, todayYMD)
  if (days <= CREDENTIAL_RED_DAYS) return 'red'
  if (days <= CREDENTIAL_AMBER_DAYS) return 'amber'
  return 'ok'
}

// ─── Per-file posture ───────────────────────────────────────────────────────
// The one-line summary on the deal room compliance card. The rule is
// stated verbatim in the tooltip (POSTURE_RULE) so the computation is
// never a black box:
//   attention        — the file has an open compliance_gap flag, or an
//                      overdue condition in a compliance-bearing category
//   clear            — no attention signal, and the file has recorded
//                      conditions or flags to judge from
//   gaps unrecorded  — no attention signal and nothing recorded either
//                      way; clear cannot be claimed from an empty file

export type CompliancePosture = 'attention' | 'clear' | 'gaps-unrecorded'

export const POSTURE_RULE =
  'Computed only from recorded data: attention when the file has an open compliance_gap flag or an overdue condition in a compliance-bearing category (solicitor, borrower execution); clear when neither signal fires and the file has recorded conditions or flags; gaps unrecorded when the file has nothing recorded to judge from. Fields the workbench does not capture yet are listed below and never count toward clear.'

// The stored conditions.category vocabulary's compliance-bearing values
// (live inventory 2026-07-10: solicitor, borrower_execution,
// general_verification, property_valuation, product_mechanics,
// broker_deliverable). Solicitor confirmations and borrower execution of
// disclosures are the supervision-facing pair.
export const COMPLIANCE_CONDITION_CATEGORIES = ['solicitor', 'borrower_execution'] as const

export function isComplianceCategory(category: string | null): boolean {
  return category !== null && (COMPLIANCE_CONDITION_CATEGORIES as readonly string[]).includes(category)
}

export interface PostureInput {
  openComplianceFlags: number
  overdueComplianceConditions: number
  /** Any conditions or flags rows recorded on the file at all. */
  hasAnyRecorded: boolean
}

export function compliancePosture(input: PostureInput): CompliancePosture {
  if (input.openComplianceFlags > 0 || input.overdueComplianceConditions > 0) return 'attention'
  return input.hasAnyRecorded ? 'clear' : 'gaps-unrecorded'
}

export const POSTURE_LABEL: Record<CompliancePosture, string> = {
  attention: 'Attention',
  clear: 'Clear on recorded signals',
  'gaps-unrecorded': 'Gaps unrecorded',
}

// The compliance fields the workbench does not capture yet. They render
// as honest gaps on every card and never count toward a posture; when the
// workbench gains them, this list shrinks and the card lights up.
export const WORKBENCH_GAP_FIELDS = [
  'Documented suitability assessment',
  'Exit strategy note on private files',
  'Identity verification status',
  'Disclosure delivered date',
  'Submission package state',
] as const
