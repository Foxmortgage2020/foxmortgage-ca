// Zoho CRM access for the admin command center: read-only aggregates
// (pipeline by stage, funded YTD, closings windows, open tasks), the Ask
// Fox search reads, and the ONLY two Zoho write functions in the admin
// surface (updateZohoDealFields, createZohoTask), which exist solely for
// the agent confirmed-action routes: nothing calls them except a route
// that just loaded a Michael-confirmed card. The agent itself holds no
// write tools.
//
// Deliberately mirrors getAdminDashboardPayload's approach in lib/zoho.ts:
// the records API (/Potentials, paginated at 200/page), NEVER COQL — the
// app's refresh token does not hold ZohoCRM.coql.READ, so COQL 401s in
// production even though it works through the separately-authenticated MCP
// connector. Volume field: Amount, falling back to Total_Loan_Amount —
// 2026 funded records carry Amount only (verified 2026-07-09).

import { getZohoToken } from '@/lib/zoho'
import { createCache } from '@/lib/cache'
import { torontoTodayYMD, ymdAddDays } from '@/lib/dates'
import {
  PIPELINE_STAGE_ORDER,
  isFundedStage,
  isRenewalPoolDeal,
  isSummaryStage,
  isTerminalStage,
} from '@/config/pipeline'
import type { StageVolume } from '@/lib/pacing'
import type { RevenueDeal } from '@/lib/revenue'
import type { RenewalDeal } from '@/lib/renewals'
import { classifyOpenDeals, type StaleReason } from '@/lib/pipeline-hygiene'
// Demo mode (Session 9): reads return fictional fixtures and writes throw
// before any getZohoToken()/fetch() call, so demo mode never touches Zoho.
import { isDemoMode, blockInDemo } from '@/lib/demo'
import { demoSlimDeals, demoRevenueDeals, demoOpenTasks, demoLeads, demoRenewalDeals } from '@/lib/demo-fixtures'

const ZOHO_API = 'https://www.zohoapis.com/crm/v2'

export interface SlimDeal {
  id: string
  dealName: string
  stage: string
  amount: number
  closingDate: string | null
  // Created_Time (Y-M-D). Feeds the pipeline staleness rule's age arm — the
  // reliable stand-in for a last-activity signal Zoho does not provide here
  // (Last_Activity_Time is Finmo-mass-synced; see lib/pipeline-hygiene.ts).
  createdTime: string | null
  // Bridge linkage (Phase B1): Transaction_Type maps onto the workbench
  // deal_type vocabulary; the Finmo UUID links the room where present.
  // Optional so SlimDeal-shaped fixtures and derived types stay valid.
  transactionType?: string | null
  finmoUuid?: string | null
}

const SLIM_DEAL_FIELDS = 'Deal_Name,Stage,Amount,Total_Loan_Amount,Closing_Date,Created_Time,Transaction_Type,Finmo_Application_UUID'

// One shared 2-minute cache absorbs the burst of widgets on a single Home
// render plus quick refreshes. Failures are never cached.
const slimDealsCache = createCache<string, SlimDeal[]>({ max: 2, ttlMs: 2 * 60 * 1000 })

function dealAmount(d: any): number {
  if (d.Amount != null) return Number(d.Amount) || 0
  if (d.Total_Loan_Amount != null) return Number(d.Total_Loan_Amount) || 0
  return 0
}

