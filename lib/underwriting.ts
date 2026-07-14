// Read-only wiring to the fox-underwriting Supabase project ("the workbench").
// This is the ONLY module in this repo that touches that project.
//
// Hard rules (Session 1 brief; posture upgraded Session 3):
//   1. Read-only by construction AND by the database. The whole query
//      surface is uwSelect(), an HTTP GET against PostgREST with a select
//      parameter. There is no insert / update / upsert / delete / rpc
//      surface anywhere in this repo. Since Session 3 the wrapper
//      authenticates as the portal_readonly Postgres role (Session 2,
//      migration 0024; 17 granted tables as of migration 0028), everything
//      else refused by Postgres itself. The service-role key is deleted
//      from this Vercel project; decisions flow through the Gates API
//      (lib/gates.ts), never through this module.
//   2. Never log workbench payloads. Borrower data may pass through server
//      components; logs carry table names, row counts, and durations only.
//   3. Masked values render exactly as stored. The workbench masks account
//      numbers and drops SINs before storage; nothing here reconstructs or
//      joins toward unmasked identifiers.
//   4. Tenant-scoped from the first query: every fetcher takes agentId and
//      filters on it. Michael's agent row is resolved once by email match
//      (config/targets.ts WORKBENCH_AGENT_EMAIL) and cached.
//
// Server-only: reads UW_SUPABASE_URL / UW_SUPABASE_READONLY_KEY /
// UW_SUPABASE_PUBLISHABLE_KEY (never NEXT_PUBLIC). Never import this module
// into a client component.
//
// Auth mechanics (docs/gates-api.md in fox-underwriting): the readonly key
// is a long-lived JWT carrying role=portal_readonly, signed under a standby
// signing key. It rides Authorization: Bearer; the project's publishable
// key rides apikey for gateway passage. The JWT decides the Postgres role.

import { createCache } from '@/lib/cache'
import { torontoTodayYMD, ymdAddDays } from '@/lib/dates'
import { isTerminalWorkbenchDeal } from '@/config/pipeline'
import { normalizeEvidence, type OfferEvidenceItem } from '@/lib/offers'
// Demo mode (Session 9): each read fetcher below short-circuits to a
// fictional fixture as its FIRST statement, before any uwFetch/network
// call, so demo mode performs ZERO real workbench reads.
import { isDemoMode, DEMO_AGENT_ID } from '@/lib/demo'
import { isTestRoom } from '@/lib/test-rooms'
import {
  demoResult,
  demoDeals,
  demoDealDetail,
  demoDealConditions,
  demoDealFlags,
  demoDealStatementDocs,
  demoDealShadowHistory,
  demoDealBorrowers,
  demoDealIncomeCalcs,
  demoDealRatioCalcs,
  demoDealDocuments,
  demoDealAudit,
  demoOpenFlags,
  demoConditionsDue,
  demoOpenConditionCounts,
  demoPendingStatementReviews,
  demoPendingSheetReviews,
  demoShadowQueue,
  demoRateQuoteStats,
  demoIntakeFreshness,
  demoStatementQueue,
  demoDiscrepancyFlags,
  demoRateSheetQueue,
  demoOpenFlagCards,
  demoLastDecided,
  demoOpenFlagCountsByDeal,
  demoShadowScoredDimCounts,
} from '@/lib/demo-fixtures'

export type UwResult<T> =
  | { configured: false }
  | { configured: true; ok: true; data: T }
  // status carries the HTTP code so pages can tell a permission refusal
  // (403/42501: render the not-granted state) from an outage (retry copy).
  | { configured: true; ok: false; error: string; status?: number }

// Attempt-and-fallback helper (Session 4 standing rule): a section renders
// its not-granted state only on an actual permission refusal, never as a
// hardcoded placeholder.
export function isPermissionRefusal<T>(res: UwResult<T>): boolean {
  return res.configured && !res.ok && res.status === 403
}

function uwEnv(): { url: string; bearer: string; apikey: string } | null {
  const rawUrl = process.env.UW_SUPABASE_URL
  const bearer = process.env.UW_SUPABASE_READONLY_KEY
  const apikey = process.env.UW_SUPABASE_PUBLISHABLE_KEY
  if (!rawUrl || !bearer || !apikey) return null
  // Accept both the bare project URL and a pasted REST base: strip trailing
  // slashes and a trailing /rest/v1 so uwSelect's own /rest/v1/{table}
  // never doubles the path (this exact paste happened on 2026-07-09).
  const url = rawUrl.replace(/\/+$/, '').replace(/\/rest\/v1$/, '')
  return { url, bearer, apikey }
}

export function workbenchConfigured(): boolean {
  return uwEnv() !== null
}

// The single query surface: GET /rest/v1/{table}?{params}. Select-only by
// shape — no method other than GET ever leaves this module. withCount adds
// Prefer: count=exact and reads the total from Content-Range (still a GET;
// the audit viewer's pagination needs it).
async function uwFetch<T>(
  table: string,
  params: Record<string, string>,
  withCount = false,
): Promise<
  | { configured: false }
  | { configured: true; ok: false; error: string; status?: number }
  | { configured: true; ok: true; data: T[]; total: number | null }
> {
  const env = uwEnv()
  if (!env) return { configured: false }
  const qs = new URLSearchParams(params).toString()
  const started = Date.now()
  try {
    const headers: Record<string, string> = {
      apikey: env.apikey,
      Authorization: `Bearer ${env.bearer}`,
    }
    if (withCount) headers.Prefer = 'count=exact'
    const res = await fetch(`${env.url}/rest/v1/${table}?${qs}`, {
      headers,
      cache: 'no-store',
    })
    const ms = Date.now() - started
    if (!res.ok) {
      // Status + table only — never response bodies (rule 2).
      console.error(`[uw] ${table} HTTP ${res.status} ms=${ms}`)
      return {
        configured: true,
        ok: false,
        error: `Workbench query failed (HTTP ${res.status})`,
        status: res.status,
      }
    }
    const data = (await res.json()) as T[]
    let total: number | null = null
    if (withCount) {
      const range = res.headers.get('content-range')
      const m = range?.match(/\/(\d+)$/)
      if (m) total = Number(m[1])
    }
    console.log(`[uw] ${table} rows=${Array.isArray(data) ? data.length : 0} ms=${ms}`)
    return { configured: true, ok: true, data, total }
  } catch {
    console.error(`[uw] ${table} unreachable ms=${Date.now() - started}`)
    return { configured: true, ok: false, error: 'Workbench unreachable' }
  }
}

// PostgREST serves numerics as JSON strings in some configurations;
// normalize once, keeping null honest.
function numOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v)
}

