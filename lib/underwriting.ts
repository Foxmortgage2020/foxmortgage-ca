// Read-only wiring to the fox-underwriting Supabase project ("the workbench").
// This is the ONLY module in this repo that touches that project.
//
// Hard rules (Session 1 brief):
//   1. Read-only by construction. The whole query surface is uwSelect(),
//      an HTTP GET against PostgREST with a select parameter. There is no
//      insert / update / upsert / delete / rpc surface anywhere in this
//      repo. Temporary posture: Session 2 replaces the service key with a
//      database-enforced read-only role; until then this wrapper is the
//      enforcement.
//   2. Never log workbench payloads. Borrower data may pass through server
//      components; logs carry table names, row counts, and durations only.
//   3. Masked values render exactly as stored. The workbench masks account
//      numbers and drops SINs before storage; nothing here reconstructs or
//      joins toward unmasked identifiers.
//   4. Tenant-scoped from the first query: every fetcher takes agentId and
//      filters on it. Michael's agent row is resolved once by email match
//      (config/targets.ts WORKBENCH_AGENT_EMAIL) and cached.
//
// Server-only: reads UW_SUPABASE_URL / UW_SUPABASE_SERVICE_ROLE_KEY (never
// NEXT_PUBLIC). Never import this module into a client component.

import { createCache } from '@/lib/cache'
import { torontoTodayYMD, ymdAddDays } from '@/lib/dates'

export type UwResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  | { configured: true; ok: false; error: string }

function uwEnv(): { url: string; key: string } | null {
  const url = process.env.UW_SUPABASE_URL
  const key = process.env.UW_SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return { url: url.replace(/\/$/, ''), key }
}

export function workbenchConfigured(): boolean {
  return uwEnv() !== null
}