export async function getAllDealsSlim(): Promise<SlimDeal[]> {
  if (isDemoMode()) return demoSlimDeals
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
        createdTime: typeof d.Created_Time === 'string' ? d.Created_Time.slice(0, 10) : null,
        transactionType: typeof d.Transaction_Type === 'string' ? d.Transaction_Type : null,
        finmoUuid: typeof d.Finmo_Application_UUID === 'string' ? d.Finmo_Application_UUID : null,
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

// A stale deal, carried out for the groomable bucket the Revenue page shows.
export interface StalePipelineDeal {
  id: string
  dealName: string
  stage: string
  amount: number
  closingDate: string | null
  createdTime: string | null
  staleReason: StaleReason
}

export interface PipelineView {
  // Ordered stages from the Daily Deal Briefing, present-or-not. ACTIVE only.
  ordered: PipelineStageRow[]
  // Any other open stages, alphabetical — new picklist values stay visible.
  other: PipelineStageRow[]
  // Summary buckets (Additional Properties): count only, no volume claims.
  summary: { stage: string; count: number }[]
  // Active pipeline: open stages, stale deals removed. These are the figures
  // every pipeline surface reconciles to (8 files / $4,714,240 at 2026-07-12).
  openCount: number
  openVolume: number
  // The stale bucket: open deals the staleness rule excluded, surfaced for
  // grooming (never deleted). See lib/pipeline-hygiene.ts.
  stale: StalePipelineDeal[]
  staleCount: number
  staleVolume: number
  // The active deals themselves (2026-07-14 shell redesign): the Home
  // compact pipeline table renders them per file. Same set the stage rows
  // aggregate; additive, nothing else changed.
  activeDeals: SlimDeal[]
}

// todayYMD anchors the staleness rule; both callers pass torontoTodayYMD().
export function computePipeline(deals: SlimDeal[], todayYMD: string): PipelineView {
  const summaryCounts = new Map<string, number>()
  const open: SlimDeal[] = []
  for (const d of deals) {
    if (!d.stage || isTerminalStage(d.stage)) continue
    if (isSummaryStage(d.stage)) {
      summaryCounts.set(d.stage, (summaryCounts.get(d.stage) ?? 0) + 1)
      continue
    }
    open.push(d)
  }

  // Split real active pipeline from un-groomed debt. Only active deals count
  // toward stage volumes, openCount, openVolume, and (via pipelineStageVolumes)
  // the weighted pipeline and the pace.
  const { active, stale } = classifyOpenDeals(open, todayYMD)

  const byStage = new Map<string, PipelineStageRow>()
  for (const d of active) {
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
  const activeRows = [...ordered, ...other]

  const staleDeals: StalePipelineDeal[] = stale
    .map(d => ({
      id: d.id,
      dealName: d.dealName,
      stage: d.stage,
      amount: d.amount,
      closingDate: d.closingDate,
      createdTime: d.createdTime,
      staleReason: d.staleReason,
    }))
    .sort(
      (a, b) =>
        (a.closingDate ?? '9999').localeCompare(b.closingDate ?? '9999') ||
        a.dealName.localeCompare(b.dealName),
    )

  return {
    ordered,
    other,
    summary: Array.from(summaryCounts.entries()).map(([stage, count]) => ({ stage, count })),
    openCount: activeRows.reduce((s, r) => s + r.count, 0),
    openVolume: activeRows.reduce((s, r) => s + r.volume, 0),
    stale: staleDeals,
    staleCount: staleDeals.length,
    staleVolume: staleDeals.reduce((s, d) => s + d.amount, 0),
    activeDeals: active,
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
  if (isDemoMode()) return demoOpenTasks
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

// ─── Open tasks linked to a record (Ask Fox task awareness, Session 7) ──────
// The related-records API serves a record's Tasks directly; completed tasks
// drop client-side (the search API rejects not_equal on Status, and the
// related list takes no criteria at all).

export interface RelatedOpenTask {
  id: string
  subject: string
  dueDate: string | null
  priority: string | null
  status: string | null
}

export async function getOpenTasksForRecord(
  module: 'Potentials' | 'Contacts',
  recordId: string,
): Promise<RelatedOpenTask[]> {
  const token = await getZohoToken()
  const url = `${ZOHO_API}/${module}/${recordId}/Tasks?fields=${TASK_FIELDS}&per_page=200`
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204) return []
  if (!res.ok) {
    console.error(`[zoho-admin] ${module}/${recordId}/Tasks HTTP ${res.status}`)
    throw new Error(`Zoho related tasks read failed with status ${res.status}`)
  }
  const data = await res.json()
  return (data?.data ?? [])
    .filter((t: any) => String(t.Status ?? '') !== 'Completed')
    .map((t: any) => ({
      id: t.id,
      subject: t.Subject ?? '(untitled task)',
      dueDate: t.Due_Date ?? null,
      priority: t.Priority ?? null,
      status: t.Status ?? null,
    }))
}

// ─── Revenue and Partners pull (Session 7) ──────────────────────────────────
// One paginated read serves the Revenue page, the Partners health list, and
// the funnel: the slim deal shape plus the commission fields the Part 1
// discovery verified live (Total_Commission = Amount x (BPS + VB_BPS)/10000
// x (1 - Split_to_Brokerage_Network), checked to the cent on three funded
// deals). Formula fields always return a number, so zero means "not
// recorded", never "free deal"; lib/revenue.ts treats > 0 as an actual.
// The RevenueDeal shape lives in lib/revenue.ts (the pure math module);
// this file only normalizes into it.

const REVENUE_DEAL_FIELDS = [
  'Deal_Name', 'Stage', 'Amount', 'Total_Loan_Amount', 'Closing_Date', 'Created_Time',
  'Total_Commission', 'BPS', 'VB_BPS', 'Split_to_Brokerage_Network',
  'Lender_Name', 'Lender_Classification', 'Referral_Partner',
  'Rate_Type', 'Term_Years', 'Mortgage_Type', 'Transaction_Type', 'Mortgage_Rate',
].join(',')

const revenueDealsCache = createCache<string, RevenueDeal[]>({ max: 2, ttlMs: 5 * 60 * 1000 })

const numOrNull = (v: unknown): number | null =>
  v == null || v === '' || Number.isNaN(Number(v)) ? null : Number(v)

export async function getAllDealsRevenue(): Promise<RevenueDeal[]> {
  if (isDemoMode()) return demoRevenueDeals
  const cached = revenueDealsCache.get('all')
  if (cached !== undefined) return cached

  const token = await getZohoToken()
  const all: RevenueDeal[] = []
  let page = 1
  while (page <= 20) {
    const url = `${ZOHO_API}/Potentials?fields=${REVENUE_DEAL_FIELDS}&per_page=200&page=${page}&sort_by=Created_Time&sort_order=desc`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (res.status === 204) break
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[zoho-admin] revenue pull error:', res.status, text.substring(0, 200))
      throw new Error(`Zoho revenue pull failed with status ${res.status}`)
    }
    const data = await res.json()
    for (const d of data?.data ?? []) {
      all.push({
        id: d.id,
        dealName: d.Deal_Name ?? '(untitled)',
        stage: String(d.Stage ?? '').trim(),
        amount: dealAmount(d),
        closingDate: typeof d.Closing_Date === 'string' ? d.Closing_Date : null,
        createdTime: typeof d.Created_Time === 'string' ? d.Created_Time.slice(0, 10) : null,
        totalCommission: Number(d.Total_Commission) || 0,
        bps: numOrNull(d.BPS),
        vbBps: numOrNull(d.VB_BPS),
        splitToNetwork: numOrNull(d.Split_to_Brokerage_Network),
        lenderName: d.Lender_Name?.name ?? null,
        lenderClassification: d.Lender_Classification ?? null,
        referralPartnerId: d.Referral_Partner?.id ?? null,
        referralPartnerName: d.Referral_Partner?.name ?? null,
        rateType: d.Rate_Type ?? null,
        termYears: numOrNull(d.Term_Years),
        mortgageType: d.Mortgage_Type ?? null,
        transactionType: d.Transaction_Type ?? null,
        mortgageRate: numOrNull(d.Mortgage_Rate),
      })
    }
    if (data?.info?.more_records !== true) break
    page += 1
  }
  revenueDealsCache.set('all', all)
  return all
}

// Leads with their source, for the funnel's lead-level breakdown.
// Lead_Source does not exist on Potentials (Part 1 discovery), so the
// source picture lives at the Leads level only and the page says so.

export interface SlimLead {
  id: string
  leadSource: string | null
  createdTime: string | null
  leadStatus: string | null
}

const leadsCache = createCache<string, SlimLead[]>({ max: 2, ttlMs: 5 * 60 * 1000 })

export async function getLeadsSlim(): Promise<SlimLead[]> {
  if (isDemoMode()) return demoLeads
  const cached = leadsCache.get('all')
  if (cached !== undefined) return cached

  const token = await getZohoToken()
  const all: SlimLead[] = []
  let page = 1
  while (page <= 10) {
    const url = `${ZOHO_API}/Leads?fields=Lead_Source,Created_Time,Lead_Status&per_page=200&page=${page}`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (res.status === 204) break
    if (!res.ok) {
      console.error('[zoho-admin] leads pull error:', res.status)
      throw new Error(`Zoho leads pull failed with status ${res.status}`)
    }
    const data = await res.json()
    for (const l of data?.data ?? []) {
      all.push({
        id: l.id,
        leadSource: l.Lead_Source ?? null,
        createdTime: typeof l.Created_Time === 'string' ? l.Created_Time.slice(0, 10) : null,
        leadStatus: l.Lead_Status ?? null,
      })
    }
    if (data?.info?.more_records !== true) break
    page += 1
  }
  leadsCache.set('all', all)
  return all
}

// ─── Ask Fox: client and deal search (reads) ────────────────────────────────
// The brief-relevant field surface, verified live against IFMS-F001515 on
// 2026-07-10. Zoho returns null for uncaptured fields; the agent renders
// those as "not captured", never a guess. No balance field exists on
// Potentials (Amount is the original principal).

// Street rides along for the backfill deal disambiguation (a shared-identity
// contact's deals attribute by property address; FP-portal-confirmed field).
export const AGENT_DEAL_FIELDS =
  'Deal_Name,Stage,Contact_Name,Mortgage_Rate,Amount,Total_Loan_Amount,Maturity_Date,Payment_Amount,Payment_Frequency,Renewal_In_Progress,Investor_Status,Closing_Date,Rate_Type,Term_Type,Mortgage_Type,First_Payment_Date,LTV,Street,City,Province'

export interface AgentZohoDeal {
  id: string
  fields: Record<string, unknown>
}

export interface AgentZohoContact {
  id: string
  fullName: string
  email: string | null
  phone: string | null
  mobile: string | null
}

// Pure and exported for the not-captured unit test: a stripped Zoho row
// keeps its nulls; nothing fills a missing value.
export function normalizeAgentDeal(d: any): AgentZohoDeal {
  const fields: Record<string, unknown> = {}
  for (const key of AGENT_DEAL_FIELDS.split(',')) {
    const v = d[key]
    fields[key] =
      v && typeof v === 'object' && 'name' in v ? { name: v.name, id: v.id } : (v ?? null)
  }
  return { id: d.id, fields }
}

// The grounding note every find_client result carries: the CRM has no
// balance field, so a balance question answers "not captured".
export const FIND_CLIENT_NOTE =
  'Null fields are not captured in Zoho. Amount is the original principal; no balance field exists in the CRM.'

async function zohoSearch(module: string, params: Record<string, string>): Promise<any[]> {
  const token = await getZohoToken()
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${ZOHO_API}/${module}/search?${qs}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204) return []
  if (!res.ok) {
    console.error(`[zoho-admin] ${module}/search HTTP ${res.status}`)
    throw new Error(`Zoho ${module} search failed with status ${res.status}`)
  }
  const data = await res.json()
  return data?.data ?? []
}

export async function searchZohoContacts(
  query: string,
  by: 'word' | 'email' | 'phone',
): Promise<AgentZohoContact[]> {
  // Demo: never query real Zoho contacts (a global-search contact hit would
  // otherwise surface a real name). Empty is the honest demo answer.
  if (isDemoMode()) return []
  const rows = await zohoSearch('Contacts', {
    [by]: query,
    fields: 'Full_Name,Email,Phone,Mobile',
    per_page: '10',
  })
  return rows.map(c => ({
    id: c.id,
    fullName: c.Full_Name ?? '(unnamed contact)',
    email: c.Email ?? null,
    phone: c.Phone ?? null,
    mobile: c.Mobile ?? null,
  }))
}

export async function searchZohoDealsByWord(word: string): Promise<AgentZohoDeal[]> {
  if (isDemoMode()) return []
  const rows = await zohoSearch('Potentials', { word, fields: AGENT_DEAL_FIELDS, per_page: '10' })
  return rows.map(normalizeAgentDeal)
}

export async function getZohoDealsByContactId(contactId: string): Promise<AgentZohoDeal[]> {
  if (isDemoMode()) return []
  const rows = await zohoSearch('Potentials', {
    criteria: `(Contact_Name:equals:${contactId})`,
    fields: AGENT_DEAL_FIELDS,
    per_page: '20',
  })
  return rows.map(normalizeAgentDeal)
}

export async function getZohoDealById(dealId: string): Promise<AgentZohoDeal | null> {
  if (isDemoMode()) return null
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Potentials/${dealId}?fields=${AGENT_DEAL_FIELDS}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204 || res.status === 404) return null
  if (!res.ok) {
    console.error(`[zoho-admin] Potentials get HTTP ${res.status}`)
    throw new Error(`Zoho deal read failed with status ${res.status}`)
  }
  const data = await res.json()
  const d = data?.data?.[0]
  return d ? normalizeAgentDeal(d) : null
}