async function uwSelect<T>(
  table: string,
  params: Record<string, string>,
): Promise<UwResult<T[]>> {
  const res = await uwFetch<T>(table, params)
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

// Supabase's PostgREST caps every response at 1,000 rows (db-max-rows)
// REGARDLESS of the limit param — verified live 2026-07-13, when the
// approved+superseded rate book outgrew one page and the Rates grid silently
// dropped whole lenders (the rows past the cap, in as_of_date order, simply
// never arrived). Any fetcher whose result set can grow past one page MUST
// read through uwSelectAll, which pages by offset until a short page.
const UW_PAGE_ROWS = 1000
// A runaway backstop far above any plausible table, never a working ceiling.
// Hitting it is loudly logged: a silent cap is exactly the bug this exists
// to prevent.
const UW_MAX_PAGES = 20

/** Paginated select: every row, not just the first server page. `params.order`
 * gains an `id` tiebreak so offset pages are stable under equal sort keys
 * (without it, ties can duplicate or drop rows across page boundaries). A
 * failure on ANY page fails the whole read — partial data must never present
 * as complete. Costs exactly one request when the result fits one page. */
async function uwSelectAll<T>(
  table: string,
  params: Record<string, string>,
): Promise<UwResult<T[]>> {
  const { limit: _limit, ...rest } = params
  const order = rest.order ? `${rest.order},id.asc` : 'id.asc'
  const out: T[] = []
  for (let page = 0; page < UW_MAX_PAGES; page++) {
    const res = await uwFetch<T>(table, {
      ...rest,
      order,
      limit: String(UW_PAGE_ROWS),
      offset: String(page * UW_PAGE_ROWS),
    })
    if (!res.configured || !res.ok) return res
    out.push(...res.data)
    if (res.data.length < UW_PAGE_ROWS) return { configured: true, ok: true, data: out }
  }
  console.error(`[uw] ${table} paginated read hit the ${UW_MAX_PAGES * UW_PAGE_ROWS}-row backstop; result may be incomplete`)
  return { configured: true, ok: true, data: out }
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
  if (isDemoMode()) return demoResult(DEMO_AGENT_ID)
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

// Urgency surface: flags on terminal deals (funded and the like) are
// excluded here; they stay visible in the deal list, the deal room, and
// the Approvals closed-files section. Lender-level flags (null deal) stay.
export async function getOpenFlags(agentId: string): Promise<UwResult<OpenFlag[]>> {
  if (isDemoMode()) return demoResult(demoOpenFlags)
  const res = await uwSelect<any>('flags', {
    select: 'id,severity,kind,created_at,deal_id,deals(file_ref,stage,status)',
    agent_id: `eq.${agentId}`,
    status: 'eq.open',
    order: 'created_at.desc',
    limit: '500',
  })
  return mapResult(res, rows =>
    rows
      .filter(r => !r.deal_id || !isTerminalWorkbenchDeal(r.deals ?? {}))
      .map(r => ({
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
  if (isDemoMode()) return demoResult(demoPendingStatementReviews)
  const res = await uwSelectAll<any>('statement_fields', {
    select: 'document_id,doc_class,deals(file_ref,stage,status)',
    agent_id: `eq.${agentId}`,
    status: 'eq.extracted',
    limit: '1000',
  })
  return mapResult(res, allRows => {
    const rows = allRows.filter(r => !isTerminalWorkbenchDeal(r.deals ?? {}))
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
  if (isDemoMode()) return demoResult(demoPendingSheetReviews)
  const res = await uwSelectAll<any>('rate_quotes', {
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

// Promotional offers extracted from Roam intel, awaiting Michael's approval.
// The lender_offers table is the 18th granted read surface. "pending" = rows
// still in status=extracted. Each row carries its normalized priced elements
// (rate/variance/cashback/term/class), the verbatim conditions, per-element
// extraction evidence, the offer_payload the knowledge layer consumes, and —
// the field that matters most — the window (started/expiry), where a null
// expiry means the offer will not auto-retire.
export interface OfferQueueCard {
  id: string
  offerId: string
  offerName: string
  lenderSlug: string
  lenderName: string | null
  rate: number | null
  rateType: string | null
  primeVariance: number | null
  cashbackPct: number | null
  cashbackAmountText: string | null
  productClass: string | null
  termMonths: number | null
  termMonthsList: number[] | null
  conditions: string[]
  eligibility: unknown | null
  started: string | null
  expiry: string | null
  offerPayload: unknown
  evidence: OfferEvidenceItem[]
  sourcePage: number | null
  sourceSnippet: string | null
  confidence: number | null
  extractedBy: string
  intelItemId: string | null
  createdAt: string
}

export async function getOfferQueue(agentId: string): Promise<UwResult<OfferQueueCard[]>> {
  if (isDemoMode()) return demoResult([])
  const res = await uwSelect<any>('lender_offers', {
    select:
      'id,offer_id,offer_name,lender_slug,lender_name,rate,rate_type,prime_variance,cashback_pct,cashback_amount_text,product_class,term_months,term_months_list,conditions,eligibility,started,expiry,offer_payload,evidence,source_page,source_snippet,confidence,extracted_by,intel_item_id,list_seq,created_at',
    agent_id: `eq.${agentId}`,
    status: 'eq.extracted',
    order: 'created_at.asc',
    limit: '500',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      offerId: r.offer_id,
      offerName: r.offer_name,
      lenderSlug: r.lender_slug,
      lenderName: r.lender_name ?? null,
      rate: numOrNull(r.rate),
      rateType: r.rate_type ?? null,
      primeVariance: numOrNull(r.prime_variance),
      cashbackPct: numOrNull(r.cashback_pct),
      cashbackAmountText: r.cashback_amount_text ?? null,
      productClass: r.product_class ?? null,
      termMonths: r.term_months ?? null,
      termMonthsList: Array.isArray(r.term_months_list) ? r.term_months_list.map(Number) : null,
      conditions: Array.isArray(r.conditions) ? r.conditions.filter((c: unknown): c is string => typeof c === 'string') : [],
      eligibility: r.eligibility ?? null,
      started: r.started ?? null,
      expiry: r.expiry ?? null,
      offerPayload: r.offer_payload ?? null,
      evidence: normalizeEvidence(r.evidence),
      sourcePage: r.source_page ?? null,
      sourceSnippet: r.source_snippet ?? null,
      confidence: numOrNull(r.confidence),
      extractedBy: r.extracted_by,
      intelItemId: r.intel_item_id ?? null,
      createdAt: r.created_at,
    })),
  )
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
  if (isDemoMode()) return demoResult(demoConditionsDue)
  const res = await uwSelect<any>('conditions', {
    select: 'id,text,owner,status,due_date,cond_number,deals(file_ref,stage,status)',
    agent_id: `eq.${agentId}`,
    status: 'not.in.(satisfied,waived)',
    order: 'due_date.asc.nullslast',
    limit: '500',
  })
  const today = torontoTodayYMD()
  const horizon = ymdAddDays(today, horizonDays)
  return mapResult(res, allRows => {
    // Urgency surface: conditions on terminal deals are cleanup, not
    // attention items; they render in the deal room instead.
    const rows = allRows.filter(r => !isTerminalWorkbenchDeal(r.deals ?? {}))
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
  if (isDemoMode()) return demoResult(demoOpenConditionCounts)
  const res = await uwSelectAll<any>('conditions', {
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
  if (isDemoMode()) return demoResult(demoDeals)
  const res = await uwSelect<any>('deals', {
    select: 'id,file_ref,stage,closing_date,zoho_potential_id,status,updated_at',
    agent_id: `eq.${agentId}`,
    order: 'updated_at.desc',
    limit: '500',
  })
  return mapResult(res, rows =>
    rows
      .map(r => ({
        id: r.id,
        fileRef: r.file_ref,
        stage: r.stage ?? null,
        closingDate: r.closing_date ?? null,
        zohoPotentialId: r.zoho_potential_id ?? null,
        status: r.status,
        updatedAt: r.updated_at,
      }))
      // Structural test-room exclusion (Phase B1): applied HERE at the
      // fetcher boundary so every consumer (board, search, counts, Today
      // strip) inherits it — never per-page memory. Demo mode returned its
      // fixtures above and never reaches this filter.
      .filter(d => !isTestRoom(d.fileRef, d.status)),
  )
}

// Most recent workbench activity: latest of deals.updated_at and
// intake_events.received_at. Feeds the Status page and the sync
// freshness alert.
export interface IntakeFreshness {
  lastActivity: string | null
}

export async function getIntakeFreshness(agentId: string): Promise<UwResult<IntakeFreshness>> {
  if (isDemoMode()) return demoResult(demoIntakeFreshness)
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

// ═══ Session 3: approvals queue detail, deal room, audit viewer ═════════════
// Everything below reads only the 12 tables granted to portal_readonly:
// agents, deals, conditions, flags, statement_fields, statement_reviews,
// rate_sheet_reviews, rate_quotes, lender_intel_items, shadow_scores,
// audit_log, intake_events. borrowers, evidence, income_calcs, ratio_calcs,
// documents are NOT granted; pages render graceful sections instead.

// ─── Statement review queue (full card detail) ──────────────────────────────

export interface StatementFieldRow {
  id: string
  fieldName: string
  valueText: string | null
  valueNumeric: number | null
  unit: string | null
  sourcePage: number
  sourceSnippet: string
  confidence: number
  heldReason: string | null
  status: string
}

export interface StatementQueueCard {
  documentId: string
  docClass: string
  dealId: string
  dealRef: string | null
  fields: StatementFieldRow[]
}

const stmtFieldRow = (r: any): StatementFieldRow => ({
  id: r.id,
  fieldName: r.field_name,
  valueText: r.value_text ?? null,
  valueNumeric: r.value_numeric !== null && r.value_numeric !== undefined ? Number(r.value_numeric) : null,
  unit: r.unit ?? null,
  sourcePage: r.source_page,
  sourceSnippet: r.source_snippet,
  confidence: Number(r.confidence),
  heldReason: r.held_reason ?? null,
  status: r.status,
})

export async function getStatementQueue(agentId: string): Promise<UwResult<StatementQueueCard[]>> {
  if (isDemoMode()) return demoResult(demoStatementQueue)
  const res = await uwSelectAll<any>('statement_fields', {
    select:
      'id,document_id,doc_class,deal_id,field_name,value_text,value_numeric,unit,source_page,source_snippet,confidence,held_reason,status,deals(file_ref,stage,status)',
    agent_id: `eq.${agentId}`,
    status: 'eq.extracted',
    order: 'created_at.asc',
    limit: '1000',
  })
  return mapResult(res, allRows => {
    const rows = allRows.filter(r => !isTerminalWorkbenchDeal(r.deals ?? {}))
    const byDoc = new Map<string, StatementQueueCard>()
    for (const r of rows) {
      let card = byDoc.get(r.document_id)
      if (!card) {
        card = {
          documentId: r.document_id,
          docClass: r.doc_class,
          dealId: r.deal_id,
          dealRef: r.deals?.file_ref ?? null,
          fields: [],
        }
        byDoc.set(r.document_id, card)
      }
      card.fields.push(stmtFieldRow(r))
    }
    return Array.from(byDoc.values())
  })
}

// Open statement_value_discrepancy flags: the two-sided framing the CLI
// stores at extraction time (statement figure vs application figure, each
// with its source reference). Rendered on the matching statement card.
export interface DiscrepancyFlag {
  id: string
  dealId: string | null
  dealRef: string | null
  statementField: string | null
  statementValue: string | null
  statementDocumentId: string | null
  statementSource: string | null
  applicationField: string | null
  applicationValue: string | null
  applicationSource: string | null
  wideGap: boolean
  policy: string | null
}

export async function getOpenDiscrepancyFlags(agentId: string): Promise<UwResult<DiscrepancyFlag[]>> {
  if (isDemoMode()) return demoResult(demoDiscrepancyFlags)
  const res = await uwSelect<any>('flags', {
    select: 'id,deal_id,detail,deals(file_ref)',
    agent_id: `eq.${agentId}`,
    kind: 'eq.statement_value_discrepancy',
    status: 'eq.open',
    limit: '500',
  })
  return mapResult(res, rows =>
    rows.map(r => {
      const d = (r.detail ?? {}) as Record<string, unknown>
      const s = (v: unknown) => (v === null || v === undefined ? null : String(v))
      return {
        id: r.id,
        dealId: r.deal_id ?? null,
        dealRef: r.deals?.file_ref ?? null,
        statementField: s(d.statement_field),
        statementValue: s(d.statement_value),
        statementDocumentId: s(d.statement_document_id),
        statementSource: s(d.statement_source),
        applicationField: s(d.application_field),
        applicationValue: s(d.application_value),
        applicationSource: s(d.application_source),
        wideGap: d.wide_gap === true,
        policy: s(d.policy),
      }
    }),
  )
}

// ─── Rate sheet queue (full card detail) ────────────────────────────────────

export interface RateQuoteRow {
  id: string
  productClass: string
  variant: string | null
  termMonths: number
  // Nullable since migration 0029: a floating quote whose sheet prints
  // only the discount stores no rate (the priced check guarantees a rate
  // or a variance, never neither).
  rate: number | null
  rateType: 'fixed' | 'adjustable' | 'variable'
  primeVariance: number | null
  cashbackPct: number | null
  programNotes: string | null
  compBps: number | null
  asOfDate: string | null
  expiryDate: string | null
  sourcePage: number
  sourceSnippet: string
  confidence: number
  heldReason: string | null
}

export interface SheetQueueCard {
  intelItemId: string
  lenderSlug: string | null
  asOfDate: string | null
  quotes: RateQuoteRow[]
}

export async function getRateSheetQueue(agentId: string): Promise<UwResult<SheetQueueCard[]>> {
  if (isDemoMode()) return demoResult(demoRateSheetQueue)
  const res = await uwSelectAll<any>('rate_quotes', {
    select:
      'id,intel_item_id,lender_slug,product_class,variant,term_months,rate,rate_type,prime_variance,cashback_pct,program_notes,comp_bps,as_of_date,expiry_date,source_page,source_snippet,confidence,held_reason',
    agent_id: `eq.${agentId}`,
    status: 'eq.extracted',
    order: 'term_months.asc',
    limit: '2000',
  })
  return mapResult(res, rows => {
    const byItem = new Map<string, SheetQueueCard>()
    for (const r of rows) {
      let card = byItem.get(r.intel_item_id)
      if (!card) {
        card = {
          intelItemId: r.intel_item_id,
          lenderSlug: r.lender_slug ?? null,
          asOfDate: null,
          quotes: [],
        }
        byItem.set(r.intel_item_id, card)
      }
      if (r.as_of_date && (!card.asOfDate || r.as_of_date > card.asOfDate)) {
        card.asOfDate = r.as_of_date
      }
      card.quotes.push({
        id: r.id,
        productClass: r.product_class,
        variant: r.variant ?? null,
        termMonths: r.term_months,
        rate: numOrNull(r.rate),
        rateType: r.rate_type ?? 'fixed',
        primeVariance: numOrNull(r.prime_variance),
        cashbackPct: numOrNull(r.cashback_pct),
        programNotes: r.program_notes ?? null,
        compBps: numOrNull(r.comp_bps),
        asOfDate: r.as_of_date ?? null,
        expiryDate: r.expiry_date ?? null,
        sourcePage: r.source_page,
        sourceSnippet: r.source_snippet,
        confidence: Number(r.confidence),
        heldReason: r.held_reason ?? null,
      })
    }
    return Array.from(byItem.values())
  })
}

// ─── Flags queue (full card detail) ─────────────────────────────────────────

export interface OpenFlagCard {
  id: string
  severity: 'info' | 'warning' | 'high'
  kind: string
  dealId: string | null
  dealRef: string | null
  createdAt: string
  detail: Record<string, unknown>
  evidenceRefCount: number
  // True when the flag's deal is terminal (funded and the like). Such
  // flags render in the desk's closed-files section and never count in
  // the tab badge.
  dealTerminal: boolean
}

export async function getOpenFlagCards(agentId: string): Promise<UwResult<OpenFlagCard[]>> {
  if (isDemoMode()) return demoResult(demoOpenFlagCards)
  const res = await uwSelect<any>('flags', {
    select: 'id,severity,kind,deal_id,created_at,detail,evidence_refs,deals(file_ref,stage,status)',
    agent_id: `eq.${agentId}`,
    status: 'eq.open',
    order: 'created_at.desc',
    limit: '500',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      severity: r.severity,
      kind: r.kind,
      dealId: r.deal_id ?? null,
      dealRef: r.deals?.file_ref ?? null,
      createdAt: r.created_at,
      detail: (r.detail ?? {}) as Record<string, unknown>,
      evidenceRefCount: Array.isArray(r.evidence_refs) ? r.evidence_refs.length : 0,
      dealTerminal: Boolean(r.deal_id) && isTerminalWorkbenchDeal(r.deals ?? {}),
    })),
  )
}

// ─── Shadow score queue ──────────────────────────────────────────────────────
// One card per active deal with at least one of the four dimensions not yet
// scored. System values for unscored dimensions are computed by the Gates
// API at scoring time (fetchSnapshot + dealValues in fox-underwriting);
// nothing is pre-stored, and this portal never re-implements that pathway.
// Past scores render their stored system_value exactly as recorded.

export interface ShadowDimensionState {
  dimension: 'checklist' | 'income' | 'ratios' | 'shortlist'
  lastAgreement: boolean | null
  lastScoredAt: string | null
  lastSystemValue: unknown
  lastDisagreementNote: string | null
}

export interface ShadowQueueCard {
  dealId: string
  fileRef: string
  stage: string | null
  closingDate: string | null
  dimensions: ShadowDimensionState[]
  scoredCount: number
}

export const SHADOW_DIMENSIONS_ORDER = ['checklist', 'income', 'ratios', 'shortlist'] as const

export async function getShadowQueue(agentId: string): Promise<UwResult<ShadowQueueCard[]>> {
  if (isDemoMode()) return demoResult(demoShadowQueue)
  const [dealsRes, scoresRes] = await Promise.all([
    uwSelect<any>('deals', {
      select: 'id,file_ref,stage,status,closing_date',
      agent_id: `eq.${agentId}`,
      status: 'eq.active',
      order: 'closing_date.asc.nullslast',
      limit: '200',
    }),
    uwSelect<any>('shadow_scores', {
      select: 'deal_id,dimension,agreement,scored_at,system_value,disagreement_note',
      agent_id: `eq.${agentId}`,
      order: 'scored_at.desc',
      limit: '2000',
    }),
  ])
  if (!dealsRes.configured || !dealsRes.ok) return dealsRes
  if (!scoresRes.configured || !scoresRes.ok) return scoresRes
  try {
    // Latest score per deal+dimension (rows arrive newest first).
    const latest = new Map<string, any>()
    for (const s of scoresRes.data) {
      const key = `${s.deal_id}:${s.dimension}`
      if (!latest.has(key)) latest.set(key, s)
    }
    const liveDeals = dealsRes.data.filter(d => !isTerminalWorkbenchDeal(d))
    const cards: ShadowQueueCard[] = liveDeals.map(d => {
      const dimensions: ShadowDimensionState[] = SHADOW_DIMENSIONS_ORDER.map(dim => {
        const s = latest.get(`${d.id}:${dim}`)
        return {
          dimension: dim,
          lastAgreement: s ? Boolean(s.agreement) : null,
          lastScoredAt: s?.scored_at ?? null,
          lastSystemValue: s?.system_value ?? null,
          lastDisagreementNote: s?.disagreement_note ?? null,
        }
      })
      return {
        dealId: d.id,
        fileRef: d.file_ref,
        stage: d.stage ?? null,
        closingDate: d.closing_date ?? null,
        dimensions,
        scoredCount: dimensions.filter(x => x.lastScoredAt !== null).length,
      }
    })
    return {
      configured: true,
      ok: true,
      data: cards.filter(c => c.scoredCount < SHADOW_DIMENSIONS_ORDER.length),
    }
  } catch {
    return { configured: true, ok: false, error: 'Workbench result had an unexpected shape' }
  }
}

// ─── Last decided timestamps (empty-queue states) ───────────────────────────

export interface LastDecided {
  statements: string | null
  rates: string | null
  flags: string | null
  shadow: string | null
}

const DECISION_ACTIONS: Record<keyof LastDecided, string[]> = {
  statements: [
    'statements.doc_approved',
    'statements.doc_rejected',
    'statements.doc_held',
    'statements.field_approved',
    'statements.field_rejected',
  ],
  rates: ['rates.sheet_approved', 'rates.sheet_rejected', 'rates.approved', 'rates.rejected'],
  flags: ['flag.disposition', 'flag.resolved'],
  shadow: ['shadow.score'],
}

export async function getLastDecided(agentId: string): Promise<UwResult<LastDecided>> {
  if (isDemoMode()) return demoResult(demoLastDecided)
  const all = Object.values(DECISION_ACTIONS).flat()
  const res = await uwSelect<any>('audit_log', {
    select: 'action,created_at',
    agent_id: `eq.${agentId}`,
    action: `in.(${all.join(',')})`,
    order: 'created_at.desc',
    limit: '400',
  })
  return mapResult(res, rows => {
    const out: LastDecided = { statements: null, rates: null, flags: null, shadow: null }
    for (const r of rows) {
      for (const key of Object.keys(DECISION_ACTIONS) as (keyof LastDecided)[]) {
        if (!out[key] && DECISION_ACTIONS[key].includes(r.action)) out[key] = r.created_at
      }
    }
    return out
  })
}

// ─── Deals list enrichments ─────────────────────────────────────────────────

export async function getOpenFlagCountsByDeal(agentId: string): Promise<UwResult<Record<string, number>>> {
  if (isDemoMode()) return demoResult(demoOpenFlagCountsByDeal)
  const res = await uwSelectAll<any>('flags', {
    select: 'deal_id',
    agent_id: `eq.${agentId}`,
    status: 'eq.open',
    limit: '1000',
  })
  return mapResult(res, rows => {
    const counts: Record<string, number> = {}
    for (const r of rows) {
      if (r.deal_id) counts[r.deal_id] = (counts[r.deal_id] ?? 0) + 1
    }
    return counts
  })
}

// Distinct dimensions scored per deal (0..4) for the shadow marker.
export async function getShadowScoredDimCounts(agentId: string): Promise<UwResult<Record<string, number>>> {
  if (isDemoMode()) return demoResult(demoShadowScoredDimCounts)
  const res = await uwSelectAll<any>('shadow_scores', {
    select: 'deal_id,dimension',
    agent_id: `eq.${agentId}`,
    limit: '2000',
  })
  return mapResult(res, rows => {
    const dims = new Map<string, Set<string>>()
    for (const r of rows) {
      if (!dims.has(r.deal_id)) dims.set(r.deal_id, new Set())
      dims.get(r.deal_id)!.add(r.dimension)
    }
    const counts: Record<string, number> = {}
    dims.forEach((set, dealId) => {
      counts[dealId] = set.size
    })
    return counts
  })
}

// ─── Deal room ──────────────────────────────────────────────────────────────

export interface DealDetail {
  id: string
  fileRef: string
  dealType: string
  stage: string | null
  status: string
  purchasePrice: number | null
  mortgageAmount: number | null
  closingDate: string | null
  lender: string | null
  product: string | null
  zohoPotentialId: string | null
  finmoAppId: string | null
  createdAt: string
  updatedAt: string
}

export async function getDealDetail(agentId: string, dealId: string): Promise<UwResult<DealDetail | null>> {
  if (isDemoMode()) return demoResult(demoDealDetail(dealId))
  const res = await uwSelect<any>('deals', {
    select:
      'id,file_ref,deal_type,stage,status,purchase_price,mortgage_amount,closing_date,lender,product,zoho_potential_id,finmo_app_id,created_at,updated_at',
    agent_id: `eq.${agentId}`,
    id: `eq.${dealId}`,
    limit: '1',
  })
  return mapResult(res, rows => {
    const r = rows[0]
    if (!r) return null
    return {
      id: r.id,
      fileRef: r.file_ref,
      dealType: r.deal_type,
      stage: r.stage ?? null,
      status: r.status,
      purchasePrice: r.purchase_price !== null && r.purchase_price !== undefined ? Number(r.purchase_price) : null,
      mortgageAmount: r.mortgage_amount !== null && r.mortgage_amount !== undefined ? Number(r.mortgage_amount) : null,
      closingDate: r.closing_date ?? null,
      lender: r.lender ?? null,
      product: r.product ?? null,
      zohoPotentialId: r.zoho_potential_id ?? null,
      finmoAppId: r.finmo_app_id ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  })
}

export interface DealConditionRow extends ConditionRow {
  source: string
  evidenceRefCount: number
  // Session 6, for the compliance card: the stored category vocabulary
  // (solicitor, borrower_execution, general_verification,
  // property_valuation, product_mechanics, broker_deliverable), the kind
  // marker where one exists, and the system precheck outcome recorded in
  // the precheck jsonb (status only; assertions stay workbench detail).
  category: string | null
  kind: string | null
  precheckStatus: string | null
}

export async function getDealConditions(agentId: string, dealId: string): Promise<UwResult<DealConditionRow[]>> {
  if (isDemoMode()) return demoResult(demoDealConditions(dealId))
  const res = await uwSelect<any>('conditions', {
    select: 'id,text,owner,status,due_date,cond_number,source,evidence_ids,category,kind,precheck',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'due_date.asc.nullslast',
    limit: '300',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      dealRef: null,
      text: r.text,
      owner: r.owner,
      status: r.status,
      dueDate: r.due_date ?? null,
      condNumber: r.cond_number ?? null,
      source: r.source,
      evidenceRefCount: Array.isArray(r.evidence_ids) ? r.evidence_ids.length : 0,
      category: r.category ?? null,
      kind: r.kind ?? null,
      precheckStatus:
        r.precheck && typeof r.precheck === 'object' && typeof r.precheck.status === 'string'
          ? r.precheck.status
          : null,
    })),
  )
}

// Session 6, compliance dashboard: the deals whose compliance card reads
// attention, from recorded signals only (open compliance_gap flags, plus
// overdue conditions in the compliance-bearing categories). The posture
// rule itself lives in lib/compliance-logic.ts.
export interface ComplianceAttentionDeal {
  dealId: string
  fileRef: string
  reasons: string[]
}

export async function getComplianceAttentionDeals(
  agentId: string,
  complianceCategories: readonly string[],
  todayYMD: string,
): Promise<UwResult<ComplianceAttentionDeal[]>> {
  if (isDemoMode()) return demoResult([])
  const [flagsRes, condsRes] = await Promise.all([
    uwSelect<any>('flags', {
      select: 'deal_id,severity,deals(file_ref)',
      agent_id: `eq.${agentId}`,
      kind: 'eq.compliance_gap',
      status: 'eq.open',
      limit: '200',
    }),
    uwSelect<any>('conditions', {
      select: 'deal_id,category,status,due_date,deals(file_ref)',
      agent_id: `eq.${agentId}`,
      category: `in.(${complianceCategories.join(',')})`,
      status: 'not.in.(satisfied,waived)',
      limit: '500',
    }),
  ])
  if (!flagsRes.configured || !flagsRes.ok) return flagsRes
  if (!condsRes.configured || !condsRes.ok) return condsRes
  try {
    const byDeal = new Map<string, ComplianceAttentionDeal>()
    const add = (dealId: string, fileRef: string, reason: string) => {
      const cur = byDeal.get(dealId)
      if (cur) cur.reasons.push(reason)
      else byDeal.set(dealId, { dealId, fileRef, reasons: [reason] })
    }
    for (const f of flagsRes.data) {
      if (f.deal_id && f.deals?.file_ref) {
        add(f.deal_id, f.deals.file_ref, `open compliance_gap flag (${f.severity})`)
      }
    }
    for (const c of condsRes.data) {
      if (c.deal_id && c.deals?.file_ref && c.due_date && c.due_date < todayYMD) {
        add(c.deal_id, c.deals.file_ref, `overdue ${String(c.category).replace(/_/g, ' ')} condition`)
      }
    }
    return { configured: true, ok: true, data: Array.from(byDeal.values()) }
  } catch {
    return { configured: true, ok: false, error: 'Workbench result had an unexpected shape' }
  }
}

export interface DealFlagRow {
  id: string
  severity: 'info' | 'warning' | 'high'
  kind: string
  status: string
  detail: Record<string, unknown>
  createdAt: string
  resolution: string | null
  reason: string | null
  resolvedAt: string | null
}

export async function getDealFlags(agentId: string, dealId: string): Promise<UwResult<DealFlagRow[]>> {
  if (isDemoMode()) return demoResult(demoDealFlags(dealId))
  const res = await uwSelect<any>('flags', {
    select: 'id,severity,kind,status,detail,created_at,resolution,reason,resolved_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'created_at.desc',
    limit: '300',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      severity: r.severity,
      kind: r.kind,
      status: r.status,
      detail: (r.detail ?? {}) as Record<string, unknown>,
      createdAt: r.created_at,
      resolution: r.resolution ?? null,
      reason: r.reason ?? null,
      resolvedAt: r.resolved_at ?? null,
    })),
  )
}

// Statement documents on a deal, every status, with the sheet-level review
// decision merged in where one exists. statement_reviews carries no deal_id,
// so the document set is derived from statement_fields first.
export interface DealStatementDoc {
  documentId: string
  docClass: string
  fields: StatementFieldRow[]
  review: {
    decision: string
    fieldsTotal: number
    fieldsActioned: number
    fieldsHeld: number
    decidedBy: string
    decidedAt: string
  } | null
}

export async function getDealStatementDocs(agentId: string, dealId: string): Promise<UwResult<DealStatementDoc[]>> {
  if (isDemoMode()) return demoResult(demoDealStatementDocs(dealId))
  const fieldsRes = await uwSelectAll<any>('statement_fields', {
    select:
      'id,document_id,doc_class,field_name,value_text,value_numeric,unit,source_page,source_snippet,confidence,held_reason,status',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'created_at.asc',
    limit: '1000',
  })
  if (!fieldsRes.configured || !fieldsRes.ok) return fieldsRes
  try {
    const byDoc = new Map<string, DealStatementDoc>()
    for (const r of fieldsRes.data) {
      let doc = byDoc.get(r.document_id)
      if (!doc) {
        doc = { documentId: r.document_id, docClass: r.doc_class, fields: [], review: null }
        byDoc.set(r.document_id, doc)
      }
      doc.fields.push(stmtFieldRow(r))
    }
    const docIds = Array.from(byDoc.keys())
    if (docIds.length > 0) {
      const reviewsRes = await uwSelect<any>('statement_reviews', {
        select: 'document_id,decision,fields_total,fields_actioned,fields_held,decided_by,decided_at',
        agent_id: `eq.${agentId}`,
        document_id: `in.(${docIds.join(',')})`,
        limit: '200',
      })
      if (reviewsRes.configured && reviewsRes.ok) {
        for (const rv of reviewsRes.data) {
          const doc = byDoc.get(rv.document_id)
          if (doc) {
            doc.review = {
              decision: rv.decision,
              fieldsTotal: rv.fields_total,
              fieldsActioned: rv.fields_actioned,
              fieldsHeld: rv.fields_held,
              decidedBy: rv.decided_by,
              decidedAt: rv.decided_at,
            }
          }
        }
      }
    }
    return { configured: true, ok: true, data: Array.from(byDoc.values()) }
  } catch {
    return { configured: true, ok: false, error: 'Workbench result had an unexpected shape' }
  }
}

export interface DealShadowScore {
  id: string
  dimension: string
  agreement: boolean
  systemValue: unknown
  michaelValue: unknown
  disagreementNote: string | null
  rulingRef: string | null
  scoredAt: string
}

export async function getDealShadowHistory(agentId: string, dealId: string): Promise<UwResult<DealShadowScore[]>> {
  if (isDemoMode()) return demoResult(demoDealShadowHistory(dealId))
  const res = await uwSelect<any>('shadow_scores', {
    select: 'id,dimension,agreement,system_value,michael_value,disagreement_note,ruling_ref,scored_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'scored_at.desc',
    limit: '100',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      dimension: r.dimension,
      agreement: Boolean(r.agreement),
      systemValue: r.system_value ?? null,
      michaelValue: r.michael_value ?? null,
      disagreementNote: r.disagreement_note ?? null,
      rulingRef: r.ruling_ref ?? null,
      scoredAt: r.scored_at,
    })),
  )
}

// ═══ Session 4: deal room granted-surface fetchers ══════════════════════════
// Migration 0026 extended portal_readonly with borrowers, income_calcs,
// ratio_calcs, and documents (16 granted tables total). These sections
// follow the attempt-and-fallback rule: query first, graceful state only
// on an actual permission refusal (isPermissionRefusal) or outage.

export interface BorrowerRow {
  id: string
  role: string
  fullName: string
  dob: string | null
  maritalStatus: string | null
  employment: unknown
}

export async function getDealBorrowers(agentId: string, dealId: string): Promise<UwResult<BorrowerRow[]>> {
  if (isDemoMode()) return demoResult(demoDealBorrowers(dealId))
  const res = await uwSelect<any>('borrowers', {
    select: 'id,role,full_name,dob,marital_status,employment',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'role.asc',
    limit: '20',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      role: r.role,
      fullName: r.full_name,
      dob: r.dob ?? null,
      maritalStatus: r.marital_status ?? null,
      employment: r.employment ?? null,
    })),
  )
}

export interface IncomeCalcRow {
  id: string
  borrowerId: string | null
  lenderSlug: string | null
  basis: string
  resultAnnual: number
  calcVersion: string
  inputsHash: string
  createdAt: string
}

export async function getDealIncomeCalcs(agentId: string, dealId: string): Promise<UwResult<IncomeCalcRow[]>> {
  if (isDemoMode()) return demoResult(demoDealIncomeCalcs(dealId))
  const res = await uwSelect<any>('income_calcs', {
    select: 'id,borrower_id,lender_slug,basis,result_annual,calc_version,inputs_hash,created_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'created_at.desc',
    limit: '100',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      borrowerId: r.borrower_id ?? null,
      lenderSlug: r.lender_slug ?? null,
      basis: r.basis,
      resultAnnual: Number(r.result_annual),
      calcVersion: r.calc_version,
      inputsHash: r.inputs_hash,
      createdAt: r.created_at,
    })),
  )
}

export interface RatioCalcRow {
  id: string
  lenderSlug: string | null
  qualRate: number | null
  pmtContract: number | null
  pmtStress: number | null
  gds: number | null
  tds: number | null
  ltv: number | null
  calcVersion: string
  inputsHash: string
  createdAt: string
}

export async function getDealRatioCalcs(agentId: string, dealId: string): Promise<UwResult<RatioCalcRow[]>> {
  if (isDemoMode()) return demoResult(demoDealRatioCalcs(dealId))
  const res = await uwSelect<any>('ratio_calcs', {
    select: 'id,lender_slug,qual_rate,pmt_contract,pmt_stress,gds,tds,ltv,calc_version,inputs_hash,created_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'created_at.desc',
    limit: '100',
  })
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      lenderSlug: r.lender_slug ?? null,
      qualRate: num(r.qual_rate),
      pmtContract: num(r.pmt_contract),
      pmtStress: num(r.pmt_stress),
      gds: num(r.gds),
      tds: num(r.tds),
      ltv: num(r.ltv),
      calcVersion: r.calc_version,
      inputsHash: r.inputs_hash,
      createdAt: r.created_at,
    })),
  )
}

