'use client'

// The approvals desk: four live queues (statements, rate sheets, flags,
// shadow scores) with decisions flowing through this repo's gate proxy
// routes to the fox-underwriting Gates API. Mobile-first — this screen is
// the one most likely used from a phone.
//
// Interaction contract (Session 3 brief):
//   - Final actions (approve, reject, flag dispositions, shadow agree) take
//     a two-tap confirm on the same control. Hold is single-tap. Shadow
//     disagree submits from its note box, which is its own guard.
//   - Success updates optimistically, then reconciles with a refetch.
//   - 409 shows "Already decided" and refetches: the CLI or another
//     session got there first. 403, 404, 422, and network failures render
//     their own plain-language states; network gets a retry.
//   - Citations and masked values render exactly as stored.

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import { fmtDiscount, type RatesReference } from '@/lib/scenario'
import { daysUntil, offerRatesText } from '@/lib/offers'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import LenderMark from '@/components/admin/LenderMark'
import CommsQueue from '@/components/admin/CommsQueue'
import StatusChip, { type ChipTone } from '@/components/admin/ds/StatusChip'
import {
  OfferConditions,
  OfferEvidenceList,
  OfferPricedElements,
  OfferWindowBadge,
} from '@/components/admin/offer-display'
import { lenderDisplayName } from '@/config/lenders'
import { groupPendingByDocument, heldForAsOfCount, topicLabel } from '@/lib/knowledge-claims'
import type { ApprovalsData } from '@/lib/approvals-data'
import type {
  DiscrepancyFlag,
  KnowledgeClaimRow,
  OfferQueueCard,
  OpenFlagCard,
  ShadowQueueCard,
  SheetQueueCard,
  StatementQueueCard,
  StatementFieldRow,
} from '@/lib/underwriting'

// ─── Formatting helpers (display only; values render as stored) ─────────────

const label = (s: string) => s.replace(/_/g, ' ')

function fmtWhen(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-CA', {
    timeZone: 'America/Toronto',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fieldValue(f: StatementFieldRow): string {
  const v = f.valueNumeric !== null ? String(f.valueNumeric) : (f.valueText ?? '')
  return f.unit ? `${v} ${f.unit}` : v
}

// ─── Shared UI atoms ────────────────────────────────────────────────────────

// The four semantic tones are the design system's StatusChip; `navy` is this
// desk's one extra (topic identity, not a status) and keeps its local span.
function Chip({ tone, children }: { tone: ChipTone | 'navy'; children: React.ReactNode }) {
  if (tone === 'navy') {
    return (
      <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-navy/10 text-navy">
        {children}
      </span>
    )
  }
  return <StatusChip tone={tone}>{children}</StatusChip>
}

function Snippet({ page, text }: { page: number; text: string }) {
  return (
    <p className="text-[11px] text-cool-500 font-ui mt-0.5 break-words">
      p{page}: &ldquo;{text}&rdquo;
    </p>
  )
}

function CardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <p className="text-xs text-red-700 font-ui">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="shrink-0 text-xs font-semibold text-red-700 underline hover:text-red-900 py-1.5"
        >
          Retry
        </button>
      )}
    </div>
  )
}

function NoteField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="mt-3">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        maxLength={2000}
        rows={2}
        placeholder={placeholder ?? 'Optional note (kept in the audit trail)'}
        className="w-full text-sm font-ui border border-cool-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50 resize-y"
      />
      {value.length > 1800 && (
        <p className="text-[11px] text-cool-500 text-right">{2000 - value.length} characters left</p>
      )}
    </div>
  )
}

// Two-tap confirm button. First tap arms it (label changes), second tap
// within the window fires. The window is enforced by timestamp at tap time,
// not only by the visual disarm timer: background tabs throttle timers, and
// a visually armed button must never fire outside its window.
const ARM_WINDOW_MS = 4000

function ConfirmButton({
  label: text,
  confirmLabel,
  tone,
  busy,
  armed,
  armedAt,
  onArm,
  onFire,
}: {
  label: string
  confirmLabel: string
  tone: 'approve' | 'reject' | 'neutral'
  busy: boolean
  armed: boolean
  armedAt?: number
  onArm: () => void
  onFire: () => void
}) {
  const base =
    'min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold font-ui transition-colors disabled:opacity-50'
  const toneCls = armed
    ? tone === 'reject'
      ? 'bg-red-600 text-white'
      : 'bg-navy text-white'
    : tone === 'approve'
      ? 'bg-decision text-decision-ink hover:opacity-90'
      : tone === 'reject'
        ? 'bg-white border border-red-300 text-red-700 hover:bg-red-50'
        : 'bg-white border border-cool-300 text-navy hover:bg-cool-50'
  const fresh = armed && armedAt !== undefined && Date.now() - armedAt <= ARM_WINDOW_MS
  return (
    <button className={`${base} ${toneCls}`} disabled={busy} onClick={() => (fresh ? onFire() : onArm())}>
      {busy ? 'Working…' : armed ? confirmLabel : text}
    </button>
  )
}

function PlainButton({
  label: text,
  busy,
  onClick,
}: {
  label: string
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      className="min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold font-ui bg-white border border-cool-300 text-navy hover:bg-cool-50 disabled:opacity-50"
      disabled={busy}
      onClick={onClick}
    >
      {busy ? 'Working…' : text}
    </button>
  )
}

// ─── Decision plumbing ──────────────────────────────────────────────────────

type ApiOutcome =
  | { ok: true; data: any }
  | { ok: false; kind: string; message: string }

async function postDecision(
  url: string,
  body: Record<string, unknown>,
  gatesToken: string | null,
): Promise<ApiOutcome> {
  if (!gatesToken) {
    return { ok: false, kind: 'auth', message: 'Your session did not produce a decision token. Sign in again and retry.' }
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', [GATES_TOKEN_HEADER]: gatesToken },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (json && typeof json.ok === 'boolean') return json as ApiOutcome
    return { ok: false, kind: 'unavailable', message: `Unexpected response (HTTP ${res.status}).` }
  } catch {
    return { ok: false, kind: 'network', message: 'Could not reach the server. Check your connection and retry.' }
  }
}

// ─── The desk ───────────────────────────────────────────────────────────────

export type TabKey = 'statements' | 'sheets' | 'offers' | 'flags' | 'shadow' | 'knowledge' | 'comms'