// The single query surface: GET /rest/v1/{table}?{params}. Select-only by
// shape — no method other than GET ever leaves this module.
async function uwSelect<T>(
  table: string,
  params: Record<string, string>,
): Promise<UwResult<T[]>> {
  const env = uwEnv()
  if (!env) return { configured: false }
  const qs = new URLSearchParams(params).toString()
  const started = Date.now()
  try {
    const res = await fetch(`${env.url}/rest/v1/${table}?${qs}`, {
      headers: { apikey: env.key, Authorization: `Bearer ${env.key}` },
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      // Status + table only — never response bodies (rule 2).
      console.error(`[uw] ${table} HTTP ${res.status} ms=${ms}`)
      return { configured: true, ok: false, error: `Workbench query failed (HTTP ${res.status})` }
    }
    const data = (await res.json()) as T[]
    console.log(`[uw] ${table} rows=${Array.isArray(data) ? data.length : 0} ms=${ms}`)
    return { configured: true, ok: true, data }
  } catch {
    console.error(`[uw] ${table} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Workbench unreachable' }
  }
}

function mapResult<A, B>(res: UwResult<A[]>, fn: (rows: A[]) => B): UwResult<B> {
  if (!res.configured || !res.ok) return res
  try {
    return { configured: true, ok: true, data: fn(res.data) }
  } catch {
    return { configured: true, ok: false, error: 'Workbench result had an unexpected shape' }
  }
}

// ─── Agent resolution (tenant anchor) ───────────────────────────────────────

const agentIdCache = createCache<string, string>({ max: 8, ttlMs: 10 * 60 * 1000 })

export async function getAgentIdByEmail(email: string): Promise<UwResult<string>> {
  if (!workbenchConfigured()) return { configured: false }
  const cached = agentIdCache.get(email)
  if (cached) return { configured: true, ok: true, data: cached }
  const res = await uwSelect<{ id: string }>('agents', {
    select: 'id',
    email: `eq.${email}`,
    limit: '1',
  })
  if (!res.configured || !res.ok) return res
  const id = res.data[0]?.id
  if (!id) {
    return { configured: true, ok: false, error: 'No workbench agent row matches the practice email' }
  }
  agentIdCache.set(email, id)
  return { configured: true, ok: true, data: id }
}

// ─── Typed fetchers ─────────────────────────────────────────────────────────

export interface OpenFlag {
  id: string
  severity: 'info' | 'warning' | 'high'
  kind: string
  dealRef: string | null
  createdAt: string
}

export async function getOpenFlags(agentId: string): Promise<UwResult<OpenFlag[]>> {
  const res = await uwSelect<any>('flags', {
    select: 'id,severity,kind,created_at,deals(file_ref)',
    agent_id: `eq.${agentId}`,
    status: 'eq.open',
    order: 'created_at.desc',
    limit: '200',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      severity: r.severity,
      kind: r.kind,
      dealRef: r.deals?.file_ref ?? null,
      createdAt: r.created_at,
    })),
  )
}

// Statement documents with extracted fields awaiting a decision. The
// statement_reviews table records decisions already made, so "pending" is
// derived from statement_fields still in status=extracted, grouped per
// document.
export interface PendingStatementReview {
  documentId: string
  docClass: string
  dealRef: string | null
  fieldCount: number
}

export async function getPendingStatementReviews(
  agentId: string,
): Promise<UwResult<PendingStatementReview[]>> {
  const res = await uwSelect<any>('statement_fields', {
    select: 'document_id,doc_class,deals(file_ref)',
    agent_id: `eq.${agentId}`,
    status: 'eq.extracted',
    limit: '1000',
  })
  return mapResult(res, rows => {
    const byDoc = new Map<string, PendingStatementReview>()
    for (const r of rows) {
      const cur = byDoc.get(r.document_id)
      if (cur) cur.fieldCount += 1
      else
        byDoc.set(r.document_id, {
          documentId: r.document_id,
          docClass: r.doc_class,
          dealRef: r.deals?.file_ref ?? null,
          fieldCount: 1,
        })
    }
    return Array.from(byDoc.values())
  })
}

// Rate sheet intel items with extracted quotes not yet decided in
// rate_sheet_reviews (pending = quotes still in status=extracted).
export interface PendingSheetReview {
  intelItemId: string
  lenderSlug: string | null
  asOfDate: string | null
  quoteCount: number
}

export async function getPendingSheetReviews(
  agentId: string,
): Promise<UwResult<PendingSheetReview[]>> {
  const res = await uwSelect<any>('rate_quotes', {
    select: 'intel_item_id,lender_slug,as_of_date',
    agent_id: `eq.${agentId}`,
    status: 'eq.extracted',
    limit: '2000',
  })
  return mapResult(res, rows => {
    const byItem = new Map<string, PendingSheetReview>()
    for (const r of rows) {
      const cur = byItem.get(r.intel_item_id)
      if (cur) cur.quoteCount += 1
      else
        byItem.set(r.intel_item_id, {
          intelItemId: r.intel_item_id,
          lenderSlug: r.lender_slug ?? null,
          asOfDate: r.as_of_date ?? null,
          quoteCount: 1,
        })
    }
    return Array.from(byItem.values())
  })
}

export interface ShadowTally {
  filesScored: number
  totalScores: number
  // Consecutive most-recent scores where the system and Michael agreed.
  agreementStreak: number
  lastScoreDate: string | null
  // Distinct file_refs already scored — lets callers derive which active
  // files still owe a shadow score.
  scoredFileRefs: string[]
}

export async function getShadowTally(agentId: string): Promise<UwResult<ShadowTally>> {
  const res = await uwSelect<any>('shadow_scores', {
    select: 'file_ref,agreement,scored_at',
    agent_id: `eq.${agentId}`,
    order: 'scored_at.desc',
    limit: '500',
  })
  return mapResult(res, rows => {
    const files = new Set<string>()
    let streak = 0
    let streakBroken = false
    for (const r of rows) {
      files.add(r.file_ref)
      if (!streakBroken) {
        if (r.agreement === true) streak += 1
        else streakBroken = true
      }
    }
    return {
      filesScored: files.size,
      totalScores: rows.length,
      agreementStreak: streak,
      lastScoreDate: rows[0]?.scored_at ?? null,
      scoredFileRefs: Array.from(files),
    }
  })
}

export interface ConditionRow {
  id: string
  dealRef: string | null
  text: string
  owner: string
  status: string
  dueDate: string | null
  condNumber: string | null
}

export interface ConditionsDue {
  overdue: ConditionRow[]
  dueSoon: ConditionRow[]
  openNoDueDate: number
  totalOpen: number
}

export async function getConditionsDue(
  agentId: string,
  horizonDays: number,
): Promise<UwResult<ConditionsDue>> {
  const res = await uwSelect<any>('conditions', {
    select: 'id,text,owner,status,due_date,cond_number,deals(file_ref)',
    agent_id: `eq.${agentId}`,
    status: 'not.in.(satisfied,waived)',
    order: 'due_date.asc.nullslast',
    limit: '500',
  })
  const today = torontoTodayYMD()
  const horizon = ymdAddDays(today, horizonDays)
  return mapResult(res, rows => {
    const toRow = (r: any): ConditionRow => ({
      id: r.id,
      dealRef: r.deals?.file_ref ?? null,
      text: r.text,
      owner: r.owner,
      status: r.status,
      dueDate: r.due_date ?? null,
      condNumber: r.cond_number ?? null,
    })
    const overdue: ConditionRow[] = []
    const dueSoon: ConditionRow[] = []
    let openNoDueDate = 0
    for (const r of rows) {
      if (!r.due_date) {
        openNoDueDate += 1
        continue
      }
      // due_date is a date-only string; lexicographic compare is correct.
      if (r.due_date < today) overdue.push(toRow(r))
      else if (r.due_date <= horizon) dueSoon.push(toRow(r))
    }
    return { overdue, dueSoon, openNoDueDate, totalOpen: rows.length }
  })
}

// Open condition count per workbench deal id — used to join Zoho closings
// to workbench conditions via deals.zoho_potential_id.
export async function getOpenConditionCounts(
  agentId: string,
): Promise<UwResult<Record<string, number>>> {
  const res = await uwSelect<any>('conditions', {
    select: 'deal_id',
    agent_id: `eq.${agentId}`,
    status: 'not.in.(satisfied,waived)',
    limit: '1000',
  })
  return mapResult(res, rows => {
    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.deal_id] = (counts[r.deal_id] ?? 0) + 1
    return counts
  })
}

export interface WorkbenchDeal {
  id: string
  fileRef: string
  stage: string | null
  closingDate: string | null
  zohoPotentialId: string | null
  status: string
  updatedAt: string
}

export async function getDealsSummary(agentId: string): Promise<UwResult<WorkbenchDeal[]>> {
  const res = await uwSelect<any>('deals', {
    select: 'id,file_ref,stage,closing_date,zoho_potential_id,status,updated_at',
    agent_id: `eq.${agentId}`,
    order: 'updated_at.desc',
    limit: '500',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      fileRef: r.file_ref,
      stage: r.stage ?? null,
      closingDate: r.closing_date ?? null,
      zohoPotentialId: r.zoho_potential_id ?? null,
      status: r.status,
      updatedAt: r.updated_at,
    })),
  )
}

// Most recent workbench activity: latest of deals.updated_at and
// intake_events.received_at. Feeds the Status page and the sync
// freshness alert.
export interface IntakeFreshness {
  lastActivity: string | null
}

export async function getIntakeFreshness(agentId: string): Promise<UwResult<IntakeFreshness>> {
  const [deals, intake] = await Promise.all([
    uwSelect<any>('deals', {
      select: 'updated_at',
      agent_id: `eq.${agentId}`,
      order: 'updated_at.desc',
      limit: '1',
    }),
    uwSelect<any>('intake_events', {
      select: 'received_at',
      agent_id: `eq.${agentId}`,
      order: 'received_at.desc',
      limit: '1',
    }),
  ])
  if (!deals.configured) return { configured: false }
  if (!deals.ok && (!intake.configured || !intake.ok)) {
    return { configured: true, ok: false, error: 'Workbench freshness query failed' }
  }
  const candidates: string[] = []
  if (deals.configured && deals.ok && deals.data[0]?.updated_at) {
    candidates.push(deals.data[0].updated_at)
  }
  if (intake.configured && intake.ok && intake.data[0]?.received_at) {
    candidates.push(intake.data[0].received_at)
  }
  const lastActivity = candidates.length
    ? candidates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0]
    : null
  return { configured: true, ok: true, data: { lastActivity } }
}

// Rates tile source: approved current quotes, superseded count, newest
// approved sheet date, plus how many quotes sit unreviewed.
export interface RateQuoteStats {
  approvedCurrent: number
  superseded: number
  extracted: number
  newestApprovedAsOf: string | null
}

export async function getRateQuoteStats(agentId: string): Promise<UwResult<RateQuoteStats>> {
  const res = await uwSelect<any>('rate_quotes', {
    select: 'status,as_of_date',
    agent_id: `eq.${agentId}`,
    limit: '5000',
  })
  return mapResult(res, rows => {
    let approvedCurrent = 0
    let superseded = 0
    let extracted = 0
    let newestApprovedAsOf: string | null = null
    for (const r of rows) {
      if (r.status === 'approved') {
        approvedCurrent += 1
        if (r.as_of_date && (!newestApprovedAsOf || r.as_of_date > newestApprovedAsOf)) {
          newestApprovedAsOf = r.as_of_date
        }
      } else if (r.status === 'superseded') superseded += 1
      else if (r.status === 'extracted') extracted += 1
    }
    return { approvedCurrent, superseded, extracted, newestApprovedAsOf }
  })
}