export interface DocumentRow {
  id: string
  docType: string
  source: string
  receivedAt: string | null
  reviewStatus: string
  createdAt: string
}

export async function getDealDocuments(agentId: string, dealId: string): Promise<UwResult<DocumentRow[]>> {
  if (isDemoMode()) return demoResult(demoDealDocuments(dealId))
  const res = await uwSelect<any>('documents', {
    select: 'id,doc_type,source,received_at,review_status,created_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'created_at.desc',
    limit: '200',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      docType: r.doc_type,
      source: r.source,
      receivedAt: r.received_at ?? null,
      reviewStatus: r.review_status,
      createdAt: r.created_at,
    })),
  )
}

// ─── Session 4: rates browser, intel feed, directory ────────────────────────

export interface RateQuoteBrowserRow {
  id: string
  lenderSlug: string
  productClass: string
  variant: string | null
  termMonths: number
  rate: number | null
  rateType: 'fixed' | 'adjustable' | 'variable'
  primeVariance: number | null
  cashbackPct: number | null
  programNotes: string | null
  compBps: number | null
  asOfDate: string | null
  expiryDate: string | null
  status: string
}

export async function getRateQuoteBrowser(agentId: string): Promise<UwResult<RateQuoteBrowserRow[]>> {
  const res = await uwSelectAll<any>('rate_quotes', {
    select:
      'id,lender_slug,product_class,variant,term_months,rate,rate_type,prime_variance,cashback_pct,program_notes,comp_bps,as_of_date,expiry_date,status',
    agent_id: `eq.${agentId}`,
    status: 'in.(approved,superseded)',
    order: 'as_of_date.desc',
    limit: '5000',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      lenderSlug: r.lender_slug,
      productClass: r.product_class,
      variant: r.variant ?? null,
      termMonths: r.term_months,
      rate: numOrNull(r.rate),
      rateType: r.rate_type ?? 'fixed',
      primeVariance: numOrNull(r.prime_variance),
      cashbackPct: numOrNull(r.cashback_pct),
      programNotes: r.program_notes ?? null,
      compBps: numOrNull(r.comp_bps),
      asOfDate: r.as_of_date ?? null,
      expiryDate: r.expiry_date ?? null,
      status: r.status,
    })),
  )
}

