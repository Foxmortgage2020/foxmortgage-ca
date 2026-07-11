// Shared loader for the approvals desk: the server page renders it as
// initial data and /api/portal/admin/approvals/queues serves the same
// shape for post-decision reconciliation refetches. Reads granted tables
// only; every branch degrades to an honest empty-with-error state.

import {
  getLastDecided,
  getOfferQueue,
  getOpenDiscrepancyFlags,
  getOpenFlagCards,
  getRateSheetQueue,
  getShadowQueue,
  getStatementQueue,
  type DiscrepancyFlag,
  type LastDecided,
  type OfferQueueCard,
  type OpenFlagCard,
  type ShadowQueueCard,
  type SheetQueueCard,
  type StatementQueueCard,
  type UwResult,
} from '@/lib/underwriting'

export interface ApprovalsData {
  statements: StatementQueueCard[]
  discrepancies: DiscrepancyFlag[]
  sheets: SheetQueueCard[]
  // Extracted promotional offers awaiting approval.
  offers: OfferQueueCard[]
  // Live-file flags: these drive the tab badge and the main queue.
  flags: OpenFlagCard[]
  // Open flags whose deal is terminal (funded and the like): cleanup, not
  // urgency. Rendered in a collapsed section, never counted in the badge.
  flagsOnClosed: OpenFlagCard[]
  shadow: ShadowQueueCard[]
  lastDecided: LastDecided
  // Per-queue fetch problems, keyed for honest per-tab error banners.
  errors: Partial<Record<'statements' | 'sheets' | 'offers' | 'flags' | 'shadow', string>>
}

function take<T>(res: UwResult<T[]>, fallback: T[] = []): { data: T[]; error?: string } {
  if (!res.configured) return { data: fallback, error: 'Workbench not connected' }
  if (!res.ok) return { data: fallback, error: res.error }
  return { data: res.data }
}

export async function getApprovalsData(agentId: string): Promise<ApprovalsData> {
  const [stmtsR, discR, sheetsR, offersR, flagsR, shadowR, lastR] = await Promise.all([
    getStatementQueue(agentId),
    getOpenDiscrepancyFlags(agentId),
    getRateSheetQueue(agentId),
    getOfferQueue(agentId),
    getOpenFlagCards(agentId),
    getShadowQueue(agentId),
    getLastDecided(agentId),
  ])
  const stmts = take(stmtsR)
  const disc = take(discR)
  const sheets = take(sheetsR)
  const offers = take(offersR)
  const flags = take(flagsR)
  const shadow = take(shadowR)
  const errors: ApprovalsData['errors'] = {}
  if (stmts.error) errors.statements = stmts.error
  if (sheets.error) errors.sheets = sheets.error
  if (offers.error) errors.offers = offers.error
  if (flags.error) errors.flags = flags.error
  if (shadow.error) errors.shadow = shadow.error
  return {
    statements: stmts.data,
    discrepancies: disc.data,
    sheets: sheets.data,
    offers: offers.data,
    flags: flags.data.filter(f => !f.dealTerminal),
    flagsOnClosed: flags.data.filter(f => f.dealTerminal),
    shadow: shadow.data,
    lastDecided:
      lastR.configured && lastR.ok
        ? lastR.data
        : { statements: null, rates: null, flags: null, shadow: null },
    errors,
  }
}
