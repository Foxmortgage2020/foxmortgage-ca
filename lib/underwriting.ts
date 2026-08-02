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
import { conditionCounts, type ConditionCount } from '@/lib/conditions-status'
import {
  demoResult,
  demoDeals,
  demoDealDetail,
  demoDealConditions,
  demoPendingCommitmentConditions,
  demoConditionCountsByDeal,
  demoDealFlags,
  demoDealStatementDocs,
  demoDealShadowHistory,
  demoDealBorrowers,
  demoDealIncomeCalcs,
  demoDealRatioCalcs,
  demoDealDocuments,
  demoDealDocumentRequests,
  demoDealRequestReviews,
  demoDealRequestDecisions,
  demoDealLenderNotes,
  demoDealFinmoSnapshot,
  demoDealContextCounts,
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
  demoKnowledgeClaims,
  demoKnowledgeDocuments,
  demoKnowledgePageHits,
  demoRenewalDripQueue,
  demoRenewalSequenceStates,
  demoCommsQueue,
  demoCommsTimeline,
  demoCommsSettings,
} from '@/lib/demo-fixtures'
import { COMMS_TOUCH_KINDS, type CommsTouchKind, type CommsSettingsRow } from '@/lib/comms'
// The native task row shape and its column list live in a LEAF module, not in
// lib/gates.ts: this module is reached from the public client-file page, and
// importing the gates client here would pull it into that page's graph for the
// sake of one const. Both read paths return the identical projection.
import { TASK_ROW_SELECT, type TaskRow } from '@/lib/tasks-shape'

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
//
// `schema` sends Accept-Profile, which is how PostgREST reaches a non-public
// schema. Accept-Profile is a READ-side header only; its write-side twin is
// Content-Profile, which this module never sends because it never writes.
// Used for the September record layer (`rec`), read by the Deals (Beta) page.
async function uwFetch<T>(
  table: string,
  params: Record<string, string>,
  withCount = false,
  schema?: string,
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
    if (schema) headers['Accept-Profile'] = schema
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
    console.log(`[uw] ${schema ? schema + '.' : ''}${table} rows=${Array.isArray(data) ? data.length : 0} ms=${ms}`)
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
    // Phase B2: a pending (un-approved) commitment condition is not the
    // checklist, so it must not inflate the "N conditions open" card line.
    gate_status: 'eq.approved',
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
  // The submission decisions Finmo does not hold (finmo-substrate 0044).
  // Human-set, gated. targetLender is required before a note generates.
  targetLender: string | null
  targetLenderSetAt: string | null
  insuredStatus: 'insured' | 'insurable' | 'uninsured' | null
  insuredStatusSetAt: string | null
  rateOverride: number | null
  rateOverrideNote: string | null
  // When the Finmo document inventory was last pulled (migration 0049). Backs the
  // documents desk's "last checked N ago" line beside the Check-Finmo-now button.
  finmoDocsPulledAt: string | null
  createdAt: string
  updatedAt: string
}

export async function getDealDetail(agentId: string, dealId: string): Promise<UwResult<DealDetail | null>> {
  if (isDemoMode()) return demoResult(demoDealDetail(dealId))
  const res = await uwSelect<any>('deals', {
    select:
      'id,file_ref,deal_type,stage,status,purchase_price,mortgage_amount,closing_date,lender,product,zoho_potential_id,finmo_app_id,target_lender,target_lender_set_at,insured_status,insured_status_set_at,rate_override,rate_override_note,finmo_docs_pulled_at,created_at,updated_at',
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
      targetLender: r.target_lender ?? null,
      targetLenderSetAt: r.target_lender_set_at ?? null,
      insuredStatus: r.insured_status ?? null,
      insuredStatusSetAt: r.insured_status_set_at ?? null,
      rateOverride: r.rate_override !== null && r.rate_override !== undefined ? Number(r.rate_override) : null,
      rateOverrideNote: r.rate_override_note ?? null,
      finmoDocsPulledAt: r.finmo_docs_pulled_at ?? null,
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
  // Phase B2 (migration 0035): the commitment-conditions checklist axes.
  // `presence` is the machine's document-collection axis (needs_input up to
  // obtained; verified is a human tap); `presenceDetail` carries the recompute
  // outcome, including the matched Finmo document name. `docKind` is the closed
  // document-type vocabulary the matcher keys on; `borrowerId` groups per
  // borrower (null = General). `gateStatus` is the approval axis (a pending
  // commitment condition is not yet the checklist). verified_by/at record the
  // human verify; source_page/snippet/confidence are extraction provenance.
  // 'not_applicable' (fox-underwriting migration 0038): an UNDERWRITING
  // constraint ("TDS must be under 48%") is adjudicated, not a document chase —
  // never needs-input.
  presence: 'needs_input' | 'requested' | 'obtained' | 'verified' | 'not_applicable' | null
  presenceDetail: Record<string, unknown> | null
  docKind: string | null
  borrowerId: string | null
  gateStatus: 'pending' | 'approved' | 'rejected' | 'superseded'
  verifiedBy: string | null
  verifiedAt: string | null
  sourcePage: number | null
  sourceSnippet: string | null
  confidence: number | null
  // A condition whose satisfaction re-adjudicates the deal (an appraisal a plan
  // limit derives from), loud on the checklist (fox-underwriting migration 0038).
  loadBearing: boolean
  // The field names Michael set by hand (fox-underwriting migration 0039). A
  // non-empty list marks a condition whose owner/text/etc. came from him, not
  // the machine — the room shows an "edited" chip; a re-extraction never
  // overwrites these fields.
  humanEditedFields: string[]
  // The structured numeric requirement (fox-underwriting migration 0041): the
  // target the document-vs-requirement analysis compares against. Null when the
  // condition carries no numeric target. { kind, target, source, ... }; the card
  // shows the target and whether it is Michael's ('manual') or parsed.
  requirement: { kind?: string; target?: number; source?: string } | null
}

const CONDITION_SELECT =
  'id,text,owner,status,due_date,cond_number,source,evidence_ids,category,kind,precheck,presence,presence_detail,doc_kind,borrower_id,gate_status,verified_by,verified_at,source_page,source_snippet,confidence,load_bearing,human_edited_fields,requirement'

const dealConditionRow = (r: any): DealConditionRow => ({
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
  presence: r.presence ?? null,
  presenceDetail:
    r.presence_detail && typeof r.presence_detail === 'object'
      ? (r.presence_detail as Record<string, unknown>)
      : null,
  docKind: r.doc_kind ?? null,
  borrowerId: r.borrower_id ?? null,
  gateStatus: r.gate_status ?? 'approved',
  verifiedBy: r.verified_by ?? null,
  verifiedAt: r.verified_at ?? null,
  sourcePage: r.source_page ?? null,
  sourceSnippet: r.source_snippet ?? null,
  confidence: numOrNull(r.confidence),
  loadBearing: r.load_bearing === true,
  humanEditedFields: Array.isArray(r.human_edited_fields) ? (r.human_edited_fields as string[]) : [],
  requirement:
    r.requirement && typeof r.requirement === 'object'
      ? (r.requirement as { kind?: string; target?: number; source?: string })
      : null,
})

// LIVE conditions on a deal (Ask Fox and any general consumer): a pending,
// superseded, or rejected row is NOT a live condition and never renders as
// one. Legacy DP/internal/compliance conditions default to gate_status
// 'approved' so they stay visible; only the non-live gate states are excluded.
const LIVE_CONDITION_GATE = 'not.in.(superseded,rejected,pending)'
const isLiveGate = (g: string) => g !== 'superseded' && g !== 'rejected' && g !== 'pending'

export async function getDealConditions(agentId: string, dealId: string): Promise<UwResult<DealConditionRow[]>> {
  if (isDemoMode()) return demoResult(demoDealConditions(dealId).filter(c => isLiveGate(c.gateStatus)))
  const res = await uwSelect<any>('conditions', {
    select: CONDITION_SELECT,
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    gate_status: LIVE_CONDITION_GATE,
    order: 'due_date.asc.nullslast',
    limit: '300',
  })
  return mapResult(res, rows => rows.map(dealConditionRow))
}

// The room CHECKLIST: approved conditions from the commitment pipeline only
// (commitment + template-seeded). A pending commitment condition is invisible
// until the list gate approves it; legacy DP/internal/compliance conditions
// live in the deal room's other surfaces, not the commitment checklist.
// Manual conditions (fox-underwriting migration 0039) are their own source —
// added by hand, immediately on the working checklist — so they belong in the
// same population as commitment + template conditions.
export const CHECKLIST_SOURCES = 'in.(commitment,condition_template,manual)'
const isChecklistSource = (s: string) => s === 'commitment' || s === 'condition_template' || s === 'manual'

export async function getApprovedConditions(agentId: string, dealId: string): Promise<UwResult<DealConditionRow[]>> {
  if (isDemoMode()) {
    return demoResult(
      demoDealConditions(dealId).filter(c => c.gateStatus === 'approved' && isChecklistSource(c.source)),
    )
  }
  const res = await uwSelect<any>('conditions', {
    select: CONDITION_SELECT,
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    source: CHECKLIST_SOURCES,
    gate_status: 'eq.approved',
    order: 'due_date.asc.nullslast',
    limit: '300',
  })
  return mapResult(res, rows => rows.map(dealConditionRow))
}

// Conditions extracted from an uploaded commitment/amendment, awaiting the
// list gate. These are the approval banner's rows: enough to show the text,
// owner, doc_kind, and the source page + verbatim snippet Michael approves,
// grouped by their source document.
export interface PendingCommitmentCondition {
  id: string
  documentId: string | null
  condNumber: string | null
  text: string
  owner: string
  docKind: string | null
  borrowerId: string | null
  category: string | null
  kind: string | null
  sourcePage: number | null
  sourceSnippet: string | null
  confidence: number | null
  loadBearing: boolean
}

export async function getPendingCommitmentConditions(
  agentId: string,
  dealId: string,
): Promise<UwResult<PendingCommitmentCondition[]>> {
  if (isDemoMode()) return demoResult(demoPendingCommitmentConditions(dealId))
  const res = await uwSelect<any>('conditions', {
    select:
      'id,document_id,cond_number,text,owner,doc_kind,borrower_id,category,kind,source_page,source_snippet,confidence,load_bearing',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    source: 'eq.commitment',
    gate_status: 'eq.pending',
    order: 'document_id.asc,cond_number.asc',
    limit: '300',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      documentId: r.document_id ?? null,
      condNumber: r.cond_number ?? null,
      text: r.text,
      owner: r.owner,
      docKind: r.doc_kind ?? null,
      borrowerId: r.borrower_id ?? null,
      category: r.category ?? null,
      kind: r.kind ?? null,
      sourcePage: r.source_page ?? null,
      sourceSnippet: r.source_snippet ?? null,
      confidence: numOrNull(r.confidence),
      loadBearing: r.load_bearing === true,
    })),
  )
}

