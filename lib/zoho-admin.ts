// Read-only Zoho CRM aggregates for the admin command center: pipeline by
// stage, funded YTD, closings windows, and open tasks.
//
// Deliberately mirrors getAdminDashboardPayload's approach in lib/zoho.ts:
// the records API (/Potentials, paginated at 200/page), NEVER COQL — the
// app's refresh token does not hold ZohoCRM.coql.READ, so COQL 401s in
// production even though it works through the separately-authenticated MCP
// connector. Volume field: Amount, falling back to Total_Loan_Amount —
// 2026 funded records carry Amount only (verified 2026-07-09).
//
// No writes to Zoho anywhere in this module.

import { getZohoToken } from '@/lib/zoho'
import { createCache } from '@/lib/cache'
import { torontoTodayYMD, ymdAddDays } from '@/lib/dates'
import {
  PIPELINE_STAGE_ORDER,
  isFundedStage,
  isSummaryStage,
  isTerminalStage,
} from '@/config/pipeline'
import type { StageVolume } from '@/lib/pacing'

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

export interface SlimDeal {
  id: string
  dealName: string
  stage: string
  amount: number
  closingDate: string | null
}

const SLIM_DEAL_FIELDS = 'Deal_Name,Stage,Amount,Total_Loan_Amount,Closing_Date'

// One shared 2-minute cache absorbs the burst of widgets on a single Home
// render plus quick refreshes. Failures are never cached.
const slimDealsCache = createCache<string, SlimDeal[]>({ max: 2, ttlMs: 2 * 60 * 1000 })

function dealAmount(d: any): number {
  if (d.Amount != null) return Number(d.Amount) || 0
  if (d.Total_Loan_Amount != null) return Number(d.Total_Loan_Amount) || 0
  return 0
}

export async function getAllDealsSlim(): Promise<SlimDeal[]> {
  const cached = slimDealsCache.get('all')
  if (cached !== undefined) return cached

  const token = await getZohoToken()
  const all: SlimDeal[] = []
  let page = 1
  // Safety cap: 20 pages x 200 = 4,000 deals, far above the live ~215.
  while (page <= 20) {
    const url = `${ZOHO_API}/Potentials?fields=${SLIM_DEAL_FIELDS}&per_page=200&page=${page}&sort_by=Created_Time&sort_order=desc`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (res.status === 204) break
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[zoho-admin] deals pull error:', res.status, text.substring(0, 200))
      throw new Error(`Zoho deals pull failed with status ${res.status}`)
    }
    const data = await res.json()
    for (const d of data?.data ?? []) {
      all.push({
        id: d.id,
        dealName: d.Deal_Name ?? '(untitled)',
        stage: String(d.Stage ?? '').trim(),
        amount: dealAmount(d),
        closingDate: typeof d.Closing_Date === 'string' ? d.Closing_Date : null,
      })
    }
    if (data?.info?.more_records !== true) break
    page += 1
  }
  slimDealsCache.set('all', all)
  return all
}

// ─── Pure derivations (exported for reuse and testability) ──────────────────

export interface PipelineStageRow {
  stage: string
  count: number
  volume: number
}

export interface PipelineView {
  // Ordered stages from the Daily Deal Briefing, present-or-not.
  ordered: PipelineStageRow[]
  // Any other open stages, alphabetical — new picklist values stay visible.
  other: PipelineStageRow[]
  // Summary buckets (Additional Properties): count only, no volume claims.
  summary: { stage: string; count: number }[]
  openCount: number
  openVolume: number
}

export function computePipeline(deals: SlimDeal[]): PipelineView {
  const byStage = new Map<string, PipelineStageRow>()
  const summaryCounts = new Map<string, number>()
  for (const d of deals) {
    if (!d.stage || isTerminalStage(d.stage)) continue
    if (isSummaryStage(d.stage)) {
      summaryCounts.set(d.stage, (summaryCounts.get(d.stage) ?? 0) + 1)
      continue
    }
    const row = byStage.get(d.stage) ?? { stage: d.stage, count: 0, volume: 0 }
    row.count += 1
    row.volume += d.amount
    byStage.set(d.stage, row)
  }
  const orderedNames = PIPELINE_STAGE_ORDER as readonly string[]
  const ordered = orderedNames
    .map(s => byStage.get(s))
    .filter((r): r is PipelineStageRow => Boolean(r))
  const other = Array.from(byStage.values())
    .filter(r => !orderedNames.includes(r.stage))
    .sort((a, b) => a.stage.localeCompare(b.stage))
  const open = [...ordered, ...other]
  return {
    ordered,
    other,
    summary: Array.from(summaryCounts.entries()).map(([stage, count]) => ({ stage, count })),
    openCount: open.reduce((s, r) => s + r.count, 0),
    openVolume: open.reduce((s, r) => s + r.volume, 0),
  }
}

