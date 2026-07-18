// Client comms — the pure model (B7-P, 2026-07-18). Labels, grouping, the
// fail-closed settings read, and the catch-up staleness signal. No I/O; all
// unit-tested (tests/comms.test.ts). The workbench (B7-W) owns detection,
// drafting, and every send; this is the portal's read/render layer.

// The four client-comms touch families (the fifth, 'renewal', is the renewal
// drip engine — kept apart in code so the two never cross-contaminate the
// shared renewal_* tables).
export const COMMS_TOUCH_KINDS = ['stage_update', 'app_chase', 'doc_chase', 'review_ask'] as const
export type CommsTouchKind = (typeof COMMS_TOUCH_KINDS)[number]

export function isCommsTouchKind(kind: string): kind is CommsTouchKind {
  return (COMMS_TOUCH_KINDS as readonly string[]).includes(kind)
}

// A comms sequence carries no maturity anchor and never needs a day window.
export const COMMS_KIND_LABEL: Record<CommsTouchKind, string> = {
  stage_update: 'Stage update',
  app_chase: 'Application nudge',
  doc_chase: 'Document chase',
  review_ask: 'Review request',
}

const STAGE_SKELETON_LABEL: Record<string, string> = {
  'stage-application_received': 'application received',
  'stage-documents_complete': 'documents complete',
  'stage-submitted_to_lender': 'submitted to the lender',
  'stage-commitment_in': 'commitment in',
  'stage-conditions_cleared': 'conditions cleared',
  'stage-funded': 'funded',
}

/** A human, plain-words label for a comms touch: "Stage update · funded",
 * "Document chase · 2 of 3", "Application nudge · day 5", "Review request". */
export function commsTouchLabel(skeletonId: string): string {
  if (skeletonId.startsWith('stage-')) {
    const milestone = STAGE_SKELETON_LABEL[skeletonId]
    return milestone ? `Stage update · ${milestone}` : 'Stage update'
  }
  if (skeletonId.startsWith('app-chase')) {
    const day = skeletonId.replace('app-chase-d', '')
    return `Application nudge · day ${day}`
  }
  if (skeletonId.startsWith('doc-chase')) {
    const n = skeletonId.replace('doc-chase-', '')
    return `Document chase · ${n} of 3`
  }
  if (skeletonId === 'review-ask') return 'Review request'
  return skeletonId
}

// ── The fail-closed settings read (Task 4) ──────────────────────────────────
// The engine ships DARK. The live renewal_settings table is EMPTY (no row per
// agent), so the kill switch is OFF BY ABSENCE, not off by value. The portal
// must NEVER present the engine as enabled without an explicit comms_enabled =
// true row: an absent row, or any non-true value, reads as OFF.

export interface CommsSettingsRow {
  comms_enabled?: boolean | null
  comms_mailing_address?: string | null
  comms_max_per_client_per_day?: number | null
  comms_max_per_client_per_week?: number | null
}

export interface CommsSettings {
  /** True ONLY when a settings row exists AND comms_enabled is literally true. */
  commsEnabled: boolean
  /** True when NO settings row exists at all — the dark-by-absence state. */
  hasSettingsRow: boolean
  mailingAddress: string | null
  maxPerDay: number
  maxPerWeek: number
}

export function deriveCommsSettings(row: CommsSettingsRow | null | undefined): CommsSettings {
  if (row === null || row === undefined) {
    // No row: the engine is dark by absence. Fail closed.
    return { commsEnabled: false, hasSettingsRow: false, mailingAddress: null, maxPerDay: 1, maxPerWeek: 3 }
  }
  return {
    commsEnabled: row.comms_enabled === true,
    hasSettingsRow: true,
    mailingAddress: row.comms_mailing_address && row.comms_mailing_address.trim() ? row.comms_mailing_address : null,
    maxPerDay: typeof row.comms_max_per_client_per_day === 'number' ? row.comms_max_per_client_per_day : 1,
    maxPerWeek: typeof row.comms_max_per_client_per_week === 'number' ? row.comms_max_per_client_per_week : 3,
  }
}

// ── Catch-up staleness (Task 2 calibration) ─────────────────────────────────
// The first live queue holds the catch-up crop (touches whose send date has
// slipped into the past) beside genuinely current drafts. A touch scheduled
// more than COMMS_STALE_DAYS ago is flagged so Michael can reject stale history
// fast. (A fresh stage_update is scheduled for the day it was minted, so this
// catches the slipped chase/review timers; stale stage transitions are shown
// by their milestone label and the full message, which Michael reads against
// what he knows about the client.)
export const COMMS_STALE_DAYS = 7

export function daysSinceYMD(ymd: string | null | undefined, todayYMD: string): number | null {
  if (!ymd) return null
  const a = Date.parse(`${ymd}T00:00:00Z`)
  const b = Date.parse(`${todayYMD}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return Math.round((b - a) / 86_400_000)
}

export function isCatchUpTouch(scheduledFor: string | null | undefined, todayYMD: string): boolean {
  const d = daysSinceYMD(scheduledFor, todayYMD)
  return d !== null && d >= COMMS_STALE_DAYS
}

// ── Grouping (Task 2: "grouped by deal and touch kind") ─────────────────────

export interface GroupableTouch {
  zohoDealId: string
  clientName: string | null
  firstName: string | null
  fileRef: string | null
  touchKind: CommsTouchKind
  skeletonId: string
  scheduledFor: string | null
}

export interface CommsDealGroup<T extends GroupableTouch> {
  zohoDealId: string
  clientName: string
  fileRef: string | null
  touches: T[]
}

/** Group pending touches by deal, then order each deal's touches by kind then
 * skeleton, and order the deals by their earliest scheduled_for so the oldest
 * (most likely stale) surface first for fast triage. */
export function groupCommsByDeal<T extends GroupableTouch>(items: T[]): CommsDealGroup<T>[] {
  const byDeal = new Map<string, T[]>()
  for (const it of items) {
    byDeal.set(it.zohoDealId, [...(byDeal.get(it.zohoDealId) ?? []), it])
  }
  const kindOrder: Record<CommsTouchKind, number> = { stage_update: 0, app_chase: 1, doc_chase: 2, review_ask: 3 }
  const groups: CommsDealGroup<T>[] = []
  for (const [zohoDealId, touches] of Array.from(byDeal.entries())) {
    const sorted = [...touches].sort((a, b) => {
      const k = kindOrder[a.touchKind] - kindOrder[b.touchKind]
      if (k !== 0) return k
      return a.skeletonId.localeCompare(b.skeletonId)
    })
    const first = sorted[0]!
    groups.push({
      zohoDealId,
      clientName: first.clientName ?? first.firstName ?? 'Client',
      fileRef: first.fileRef,
      touches: sorted,
    })
  }
  const earliest = (g: CommsDealGroup<T>) =>
    g.touches.map((t) => t.scheduledFor ?? '9999-12-31').sort()[0] ?? '9999-12-31'
  groups.sort((a, b) => earliest(a).localeCompare(earliest(b)))
  return groups
}
