// The Desk — the count layer behind "Waiting on you". One computation feeds
// the Home strip (server render), the sidebar decision badges and group dots,
// and the /api/portal/admin/desk poll. Every count is a HUMAN DECISION
// queued, sourced from the same loaders the owning pages render:
//   - Approvals queues: lib/approvals-data.ts getApprovalsData (statements,
//     actionable sheets, offers, live-file flags, shadow scores)
//   - Renewals to confirm: lib/renewals.ts appearsRenewedPending (the exact
//     walk the Renewals page runs)
//   - Files in review: the reconciliation review bucket over the latest
//     monitoring export, via the same analyzeMortgage path the board uses
//   - Manual matches: NO passive source exists in Phase A — the backfill
//     scan is on-demand and priced in Zoho searches. The fragment type
//     exists so a persisted scan result can light it up later; until then
//     the count stays null (recorded deviation, see CLAUDE.md ledger).
// Sections a user's permissions do not cover stay null and never render.

import { can, type SessionUser } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import { getApprovalsData } from '@/lib/approvals-data'
import { getRenewalDeals } from '@/lib/zoho-admin'
import { appearsRenewedPending, bucketRenewals } from '@/lib/renewals'
import { recentRenewalEvents } from '@/lib/renewals-store'
import { recentUploads, rawRowsForUpload, smmStoreConfigured } from '@/lib/smm-store'
import { collapseCoBorrowers, parseSmmRow, type SmmMortgage } from '@/lib/smm'
import { analyzeMortgage, bookQuoteFromRow } from '@/lib/smm-analysis'
import { indexMortgagesByName } from '@/lib/smm-match'
import type { BookQuote } from '@/lib/smm-match'
import { isDemoMode } from '@/lib/demo'
import { torontoTodayYMD } from '@/lib/dates'

export interface DeskCounts {
  // null = not permitted for this user or the source is unavailable; the
  // strip and badges render only what is genuinely known.
  sheets: number | null
  statements: number | null
  offers: number | null
  flags: number | null
  shadow: number | null
  renewalsToConfirm: number | null
  reviewFiles: number | null
  manualMatches: number | null
}

export interface DeskFragment {
  label: string
  href: string
  count: number
}

export const DESK_EMPTY_LINE = 'Nothing needs you right now.'
export const DESK_RUNNING_LINE = 'Everything else is running on its own.'

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

// Pure: counts to strip fragments, decision queues only, zeros and nulls
// omitted. Order mirrors decision urgency on the approvals desk, then the
// pipeline surfaces. Unit-tested in tests/shell.test.ts.
export function deskFragments(c: DeskCounts): DeskFragment[] {
  const f: DeskFragment[] = []
  const add = (count: number | null, label: (n: number) => string, href: string) => {
    if (count !== null && count > 0) f.push({ label: label(count), href, count })
  }
  add(c.sheets, n => `${n} rate ${plural(n, 'sheet', 'sheets')} to approve`, '/portal/admin/approvals?tab=sheets')
  add(c.statements, n => `${n} ${plural(n, 'statement', 'statements')} to review`, '/portal/admin/approvals?tab=statements')
  add(c.offers, n => `${n} ${plural(n, 'offer', 'offers')} to decide`, '/portal/admin/approvals?tab=offers')
  add(c.flags, n => `${n} ${plural(n, 'flag', 'flags')} to resolve`, '/portal/admin/approvals?tab=flags')
  add(c.shadow, n => `${n} ${plural(n, 'file', 'files')} to score`, '/portal/admin/approvals?tab=shadow')
  add(c.renewalsToConfirm, n => `${n} ${plural(n, 'renewal', 'renewals')} to confirm`, '/portal/admin/renewals')
  add(c.manualMatches, n => `${n} manual ${plural(n, 'match', 'matches')}`, '/portal/admin/opportunities/backfill')
  add(c.reviewFiles, n => `${n} ${plural(n, 'file', 'files')} in review`, '/portal/admin/opportunities')
  return f
}

// Pure: counts to nav badges (decision counts only), keyed by nav href.
// Approvals aggregates its five queues; a group dot lights when any child
// badge is above zero.
export function deskBadges(c: DeskCounts): Record<string, number> {
  const badges: Record<string, number> = {}
  const approvals =
    (c.sheets ?? 0) + (c.statements ?? 0) + (c.offers ?? 0) + (c.flags ?? 0) + (c.shadow ?? 0)
  if (approvals > 0) badges['/portal/admin/approvals'] = approvals
  if ((c.renewalsToConfirm ?? 0) > 0) badges['/portal/admin/renewals'] = c.renewalsToConfirm as number
  const opp = (c.reviewFiles ?? 0) + (c.manualMatches ?? 0)
  if (opp > 0) badges['/portal/admin/opportunities'] = opp
  return badges
}

