'use client'

// The deal room's client-presentation authoring card (B8b). Michael composes
// scenarios, selects graded offers, and mints the pre-approval letter here;
// each surface has its own publish control, and only PUBLISHED records reach the
// client's page. Nothing sends — the client sees it on their own private link.
//
// Type-only imports throughout: lib/client-presentation uses node:crypto and
// the store is server-only, so this client bundle must carry neither. Every
// mutation POSTs to the presentation routes (gated, operator-secret-backed,
// demo-refused) and then router.refresh() re-reads the server truth.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip from '@/components/admin/ds/StatusChip'
import type { ScenarioRow, OfferRow, LetterRow } from '@/lib/client-presentation-store'
import type { OfferPickRow } from '@/lib/client-presentation'
import type { OfferGrade } from '@/config/offer-rubric'

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
const fmtDate = (iso: string) => {
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
}
const termWords = (m: number) => (m % 12 === 0 ? `${m / 12}yr` : `${m}mo`)

async function post(path: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.ok, message: data.message }
  } catch {
    return { ok: false, message: 'Could not reach the server.' }
  }
}

export default function ClientPresentationCard({
  zohoDealId,
  fileRef,
  isPurchase,
  canManage,
  scenarios,
  offers,
  letters,
  offerPickList,
}: {
  zohoDealId: string | null
  fileRef: string | null
  isPurchase: boolean
  canManage: boolean
  scenarios: ScenarioRow[]
  offers: OfferRow[]
  letters: LetterRow[]
  offerPickList: OfferPickRow[]
}) {
  if (!zohoDealId) {
    return (
      <p className="font-ui text-[13px] text-cool-600">
        This file has no linked Zoho deal, so there is nothing to publish to a client yet.
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <ScenariosPanel
        zohoDealId={zohoDealId}
        fileRef={fileRef}
        canManage={canManage}
        rows={scenarios}
      />
      <OffersPanel
        zohoDealId={zohoDealId}
        fileRef={fileRef}
        canManage={canManage}
        rows={offers}
        pickList={offerPickList}
      />
      <LetterPanel
        zohoDealId={zohoDealId}
        fileRef={fileRef}
        isPurchase={isPurchase}
        canManage={canManage}
        rows={letters}
      />
    </div>
  )
}

function PanelHead({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <p className="font-heading text-[13px] font-semibold text-navy">{title}</p>
      <p className="mt-0.5 font-ui text-[12px] text-cool-600">{hint}</p>
    </div>
  )
}

function PublishChip({ published }: { published: boolean }) {
  return <StatusChip tone={published ? 'green' : 'gray'}>{published ? 'published' : 'draft'}</StatusChip>
}

// ── Scenarios ────────────────────────────────────────────────────────────────

function ScenariosPanel({
  zohoDealId,
  fileRef,
  canManage,
  rows,
}: {
  zohoDealId: string
  fileRef: string | null
  canManage: boolean
  rows: ScenarioRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('')
  const [amort, setAmort] = useState('25')

  const act = async (body: Record<string, unknown>, reset?: () => void) => {
    setBusy(true)
    setErr(null)
    const r = await post('/api/portal/admin/client-presentation/scenarios', {
      zohoDealId,
      fileRef,
      ...body,
    })
    setBusy(false)
    if (!r.ok) {
      setErr(r.message ?? 'That did not work.')
      return
    }
    reset?.()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      <PanelHead title="Scenarios" hint="Named what-ifs, computed here and shown side by side." />
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-cool-100">
          {rows.map(s => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 py-2">
              <PublishChip published={s.published} />
              <span className="font-ui text-[13px] font-semibold text-navy">{s.label}</span>
              <span className="font-ui text-[12px] text-cool-600 tabular-nums">
                {money(s.figures.monthlyPayment)}/mo · {money(s.inputs.mortgageAmount)} · {s.inputs.ratePct}% ·{' '}
                {s.inputs.amortizationYears}yr
              </span>
              {canManage && (
                <span className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: 'publish', id: s.id, published: !s.published })}
                    className="rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[12px] font-semibold text-navy hover:border-navy disabled:opacity-50"
                  >
                    {s.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: 'delete', id: s.id })}
                    className="rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[12px] font-semibold text-navy hover:border-navy disabled:opacity-50"
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="rounded-[9px] border border-cool-200 bg-cool-50 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Label" value={label} onChange={setLabel} placeholder="e.g. Pay off the car" span2 />
            <Field label="Amount" value={amount} onChange={setAmount} placeholder="465000" />
            <Field label="Rate %" value={rate} onChange={setRate} placeholder="4.79" />
            <Field label="Amortization (yrs)" value={amort} onChange={setAmort} placeholder="25" />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                {
                  action: 'upsert',
                  label,
                  mortgageAmount: Number(amount),
                  ratePct: Number(rate),
                  amortizationYears: Number(amort),
                },
                () => {
                  setLabel('')
                  setAmount('')
                  setRate('')
                },
              )
            }
            className="mt-2 rounded-md bg-navy px-3 py-1.5 font-ui text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : 'Add scenario'}
          </button>
        </div>
      )}
      {err && <p className="font-ui text-[12px] text-danger">{err}</p>}
    </div>
  )
}