// ─── The Renewal Radar: funded deals with maturity ──────────────────────────
// Read-only pull of every funded deal (both stage spellings) with the renewal
// fields. Split into those with a maturity date (the buckets) and those
// without (the missing-maturity block). Fields verified live 2026-07-12.

// Closing_Date rides for the appears-renewed detection: a feed start date
// materially later than the deal's closing date means a renewal Zoho missed.
const RENEWAL_FIELDS =
  'Deal_Name,Contact_Name,Amount,Total_Loan_Amount,Maturity_Date,Mortgage_Rate,Rate_Type,Term_Years,Amortization_Years,Payment_Amount,Renewal_Status,Renewal_In_Progress,Renewal_Opted_Out,Lender_Name,Stage,Closing_Date'

const renewalDealsCache = createCache<string, RenewalDeal[]>({ max: 2, ttlMs: 2 * 60 * 1000 })

function normalizeRenewalDeal(d: any): RenewalDeal {
  return {
    id: d.id,
    dealName: d.Deal_Name ?? '(untitled)',
    contactName: d.Contact_Name?.name ?? null,
    amount: dealAmount(d),
    maturityDate: typeof d.Maturity_Date === 'string' ? d.Maturity_Date : null,
    mortgageRate: d.Mortgage_Rate != null ? Number(d.Mortgage_Rate) : null,
    rateType: d.Rate_Type ?? null,
    termYears: d.Term_Years != null ? Number(d.Term_Years) : null,
    amortizationYears: d.Amortization_Years != null ? Number(d.Amortization_Years) : null,
    paymentAmount: d.Payment_Amount != null ? Number(d.Payment_Amount) : null,
    renewalStatus: d.Renewal_Status ?? null,
    renewalInProgress: Boolean(d.Renewal_In_Progress),
    renewalOptedOut: Boolean(d.Renewal_Opted_Out),
    lenderName: d.Lender_Name?.name ?? null,
    closingDate: typeof d.Closing_Date === 'string' ? d.Closing_Date : null,
  }
}

