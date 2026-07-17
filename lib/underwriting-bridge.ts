// The Zoho -> workbench auto-provision bridge (Phase B1) — the portal half.
// A standing rule, not a workflow Michael triggers: any ACTIVE Zoho deal at
// Submitted or beyond with no workbench room gets one, created empty, in
// state 'intake'. The pure plan lives here (unit-tested); the mutation lives
// in fox-underwriting (POST /api/bridge/rooms, BRIDGE_SECRET machine path),
// which owns idempotency at the database (0033 partial unique index).
//
// STAGE SPACES: Zoho reads return DISPLAY values (the display/actual
// indirection is documented in config/pipeline.ts), so the Submitted-and-
// beyond set is derived from PIPELINE_STAGE_ORDER — display space — from
// 'Submitted' onward. Stale deals (lib/pipeline-hygiene) are NOT
// provisioned: a 2021 ghost file in Options has nothing to underwrite;
// grooming it back to life brings it into the next sweep.

import { PIPELINE_STAGE_ORDER, FUNDED_STAGES, isFundedStage } from '@/config/pipeline'
import type { SlimDeal } from '@/lib/zoho-admin'
import type { WorkbenchDeal } from '@/lib/underwriting'
import { isTestRoom } from '@/lib/test-rooms'

// Display-space stage sets. Everything at or past 'Submitted' in the funnel
// order underwrites; everything before it is still being assembled.
const SUBMITTED_IDX = (PIPELINE_STAGE_ORDER as readonly string[]).indexOf('Submitted')
export const SUBMITTED_AND_BEYOND: readonly string[] = (
  PIPELINE_STAGE_ORDER as readonly string[]
).slice(SUBMITTED_IDX)
export const BELOW_SUBMITTED: readonly string[] = (PIPELINE_STAGE_ORDER as readonly string[]).slice(
  0,
  SUBMITTED_IDX,
)

// Zoho display stages that close a file without funding it. A room whose
// Zoho deal lands here goes dormant — never deleted.
export const CLOSED_ZOHO_STAGES: readonly string[] = [
  'Cancelled',
  'Declined',
  'Lost',
  'Mortgage Lost',
  'Closed',
  'Archive',
]

export interface BridgeDealPayload {
  zohoPotentialId: string
  fileRef: string
  dealType: string
  zohoStage: string
  disposition: 'open' | 'funded' | 'closed'
  amount: number | null
  closingDate: string | null
  finmoAppId: string | null
  finmoApplicationUuid: string | null
}

export interface BridgePlan {
  // Active Submitted-or-beyond deals with no room: create empty containers.
  provision: BridgeDealPayload[]
  // Rooms whose Zoho deal funded or closed: move stage/status accordingly.
  transitions: BridgeDealPayload[]
  // Active deals below Submitted: tomorrow's files, visible on the strip.
  notYetBridged: SlimDeal[]
}

// "FOX-1004 — Sofia Ricci" -> "FOX-1004" (the book convention; one legacy
// stray uses a plain hyphen, and property rows prefix addresses, so the ref
// pattern anchors at the start).
export function fileRefFromDealName(dealName: string): string | null {
  const m = dealName.trim().match(/^([A-Z]{2,6}-F?\d{4,})/i)
  return m ? m[1].toUpperCase() : null
}

function payloadFor(d: SlimDeal, disposition: BridgeDealPayload['disposition']): BridgeDealPayload | null {
  const fileRef = fileRefFromDealName(d.dealName)
  if (!fileRef || isTestRoom(fileRef)) return null
  return {
    zohoPotentialId: d.id,
    fileRef,
    dealType: d.transactionType ?? '',
    zohoStage: d.stage,
    disposition,
    amount: d.amount > 0 ? d.amount : null,
    closingDate: d.closingDate,
    // The file ref IS Finmo's lendeskApplicationId by construction, but the
    // linkage is only claimed when the deal genuinely came through Finmo
    // (the UUID is present).
    finmoAppId: d.finmoUuid ? fileRef : null,
    finmoApplicationUuid: d.finmoUuid ?? null,
  }
}

