// Today v1 — the pure model behind the morning operating page. No I/O, no
// clock: callers pass todayYMD and already-loaded data. Every helper is
// unit-tested (tests/today.test.ts). Living here (lib/, not walked by the
// lime audit) keeps the logic testable and the page a thin composition.
//
// The page answers three questions in order — what needs me, what is moving,
// what is at risk — and every count reconciles with its owning page (the Desk
// pattern): this module never re-derives a queue count, only shapes the data
// the loaders already return.

import type { OpenTask, ClosingDeal } from '@/lib/zoho-admin'
import type { ConditionRow, RenewalSequenceState, WorkbenchDeal } from '@/lib/underwriting'
import { daysUntilYMD, relativeDay, type RelativeTone } from '@/lib/dates'
import { CLOSINGS_STRIP_DAYS, CONDITIONS_DUE_SOON_DAYS } from '@/config/targets'

// ─── Deal references ─────────────────────────────────────────────────────────
// A file reference is BRXM-F053107 / IFMS-F001515 / FOX-1004 / DEMO-F0001 —
// two-to-six letters, a hyphen, an optional letter, then digits. Broad enough
// to cover the live conventions and the demo fixtures; a parse that matches no
// known deal simply yields no link (safe).
export const DEAL_REF_RE = /\b([A-Z]{2,6}-[A-Z]?\d{3,7})\b/

export function parseDealRef(text: string | null | undefined): string | null {
  if (!text) return null
  const m = DEAL_REF_RE.exec(text)
  return m ? m[1] : null
}

// Map a relative-date urgency tone to a StatusChip tone. The decision (lime)
// token is deliberately unreachable here — date urgency is never a decision.
export function relativeChipTone(t: RelativeTone): 'red' | 'amber' | 'green' | 'gray' {
  switch (t) {
    case 'danger':
      return 'red'
    case 'caution':
      return 'amber'
    case 'success':
      return 'green'
    default:
      return 'gray'
  }
}

// ─── The Tasks card ──────────────────────────────────────────────────────────

export interface TodayTask {
  id: string
  subject: string
  dueDate: string | null
  priority: string | null
  overdue: boolean
  // Deal linkage, resolved by parsing a file ref out of the subject and
  // matching it to a workbench deal. null when the subject carries no
  // matchable ref (getTasksDue reads no deal field — recorded deviation).
  dealRef: string | null
  roomHref: string | null
  // Days to the referenced deal's close (>= 0 future); null when unknown.
  closingWithin: number | null
  closingSoon: boolean
}

export interface PrioritizedTasks {
  top: TodayTask[]
  total: number
  overflow: number
  overdueCount: number
}

// Prioritize the due-or-overdue task list: tasks referencing a deal closing
// within 30 days come first (that deal's clock is the practice's clock), then
// earliest due. Returns the top `limit` plus the overflow and overdue totals
// for the footer links. `dealByRef` maps a file ref to its workbench deal
// (id → deal room, closingDate → the closing-soon signal).
export function prioritizeTasks(
  tasks: OpenTask[],
  dealByRef: Map<string, WorkbenchDeal>,
  todayYMD: string,
  limit = 5,
): PrioritizedTasks {
  const shaped: TodayTask[] = tasks.map(t => {
    const ref = parseDealRef(t.subject)
    const deal = ref ? (dealByRef.get(ref) ?? null) : null
    const closingWithin =
      deal && deal.closingDate ? daysUntilYMD(deal.closingDate, todayYMD) : null
    const closingSoon = closingWithin !== null && closingWithin >= 0 && closingWithin <= 30
    return {
      id: t.id,
      subject: t.subject,
      dueDate: t.dueDate,
      priority: t.priority,
      overdue: Boolean(t.dueDate && t.dueDate < todayYMD),
      dealRef: deal ? ref : null,
      roomHref: deal ? `/portal/admin/deals/${deal.id}` : null,
      closingWithin,
      closingSoon,
    }
  })

  const sorted = [...shaped].sort((a, b) => {
    if (a.closingSoon !== b.closingSoon) return a.closingSoon ? -1 : 1
    // earliest due first; a task with no due date sorts last.
    return (a.dueDate ?? '9999-99-99').localeCompare(b.dueDate ?? '9999-99-99')
  })

  return {
    top: sorted.slice(0, limit),
    total: shaped.length,
    overflow: Math.max(0, shaped.length - limit),
    overdueCount: shaped.filter(t => t.overdue).length,
  }
}

// ─── The Closings band (30 days) ─────────────────────────────────────────────

export type ReadinessTone = 'success' | 'warning' | 'danger' | 'neutral'

export interface ClosingReadiness {
  tone: ReadinessTone
  label: string
}

