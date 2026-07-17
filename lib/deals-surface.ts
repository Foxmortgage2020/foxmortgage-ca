// The Deals surface model (B2b, 2026-07-17) — pure and unit-tested. The
// list view and the board read the SAME rows built here from the same B2a
// position source (Zoho display stage through config/lifecycle, workbench
// room stage as the loud fallback). This module never fetches: the page
// hands it what it already loaded.
//
// The single-lime rule lives here, mechanical: exactly one lime button on
// the list, on the top-most actionable row after sorting. Every other
// routed action renders as the outline button; a manual action with no
// route renders as the `manual` chip with quiet text, never a button.

import {
  journeyForStage,
  nextActionForJourney,
  phaseForBoardColumn,
  phaseLabel,
  stepShapeFor,
  LIFECYCLE_PHASES,
  type NextAction,
  type PhaseKey,
} from '@/config/lifecycle'
import type { BoardColumn } from '@/lib/underwriting-bridge'

export interface DealSurfaceInput {
  roomId: string
  fileRef: string
  // The linked Zoho deal, when one was fetched. dealName carries the book
  // convention "{fileRef} — {primary borrower}".
  zohoDealName: string | null
  zohoStage: string | null
  transactionType: string | null
  // The workbench room's own stage (the fallback space).
  roomStage: string | null
  // The B2a-resolved position: Zoho display stage through the lifecycle
  // map, else the room's own stage, with the marker.
  column: BoardColumn
  mapped: boolean
  positionFromRoom: boolean
  amount: number | null
  closing: string | null
  closeDays: number | null
  checklist: { total: number; outstanding: number } | null
  idleDays: number
}

export interface DealRow {
  roomId: string
  client: string
  fileRef: string
  column: BoardColumn
  // Board-space phase (funded groups under Complete & paid, the documented
  // B1 divergence). Null only when the position itself is unmapped.
  phase: PhaseKey | null
  phaseLabel: string
  // The lifecycle step in plain words.
  where: string
  conditionsLine: string | null
  funded: boolean
  amount: number | null
  closing: string | null
  closeDays: number | null
  closingAmber: boolean
  action: NextAction | null
  lime: boolean
  positionFromRoom: boolean
  unmapped: boolean
  idleDays: number
  rawStage: string | null
}

// "FOX-1004 — Sofia Ricci" -> "Sofia Ricci". A name without the leading ref
// (legacy strays, demo fixtures) passes through whole; no name at all falls
// back to the file ref.
export function clientFromDealName(dealName: string | null, fileRef: string): string {
  if (!dealName || dealName.trim() === '') return fileRef
  const m = dealName.trim().match(/^[A-Z]{2,6}-F?\d{4,}\s*[—–-]\s*(.+)$/i)
  return m ? m[1].trim() : dealName.trim()
}

// The list's amber: a recorded close date inside 10 days, or already past
// on a live file — both are the clock shouting.
export const CLOSING_AMBER_DAYS = 10

export function listClosingAmber(closeDays: number | null): boolean {
  return closeDays !== null && closeDays <= CLOSING_AMBER_DAYS
}

export function buildDealRow(input: DealSurfaceInput): DealRow {
  const shape = stepShapeFor(input.transactionType, null)
  const journey = input.zohoStage
    ? journeyForStage({ stage: input.zohoStage, shape, space: 'display' })
    : journeyForStage({ stage: input.roomStage, shape, space: 'room' })

  const unmapped = !input.mapped
  const funded = input.column === 'funded'
  const phase = unmapped ? null : phaseForBoardColumn(input.column)
  const action = funded || unmapped ? null : nextActionForJourney(journey)

  const conditionsLine =
    input.checklist && input.checklist.total > 0
      ? `${input.checklist.outstanding} of ${input.checklist.total} ${
          input.checklist.total === 1 ? 'condition' : 'conditions'
        } open`
      : null

  return {
    roomId: input.roomId,
    client: clientFromDealName(input.zohoDealName, input.fileRef),
    fileRef: input.fileRef,
    column: input.column,
    phase,
    phaseLabel: phase ? phaseLabel(phase) : 'Phase not mapped',
    where: journey.mapped && journey.caption ? journey.caption : 'Stage maps to no step yet',
    conditionsLine,
    funded,
    amount: input.amount,
    closing: input.closing,
    closeDays: input.closeDays,
    closingAmber: listClosingAmber(input.closeDays),
    action,
    lime: false,
    positionFromRoom: input.positionFromRoom,
    unmapped,
    idleDays: input.idleDays,
    rawStage: input.zohoStage ?? input.roomStage,
  }
}

// Closing date ascending, dateless files after dated, funded rows last.
// Ties break on the file ref so the order is deterministic.
export function sortDealRows(rows: DealRow[]): DealRow[] {
  return [...rows].sort((a, b) => {
    if (a.funded !== b.funded) return a.funded ? 1 : -1
    const ac = a.closing ?? '9999-99-99'
    const bc = b.closing ?? '9999-99-99'
    if (ac !== bc) return ac < bc ? -1 : 1
    return a.fileRef.localeCompare(b.fileRef)
  })
}