export interface RenewalDealsResult {
  withMaturity: RenewalDeal[]
  missingMaturity: RenewalDeal[]
}

async function fetchFundedRenewalDeals(): Promise<RenewalDeal[]> {
  const cached = renewalDealsCache.get('all')
  if (cached !== undefined) return cached
  const token = await getZohoToken()
  const all: RenewalDeal[] = []
  let page = 1
  while (page <= 20) {
    const url = `${ZOHO_API}/Potentials?fields=${RENEWAL_FIELDS}&per_page=200&page=${page}&sort_by=Modified_Time&sort_order=desc`
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
      cache: 'no-store',
    })
    if (res.status === 204) break
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('[zoho-admin] renewals pull error:', res.status, text.substring(0, 200))
      throw new Error(`Zoho renewals pull failed with status ${res.status}`)
    }
    const data = await res.json()
    for (const d of data?.data ?? []) {
      // The renewal pool is FUNDED-stage deals only (both legacy spellings),
      // never Additional Properties child rows — a property row carrying an
      // amount and a maturity date is not a mortgage (Task 0c).
      if (!isRenewalPoolDeal(String(d.Stage ?? '').trim(), String(d.Deal_Name ?? ''))) continue
      all.push(normalizeRenewalDeal(d))
    }
    if (data?.info?.more_records !== true) break
    page += 1
  }
  renewalDealsCache.set('all', all)
  return all
}