// ─── Session 5: scenario-driven rates (full rows + approval provenance) ─────

// Every column the rate_quotes row stores (minus tenant plumbing), for the
// scenario levels: level 3 renders all of it, nothing invented. Since
// migration 0029: rate_type, prime_variance (signed, verbatim),
// cashback_pct, program_notes (verbatim printed conditions); rate is
// nullable behind the priced check.
export interface RateQuoteFullRow {
  id: string
  intelItemId: string
  lenderSlug: string
  productClass: string
  variant: string | null
  termMonths: number
  rate: number | null
  rateType: 'fixed' | 'adjustable' | 'variable'
  primeVariance: number | null
  cashbackPct: number | null
  programNotes: string | null
  compBps: number | null
  asOfDate: string | null
  expiryDate: string | null
  sourcePage: number
  sourceSnippet: string
  confidence: number
  status: string
  extractedBy: string
  createdAt: string
  reviewedAt: string | null
  approvedVia: string | null
  heldReason: string | null
  // Eligibility columns (fox-underwriting migration 0032). The approved book is
  // not backfilled yet (all null live 2026-07-12), so lib/eligibility.ts derives
  // from variant/programNotes and prefers these the moment they populate
  // (keyed on eligibilitySource). Fetched here so the preference works with no
  // further change when the workbench backfill lands.
  borrowerRequirement: string | null
  clientCommitment: string | null
  channelRequirement: string | null
  transactionTypes: string[] | null
  eligibilityUnknown: boolean
  eligibilitySource: string | null
}