export function computeBridgePlan(input: {
  // Active (non-stale) open pipeline deals — computePipeline(...).activeDeals.
  activeDeals: SlimDeal[]
  // Every Zoho deal, for funded/closed transitions of already-bridged rooms.
  allDeals: SlimDeal[]
  rooms: WorkbenchDeal[]
}): BridgePlan {
  const roomByZohoId = new Map<string, WorkbenchDeal>()
  const roomByFileRef = new Map<string, WorkbenchDeal>()
  for (const r of input.rooms) {
    if (isTestRoom(r.fileRef, r.status)) continue
    if (r.zohoPotentialId) roomByZohoId.set(r.zohoPotentialId, r)
    roomByFileRef.set(r.fileRef.toUpperCase(), r)
  }

  const provision: BridgeDealPayload[] = []
  const notYetBridged: SlimDeal[] = []
  for (const d of input.activeDeals) {
    const fileRef = fileRefFromDealName(d.dealName)
    const hasRoom =
      roomByZohoId.has(d.id) || (fileRef ? roomByFileRef.has(fileRef.toUpperCase()) : false)
    if (SUBMITTED_AND_BEYOND.includes(d.stage)) {
      if (!hasRoom) {
        const p = payloadFor(d, 'open')
        if (p) provision.push(p)
      }
    } else if (BELOW_SUBMITTED.includes(d.stage) && !hasRoom) {
      notYetBridged.push(d)
    }
  }

  // Transitions run over the ROOMS (only bridged files can move): a funded
  // Zoho deal moves its room to stage funded, a closed one to status
  // dormant. Already-moved rooms are no-ops server-side.
  const transitions: BridgeDealPayload[] = []
  const dealByZohoId = new Map(input.allDeals.map(d => [d.id, d]))
  for (const r of input.rooms) {
    if (isTestRoom(r.fileRef, r.status) || !r.zohoPotentialId) continue
    const z = dealByZohoId.get(r.zohoPotentialId)
    if (!z) continue
    if (isFundedStage(z.stage) && r.stage !== 'funded') {
      const p = payloadFor(z, 'funded')
      if (p) transitions.push(p)
    } else if (CLOSED_ZOHO_STAGES.includes(z.stage) && r.status === 'active') {
      const p = payloadFor(z, 'closed')
      if (p) transitions.push(p)
    }
  }

  return { provision, transitions, notYetBridged }
}

// ─── The board vocabulary: mapping, not fighting ─────────────────────────────
// The workbench stage field predates this board and carries the intake
// pipeline's vocabulary (in_progress, underwriting, approved, funded). The
// board maps BOTH vocabularies onto its five columns; an unknown stage lands
// in Evidence with its raw value shown on the card, loud, never silent.

// Phase B2: the ladder grows to seven columns so the commitment/conditions
// leg and the funded outcome each get their own place instead of being folded
// into With-lender or filtered off the board.
export type BoardColumn =
  | 'intake'
  | 'evidence'
  | 'packaging'
  | 'with_lender'
  | 'conditions'
  | 'ready'
  | 'funded'

// Labels speak the lifecycle vocabulary (Brief B1, config/lifecycle.ts);
// the KEYS are load-bearing via COLUMN_BY_STAGE and never change.
export const BOARD_COLUMNS: { key: BoardColumn; label: string }[] = [
  { key: 'intake', label: 'Intake' },
  { key: 'evidence', label: 'Documents & review' },
  { key: 'packaging', label: 'Package & submit' },
  { key: 'with_lender', label: 'With the lender' },
  { key: 'conditions', label: 'Conditions' },
  { key: 'ready', label: 'Ready to close' },
  { key: 'funded', label: 'Funded' },
]

