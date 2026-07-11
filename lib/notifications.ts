// Notification center (Session 9, Part 2) — the PURE layer. No fetch, no
// cookies, no DB. It defines the five categories and the pure mappers that
// turn signals the portal already computes into NotificationInput rows. The
// route (app/api/portal/admin/notifications) fetches the signals and hands
// them here; this file is unit-tested in tests/notifications.test.ts.
//
// Design rule: a notification is a fact the portal already surfaces
// elsewhere, deduplicated by a stable dedupKey so the same signal never
// re-alarms. Nothing here invents urgency; a mapper that has no signal
// returns [].

import { credentialTone, daysUntil } from '@/lib/compliance-logic'
import type { Permission } from '@/config/authority'
import type { ComplianceCredential } from '@/lib/compliance'
import type { FormIntakeFailureRow } from '@/lib/status'
import type { WorkflowStatusRow } from '@/lib/status'
import type { SheetQueueCard, OfferQueueCard, AuditEntry } from '@/lib/underwriting'

// ─── Categories ─────────────────────────────────────────────────────────────

export const NOTIFICATION_CATEGORIES = [
  'sheet_review',
  'pending_offers',
  'sync_freshness',
  'form_intake',
  'credential_expiry',
  'gate_decision_external',
] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

export interface CategoryConfig {
  key: NotificationCategory
  label: string
  description: string
  /** The permission that gates whether this category is visible/badges. */
  permission: Permission
}

export const CATEGORIES: readonly CategoryConfig[] = [
  {
    key: 'sheet_review',
    label: 'Rate sheets to review',
    description: 'A lender rate sheet has been extracted and is waiting on the approvals desk.',
    permission: 'approvals.view',
  },
  {
    key: 'pending_offers',
    label: 'Offers to review',
    description: 'A promotional offer was extracted from Roam intel and is waiting on the approvals desk.',
    permission: 'approvals.view',
  },
  {
    key: 'gate_decision_external',
    label: 'Decisions made outside the portal',
    description: 'A gate decision was recorded from the terminal or CLI rather than through this portal.',
    permission: 'approvals.view',
  },
  {
    key: 'credential_expiry',
    label: 'Credential renewals',
    description: 'A licence, E&O, or CE credential is inside its renewal window.',
    permission: 'compliance.view',
  },
  {
    key: 'sync_freshness',
    label: 'Sync health',
    description: 'An n8n workflow last ran with an error, or is inactive with an error recorded.',
    permission: 'status.view',
  },
  {
    key: 'form_intake',
    label: 'Form intake failures',
    description: 'A public form submission was captured but did not reach Zoho.',
    permission: 'status.view',
  },
] as const

// The decision action strings this portal treats as gate decisions. Mirrors
// the (non-exported) DECISION_ACTIONS in lib/underwriting.ts plus the
// conditions decisions; kept here so the pure mapper stays dependency-free.
export const DECISION_ACTIONS: readonly string[] = [
  'statements.doc_approved',
  'statements.doc_rejected',
  'statements.doc_held',
  'statements.field_approved',
  'statements.field_rejected',
  'rates.sheet_approved',
  'rates.sheet_rejected',
  'rates.approved',
  'rates.rejected',
  'flag.disposition',
  'flag.resolved',
  'shadow.score',
  'conditions.satisfied',
  'conditions.waived',
  'conditions.decision',
] as const

// ─── Notification input (what a mapper produces) ────────────────────────────

export interface NotificationInput {
  dedupKey: string
  category: NotificationCategory
  title: string
  body: string
  href: string
  /** Informational; the DB stamps created_at on first insert. */
  createdAt: string
}

// ─── Mappers (pure) ─────────────────────────────────────────────────────────

/** One notification per waiting rate sheet (keyed by intel item). */
export function sheetReviewNotifications(sheets: SheetQueueCard[]): NotificationInput[] {
  return sheets.map(s => {
    const n = s.quotes.length
    const lender = s.lenderSlug ? ` — ${s.lenderSlug}` : ''
    return {
      dedupKey: `sheet_review:${s.intelItemId}`,
      category: 'sheet_review',
      title: `Rate sheet ready to review${lender}`,
      body:
        `${n} quote${n === 1 ? '' : 's'} extracted` +
        (s.asOfDate ? `, as of ${s.asOfDate}` : '') +
        '. Approve or hold on the desk.',
      href: '/portal/admin/approvals',
      createdAt: s.asOfDate ?? '',
    }
  })
}

/** One notification per extracted offer awaiting approval (keyed by the offer
 * row). An offer with no stated expiry says so — that is the field the desk
 * exists to stop from being overlooked. */
