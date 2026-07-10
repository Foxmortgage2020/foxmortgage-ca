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
import type { ApprovalsData } from '@/lib/approvals-data'
import type {
  DiscrepancyFlag,
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

function Chip({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'gray' | 'navy'; children: React.ReactNode }) {
  const cls = {
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-700',
    gray: 'bg-gray-100 text-gray-600',
    navy: 'bg-navy/10 text-navy',
  }[tone]
  return <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>{children}</span>
}

function Snippet({ page, text }: { page: number; text: string }) {
  return (
    <p className="text-[11px] text-gray-500 font-body mt-0.5 break-words">
      p{page}: &ldquo;{text}&rdquo;
    </p>
  )
}

function CardError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      <p className="text-xs text-red-700 font-body">{message}</p>
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
        className="w-full text-sm font-body border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-navy/50 resize-y"
      />
      {value.length > 1800 && (
        <p className="text-[11px] text-gray-400 text-right">{2000 - value.length} characters left</p>
      )}
    </div>
  )
}

// Two-tap confirm button. First tap arms it (label changes), second tap
// within 4 seconds fires. Fat-finger guard without a modal.
function ConfirmButton({
  label: text,
  confirmLabel,
  tone,
  busy,
  armed,
  onArm,
  onFire,
}: {
  label: string
  confirmLabel: string
  tone: 'approve' | 'reject' | 'neutral'
  busy: boolean
  armed: boolean
  onArm: () => void
  onFire: () => void
}) {
  const base =
    'min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold font-body transition-colors disabled:opacity-50'
  const toneCls = armed
    ? tone === 'reject'
      ? 'bg-red-600 text-white'
      : 'bg-navy text-white'
    : tone === 'approve'
      ? 'bg-lime text-navy hover:bg-lime/80'
      : tone === 'reject'
        ? 'bg-white border border-red-300 text-red-700 hover:bg-red-50'
        : 'bg-white border border-gray-300 text-navy hover:bg-gray-50'
  return (
    <button className={`${base} ${toneCls}`} disabled={busy} onClick={armed ? onFire : onArm}>
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
      className="min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold font-body bg-white border border-gray-300 text-navy hover:bg-gray-50 disabled:opacity-50"
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

async function postDecision(url: string, body: Record<string, unknown>): Promise<ApiOutcome> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

export type TabKey = 'statements' | 'sheets' | 'flags' | 'shadow'

export interface CanDecide {
  statements: boolean
  sheets: boolean
  flags: boolean
  shadow: boolean
}

export default function ApprovalsDesk({
  initial,
  canDecide,
}: {
  initial: ApprovalsData
  canDecide: CanDecide
}) {
  const [data, setData] = useState<ApprovalsData>(initial)
  const [tab, setTab] = useState<TabKey>('statements')
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [armed, setArmed] = useState<string | null>(null)
  const [toast, setToast] = useState<{ tone: 'green' | 'amber'; text: string } | null>(null)
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const arm = useCallback((key: string) => {
    setArmed(key)
    if (armTimer.current) clearTimeout(armTimer.current)
    armTimer.current = setTimeout(() => setArmed(null), 4000)
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
      const outcome = await postDecision(opts.url, opts.body)
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
    [refetch, showToast],
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

  const disposeFlag = (card: OpenFlagCard, disposition: 'accepted' | 'corrected' | 'escalated') => {
    const key = `flag:${card.id}`
    void act({
      key,
      url: `/api/portal/admin/gates/flags/${card.id}/disposition`,
      body: { disposition, ...(note(key).trim() ? { note: note(key).trim() } : {}) },
      onSuccess: () => {
        setData(d => ({ ...d, flags: d.flags.filter(f => f.id !== card.id) }))
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

  // ── Tabs ──────────────────────────────────────────────────────────────────

  const tabs: { key: TabKey; title: string; count: number }[] = [
    { key: 'statements', title: 'Statements', count: data.statements.length },
    { key: 'sheets', title: 'Rate sheets', count: data.sheets.length },
    { key: 'flags', title: 'Flags', count: data.flags.length },
    { key: 'shadow', title: 'Shadow scores', count: data.shadow.length },
  ]

  const lastDecidedFor: Record<TabKey, string | null> = {
    statements: data.lastDecided.statements,
    sheets: data.lastDecided.rates,
    flags: data.lastDecided.flags,
    shadow: data.lastDecided.shadow,
  }

  const emptyCopy: Record<TabKey, string> = {
    statements: 'No statement reviews pending.',
    sheets: 'No rate sheets pending.',
    flags: 'No open flags.',
    shadow: 'No shadow scores due.',
  }

  const queueError = { statements: data.errors.statements, sheets: data.errors.sheets, flags: data.errors.flags, shadow: data.errors.shadow }[tab]

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`sticky top-2 z-20 mb-4 rounded-lg px-4 py-2.5 text-sm font-body border ${
            toast.tone === 'green'
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Tab bar (horizontally scrollable on phones) */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 min-h-[44px] px-4 py-2 rounded-full text-sm font-semibold font-body transition-colors ${
              tab === t.key ? 'bg-navy text-white' : 'bg-white border border-gray-200 text-navy hover:border-navy/40'
            }`}
          >
            {t.title}
            <span
              className={`ml-2 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                tab === t.key ? 'bg-lime text-navy' : t.count > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'
              }`}
            >
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {queueError && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-sm text-amber-800 font-body">This queue could not load fully: {queueError}</p>
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
                <div key={card.documentId} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-navy text-base capitalize">{label(card.docClass)}</h3>
                    <Chip tone="gray">{card.fields.length} fields</Chip>
                    {card.dealRef && (
                      <Link
                        href={`/portal/admin/deals/${card.dealId}`}
                        className="text-xs font-semibold text-navy underline hover:text-lime ml-auto"
                      >
                        {card.dealRef} deal room
                      </Link>
                    )}
                  </div>

                  {/* Extracted fields with their citations, exactly as stored */}
                  <div className="mt-3 divide-y divide-gray-100">
                    {card.fields.map(f => (
                      <div key={f.id} className="py-2">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="text-sm font-body text-gray-600">{label(f.fieldName)}</span>
                          <span className="text-sm font-body font-semibold text-navy">{fieldValue(f)}</span>
                          <span className="text-[11px] text-gray-400">conf {f.confidence}</span>
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
                          <p className="text-xs font-body text-gray-700 mt-1.5">
                            Statement says <span className="font-semibold text-navy">{d.statementValue}</span>
                            {d.statementSource ? ` (${d.statementSource})` : ''}
                          </p>
                          <p className="text-xs font-body text-gray-700 mt-0.5">
                            Application says <span className="font-semibold text-navy">{d.applicationValue}</span>
                            {d.applicationField ? ` for ${label(d.applicationField)}` : ''}
                            {d.applicationSource ? ` (source: ${d.applicationSource})` : ''}
                          </p>
                          {d.policy && <p className="text-[11px] text-gray-500 mt-1">{d.policy}</p>}
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
                          armed={armed === `${key}:approve`}
                          onArm={() => arm(`${key}:approve`)}
                          onFire={() => decideStatement(card, 'approve')}
                        />
                        <PlainButton label="Hold" busy={Boolean(busy[key])} onClick={() => decideStatement(card, 'hold')} />
                        <ConfirmButton
                          label="Reject"
                          confirmLabel="Tap again to reject"
                          tone="reject"
                          busy={Boolean(busy[key])}
                          armed={armed === `${key}:reject`}
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
              const buckets = new Map<number, { min: number; max: number }>()
              for (const q of card.quotes) {
                const b = buckets.get(q.termMonths)
                if (!b) buckets.set(q.termMonths, { min: q.rate, max: q.rate })
                else {
                  b.min = Math.min(b.min, q.rate)
                  b.max = Math.max(b.max, q.rate)
                }
              }
              return (
                <div key={card.intelItemId} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-navy text-base capitalize">
                      {card.lenderSlug ?? 'Unknown lender'}
                    </h3>
                    {card.asOfDate && <Chip tone="gray">sheet {card.asOfDate}</Chip>}
                    <Chip tone="gray">{card.quotes.length} quotes</Chip>
                  </div>
                  <p className="text-xs font-body text-gray-500 mt-2">
                    {Array.from(buckets.entries())
                      .sort((a, b) => a[0] - b[0])
                      .map(([term, r]) =>
                        `${term % 12 === 0 ? `${term / 12}y` : `${term}m`}: ${r.min === r.max ? r.min : `${r.min}-${r.max}`}`,
                      )
                      .join(' · ')}
                  </p>

                  <details className="mt-3 group">
                    <summary className="text-sm font-semibold text-navy cursor-pointer select-none py-1.5">
                      Quote detail
                    </summary>
                    <div className="mt-1 divide-y divide-gray-100">
                      {card.quotes.map(q => (
                        <div key={q.id} className="py-2">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm font-body">
                            <span className="text-gray-600">{label(q.productClass)}</span>
                            {q.variant && <span className="text-gray-400 text-xs">{q.variant}</span>}
                            <span className="text-navy font-semibold">
                              {q.termMonths % 12 === 0 ? `${q.termMonths / 12}yr` : `${q.termMonths}mo`} at {q.rate}%
                            </span>
                            {q.compBps !== null && <span className="text-xs text-gray-500">@ {q.compBps}bps</span>}
                            {q.heldReason && <Chip tone="amber">held: {q.heldReason}</Chip>}
                          </div>
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
                          armed={armed === `${key}:approve`}
                          onArm={() => arm(`${key}:approve`)}
                          onFire={() => decideSheet(card, 'approve')}
                        />
                        <ConfirmButton
                          label="Reject sheet"
                          confirmLabel="Tap again to reject"
                          tone="reject"
                          busy={Boolean(busy[key])}
                          armed={armed === `${key}:reject`}
                          onArm={() => arm(`${key}:reject`)}
                          onFire={() => decideSheet(card, 'reject')}
                        />
                      </div>
                      <p className="text-[11px] text-gray-400 font-body mt-2">
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

        {/* ── Flags ── */}
        {tab === 'flags' &&
          (data.flags.length === 0 ? (
            <EmptyState text={emptyCopy.flags} lastDecided={lastDecidedFor.flags} />
          ) : (
            (['high', 'warning', 'info'] as const).map(sev => {
              const group = data.flags.filter(f => f.severity === sev)
              if (group.length === 0) return null
              return (
                <div key={sev}>
                  <h3 className="font-heading font-bold text-navy text-sm uppercase tracking-wide mb-2 mt-2">
                    {sev} <span className="text-gray-400 font-body font-normal">({group.length})</span>
                  </h3>
                  <div className="space-y-3">
                    {group.map(card => {
                      const key = `flag:${card.id}`
                      const detailEntries = Object.entries(card.detail).filter(
                        ([, v]) => v !== null && v !== undefined && typeof v !== 'object',
                      )
                      return (
                        <div key={card.id} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                          <div className="flex flex-wrap items-center gap-2">
                            <Chip tone={sev === 'high' ? 'red' : sev === 'warning' ? 'amber' : 'gray'}>{sev}</Chip>
                            <h4 className="font-heading font-bold text-navy text-sm capitalize">{label(card.kind)}</h4>
                            {card.dealRef && card.dealId && (
                              <Link
                                href={`/portal/admin/deals/${card.dealId}`}
                                className="text-xs font-semibold text-navy underline hover:text-lime ml-auto"
                              >
                                {card.dealRef} deal room
                              </Link>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 font-body mt-1">raised {fmtWhen(card.createdAt)}</p>
                          {detailEntries.length > 0 && (
                            <div className="mt-2 space-y-0.5">
                              {detailEntries.map(([k, v]) => (
                                <p key={k} className="text-xs font-body text-gray-600 break-words">
                                  <span className="text-gray-400">{label(k)}:</span> {String(v)}
                                </p>
                              ))}
                            </div>
                          )}
                          {card.evidenceRefCount > 0 && (
                            <p className="text-[11px] text-gray-400 font-body mt-1.5">
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
                                    armed={armed === `${key}:${dispo}`}
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
                                cardErrors[key].startsWith('Could not reach')
                                  ? () => disposeFlag(card, 'accepted')
                                  : undefined
                              }
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          ))}

        {/* ── Shadow scores ── */}
        {tab === 'shadow' &&
          (data.shadow.length === 0 ? (
            <EmptyState text={emptyCopy.shadow} lastDecided={lastDecidedFor.shadow} />
          ) : (
            data.shadow.map(card => (
              <div key={card.dealId} className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading font-bold text-navy text-base">{card.fileRef}</h3>
                  {card.stage && <Chip tone="gray">{card.stage}</Chip>}
                  {card.closingDate && <Chip tone="gray">closes {card.closingDate}</Chip>}
                  <Chip tone={card.scoredCount > 0 ? 'amber' : 'gray'}>{card.scoredCount}/4 scored</Chip>
                  <Link
                    href={`/portal/admin/deals/${card.dealId}`}
                    className="text-xs font-semibold text-navy underline hover:text-lime ml-auto"
                  >
                    deal room
                  </Link>
                </div>
                <p className="text-[11px] text-gray-400 font-body mt-1.5">
                  System values are computed and recorded by the workbench at scoring time, through the same pathway the
                  CLI uses. Past scores show what was recorded.
                </p>
                <div className="mt-3 divide-y divide-gray-100">
                  {card.dimensions.map(dim => {
                    const key = `shadow:${card.dealId}:${dim.dimension}`
                    return (
                      <div key={dim.dimension} className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-body font-semibold text-navy capitalize">{dim.dimension}</span>
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
                            <summary className="text-[11px] text-gray-400 cursor-pointer select-none">
                              last recorded system value
                            </summary>
                            <pre className="mt-1 text-[11px] text-gray-600 bg-gray-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
                              {JSON.stringify(dim.lastSystemValue, null, 1)}
                            </pre>
                          </details>
                        )}
                        {dim.lastDisagreementNote && (
                          <p className="text-[11px] text-gray-500 font-body mt-1">
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
                                armed={armed === `${key}:agree`}
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
      </div>
    </div>
  )
}

function EmptyState({ text, lastDecided }: { text: string; lastDecided: string | null }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-6 text-center">
      <p className="text-sm text-gray-500 font-body">{text}</p>
      <p className="text-xs text-gray-400 font-body mt-1">
        {lastDecided ? `Last decision recorded ${fmtWhen(lastDecided)}.` : 'No decisions recorded yet.'}
      </p>
    </div>
  )
}

function ViewOnlyNote() {
  return (
    <p className="text-xs text-gray-400 font-body mt-3">
      Your role can view this queue. Decisions need the admin role.
    </p>
  )
}
