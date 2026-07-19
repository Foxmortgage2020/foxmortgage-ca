// Deal room — one page per workbench deal, assembled from the granted
// 16-table surface. Provenance is the product: every value that stores a
// citation, calc version, or inputs hash renders it.
//
// B2b (Direction 2): the room is PHASE-LED. A navy header band carries the
// client, ref, and the Amount / Closes stats; the journey stepper wears the
// direction's node treatment; the current phase's section renders first and
// open (its step list leading), every other phase collapses to one honest
// line. Existing surfaces are REPARENTED under their phase sections — no
// logic, fetcher, or gate changes: Documents + uploader and Submission
// notes live under Underwriting, the conditions desk under Fulfilment, and
// the new read-only compliance panel (Zoho Compliance_Status) under
// Complete & paid. File-level records (flags, posture, constraints, audit)
// stay below as their own cards.
//
// Attempt-and-fallback (Session 4 standing rule): every section queries its
// tables and falls back to the not-granted state only on an actual
// permission refusal (42501/HTTP 403) or absence, never as a hardcoded
// placeholder. Grants land in the workbench repo; this page follows.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { can, requirePermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { isTerminalWorkbenchDeal } from '@/config/pipeline'
import {
  getAgentIdByEmail,
  getApprovedConditions,
  getDealAudit,
  getDealBorrowers,
  getDealDetail,
  getDealDocuments,
  getDealDocumentRequests,
  getDealRequestReviews,
  getDealRequestDecisions,
  getDealFlags,
  getDealIncomeCalcs,
  getDealLenderNotes,
  getDealFinmoSnapshot,
  getDealContextCounts,
  getDealRatioCalcs,
  getDealShadowHistory,
  getDealStatementDocs,
  getPendingCommitmentConditions,
  getRateQuotesFull,
  isPermissionRefusal,
  type UwResult,
  getRenewalSequenceStates,
  getDealCommsTimeline,
} from '@/lib/underwriting'
import { getDealCloseout } from '@/lib/zoho-admin'
import { resolveClosingDate } from '@/lib/closing-date'
import ConditionsChecklist from '@/components/admin/ConditionsChecklist'
import CommitmentUploader from '@/components/admin/CommitmentUploader'
import DocumentUploader from '@/components/admin/DocumentUploader'
import LenderNotesCard from '@/components/admin/LenderNotesCard'
import ComplianceCard from '@/components/admin/ComplianceCard'
import ClientConstraints from '@/components/admin/ClientConstraints'
import ClientPortalCard from '@/components/admin/ClientPortalCard'
import ClientPresentationCard from '@/components/admin/ClientPresentationCard'
import DealCommsCard from '@/components/admin/deals/DealCommsCard'
import { clientLinksForDeal } from '@/lib/client-links-store'
import { scenariosForDeal, offersForDeal, lettersForDeal } from '@/lib/client-presentation-store'
import { buildOfferPickList } from '@/lib/client-presentation'
import PhaseSection from '@/components/admin/deals/PhaseSection'
import StepList from '@/components/admin/deals/StepList'
import CloseoutPanel from '@/components/admin/deals/CloseoutPanel'
import StatusChip from '@/components/admin/ds/StatusChip'
import DocumentsDesk from '@/components/admin/deals/DocumentsDesk'
import { buildRequestsDesk, residualDocuments } from '@/lib/documents-desk'
import type { BorrowerInfo, ResidualDoc } from '@/lib/documents-desk'
import { scenarioFromParams, scenarioParamsFromDeal, scenarioVerdict } from '@/lib/scenario'
import { activeConstraints } from '@/lib/constraints'
import { constraintsFor } from '@/lib/constraints-store'
import { dealConstraintCost, costSentence } from '@/lib/constraint-cost'
import { closingHeaderAmber } from '@/lib/conditions-status'
import { daysUntil } from '@/lib/compliance-logic'
import { lenderDisplayName } from '@/config/lenders'
import { fmtDateTime, fmtMoney, fmtShortDate, torontoTodayYMD } from '@/lib/dates'
import { dealGoalDisplay, resolveShape, headerValue } from '@/lib/deal-goal'
import { currentAndHistory } from '@/lib/calc-history'
import type { RatioCalcRow, IncomeCalcRow } from '@/lib/underwriting'
import {
  journeyForStage,
  stepShapeFor,
  PHASE_STEPS,
  type JourneyStep,
  type PhaseKey,
} from '@/config/lifecycle'
import {
  clientFromDealName,
  closeoutStepStates,
  complianceStateFor,
} from '@/lib/deals-surface'
import JourneyStepper from '@/components/admin/JourneyStepper'

export const dynamic = 'force-dynamic'

function val<T>(r: UwResult<T> | null): T | null {
  return r && r.configured && r.ok ? r.data : null
}

const label = (s: string) => s.replace(/_/g, ' ')

type SectionState<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'not-granted' }
  | { kind: 'error'; message: string }

function sectionState<T>(res: UwResult<T>): SectionState<T> {
  if (res.configured && res.ok) return { kind: 'ok', data: res.data }
  if (isPermissionRefusal(res)) return { kind: 'not-granted' }
  return {
    kind: 'error',
    message: res.configured && !res.ok ? res.error : 'Workbench not connected',
  }
}

// A file-level card below the phase sections (flags, posture, audit).
function Section({
  title,
  children,
  action,
  id,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  id?: string
}) {
  return (
    <div id={id} className="scroll-mt-24 bg-white border border-cool-200 rounded-[9px] p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading text-navy font-bold text-[15px]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  )
}

// A surface inside a phase section (reparented, not rebuilt).
function Sub({
  title,
  children,
  action,
  id,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
  id?: string
}) {
  return (
    <div id={id} className="scroll-mt-24 mt-5 border-t border-cool-100 pt-4 first:mt-0 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading text-navy font-semibold text-[13px]">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  )
}

function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-cool-500 font-ui">{children}</p>
}

function SectionFallback({ state, notGrantedCopy }: { state: SectionState<unknown>; notGrantedCopy: string }) {
  if (state.kind === 'not-granted') return <Muted>{notGrantedCopy}</Muted>
  return <Muted>This section did not load: {state.kind === 'error' ? state.message : 'unknown'}. Reload to retry.</Muted>
}

// The status chip is the design system's (extracted in B3, byte-identical).
const Chip = StatusChip

// Calc provenance line: the version and inputs hash the workbench stores
// beside every calculation. Never render a calc stripped of these.
function CalcProvenance({ version, hash, at }: { version: string; hash: string; at: string }) {
  return (
    <p className="text-[11px] text-cool-500 font-ui mt-0.5 tabular-nums">
      calc {version} · inputs {hash.slice(0, 12)} · {fmtDateTime(at)}
    </p>
  )
}