// Board-card counts: over the SAME population the room checklist renders
// (approved commitment + template conditions) per deal, the total, the
// collected set, and what remains outstanding, so the board "N of M" and the
// room progress line agree. The counting rule is the pure conditionCounts
// helper (lib/conditions-status.ts), unit-tested there.
export async function getConditionCountsByDeal(
  agentId: string,
): Promise<UwResult<Record<string, ConditionCount>>> {
  if (isDemoMode()) return demoResult(demoConditionCountsByDeal)
  const res = await uwSelectAll<any>('conditions', {
    select: 'deal_id,status,presence,owner',
    agent_id: `eq.${agentId}`,
    source: CHECKLIST_SOURCES,
    gate_status: 'eq.approved',
    limit: '1000',
  })
  // The board card reflects the work Michael owns — broker conditions (Task 2).
  return mapResult(res, rows =>
    conditionCounts(
      rows
        .filter(r => r.deal_id)
        .map(r => ({ dealId: r.deal_id as string, status: r.status, presence: r.presence ?? null, owner: r.owner ?? null })),
      { ownerScope: 'broker' },
    ),
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
  // The stable Finmo borrower id (migration 0046). Lets the documents desk group
  // a commitment condition's borrower into the same section as its Finmo document
  // requests (which carry borrower_finmo_id).
  finmoBorrowerId: string | null
  // The structured kinship field (migration 0046), for disambiguating
  // same-given-name borrower sections. Null when the application states none.
  relationship: string | null
}

export async function getDealBorrowers(agentId: string, dealId: string): Promise<UwResult<BorrowerRow[]>> {
  if (isDemoMode()) return demoResult(demoDealBorrowers(dealId))
  const res = await uwSelect<any>('borrowers', {
    select: 'id,role,full_name,dob,marital_status,employment,finmo_borrower_id,relationship',
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
      finmoBorrowerId: r.finmo_borrower_id ?? null,
      relationship: r.relationship ?? null,
    })),
  )
}

// ─── Finmo document REQUEST inventory (document_index, granted 0048) ─────────
// The per-deal Finmo document-request list — the UNIT the documents desk renders
// (B6.2). One row per Finmo request: name, borrower, status verbatim, the
// received-file count, and the requested/updated timestamps.
export interface DocumentRequestRow {
  finmoRequestId: string
  borrowerFinmoId: string | null
  borrowerName: string | null
  documentName: string
  status: string
  numberOfFiles: number | null
  hasSrc: boolean
  filename: string | null
  requestedAt: string | null
  finmoUpdatedAt: string | null
  // Task 4 (migration 0049): a request absent from Finmo's current list is marked
  // withdrawn (never hard-deleted). Non-null = a ghost the desk hides from the
  // active groups and shows under a per-borrower "Withdrawn (N)" expandable.
  withdrawnAt: string | null
}

export async function getDealDocumentRequests(agentId: string, dealId: string): Promise<UwResult<DocumentRequestRow[]>> {
  if (isDemoMode()) return demoResult(demoDealDocumentRequests(dealId))
  const res = await uwSelect<any>('document_index', {
    select:
      'finmo_request_id,borrower_finmo_id,borrower_name,document_name,status,number_of_files,has_src,filename,requested_at,finmo_updated_at,withdrawn_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'requested_at.asc.nullslast',
    limit: '200',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      finmoRequestId: r.finmo_request_id,
      borrowerFinmoId: r.borrower_finmo_id ?? null,
      borrowerName: r.borrower_name ?? null,
      documentName: r.document_name,
      status: r.status,
      numberOfFiles: r.number_of_files ?? null,
      hasSrc: !!r.has_src,
      filename: r.filename ?? null,
      requestedAt: r.requested_at ?? null,
      finmoUpdatedAt: r.finmo_updated_at ?? null,
      withdrawnAt: r.withdrawn_at ?? null,
    })),
  )
}

// ─── The client page's deal brief (B8a) ──────────────────────────────────────
// The client status page reads by ZOHO deal id, but the closing date and the
// document-request list live in the workbench. This resolves the workbench deal
// by its zoho_potential_id and hands back its id + Finmo-synced closing date.
// The Finmo close date is the truth: Zoho's Closing_Date is often empty on a
// refinance (F053107), so the client page prefers this and falls back to Zoho.
export interface ClientDealBrief {
  dealId: string
  closingDate: string | null
}

export async function getClientDealBrief(
  agentId: string,
  zohoPotentialId: string,
): Promise<UwResult<ClientDealBrief | null>> {
  if (isDemoMode()) return demoResult(null)
  const res = await uwSelect<any>('deals', {
    select: 'id,closing_date',
    agent_id: `eq.${agentId}`,
    zoho_potential_id: `eq.${zohoPotentialId}`,
    limit: '1',
  })
  return mapResult(res, rows => {
    const r = rows[0]
    return r ? { dealId: r.id as string, closingDate: (r.closing_date as string) ?? null } : null
  })
}

// ─── The AI request verdict + Michael's decision (migration 0049, B6.4) ──────
// The document analysis meets the document AT THE DOOR: for every stored document
// that resolves to a Finmo request, the workbench writes a cited verdict into
// document_request_reviews (one row per document — a multi-file request is N
// documents = N verdicts). The desk groups by finmo_request_id and shows the best
// per the rank flagged > questions > stale_cycle > passed. content_date is the
// freshness substrate the day-window layer consumes portal-side.

export type RequestVerdict = 'passed' | 'flagged' | 'questions' | 'stale_cycle'

export interface RequestReviewReason {
  code: string
  severity: 'high' | 'question' | 'advisory' | 'info' | string
  message: string
  citation: { page: number | null; snippet: string | null } | null
}