export interface CanDecide {
  statements: boolean
  sheets: boolean
  offers: boolean
  flags: boolean
  shadow: boolean
  knowledge: boolean
  comms: boolean
}

export default function ApprovalsDesk({
  initial,
  canDecide,
  initialTab = 'statements',
  todayYMD,
}: {
  initial: ApprovalsData
  canDecide: CanDecide
  // From the page's ?tab= param, so every queue is URL-addressable and
  // screenshots and checks navigate instead of clicking (the UI test
  // automation discipline).
  initialTab?: TabKey
  // Toronto today, for the offer countdowns.
  todayYMD: string
}) {
  const [data, setData] = useState<ApprovalsData>(initial)
  const [tab, setTab] = useState<TabKey>(initialTab)
  // Prime reference for pricing floating offer discounts as effective rates.
  const referenceRes = useKnowledgeFetch<RatesReference>('/api/portal/admin/knowledge/rates-reference')
  const reference = referenceRes.data ?? null
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  // Knowledge tab inputs: the as-of date a dateless claim needs to approve,
  // and the optional edited claim text behind its toggle.
  const [asOfInputs, setAsOfInputs] = useState<Record<string, string>>({})
  const [editOpen, setEditOpen] = useState<Record<string, boolean>>({})
  const [editedTexts, setEditedTexts] = useState<Record<string, string>>({})
  const [armed, setArmed] = useState<{ key: string; at: number } | null>(null)
  const [toast, setToast] = useState<{ tone: 'green' | 'amber'; text: string } | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mintGatesToken = useGatesToken()

  const arm = useCallback((key: string) => {
    setArmed({ key, at: Date.now() })
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(null), ARM_WINDOW_MS)
  }, [])

  const showToast = useCallback((tone: 'green' | 'amber', text: string) => {
    setToast({ tone, text })
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }, [])

  useEffect(
    () => () => {
      if (armTimer.current) clearTimeout(armTimer.current)
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const refetch = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/admin/approvals/queues', { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (json?.ok && json.data) setData(json.data as ApprovalsData)
    } catch {
      // Keep the optimistic state; the next action or reload reconciles.
    }
  }, [])

  // One decision runner: optimistic apply on success, refetch reconcile,
  // "Already decided" on 409, per-card errors otherwise.
  const act = useCallback(
    async (opts: {
      key: string
      url: string
      body: Record<string, unknown>
      onSuccess: (responseData: any) => void
      successText: (responseData: any) => string
    }) => {
      setArmed(null)
      setBusy(b => ({ ...b, [opts.key]: true }))
      setCardErrors(e => {
        const next = { ...e }
        delete next[opts.key]
        return next
      })
      // Fresh 60-second gates token per action, minted on the signed-in
      // session in the browser (backend mints carry no azp claim).
      const gatesToken = await mintGatesToken()
      const outcome = await postDecision(opts.url, opts.body, gatesToken)
      setBusy(b => ({ ...b, [opts.key]: false }))
      if (outcome.ok) {
        opts.onSuccess(outcome.data)
        showToast('green', opts.successText(outcome.data))
        void refetch()
        return
      }
      if (outcome.kind === 'conflict') {
        showToast('amber', 'Already decided. The queue has been refreshed.')
        void refetch()
        return
      }
      setCardErrors(e => ({ ...e, [opts.key]: outcome.message }))
    },
    [mintGatesToken, refetch, showToast],
  )

  const note = (id: string) => notes[id] ?? ''
  const setNote = (id: string, v: string) => setNotes(n => ({ ...n, [id]: v }))

  // ── Per-queue decision wiring ─────────────────────────────────────────────

  const decideStatement = (card: StatementQueueCard, action: 'approve' | 'hold' | 'reject') => {
    const key = `stmt:${card.documentId}`
    void act({
      key,
      url: `/api/portal/admin/gates/statements/${card.documentId}/decision`,
      body: { action, ...(note(key).trim() ? { note: note(key).trim() } : {}) },
      onSuccess: () => {
        if (action !== 'hold') {
          setData(d => ({ ...d, statements: d.statements.filter(s => s.documentId !== card.documentId) }))
        }
      },
      successText: r =>
        action === 'approve'
          ? `Approved ${label(card.docClass)} on ${card.dealRef ?? 'file'}: ${r?.approved ?? 0} fields promoted, ${r?.held ?? 0} held.`
          : action === 'hold'
            ? `Held ${label(card.docClass)} on ${card.dealRef ?? 'file'}. The gate stays pending and the hold is audited.`
            : `Rejected ${label(card.docClass)} on ${card.dealRef ?? 'file'}.`,
    })
  }

  const decideSheet = (card: SheetQueueCard, action: 'approve' | 'reject') => {
    const key = `sheet:${card.intelItemId}`
    void act({
      key,
      url: `/api/portal/admin/gates/rate-sheets/${card.intelItemId}/decision`,
      body: { action, ...(note(key).trim() ? { note: note(key).trim() } : {}) },
      onSuccess: () => {
        setData(d => ({ ...d, sheets: d.sheets.filter(s => s.intelItemId !== card.intelItemId) }))
      },
      successText: r =>
        action === 'approve'
          ? `Approved ${card.lenderSlug ?? 'sheet'}: ${r?.approved ?? 0} quotes approved, ${r?.held ?? 0} held, ${r?.superseded ?? 0} superseded.`
          : `Rejected ${card.lenderSlug ?? 'sheet'}: every quote on the sheet rejected.`,
    })
  }

  const decideOffer = (card: OfferQueueCard, action: 'approve' | 'reject') => {
    const key = `offer:${card.id}`
    const who = card.lenderName ?? lenderDisplayName(card.lenderSlug)
    void act({
      key,
      url: `/api/portal/admin/gates/offers/${card.id}/decision`,
      body: { action, ...(note(key).trim() ? { note: note(key).trim() } : {}) },
      onSuccess: () => {
        setData(d => ({ ...d, offers: d.offers.filter(o => o.id !== card.id) }))
      },
      successText: () =>
        action === 'approve'
          ? `Approved ${who} offer: it now appears on the Promos board.`
          : `Rejected ${who} offer: it will not be quoted.`,
    })
  }

  const disposeFlag = (card: OpenFlagCard, disposition: 'accepted' | 'corrected' | 'escalated') => {
    const key = `flag:${card.id}`
    void act({
      key,
      url: `/api/portal/admin/gates/flags/${card.id}/disposition`,
      body: { disposition, ...(note(key).trim() ? { note: note(key).trim() } : {}) },
      onSuccess: () => {
        setData(d => ({
          ...d,
          flags: d.flags.filter(f => f.id !== card.id),
          flagsOnClosed: d.flagsOnClosed.filter(f => f.id !== card.id),
        }))
      },
      successText: () => `Flag ${label(card.kind)} dispositioned as ${disposition}.`,
    })
  }

  const scoreShadow = (card: ShadowQueueCard, dimension: string, agree: boolean) => {
    const key = `shadow:${card.dealId}:${dimension}`
    const n = note(key).trim()
    if (!agree && n.length < 5) {
      setCardErrors(e => ({ ...e, [key]: 'A disagreement needs a note of at least 5 characters.' }))
      return
    }
    void act({
      key,
      url: `/api/portal/admin/gates/shadow/${card.dealId}/score`,
      body: { dimension, agree, ...(n ? { note: n } : {}) },
      onSuccess: () => {
        setData(d => ({
          ...d,
          shadow: d.shadow
            .map(s =>
              s.dealId === card.dealId
                ? {
                    ...s,
                    dimensions: s.dimensions.map(dim =>
                      dim.dimension === dimension
                        ? { ...dim, lastAgreement: agree, lastScoredAt: new Date().toISOString() }
                        : dim,
                    ),
                    scoredCount: s.dimensions.filter(
                      dim => dim.lastScoredAt !== null || dim.dimension === dimension,
                    ).length,
                  }
                : s,
            )
            .filter(s => s.scoredCount < 4),
        }))
      },
      successText: () =>
        `Scored ${dimension} on ${card.fileRef}: ${agree ? 'you agree with the system' : 'disagreement recorded with your note'}.`,
    })
  }

  const decideKnowledgeClaimAction = (claim: KnowledgeClaimRow, action: 'approve' | 'reject') => {
    const key = `kclaim:${claim.id}`
    const asOf = (asOfInputs[claim.id] ?? '').trim()
    if (action === 'approve' && claim.asOfDate === null && !asOf) {
      setCardErrors(e => ({ ...e, [key]: 'This claim has no as-of date. Supply one to approve it.' }))
      return
    }
    const edited = editOpen[claim.id] ? (editedTexts[claim.id] ?? '').trim() : ''
    void act({
      key,
      url: `/api/portal/admin/gates/knowledge-claims/${claim.id}/decision`,
      body: {
        action,
        ...(note(key).trim() ? { note: note(key).trim() } : {}),
        // Sent only when the claim stored none: the gate requires it there.
        ...(action === 'approve' && claim.asOfDate === null && asOf ? { as_of_date: asOf } : {}),
        // Sent only when Michael actually changed the text.
        ...(edited && edited !== claim.claimText ? { edited_text: edited } : {}),
      },
      onSuccess: () => {
        setData(d => ({ ...d, knowledgeClaims: d.knowledgeClaims.filter(c => c.id !== claim.id) }))
      },
      successText: () =>
        action === 'approve'
          ? `Approved ${label(claim.claimKey)} for ${lenderDisplayName(claim.lenderSlug)}: it is citable knowledge now.`
          : `Rejected ${label(claim.claimKey)} for ${lenderDisplayName(claim.lenderSlug)}.`,
    })
  }

  const approveKnowledgeDoc = (documentId: string, docName: string) => {
    const key = `kdoc:${documentId}`
    void act({
      key,
      url: `/api/portal/admin/gates/knowledge-docs/${documentId}/decision`,
      body: { action: 'approve', ...(note(key).trim() ? { note: note(key).trim() } : {}) },
      onSuccess: () => {
        // Claims with a null as_of stay (the gate held them out of the
        // batch); the refetch reconciles exactly.
        setData(d => ({
          ...d,
          knowledgeClaims: d.knowledgeClaims.filter(
            c => c.sourceDocumentId !== documentId || c.asOfDate === null,
          ),
        }))
      },
      successText: r => {
        const held = heldForAsOfCount(r?.heldForAsOf)
        const approved = typeof r?.approved === 'number' ? `${r.approved} claims approved` : 'claims approved'
        return held > 0
          ? `Approved ${docName}: ${approved}. ${held} held: supply as-of individually.`
          : `Approved ${docName}: ${approved}.`
      },
    })
  }

  // ── Tabs ──────────────────────────────────────────────────────────────────

  // One flag card, shared by the live severity groups and the collapsed
  // closed-files section (same controls; terminal-deal cleanup is allowed
  // by the contract and audited with deal_terminal).
  const renderFlagCard = (card: OpenFlagCard) => {
    const key = `flag:${card.id}`
    const detailEntries = Object.entries(card.detail).filter(
      ([, v]) => v !== null && v !== undefined && typeof v !== 'object',
    )
    const sev = card.severity
    return (
      <div key={card.id} className="rounded-[9px] border border-cool-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={sev === 'high' ? 'red' : sev === 'warning' ? 'amber' : 'gray'}>{sev}</Chip>
          <h4 className="font-heading font-bold text-navy text-sm capitalize">{label(card.kind)}</h4>
          {card.dealRef && card.dealId && (
            <Link
              href={`/portal/admin/deals/${card.dealId}`}
              className="text-xs font-semibold text-navy underline hover:text-ink ml-auto"
            >
              {card.dealRef} deal room
            </Link>
          )}
        </div>
        <p className="text-[11px] text-cool-500 font-ui mt-1 tabular-nums">raised {fmtWhen(card.createdAt)}</p>
        {detailEntries.length > 0 && (
          <div className="mt-2 space-y-0.5">
            {detailEntries.map(([k, v]) => (
              <p key={k} className="text-xs font-ui text-cool-600 break-words">
                <span className="text-cool-500">{label(k)}:</span> {String(v)}
              </p>
            ))}
          </div>
        )}
        {card.evidenceRefCount > 0 && (
          <p className="text-[11px] text-cool-500 font-ui mt-1.5">
            {card.evidenceRefCount} evidence reference{card.evidenceRefCount === 1 ? '' : 's'} recorded in
            the workbench (evidence detail is not granted to the portal yet)
          </p>
        )}
        {canDecide.flags ? (
          <>
            <NoteField
              value={note(key)}
              onChange={v => setNote(key, v)}
              placeholder="Optional note (lands in the flag reason and the audit trail)"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {(['accepted', 'corrected', 'escalated'] as const).map(dispo => (
                <ConfirmButton
                  key={dispo}
                  label={dispo === 'accepted' ? 'Accept' : dispo === 'corrected' ? 'Corrected' : 'Escalate'}
                  confirmLabel="Tap again to confirm"
                  tone={dispo === 'escalated' ? 'reject' : dispo === 'accepted' ? 'approve' : 'neutral'}
                  busy={Boolean(busy[key])}
                  armed={armed?.key === `${key}:${dispo}`}
                  armedAt={armed?.at}
                  onArm={() => arm(`${key}:${dispo}`)}
                  onFire={() => disposeFlag(card, dispo)}
                />
              ))}
            </div>
          </>
        ) : (
          <ViewOnlyNote />
        )}
        {cardErrors[key] && (
          <CardError
            message={cardErrors[key]}
            onRetry={
              cardErrors[key].startsWith('Could not reach') ? () => disposeFlag(card, 'accepted') : undefined
            }
          />
        )}
      </div>
    )
  }

  const tabs: { key: TabKey; title: string; count: number }[] = [
    { key: 'statements', title: 'Statements', count: data.statements.length },
    { key: 'sheets', title: 'Rate sheets', count: data.sheets.length },
    { key: 'offers', title: 'Offers', count: data.offers.length },
    { key: 'flags', title: 'Flags', count: data.flags.length },
    { key: 'shadow', title: 'Shadow scores', count: data.shadow.length },
    { key: 'knowledge', title: 'Knowledge', count: data.knowledgeClaims.length },
    { key: 'comms', title: 'Client comms', count: data.comms.length },
  ]

  const lastDecidedFor: Record<TabKey, string | null> = {
    statements: data.lastDecided.statements,
    sheets: data.lastDecided.rates,
    offers: null,
    flags: data.lastDecided.flags,
    shadow: data.lastDecided.shadow,
    knowledge: null,
    comms: null,
  }

  const emptyCopy: Record<TabKey, string> = {
    statements: 'No statement reviews pending.',
    sheets: 'No rate sheets pending.',
    offers: 'No promotional offers pending.',
    flags: 'No open flags.',
    shadow: 'No shadow scores due.',
    knowledge: 'No lender knowledge claims pending.',
    comms: 'No client messages waiting.',
  }

  const queueError = { statements: data.errors.statements, sheets: data.errors.sheets, offers: data.errors.offers, flags: data.errors.flags, shadow: data.errors.shadow, knowledge: data.errors.knowledge, comms: data.errors.comms }[tab]

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`sticky top-2 z-20 mb-4 rounded-lg px-4 py-2.5 text-sm font-ui border ${
            toast.tone === 'green'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Tab bar: the ds underline look (client-state buttons, wrapping on
          phones). Same buttons, same handlers — only the clothes changed. */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 border-b border-cool-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px inline-flex min-h-[44px] items-center gap-1.5 border-b-2 px-0.5 pb-2 pt-1 font-heading text-[13px] motion-safe:transition-colors ${
              tab === t.key
                ? 'border-navy font-semibold text-navy'
                : 'border-transparent font-medium text-cool-600 hover:text-navy'
            }`}
          >
            {t.title}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                t.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-cool-100 text-cool-700'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {queueError && (
        <div className="mt-4 rounded-[9px] border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800 font-ui">This queue could not load fully: {queueError}</p>
        </div>
      )}

      <div className="mt-4 space-y-4">
        {/* ── Statements ── */}
        {tab === 'statements' &&
          (data.statements.length === 0 ? (
            <EmptyState text={emptyCopy.statements} lastDecided={lastDecidedFor.statements} />
          ) : (
            data.statements.map(card => {
              const key = `stmt:${card.documentId}`
              const discs = data.discrepancies.filter(d => d.statementDocumentId === card.documentId)
              return (
                <div key={card.documentId} className="rounded-[9px] border border-cool-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-navy text-base capitalize">{label(card.docClass)}</h3>
                    <Chip tone="gray">{card.fields.length} fields</Chip>
                    {card.dealRef && (
                      <Link
                        href={`/portal/admin/deals/${card.dealId}`}
                        className="text-xs font-semibold text-navy underline hover:text-ink ml-auto"
                      >
                        {card.dealRef} deal room
                      </Link>
                    )}
                  </div>

                  {/* Extracted fields with their citations, exactly as stored */}
                  <div className="mt-3 divide-y divide-cool-100">
                    {card.fields.map(f => (
                      <div key={f.id} className="py-2">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-sm font-ui text-cool-600">{label(f.fieldName)}</span>
                          <span className="text-sm font-ui font-semibold text-navy tabular-nums">{fieldValue(f)}</span>
                          <span className="text-[11px] text-cool-500">conf {f.confidence}</span>
                          {f.heldReason && <Chip tone="amber">held on approval: {f.heldReason}</Chip>}
                        </div>
                        <Snippet page={f.sourcePage} text={f.sourceSnippet} />
                      </div>
                    ))}
                  </div>

                  {/* Discrepancy framing, both figures with their sources */}
                  {discs.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {discs.map(d => (
                        <div key={d.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            <Chip tone="amber">discrepancy</Chip>
                            {d.wideGap && <Chip tone="red">wide gap</Chip>}
                          </div>
                          <p className="text-xs font-ui text-cool-700 mt-1.5">
                            Statement says <span className="font-semibold text-navy">{d.statementValue}</span>
                            {d.statementSource ? ` (${d.statementSource})` : ''}
                          </p>
                          <p className="text-xs font-ui text-cool-700 mt-0.5">
                            Application says <span className="font-semibold text-navy">{d.applicationValue}</span>
                            {d.applicationField ? ` for ${label(d.applicationField)}` : ''}
                            {d.applicationSource ? ` (source: ${d.applicationSource})` : ''}
                          </p>
                          {d.policy && <p className="text-[11px] text-cool-500 mt-1">{d.policy}</p>}
                        </div>
                      ))}
                    </div>
                  )}

                  {canDecide.statements ? (
                    <>
                      <NoteField value={note(key)} onChange={v => setNote(key, v)} />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ConfirmButton
                          label="Approve"
                          confirmLabel="Tap again to approve"
                          tone="approve"
                          busy={Boolean(busy[key])}
                          armed={armed?.key === `${key}:approve`}
                          armedAt={armed?.at}
                          onArm={() => arm(`${key}:approve`)}
                          onFire={() => decideStatement(card, 'approve')}
                        />
                        <PlainButton label="Hold" busy={Boolean(busy[key])} onClick={() => decideStatement(card, 'hold')} />
                        <ConfirmButton
                          label="Reject"
                          confirmLabel="Tap again to reject"
                          tone="reject"
                          busy={Boolean(busy[key])}
                          armed={armed?.key === `${key}:reject`}
                          armedAt={armed?.at}
                          onArm={() => arm(`${key}:reject`)}
                          onFire={() => decideStatement(card, 'reject')}
                        />
                      </div>
                    </>
                  ) : (
                    <ViewOnlyNote />
                  )}
                  {cardErrors[key] && (
                    <CardError
                      message={cardErrors[key]}
                      onRetry={
                        cardErrors[key].startsWith('Could not reach') ? () => decideStatement(card, 'approve') : undefined
                      }
                    />
                  )}
                </div>
              )
            })
          ))}

        {/* ── Rate sheets ── */}
        {tab === 'sheets' &&
          (data.sheets.length === 0 ? (
            <EmptyState text={emptyCopy.sheets} lastDecided={lastDecidedFor.sheets} />
          ) : (
            data.sheets.map(card => {
              const key = `sheet:${card.intelItemId}`
              // Summary strip per rate type: printed-rate ranges for fixed,
              // discount ranges (P−0.75..P−0.35 style) for adjustable and
              // variable, never conflated, plus the cash back tier count.
              const fixedBuckets = new Map<number, { min: number; max: number }>()
              for (const q of card.quotes) {
                if (q.rateType !== 'fixed' || q.rate === null) continue
                const b = fixedBuckets.get(q.termMonths)
                if (!b) fixedBuckets.set(q.termMonths, { min: q.rate, max: q.rate })
                else {
                  b.min = Math.min(b.min, q.rate)
                  b.max = Math.max(b.max, q.rate)
                }
              }
              const floatRange = (type: 'adjustable' | 'variable'): string | null => {
                const vs = card.quotes
                  .filter(q => q.rateType === type && q.primeVariance !== null)
                  .map(q => q.primeVariance!)
                const printedOnly = card.quotes.filter(
                  q => q.rateType === type && q.primeVariance === null && q.rate !== null,
                ).length
                const n = card.quotes.filter(q => q.rateType === type).length
                if (n === 0) return null
                if (vs.length === 0) return `${n} ${type} (printed rates only)`
                const lo = Math.min(...vs)
                const hi = Math.max(...vs)
                const range = lo === hi ? fmtDiscount(lo) : `${fmtDiscount(lo)}..${fmtDiscount(hi)}`
                return `${n} ${type}: ${range}${printedOnly > 0 ? ` (+${printedOnly} printed)` : ''}`
              }
              const cashbackCount = card.quotes.filter(q => q.cashbackPct !== null).length
              const summaryParts = [
                ...Array.from(fixedBuckets.entries())
                  .sort((a, b) => a[0] - b[0])
                  .map(([term, r]) =>
                    `${term % 12 === 0 ? `${term / 12}y` : `${term}m`} fixed: ${r.min === r.max ? r.min : `${r.min}-${r.max}`}`,
                  ),
                floatRange('adjustable'),
                floatRange('variable'),
              ].filter(Boolean)
              return (
                <div key={card.intelItemId} className="rounded-[9px] border border-cool-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {card.lenderSlug && <LenderMark slug={card.lenderSlug} size={26} />}
                    <h3 className="font-heading font-bold text-navy text-base capitalize">
                      {card.lenderSlug ? lenderDisplayName(card.lenderSlug) : 'Unknown lender'}
                    </h3>
                    {card.asOfDate && <Chip tone="gray">sheet {card.asOfDate}</Chip>}
                    <Chip tone="gray">{card.quotes.length} quotes</Chip>
                    {cashbackCount > 0 && (
                      <Chip tone="green">{cashbackCount} cash back tier{cashbackCount === 1 ? '' : 's'}</Chip>
                    )}
                  </div>
                  <p className="text-xs font-ui text-cool-500 mt-2 tabular-nums">{summaryParts.join(' · ')}</p>

                  <details className="mt-3 group">
                    <summary className="text-sm font-semibold text-navy cursor-pointer select-none py-1.5">
                      Quote detail
                    </summary>
                    <div className="mt-1 divide-y divide-cool-100">
                      {card.quotes.map(q => (
                        <div key={q.id} className="py-2">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-ui">
                            <span className="text-cool-600">{label(q.productClass)}</span>
                            {q.variant && <span className="text-cool-500 text-xs">{q.variant}</span>}
                            {q.rateType !== 'fixed' && (
                              <span
                                className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
                                  q.rateType === 'adjustable'
                                    ? 'bg-sky-100 text-sky-900'
                                    : 'bg-violet-100 text-violet-900'
                                }`}
                              >
                                {q.rateType}
                              </span>
                            )}
                            <span className="text-navy font-semibold tabular-nums">
                              {q.termMonths % 12 === 0 ? `${q.termMonths / 12}yr` : `${q.termMonths}mo`} at{' '}
                              {q.rate !== null
                                ? `${q.rate}%${q.primeVariance !== null ? ` (${fmtDiscount(q.primeVariance)})` : ''}`
                                : q.primeVariance !== null
                                  ? fmtDiscount(q.primeVariance)
                                  : 'not priced'}
                            </span>
                            {q.cashbackPct !== null && (
                              <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 tabular-nums">
                                {q.cashbackPct}% cash back
                              </span>
                            )}
                            {q.compBps !== null && <span className="text-xs text-cool-500 tabular-nums">@ {q.compBps}bps</span>}
                            {q.heldReason && <Chip tone="amber">held: {q.heldReason}</Chip>}
                          </div>
                          {q.programNotes && (
                            <details className="mt-1">
                              <summary className="text-[11px] text-cool-500 cursor-pointer select-none">
                                program conditions, verbatim
                              </summary>
                              <p className="mt-0.5 text-[11px] text-cool-600 font-ui whitespace-pre-wrap break-words bg-cool-50 rounded p-2">
                                {q.programNotes}
                              </p>
                            </details>
                          )}
                          <Snippet page={q.sourcePage} text={q.sourceSnippet} />
                        </div>
                      ))}
                    </div>
                  </details>

                  {canDecide.sheets ? (
                    <>
                      <NoteField value={note(key)} onChange={v => setNote(key, v)} />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ConfirmButton
                          label="Approve sheet"
                          confirmLabel="Tap again to approve"
                          tone="approve"
                          busy={Boolean(busy[key])}
                          armed={armed?.key === `${key}:approve`}
                          armedAt={armed?.at}
                          onArm={() => arm(`${key}:approve`)}
                          onFire={() => decideSheet(card, 'approve')}
                        />
                        <ConfirmButton
                          label="Reject sheet"
                          confirmLabel="Tap again to reject"
                          tone="reject"
                          busy={Boolean(busy[key])}
                          armed={armed?.key === `${key}:reject`}
                          armedAt={armed?.at}
                          onArm={() => arm(`${key}:reject`)}
                          onFire={() => decideSheet(card, 'reject')}
                        />
                      </div>
                      <p className="text-[11px] text-cool-500 font-ui mt-2">
                        Sheet-level decision. Anomalous quotes are held automatically for individual disposition in the CLI.
                      </p>
                    </>
                  ) : (
                    <ViewOnlyNote />
                  )}
                  {cardErrors[key] && (
                    <CardError
                      message={cardErrors[key]}
                      onRetry={
                        cardErrors[key].startsWith('Could not reach') ? () => decideSheet(card, 'approve') : undefined
                      }
                    />
                  )}
                </div>
              )
            })
          ))}

        {/* ── Parked: province-excluded sheets. Out of the queue, never out of
            sight. Auto-released to pending the day the registry confirms a
            serviceable province (the park re-derives from the registry every
            render — no decision was made, nothing to undo). ── */}
        {tab === 'sheets' && data.parkedSheets.length > 0 && (
          <details className="rounded-[9px] border border-cool-200 bg-cool-50 p-4" data-testid="parked-sheets">
            <summary className="text-sm font-semibold text-navy cursor-pointer select-none">
              Parked: province-excluded ({data.parkedSheets.length} sheet
              {data.parkedSheets.length === 1 ? '' : 's'})
            </summary>
            <p className="text-xs font-ui text-cool-500 mt-2">
              These lenders cannot lend in a market the practice serves, so their sheets never
              enter the queue — approving or rejecting them would be busywork. Nothing is deleted;
              they return to pending automatically if the lender registry confirms a serviceable
              province.
            </p>
            <div className="mt-3 space-y-2">
              {data.parkedSheets.map(p => (
                <div key={p.card.intelItemId} className="bg-white border border-cool-200 rounded-lg px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.card.lenderSlug && <LenderMark slug={p.card.lenderSlug} size={22} />}
                    <span className="font-heading font-bold text-navy text-sm capitalize">
                      {p.card.lenderSlug ? lenderDisplayName(p.card.lenderSlug) : 'Unknown lender'}
                    </span>
                    {p.card.asOfDate && <Chip tone="gray">sheet {p.card.asOfDate}</Chip>}
                    <Chip tone="gray">{p.card.quotes.length} quotes</Chip>
                    <Chip tone="amber">province-excluded</Chip>
                  </div>
                  <p className="text-[11px] font-ui text-cool-500 mt-1">
                    {p.reason}
                    {p.asOf ? ` Registry fact as of ${p.asOf}.` : ''}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}

        {/* ── Offers ── */}
        {tab === 'offers' &&
          (data.offers.length === 0 ? (
            <EmptyState text={emptyCopy.offers} lastDecided={lastDecidedFor.offers} />
          ) : (
            data.offers.map(card => {
              const key = `offer:${card.id}`
              const who = card.lenderName ?? lenderDisplayName(card.lenderSlug)
              const provenance =
                typeof (card.offerPayload as { provenance?: unknown } | null)?.provenance === 'string'
                  ? ((card.offerPayload as { provenance?: string }).provenance as string)
                  : null
              const daysLeft = card.expiry ? daysUntil(todayYMD, card.expiry) : null
              return (
                <div
                  key={card.id}
                  className="rounded-[9px] border border-cool-200 bg-white p-4 sm:p-5"
                  data-testid={`offer-card-${card.id}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <LenderMark slug={card.lenderSlug} name={who} size={28} />
                      <div className="min-w-0">
                        <h3 className="font-heading font-bold text-navy text-base">{who}</h3>
                        <p className="text-sm font-ui text-cool-700 break-words">{card.offerName}</p>
                      </div>
                    </div>
                    {card.confidence !== null && <Chip tone="gray">conf {card.confidence}</Chip>}
                  </div>

                  {/* The window, rendered loudly. A null expiry is never a dash. */}
                  <div className="mt-3">
                    <OfferWindowBadge started={card.started} expiry={card.expiry} daysLeft={daysLeft} />
                  </div>

                  {/* Priced elements as identity. */}
                  <div className="mt-3 border-t border-cool-100 pt-3">
                    <OfferPricedElements
                      offer={{
                        lenderSlug: card.lenderSlug,
                        rate: card.rate,
                        rateType: card.rateType,
                        primeVariance: card.primeVariance,
                        cashbackPct: card.cashbackPct,
                        cashbackAmountText: card.cashbackAmountText,
                        productClass: card.productClass,
                        termMonths: card.termMonths,
                        termMonthsList: card.termMonthsList,
                        ratesText: offerRatesText(card.offerPayload),
                      }}
                      reference={reference}
                    />
                  </div>

                  {/* Conditions as extracted, verbatim. */}
                  {card.conditions.length > 0 && (
                    <details className="mt-3">
                      <summary className="text-xs font-semibold text-navy cursor-pointer select-none py-1">
                        Conditions, verbatim ({card.conditions.length})
                      </summary>
                      <OfferConditions conditions={card.conditions} />
                    </details>
                  )}

                  {/* Evidence: the approval is of evidence, not a summary. */}
                  <OfferEvidenceList evidence={card.evidence} />

                  {provenance && (
                    <p className="text-[11px] text-cool-500 font-ui mt-2 break-words">Extracted from {provenance}.</p>
                  )}

                  {canDecide.offers ? (
                    <>
                      <NoteField value={note(key)} onChange={v => setNote(key, v)} />
                      <div className="mt-3 flex flex-wrap gap-2">
                        <ConfirmButton
                          label="Approve offer"
                          confirmLabel="Tap again to approve"
                          tone="approve"
                          busy={Boolean(busy[key])}
                          armed={armed?.key === `${key}:approve`}
                          armedAt={armed?.at}
                          onArm={() => arm(`${key}:approve`)}
                          onFire={() => decideOffer(card, 'approve')}
                        />
                        <ConfirmButton
                          label="Reject offer"
                          confirmLabel="Tap again to reject"
                          tone="reject"
                          busy={Boolean(busy[key])}
                          armed={armed?.key === `${key}:reject`}
                          armedAt={armed?.at}
                          onArm={() => arm(`${key}:reject`)}
                          onFire={() => decideOffer(card, 'reject')}
                        />
                      </div>
                    </>
                  ) : (
                    <ViewOnlyNote />
                  )}
                  {cardErrors[key] && (
                    <CardError
                      message={cardErrors[key]}
                      onRetry={
                        cardErrors[key].startsWith('Could not reach') ? () => decideOffer(card, 'approve') : undefined
                      }
                    />
                  )}
                </div>
              )
            })
          ))}

        {/* ── Flags ── */}
        {tab === 'flags' && (
          <>
            {data.flags.length === 0 ? (
              <EmptyState text={emptyCopy.flags} lastDecided={lastDecidedFor.flags} />
            ) : (
              (['high', 'warning', 'info'] as const).map(sev => {
                const group = data.flags.filter(f => f.severity === sev)
                if (group.length === 0) return null
                return (
                  <div key={sev}>
                    <h3 className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-600 mb-2 mt-2">
                      {sev} <span className="font-ui font-normal tabular-nums">({group.length})</span>
                    </h3>
                    <div className="space-y-3">{group.map(renderFlagCard)}</div>
                  </div>
                )
              })
            )}
            {data.flagsOnClosed.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer select-none text-sm font-semibold font-ui text-cool-500 py-2">
                  On closed files ({data.flagsOnClosed.length}): cleanup, not urgency. These never
                  count in the badge.
                </summary>
                <div className="mt-2 space-y-3">{data.flagsOnClosed.map(renderFlagCard)}</div>
              </details>
            )}
          </>
        )}

        {/* ── Shadow scores ── */}
        {tab === 'shadow' &&
          (data.shadow.length === 0 ? (
            <EmptyState text={emptyCopy.shadow} lastDecided={lastDecidedFor.shadow} />
          ) : (
            data.shadow.map(card => (
              <div key={card.dealId} className="rounded-[9px] border border-cool-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading font-bold text-navy text-base">{card.fileRef}</h3>
                  {card.stage && <Chip tone="gray">{card.stage}</Chip>}
                  {card.closingDate && <Chip tone="gray">closes {card.closingDate}</Chip>}
                  <Chip tone={card.scoredCount > 0 ? 'amber' : 'gray'}>{card.scoredCount}/4 scored</Chip>
                  <Link
                    href={`/portal/admin/deals/${card.dealId}`}
                    className="text-xs font-semibold text-navy underline hover:text-ink ml-auto"
                  >
                    deal room
                  </Link>
                </div>
                <p className="text-[11px] text-cool-500 font-ui mt-1.5">
                  System values are computed and recorded by the workbench at scoring time, through the same pathway the
                  CLI uses. Past scores show what was recorded.
                </p>
                <div className="mt-3 divide-y divide-cool-100">
                  {card.dimensions.map(dim => {
                    const key = `shadow:${card.dealId}:${dim.dimension}`
                    return (
                      <div key={dim.dimension} className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-ui font-semibold text-navy capitalize">{dim.dimension}</span>
                          {dim.lastScoredAt ? (
                            <Chip tone={dim.lastAgreement ? 'green' : 'red'}>
                              {dim.lastAgreement ? 'agreed' : 'disagreed'} {fmtWhen(dim.lastScoredAt)}
                            </Chip>
                          ) : (
                            <Chip tone="amber">unscored</Chip>
                          )}
                        </div>
                        {dim.lastSystemValue !== null && dim.lastSystemValue !== undefined && (
                          <details className="mt-1.5">
                            <summary className="text-[11px] text-cool-500 cursor-pointer select-none">
                              last recorded system value
                            </summary>
                            <pre className="mt-1 text-[11px] text-cool-600 bg-cool-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                              {JSON.stringify(dim.lastSystemValue, null, 1)}
                            </pre>
                          </details>
                        )}
                        {dim.lastDisagreementNote && (
                          <p className="text-[11px] text-cool-500 font-ui mt-1">
                            last note: {dim.lastDisagreementNote}
                          </p>
                        )}
                        {canDecide.shadow && dim.lastScoredAt === null && (
                          <>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <ConfirmButton
                                label="Agree with system"
                                confirmLabel="Tap again to record"
                                tone="approve"
                                busy={Boolean(busy[key])}
                                armed={armed?.key === `${key}:agree`}
                                armedAt={armed?.at}
                                onArm={() => arm(`${key}:agree`)}
                                onFire={() => scoreShadow(card, dim.dimension, true)}
                              />
                              <PlainButton
                                label="Disagree (note below)"
                                busy={Boolean(busy[key])}
                                onClick={() => scoreShadow(card, dim.dimension, false)}
                              />
                            </div>
                            <NoteField
                              value={note(key)}
                              onChange={v => setNote(key, v)}
                              placeholder="Required for disagree (5+ characters): what the system got wrong"
                            />
                          </>
                        )}
                        {cardErrors[key] && (
                          <CardError
                            message={cardErrors[key]}
                            onRetry={
                              cardErrors[key].startsWith('Could not reach')
                                ? () => scoreShadow(card, dim.dimension, true)
                                : undefined
                            }
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ))
          ))}

        {/* ── Knowledge claims (grouped by source document) ── */}
        {tab === 'knowledge' &&
          (data.knowledgeClaims.length === 0 ? (
            <EmptyState text={emptyCopy.knowledge} lastDecided={lastDecidedFor.knowledge} />
          ) : (
            groupPendingByDocument(data.knowledgeClaims, data.knowledgeDocs).map(group => {
              const docKey = `kdoc:${group.documentId ?? 'none'}`
              return (
                <div key={docKey} className="rounded-[9px] border border-cool-200 bg-white p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <LenderMark slug={group.lenderSlug} size={26} />
                    <h3 className="font-heading font-bold text-navy text-base break-words">{group.docName}</h3>
                    <Chip tone="gray">{lenderDisplayName(group.lenderSlug)}</Chip>
                    <Chip tone="amber">
                      {group.claims.length} claim{group.claims.length === 1 ? '' : 's'}
                    </Chip>
                  </div>

                  <div className="mt-3 divide-y divide-cool-100">
                    {group.claims.map(claim => {
                      const key = `kclaim:${claim.id}`
                      return (
                        <div key={claim.id} className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip tone="navy">{topicLabel(claim.topic)}</Chip>
                            <span className="text-xs font-ui text-cool-500">{claim.claimKey}</span>
                            {claim.program && <Chip tone="gray">program: {claim.program}</Chip>}
                            {claim.confidence !== null && (
                              <span className="text-[11px] text-cool-500">conf {claim.confidence}</span>
                            )}
                          </div>
                          <p className="text-sm font-ui text-cool-700 mt-1.5">{claim.claimText}</p>
                          {claim.claimValue !== null && (
                            <p className="text-[11px] text-cool-500 font-mono mt-1 break-words">
                              {JSON.stringify(claim.claimValue)}
                            </p>
                          )}
                          {claim.sourceSnippet && (
                            <details className="mt-1">
                              <summary className="text-[11px] text-cool-500 cursor-pointer select-none">
                                source snippet, verbatim
                              </summary>
                              <p className="mt-0.5 text-[11px] text-cool-600 font-ui whitespace-pre-wrap break-words bg-cool-50 rounded p-2">
                                {claim.sourceSnippet}
                              </p>
                            </details>
                          )}
                          <p className="text-[11px] text-cool-500 font-ui mt-1">
                            {claim.sourcePage !== null ? `p.${claim.sourcePage} · ` : ''}
                            {claim.asOfDate ? `as of ${claim.asOfDate}` : 'no as-of — supply to approve'}
                          </p>

                          {canDecide.knowledge ? (
                            <>
                              {claim.asOfDate === null && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <label className="text-xs font-ui text-cool-500" htmlFor={`asof-${claim.id}`}>
                                    as-of date
                                  </label>
                                  <input
                                    id={`asof-${claim.id}`}
                                    type="date"
                                    value={asOfInputs[claim.id] ?? ''}
                                    onChange={e => setAsOfInputs(m => ({ ...m, [claim.id]: e.target.value }))}
                                    className="text-sm font-ui border border-cool-200 rounded-lg px-2 py-1.5"
                                  />
                                </div>
                              )}
                              <button
                                onClick={() =>
                                  setEditOpen(m => {
                                    const open = !m[claim.id]
                                    if (open && editedTexts[claim.id] === undefined) {
                                      setEditedTexts(t => ({ ...t, [claim.id]: claim.claimText }))
                                    }
                                    return { ...m, [claim.id]: open }
                                  })
                                }
                                className="mt-2 text-xs font-semibold text-navy underline hover:text-ink py-1"
                              >
                                {editOpen[claim.id] ? 'discard edit' : 'edit claim text'}
                              </button>
                              {editOpen[claim.id] && (
                                <textarea
                                  value={editedTexts[claim.id] ?? claim.claimText}
                                  onChange={e => setEditedTexts(t => ({ ...t, [claim.id]: e.target.value }))}
                                  maxLength={2000}
                                  rows={2}
                                  className="mt-1 w-full text-sm font-ui border border-cool-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50 resize-y"
                                />
                              )}
                              <NoteField value={note(key)} onChange={v => setNote(key, v)} />
                              <div className="mt-2 flex flex-wrap gap-2">
                                <ConfirmButton
                                  label="Approve"
                                  confirmLabel="Tap again to approve"
                                  tone="approve"
                                  busy={Boolean(busy[key])}
                                  armed={armed?.key === `${key}:approve`}
                                  armedAt={armed?.at}
                                  onArm={() => arm(`${key}:approve`)}
                                  onFire={() => decideKnowledgeClaimAction(claim, 'approve')}
                                />
                                <ConfirmButton
                                  label="Reject"
                                  confirmLabel="Tap again to reject"
                                  tone="reject"
                                  busy={Boolean(busy[key])}
                                  armed={armed?.key === `${key}:reject`}
                                  armedAt={armed?.at}
                                  onArm={() => arm(`${key}:reject`)}
                                  onFire={() => decideKnowledgeClaimAction(claim, 'reject')}
                                />
                              </div>
                            </>
                          ) : (
                            <ViewOnlyNote />
                          )}
                          {cardErrors[key] && <CardError message={cardErrors[key]} />}
                        </div>
                      )
                    })}
                  </div>

                  {canDecide.knowledge && group.documentId && (
                    <div className="mt-3 pt-3 border-t border-cool-100">
                      <ConfirmButton
                        label={`Approve document (${group.claims.length})`}
                        confirmLabel="Tap again to approve all"
                        tone="approve"
                        busy={Boolean(busy[docKey])}
                        armed={armed?.key === `${docKey}:approve`}
                        armedAt={armed?.at}
                        onArm={() => arm(`${docKey}:approve`)}
                        onFire={() => approveKnowledgeDoc(group.documentId!, group.docName)}
                      />
                      <p className="text-[11px] text-cool-500 font-ui mt-2">
                        Batch approval. Claims without an as-of date are held out and decided
                        individually with a supplied date.
                      </p>
                    </div>
                  )}
                  {cardErrors[docKey] && <CardError message={cardErrors[docKey]} />}
                </div>
              )
            })
          ))}

        {/* ── Client comms ── the outbound-message approval queue (B7-P). Its
            own self-contained sub-desk: navy controls, grouped by client, the
            full rendered message, held + catch-up flags. Reconciles through the
            shared refetch so a decision survives a tab switch. */}
        {tab === 'comms' && (
          <CommsQueue
            items={data.comms}
            canDecide={canDecide.comms}
            onChanged={() => void refetch()}
            todayYMD={todayYMD}
          />
        )}
      </div>
    </div>
  )
}

function EmptyState({ text, lastDecided }: { text: string; lastDecided: string | null }) {
  return (
    <div className="rounded-[9px] border border-cool-200 bg-white px-4 py-6 text-center">
      <p className="text-sm text-cool-500 font-ui">{text}</p>
      <p className="text-xs text-cool-500 font-ui mt-1 tabular-nums">
        {lastDecided ? `Last decision recorded ${fmtWhen(lastDecided)}.` : 'No decisions recorded yet.'}
      </p>
    </div>
  )
}

function ViewOnlyNote() {
  return (
    <p className="text-xs text-cool-500 font-ui mt-3">
      Your role can view this queue. Decisions need the admin role.
    </p>
  )
}