// A single ratio calc row (Task 5). `muted` renders a folded history entry.
function RatioCard({ r, muted }: { r: RatioCalcRow; muted?: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${muted ? 'border-cool-100 bg-cool-50/60' : 'border-cool-100'}`}>
      <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm font-ui tabular-nums ${muted ? 'opacity-70' : ''}`}>
        {r.lenderSlug && <Chip tone="gray">{r.lenderSlug}</Chip>}
        <span className="text-cool-600">GDS <span className="text-navy font-semibold">{r.gds ?? 'n/a'}</span></span>
        <span className="text-cool-600">TDS <span className="text-navy font-semibold">{r.tds ?? 'n/a'}</span></span>
        <span className="text-cool-600">LTV <span className="text-navy font-semibold">{r.ltv ?? 'n/a'}</span></span>
        <span className="text-cool-600">Qual rate <span className="text-navy font-semibold">{r.qualRate ?? 'n/a'}</span></span>
        <span className="text-cool-600">
          Pmt <span className="text-navy font-semibold">{r.pmtContract !== null ? fmtMoney(r.pmtContract) : 'n/a'}</span>
          {r.pmtStress !== null ? ` (stress ${fmtMoney(r.pmtStress)})` : ''}
        </span>
      </div>
      <CalcProvenance version={r.calcVersion} hash={r.inputsHash} at={r.createdAt} />
    </div>
  )
}

