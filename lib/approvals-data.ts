// Shared loader for the approvals desk: the server page renders it as
// initial data and /api/portal/admin/approvals/queues serves the same
// shape for post-decision reconciliation refetches. Reads granted tables
// only; every branch degrades to an honest empty-with-error state.

import {
  getCommsQueue,
  getKnowledgeClaimQueue,
  getKnowledgeDocuments,
  getLastDecided,
  getOfferQueue,
  getOpenDiscrepancyFlags,
  getOpenFlagCards,
  getRateSheetQueue,
  getShadowQueue,
  getStatementQueue,
  type CommsQueueItem,
  type DiscrepancyFlag,
  type KnowledgeClaimRow,
  type KnowledgeDocumentRow,
  type LastDecided,
  type OfferQueueCard,
  type OpenFlagCard,
  type ShadowQueueCard,
  type SheetQueueCard,
  type StatementQueueCard,
  type UwResult,
} from '@/lib/underwriting'
import { partitionSheetQueue, type ParkedSheet } from '@/lib/sheet-park'

export interface ApprovalsData {
  statements: StatementQueueCard[]
  discrepancies: DiscrepancyFlag[]
  /** The ACTIONABLE sheet queue: province-excluded lenders' sheets are
   * parked out (parkedSheets below), so the queue holds only sheets Michael
   * can genuinely decide. */
  sheets: SheetQueueCard[]
  /** Sheets from lenders the registry excludes from every serviceable
   * market: visible on a shelf, never in the queue, auto-released the day
   * the registry confirms a serviceable province. */
  parkedSheets: ParkedSheet<SheetQueueCard>[]
  // Extracted promotional offers awaiting approval.
  offers: OfferQueueCard[]
  // Live-file flags: these drive the tab badge and the main queue.
  flags: OpenFlagCard[]
  // Open flags whose deal is terminal (funded and the like): cleanup, not
  // urgency. Rendered in a collapsed section, never counted in the badge.
  flagsOnClosed: OpenFlagCard[]
  shadow: ShadowQueueCard[]
  // Pending lender-knowledge claims (the Knowledge tab), grouped by their
  // source document at render time; knowledgeDocs exists to NAME those
  // documents (doc_type), all lenders.
  knowledgeClaims: KnowledgeClaimRow[]
  knowledgeDocs: KnowledgeDocumentRow[]
  // B7-P: pending outbound client-comms touches (stage updates, chases, review
  // asks) awaiting Michael's approval. Read-here, decide-through-the-gate.
  comms: CommsQueueItem[]
  lastDecided: LastDecided
  // Per-queue fetch problems, keyed for honest per-tab error banners.
  errors: Partial<Record<'statements' | 'sheets' | 'offers' | 'flags' | 'shadow' | 'knowledge' | 'comms', string>>
}

function take<T>(res: UwResult<T[]>, fallback: T[] = []): { data: T[]; error?: string } {
  if (!res.configured) return { data: fallback, error: 'Workbench not connected' }
  if (!res.ok) return { data: fallback, error: res.error }
  return { data: res.data }
}

export async function getApprovalsData(agentId: string): Promise<ApprovalsData> {
  const [stmtsR, discR, sheetsR, offersR, flagsR, shadowR, kclaimsR, kdocsR, commsR, lastR] = await Promise.all([
    getStatementQueue(agentId),
    getOpenDiscrepancyFlags(agentId),
    getRateSheetQueue(agentId),
    getOfferQueue(agentId),
    getOpenFlagCards(agentId),
    getShadowQueue(agentId),
    getKnowledgeClaimQueue(agentId),
    getKnowledgeDocuments(agentId),
    getCommsQueue(agentId),
    getLastDecided(agentId),
  ])
  const stmts = take(stmtsR)
  const disc = take(discR)
  const sheets = take(sheetsR)
  const offers = take(offersR)
  const flags = take(flagsR)
  const shadow = take(shadowR)
  const kclaims = take(kclaimsR)
  const kdocs = take(kdocsR)
  const comms = take(commsR)
  const errors: ApprovalsData['errors'] = {}
  if (stmts.error) errors.statements = stmts.error
  if (sheets.error) errors.sheets = sheets.error
  if (offers.error) errors.offers = offers.error
  if (flags.error) errors.flags = flags.error
  if (shadow.error) errors.shadow = shadow.error
  if (comms.error) errors.comms = comms.error
  // Either read failing degrades the tab honestly: a docs failure means
  // claims render under "Untitled document", which is a partial load too.
  if (kclaims.error || kdocs.error) errors.knowledge = kclaims.error ?? kdocs.error
  const sheetSplit = partitionSheetQueue(sheets.data)
  return {
    statements: stmts.data,
    discrepancies: disc.data,
    sheets: sheetSplit.actionable,
    parkedSheets: sheetSplit.parked,
    offers: offers.data,
    flags: flags.data.filter(f => !f.dealTerminal),
    flagsOnClosed: flags.data.filter(f => f.dealTerminal),
    shadow: shadow.data,
    knowledgeClaims: kclaims.data,
    knowledgeDocs: kdocs.data,
    comms: comms.data,
    lastDecided:
      lastR.configured && lastR.ok
        ? lastR.data
        : { statements: null, rates: null, flags: null, shadow: null },
    errors,
  }
}
