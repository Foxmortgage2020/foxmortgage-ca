import { randomBytes } from 'crypto'

// ─── Magic link tokens ────────────────────────────────────────────────────

const MAGIC_LINK_TTL_DAYS = 14

/**
 * Generate a cryptographically secure magic-link token. 32 bytes hex
 * is 64 chars — matches the Magic_Link_Token field's length limit.
 */
export function generateMagicLinkToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Compute the ISO datetime for the magic-link expiry (TTL_DAYS from
 * now). Returned in the format Zoho's datetime field accepts:
 *   yyyy-MM-ddTHH:mm:ss+00:00
 */
export function computeMagicLinkExpiry(now: Date = new Date()): string {
  const expiry = new Date(now.getTime() + MAGIC_LINK_TTL_DAYS * 24 * 60 * 60 * 1000)
  return formatZohoDateTime(expiry)
}

/**
 * Format a Date as the Zoho v2 datetime literal:
 *   yyyy-MM-ddTHH:mm:ss±HH:mm
 * Zoho rejects ISO strings with millisecond precision in some
 * contexts, so we strip ms and use a tz offset string.
 */
export function formatZohoDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  // Always emit UTC for predictability — Zoho stores datetimes
  // with their offset, so this is unambiguous on the read side.
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+00:00`
  )
}

/**
 * True if the magic-link expiry has passed.
 */
export function isMagicLinkExpired(expiresAtIso: string | null): boolean {
  if (!expiresAtIso) return true
  const expiry = new Date(expiresAtIso)
  if (isNaN(expiry.getTime())) return true
  return expiry.getTime() < Date.now()
}

// ─── Onboarding step state machine ────────────────────────────────────────

// Steps as displayed in the hub sidebar — order MUST match the
// Last_Onboarding_Step picklist on Zoho so we can map between display
// labels and stored picklist values.
export interface OnboardingStep {
  /** UI label */
  label: string
  /** Zoho Last_Onboarding_Step picklist value marking THIS step complete */
  completionValue: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { label: 'General Info',          completionValue: 'General Info Complete' },
  { label: 'Personal History',      completionValue: 'Personal History Complete' },
  { label: 'Investment Funds',      completionValue: 'Investment Funds Complete' },
  { label: 'Olympia Setup',         completionValue: 'Olympia Setup Complete' },
  { label: 'Designated Class',      completionValue: 'Designated Class Complete' },
  { label: 'Net Worth Statement',   completionValue: 'Net Worth Stmt Complete' },
  { label: 'Signatures',            completionValue: 'Signatures Complete' },
  { label: 'Submit for Review',     completionValue: 'Submitted for Review' },
]

/**
 * Given the Partner's `Last_Onboarding_Step` value, return the index
 * of the step the investor should be on next (0-based, matching
 * ONBOARDING_STEPS).
 *
 * Mapping:
 *   null / "Account Created"      → 0 (General Info)
 *   "General Info Complete"       → 1 (Personal History)
 *   ... etc
 *   "Submitted for Review"        → 7 (still on last step but marked complete)
 */
export function deriveCurrentStepIndex(lastStep: string | null): number {
  if (!lastStep || lastStep === 'Account Created') return 0
  const idx = ONBOARDING_STEPS.findIndex(s => s.completionValue === lastStep)
  // If found: the NEXT step is idx + 1. Clamp to the last index so
  // "Submitted for Review" stays on the last step.
  if (idx === -1) return 0
  return Math.min(idx + 1, ONBOARDING_STEPS.length - 1)
}

/**
 * Steps with `index < currentStepIndex` are completed. The current
 * step is in-progress; later steps are upcoming.
 */
export function isStepComplete(stepIndex: number, lastStep: string | null): boolean {
  return stepIndex < deriveCurrentStepIndex(lastStep)
}