// A single income calc row (Task 5).
function IncomeCard({ c, muted }: { c: IncomeCalcRow; muted?: boolean }) {
  return (
    <div className={`border rounded-lg p-3 ${muted ? 'border-cool-100 bg-cool-50/60' : 'border-cool-100'}`}>
      <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm font-ui tabular-nums ${muted ? 'opacity-70' : ''}`}>
        <span className="text-navy font-semibold">{fmtMoney(c.resultAnnual)}/yr</span>
        <span className="text-cool-600 capitalize">{label(c.basis)}</span>
        {c.lenderSlug && <Chip tone="gray">{c.lenderSlug}</Chip>}
      </div>
      <CalcProvenance version={c.calcVersion} hash={c.inputsHash} at={c.createdAt} />
    </div>
  )
}

// The current calc + a folded "History (N)" of prior recomputes (Task 5).
function CalcHistory({ count, children }: { count: number; children: React.ReactNode }) {
  if (count === 0) return null
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer font-ui text-[11px] font-semibold text-cool-500 hover:text-navy">
        History ({count})
      </summary>
      <div className="mt-1.5 space-y-1.5">{children}</div>
    </details>
  )
}

// Navy band stat (Direction 2).
function BandStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-heading text-[11px] font-semibold tracking-[0.05em] text-white/55">{label}</p>
      <p className="mt-0.5 font-ui text-[15px] font-semibold text-white tabular-nums">{children}</p>
    </div>
  )
}

export default async function DealRoomPage({ params }: { params: { id: string } }) {
  const user = await requirePermission('deals.view')

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  if (!agentId) {
    return (
      <div className="max-w-4xl">
        <h1 className="font-heading text-navy text-2xl font-bold">Deal room</h1>
        <div className="mt-6 bg-white border border-cool-200 rounded-[9px] p-5">
          <p className="text-sm text-cool-600 font-ui">
            Workbench not available right now. See Status for details.
          </p>
        </div>
      </div>
    )
  }

  const dealRes = await getDealDetail(agentId, params.id)
  const deal = val(dealRes)
  if (dealRes.configured && dealRes.ok && !deal) notFound()
  if (!deal) {
    return (
      <div className="max-w-4xl">
        <h1 className="font-heading text-navy text-2xl font-bold">Deal room</h1>
        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-[9px] p-5">
          <p className="text-sm text-amber-800 font-ui">The workbench did not answer for this deal. Reload to retry.</p>
        </div>
      </div>
    )
  }

  // B8b: the client presentation reads. In demo the stores return synthetic
  // rows without a fetch; the offer pick list only loads for an admin who can
  // author (never in demo), so a non-authoring room never pays the rate-book read.
  const canPresent = can(user, 'client.presentation.manage') && !isDemoMode()
  const [condsR, pendingCommitR, flagsR, stmtDocsR, shadowR, auditR, borrowersR, incomeR, ratiosR, documentsR, requestsR, reviewsR, decisionsR, lenderNotesR, finmoSnapR, contextCountsR, commsTimelineR, closeoutR, clientLinksR, scenariosR, offersR, lettersR, pickQuotesR] =
    await Promise.all([
      // The room CHECKLIST is approved conditions only; pending commitment
      // conditions are the approval banner, invisible to the checklist until
      // the list gate fires.
      getApprovedConditions(agentId, deal.id),
      getPendingCommitmentConditions(agentId, deal.id),
      getDealFlags(agentId, deal.id),
      getDealStatementDocs(agentId, deal.id),
      getDealShadowHistory(agentId, deal.id),
      getDealAudit(agentId, deal.id, 25),
      getDealBorrowers(agentId, deal.id),
      getDealIncomeCalcs(agentId, deal.id),
      getDealRatioCalcs(agentId, deal.id),
      getDealDocuments(agentId, deal.id),
      getDealDocumentRequests(agentId, deal.id),
      // B6.4: the AI request verdicts (document_request_reviews) and Michael's own
      // recorded decisions (document_request_decisions).
      getDealRequestReviews(agentId, deal.id),
      getDealRequestDecisions(agentId, deal.id),
      getDealLenderNotes(agentId, deal.id),
      getDealFinmoSnapshot(agentId, deal.id),
      getDealContextCounts(agentId, deal.id, deal.zohoPotentialId, deal.createdAt),
      // B7-P: the per-deal client-comms timeline (sent + pending touches +
      // suppression state), read-only via portal_readonly.
      getDealCommsTimeline(agentId, deal.zohoPotentialId),
      // B2b: the read-only closeout read (Deal_Name for the band,
      // Compliance_Status + the commission truth for Complete & paid).
      deal.zohoPotentialId
        ? getDealCloseout(deal.zohoPotentialId).catch(() => null)
        : Promise.resolve(null),
      // B5: the client-portal links for this deal. Metadata only — the store
      // never returns a token or a hash.
      deal.zohoPotentialId
        ? clientLinksForDeal(deal.zohoPotentialId).catch(() => null)
        : Promise.resolve(null),
      // B8b: the client presentation (scenarios, graded offers, the letter).
      deal.zohoPotentialId ? scenariosForDeal(deal.zohoPotentialId).catch(() => null) : Promise.resolve(null),
      deal.zohoPotentialId ? offersForDeal(deal.zohoPotentialId).catch(() => null) : Promise.resolve(null),
      deal.zohoPotentialId ? lettersForDeal(deal.zohoPotentialId).catch(() => null) : Promise.resolve(null),
      canPresent ? getRateQuotesFull(agentId).catch(() => null) : Promise.resolve(null),
    ])
  const conds = val(condsR) ?? []
  const pendingCommit = val(pendingCommitR) ?? []
  const flags = val(flagsR) ?? []
  const stmtDocs = val(stmtDocsR) ?? []
  const shadow = val(shadowR) ?? []
  const audit = val(auditR) ?? []
  const borrowers = sectionState(borrowersR)
  const income = sectionState(incomeR)
  const ratios = sectionState(ratiosR)
  const documents = sectionState(documentsR)
  const lenderNoteDraft = val(lenderNotesR) ?? null
  const finmoSnap = val(finmoSnapR) ?? null
  const contextCounts = val(contextCountsR) ?? { calls: 0, emails: 0 }
  const commsTimeline = val(commsTimelineR) ?? { hasSequences: false, sent: [], pending: [], suppression: null }
  const closeout = closeoutR
  const clientLinks =
    clientLinksR && clientLinksR.configured && clientLinksR.ok ? clientLinksR.data : []
  const clientScenarios = scenariosR && scenariosR.configured && scenariosR.ok ? scenariosR.data : []
  const clientOffers = offersR && offersR.configured && offersR.ok ? offersR.data : []
  const clientLetters = lettersR && lettersR.configured && lettersR.ok ? lettersR.data : []
  const offerPickList =
    pickQuotesR && pickQuotesR.configured && pickQuotesR.ok ? buildOfferPickList(pickQuotesR.data) : []
  // The Finmo-carried requested rate (for the readiness "Rate" row), read from
  // the snapshot's mapped requested block when present.
  const finmoRequested = (finmoSnap?.mapped?.requested ?? null) as { rate?: number | null } | null
  const borrowerList = borrowers.kind === 'ok' ? borrowers.data.map(b => ({ id: b.id, fullName: b.fullName })) : []
  const borrowerNameById = new Map(borrowerList.map(b => [b.id, b.fullName]))

  // The documents desk (B6.2): the REQUEST is the unit. Build the desk from the
  // Finmo request list + the checklist (the bridge to verdicts + commitment-only
  // requests), grouping conditions into the right borrower section via the Finmo
  // id. Statement evidence reparents into each request's expansion by the analysis
  // document_id; anything unlinked stays in a residual block.
  const requests = val(requestsR) ?? []
  const reviews = val(reviewsR) ?? []
  const decisions = val(decisionsR) ?? []
  const borrowerInfoById = new Map<string, BorrowerInfo>(
    (borrowers.kind === 'ok' ? borrowers.data : []).map(b => [
      b.id,
      { finmoBorrowerId: b.finmoBorrowerId, fullName: b.fullName, relationship: b.relationship },
    ]),
  )
  const requestsDesk = buildRequestsDesk(requests, conds, borrowerInfoById, Date.now(), reviews, decisions)
  const requestsRefused = isPermissionRefusal(requestsR)
  // Statement evidence keyed by the document id (a documents.id) — the card
  // reparent AND the residual block both look up by it.
  const evidenceByDocId: Record<string, (typeof stmtDocs)[number]> = {}
  for (const d of stmtDocs) evidenceByDocId[d.documentId] = d
  const linkedDocIds = new Set(
    requestsDesk.sections.flatMap(s => s.cards.map(c => c.documentId).filter((x): x is string => !!x)),
  )
  // Task 3 residual: documents collected but not tied to any Finmo request, plus
  // any statement evidence not reparented into a card — so nothing collected ever
  // becomes invisible (it graduates into a card when a pull links it).
  const residual: ResidualDoc[] = residualDocuments(documents.kind === 'ok' ? documents.data : [], linkedDocIds)
  const residualIds = new Set(residual.map(r => r.documentId))
  // A document that IS tied to a Finmo request must never fall under the "Not tied
  // to a request" header (even when its evidence didn't reparent into a card) — the
  // fallback only rescues genuinely request-less statement evidence.
  const requestTiedDocIds = new Set(
    (documents.kind === 'ok' ? documents.data : []).filter(d => d.finmoRequestId).map(d => d.id),
  )
  for (const d of stmtDocs) {
    if (!linkedDocIds.has(d.documentId) && !residualIds.has(d.documentId) && !requestTiedDocIds.has(d.documentId)) {
      residual.push({ key: `res:${d.documentId}`, documentId: d.documentId, kind: d.docClass, source: 'statement', date: null })
      residualIds.add(d.documentId)
    }
  }

  const today = torontoTodayYMD()
  const openConds = conds.filter(c => c.status !== 'satisfied' && c.status !== 'waived')
  const openFlags = flags.filter(f => f.status === 'open')
  const pendingStmtDocs = stmtDocs.filter(d => d.fields.some(f => f.status === 'extracted'))
  const terminal = isTerminalWorkbenchDeal(deal)
  // Phase B2: the approval banner + edit-then-approve + Verify are the
  // commitment-decisions key; Waive is the existing conditions.decide key (its
  // server proxy requires it), so the UI control uses the SAME key. Recompute
  // is open to every internal role that sees the room (read-only to Finmo).
  const canDecideCommitment = can(user, 'approvals.conditions.decide') && !isDemoMode()
  const canWaiveConditions = can(user, 'conditions.decide') && !isDemoMode()
  const canRecompute = can(user, 'conditions.recompute') && !isDemoMode()
  const canUploadCommitment = can(user, 'commitment.upload') && !isDemoMode()
  const canUploadDocument = can(user, 'document.upload') && !isDemoMode()
  // B6.4: approving a Finmo document request (or sending it back) is Michael's
  // human review, admin-only and refused in demo (both enforced server-side too).
  const canDecideDocRequest = can(user, 'approvals.document_request.decide') && !isDemoMode()
  // Notes generation is NOT gated on demo: in demo the button produces a canned
  // note client-side (zero real reads/writes; the proxy + gate client are
  // demo-blocked as defense in depth). Outside demo it calls the workbench.
  const canGenerateNotes = can(user, 'notes.generate')
  // The submission strip actions (pull / set target / insured / rate / save
  // edit). Like generate, NOT gated on demo: the client lib no-ops in demo.
  const canManageSubmission = can(user, 'submission.set')

  // "A commitment is present" is a REAL-provenance fact: a retired
  // synthetic/rejected commitment never counts (guardrail 20), so it can never
  // suppress the upload control. Fail toward offering the control when the
  // documents surface is unavailable.
  const documentRows = documents.kind === 'ok' ? documents.data : []
  const hasRealCommitment = documentRows.some(
    d =>
      (d.docType === 'signed_commitment' || d.docType === 'commitment_amendment') &&
      d.provenance === 'real' &&
      d.reviewStatus !== 'rejected',
  )

  // One closing-date rule (B8b Task 0): workbench first, Zoho (closeout) fallback.
  // The header read the workbench date alone; a file with only a Zoho date now
  // renders dated here too, matching the client's own page.
  const closingDate = resolveClosingDate(deal.closingDate, closeout?.closingDate ?? null)
  const closeDays = closingDate ? daysUntil(closingDate, today) : null
  const closingAmber = closingHeaderAmber(closeDays)

  // The journey (B1, room space — B2a left the room positioned by its own
  // stage; the board and list position from Zoho). The header chip's honesty
  // rule feeds the step shape: the Finmo goal wins a conflict.
  const finmoGoal = (finmoSnap?.mapped as { goal?: string } | null)?.goal ?? null
  const shape = stepShapeFor(deal.dealType, finmoGoal)
  const journey = journeyForStage({ stage: deal.stage, shape, space: 'room' })
  const showJourney = !terminal || journey.currentPhase === 'beyond_funding'

  const phaseState = (key: PhaseKey) =>
    journey.phases.find(p => p.key === key)?.state ?? ('upcoming' as const)
  const stepsFor = (key: PhaseKey): JourneyStep[] => {
    if (journey.mapped && journey.currentPhase === key) return journey.steps
    const st = phaseState(key)
    return PHASE_STEPS[key][shape].map(s => ({
      ...s,
      state: s.status === 'planned' ? 'upcoming' : st === 'done' ? 'done' : 'upcoming',
    }))
  }

  // Complete & paid (Task 6): stage places the file; the Zoho compliance
  // status and the recorded commission move the steps within the phase.
  const complianceState = complianceStateFor(
    closeout?.complianceStatus ?? null,
    closeout?.complianceRead ?? false,
    Boolean(deal.zohoPotentialId),
  )
  const commissionRecorded = (closeout?.totalCommission ?? null) !== null
  const closeoutStates = closeoutStepStates({
    phaseState: phaseState('complete_paid'),
    compliance: complianceState,
    commissionRecorded,
  })
  const closeoutSteps: JourneyStep[] = stepsFor('complete_paid').map(s => ({
    ...s,
    state:
      s.key === 'broker_complete'
        ? closeoutStates.broker
        : s.key === 'compliance_package'
          ? closeoutStates.compliance
          : s.key === 'paid'
            ? closeoutStates.paid
            : s.state,
  }))

  const clientName = clientFromDealName(closeout?.dealName ?? null, deal.fileRef)

  // Renewal drip state for this room (renewal-drip session, 2026-07-16):
  // matched by the deal's Zoho id; absent when the client is not enrolled.
  let dripLine: string | null = null
  if (deal.zohoPotentialId) {
    const dripRes = await getRenewalSequenceStates(agentId)
    if (dripRes.configured && dripRes.ok) {
      const st = dripRes.data.find((x) => x.zohoDealId === deal.zohoPotentialId)
      if (st) {
        dripLine = st.status === 'active'
          ? `Renewal drip active${st.nextTouch ? ` · next touch ${st.nextTouch.skeletonId.replace('touch-', '')}d (${st.nextTouch.status.replace(/_/g, ' ')})` : ''} · ${st.sentCount} sent`
          : `Renewal drip ${st.status}${st.exitReason ? ` (${st.exitReason.replace(/_/g, ' ')})` : ''}`
      }
    }
  }

  // Part 4 — suitability documentation: an active client constraint with its
  // reason AND a quantified cost is the documented suitability assessment FSRA
  // names. Fetch the active constraints and compute the cost from the eligible
  // fixed book (province + program filtered), then hand the top one to the
  // compliance card, which counts it toward documented posture.
  const clientKey = deal.zohoPotentialId ?? deal.fileRef
  const constraintsRes = await constraintsFor(clientKey)
  const activeList = activeConstraints(
    constraintsRes.configured && constraintsRes.ok ? constraintsRes.data : [],
  )
  let complianceConstraint: {
    type: (typeof activeList)[number]['type']
    lenderLabel: string
    reason: string
    costSentence: string
    actingEmail: string
    createdAt: string
  } | null = null
  if (activeList.length > 0) {
    const scenario = scenarioFromParams(
      scenarioParamsFromDeal({
        fileRef: deal.fileRef,
        dealType: deal.dealType,
        mortgageAmount: deal.mortgageAmount,
        purchasePrice: deal.purchasePrice,
      }),
    )
    const quotesR = await getRateQuotesFull(agentId)
    const book = quotesR.configured && quotesR.ok ? quotesR.data : []
    const eligibleAll = book
      .filter(q => q.status === 'approved' && q.rateType === 'fixed' && q.rate != null && q.productClass === scenario.productClass)
      .filter(q => scenarioVerdict(q, scenario).category === 'eligible')
      .map(q => ({ lenderSlug: q.lenderSlug, rate: q.rate as number, termMonths: q.termMonths }))
    // Compare like terms: the standard 5-year (60mo) subset, so a 1-year teaser
    // never masquerades as a lender's best against another lender's 5-year.
    const sameTerm = eligibleAll.filter(q => q.termMonths === 60)
    const eligibleFixed = (sameTerm.length > 0 ? sameTerm : eligibleAll).map(q => ({ lenderSlug: q.lenderSlug, rate: q.rate }))
    const cost = dealConstraintCost(eligibleFixed, lenderDisplayName, activeList, deal.mortgageAmount, 25, 60)
    // Documented suitability requires a real trade-off: the constraint actually
    // costs the client something (a non-optimal choice for a stated reason). A
    // zero-cost preference is a note, not a suitability assessment, so it never
    // upgrades the compliance posture. Attribute the cost to the constraint that
    // drives it (the exclusion or requirement), not just the first one recorded.
    if (cost && cost.monthlyDelta > 0) {
      const driver = activeList.find(c => c.type === 'excluded' || c.type === 'required') ?? activeList[0]
      complianceConstraint = {
        type: driver.type,
        lenderLabel: driver.lenderLabel ?? driver.lenderSlug,
        reason: driver.reason,
        costSentence: costSentence(cost),
        actingEmail: driver.actingEmail,
        createdAt: driver.createdAt,
      }
    }
  }

  // ── Phase sections: honest one-line summaries for the collapsed rows ──────
  const docCount = documents.kind === 'ok' ? documents.data.length : null
  const summaries: Record<PhaseKey, string> = {
    intake:
      borrowers.kind === 'ok'
        ? `${borrowers.data.length} ${borrowers.data.length === 1 ? 'borrower' : 'borrowers'} on file`
        : 'Application details',
    underwriting: `${docCount !== null ? `${docCount} ${docCount === 1 ? 'document' : 'documents'}` : 'Documents'}${lenderNoteDraft ? ' · notes drafted' : ''}`,
    fulfilment:
      conds.length > 0
        ? `${openConds.length} of ${conds.length} conditions open`
        : pendingCommit.length > 0
          ? `${pendingCommit.length} awaiting approval`
          : 'No commitment yet',
    complete_paid:
      complianceState === 'not_started'
        ? `Compliance not started${commissionRecorded ? ' · commission recorded' : ''}`
        : complianceState === 'under_review'
          ? `Compliance ${closeout?.complianceStatus?.toLowerCase() ?? 'under review'}`
          : complianceState === 'approved'
            ? `Compliance approved${commissionRecorded ? ' · commission recorded' : ' · commission not recorded yet'}`
            : complianceState === 'rejected'
              ? `Compliance came back: ${closeout?.complianceStatus ?? 'rejected'}`
              : 'Compliance status not read',
    beyond_funding: dripLine ?? (phaseState('beyond_funding') === 'upcoming' ? 'After funding' : 'On the renewal radar'),
  }

  // A pending commitment list is a QUEUED DECISION — it must never sit
  // hidden inside a collapsed section, whatever phase is current. An
  // unmapped journey with open conditions opens Fulfilment too (the
  // centerpiece stays reachable when the spine cannot say where we are).
  const fulfilmentForceOpen =
    pendingCommit.length > 0 || (!journey.mapped && openConds.length > 0)

  const sectionDef = (key: PhaseKey): { id: string; anchors: string[]; body: React.ReactNode } => {
    switch (key) {
      case 'intake':
        return {
          id: 'phase-intake',
          anchors: [],
          body: (
            <>
              <StepList steps={stepsFor('intake')} />
              <Sub title="Borrowers">
                {borrowers.kind === 'ok' ? (
                  borrowers.data.length === 0 ? (
                    <Muted>No borrower rows on this file yet.</Muted>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {borrowers.data.map(b => (
                        <div key={b.id} className="border border-cool-100 rounded-lg p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-ui font-semibold text-navy">{b.fullName}</span>
                            <Chip tone="gray">{label(b.role)}</Chip>
                          </div>
                          <p className="text-xs text-cool-600 font-ui mt-1">
                            {b.dob ? `DOB ${b.dob}` : 'DOB not recorded'}
                            {b.maritalStatus ? ` · ${label(b.maritalStatus)}` : ''}
                          </p>
                          {b.employment != null && (
                            <details className="mt-1.5">
                              <summary className="text-[11px] text-cool-500 cursor-pointer select-none">
                                employment as stored
                              </summary>
                              <pre className="mt-1 text-[11px] text-cool-700 bg-cool-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                                {JSON.stringify(b.employment, null, 1)}
                              </pre>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <SectionFallback
                    state={borrowers}
                    notGrantedCopy="Borrower identity is not granted to the portal read-only role. When the grant lands, names render here masked exactly as stored."
                  />
                )}
              </Sub>
            </>
          ),
        }
      case 'underwriting':
        return {
          id: 'phase-underwriting',
          anchors: ['documents', 'notes'],
          body: (
            <>
              <StepList steps={stepsFor('underwriting')} />
              <Sub id="documents" title="Documents">
                {/* General borrower-document upload — always available. Storing a
                    document indexes it and moves the matching condition toward
                    obtained (document-pull session). */}
                {canUploadDocument && (
                  <div className="mb-4">
                    <DocumentUploader dealId={deal.id} borrowers={borrowerList} />
                  </div>
                )}
                {/* No real commitment on file -> this section instructs an upload
                    (incl. the synthetic-banner "a real commitment upload replaces
                    them"), so it carries the control inline. A retired synthetic doc
                    never counts as a commitment (guardrail 20). */}
                {canUploadCommitment && !hasRealCommitment && (
                  <div className="mb-4">
                    <CommitmentUploader
                      dealId={deal.id}
                      kind="commitment"
                      title="Upload the commitment"
                      hint="No lender commitment is on file yet. Drop it here to draft the checklist."
                      compact
                    />
                  </div>
                )}
                {/* A synthetic (stand-in) commitment document on the documents
                    table is loud (guardrail 20); the desk itself reads the Finmo
                    request list. */}
                {documents.kind === 'ok' && documents.data.some(d => d.provenance === 'synthetic') && (
                  <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
                    <span className="font-semibold">Synthetic (stand-in) commitment on this file.</span>{' '}
                    A stand-in commitment is on file. It is NOT a lender document, cannot be approved, and does not feed the
                    checklist. A real commitment upload replaces it.
                  </div>
                )}
                {requestsRefused && (
                  <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-ui text-amber-800">
                    The Finmo request list did not load. Commitment-checklist requests are shown where available.
                  </div>
                )}
                <DocumentsDesk
                  desk={requestsDesk}
                  evidenceByDocId={evidenceByDocId}
                  residual={residual}
                  dealId={deal.id}
                  canDecide={canDecideDocRequest}
                  lastCheckedAt={deal.finmoDocsPulledAt}
                  demo={isDemoMode()}
                />
                {pendingStmtDocs.length > 0 && (
                  <p className="mt-3 font-ui text-xs text-cool-500">
                    {pendingStmtDocs.length} statement extraction{pendingStmtDocs.length === 1 ? '' : 's'} pending in{' '}
                    <Link href="/portal/admin/approvals" className="font-semibold text-navy hover:underline">
                      Approvals
                    </Link>
                    .
                  </p>
                )}
              </Sub>

              <Sub title="Ratios and calcs">
                {ratios.kind === 'ok' || income.kind === 'ok' ? (
                  <div className="space-y-4">
                    {ratios.kind === 'ok' &&
                      (ratioGroups.length === 0 ? (
                        <Muted>No ratio calcs recorded on this file yet.</Muted>
                      ) : (
                        <div className="space-y-2">
                          {ratioGroups.map(g => (
                            <div key={g.key}>
                              <RatioCard r={g.current} />
                              <CalcHistory count={g.history.length}>
                                {g.history.map(r => (
                                  <RatioCard key={r.id} r={r} muted />
                                ))}
                              </CalcHistory>
                            </div>
                          ))}
                        </div>
                      ))}
                    {income.kind === 'ok' &&
                      (incomeGroups.length === 0 ? (
                        <Muted>No income calcs recorded on this file yet.</Muted>
                      ) : (
                        <div className="space-y-2">
                          <h4 className="font-heading text-[11px] font-semibold tracking-[0.05em] text-cool-600">Income calcs</h4>
                          {incomeGroups.map(g => (
                            <div key={g.key}>
                              <IncomeCard c={g.current} />
                              <CalcHistory count={g.history.length}>
                                {g.history.map(c => (
                                  <IncomeCard key={c.id} c={c} muted />
                                ))}
                              </CalcHistory>
                            </div>
                          ))}
                        </div>
                      ))}
                    {(ratios.kind !== 'ok' || income.kind !== 'ok') && (
                      <Muted>
                        {ratios.kind !== 'ok' ? 'Ratio calcs did not load. ' : ''}
                        {income.kind !== 'ok' ? 'Income calcs did not load.' : ''}
                      </Muted>
                    )}
                  </div>
                ) : (
                  <SectionFallback
                    state={ratios}
                    notGrantedCopy="Income and ratio calculations are not granted to the portal read-only role. When the grants land, each value renders with the calc version and inputs hash the workbench stores beside it."
                  />
                )}
              </Sub>

              {/* Statement evidence (B6.2 Task 2): reparented INTO the request
                  cards above (each request's expansion shows its analysed
                  document's evidence, linked by analysis.document_id); anything
                  not linked to a request renders in the desk's residual block. */}

              <Sub title="Shadow scores">
                {shadow.length === 0 ? (
                  <Muted>
                    No shadow scores recorded yet. Score this file from the{' '}
                    <Link href="/portal/admin/approvals" className="underline text-navy">
                      Approvals shadow queue
                    </Link>
                    .
                  </Muted>
                ) : (
                  <div className="space-y-2">
                    {shadow.map(s => (
                      <div key={s.id} className="border border-cool-100 rounded-lg p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-ui font-semibold text-navy capitalize">{s.dimension}</span>
                          <Chip tone={s.agreement ? 'green' : 'red'}>{s.agreement ? 'agreed' : 'disagreed'}</Chip>
                          <span className="text-[11px] text-cool-500 ml-auto tabular-nums">{fmtDateTime(s.scoredAt)}</span>
                        </div>
                        {s.disagreementNote && (
                          <p className="text-xs font-ui text-cool-700 mt-1">{s.disagreementNote}</p>
                        )}
                        {s.systemValue !== null && (
                          <details className="mt-1">
                            <summary className="text-[11px] text-cool-500 cursor-pointer select-none">
                              system value as recorded
                            </summary>
                            <pre className="mt-1 text-[11px] text-cool-700 bg-cool-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                              {JSON.stringify(s.systemValue, null, 1)}
                            </pre>
                          </details>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Sub>

              {/* Submission notes: the deal-room "Generate Lender Notes" card. The
                  workbench feeds the deal's own data through the lender-notes skill
                  and lands a DRAFT (lender_notes, granted 2026-07-15); the button is
                  the human action, nothing is sent. */}
              <Sub id="notes" title="Submission notes">
                <LenderNotesCard
                  dealId={deal.id}
                  initialDraft={
                    lenderNoteDraft
                      ? {
                          generatedText: lenderNoteDraft.generatedText,
                          charCount: lenderNoteDraft.charCount,
                          createdAt: lenderNoteDraft.createdAt,
                          createdByEmail: lenderNoteDraft.createdByEmail,
                          source: lenderNoteDraft.source,
                        }
                      : null
                  }
                  readiness={{
                    targetLender: deal.targetLender,
                    insuredStatus: deal.insuredStatus,
                    rateOverride: deal.rateOverride,
                    rateFromFinmo: typeof finmoRequested?.rate === 'number' ? finmoRequested.rate : null,
                    snapshotPulledAt: finmoSnap?.pulledAt ?? null,
                    hasFinmoApp: Boolean(deal.finmoAppId),
                    platformInsuredSuggestion: null,
                    calls: contextCounts.calls,
                    emails: contextCounts.emails,
                  }}
                  canGenerate={canGenerateNotes}
                  canManage={canManageSubmission}
                  demo={isDemoMode()}
                />
              </Sub>
            </>
          ),
        }
      case 'fulfilment':
        return {
          id: 'phase-fulfilment',
          anchors: ['conditions'],
          body: (
            <>
              <StepList steps={stepsFor('fulfilment')} />
              <Sub id="conditions" title={`Conditions (${openConds.length} open of ${conds.length})`}>
                <ConditionsChecklist
                  dealId={deal.id}
                  pending={pendingCommit}
                  approved={conds}
                  borrowers={borrowerList}
                  canDecide={canDecideCommitment}
                  canWaive={canWaiveConditions}
                  canRecompute={canRecompute}
                  canUpload={canUploadCommitment}
                  hasRealCommitment={hasRealCommitment}
                  todayYMD={today}
                  userId={user.userId}
                />
              </Sub>
            </>
          ),
        }
      case 'complete_paid':
        return {
          id: 'closeout',
          anchors: [],
          body: (
            <>
              <StepList
                steps={closeoutSteps}
                amberKeys={complianceState === 'rejected' ? ['compliance_package'] : []}
              />
              <CloseoutPanel
                state={complianceState}
                rawStatus={closeout?.complianceStatus ?? null}
                hasZohoLink={Boolean(deal.zohoPotentialId)}
                totalCommission={closeout?.totalCommission ?? null}
              />
            </>
          ),
        }
      case 'beyond_funding':
        return {
          id: 'phase-beyond',
          anchors: [],
          body: (
            <>
              <StepList steps={stepsFor('beyond_funding')} />
              {dripLine && (
                <p>
                  <Chip tone="gray">
                    {dripLine} · <a className="underline ml-1" href="/portal/admin/renewals/drip">queue</a>
                  </Chip>
                </p>
              )}
              <p className="mt-2 text-sm font-ui text-cool-700">
                Funded files live on the{' '}
                <Link href="/portal/admin/beyond?tab=renewals" className="underline text-navy">
                  Renewal Radar
                </Link>{' '}
                and in Strategic Mortgage Monitoring.
              </p>
            </>
          ),
        }
    }
  }

  // Current phase first and open, then the rest in lifecycle order.
  const orderedPhases: PhaseKey[] = ['intake', 'underwriting', 'fulfilment', 'complete_paid', 'beyond_funding']
  const sectionOrder: PhaseKey[] = journey.currentPhase
    ? [journey.currentPhase, ...orderedPhases.filter(p => p !== journey.currentPhase)]
    : orderedPhases

  const gd = dealGoalDisplay(deal.dealType, finmoGoal)
  // Header value stat (Task 4): the freshest reachable property "worth" from the
  // Finmo application snapshot backs the refi/renewal "Estimated value"; a stale
  // purchase price on the deals row must never render on a non-purchase file.
  const subjectProperty = (finmoSnap?.mapped?.subject_property ?? null) as
    | { worth?: number | null; appraised_value?: number | null }
    | null
  const estimatedValue =
    typeof subjectProperty?.worth === 'number'
      ? subjectProperty.worth
      : typeof subjectProperty?.appraised_value === 'number'
        ? subjectProperty.appraised_value
        : null
  const headerVal = headerValue(resolveShape(deal.dealType, finmoGoal), deal.purchasePrice, estimatedValue)

  // Calc stacks (Task 5): one current row per natural identity (a ratio is keyed
  // by its lender; an income by borrower + lender + basis), prior recomputes
  // folded into History. Rows are read newest-first already; grouping is display.
  const ratioGroups =
    ratios.kind === 'ok' ? currentAndHistory(ratios.data, r => r.lenderSlug ?? 'file', r => r.createdAt) : []
  const incomeGroups =
    income.kind === 'ok'
      ? currentAndHistory(income.data, c => `${c.borrowerId ?? ''}|${c.lenderSlug ?? ''}|${c.basis}`, c => c.createdAt)
      : []

  return (
    <div className="max-w-4xl">
      {/* The header band (Direction 2): navy block with the back link, the
          client, the ref chip, and the Amount / Closes stat row. */}
      <div className="rounded-[10px] bg-navy px-5 py-5 text-white sm:px-7">
        <Link
          href="/portal/admin/underwriting"
          className="font-ui text-[13px] text-white/65 hover:text-white"
        >
          &lsaquo; All deals
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-heading text-[26px] font-bold leading-tight tracking-tight sm:text-[28px]">
            {clientName}
          </h1>
          <span className="rounded-[5px] border border-white/30 px-2 py-0.5 font-ui text-[11px] text-white/85 tabular-nums">
            {deal.fileRef}
          </span>
          {/* Header honesty: when the deals row's type conflicts with the Finmo
              application goal, show the Finmo goal with a conflict marker rather
              than the record type as unqualified fact (corrected at source in Zoho). */}
          {gd.conflict ? (
            <Chip tone="amber" title={`The deal record type is "${gd.dealTypeLabel}", but the Finmo application goal is "${gd.goalLabel}". Showing the Finmo goal; correct the record in Zoho.`}>
              {gd.goalLabel} <span className="font-normal opacity-70">· record says {gd.dealTypeLabel}</span>
            </Chip>
          ) : (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-ui text-[11px] font-semibold text-white/85 capitalize">
              {label(deal.dealType)}
            </span>
          )}
          {deal.stage && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-ui text-[11px] font-semibold text-white/85 capitalize">
              {label(deal.stage)}
            </span>
          )}
          {deal.status !== 'active' && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 font-ui text-[11px] font-semibold text-white/85">
              {deal.status}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {/* One-tap Call Prep: the agent page auto-sends the prep for
                this file. Reads only; the brief cites its sources. */}
            <Link
              href={`/portal/admin/agent?prep=${encodeURIComponent(deal.fileRef)}`}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-ui text-xs font-bold text-white hover:bg-white/15"
              data-testid="prep-call-for-deal"
            >
              Prep a call
            </Link>
            {/* Prefill only reads the deals row into rates searchParams; it
                writes nothing anywhere (Session 5 Part 4). */}
            <Link
              href={`/portal/admin/rates?${new URLSearchParams(
                scenarioParamsFromDeal({
                  fileRef: deal.fileRef,
                  dealType: deal.dealType,
                  mortgageAmount: deal.mortgageAmount,
                  purchasePrice: deal.purchasePrice,
                }),
              ).toString()}`}
              className="rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-ui text-xs font-bold text-white hover:bg-white/15"
              data-testid="find-rates-for-deal"
            >
              Find rates for this deal
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
          <BandStat label="Amount">
            {deal.mortgageAmount !== null ? fmtMoney(deal.mortgageAmount) : 'not recorded'}
          </BandStat>
          <BandStat label="Closes">
            {closingDate ? (
              <>
                {fmtShortDate(closingDate)}
                {closeDays !== null && (
                  <span className={`ml-1.5 font-normal ${closingAmber ? '' : 'text-white/65'}`}>
                    {closingAmber ? (
                      <span className="rounded bg-caution-bg px-1.5 py-0.5 text-[11px] font-semibold text-caution">
                        {closeDays >= 0
                          ? `in ${closeDays} ${closeDays === 1 ? 'day' : 'days'}`
                          : `${Math.abs(closeDays)} ${Math.abs(closeDays) === 1 ? 'day' : 'days'} ago`}
                      </span>
                    ) : closeDays >= 0 ? (
                      `· in ${closeDays} ${closeDays === 1 ? 'day' : 'days'}`
                    ) : (
                      `· ${Math.abs(closeDays)} ${Math.abs(closeDays) === 1 ? 'day' : 'days'} ago`
                    )}
                  </span>
                )}
              </>
            ) : (
              'none set'
            )}
          </BandStat>
          {headerVal && (
            <BandStat label={headerVal.label}>{fmtMoney(headerVal.amount)}</BandStat>
          )}
          <BandStat label="Lender">
            {deal.lender ? (
              <span className="capitalize">
                {deal.lender}
                {deal.product ? `, ${deal.product}` : ''}
              </span>
            ) : deal.targetLender ? (
              <span className="capitalize">
                {deal.targetLender} <span className="font-normal opacity-70">(target)</span>
              </span>
            ) : (
              'not set'
            )}
          </BandStat>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 border-t border-white/10 pt-3 font-ui text-xs text-white/60">
          {deal.zohoPotentialId ? (
            <a
              href={`https://crm.zoho.com/crm/org906105026/tab/Potentials/${deal.zohoPotentialId}`}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-white/85 underline hover:text-white"
            >
              Open in Zoho CRM
            </a>
          ) : (
            <span>No linked Zoho record</span>
          )}
          <span>Workbench updated {fmtDateTime(deal.updatedAt)}</span>
        </div>
      </div>

      {/* The journey (B1, restyled B2b): where this file sits on the spine.
          Display only. */}
      {showJourney && (
        <div className="mt-3 rounded-[9px] border border-cool-200 bg-white px-4 pb-4 pt-5">
          <JourneyStepper stage={deal.stage} shape={shape} space="room" />
        </div>
      )}

      {/* Terminal cleanup note: visible without shouting */}
      {terminal && (openConds.length > 0 || openFlags.length > 0) && (
        <p className="mt-3 text-xs font-ui text-cool-600 bg-cool-50 border border-cool-200 rounded-lg px-3 py-2">
          This file is {deal.status !== 'active' ? deal.status : label(deal.stage ?? 'closed')} with{' '}
          {openConds.length > 0
            ? `${openConds.length} condition${openConds.length === 1 ? '' : 's'}`
            : ''}
          {openConds.length > 0 && openFlags.length > 0 ? ' and ' : ''}
          {openFlags.length > 0 ? `${openFlags.length} flag${openFlags.length === 1 ? '' : 's'}` : ''}{' '}
          still open from before closeout. These do not feed the attention rail; clean them up
          here when convenient.
        </p>
      )}

      {/* Open blockers, visible whatever phase is open. */}
      {openFlags.length > 0 && (
        <p className="mt-3 rounded-lg border border-caution/40 bg-caution-bg px-3 py-2 text-xs font-ui text-caution">
          {openFlags.length} open {openFlags.length === 1 ? 'flag' : 'flags'} on this file ·{' '}
          <a href="#flags" className="font-semibold underline">
            see flags
          </a>
        </p>
      )}

      {/* Phase sections: current first and open, the rest one honest line. */}
      <div className="mt-4 space-y-2.5">
        {sectionOrder.map(key => {
          const def = sectionDef(key)
          const st = phaseState(key)
          const isCurrent = journey.mapped && journey.currentPhase === key
          return (
            <PhaseSection
              key={key}
              id={def.id}
              label={journey.phases.find(p => p.key === key)?.label ?? key}
              state={st}
              summary={summaries[key]}
              defaultOpen={isCurrent || (key === 'fulfilment' && fulfilmentForceOpen)}
              anchors={def.anchors}
            >
              {def.body}
            </PhaseSection>
          )
        })}
      </div>

      {/* File-level records, below the phases. */}
      <div className="mt-4 space-y-4">
        {/* Compliance (Session 6): posture from recorded signals only,
            gaps stated honestly, linked into the module. */}
        <ComplianceCard
          stage={deal.stage}
          status={deal.status}
          conditions={conds}
          flags={flags}
          todayYMD={today}
          constraint={complianceConstraint}
        />

        {/* Client lender constraints (Part 2): per-client rules keyed to a
            stable client key (Zoho potential id, or the file ref when none).
            Reads from FOXCA; recording needs constraints.manage and is refused
            in demo (both enforced server-side). */}
        <ClientConstraints
          clientKey={deal.zohoPotentialId ?? deal.fileRef}
          canManage={can(user, 'constraints.manage')}
        />

        {/* The client's own status page (B5): a private link that shows this
            client where their file stands, in their words. Nothing sends —
            Michael copies the link into his own message. Creating and revoking
            need client.link.manage and are refused in demo (server-enforced). */}
        <Section id="client-portal" title="Client portal">
          <ClientPortalCard
            zohoDealId={deal.zohoPotentialId}
            fileRef={deal.fileRef}
            initialLinks={clientLinks}
            canManage={can(user, 'client.link.manage') && !isDemoMode()}
          />
        </Section>

        {/* Client presentation (B8b): scenarios, graded offers, and the
            pre-approval letter. Composed here, published deliberately; only
            published records reach the client's private page. Authoring needs
            client.presentation.manage and is refused in demo (server-enforced). */}
        <Section id="client-presentation" title="Client presentation">
          <ClientPresentationCard
            zohoDealId={deal.zohoPotentialId}
            fileRef={deal.fileRef}
            isPurchase={shape === 'purchase'}
            canManage={can(user, 'client.presentation.manage') && !isDemoMode()}
            scenarios={clientScenarios}
            offers={clientOffers}
            letters={clientLetters}
            offerPickList={offerPickList}
          />
        </Section>

        {/* Client comms (B7-P): a quiet, read-only view of what has been said
            to this client and what is queued. Approvals happen on the comms
            queue in the Approvals area, never here. */}
        <Section id="comms" title="Client comms">
          <DealCommsCard timeline={commsTimeline} />
        </Section>

        {/* Flags with disposition history */}
        <Section id="flags" title={`Flags (${openFlags.length} open of ${flags.length})`}>
          {flags.length === 0 ? (
            <Muted>No flags raised on this file.</Muted>
          ) : (
            <div className="space-y-3">
              {flags.map(f => (
                <div key={f.id} className="border border-cool-100 rounded-lg p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={f.severity === 'high' ? 'red' : f.severity === 'warning' ? 'amber' : 'gray'}>
                      {f.severity}
                    </Chip>
                    <span className="text-sm font-ui font-semibold text-navy capitalize">{label(f.kind)}</span>
                    <Chip tone={f.status === 'open' ? 'amber' : 'green'}>{f.status}</Chip>
                    <span className="text-[11px] text-cool-500 ml-auto tabular-nums">{fmtDateTime(f.createdAt)}</span>
                  </div>
                  {f.status === 'resolved' && (
                    <p className="text-xs font-ui text-cool-700 mt-1.5">
                      Dispositioned as <span className="font-semibold">{f.resolution}</span>
                      {f.resolvedAt ? ` ${fmtDateTime(f.resolvedAt)}` : ''}
                      {f.reason ? `: ${f.reason}` : ''}
                    </p>
                  )}
                  {f.status === 'open' && (
                    <p className="text-xs font-ui text-cool-600 mt-1.5">
                      Open. Disposition it from the{' '}
                      <Link href="/portal/admin/approvals" className="underline text-navy">
                        Approvals flags queue
                      </Link>
                      {terminal ? ' (listed under closed files there)' : ''}.
                    </p>
                  )}
                  {Object.keys(f.detail).length > 0 && (
                    <details className="mt-1.5">
                      <summary className="text-[11px] text-cool-500 cursor-pointer select-none">flag detail</summary>
                      <pre className="mt-1 text-[11px] text-cool-700 bg-cool-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(f.detail, null, 1)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Deal-scoped audit */}
        <Section
          id="activity"
          title="Recent audit entries"
          action={
            <Link href="/portal/admin/audit" className="text-xs font-semibold text-navy hover:underline">
              Full audit log &rarr;
            </Link>
          }
        >
          {audit.length === 0 ? (
            <Muted>No audit entries reference this deal yet.</Muted>
          ) : (
            <div className="divide-y divide-cool-100">
              {audit.map(a => (
                <div key={a.id} className="py-2">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-sm font-ui">
                    <span className="text-navy font-semibold">{a.action}</span>
                    <span className="text-xs text-cool-600">
                      {a.actorEmail ? `${a.actorEmail} through the portal` : a.actor}
                    </span>
                    <span className="text-[11px] text-cool-500 ml-auto tabular-nums">{fmtDateTime(a.createdAt)}</span>
                  </div>
                  {a.detail !== null && (
                    <details className="mt-0.5">
                      <summary className="text-[11px] text-cool-500 cursor-pointer select-none">detail</summary>
                      <pre className="mt-1 text-[11px] text-cool-700 bg-cool-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                        {JSON.stringify(a.detail, null, 1)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