export function pendingOfferNotifications(offers: OfferQueueCard[]): NotificationInput[] {
  return offers.map(o => {
    const who = o.lenderName ?? o.lenderSlug
    return {
      dedupKey: `pending_offers:${o.id}`,
      category: 'pending_offers',
      title: `Offer ready to review — ${who}`,
      body:
        `${o.offerName}. ` +
        (o.expiry ? `Expires ${o.expiry}.` : 'No stated end date; confirm before quoting.') +
        ' Approve or reject on the desk.',
      href: '/portal/admin/approvals?tab=offers',
      createdAt: o.createdAt ?? '',
    }
  })
}

/** One per active credential whose tone is red or amber (never ok/no-date). */
export function credentialExpiryNotifications(
  creds: ComplianceCredential[],
  todayYMD: string,
): NotificationInput[] {
  const out: NotificationInput[] = []
  for (const c of creds) {
    if (c.status !== 'active') continue
    const tone = credentialTone(c.expires_on, todayYMD)
    if (tone !== 'red' && tone !== 'amber') continue
    const days = c.expires_on ? daysUntil(c.expires_on, todayYMD) : null
    let window: string
    if (tone === 'amber') window = 'within 60 days'
    else if (days !== null && days < 0) window = 'past due'
    else window = 'within 14 days'
    out.push({
      dedupKey: `credential_expiry:${c.id}:${tone}`,
      category: 'credential_expiry',
      title: `${c.name} expires ${window}`,
      body:
        `${c.holder}${c.expires_on ? ` — renewal date ${c.expires_on}` : ''}. ` +
        'Confirm the renewal on Compliance.',
      href: '/portal/admin/compliance',
      createdAt: c.expires_on ?? '',
    })
  }
  return out
}

/** One per failed submission — only when the status reports failures at all. */
export function formIntakeNotifications(
  status: { zohoFailed: number | null },
  failures: FormIntakeFailureRow[],
): NotificationInput[] {
  if (!status.zohoFailed || status.zohoFailed <= 0) return []
  return failures.map(f => ({
    dedupKey: `form_intake:${f.id}`,
    category: 'form_intake',
    title: `Form submission did not reach Zoho — ${f.source}`,
    body: f.errorDetail
      ? f.errorDetail.slice(0, 140)
      : 'The lead was captured but the Zoho sync failed. Acknowledge on Status.',
    href: '/portal/admin/status',
    createdAt: f.createdAt,
  }))
}

/** One per workflow that last ran with an error, or is inactive with an error. */
export function syncFreshnessNotifications(rows: WorkflowStatusRow[]): NotificationInput[] {
  const out: NotificationInput[] = []
  for (const r of rows) {
    const errored = r.lastExecStatus === 'error'
    const inactiveWithError = r.active === false && r.error != null
    if (!errored && !inactiveWithError) continue
    out.push({
      dedupKey: `sync_freshness:${r.id}:${r.lastExecAt ?? 'none'}`,
      category: 'sync_freshness',
      title: `${r.name} ${errored ? 'last run errored' : 'is inactive'}`,
      body: errored
        ? `Last execution status: error${r.lastExecAt ? ` (${r.lastExecAt})` : ''}. Check Status.`
        : `Workflow is inactive with an error recorded${r.error ? `: ${r.error}` : ''}. Check Status.`,
      href: '/portal/admin/status',
      createdAt: r.lastExecAt ?? '',
    })
  }
  return out
}

/** One per decision recorded by a non-portal actor (a CLI/terminal decision). */
export function externalGateDecisionNotifications(
  rows: AuditEntry[],
  decisionActions: readonly string[],
): NotificationInput[] {
  const decisions = new Set(decisionActions)
  const out: NotificationInput[] = []
  for (const r of rows) {
    if (!decisions.has(r.action)) continue
    // Portal-originated decisions carry actor 'portal' (with a Clerk id);
    // external decisions come through as some other actor. Only the latter
    // are surprising enough to notify.
    if (r.actor === 'portal') continue
    out.push({
      dedupKey: `gate_decision_external:${r.id}`,
      category: 'gate_decision_external',
      title: `${r.actor} decided ${r.action}${r.dealRef ? ` on ${r.dealRef}` : ''}`,
      body:
        `Recorded ${r.createdAt} outside the portal` +
        (r.actorEmail ? ` (${r.actorEmail})` : '') +
        '.',
      href: r.dealRef
        ? `/portal/admin/deals?ref=${encodeURIComponent(r.dealRef)}`
        : '/portal/admin/audit',
      createdAt: r.createdAt,
    })
  }
  return out
}
