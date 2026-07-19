'use client'

// The deal room's qualification-baseline card (B9). Michael reviews the baseline
// the platform proposes from the file's truth, edits any value, and publishes it
// to the client's "Can I afford it?" section. Only a PUBLISHED baseline reaches
// the client page; unpublishing removes the section.
//
// Navy + StatusChip only (no lime, no decision token) — the lime audit walks
// this file. computeQualification is a value import: it is the pure client-safe
// engine (no node:crypto, no store), so the card previews exactly what the
// client will see, from the same code.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import StatusChip from '@/components/admin/ds/StatusChip'
import { computeQualification, validateBaseline, type QualificationBaseline, type QualificationSources, type QualificationBaselineRow, type FieldSource } from '@/lib/qualification'

const money = (n: number) => `$${Math.round(n).toLocaleString('en-CA')}`
const pct = (r: number) => (Number.isFinite(r) ? `${(r * 100).toFixed(1)}%` : '-')

async function post(path: string, body: unknown): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok && data.ok, message: data.message }
  } catch {
    return { ok: false, message: 'Could not reach the server.' }
  }
}

const ROUTE = '/api/portal/admin/client-qualification'

export default function QualificationBaselineCard({
  zohoDealId,
  fileRef,
  canManage,
  rows,
  proposed,
}: {
  zohoDealId: string | null
  fileRef: string | null
  canManage: boolean
  rows: QualificationBaselineRow[]
  proposed: { baseline: QualificationBaseline; sources: QualificationSources }
}) {
  const router = useRouter()
  const current = rows.find(r => r.published) ?? rows[0] ?? null
  const init = current?.baseline ?? proposed.baseline
  const initSources = current ? current.sources : proposed.sources

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [income, setIncome] = useState(String(init.annualIncome))
  const [debts, setDebts] = useState(String(init.monthlyDebts))
  const [heat, setHeat] = useState(String(init.heatMonthly))
  const [rate, setRate] = useState(String(init.contractRatePct))
  const [stressMode, setStressMode] = useState<'b20' | 'contract'>(init.stressMode)
  const [amortYears, setAmortYears] = useState(String(init.amortizationMonths / 12))
  const [price, setPrice] = useState(String(init.defaultPrice))
  const [down, setDown] = useState(String(init.defaultDownPayment))
  const [tax, setTax] = useState(String(init.defaultPropertyTaxMonthly))
  const [condo, setCondo] = useState(String(init.defaultCondoMonthly))
  const [sources, setSources] = useState<QualificationSources>({ ...initSources })

  if (!zohoDealId) {
    return (
      <p className="font-ui text-[13px] text-cool-600">
        This file has no linked Zoho deal, so there is nothing to publish to a client yet.
      </p>
    )
  }

  const mark = (field: keyof QualificationBaseline) => setSources(s => ({ ...s, [field]: 'edited' as FieldSource }))

  const formBaseline: QualificationBaseline = {
    annualIncome: Number(income),
    monthlyDebts: Number(debts),
    heatMonthly: Number(heat),
    contractRatePct: Number(rate),
    stressMode,
    amortizationMonths: Math.round(Number(amortYears) * 12),
    condoInclusionRate: 0.5,
    gdsLimit: 0.39,
    tdsLimit: 0.44,
    compounding: 'semi-annual',
    defaultPrice: Number(price),
    defaultDownPayment: Number(down),
    defaultPropertyTaxMonthly: Number(tax),
    defaultCondoMonthly: Number(condo),
  }
  const valid = validateBaseline(formBaseline)
  const preview = valid.ok
    ? computeQualification(valid.baseline, {
        price: valid.baseline.defaultPrice,
        downPayment: valid.baseline.defaultDownPayment,
        propertyTaxMonthly: valid.baseline.defaultPropertyTaxMonthly,
        condoMonthly: valid.baseline.defaultCondoMonthly,
      })
    : null

  const act = async (body: Record<string, unknown>) => {
    setBusy(true)
    setErr(null)
    const r = await post(ROUTE, { zohoDealId, fileRef, ...body })
    setBusy(false)
    if (!r.ok) {
      setErr(r.message ?? 'That did not work.')
      return
    }
    router.refresh()
  }

  const save = () =>
    act({
      action: 'upsert',
      id: current?.id ?? null,
      ...formBaseline,
      sources,
    })

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="font-heading text-[13px] font-semibold text-navy">Qualification explorer</p>
        <p className="mt-0.5 font-ui text-[12px] text-cool-600">
          The affordability tool on the client&rsquo;s page. Review the numbers, edit any of them, then publish.
        </p>
      </div>

      {current && (
        <div className="flex flex-wrap items-center gap-2 rounded-[9px] border border-cool-200 bg-cool-50 p-3">
          <StatusChip tone={current.published ? 'green' : 'gray'}>{current.published ? 'published' : 'draft'}</StatusChip>
          <span className="font-ui text-[12px] text-cool-600 tabular-nums">
            {money(current.baseline.annualIncome)}/yr · {current.baseline.contractRatePct}% · start {money(current.baseline.defaultPrice)}
          </span>
          {canManage && (
            <span className="ml-auto flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: 'publish', id: current.id, published: !current.published })}
                className="rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[12px] font-semibold text-navy hover:border-navy disabled:opacity-50"
              >
                {current.published ? 'Unpublish' : 'Publish'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act({ action: 'delete', id: current.id })}
                className="rounded-md border border-cool-300 px-2.5 py-1 font-ui text-[12px] font-semibold text-navy hover:border-navy disabled:opacity-50"
              >
                Remove
              </button>
            </span>
          )}
        </div>
      )}

      {canManage && (
        <div className="rounded-[9px] border border-cool-200 bg-white p-3">
          <p className="font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-600">
            Set by you from the file
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Field label="Yearly income" value={income} onChange={v => { setIncome(v); mark('annualIncome') }} source={sources.annualIncome} />
            <Field label="Monthly debts" value={debts} onChange={v => { setDebts(v); mark('monthlyDebts') }} source={sources.monthlyDebts} />
            <Field label="Heating / mo" value={heat} onChange={v => { setHeat(v); mark('heatMonthly') }} source={sources.heatMonthly} />
            <Field label="Rate %" value={rate} onChange={v => { setRate(v); mark('contractRatePct') }} source={sources.contractRatePct} />
            <label className="flex flex-col gap-1">
              <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.05em] text-cool-600">Stress test</span>
              <select
                value={stressMode}
                onChange={e => { setStressMode(e.target.value as 'b20' | 'contract'); mark('stressMode') }}
                className="rounded-md border border-cool-300 bg-white px-2 py-1.5 font-ui text-[12px] text-navy"
              >
                <option value="b20">B20 (rate + 2, floor 5.25)</option>
                <option value="contract">Contract rate</option>
              </select>
            </label>
            <Field label="Amortization (yrs)" value={amortYears} onChange={v => { setAmortYears(v); mark('amortizationMonths') }} source={sources.amortizationMonths} />
          </div>

          <p className="mt-3 font-heading text-[11px] font-semibold uppercase tracking-[0.05em] text-cool-600">
            Starting numbers the client can move
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Field label="Home price" value={price} onChange={v => { setPrice(v); mark('defaultPrice') }} source={sources.defaultPrice} />
            <Field label="Down payment" value={down} onChange={v => { setDown(v); mark('defaultDownPayment') }} source={sources.defaultDownPayment} />
            <Field label="Prop. tax / mo" value={tax} onChange={v => { setTax(v); mark('defaultPropertyTaxMonthly') }} source={sources.defaultPropertyTaxMonthly} />
            <Field label="Condo / mo" value={condo} onChange={v => { setCondo(v); mark('defaultCondoMonthly') }} source={sources.defaultCondoMonthly} />
          </div>

          {/* Live preview from the SAME engine the client runs. */}
          {preview ? (
            <div className="mt-3 rounded-md bg-cool-50 p-2.5">
              <p className="font-ui text-[12px] text-navy">
                <span className="font-semibold">At the starting numbers the client sees:</span>{' '}
                {preview.band.headline}
              </p>
              <p className="mt-0.5 font-ui text-[12px] text-cool-600 tabular-nums">
                Home costs {pct(preview.gds)} · all costs {pct(preview.tds)} · mortgage {money(preview.mortgage)}
                {preview.insured ? ' (with default insurance)' : ''}
              </p>
            </div>
          ) : (
            <p className="mt-3 font-ui text-[12px] text-cool-500">
              {valid.ok ? '' : `Needs ${(valid as { missing: string[] }).missing.join(', ')} before it can publish.`}
            </p>
          )}

          <button
            type="button"
            disabled={busy || !valid.ok}
            onClick={save}
            className="mt-3 rounded-md bg-navy px-3 py-1.5 font-ui text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Working…' : current ? 'Save changes' : 'Save baseline'}
          </button>
          <p className="mt-1.5 font-ui text-[11px] text-cool-500">
            Saving stores a draft. It only shows to the client once you publish it.
          </p>
        </div>
      )}
      {!canManage && !current && (
        <p className="font-ui text-[12px] text-cool-500">No baseline has been published for this file yet.</p>
      )}
      {err && <p className="font-ui text-[12px] text-danger">{err}</p>}
    </div>
  )
}

const SOURCE_LABEL: Record<FieldSource, string> = {
  file: 'from the file',
  default: 'default',
  edited: 'you set this',
}

function Field({
  label,
  value,
  onChange,
  source,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  source?: FieldSource
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-baseline justify-between gap-1">
        <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.05em] text-cool-600">{label}</span>
        {source && <span className="font-ui text-[9px] text-cool-400">{SOURCE_LABEL[source]}</span>}
      </span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="rounded-md border border-cool-300 bg-white px-2 py-1.5 font-ui text-[12px] tabular-nums text-navy"
      />
    </label>
  )
}
