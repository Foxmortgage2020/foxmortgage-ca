// Revenue math (Session 7) — pure functions, no I/O, unit-tested in
// tests/revenue.test.ts. Every function takes todayYMD so nothing here
// reads a clock, and every dollar figure it produces carries its basis:
// 'actual' (Zoho Total_Commission > 0, the formula field verified in the
// Part 1 discovery) or 'model' (config/comp.ts). The pages render model
// figures with the estimated label; conflating the two anywhere is a
// failed acceptance.

import type { CompModel } from '@/config/comp'

// The deal shape the revenue and partners pages consume. The fetcher
// (lib/zoho-admin.ts getAllDealsRevenue) normalizes Zoho rows into this;
// the math here never sees a raw Zoho payload.
export interface RevenueDeal {
  id: string
  dealName: string
  stage: string
  amount: number
  closingDate: string | null
  createdTime: string | null
  totalCommission: number
  bps: number | null
  vbBps: number | null
  splitToNetwork: number | null
  lenderName: string | null
  lenderClassification: string | null
  referralPartnerId: string | null
  referralPartnerName: string | null
  rateType: string | null
  termYears: number | null
  mortgageType: string | null
  transactionType: string | null
  mortgageRate: number | null
}

// ─── Month helpers ───────────────────────────────────────────────────────────

export function monthAdd(ym: string, n: number): string {
  const [y, m] = ym.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12)
  const nm = (total % 12) + 1
  return `${ny}-${String(nm).padStart(2, '0')}`
}

export function monthRange(startYM: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => monthAdd(startYM, i))
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-CA', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// ─── Per-deal revenue: actual first, model fills gaps ───────────────────────

export interface DealRevenue {
  amount: number
  basis: 'actual' | 'model'
  // Present on model-based figures: which comp row priced it and whether
  // Michael has confirmed that row's bps yet.
  modelLabel?: string
  modelConfirmed?: boolean
}

export function dealRevenue(deal: RevenueDeal, model: CompModel): DealRevenue {
  if (deal.totalCommission > 0) {
    return { amount: deal.totalCommission, basis: 'actual' }
  }
  const row = model.rows.find(r => {
    if (r.match.lenderName && deal.lenderName) {
      if (deal.lenderName.toLowerCase().includes(r.match.lenderName.toLowerCase())) return true
    }
    if (r.match.classification && deal.lenderClassification === r.match.classification) return true
    return false
  })
  const bps = row ? row.bps : model.defaultBps.bps
  const confirmed = row ? row.confirmed : model.defaultBps.confirmed
  const amount =
    deal.amount * (bps / 10_000) * (1 - model.networkSplit.value) * model.agentSplit
  return {
    amount,
    basis: 'model',
    modelLabel: row ? row.label : 'default bps',
    modelConfirmed: confirmed && model.networkSplit.confirmed,
  }
}

// ─── Commission pipeline forecast ────────────────────────────────────────────
// Open deals grouped by expected close month, volume stage-weighted, run
// through dealRevenue. Closing-date hygiene is honest: open deals with a
// past close date or no date never smear into future months — they land
// in their own named buckets the page renders as data-quality callouts
// (15 open deals carried stale 2021-2024 dates at discovery time).

export interface ForecastMonth {
  month: string
  expectedRevenue: number
  weightedVolume: number
  dealCount: number
  actualBasisCount: number
}

export interface ForecastBucket {
  count: number
  expectedRevenue: number
}

export interface ForecastResult {
  months: ForecastMonth[]
  pastDated: ForecastBucket
  undated: ForecastBucket
  totalExpected: number
  openDealCount: number
}

