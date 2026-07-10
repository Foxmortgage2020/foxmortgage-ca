// Pure derivations for the rates browser digest strip. Honesty rule: a
// week-over-week delta only renders when a lender actually has quotes on
// two distinct sheet dates; otherwise the strip shows the sheet date
// instead of a fake trend.

import type { RateQuoteBrowserRow } from '@/lib/underwriting'

export interface LenderDigest {
  lenderSlug: string
  newestApprovedAsOf: string | null
  approvedCount: number
  // Median rate movement between the two most recent sheet dates (approved
  // plus superseded history), when two dates exist. Null means the data
  // cannot support a delta.
  medianDelta: number | null
  previousAsOf: string | null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

export function computeLenderDigests(quotes: RateQuoteBrowserRow[]): LenderDigest[] {
  const byLender = new Map<string, RateQuoteBrowserRow[]>()
  for (const q of quotes) {
    if (!byLender.has(q.lenderSlug)) byLender.set(q.lenderSlug, [])
    byLender.get(q.lenderSlug)!.push(q)
  }
  const digests: LenderDigest[] = []
  byLender.forEach((rows, lenderSlug) => {
    const approved = rows.filter(r => r.status === 'approved')
    const newestApprovedAsOf = approved.reduce<string | null>(
      (max, r) => (r.asOfDate && (!max || r.asOfDate > max) ? r.asOfDate : max),
      null,
    )
    const dates = Array.from(
      new Set(rows.map(r => r.asOfDate).filter((d): d is string => Boolean(d))),
    ).sort((a, b) => b.localeCompare(a))
    let medianDelta: number | null = null
    let previousAsOf: string | null = null
    if (dates.length >= 2) {
      const latest = median(rows.filter(r => r.asOfDate === dates[0]).map(r => r.rate))
      const prev = median(rows.filter(r => r.asOfDate === dates[1]).map(r => r.rate))
      if (latest !== null && prev !== null) {
        medianDelta = Number((latest - prev).toFixed(3))
        previousAsOf = dates[1]
      }
    }
    digests.push({ lenderSlug, newestApprovedAsOf, approvedCount: approved.length, medianDelta, previousAsOf })
  })
  return digests.sort((a, b) => a.lenderSlug.localeCompare(b.lenderSlug))
}