export async function getRateQuotesFull(agentId: string): Promise<UwResult<RateQuoteFullRow[]>> {
  const res = await uwSelectAll<any>('rate_quotes', {
    select:
      'id,intel_item_id,lender_slug,product_class,variant,term_months,rate,rate_type,prime_variance,cashback_pct,program_notes,comp_bps,as_of_date,expiry_date,source_page,source_snippet,confidence,status,extracted_by,created_at,reviewed_at,approved_via,held_reason,borrower_requirement,client_commitment,channel_requirement,transaction_types,eligibility_unknown,eligibility_source',
    agent_id: `eq.${agentId}`,
    status: 'in.(approved,superseded)',
    order: 'as_of_date.desc',
    limit: '5000',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      intelItemId: r.intel_item_id,
      lenderSlug: r.lender_slug,
      productClass: r.product_class,
      variant: r.variant ?? null,
      termMonths: r.term_months,
      rate: numOrNull(r.rate),
      rateType: r.rate_type ?? 'fixed',
      primeVariance: numOrNull(r.prime_variance),
      cashbackPct: numOrNull(r.cashback_pct),
      programNotes: r.program_notes ?? null,
      compBps: numOrNull(r.comp_bps),
      asOfDate: r.as_of_date ?? null,
      expiryDate: r.expiry_date ?? null,
      sourcePage: r.source_page,
      sourceSnippet: r.source_snippet,
      confidence: Number(r.confidence),
      status: r.status,
      extractedBy: r.extracted_by,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at ?? null,
      approvedVia: r.approved_via ?? null,
      heldReason: r.held_reason ?? null,
      borrowerRequirement: r.borrower_requirement ?? null,
      clientCommitment: r.client_commitment ?? null,
      channelRequirement: r.channel_requirement ?? null,
      transactionTypes: Array.isArray(r.transaction_types) ? r.transaction_types : null,
      eligibilityUnknown: r.eligibility_unknown === true,
      eligibilitySource: r.eligibility_source ?? null,
    })),
  )
}