export async function getRenewalDeals(): Promise<RenewalDealsResult> {
  const all = isDemoMode() ? demoRenewalDeals : await fetchFundedRenewalDeals()
  return {
    withMaturity: all.filter(d => d.maturityDate),
    missingMaturity: all.filter(d => !d.maturityDate),
  }
}

// Fetch one funded deal's renewal shape (for the status write route's audit).
export async function getRenewalDealById(dealId: string): Promise<RenewalDeal | null> {
  if (isDemoMode()) return demoRenewalDeals.find(d => d.id === dealId) ?? null
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Potentials/${dealId}?fields=${RENEWAL_FIELDS}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    cache: 'no-store',
  })
  if (res.status === 204 || res.status === 404) return null
  if (!res.ok) throw new Error(`Zoho deal read failed with status ${res.status}`)
  const data = await res.json()
  const d = data?.data?.[0]
  return d ? normalizeRenewalDeal(d) : null
}

// ─── Ask Fox: confirmed-action writes ───────────────────────────────────────
// Called ONLY by the agent card execute routes after Michael taps confirm.
// The payload executed is the stored card payload, never a client body.

const AGENT_WRITABLE_MODULES = ['Potentials', 'Contacts'] as const
export type AgentWritableModule = (typeof AGENT_WRITABLE_MODULES)[number]