export function commissionForecast(
  deals: RevenueDeal[],
  weights: Record<string, number>,
  model: CompModel,
  todayYMD: string,
  isOpenStage: (stage: string) => boolean,
  // Stale open deals (un-groomed debt) are excluded from the forecast entirely
  // so openDealCount and the buckets reflect only real active pipeline. The
  // page passes lib/pipeline-hygiene's predicate; the default no-op keeps the
  // function's older callers (and tests) unchanged. With staleness on, the
  // pastDated bucket means only "active but the close date recently lapsed"
  // (0-90 days past), a genuine date-hygiene nudge — long-dead files are gone.
  isStale: (deal: { closingDate: string | null; createdTime: string | null }) => boolean = () => false,
  // NOTE: isStale precedes horizonMonths. A future caller copying the old
  // 5-arg form and appending a positional horizonMonths would land it in the
  // isStale slot; the guard below degrades that to a no-op rather than crash.
  horizonMonths = 8,
): ForecastResult {
  const stale = typeof isStale === 'function' ? isStale : () => false
  const currentMonth = todayYMD.slice(0, 7)
  const months = new Map<string, ForecastMonth>(
    monthRange(currentMonth, horizonMonths).map(m => [
      m,
      { month: m, expectedRevenue: 0, weightedVolume: 0, dealCount: 0, actualBasisCount: 0 },
    ]),
  )
  const pastDated: ForecastBucket = { count: 0, expectedRevenue: 0 }
  const undated: ForecastBucket = { count: 0, expectedRevenue: 0 }
  let openDealCount = 0

  for (const d of deals) {
    if (!d.stage || !isOpenStage(d.stage)) continue
    if (stale(d)) continue
    openDealCount += 1
    const weight = weights[d.stage] ?? 0
    const rev = dealRevenue(d, model)
    const expected = rev.amount * weight

    if (!d.closingDate) {
      undated.count += 1
      undated.expectedRevenue += expected
      continue
    }
    const ym = d.closingDate.slice(0, 7)
    if (ym < currentMonth) {
      pastDated.count += 1
      pastDated.expectedRevenue += expected
      continue
    }
    const row = months.get(ym)
    if (!row) {
      // Beyond the horizon: fold into the last month so nothing vanishes.
      const last = months.get(monthAdd(currentMonth, horizonMonths - 1))!
      last.expectedRevenue += expected
      last.weightedVolume += d.amount * weight
      last.dealCount += 1
      if (rev.basis === 'actual') last.actualBasisCount += 1
      continue
    }
    row.expectedRevenue += expected
    row.weightedVolume += d.amount * weight
    row.dealCount += 1
    if (rev.basis === 'actual') row.actualBasisCount += 1
  }

  const monthRows = Array.from(months.values())
  return {
    months: monthRows,
    pastDated,
    undated,
    totalExpected:
      monthRows.reduce((s, m) => s + m.expectedRevenue, 0) +
      pastDated.expectedRevenue +
      undated.expectedRevenue,
    openDealCount,
  }
}

// ─── Funded trends, trailing 12 ─────────────────────────────────────────────

export interface FundedMonth {
  month: string
  volume: number
  count: number
  revenueActual: number
  revenueModeled: number
  actualCount: number
}

export function fundedTrend(
  deals: RevenueDeal[],
  todayYMD: string,
  model: CompModel,
  isFunded: (stage: string) => boolean,
  monthsBack = 12,
): FundedMonth[] {
  const currentMonth = todayYMD.slice(0, 7)
  const startMonth = monthAdd(currentMonth, -(monthsBack - 1))
  const months = new Map<string, FundedMonth>(
    monthRange(startMonth, monthsBack).map(m => [
      m,
      { month: m, volume: 0, count: 0, revenueActual: 0, revenueModeled: 0, actualCount: 0 },
    ]),
  )
  for (const d of deals) {
    if (!isFunded(d.stage) || !d.closingDate) continue
    const ym = d.closingDate.slice(0, 7)
    const row = months.get(ym)
    if (!row) continue
    row.volume += d.amount
    row.count += 1
    const rev = dealRevenue(d, model)
    if (rev.basis === 'actual') {
      row.revenueActual += rev.amount
      row.actualCount += 1
    } else {
      row.revenueModeled += rev.amount
    }
  }
  return Array.from(months.values())
}

export function fundedInWindow(
  deals: RevenueDeal[],
  todayYMD: string,
  isFunded: (stage: string) => boolean,
  monthsBack = 12,
): RevenueDeal[] {
  const startMonth = monthAdd(todayYMD.slice(0, 7), -(monthsBack - 1))
  return deals.filter(
    d => isFunded(d.stage) && d.closingDate != null && d.closingDate.slice(0, 7) >= startMonth,
  )
}

// ─── Funded by year (the Practice History chart) ────────────────────────────

export interface FundedYear {
  year: number
  volume: number
  count: number
}

// Funded volume and count per calendar year, ascending, bucketed on the
// literal Closing_Date year prefix — never Date-parsed, so a Jan-1 close never
// rolls back to the prior Dec 31 across the UTC boundary. Both funded stage
// spellings are covered because the caller passes isFundedStage. This is the
// same basis as computeFundedYTD, so the chart's current-year bar and the
// pacing card's Funded YTD agree to the dollar.
export function fundedByYear(
  deals: RevenueDeal[],
  isFunded: (stage: string) => boolean,
): FundedYear[] {
  const byYear = new Map<number, FundedYear>()
  for (const d of deals) {
    if (!isFunded(d.stage) || !d.closingDate) continue
    const m = d.closingDate.match(/^(\d{4})-\d{2}-\d{2}/)
    if (!m) continue
    const year = Number(m[1])
    const row = byYear.get(year) ?? { year, volume: 0, count: 0 }
    row.volume += d.amount
    row.count += 1
    byYear.set(year, row)
  }
  return Array.from(byYear.values()).sort((a, b) => a.year - b.year)
}

export interface PracticeHistoryYearRow {
  year: number
  volume: number
  count: number
  isCurrent: boolean
  partial: boolean
}