// Readiness from the file's condition state. A closing with no workbench file
// yet can't be read, so it is a neutral honest state, never a false green.
// `condsAvailable` guards the same way for a bridged file whose condition read
// failed: an unknown state reads neutral, never a false-green "0 open".
export function closingReadiness(input: {
  hasWorkbench: boolean
  condsAvailable: boolean
  openConds: number
  overdueConds: number
}): ClosingReadiness {
  if (!input.hasWorkbench) return { tone: 'neutral', label: 'not linked to the workbench yet' }
  if (!input.condsAvailable) return { tone: 'neutral', label: 'condition state unavailable' }
  if (input.overdueConds > 0)
    return {
      tone: 'danger',
      label: `${input.overdueConds} overdue condition${input.overdueConds === 1 ? '' : 's'}`,
    }
  if (input.openConds > 0)
    return {
      tone: 'warning',
      label: `${input.openConds} open condition${input.openConds === 1 ? '' : 's'}`,
    }
  return { tone: 'success', label: '0 open conditions' }
}

export interface ClosingRow {
  id: string
  dealName: string
  dealRef: string | null
  closingDate: string
  amount: number
  stage: string
  roomHref: string
  daysToClose: number
  hasWorkbench: boolean
  openConds: number
  overdueConds: number
  readiness: ClosingReadiness
}

// Shape each Zoho closing into a render row: join it to its workbench file
// (open-condition count + file ref → overdue count), compute readiness, and
// resolve the deal-room link. Sorted soonest first.
export function buildClosingRows(
  closings: ClosingDeal[],
  todayYMD: string,
  wbByZohoId: Map<string, WorkbenchDeal>,
  condCounts: Record<string, number>,
  overdueByRef: Map<string, number>,
  condsAvailable: boolean,
): ClosingRow[] {
  return closings
    .map(c => {
      const wb = wbByZohoId.get(c.id) ?? null
      const hasWorkbench = Boolean(wb)
      const openConds = wb ? (condCounts[wb.id] ?? 0) : 0
      const overdueConds = wb?.fileRef ? (overdueByRef.get(wb.fileRef) ?? 0) : 0
      return {
        id: c.id,
        dealName: c.dealName,
        dealRef: wb?.fileRef ?? parseDealRef(c.dealName),
        closingDate: c.closingDate,
        amount: c.amount,
        stage: c.stage,
        roomHref: wb ? `/portal/admin/deals/${wb.id}` : '/portal/admin/underwriting#not-yet-bridged',
        daysToClose: daysUntilYMD(c.closingDate, todayYMD),
        hasWorkbench,
        openConds,
        overdueConds,
        readiness: closingReadiness({ hasWorkbench, condsAvailable, openConds, overdueConds }),
      }
    })
    .sort((a, b) => a.daysToClose - b.daysToClose)
}

// ─── The Renewal nurture band ────────────────────────────────────────────────

// A next touch is "minted" once a draft exists for it, whatever its approval
// state; only 'scheduled' means nothing has been drafted yet.
const MINTED_STATUSES = new Set(['drafted', 'pending_approval', 'held', 'approved'])

export interface NurtureBuckets {
  total: number
  entered: number
  draftsMinted: number
  sent: number
  sendsLive: boolean
}

// Bucket the 150-day renewal sequences by how far each has progressed. The
// portal read model carries entered / drafts-minted / sent only — reply
// tracking and "no reply after the full sequence" need a workbench field that
// does not exist yet (recorded deviation; the band says so plainly). While the
// send build is dark, every sentCount is 0, so `sendsLive` is false and the
// band renders "Sends not yet live."
export function renewalNurtureBuckets(states: RenewalSequenceState[]): NurtureBuckets {
  let entered = 0
  let draftsMinted = 0
  let sent = 0
  for (const s of states) {
    const minted = Boolean(s.nextTouch && MINTED_STATUSES.has(s.nextTouch.status))
    if (s.sentCount > 0) sent += 1
    if (minted) draftsMinted += 1
    if (s.sentCount === 0 && !minted) entered += 1
  }
  return { total: states.length, entered, draftsMinted, sent, sendsLive: sent > 0 }
}

// ─── The exceptions block (what is at risk) ──────────────────────────────────

export interface ExceptionLine {
  key: string
  tone: 'danger' | 'caution'
  text: string
  href: string
}

export interface Exceptions {
  lines: ExceptionLine[]
  tone: 'danger' | 'caution'
}

export interface FlagSummary {
  total: number
  high: number
  warning: number
  info: number
}