export function isAgentWritableModule(m: string): m is AgentWritableModule {
  return (AGENT_WRITABLE_MODULES as readonly string[]).includes(m)
}

export async function updateZohoRecordFields(
  module: AgentWritableModule,
  recordId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  if (isDemoMode()) blockInDemo('updateZohoRecordFields')
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/${module}/${recordId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [{ id: recordId, ...fields }] }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho-admin] update error:', module, res.status, text.substring(0, 300))
    throw new Error(`Zoho ${module} update failed with status ${res.status}`)
  }
  const data = await res.json().catch(() => null)
  const status = data?.data?.[0]?.status
  if (status !== 'success') {
    console.error('[zoho-admin] update non-success:', module, JSON.stringify(data?.data?.[0]?.code ?? ''))
    throw new Error(`Zoho ${module} update was not accepted (${data?.data?.[0]?.code ?? 'unknown'})`)
  }
}

export interface CreateTaskInput {
  subject: string
  description?: string | null
  dueDate?: string | null
  priority?: string | null
  /** Optional linked record (a Potentials id). Tasks link via What_Id with
   * $se_module naming the module. */
  relatedDealId?: string | null
}

export async function createZohoTask(input: CreateTaskInput): Promise<string> {
  if (isDemoMode()) blockInDemo('createZohoTask')
  const token = await getZohoToken()
  const payload: Record<string, unknown> = { Subject: input.subject }
  if (input.description) payload.Description = input.description
  if (input.dueDate) payload.Due_Date = input.dueDate
  if (input.priority) payload.Priority = input.priority
  if (input.relatedDealId) {
    payload.What_Id = { id: input.relatedDealId }
    payload.$se_module = 'Potentials'
  }
  const res = await fetch(`${ZOHO_API}/Tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [payload] }),
    cache: 'no-store',
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('[zoho-admin] task create error:', res.status, text.substring(0, 300))
    throw new Error(`Zoho task create failed with status ${res.status}`)
  }
  const data = await res.json().catch(() => null)
  const row = data?.data?.[0]
  if (row?.status !== 'success' || !row?.details?.id) {
    console.error('[zoho-admin] task create non-success:', JSON.stringify(row?.code ?? ''))
    throw new Error(`Zoho task create was not accepted (${row?.code ?? 'unknown'})`)
  }
  return String(row.details.id)
}

// Used only by the live verification flow to close a TEST task it just
// created (status update through the same write path).
export async function completeZohoTask(taskId: string): Promise<void> {
  if (isDemoMode()) blockInDemo('completeZohoTask')
  const token = await getZohoToken()
  const res = await fetch(`${ZOHO_API}/Tasks/${taskId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: [{ id: taskId, Status: 'Completed' }] }),
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Zoho task complete failed with status ${res.status}`)
  }
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
