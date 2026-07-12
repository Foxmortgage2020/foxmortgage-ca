// Pipeline staleness — pure functions, no I/O, no clock read (callers pass
// todayYMD). Unit tests: tests/pipeline-hygiene.test.ts. This is the single
// source of truth for whether an OPEN deal is real active pipeline or
// un-groomed debt; every pipeline surface routes its open set through it so
// the "active pipeline" figure means the same thing everywhere.
//
// The rule and the reason the created-age arm replaces "no activity in 180
// days" are documented in config/pipeline.ts (STALE_CLOSING_DAYS /
// STALE_CREATED_DAYS). Short version: activity timestamps on this Zoho
// instance are Finmo-mass-synced and worthless, so deal age since creation
// is the reliable stand-in for a file that has sat open without moving.

import { STALE_CLOSING_DAYS, STALE_CREATED_DAYS } from '@/config/pipeline'
import { ymdAddDays } from '@/lib/dates'

// Minimal shape the rule needs — just the two dates. Both SlimDeal and
// RevenueDeal satisfy it (and so does the forecast's deal shape). The rule
// deliberately does not read the stage: staleness is about the file having
// gone quiet, not about which open stage it sits in.
export interface HygieneDeal {
  closingDate: string | null
  createdTime: string | null
}

// 'lapsed'  — close date is more than STALE_CLOSING_DAYS in the past; the
//             file should have closed and was never marked lost.
// 'dormant' — created more than STALE_CREATED_DAYS ago and still open; the
//             activity-age proxy for a file with no forward movement.
export type StaleReason = 'lapsed' | 'dormant'

export interface StaleCutoffs {
  // Any closingDate strictly before this is more than STALE_CLOSING_DAYS old.
  closingCutoff: string
  // Any createdTime strictly before this is more than STALE_CREATED_DAYS old.
  createdCutoff: string
}

export function staleCutoffs(todayYMD: string): StaleCutoffs {
  return {
    closingCutoff: ymdAddDays(todayYMD, -STALE_CLOSING_DAYS),
    createdCutoff: ymdAddDays(todayYMD, -STALE_CREATED_DAYS),
  }
}

// The reason an OPEN deal is stale, or null if it is real active pipeline.
// Precedence: a lapsed close date is the more specific, more actionable
// finding, so it wins over dormancy when both are true.
export function staleReason(deal: HygieneDeal, cutoffs: StaleCutoffs): StaleReason | null {
  const close = deal.closingDate ? deal.closingDate.slice(0, 10) : null
  if (close && close < cutoffs.closingCutoff) return 'lapsed'
  const created = deal.createdTime ? deal.createdTime.slice(0, 10) : null
  if (created && created < cutoffs.createdCutoff) return 'dormant'
  return null
}

// Convenience for a single deal (recomputes cutoffs; prefer classifyOpenDeals
// for a list so the cutoffs are computed once).
export function isStaleOpenDeal(deal: HygieneDeal, todayYMD: string): boolean {
  return staleReason(deal, staleCutoffs(todayYMD)) !== null
}

export interface OpenClassification<T> {
  active: T[]
  stale: Array<T & { staleReason: StaleReason }>
}

// Partition an already-open deal set (terminal and summary stages must be
// removed by the caller) into real active pipeline and the stale bucket.
export function classifyOpenDeals<T extends HygieneDeal>(
  deals: T[],
  todayYMD: string,
): OpenClassification<T> {
  const cutoffs = staleCutoffs(todayYMD)
  const active: T[] = []
  const stale: Array<T & { staleReason: StaleReason }> = []
  for (const d of deals) {
    const reason = staleReason(d, cutoffs)
    if (reason === null) active.push(d)
    else stale.push({ ...d, staleReason: reason })
  }
  return { active, stale }
}