const COLUMN_BY_STAGE: Record<string, BoardColumn> = {
  intake: 'intake',
  evidence: 'evidence',
  in_progress: 'evidence',
  underwriting: 'evidence',
  packaging: 'packaging',
  submitted: 'with_lender',
  submitted_to_lender: 'with_lender',
  with_lender: 'with_lender',
  'application sent to lender': 'conditions',
  conditionally_approved: 'conditions',
  approved: 'conditions',
  conditions: 'conditions',
  'ready to close': 'ready',
  ready: 'ready',
  ready_to_submit: 'ready',
  broker_complete: 'ready',
  funded: 'funded',
  'mortgage funded': 'funded',
  'mortgage closed': 'funded',
}

export function boardColumnFor(stage: string | null): { column: BoardColumn; mapped: boolean } {
  const key = (stage ?? '').toLowerCase().trim()
  const column = COLUMN_BY_STAGE[key]
  if (column) return { column, mapped: true }
  return { column: 'evidence', mapped: false }
}

export function nextStepForRoom(column: BoardColumn, openConditions: number | null): string {
  switch (column) {
    case 'intake':
      return 'Collect the client documents'
    case 'evidence':
      return 'Evidence and calcs in progress'
    case 'packaging':
      return 'Packaging the file for a lender'
    case 'with_lender':
      return openConditions && openConditions > 0
        ? `${openConditions} ${openConditions === 1 ? 'condition' : 'conditions'} open with the lender`
        : 'Waiting on the lender'
    case 'conditions':
      return openConditions && openConditions > 0
        ? `${openConditions} ${openConditions === 1 ? 'condition' : 'conditions'} open`
        : 'Conditions working'
    case 'ready':
      return 'Cleared to close'
    case 'funded':
      return 'Funded'
  }
}

// Days a card has sat without movement. No state-transition history exists
// on the room (only updated_at, which any write bumps), so this is DAYS
// SINCE LAST MOVEMENT, labelled that way — an honest proxy, not a claim.
export const DAYS_IDLE_AMBER = 7

export function daysIdle(updatedAt: string, todayYMD: string): number {
  const updated = Date.parse(updatedAt.slice(0, 10) + 'T00:00:00Z')
  const today = Date.parse(todayYMD + 'T00:00:00Z')
  if (Number.isNaN(updated) || Number.isNaN(today)) return 0
  return Math.max(0, Math.round((today - updated) / 86_400_000))
}

// ─── The sweep runner (server only) ──────────────────────────────────────────

export function bridgeConfigured(): boolean {
  return Boolean(process.env.UW_BRIDGE_URL && process.env.UW_BRIDGE_SECRET)
}

export interface SweepResult {
  ok: boolean
  provisioned: string[]
  funded: string[]
  dormant: string[]
  skipped: { fileRef: string; reason: string }[]
  error?: string
}

export async function postBridgePlan(
  deals: BridgeDealPayload[],
  provisionedBy: 'bridge' | 'manual',
): Promise<SweepResult> {
  if (!bridgeConfigured()) {
    return { ok: false, provisioned: [], funded: [], dormant: [], skipped: [], error: 'bridge not configured' }
  }
  if (deals.length === 0) return { ok: true, provisioned: [], funded: [], dormant: [], skipped: [] }
  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 15_000)
    const res = await fetch(process.env.UW_BRIDGE_URL as string, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-secret': process.env.UW_BRIDGE_SECRET as string,
      },
      body: JSON.stringify({ deals, provisionedBy }),
      signal: controller.signal,
      cache: 'no-store',
    })
    clearTimeout(t)
    const json = (await res.json().catch(() => null)) as SweepResult | null
    if (!res.ok || !json) {
      return {
        ok: false, provisioned: [], funded: [], dormant: [], skipped: [],
        error: `bridge responded ${res.status}`,
      }
    }
    return { ...json, ok: true }
  } catch {
    return { ok: false, provisioned: [], funded: [], dormant: [], skipped: [], error: 'bridge unreachable' }
  }
}