// A row is actionable when its action has a real destination (a routed
// button). Manual chip-and-text actions and funded rows never take lime.
export function rowIsActionable(row: DealRow): boolean {
  return !row.funded && row.action !== null && row.action.roomSection !== undefined
}

/** Exactly one lime, on the top-most actionable row. Zero when none are. */
export function markSingleLime(rows: DealRow[]): DealRow[] {
  let assigned = false
  return rows.map(r => {
    if (!assigned && rowIsActionable(r)) {
      assigned = true
      return { ...r, lime: true }
    }
    return r.lime ? { ...r, lime: false } : r
  })
}

/** The full pipeline the page runs: build, sort, assign the single lime. */
export function buildDealRows(inputs: DealSurfaceInput[]): DealRow[] {
  return markSingleLime(sortDealRows(inputs.map(buildDealRow)))
}

// The phase summary strip: four tiles in lifecycle order (board space, so
// funded counts under Complete & paid exactly as the board groups it).
// Unmapped rows are counted in no tile — they are loud in the table instead.
export function phaseCounts(rows: DealRow[]): { key: PhaseKey; label: string; count: number }[] {
  const counts = new Map<PhaseKey, number>()
  for (const r of rows) {
    if (!r.phase) continue
    counts.set(r.phase, (counts.get(r.phase) ?? 0) + 1)
  }
  return LIFECYCLE_PHASES.filter(p => p.key !== 'beyond_funding').map(p => ({
    key: p.key,
    label: p.label,
    count: counts.get(p.key) ?? 0,
  }))
}

/** Board columns: the four on-board phases in order, rows kept in list order. */
export function boardPhaseColumns(rows: DealRow[]): { key: PhaseKey; label: string; rows: DealRow[] }[] {
  return LIFECYCLE_PHASES.filter(p => p.key !== 'beyond_funding').map(p => ({
    key: p.key,
    label: p.label,
    rows: rows.filter(r => r.phase === p.key),
  }))
}

/** The deep-link href for a next action, or null when no route exists. */
export function actionHref(roomId: string, action: NextAction): string | null {
  if (!action.roomSection) return null
  const base = `/portal/admin/deals/${roomId}`
  return action.roomSection === 'room' ? base : `${base}#${action.roomSection}`
}

// ─── Complete & paid (Task 6): compliance package + paid, read-only ─────────
// The live Zoho Compliance_Status picklist carries a richer vocabulary than
// the brief's four states (Pending Review / In Review / Approved / Rejected /
// Re-Review Needed); every value maps, unknown future values read as
// in-motion and render verbatim, and an unreadable field is its own honest
// state — never a guess.

export type ComplianceState = 'not_started' | 'under_review' | 'approved' | 'rejected' | 'unread'

export function complianceStateFor(
  raw: string | null,
  read: boolean,
  hasZohoLink: boolean,
): ComplianceState {
  if (!hasZohoLink || !read) return 'unread'
  if (raw === null) return 'not_started'
  const v = raw.toLowerCase()
  if (v === 'approved') return 'approved'
  if (v === 'rejected' || v === 're-review needed') return 'rejected'
  return 'under_review'
}

export type CloseoutStepState = 'done' | 'current' | 'upcoming'

/**
 * Step states for Broker complete → Compliance package → Paid. Stage places
 * the file; the compliance status and the recorded commission move the
 * steps within the phase (a funded file with no package reads the package
 * as the now-work; a rejected package loops back to current, honestly).
 */
export function closeoutStepStates(input: {
  phaseState: CloseoutStepState
  compliance: ComplianceState
  commissionRecorded: boolean
}): { broker: CloseoutStepState; compliance: CloseoutStepState; paid: CloseoutStepState } {
  const progressed =
    input.compliance === 'under_review' ||
    input.compliance === 'approved' ||
    input.compliance === 'rejected'
  if (input.phaseState === 'upcoming') {
    // Commission truth still wins on a file that has not reached the phase:
    // a recorded actual is a recorded actual.
    return {
      broker: 'upcoming',
      compliance: 'upcoming',
      paid: input.commissionRecorded ? 'done' : 'upcoming',
    }
  }
  const brokerDone = input.phaseState === 'done' || progressed
  const broker: CloseoutStepState = brokerDone ? 'done' : 'current'
  const compliance: CloseoutStepState =
    input.compliance === 'approved'
      ? 'done'
      : progressed
        ? 'current'
        : brokerDone
          ? 'current'
          : 'upcoming'
  const paid: CloseoutStepState = input.commissionRecorded
    ? 'done'
    : compliance === 'done'
      ? 'current'
      : 'upcoming'
  return { broker, compliance, paid }
}

/** The one-line count under the page title. */
export function countLine(rows: DealRow[]): string {
  const live = rows.length
  const closingSoon = rows.filter(r => !r.funded && r.closingAmber).length
  const files = `${live} live ${live === 1 ? 'file' : 'files'}`
  if (closingSoon === 0) return files
  return `${files} · ${closingSoon} ${closingSoon === 1 ? 'closes' : 'close'} inside ${CLOSING_AMBER_DAYS} days`
}