// Approval provenance for product detail: the sheet review behind
// approved_via='sheet:<review_id>', plus the matching audit entry
// (action rates.sheet_approved, joined by intel_item_id client-side; the
// gate writes intel_item_id, not review_id, into the detail).
export interface SheetProvenance {
  reviewId: string
  intelItemId: string
  decision: string
  decidedAt: string
  quotesTotal: number | null
  auditEntryId: string | null
  auditCreatedAt: string | null
}

export async function getSheetProvenance(
  agentId: string,
  reviewIds: string[],
): Promise<UwResult<Record<string, SheetProvenance>>> {
  if (reviewIds.length === 0) return { configured: true, ok: true, data: {} }
  const reviewsRes = await uwSelect<any>('rate_sheet_reviews', {
    select: 'id,intel_item_id,decision,decided_at,quotes_total',
    agent_id: `eq.${agentId}`,
    id: `in.(${reviewIds.join(',')})`,
    limit: '200',
  })
  if (!reviewsRes.configured || !reviewsRes.ok) return reviewsRes
  const auditRes = await uwSelect<any>('audit_log', {
    select: 'id,detail,created_at',
    agent_id: `eq.${agentId}`,
    action: 'eq.rates.sheet_approved',
    limit: '500',
  })
  const auditByIntelItem = new Map<string, { id: string; createdAt: string }>()
  if (auditRes.configured && auditRes.ok) {
    for (const a of auditRes.data) {
      const intel = a.detail?.intel_item_id
      if (typeof intel === 'string') auditByIntelItem.set(intel, { id: a.id, createdAt: a.created_at })
    }
  }
  return mapResult(reviewsRes, rows => {
    const out: Record<string, SheetProvenance> = {}
    for (const r of rows) {
      const audit = auditByIntelItem.get(r.intel_item_id) ?? null
      out[r.id] = {
        reviewId: r.id,
        intelItemId: r.intel_item_id,
        decision: r.decision,
        decidedAt: r.decided_at,
        quotesTotal: r.quotes_total ?? null,
        auditEntryId: audit?.id ?? null,
        auditCreatedAt: audit?.createdAt ?? null,
      }
    }
    return out
  })
}