// ── Offers ───────────────────────────────────────────────────────────────────

function GradePill({ grade }: { grade: OfferGrade }) {
  if (!grade.coverageComplete || grade.letter === null) {
    return (
      <StatusChip tone="gray">grading incomplete · {grade.gradeablePoints}/100</StatusChip>
    )
  }
  const tone = grade.letter === 'A' ? 'green' : grade.letter === 'B' ? 'navy' : grade.letter === 'C' ? 'amber' : 'gray'
  return <StatusChip tone={tone as any}>grade {grade.letter} · {grade.earnedPoints}/100</StatusChip>
}

function OffersPanel({
  zohoDealId,
  fileRef,
  canManage,
  rows,
  pickList,
}: {
  zohoDealId: string
  fileRef: string | null
  canManage: boolean
  rows: OfferRow[]
  pickList: OfferPickRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [lender, setLender] = useState('')
  const [term, setTerm] = useState('')

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    setErr(null)
    const r = await post('/api/portal/admin/client-presentation/offers', { zohoDealId, fileRef, ...body })
    setBusy(false)
    if (!r.ok) {
      setErr(r.message ?? 'That did not work.')
      return
    }
    router.refresh()
  }

  const lenders = Array.from(new Set(pickList.map(p => p.lenderName))).sort()
  const terms = Array.from(new Set(pickList.map(p => p.termMonths))).sort((a, b) => a - b)
  const filtered = pickList
    .filter(p => (!lender || p.lenderName === lender) && (!term || p.termMonths === Number(term)))
    .slice(0, 40)

  return (
    <div className="flex flex-col gap-3 border-t border-cool-100 pt-5">
      <PanelHead title="Offers" hint="Lender options from the approved book, each graded on cited truth." />
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y divide-cool-100">
          {rows.map(o => (
            <li key={o.id} className="flex flex-wrap items-center gap-2 py-2">
              <PublishChip published={o.published} />
              <span className="font-ui text-[13px] font-semibold text-navy">{o.snapshot.lenderName}</span>
              <span className="font-ui text-[12px] text-cool-600 tabular-nums">
                {termWords(o.snapshot.termMonths)} · {o.snapshot.rateDisplay}
              </span>
              <GradePill grade={o.snapshot.grade} />
              {canManage && (
                <span className="ml-auto flex gap-1.5">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: 'publish', id: o.id, published: !o.published })}
                    className="rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[12px] font-semibold text-navy hover:border-navy disabled:opacity-50"
                  >
                    {o.published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => act({ action: 'delete', id: o.id })}
                    className="rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[12px] font-semibold text-navy hover:border-navy disabled:opacity-50"
                  >
                    Remove
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {canManage && (
        <div className="rounded-[9px] border border-cool-200 bg-cool-50 p-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={lender}
              onChange={e => setLender(e.target.value)}
              className="rounded-md border border-cool-300 bg-white px-2 py-1.5 font-ui text-[12px] text-navy"
            >
              <option value="">All lenders</option>
              {lenders.map(l => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <select
              value={term}
              onChange={e => setTerm(e.target.value)}
              className="rounded-md border border-cool-300 bg-white px-2 py-1.5 font-ui text-[12px] text-navy"
            >
              <option value="">All terms</option>
              {terms.map(t => (
                <option key={t} value={String(t)}>
                  {termWords(t)}
                </option>
              ))}
            </select>
          </div>
          <ul className="mt-2 max-h-52 overflow-y-auto divide-y divide-cool-100">
            {filtered.map(p => (
              <li key={p.quoteId} className="flex items-center gap-2 py-1.5">
                <span className="font-ui text-[12px] text-navy">
                  <span className="font-semibold">{p.lenderName}</span> · {termWords(p.termMonths)} ·{' '}
                  {p.rateDisplay} · {p.productClass}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => act({ action: 'create', quoteId: p.quoteId })}
                  className="ml-auto rounded-md bg-navy px-2.5 py-1 font-ui text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  Add
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="py-2 font-ui text-[12px] text-cool-500">No approved rates match that filter.</li>
            )}
          </ul>
        </div>
      )}
      {err && <p className="font-ui text-[12px] text-danger">{err}</p>}
    </div>
  )
}

// ── Letter ───────────────────────────────────────────────────────────────────

function LetterPanel({
  zohoDealId,
  fileRef,
  isPurchase,
  canManage,
  rows,
}: {
  zohoDealId: string
  fileRef: string | null
  isPurchase: boolean
  canManage: boolean
  rows: LetterRow[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [price, setPrice] = useState('')
  const [rate, setRate] = useState('')
  const [expiry, setExpiry] = useState('')
  const [conditions, setConditions] = useState('')
  const [firstName, setFirstName] = useState('')

  const current = rows.find(r => r.supersededAt === null) ?? null

  const act = async (body: Record<string, unknown>, reset?: () => void) => {
    setBusy(true)
    setErr(null)
    const r = await post('/api/portal/admin/client-presentation/letters', { zohoDealId, fileRef, ...body })
    setBusy(false)
    if (!r.ok) {
      setErr(r.message ?? 'That did not work.')
      return
    }
    reset?.()
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3 border-t border-cool-100 pt-5">
      <PanelHead
        title="Pre-approval letter"
        hint={
          isPurchase
            ? 'Purchase files only. Mint a letter the client downloads while it is valid.'
            : 'Available on purchase files only.'
        }
      />
      {current && (
        <div className="rounded-[9px] border border-cool-200 bg-cool-50 p-3">
          <p className="font-ui text-[13px] text-navy">
            <span className="font-semibold">Current letter:</span> up to {money(current.snapshot.inputs.maxPurchasePrice)}{' '}
            at {current.snapshot.inputs.ratePct}%, held to {fmtDate(current.rateHoldExpiry)}
          </p>
          <p className="mt-0.5 font-ui text-[12px] text-cool-600">Minted {fmtDate(current.createdAt)}</p>
          {canManage && (
            <button
              type="button"
              disabled={busy}
              onClick={() => act({ action: 'retract', id: current.id })}
              className="mt-2 rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[12px] font-semibold text-navy hover:border-navy disabled:opacity-50"
            >
              Retract
            </button>
          )}
        </div>
      )}
      {canManage && isPurchase && (
        <div className="rounded-[9px] border border-cool-200 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Max purchase price" value={price} onChange={setPrice} placeholder="720000" />
            <Field label="Rate %" value={rate} onChange={setRate} placeholder="4.59" />
            <Field label="Rate hold expiry" value={expiry} onChange={setExpiry} placeholder="2026-12-31" type="date" />
            <Field label="Client first name" value={firstName} onChange={setFirstName} placeholder="Sofia" />
            <Field label="Conditions" value={conditions} onChange={setConditions} placeholder="Down payment and income confirmation, satisfactory appraisal." span2 />
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              act(
                {
                  action: 'mint',
                  maxPurchasePrice: Number(price),
                  ratePct: Number(rate),
                  rateHoldExpiry: expiry,
                  conditions,
                  clientFirstName: firstName,
                },
                () => {
                  setPrice('')
                  setRate('')
                  setExpiry('')
                  setConditions('')
                },
              )
            }
            className="mt-2 rounded-md bg-navy px-3 py-1.5 font-ui text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : current ? 'Mint a new letter (supersedes)' : 'Mint letter'}
          </button>
        </div>
      )}
      {err && <p className="font-ui text-[12px] text-danger">{err}</p>}
    </div>
  )
}

// ── Shared field ─────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  onChange,
  placeholder,
  span2,
  type,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  span2?: boolean
  type?: string
}) {
  return (
    <label className={`flex flex-col gap-1 ${span2 ? 'col-span-2 sm:col-span-2' : ''}`}>
      <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.05em] text-cool-600">
        {label}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        className="rounded-md border border-cool-300 bg-white px-2 py-1.5 font-ui text-[12px] text-navy"
      />
    </label>
  )
}