// Open-stage volumes in the shape lib/pacing.ts weights (summary and
// terminal stages already excluded by computePipeline).
export function pipelineStageVolumes(view: PipelineView): StageVolume[] {
  return [...view.ordered, ...view.other].map(r => ({
    stage: r.stage,
    volume: r.volume,
    count: r.count,
  }))
}

export function computeFundedYTD(
  deals: SlimDeal[],
  year: number,
): { volume: number; count: number } {
  let volume = 0
  let count = 0
  for (const d of deals) {
    if (!isFundedStage(d.stage)) continue
    if (!d.closingDate || !d.closingDate.startsWith(`${year}-`)) continue
    volume += d.amount
    count += 1
  }
  return { volume, count }
}

export interface ClosingDeal {
  id: string
  dealName: string
  stage: string
  closingDate: string
  amount: number
}

// Open (non-terminal, non-summary) deals closing inside [today, today+days].
export function computeClosings(deals: SlimDeal[], days: number): ClosingDeal[] {
  const today = torontoTodayYMD()
  const end = ymdAddDays(today, days)
  return deals
    .filter(
      (d): d is SlimDeal & { closingDate: string } =>
        Boolean(d.closingDate) &&
        !isTerminalStage(d.stage) &&
        !isSummaryStage(d.stage) &&
        d.closingDate! >= today &&
        d.closingDate! <= end,
    )
    .map(d => ({
      id: d.id,
      dealName: d.dealName,
      stage: d.stage,
      closingDate: d.closingDate,
      amount: d.amount,
    }))
    .sort((a, b) => a.closingDate.localeCompare(b.closingDate))
}

// ─── Tasks ──────────────────────────────────────────────────────────────────

export interface OpenTask {
  id: string
  subject: string
  dueDate: string | null
  priority: string | null
  status: string | null
  overdue: boolean
}

const TASK_FIELDS = 'Subject,Due_Date,Priority,Status'

// Tasks due today or overdue, open statuses only. The search API rejects
// not_equal on Status, so the query filters on Due_Date and completed tasks
// drop out client-side. Falls back to a plain sorted list if search fails.
export async function getTasksDue(): Promise<OpenTask[]> {
  const token = await getZohoToken()
  const today = torontoTodayYMD()

  const normalize = (rows: any[]): OpenTask[] =>
    rows
      .filter(t => String(t.Status ?? '') !== 'Completed')
      .filter(t => typeof t.Due_Date === 'string' && t.Due_Date <= today)
      .map(t => ({
        id: t.id,
        subject: t.Subject ?? '(untitled task)',
        dueDate: t.Due_Date ?? null,
        priority: t.Priority ?? null,
        status: t.Status ?? null,
        overdue: typeof t.Due_Date === 'string' && t.Due_Date < today,
      }))
      .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))

  const criteria = encodeURIComponent(`(Due_Date:less_equal:${today})`)
  const searchUrl = `${ZOHO_API}/Tasks/search?criteria=${criteria}&fields=${TASK_FIELDS}&per_page=200`
  const res = await fetch(searchUrl, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204) return []
  if (res.ok) {
    const data = await res.json()
    return normalize(data?.data ?? [])
  }

  // Fallback: plain list sorted by due date ascending, filtered client-side.
  console.error('[zoho-admin] Tasks/search failed with', res.status, '- falling back to list')
  const listUrl = `${ZOHO_API}/Tasks?fields=${TASK_FIELDS}&sort_by=Due_Date&sort_order=asc&per_page=200`
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (listRes.status === 204 || !listRes.ok) return []
  const listData = await listRes.json()
  return normalize(listData?.data ?? [])
}

// ─── Health ping ────────────────────────────────────────────────────────────

export interface ZohoPing {
  ok: boolean
  ms: number
  error?: string
}

// Lightweight authenticated reachability check: token refresh flow plus a
// one-record read on the module every portal already uses.
export async function zohoPing(): Promise<ZohoPing> {
  const started = Date.now()
  try {
    const token = await getZohoToken()
    const res = await fetch(`${ZOHO_API}/Potentials?fields=Deal_Name&per_page=1`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (!res.ok && res.status !== 204) {
      return { ok: false, ms: Date.now() - started, error: `HTTP ${res.status}` }
    }
    return { ok: true, ms: Date.now() - started }
  } catch (err) {
    return {
      ok: false,
      ms: Date.now() - started,
      error: err instanceof Error ? err.message : 'unreachable',
    }
  }
}