export interface RequestReviewRow {
  documentId: string
  finmoRequestId: string | null
  docKind: string | null
  borrowerId: string | null
  verdict: RequestVerdict
  reasons: RequestReviewReason[]
  contentDate: string | null
  contentDates: Record<string, string> | null
  analyzedAt: string | null
}

function reviewReason(r: any): RequestReviewReason {
  const cit = r && typeof r === 'object' && r.citation && typeof r.citation === 'object' ? r.citation : null
  return {
    code: typeof r?.code === 'string' ? r.code : '',
    severity: typeof r?.severity === 'string' ? r.severity : 'info',
    message: typeof r?.message === 'string' ? r.message : '',
    citation: cit
      ? {
          page: typeof cit.page === 'number' ? cit.page : null,
          snippet: typeof cit.snippet === 'string' ? cit.snippet : null,
        }
      : null,
  }
}

export async function getDealRequestReviews(agentId: string, dealId: string): Promise<UwResult<RequestReviewRow[]>> {
  if (isDemoMode()) return demoResult(demoDealRequestReviews(dealId))
  const res = await uwSelectAll<any>('document_request_reviews', {
    select: 'document_id,finmo_request_id,doc_kind,borrower_id,verdict,reasons,content_date,content_dates,analyzed_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'analyzed_at.asc.nullslast',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      documentId: r.document_id,
      finmoRequestId: r.finmo_request_id ?? null,
      docKind: r.doc_kind ?? null,
      borrowerId: r.borrower_id ?? null,
      verdict: (r.verdict as RequestVerdict) ?? 'passed',
      reasons: Array.isArray(r.reasons) ? r.reasons.map(reviewReason) : [],
      contentDate: r.content_date ?? null,
      contentDates:
        r.content_dates && typeof r.content_dates === 'object' ? (r.content_dates as Record<string, string>) : null,
      analyzedAt: r.analyzed_at ?? null,
    })),
  )
}

export interface RequestDecisionRow {
  finmoRequestId: string
  verdict: 'approved' | 'sent_back'
  note: string | null
  decidedByEmail: string | null
  decidedAt: string | null
}

export async function getDealRequestDecisions(agentId: string, dealId: string): Promise<UwResult<RequestDecisionRow[]>> {
  if (isDemoMode()) return demoResult(demoDealRequestDecisions(dealId))
  const res = await uwSelect<any>('document_request_decisions', {
    select: 'finmo_request_id,verdict,note,decided_by_email,decided_at',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    order: 'decided_at.desc',
    limit: '200',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      finmoRequestId: r.finmo_request_id,
      verdict: (r.verdict as 'approved' | 'sent_back') ?? 'approved',
      note: r.note ?? null,
      decidedByEmail: r.decided_by_email ?? null,
      decidedAt: r.decided_at ?? null,
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
  // 'real' (default) or 'synthetic'. A synthetic document is a stand-in that
  // must never be mistaken for a lender document (workbench guardrail 20); the
  // room renders it with a loud banner and it can never be approved.
  provenance: string
  // The borrower a document is attributed to (null = General). Set on upload;
  // drives the per-borrower presence match.
  borrowerId: string | null
  // The Finmo request this file satisfies (migration 0049, Task 3). Null = a
  // request-less document (an older credit report, a consent, a statement whose
  // request is gone) — the desk's "Not tied to a request" residual block.
  finmoRequestId: string | null
}

export async function getDealDocuments(agentId: string, dealId: string): Promise<UwResult<DocumentRow[]>> {
  if (isDemoMode()) return demoResult(demoDealDocuments(dealId))
  const res = await uwSelect<any>('documents', {
    select: 'id,doc_type,source,received_at,review_status,created_at,provenance,borrower_id,finmo_request_id',
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
      provenance: r.provenance ?? 'real',
      finmoRequestId: r.finmo_request_id ?? null,
      borrowerId: r.borrower_id ?? null,
    })),
  )
}

// The current submission-note DRAFT for a deal (lender-notes wiring session,
// 2026-07-15). Read-only through portal_readonly; the room renders it with a
// copy button. Only the newest draft is the current one (regeneration
// supersedes on the workbench, append-only).
export interface LenderNotesRow {
  id: string
  generatedText: string
  charCount: number | null
  model: string | null
  status: string
  source?: string
  createdAt: string
  createdByEmail: string | null
}

export async function getDealLenderNotes(agentId: string, dealId: string): Promise<UwResult<LenderNotesRow | null>> {
  if (isDemoMode()) return demoResult(demoDealLenderNotes(dealId))
  // The current note is the newest NON-superseded row: a generated draft OR a
  // human_edited row (an in-place edit supersedes the draft; both survive).
  const res = await uwSelect<any>('lender_notes', {
    select: 'id,generated_text,char_count,model,status,source,created_at,created_by_email',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    status: 'in.(draft,human_edited)',
    order: 'created_at.desc',
    limit: '1',
  })
  return mapResult(res, rows => {
    const r = rows[0]
    if (!r) return null
    return {
      id: r.id,
      generatedText: r.generated_text,
      charCount: r.char_count ?? null,
      model: r.model ?? null,
      status: r.status,
      source: r.source ?? 'generated',
      createdAt: r.created_at,
      createdByEmail: r.created_by_email ?? null,
    }
  })
}

// ─── Finmo application snapshot + context counts (finmo-substrate 0044) ──────

export interface FinmoSnapshotRow {
  pulledAt: string
  mapped: Record<string, unknown>
}

/** The current Finmo application snapshot for the deal (for the readiness strip
 * "pulled N hours ago" and the mapped view). */
export async function getDealFinmoSnapshot(agentId: string, dealId: string): Promise<UwResult<FinmoSnapshotRow | null>> {
  if (isDemoMode()) return demoResult(demoDealFinmoSnapshot(dealId))
  const res = await uwSelect<any>('finmo_app_snapshots', {
    select: 'pulled_at,mapped',
    agent_id: `eq.${agentId}`,
    deal_id: `eq.${dealId}`,
    status: 'eq.current',
    order: 'pulled_at.desc',
    limit: '1',
  })
  return mapResult(res, rows => {
    const r = rows[0]
    if (!r) return null
    return { pulledAt: r.pulled_at, mapped: (r.mapped ?? {}) as Record<string, unknown> }
  })
}

export interface DealContextCounts {
  calls: number
  emails: number
}

const EMAIL_WINDOW_DAYS = 180
const CALL_WINDOW_DAYS = 60

/**
 * COUNTS ONLY of the deal's linked calls and emails, for the readiness strip.
 * The portal reads NO content here — call/email content is intent-only
 * (guardrail 11) and is never rendered; only id columns are selected.
 *
 * The bridge (workbench migration 0045): items are reached via the deal's
 * borrowers' STABLE Zoho contact ids UNIONED with the deal id — so a churned
 * deal id (the re-created BRXM-F059751 Zoho record) still finds the correspondence via
 * contact. Calls windowed to 60 days; emails to since deal creation, floored to
 * 180 days so a re-created deal does not drop older correspondence.
 */