// The contiguous year series the Practice History chart draws: every year
// from the first funded year through the current year, gaps filled with zero
// so the axis never skips a year. The current year is flagged (its bar takes
// the funded-plus-projection split) and 2021 is flagged partial — the
// earliest funded record is April 2021, so the year has no Jan-Mar history.
export function practiceHistoryYears(
  deals: RevenueDeal[],
  isFunded: (stage: string) => boolean,
  currentYear: number,
): PracticeHistoryYearRow[] {
  const funded = fundedByYear(deals, isFunded)
  if (funded.length === 0) return []
  const first = funded[0].year
  const last = Math.max(currentYear, funded[funded.length - 1].year)
  const byYear = new Map(funded.map(y => [y.year, y]))
  const out: PracticeHistoryYearRow[] = []
  for (let yr = first; yr <= last; yr++) {
    const f = byYear.get(yr)
    out.push({
      year: yr,
      volume: f?.volume ?? 0,
      count: f?.count ?? 0,
      isCurrent: yr === currentYear,
      partial: yr === 2021,
    })
  }
  return out
}

// ─── Mix breakdowns (render only real coverage) ─────────────────────────────
// A dimension renders as a mix chart only when at least MIN_MIX_COVERAGE of
// the funded window carries a value (Part 1: Transaction_Type 100%,
// Rate_Type and Term_Years 90.9%, Mortgage_Type 72.7% — in; LTV 63.6%,
// Term_Type 54.5%, Lender_Name 27.3% — out, stated honestly).

export const MIN_MIX_COVERAGE = 0.7

export interface MixRow {
  key: string
  count: number
  volume: number
}

export interface MixResult {
  label: string
  coveredCount: number
  totalCount: number
  coverage: number
  renders: boolean
  rows: MixRow[]
}

export function mixBreakdown(
  deals: RevenueDeal[],
  label: string,
  accessor: (d: RevenueDeal) => string | null,
): MixResult {
  const rows = new Map<string, MixRow>()
  let covered = 0
  for (const d of deals) {
    const raw = accessor(d)
    const v = raw == null || String(raw).trim() === '' ? null : String(raw).trim()
    if (v === null) continue
    covered += 1
    const row = rows.get(v) ?? { key: v, count: 0, volume: 0 }
    row.count += 1
    row.volume += d.amount
    rows.set(v, row)
  }
  const coverage = deals.length > 0 ? covered / deals.length : 0
  return {
    label,
    coveredCount: covered,
    totalCount: deals.length,
    coverage,
    renders: deals.length > 0 && coverage >= MIN_MIX_COVERAGE,
    rows: Array.from(rows.values()).sort((a, b) => b.count - a.count),
  }
}

// ─── Goal pacing, deep view ──────────────────────────────────────────────────
// Monthly funded against the straight-line monthly slice of the annual
// target, cumulative both ways. The files-to-close figure is an estimate
// (gap over the trailing average funded size) and the page labels it so.

export interface PacingMonth {
  month: string
  funded: number
  fundedCount: number
  cumulativeFunded: number
  cumulativeTarget: number
}

export function pacingByMonth(
  deals: RevenueDeal[],
  year: number,
  annualTarget: number,
  todayYMD: string,
  isFunded: (stage: string) => boolean,
): PacingMonth[] {
  const currentMonth = todayYMD.slice(0, 7)
  const monthly = annualTarget / 12
  const out: PacingMonth[] = []
  let cumulative = 0
  for (let m = 1; m <= 12; m++) {
    const ym = `${year}-${String(m).padStart(2, '0')}`
    if (ym > currentMonth) break
    let funded = 0
    let count = 0
    for (const d of deals) {
      if (!isFunded(d.stage) || !d.closingDate) continue
      if (d.closingDate.slice(0, 7) !== ym) continue
      funded += d.amount
      count += 1
    }
    cumulative += funded
    out.push({
      month: ym,
      funded,
      fundedCount: count,
      cumulativeFunded: cumulative,
      cumulativeTarget: monthly * m,
    })
  }
  return out
}

// Estimated files needed to close a dollar gap, from the trailing average
// funded size. Null when the gap is closed or no trailing fundings exist
// to average (never divides by zero, never invents a size).
export function filesToCloseGap(gapDollars: number, trailingFunded: RevenueDeal[]): number | null {
  if (gapDollars <= 0) return null
  if (trailingFunded.length === 0) return null
  const avg = trailingFunded.reduce((s, d) => s + d.amount, 0) / trailingFunded.length
  if (avg <= 0) return null
  return Math.ceil(gapDollars / avg)
}

// ─── Leads by source (the funnel's lead-level breakdown) ────────────────────

export interface LeadShape {
  leadSource: string | null
  createdTime: string | null
}

export interface LeadSourceRow {
  source: string
  count: number
}

export function leadsBySource(
  leads: LeadShape[],
  todayYMD: string,
  monthsBack = 12,
): { rows: LeadSourceRow[]; total: number; unsourced: number } {
  const startMonth = monthAdd(todayYMD.slice(0, 7), -(monthsBack - 1))
  const rows = new Map<string, number>()
  let total = 0
  let unsourced = 0
  for (const l of leads) {
    if (!l.createdTime || l.createdTime.slice(0, 7) < startMonth) continue
    total += 1
    if (!l.leadSource) {
      unsourced += 1
      continue
    }
    rows.set(l.leadSource, (rows.get(l.leadSource) ?? 0) + 1)
  }
  return {
    rows: Array.from(rows.entries())
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
    total,
    unsourced,
  }
}