export interface IntelItemRow {
  id: string
  lenderSlugGuess: string | null
  docClassGuess: string
  itemKind: string
  fileName: string | null
  messageText: string | null
  status: string
  receivedAt: string
  review: { decision: string; decidedAt: string; quotesTotal: number } | null
}

export async function getIntelItems(agentId: string): Promise<UwResult<IntelItemRow[]>> {
  if (isDemoMode()) return demoResult([])
  // Full history, paginated: coverage semantics need each lender's NEWEST
  // rates-class item, and a failing parser's newest item can be arbitrarily
  // old — a recent-N window would silently drop exactly the lenders the
  // coverage chips exist to name.
  const itemsRes = await uwSelectAll<any>('lender_intel_items', {
    select: 'id,lender_slug_guess,doc_class_guess,item_kind,file_name,message_text,status,received_at',
    agent_id: `eq.${agentId}`,
    order: 'received_at.desc',
  })
  if (!itemsRes.configured || !itemsRes.ok) return itemsRes
  try {
    // Agent-scoped, paginated, joined in memory: an in.(...) list over every
    // item id would grow the URL without bound as history accumulates.
    const reviewByItem = new Map<string, { decision: string; decidedAt: string; quotesTotal: number }>()
    if (itemsRes.data.length > 0) {
      const reviewsRes = await uwSelectAll<any>('rate_sheet_reviews', {
        select: 'intel_item_id,decision,decided_at,quotes_total',
        agent_id: `eq.${agentId}`,
      })
      if (reviewsRes.configured && reviewsRes.ok) {
        for (const rv of reviewsRes.data) {
          reviewByItem.set(rv.intel_item_id, {
            decision: rv.decision,
            decidedAt: rv.decided_at,
            quotesTotal: rv.quotes_total,
          })
        }
      }
    }
    return {
      configured: true,
      ok: true,
      data: itemsRes.data.map(r => ({
        id: r.id,
        lenderSlugGuess: r.lender_slug_guess ?? null,
        docClassGuess: r.doc_class_guess,
        itemKind: r.item_kind,
        fileName: r.file_name ?? null,
        messageText: r.message_text ?? null,
        status: r.status,
        receivedAt: r.received_at,
        review: reviewByItem.get(r.id) ?? null,
      })),
    }
  } catch {
    return { configured: true, ok: false, error: 'Workbench result had an unexpected shape' }
  }
}