export async function getDealContextCounts(agentId: string, dealId: string, zohoPotentialId: string | null, createdAt: string | null = null): Promise<UwResult<DealContextCounts>> {
  if (isDemoMode()) return demoResult(demoDealContextCounts(dealId))

  // The deal's borrowers' contact ids (the bridge). Propagate a not-connected /
  // error result rather than reporting 0/0 as if the workbench answered.
  const bRes = await uwSelect<any>('borrowers', { select: 'zoho_contact_id', agent_id: `eq.${agentId}`, deal_id: `eq.${dealId}`, zoho_contact_id: 'not.is.null' })
  if (!bRes.configured || !bRes.ok) return bRes as UwResult<DealContextCounts>
  // Only safe tokens reach the interpolated PostgREST .or() filter (a comma/dot
  // /paren in an id would break the filter or match unintended rows).
  const safeId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v)
  const contactIds = Array.from(new Set(bRes.data.map(r => r.zoho_contact_id).filter(safeId))) as string[]

  const now = Date.now()
  const callCutoff = new Date(now - CALL_WINDOW_DAYS * 86_400_000).toISOString()
  const floor = new Date(now - EMAIL_WINDOW_DAYS * 86_400_000).toISOString()
  const emailSince = createdAt && createdAt < floor ? createdAt : floor

  const orExpr = (dealKey: string, dealCol: string): string | null => {
    const parts: string[] = []
    if (contactIds.length) parts.push(`contact_zoho_id.in.(${contactIds.join(',')})`)
    if (dealKey && /^[A-Za-z0-9_-]{1,64}$/.test(dealKey)) parts.push(`${dealCol}.eq.${dealKey}`)
    return parts.length ? `(${parts.join(',')})` : null
  }

  const callOr = orExpr(dealId, 'deal_id')
  let calls = 0
  if (callOr) {
    const callsRes = await uwSelect<any>('call_transcripts', { select: 'id', agent_id: `eq.${agentId}`, or: callOr, started_at: `gte.${callCutoff}` })
    if (callsRes.configured && callsRes.ok) calls = callsRes.data.length
  }

  const emailOr = orExpr(zohoPotentialId ?? '', 'deal_zoho_id')
  let emails = 0
  if (emailOr) {
    const emRes = await uwSelect<any>('email_messages', { select: 'id', agent_id: `eq.${agentId}`, or: emailOr, sent_at: `gte.${emailSince}` })
    if (emRes.configured && emRes.ok) emails = emRes.data.length
  }

  return { configured: true, ok: true, data: { calls, emails } }
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

// The approved+superseded book is agent-scoped and identical across scenario
// and select params, so a short in-process cache lets a single page visit (with
// its many param-driven server re-renders, plus the 60s notification-bell poll)
// read it once instead of paginating ~1,257 rows on every navigation (the
// input-commit follow-up). Failures are never cached; the 2-minute TTL matches
// the house norm (slimDealsCache) so a freshly-approved sheet shows within two
// minutes. Proven in tests/rate-quotes-cache.test.ts.
const rateQuotesFullCache = createCache<string, RateQuoteFullRow[]>({ max: 4, ttlMs: 2 * 60 * 1000 })

export async function getRateQuotesFull(agentId: string): Promise<UwResult<RateQuoteFullRow[]>> {
  const cached = rateQuotesFullCache.get(agentId)
  if (cached !== undefined) return { configured: true, ok: true, data: cached }
  const res = await uwSelectAll<any>('rate_quotes', {
    select:
      'id,intel_item_id,lender_slug,product_class,variant,term_months,rate,rate_type,prime_variance,cashback_pct,program_notes,comp_bps,as_of_date,expiry_date,source_page,source_snippet,confidence,status,extracted_by,created_at,reviewed_at,approved_via,held_reason,borrower_requirement,client_commitment,channel_requirement,transaction_types,eligibility_unknown,eligibility_source',
    agent_id: `eq.${agentId}`,
    status: 'in.(approved,superseded)',
    order: 'as_of_date.desc',
    limit: '5000',
  })
  const mapped = mapResult(res, rows =>
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
  if (mapped.configured && mapped.ok) rateQuotesFullCache.set(agentId, mapped.data)
  return mapped
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

// ─── Lender knowledge claims (knowledge pipeline session) ───────────────────
// lender_knowledge_claims is a granted SELECT surface: AI-extracted claims
// from uploaded lender documents, citable ONLY once Michael approves them
// through the gates API. Pending rows render as counts and queue cards,
// never as knowledge. Knowledge documents live in the documents table with
// deal_id NULL (they are lender reference material, not deal files).

export interface KnowledgeClaimRow {
  id: string
  lenderSlug: string
  program: string | null
  topic: string
  claimKey: string
  claimValue: unknown
  claimText: string
  sourceDocumentId: string | null
  sourcePage: number | null
  sourceSnippet: string | null
  asOfDate: string | null
  asOfSource: string | null
  status: 'pending' | 'approved'
  confidence: number | null
  extractedBy: string | null
  createdAt: string
  decidedAt: string | null
}

const knowledgeClaimRow = (r: any): KnowledgeClaimRow => ({
  id: r.id,
  lenderSlug: r.lender_slug,
  program: r.program ?? null,
  topic: r.topic,
  claimKey: r.claim_key,
  claimValue: r.claim_value ?? null,
  claimText: r.claim_text,
  sourceDocumentId: r.source_document_id ?? null,
  sourcePage: r.source_page ?? null,
  sourceSnippet: r.source_snippet ?? null,
  asOfDate: r.as_of_date ?? null,
  asOfSource: r.as_of_source ?? null,
  status: r.status,
  confidence: numOrNull(r.confidence),
  extractedBy: r.extracted_by ?? null,
  createdAt: r.created_at,
  decidedAt: r.decided_at ?? null,
})

const KNOWLEDGE_CLAIM_SELECT =
  'id,lender_slug,program,topic,claim_key,claim_value,claim_text,source_document_id,source_page,source_snippet,as_of_date,as_of_source,status,confidence,extracted_by,created_at,decided_at'

// One lender's approved + pending claims: approved render as knowledge with
// citations, pending render only as a count pointing at the approvals tab.
export async function getKnowledgeClaims(
  agentId: string,
  lenderSlug: string,
): Promise<UwResult<KnowledgeClaimRow[]>> {
  if (isDemoMode()) return demoResult(demoKnowledgeClaims.filter(c => c.lenderSlug === lenderSlug))
  const res = await uwSelectAll<any>('lender_knowledge_claims', {
    select: KNOWLEDGE_CLAIM_SELECT,
    agent_id: `eq.${agentId}`,
    lender_slug: `eq.${lenderSlug}`,
    status: 'in.(approved,pending)',
    order: 'topic.asc,claim_key.asc',
  })
  return mapResult(res, rows => rows.map(knowledgeClaimRow))
}

// Every pending claim across lenders — the approvals tab queue.
export async function getKnowledgeClaimQueue(agentId: string): Promise<UwResult<KnowledgeClaimRow[]>> {
  if (isDemoMode()) return demoResult(demoKnowledgeClaims.filter(c => c.status === 'pending'))
  const res = await uwSelectAll<any>('lender_knowledge_claims', {
    select: KNOWLEDGE_CLAIM_SELECT,
    agent_id: `eq.${agentId}`,
    status: 'eq.pending',
    order: 'lender_slug.asc,source_document_id.asc,claim_key.asc',
  })
  return mapResult(res, rows => rows.map(knowledgeClaimRow))
}

export interface KnowledgeDocumentRow {
  id: string
  docType: string
  knowledgeKind: string | null
  knowledgeStatus: 'uploaded' | 'processing' | 'extracted' | 'extraction_failed' | 'no_claims' | null
  knowledgeError: string | null
  receivedAt: string | null
  lenderSlug: string | null
}

// Knowledge documents: deal_id IS NULL marks a lender knowledge upload,
// distinct from every deal-attached document.
export async function getKnowledgeDocuments(
  agentId: string,
  lenderSlug?: string,
): Promise<UwResult<KnowledgeDocumentRow[]>> {
  if (isDemoMode()) {
    return demoResult(
      lenderSlug ? demoKnowledgeDocuments.filter(d => d.lenderSlug === lenderSlug) : demoKnowledgeDocuments,
    )
  }
  const params: Record<string, string> = {
    select: 'id,doc_type,knowledge_kind,knowledge_status,knowledge_error,received_at,lender_slug',
    agent_id: `eq.${agentId}`,
    deal_id: 'is.null',
    order: 'received_at.desc',
  }
  if (lenderSlug) params.lender_slug = `eq.${lenderSlug}`
  const res = await uwSelectAll<any>('documents', params)
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      docType: r.doc_type,
      knowledgeKind: r.knowledge_kind ?? null,
      knowledgeStatus: r.knowledge_status ?? null,
      knowledgeError: r.knowledge_error ?? null,
      receivedAt: r.received_at ?? null,
      lenderSlug: r.lender_slug ?? null,
    })),
  )
}

export interface KnowledgePageHit {
  documentId: string
  pageNo: number
  snippet: string
}