// Assemble the single at-risk block. The loudest thing on the page is a file
// closing inside the strip window (7 days) that still has overdue conditions —
// those name the file at the top. Then the consolidated summaries: all overdue
// conditions, the workbench flags summary, credential renewals, and a stalled
// sync. A healthy sync is NOT here (it renders as a quiet success line
// elsewhere). Returns null when nothing is at risk.
export function buildExceptions(input: {
  closings: ClosingRow[]
  todayYMD: string
  overdue: ConditionRow[]
  dueSoon: number
  flags: FlagSummary
  missingMaturity: { count: number; volume: number } | null
  credentials: { count: number; anyRed: boolean }
  sync: { zohoDown: boolean; intakeStale: boolean; staleHours: number | null }
}): Exceptions | null {
  const lines: ExceptionLine[] = []

  // 1. Forced top lines: imminent closings carrying overdue conditions.
  const imminent = input.closings
    .filter(c => c.daysToClose <= CLOSINGS_STRIP_DAYS && c.overdueConds > 0)
    .sort((a, b) => a.daysToClose - b.daysToClose)
  for (const c of imminent) {
    const rel = relativeDay(c.closingDate, input.todayYMD)
    lines.push({
      key: `imminent-${c.id}`,
      tone: 'danger',
      text: `${c.dealRef ?? c.dealName} closes ${rel.label} with ${c.overdueConds} overdue condition${
        c.overdueConds === 1 ? '' : 's'
      }`,
      href: c.roomHref,
    })
  }

  // 2. Overdue conditions across the book.
  if (input.overdue.length > 0) {
    const files = new Set(input.overdue.map(c => c.dealRef ?? c.id)).size
    lines.push({
      key: 'overdue-conditions',
      tone: 'danger',
      text: `${input.overdue.length} overdue condition${input.overdue.length === 1 ? '' : 's'} across ${files} file${
        files === 1 ? '' : 's'
      }`,
      href: '/portal/admin/underwriting',
    })
  }

  // 2b. Conditions due soon (the early warning before they flip overdue).
  if (input.dueSoon > 0) {
    lines.push({
      key: 'due-soon',
      tone: 'caution',
      text: `${input.dueSoon} condition${input.dueSoon === 1 ? '' : 's'} due within ${CONDITIONS_DUE_SOON_DAYS} days`,
      href: '/portal/admin/underwriting',
    })
  }

  // 3. Workbench flags summary.
  if (input.flags.total > 0) {
    const parts: string[] = []
    if (input.flags.high > 0) parts.push(`${input.flags.high} high`)
    if (input.flags.warning > 0) parts.push(`${input.flags.warning} warning`)
    if (input.flags.info > 0) parts.push(`${input.flags.info} info`)
    lines.push({
      key: 'flags',
      tone: input.flags.high > 0 ? 'danger' : 'caution',
      text: `${input.flags.total} open workbench flag${input.flags.total === 1 ? '' : 's'}${
        parts.length ? ` (${parts.join(', ')})` : ''
      }`,
      // The deal board surfaces flags per file and is reachable by every
      // deals.view user (the approvals flags tab needs approvals.view).
      href: '/portal/admin/underwriting',
    })
  }

  // 3b. Funded deals with no maturity date — invisible to the renewal system
  // until backfilled, so the practice can lose a renewal without a signal.
  if (input.missingMaturity && input.missingMaturity.count > 0) {
    lines.push({
      key: 'missing-maturity',
      tone: 'caution',
      text: `${input.missingMaturity.count} funded deal${
        input.missingMaturity.count === 1 ? '' : 's'
      } with no maturity date, invisible to renewals until backfilled`,
      href: '/portal/admin/beyond?tab=renewals',
    })
  }

  // 4. Credential renewals (an expiring licence is at risk too).
  if (input.credentials.count > 0) {
    lines.push({
      key: 'credentials',
      tone: input.credentials.anyRed ? 'danger' : 'caution',
      text: `${input.credentials.count} credential${input.credentials.count === 1 ? '' : 's'} expiring soon`,
      href: '/portal/admin/compliance',
    })
  }

  // 5. Stalled sync (only when broken; a healthy sync is a quiet success line).
  if (input.sync.zohoDown || input.sync.intakeStale) {
    const bits: string[] = []
    if (input.sync.zohoDown) bits.push('Zoho CRM is unreachable')
    if (input.sync.intakeStale)
      bits.push(
        input.sync.staleHours === null
          ? 'the workbench has no recorded intake yet'
          : `the workbench has been quiet for ${Math.round(input.sync.staleHours)}h`,
      )
    lines.push({
      key: 'sync',
      tone: 'danger',
      text: bits.join(' and ') + '.',
      href: '/portal/admin/status',
    })
  }

  if (lines.length === 0) return null
  return { lines, tone: lines.some(l => l.tone === 'danger') ? 'danger' : 'caution' }
}