const EMPTY: DeskCounts = {
  sheets: null,
  statements: null,
  offers: null,
  flags: null,
  shadow: null,
  renewalsToConfirm: null,
  reviewFiles: null,
  manualMatches: null,
}

async function latestExportMortgages(): Promise<SmmMortgage[] | null> {
  if (!smmStoreConfigured()) return null
  try {
    const uploadsR = await recentUploads(3)
    const uploads = uploadsR.configured && uploadsR.ok ? uploadsR.data : []
    const cur = uploads.find(u => !u.superseded) ?? uploads[0] ?? null
    if (!cur) return null
    const rowsR = await rawRowsForUpload(cur.id)
    if (!(rowsR.configured && rowsR.ok)) return null
    return collapseCoBorrowers(rowsR.data.map(parseSmmRow)).mortgages
  } catch {
    return null
  }
}

export async function computeDeskCounts(user: SessionUser): Promise<DeskCounts> {
  const counts: DeskCounts = { ...EMPTY }
  const canApprovals = can(user, 'approvals.view')
  const canRenewals = can(user, 'renewals.view')
  const canOpps = can(user, 'opportunities.view')
  if (!canApprovals && !canRenewals && !canOpps) return counts

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null

  const [approvals, renewalsRes, mortgages, quotesR] = await Promise.all([
    canApprovals && agentId ? getApprovalsData(agentId) : null,
    canRenewals
      ? getRenewalDeals()
          .then(d => ({ ok: true as const, data: d }))
          .catch(() => ({ ok: false as const, data: null }))
      : null,
    canRenewals || canOpps ? latestExportMortgages() : null,
    // getRateQuotesFull carries no demo guard BY DESIGN (lender data stays
    // real in demo — Session 9 contract), but the desk skips it there: the
    // demo export is empty, so the book would price nothing anyway and the
    // desk poll stays zero-real-reads.
    canOpps && agentId && !isDemoMode() ? getRateQuotesFull(agentId) : null,
  ])

  if (approvals) {
    counts.sheets = approvals.sheets.length
    counts.statements = approvals.statements.length
    counts.offers = approvals.offers.length
    counts.flags = approvals.flags.length
    counts.shadow = approvals.shadow.length
  }

  const todayYMD = torontoTodayYMD()

  if (canRenewals && renewalsRes?.ok && renewalsRes.data) {
    const buckets = bucketRenewals(renewalsRes.data.withMaturity, todayYMD)
    // Declines persist in the FOXCA renewal events store, which carries no
    // demo guard (pre-existing); in demo the desk skips it — files re-flag,
    // the conservative direction, and no real read happens.
    const declined = new Map<string, string>()
    if (!isDemoMode()) {
      try {
        const eventsR = await recentRenewalEvents(500)
        if (eventsR.configured && eventsR.ok) {
          for (const e of eventsR.data) {
            if (e.action === 'appears_renewed_declined' && !declined.has(e.dealId)) {
              declined.set(
                e.dealId,
                typeof e.fields?.evidenceKey === 'string' ? (e.fields.evidenceKey as string) : '',
              )
            }
          }
        }
      } catch {
        // Store outage: no declines load; files re-flag (conservative).
      }
    }
    const exportIdx = mortgages ? indexMortgagesByName(mortgages) : null
    counts.renewalsToConfirm = appearsRenewedPending(buckets, exportIdx, declined).length
  }

  if (canOpps && mortgages) {
    const book: BookQuote[] =
      quotesR && quotesR.configured && quotesR.ok ? quotesR.data.map(bookQuoteFromRow) : []
    let review = 0
    for (const m of mortgages) {
      const { analysis } = analyzeMortgage(m.primary, book, todayYMD)
      if (analysis.bucket === 'review') review++
    }
    counts.reviewFiles = review
  }

  return counts
}

// ─── Plain-words next step per pipeline stage ────────────────────────────────
// Keys are DISPLAY values (what Zoho reads return; the indirection is
// documented in config/pipeline.ts). An unknown stage gets an honest
// generic, never a blank cell.
const NEXT_STEP: Record<string, string> = {
  'Lead': 'Reach out and qualify',
  'Pending': 'Reach out and qualify',
  'Application Started': 'Get the application finished',
  'Submitted': 'Review the application and collect documents',
  'Collecting Documentation': 'Chase the missing documents',
  'Options': 'Present options to the client',
  'Underwriting In Progress': 'Watch for underwriting conditions',
  'Ready to Submit': 'Submit to the lender',
  'Submitted to Lender': 'Waiting on the lender',
  'Conditionally Approved': 'Clear the conditions',
  'Conditions Fulfilled': 'Confirm final approval',
  'Approved': 'Instruct the lawyer',
  'Broker Complete': 'Waiting on closing',
}

export function nextStepForStage(stage: string): string {
  return NEXT_STEP[stage] ?? 'Review the file'
}