// PostgREST ilike patterns treat % _ * and the reserved list syntax as
// operators; a search term is plain words, so anything else becomes a space.
function sanitizeIlikeTerm(query: string): string {
  return query.replace(/[%_*,()\\."']/g, ' ').replace(/\s+/g, ' ').trim()
}

// A 240-character window around the first case-insensitive match, so the
// caller renders context, never the whole redacted page.
function snippetAround(text: string, term: string): string {
  const idx = text.toLowerCase().indexOf(term.toLowerCase())
  if (idx < 0) return text.slice(0, 240)
  const start = Math.max(0, idx - Math.floor((240 - term.length) / 2))
  return text.slice(start, start + 240)
}

// Full-text-ish search over a lender's knowledge document pages (redacted
// text only, exactly as stored). Two steps because document_pages carries
// no lender column: knowledge documents for the lender first, then pages
// whose text matches. Bounded to 5 hits — this is a citation finder, not a
// reader.
export async function searchKnowledgePages(
  agentId: string,
  lenderSlug: string,
  query: string,
): Promise<UwResult<KnowledgePageHit[]>> {
  if (isDemoMode()) return demoResult(demoKnowledgePageHits)
  const term = sanitizeIlikeTerm(query)
  if (!term) return { configured: true, ok: true, data: [] }
  const docsRes = await getKnowledgeDocuments(agentId, lenderSlug)
  if (!docsRes.configured || !docsRes.ok) return docsRes
  const docIds = docsRes.data.map(d => d.id)
  if (docIds.length === 0) return { configured: true, ok: true, data: [] }
  const res = await uwSelect<any>('document_pages', {
    select: 'document_id,page_no,text_redacted',
    agent_id: `eq.${agentId}`,
    document_id: `in.(${docIds.join(',')})`,
    text_redacted: `ilike.*${term}*`,
    order: 'document_id.asc,page_no.asc',
    limit: '5',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      documentId: r.document_id,
      pageNo: r.page_no,
      snippet: snippetAround(String(r.text_redacted ?? ''), term),
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

// ─── Renewal drip (2026-07-16) ───────────────────────────────────────────────
// The approval desk's READ side: pending/held touches with their current
// draft + per-sentence provenance (sources_snapshot), and a per-Zoho-deal
// sequence-state map for the Radar cards and the deal room. All through
// portal_readonly (migration 0047 grants); demo mode returns canned fixtures
// (zero reads).

export interface RenewalDripSentence {
  text: string
  source: string
}

export interface RenewalDripQueueItem {
  touchId: string
  sequenceId: string
  skeletonId: string
  status: 'pending_approval' | 'held'
  heldReason: string | null
  scheduledFor: string | null
  clientName: string | null
  firstName: string | null
  clientEmail: string | null
  zohoDealId: string
  maturityDate: string
  subject: string
  body: string
  sentences: RenewalDripSentence[]
  dropped: { text: string; reason: string }[]
  pins: Record<string, { value: string; source: string } | null>
  skeletonHash: string | null
  draftSource: 'generated' | 'human_edited'
}

export interface RenewalSequenceState {
  sequenceId: string
  zohoDealId: string
  status: string
  exitReason: string | null
  maturityDate: string
  clientName: string | null
  nextTouch: { skeletonId: string; scheduledFor: string | null; status: string } | null
  sentCount: number
}

export async function getRenewalDripQueue(agentId: string): Promise<UwResult<RenewalDripQueueItem[]>> {
  if (isDemoMode()) return demoResult(demoRenewalDripQueue)
  if (!workbenchConfigured()) return { configured: false }
  const touches = await uwSelectAll<{
    id: string; sequence_id: string; skeleton_id: string; status: string
    held_reason: string | null; scheduled_for: string | null
  }>('renewal_touches', {
    select: 'id,sequence_id,skeleton_id,status,held_reason,scheduled_for',
    agent_id: `eq.${agentId}`,
    status: 'in.(pending_approval,held)',
    order: 'scheduled_for.asc',
  })
  if (!touches.configured || !touches.ok) return touches
  if (!touches.data.length) return { configured: true, ok: true, data: [] }

  const seqIds = Array.from(new Set(touches.data.map((t) => t.sequence_id)))
  const seqs = await uwSelectAll<{
    id: string; zoho_deal_id: string; client_name: string | null; first_name: string | null
    client_email: string | null; maturity_date: string; touch_kind: string | null
  }>('renewal_sequences', {
    select: 'id,zoho_deal_id,client_name,first_name,client_email,maturity_date,touch_kind',
    agent_id: `eq.${agentId}`,
    id: `in.(${seqIds.join(',')})`,
  })
  if (!seqs.configured || !seqs.ok) return seqs
  // B7-P: the touches + drafts tables are shared with the client-comms engine
  // (migration 0050). This desk is the RENEWAL desk, so drop any touch whose
  // sequence is a comms kind — those belong to the Approvals comms queue.
  const seqById = new Map(seqs.data.filter((s) => (s.touch_kind ?? 'renewal') === 'renewal').map((s) => [s.id, s]))

  const touchIds = touches.data.map((t) => t.id)
  const drafts = await uwSelectAll<{
    touch_id: string; subject: string; body: string; source: string
    sources_snapshot: Record<string, unknown> | null
  }>('renewal_touch_drafts', {
    select: 'touch_id,subject,body,source,sources_snapshot',
    agent_id: `eq.${agentId}`,
    touch_id: `in.(${touchIds.join(',')})`,
    status: 'eq.draft',
  })
  if (!drafts.configured || !drafts.ok) return drafts
  const draftByTouch = new Map(drafts.data.map((d) => [d.touch_id, d]))

  const items: RenewalDripQueueItem[] = []
  for (const t of touches.data) {
    const seq = seqById.get(t.sequence_id)
    const draft = draftByTouch.get(t.id)
    if (!seq || !draft) continue
    const snap = (draft.sources_snapshot ?? {}) as {
      skeleton_hash?: string
      pins?: Record<string, { value: string; source: string } | null>
      personalization?: { sentences?: RenewalDripSentence[]; dropped?: { text: string; reason: string }[] }
    }
    items.push({
      touchId: t.id,
      sequenceId: t.sequence_id,
      skeletonId: t.skeleton_id,
      status: t.status as 'pending_approval' | 'held',
      heldReason: t.held_reason,
      scheduledFor: t.scheduled_for,
      clientName: seq.client_name,
      firstName: seq.first_name,
      clientEmail: seq.client_email,
      zohoDealId: seq.zoho_deal_id,
      maturityDate: seq.maturity_date,
      subject: draft.subject,
      body: draft.body,
      sentences: snap.personalization?.sentences ?? [],
      dropped: snap.personalization?.dropped ?? [],
      pins: snap.pins ?? {},
      skeletonHash: snap.skeleton_hash ?? null,
      draftSource: draft.source === 'human_edited' ? 'human_edited' : 'generated',
    })
  }
  return { configured: true, ok: true, data: items }
}

export async function getRenewalSequenceStates(agentId: string): Promise<UwResult<RenewalSequenceState[]>> {
  if (isDemoMode()) return demoResult(demoRenewalSequenceStates)
  if (!workbenchConfigured()) return { configured: false }
  const seqs = await uwSelectAll<{
    id: string; zoho_deal_id: string; status: string; exit_reason: string | null
    maturity_date: string; client_name: string | null
  }>('renewal_sequences', {
    select: 'id,zoho_deal_id,status,exit_reason,maturity_date,client_name',
    agent_id: `eq.${agentId}`,
    // B7-P: renewal sequences only — the comms engine shares this table.
    touch_kind: 'eq.renewal',
  })
  if (!seqs.configured || !seqs.ok) return seqs
  if (!seqs.data.length) return { configured: true, ok: true, data: [] }
  const touches = await uwSelectAll<{
    sequence_id: string; skeleton_id: string; scheduled_for: string | null; status: string
  }>('renewal_touches', {
    select: 'sequence_id,skeleton_id,scheduled_for,status',
    agent_id: `eq.${agentId}`,
    order: 'scheduled_for.asc',
  })
  if (!touches.configured || !touches.ok) return touches
  const byBySeq = new Map<string, { skeleton_id: string; scheduled_for: string | null; status: string }[]>()
  for (const t of touches.data) {
    byBySeq.set(t.sequence_id, [...(byBySeq.get(t.sequence_id) ?? []), t])
  }
  const states: RenewalSequenceState[] = seqs.data.map((s) => {
    const ts = byBySeq.get(s.id) ?? []
    const next = ts.find((t) => ['scheduled', 'drafted', 'pending_approval', 'held', 'approved'].includes(t.status)) ?? null
    return {
      sequenceId: s.id,
      zohoDealId: s.zoho_deal_id,
      status: s.status,
      exitReason: s.exit_reason,
      maturityDate: s.maturity_date,
      clientName: s.client_name,
      nextTouch: next ? { skeletonId: next.skeleton_id, scheduledFor: next.scheduled_for, status: next.status } : null,
      sentCount: ts.filter((t) => t.status === 'sent').length,
    }
  })
  return { configured: true, ok: true, data: states }
}

// ─── Client comms (B7-P, 2026-07-18) ─────────────────────────────────────────
// The read side of the comms desk: the pending-approval queue, a per-deal
// timeline, and the settings + suppression list. All through portal_readonly
// (0047 grants + comms_suppressions from 0050); demo returns canned fixtures
// (zero reads). Every send remains the workbench's, individually approved.

export interface CommsQueueItem {
  touchId: string
  sequenceId: string
  zohoDealId: string
  touchKind: CommsTouchKind
  skeletonId: string
  status: 'pending_approval' | 'held'
  heldReason: string | null
  scheduledFor: string | null
  createdAt: string | null
  clientName: string | null
  firstName: string | null
  clientEmail: string | null
  subject: string
  body: string
  // Deterministic-template provenance (the comms drafts are string substitution,
  // not a model): which merge fields filled, and the copy-gate verdict.
  mergeFields: string[]
  copyGate: string | null
  draftSource: 'generated' | 'human_edited'
}

export async function getCommsQueue(agentId: string): Promise<UwResult<CommsQueueItem[]>> {
  if (isDemoMode()) return demoResult(demoCommsQueue)
  if (!workbenchConfigured()) return { configured: false }
  // 1) The agent's comms sequences (the 4 comms kinds only; renewal excluded).
  const seqs = await uwSelectAll<{
    id: string; zoho_deal_id: string; touch_kind: string
    client_name: string | null; first_name: string | null; client_email: string | null
  }>('renewal_sequences', {
    select: 'id,zoho_deal_id,touch_kind,client_name,first_name,client_email',
    agent_id: `eq.${agentId}`,
    touch_kind: `in.(${COMMS_TOUCH_KINDS.join(',')})`,
  })
  if (!seqs.configured || !seqs.ok) return seqs
  if (!seqs.data.length) return { configured: true, ok: true, data: [] }
  const seqById = new Map(seqs.data.map((s) => [s.id, s]))
  const seqIds = seqs.data.map((s) => s.id)

  // 2) Pending / held touches on those sequences.
  const touches = await uwSelectAll<{
    id: string; sequence_id: string; skeleton_id: string; status: string
    held_reason: string | null; scheduled_for: string | null; created_at: string | null
  }>('renewal_touches', {
    select: 'id,sequence_id,skeleton_id,status,held_reason,scheduled_for,created_at',
    agent_id: `eq.${agentId}`,
    sequence_id: `in.(${seqIds.join(',')})`,
    status: 'in.(pending_approval,held)',
    order: 'scheduled_for.asc',
  })
  if (!touches.configured || !touches.ok) return touches
  if (!touches.data.length) return { configured: true, ok: true, data: [] }

  // 3) The current draft per touch.
  const touchIds = touches.data.map((t) => t.id)
  const drafts = await uwSelectAll<{
    touch_id: string; subject: string; body: string; source: string
    sources_snapshot: Record<string, unknown> | null
  }>('renewal_touch_drafts', {
    select: 'touch_id,subject,body,source,sources_snapshot',
    agent_id: `eq.${agentId}`,
    touch_id: `in.(${touchIds.join(',')})`,
    status: 'eq.draft',
  })
  if (!drafts.configured || !drafts.ok) return drafts
  const draftByTouch = new Map(drafts.data.map((d) => [d.touch_id, d]))

  const items: CommsQueueItem[] = []
  for (const t of touches.data) {
    const seq = seqById.get(t.sequence_id)
    const draft = draftByTouch.get(t.id)
    if (!seq || !draft) continue
    const snap = (draft.sources_snapshot ?? {}) as { merge_fields?: string[]; copy_gate?: string }
    items.push({
      touchId: t.id,
      sequenceId: t.sequence_id,
      zohoDealId: seq.zoho_deal_id,
      touchKind: seq.touch_kind as CommsTouchKind,
      skeletonId: t.skeleton_id,
      status: t.status as 'pending_approval' | 'held',
      heldReason: t.held_reason,
      scheduledFor: t.scheduled_for,
      createdAt: t.created_at,
      clientName: seq.client_name,
      firstName: seq.first_name,
      clientEmail: seq.client_email,
      subject: draft.subject,
      body: draft.body,
      mergeFields: Array.isArray(snap.merge_fields) ? snap.merge_fields : [],
      copyGate: typeof snap.copy_gate === 'string' ? snap.copy_gate : null,
      draftSource: draft.source === 'human_edited' ? 'human_edited' : 'generated',
    })
  }
  return { configured: true, ok: true, data: items }
}

export interface CommsTimelineTouch {
  skeletonId: string
  touchKind: CommsTouchKind
  status: string
  scheduledFor: string | null
  sentAt: string | null
  sentMode: string | null
}
export interface CommsSuppressionInfo {
  clientEmail: string
  reason: string
  source: string
  suppressedAt: string
}
export interface CommsTimeline {
  hasSequences: boolean
  sent: CommsTimelineTouch[]
  pending: CommsTimelineTouch[]
  suppression: CommsSuppressionInfo | null
}

export async function getDealCommsTimeline(
  agentId: string,
  zohoDealId: string | null,
): Promise<UwResult<CommsTimeline>> {
  if (isDemoMode()) return demoResult(demoCommsTimeline)
  if (!workbenchConfigured()) return { configured: false }
  const empty: CommsTimeline = { hasSequences: false, sent: [], pending: [], suppression: null }
  if (!zohoDealId) return { configured: true, ok: true, data: empty }
  const seqs = await uwSelectAll<{ id: string; touch_kind: string; client_email: string | null }>(
    'renewal_sequences',
    {
      select: 'id,touch_kind,client_email',
      agent_id: `eq.${agentId}`,
      zoho_deal_id: `eq.${zohoDealId}`,
      touch_kind: `in.(${COMMS_TOUCH_KINDS.join(',')})`,
    },
  )
  if (!seqs.configured || !seqs.ok) return seqs
  if (!seqs.data.length) return { configured: true, ok: true, data: empty }
  const kindBySeq = new Map(seqs.data.map((s) => [s.id, s.touch_kind]))
  const seqIds = seqs.data.map((s) => s.id)
  const touches = await uwSelectAll<{
    sequence_id: string; skeleton_id: string; status: string
    scheduled_for: string | null; sent_at: string | null; send_mode: string | null
  }>('renewal_touches', {
    select: 'sequence_id,skeleton_id,status,scheduled_for,sent_at,send_mode',
    agent_id: `eq.${agentId}`,
    sequence_id: `in.(${seqIds.join(',')})`,
    order: 'scheduled_for.asc',
  })
  if (!touches.configured || !touches.ok) return touches
  const mapTouch = (t: {
    sequence_id: string; skeleton_id: string; status: string
    scheduled_for: string | null; sent_at: string | null; send_mode: string | null
  }): CommsTimelineTouch => ({
    skeletonId: t.skeleton_id,
    touchKind: (kindBySeq.get(t.sequence_id) ?? 'stage_update') as CommsTouchKind,
    status: t.status,
    scheduledFor: t.scheduled_for,
    sentAt: t.sent_at,
    sentMode: t.send_mode,
  })
  const sent = touches.data.filter((t) => t.status === 'sent').map(mapTouch)
  const pending = touches.data.filter((t) => t.status === 'pending_approval' || t.status === 'held').map(mapTouch)
  const emails = Array.from(new Set(seqs.data.map((s) => s.client_email).filter((e): e is string => Boolean(e))))
  let suppression: CommsSuppressionInfo | null = null
  if (emails.length) {
    const sup = await uwSelectAll<{ client_email: string; reason: string; source: string; suppressed_at: string }>(
      'comms_suppressions',
      {
        select: 'client_email,reason,source,suppressed_at',
        agent_id: `eq.${agentId}`,
        client_email: `in.(${emails.map((e) => `"${e}"`).join(',')})`,
      },
    )
    if (sup.configured && sup.ok && sup.data.length) {
      const s = sup.data[0]!
      suppression = { clientEmail: s.client_email, reason: s.reason, source: s.source, suppressedAt: s.suppressed_at }
    }
  }
  return { configured: true, ok: true, data: { hasSequences: true, sent, pending, suppression } }
}

export interface CommsSettingsRead {
  // The raw settings row (or null when no row exists — the dark-by-absence
  // state the fail-closed read model, deriveCommsSettings, treats as OFF).
  settings: CommsSettingsRow | null
  suppressions: CommsSuppressionInfo[]
}

export async function getCommsSettings(agentId: string): Promise<UwResult<CommsSettingsRead>> {
  if (isDemoMode()) return demoResult(demoCommsSettings)
  if (!workbenchConfigured()) return { configured: false }
  const settingsR = await uwSelectAll<CommsSettingsRow>('renewal_settings', {
    select: 'comms_enabled,comms_mailing_address,comms_max_per_client_per_day,comms_max_per_client_per_week',
    agent_id: `eq.${agentId}`,
  })
  if (!settingsR.configured || !settingsR.ok) return settingsR
  const settings = settingsR.data[0] ?? null
  const supR = await uwSelectAll<{ client_email: string; reason: string; source: string; suppressed_at: string }>(
    'comms_suppressions',
    {
      select: 'client_email,reason,source,suppressed_at',
      agent_id: `eq.${agentId}`,
      order: 'suppressed_at.desc',
    },
  )
  if (!supR.configured || !supR.ok) return supR
  const suppressions = supR.data.map((s) => ({
    clientEmail: s.client_email,
    reason: s.reason,
    source: s.source,
    suppressedAt: s.suppressed_at,
  }))
  return { configured: true, ok: true, data: { settings, suppressions } }
}

// ─── Unresolved calls (CC-03, 2026-07-29) ──────────────────────────────────
// The resolver queue. counterparty_type='unknown' is the workbench's own
// vocabulary for "matching ran and found nobody" (N-02), distinct from
// 'unmatched' (never attempted) and 'suppressed'. call_transcripts is already
// granted to portal_readonly, so this needs no new database work.
//
// The summary and the redacted transcript come along on purpose: that context
// is what lets someone recognise a caller, and it is exactly what the Zoho
// record does not show. Both are already redacted at rest (N-01/N-01b); this
// repo never sees an unmasked number — only counterparty_number_masked.

export interface UnresolvedCall {
  id: string
  dialpadCallId: string
  startedAt: string | null
  direction: string | null
  durationSec: number | null
  numberMasked: string | null
  summary: string | null
  transcript: string | null
}

// ─── The `rec` record layer (Deals Beta, 2026-08-01) ────────────────────────
//
// The September record layer, read beside Michael's live setup so he can judge
// its shape before the migration commits to one. READ ONLY, and structurally
// so: these go through the same uwFetch GET as everything else in this module,
// under the same portal_readonly role, which holds SELECT and nothing else. An
// INSERT against rec.deals answers 403 / 42501 "permission denied for table
// deals" (verified live 2026-08-01).
//
// Tenancy is the same agent_id filter every other fetcher applies (rule 4).
// rec.deals.agent_id matches Michael's public.agents.id, so the existing
// getAgentIdByEmail(WORKBENCH_AGENT_EMAIL) is the right anchor.

/** A configured phase (B0c, five-phase model). EVERYTHING about how a phase
 * behaves is a column here, not a decision in code: `unit` is the noun it
 * counts (arrivals | people | files), `counts_dollars` says whether a money
 * total is meaningful, `is_ordered` false means the phase has no steps to move
 * through, and `level` says what a row even is (source | contact | deal). Read
 * these rather than branching per phase name. */
export interface RecPhase {
  code: string
  label: string
  description: string | null
  sort_order: number
  unit: string
  counts_dollars: boolean
  is_ordered: boolean
  level: string
  is_active: boolean
}

/** A configured stage. `phase` is null for the terminal stages (which belong
 * to no phase and render in the Archive) and for retired stages. `is_gate`
 * marks a decision point rather than somewhere a file rests.
 * Stages are CONFIGURATION — never hardcode this list. Adding a stage row
 * adds a column with no code change, which is the whole point. */
export interface RecStage {
  code: string
  label: string
  description: string | null
  sort_order: number
  phase: string | null
  category: string
  is_active: boolean
  is_gate: boolean
  /** Percent chance a file in this stage funds. NULL on contact-level phases
   * (Intake, Monitor), and null is NOT zero: those phases count people, and 0
   * is what a lost deal means. Never render a null as 0, never sum across it,
   * never let a null-probability phase into a weighted total. */
  probability: number | null
}

/** A card tag definition. THREE SCALAR COLUMNS BY DESIGN — field, operator,
 * value — which cannot express a conjunction, a join, or a time window. That
 * limit is deliberate and must not be extended here: a tag needing more than
 * this is a record-layer decision, not a portal one. */
export interface RecCardTag {
  code: string
  label: string
  description: string | null
  colour_token: string | null
  rule_field: string
  rule_operator: string
  rule_value: string | null
  sort_order: number
}

/** A milestone is a small dated marker on a card, not a stage. Some move the
 * file (`moves_stage`), which is recorded here but decided in the workbench. */
export interface RecMilestoneType {
  code: string
  label: string
  description: string | null
  moves_stage: boolean
  moves_to_stage_code: string | null
  sort_order: number
}

export interface RecDealMilestone {
  deal_id: string
  /** The column is `milestone_type`, NOT `milestone_code` — verified against
   * Postgres, which answers 42703 for the latter. */
  milestone_type: string
  occurred_at: string | null
  note: string | null
}

/** Where the loop closes. Both returns out of Monitor's Decided gate are rows
 * here — one back into Advise at the strategy session, one feeding Attract as
 * a source — so the rail draws what the record layer says rather than what a
 * component remembers. */
export interface RecPhaseReturn {
  code: string
  label: string
  description: string | null
  from_phase: string
  from_stage_code: string | null
  to_phase: string
  to_stage_code: string | null
  to_source_code: string | null
  sort_order: number
}

/** Attract has sources, not steps — people arrive from somewhere rather than
 * moving through anything, which is why rec.phases marks it is_ordered false. */
export interface RecAttractSource {
  code: string
  label: string
  description: string | null
  channel_group: string | null
  sort_order: number
}

export interface RecDeal {
  id: string
  file_ref: string | null
  deal_type: string | null
  stage_code: string | null
  status: string | null
  mortgage_amount: number | null
  blocked_by: string | null
  closing_date: string | null
}

/** One stage transition. `changed_at` is the column name (NOT occurred_at),
 * and `to_stage` is what matters: days in stage is measured from the event
 * that entered the deal's CURRENT stage, never from the latest event of any
 * kind. See lib/four-phase.ts daysInStage for why that distinction decides
 * whether a figure may be shown at all. */
export interface RecStageEvent {
  deal_id: string
  to_stage: string | null
  changed_at: string | null
}

/** Borrower name and role for a deal, joined through rec.deal_clients. */
export interface RecDealClient {
  deal_id: string
  role: string | null
  full_name: string | null
}

export async function getRecPhases(): Promise<UwResult<RecPhase[]>> {
  if (isDemoMode()) return demoResult([] as RecPhase[])
  const res = await uwFetch<RecPhase>(
    'phases',
    {
      select: 'code,label,description,sort_order,unit,counts_dollars,is_ordered,level,is_active',
      is_active: 'is.true',
      order: 'sort_order.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

export async function getRecStages(): Promise<UwResult<RecStage[]>> {
  if (isDemoMode()) return demoResult([] as RecStage[])
  const res = await uwFetch<RecStage>(
    'deal_stages',
    {
      select: 'code,label,description,sort_order,phase,category,is_active,is_gate,probability',
      is_active: 'is.true',
      order: 'sort_order.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

export async function getRecPhaseReturns(): Promise<UwResult<RecPhaseReturn[]>> {
  if (isDemoMode()) return demoResult([] as RecPhaseReturn[])
  const res = await uwFetch<RecPhaseReturn>(
    'phase_returns',
    {
      select:
        'code,label,description,from_phase,from_stage_code,to_phase,to_stage_code,to_source_code,sort_order',
      is_active: 'is.true',
      order: 'sort_order.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

export async function getRecAttractSources(): Promise<UwResult<RecAttractSource[]>> {
  if (isDemoMode()) return demoResult([] as RecAttractSource[])
  const res = await uwFetch<RecAttractSource>(
    'attract_sources',
    {
      select: 'code,label,description,channel_group,sort_order',
      is_active: 'is.true',
      order: 'sort_order.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

/** Only ACTIVE tags. `large_deal` is inactive AND carries no threshold, so it
 * is excluded here before it can reach a card. */
/** Conditions on a deal, for the preview panel. `rec.conditions` links on
 * `deal_id` directly, so no join to the workbench is needed. Read-only. */
export interface RecCondition {
  deal_id: string
  cond_number: string | null
  text: string | null
  status: string | null
  category: string | null
  owner: string | null
  due_date: string | null
  load_bearing: boolean | null
}

export async function getRecConditions(agentId: string): Promise<UwResult<RecCondition[]>> {
  if (isDemoMode()) return demoResult([] as RecCondition[])
  const res = await uwFetch<RecCondition>(
    'conditions',
    {
      select: 'deal_id,cond_number,text,status,category,owner,due_date,load_bearing',
      agent_id: `eq.${agentId}`,
      order: 'cond_number.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

export async function getRecCardTags(): Promise<UwResult<RecCardTag[]>> {
  if (isDemoMode()) return demoResult([] as RecCardTag[])
  const res = await uwFetch<RecCardTag>(
    'card_tags',
    {
      select: 'code,label,description,colour_token,rule_field,rule_operator,rule_value,sort_order',
      is_active: 'is.true',
      order: 'sort_order.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

export async function getRecMilestoneTypes(): Promise<UwResult<RecMilestoneType[]>> {
  if (isDemoMode()) return demoResult([] as RecMilestoneType[])
  const res = await uwFetch<RecMilestoneType>(
    'milestone_types',
    {
      select: 'code,label,description,moves_stage,moves_to_stage_code,sort_order',
      is_active: 'is.true',
      order: 'sort_order.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

/** Zero rows today. The rendering exists anyway because `lawyer_instructed`
 * will land on files sitting in Conditions, which is the case the design is
 * for. */
export async function getRecDealMilestones(agentId: string): Promise<UwResult<RecDealMilestone[]>> {
  if (isDemoMode()) return demoResult([] as RecDealMilestone[])
  const res = await uwFetch<RecDealMilestone>(
    'deal_milestones',
    {
      select: 'deal_id,milestone_type,occurred_at,note',
      agent_id: `eq.${agentId}`,
      order: 'occurred_at.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

export async function getRecDeals(agentId: string): Promise<UwResult<RecDeal[]>> {
  if (isDemoMode()) return demoResult([] as RecDeal[])
  const res = await uwFetch<RecDeal>(
    'deals',
    {
      select: 'id,file_ref,deal_type,stage_code,status,mortgage_amount,blocked_by,closing_date',
      agent_id: `eq.${agentId}`,
      order: 'created_at.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return {
    configured: true,
    ok: true,
    data: res.data.map(d => ({ ...d, mortgage_amount: numOrNull(d.mortgage_amount) })),
  }
}

export async function getRecStageEvents(agentId: string): Promise<UwResult<RecStageEvent[]>> {
  if (isDemoMode()) return demoResult([] as RecStageEvent[])
  const res = await uwFetch<RecStageEvent>(
    'deal_stage_events',
    {
      select: 'deal_id,to_stage,changed_at',
      agent_id: `eq.${agentId}`,
      order: 'changed_at.asc',
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.data }
}

/** Names come through the join table with the client embedded, so one request
 * serves every card. PostgREST embeds via the foreign key: clients(full_name). */
export async function getRecDealClients(agentId: string): Promise<UwResult<RecDealClient[]>> {
  if (isDemoMode()) return demoResult([] as RecDealClient[])
  const res = await uwFetch<{ deal_id: string; role: string | null; clients: { full_name: string | null } | null }>(
    'deal_clients',
    {
      select: 'deal_id,role,clients(full_name)',
      agent_id: `eq.${agentId}`,
    },
    false,
    'rec',
  )
  if (!res.configured || !res.ok) return res
  return {
    configured: true,
    ok: true,
    data: res.data.map(r => ({
      deal_id: r.deal_id,
      role: r.role,
      full_name: r.clients?.full_name ?? null,
    })),
  }
}

/** Row count on rec.consents, the field Intake is waiting on. Rendered as a
 * fact on the Intake placeholder rather than asserted from the brief — if it
 * ever stops being zero, the page says so on its own. */
export async function getRecConsentCount(): Promise<UwResult<number>> {
  if (isDemoMode()) return demoResult(0)
  const res = await uwFetch<unknown>('consents', { select: 'id' }, true, 'rec')
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: res.total ?? res.data.length }
}

// ─── Native tasks: the overdue page past the endpoint's 200-row cap (A2) ────
//
// WHY THIS EXISTS AND WHY IT IS NOT A SECOND SOURCE OF TRUTH.
// GET /api/tasks/today (fox-underwriting block A1) caps every bucket at 200
// rows and takes no paging params. On the first live read overdue was 276, so
// 76 tasks were unreachable from that endpoint alone — and A2 must not modify
// fox-underwriting. `tasks` is a granted table for portal_readonly (migration
// 0057), so the rest of the bucket is reachable through this repo's existing
// GET-only read path.
//
// THE ENDPOINT REMAINS AUTHORITATIVE. `asOf` is passed in VERBATIM from the
// response's own `as_of` — the browser never recomputes "today", and neither
// does this function. Overdue is the endpoint's own rule (`due_date < today`
// on open rows), applied to the same date the endpoint resolved in
// America/Toronto. Change the rule in fox-underwriting's `bucketOf` and this
// filter has to change with it; that coupling is stated here on purpose.
//
// Tenancy is the same agent_id filter every other fetcher in this module
// applies (rule 4). Note the endpoint scopes to the CALLING human's agent row
// while this repo resolves Michael's by WORKBENCH_AGENT_EMAIL — identical for
// him, and the portal's whole workbench surface already reads his book.
export interface OverdueTaskPage {
  rows: TaskRow[]
  total: number | null
}

export async function getOverdueTasksPage(
  agentId: string,
  asOf: string,
  limit: number,
  offset: number,
): Promise<UwResult<OverdueTaskPage>> {
  // Demo mode never reaches the workbench: the fixture's overdue bucket is
  // served whole by lib/gates.ts getTasksToday, and paging past it is empty.
  if (isDemoMode()) return demoResult({ rows: [] as TaskRow[], total: 0 })
  // A malformed date would become an unbounded filter, so refuse rather than
  // widen the read.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
    return { configured: true, ok: false, error: 'A task page needs the endpoint’s as_of date' }
  }
  const res = await uwFetch<TaskRow>(
    'tasks',
    {
      select: TASK_ROW_SELECT,
      agent_id: `eq.${agentId}`,
      status: 'eq.open',
      due_date: `lt.${asOf}`,
      // id tiebreak: offset pages are unstable under equal sort keys without
      // one (many tasks share a due_date), which duplicates and drops rows.
      order: 'due_date.asc,id.asc',
      limit: String(limit),
      offset: String(offset),
    },
    true,
  )
  if (!res.configured || !res.ok) return res
  return { configured: true, ok: true, data: { rows: res.data, total: res.total } }
}

export async function getUnresolvedCalls(agentId: string): Promise<UwResult<UnresolvedCall[]>> {
  if (isDemoMode()) return demoResult([] as UnresolvedCall[])
  const res = await uwSelect<any>('call_transcripts', {
    select:
      'id,dialpad_call_id,started_at,direction,duration_sec,counterparty_number_masked,summary,transcript_redacted',
    agent_id: `eq.${agentId}`,
    counterparty_type: 'eq.unknown',
    order: 'started_at.desc',
    limit: '200',
  })
  return mapResult(res, rows =>
    rows.map(r => ({
      id: r.id,
      dialpadCallId: r.dialpad_call_id,
      startedAt: r.started_at ?? null,
      direction: r.direction ?? null,
      durationSec: r.duration_sec ?? null,
      numberMasked: r.counterparty_number_masked ?? null,
      summary: r.summary ?? null,
      transcript: r.transcript_redacted ?? null,
    })),
  )
}