// Sheet review decisions with their intel item joined: the changelog's
// "new sheets in force" events.
export interface SheetReviewEvent {
  id: string
  decision: string
  decidedAt: string
  quotesTotal: number
  lenderSlugGuess: string | null
  fileName: string | null
}

export async function getSheetReviewEvents(agentId: string, limit = 100): Promise<UwResult<SheetReviewEvent[]>> {
  if (isDemoMode()) return demoResult([])
  const res = await uwSelect<any>('rate_sheet_reviews', {
    select: 'id,decision,decided_at,quotes_total,lender_intel_items(lender_slug_guess,file_name)',
    agent_id: `eq.${agentId}`,
    order: 'decided_at.desc',
    limit: String(limit),
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      decision: r.decision,
      decidedAt: r.decided_at,
      quotesTotal: r.quotes_total,
      lenderSlugGuess: r.lender_intel_items?.lender_slug_guess ?? null,
      fileName: r.lender_intel_items?.file_name ?? null,
    })),
  )
}

export interface AgentRow {
  id: string
  name: string
  email: string
  fsraLicence: string
  officePhone: string | null
}

export async function getAgents(): Promise<UwResult<AgentRow[]>> {
  if (isDemoMode()) return demoResult([])
  const res = await uwSelect<any>('agents', {
    select: '*',
    order: 'name.asc',
    limit: '100',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      fsraLicence: r.fsra_licence,
      officePhone: r.office_phone ?? null,
    })),
  )
}

// Session 6: number_links, the learned call-triage directory (granted as
// the 17th table by fox-underwriting migration 0028). Numbers are stored
// as their last ten digits; render exactly as stored, never reconstructed
// into a full number the workbench does not hold.
export interface NumberLinkRow {
  id: string
  phoneLast10: string
  label: string | null
  source: string | null
  zohoContactId: string | null
  zohoPartnerId: string | null
  createdAt: string
}

export async function getNumberLinks(agentId: string): Promise<UwResult<NumberLinkRow[]>> {
  if (isDemoMode()) return demoResult([])
  const res = await uwSelect<any>('number_links', {
    select: 'id,phone_last10,label,source,zoho_contact_id,zoho_partner_id,created_at',
    agent_id: `eq.${agentId}`,
    order: 'created_at.desc',
    limit: '500',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      phoneLast10: String(r.phone_last10 ?? ''),
      label: r.label ?? null,
      source: r.source ?? null,
      zohoContactId: r.zoho_contact_id ?? null,
      zohoPartnerId: r.zoho_partner_id ?? null,
      createdAt: r.created_at,
    })),
  )
}

// ─── Audit log ──────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string
  createdAt: string
  actor: string
  actorClerkId: string | null
  actorEmail: string | null
  action: string
  dealId: string | null
  dealRef: string | null
  detail: unknown
}

export interface AuditFilters {
  // YYYY-MM-DD bounds interpreted in the practice timezone by the caller
  // (pass full ISO instants here).
  fromISO?: string
  toISO?: string
  actor?: string
  actionLike?: string
  dealId?: string
}

const auditRow = (r: any): AuditEntry => ({
  id: r.id,
  createdAt: r.created_at,
  actor: r.actor,
  actorClerkId: r.actor_clerk_id ?? null,
  actorEmail: r.actor_email ?? null,
  action: r.action,
  dealId: r.deal_id ?? null,
  dealRef: r.deals?.file_ref ?? null,
  detail: r.detail ?? null,
})

export async function getAuditEntries(
  agentId: string,
  filters: AuditFilters,
  limit: number,
  offset: number,
): Promise<UwResult<{ rows: AuditEntry[]; total: number | null }>> {
  if (isDemoMode()) {
    const rows = demoDeals.flatMap(d => demoDealAudit(d.id))
    return demoResult({ rows, total: rows.length })
  }
  const params: Record<string, string> = {
    select: 'id,created_at,actor,actor_clerk_id,actor_email,action,deal_id,detail,deals(file_ref)',
    agent_id: `eq.${agentId}`,
    order: 'created_at.desc',
    limit: String(limit),
    offset: String(offset),
  }
  if (filters.fromISO) params['created_at'] = `gte.${filters.fromISO}`
  if (filters.toISO) {
    // PostgREST allows one value per key through URLSearchParams; combine
    // range bounds with and=() when both are present.
    if (filters.fromISO) {
      delete params['created_at']
      params['and'] = `(created_at.gte.${filters.fromISO},created_at.lte.${filters.toISO})`
    } else {
      params['created_at'] = `lte.${filters.toISO}`
    }
  }
  if (filters.actor) params['actor'] = `eq.${filters.actor}`
  if (filters.actionLike) params['action'] = `ilike.*${filters.actionLike}*`
  if (filters.dealId) params['deal_id'] = `eq.${filters.dealId}`
  const res = await uwFetch<any>('audit_log', params, true)
  if (!res.configured || !res.ok) return res
  try {
    return {
      configured: true,
      ok: true,
      data: { rows: res.data.map(auditRow), total: res.total },
    }
  } catch {
    return { configured: true, ok: false, error: 'Workbench result had an unexpected shape' }
  }
}

export async function getDealAudit(agentId: string, dealId: string, limit = 25): Promise<UwResult<AuditEntry[]>> {
  if (isDemoMode()) return demoResult(demoDealAudit(dealId))
  const res = await uwSelect<any>('audit_log', {
    select: 'id,created_at,actor,actor_clerk_id,actor_email,action,deal_id,detail',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'created_at.desc',
    limit: String(limit),
  })
  return mapResult(res, rows => rows.map(auditRow))
}

// Resolve a deal file ref to its workbench id (audit viewer filter).
export async function getDealIdByFileRef(agentId: string, fileRef: string): Promise<UwResult<string | null>> {
  // Demo: resolve any (fictional) file ref to the first demo deal so a
  // search hit opens a demo deal room; no real workbench lookup runs.
  if (isDemoMode()) return demoResult(demoDeals[0]?.id ?? null)
  const res = await uwSelectAll<any>('deals', {
    select: 'id',
    agent_id: `eq.${agentId}`,
    file_ref: `eq.${fileRef}`,
    limit: '1',
  })
  return mapResult(res, rows => rows[0]?.id ?? null)
}

// Ask Fox: pending (extracted) quote counts by rate type, so the agent
// can say "N floating quotes await your approval" as a COUNT, never a
// quotable number. Pending rows are never served as rates anywhere.
export async function getPendingQuoteTypeCounts(
  agentId: string,
): Promise<UwResult<Record<string, number>>> {
  const res = await uwSelectAll<any>('rate_quotes', {
    select: 'rate_type',
    agent_id: `eq.${agentId}`,
    status: 'eq.extracted',
    limit: '5000',
  })
  return mapResult(res, rows => {
    const counts: Record<string, number> = {}
    for (const r of rows) {
      const t = r.rate_type ?? 'fixed'
      counts[t] = (counts[t] ?? 0) + 1
    }
    return counts
  })
}

export async function getRateQuoteStats(agentId: string): Promise<UwResult<RateQuoteStats>> {
  if (isDemoMode()) return demoResult(demoRateQuoteStats)
  const res = await uwSelectAll<any>('rate_quotes', {
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
