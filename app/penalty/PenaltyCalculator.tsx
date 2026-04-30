'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getActiveLenders, type Lender, type MethodologySource } from '@/lib/lenders'
import {
  calculateAdjustable,
  calculateFixed,
  calculateVariable,
  type PenaltyResult,
} from './calculations'

type MortgageType = 'fixed' | 'variable' | 'adjustable'
type LookupTone = 'success' | 'error' | 'info'
type LookupNote = { msg: string; tone: LookupTone }

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]'

const fmtCurrency = (n: number) =>
  '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPct = (n: number) =>
  (n >= 0 ? '' : '−') + Math.abs(n).toFixed(2) + '%'

async function fetchBoCRate(targetDate: string): Promise<{ rate: number; date: string } | null> {
  const d = new Date(targetDate)
  const start = new Date(d); start.setDate(start.getDate() - 14)
  const end = new Date(d); end.setDate(end.getDate() + 14)
  const fmtDate = (x: Date) => x.toISOString().slice(0, 10)
  const url = `https://www.bankofcanada.ca/valet/observations/V80691335/json?start_date=${fmtDate(start)}&end_date=${fmtDate(end)}`
  const res = await fetch(url)
  const data = await res.json()
  const obs = (data?.observations ?? []) as Array<{ d: string; V80691335: { v: string } }>
  if (obs.length === 0) return null
  let closest = obs[0]
  let minDiff = Math.abs(new Date(obs[0].d).getTime() - d.getTime())
  for (const o of obs) {
    const diff = Math.abs(new Date(o.d).getTime() - d.getTime())
    if (diff < minDiff) { minDiff = diff; closest = o }
  }
  return { rate: parseFloat(closest.V80691335.v), date: closest.d }
}

export default function PenaltyCalculator() {
  const lenders = useMemo(() => getActiveLenders(), [])

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [mortgageType, setMortgageType] = useState<MortgageType>('fixed')

  const [principal, setPrincipal] = useState('482722')
  const [months, setMonths] = useState('39')
  const [fundingDate, setFundingDate] = useState('2023-07-01')

  const [contractRate, setContractRate] = useState('')
  const [postedRate, setPostedRate] = useState('')
  const [comparableRate, setComparableRate] = useState('')

  const [primeRate, setPrimeRate] = useState('4.45')
  const [primeAdjSign, setPrimeAdjSign] = useState<'-' | '+'>('-')
  const [primeAdj, setPrimeAdj] = useState('')

  const [originLookupNote, setOriginLookupNote] = useState<LookupNote | null>(null)
  const [todayLookupNote, setTodayLookupNote] = useState<LookupNote | null>(null)

  const selectedLender = useMemo(
    () => (selectedSlug ? lenders.find((l) => l.slug === selectedSlug) ?? null : null),
    [selectedSlug, lenders],
  )

  function handleLenderSelect(slug: string) {
    setSelectedSlug(slug)
    setMortgageType('fixed')
    setContractRate('')
    setPostedRate('')
    setComparableRate('')
    setPrimeRate('4.45')
    setPrimeAdjSign('-')
    setPrimeAdj('')
    setOriginLookupNote(null)
    setTodayLookupNote(null)
  }

  const result: PenaltyResult | null = useMemo(() => {
    if (!selectedLender) return null
    const p = parseFloat(principal) || 0
    const m = parseFloat(months) || 0
    if (mortgageType === 'fixed') {
      return calculateFixed(selectedLender, {
        principal: p,
        monthsRemaining: m,
        contractRate: parseFloat(contractRate) || 0,
        postedRate: parseFloat(postedRate) || 0,
        comparableRate: parseFloat(comparableRate) || 0,
      })
    }
    if (mortgageType === 'variable') {
      return calculateVariable(selectedLender, {
        principal: p,
        monthsRemaining: m,
        contractRate: parseFloat(contractRate) || 0,
      })
    }
    const pa = parseFloat(primeAdj) || 0
    return calculateAdjustable(selectedLender, {
      principal: p,
      monthsRemaining: m,
      primeRate: parseFloat(primeRate) || 0,
      primeAdjustment: primeAdjSign === '-' ? -pa : pa,
    })
  }, [
    selectedLender, mortgageType, principal, months,
    contractRate, postedRate, comparableRate,
    primeRate, primeAdjSign, primeAdj,
  ])

  const handleOriginLookup = async () => {
    if (!fundingDate) {
      setOriginLookupNote({ msg: 'Enter a funding date first.', tone: 'error' })
      return
    }
    setOriginLookupNote({ msg: 'Fetching from Bank of Canada…', tone: 'info' })
    try {
      const r = await fetchBoCRate(fundingDate)
      if (!r) {
        setOriginLookupNote({ msg: 'No data for that date. Try a different funding date.', tone: 'error' })
        return
      }
      setPostedRate(r.rate.toFixed(2))
      setOriginLookupNote({ msg: `BoC 5-yr posted, week of ${r.date}`, tone: 'success' })
    } catch {
      setOriginLookupNote({ msg: 'Lookup failed. Enter the rate manually.', tone: 'error' })
    }
  }

  const handleTodayLookup = async () => {
    setTodayLookupNote({ msg: 'Fetching from Bank of Canada…', tone: 'info' })
    try {
      const today = new Date().toISOString().slice(0, 10)
      const r = await fetchBoCRate(today)
      if (!r) {
        setTodayLookupNote({ msg: 'No recent data. Enter the rate manually.', tone: 'error' })
        return
      }
      setComparableRate(r.rate.toFixed(2))
      setTodayLookupNote({ msg: `BoC 5-yr posted, week of ${r.date}`, tone: 'success' })
    } catch {
      setTodayLookupNote({ msg: 'Lookup failed. Enter the rate manually.', tone: 'error' })
    }
  }

  const noteToneClass = (tone: LookupTone | undefined) =>
    tone === 'success' ? 'text-green-700'
    : tone === 'error' ? 'text-red-600'
    : 'text-gray-500'

  const irdIsHighlighted = result ? result.irdPenalty >= result.threeMonthPenalty : false

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-3xl text-[#032133] mb-2">
          Mortgage prepayment penalty
        </h2>
        <p className="font-body text-sm text-gray-600">
          Estimate the cost to break a mortgage early. Select the lender to apply their methodology automatically.
        </p>
      </div>

      {/* Total card — primary result */}
      {result && selectedLender ? (
        <div className="rounded-2xl border-2 border-[#032133] bg-[#032133] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-body text-xs uppercase tracking-wider text-[#95D600] font-medium mb-1">
                Total estimated penalty
              </div>
              <div className="font-heading text-4xl text-white tabular-nums">
                {fmtCurrency(result.totalPenalty)}
              </div>
              <div className="font-body text-xs text-white/60 mt-2">
                {mortgageType === 'fixed'
                  ? irdIsHighlighted
                    ? 'IRD applies (greater than 3-month interest)'
                    : '3-month interest applies (greater than IRD)'
                  : `3-month interest only — no IRD on ${mortgageType} rate mortgages`}
              </div>
            </div>
            <div className="hidden sm:block">
              <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                <div className="font-body text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Method</div>
                <div className="font-body text-xs text-white font-medium">
                  {selectedLender.name} — {result.methodLabel}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white p-6">
          <div className="font-body text-sm text-gray-500">
            Select a lender below to begin.
          </div>
        </div>
      )}

      {/* Methodology source badge */}
      {selectedLender && <MethodologyBadge source={selectedLender.methodologySource} />}

      {/* Disclosure */}
      <div className="rounded-lg border-l-4 border-[#95D600] bg-[#95D600]/10 px-4 py-3">
        <p className="font-body text-xs text-[#032133] leading-relaxed">
          <span className="font-medium">Estimate only.</span> For exact penalty figures, ask the client for their original mortgage commitment letter so we can use the actual posted rate at funding. Lender-specific rounding and amortization adjustments may move the final number by a few hundred dollars.
        </p>
      </div>

      {/* Step 1 — Lender */}
      <div>
        <label className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 block">
          Lender
        </label>
        <LenderCombobox
          lenders={lenders}
          selectedSlug={selectedSlug}
          onSelect={handleLenderSelect}
        />
      </div>

      {/* Step 2 — Mortgage type */}
      {selectedLender && (
        <div>
          <label className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 block">
            Mortgage type
          </label>
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
            {(['fixed', 'variable', 'adjustable'] as MortgageType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setMortgageType(t)}
                className={`flex-1 px-3 py-2 rounded-md font-body text-sm transition ${
                  mortgageType === t
                    ? 'bg-white text-[#032133] font-medium shadow-sm'
                    : 'bg-transparent text-gray-600 font-normal hover:text-[#032133]'
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Inputs */}
      {selectedLender && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h3 className="font-heading text-base text-[#032133] mb-4">
            Mortgage details
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Principal balance">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  className={`${inputClass} pl-7`}
                />
              </div>
            </Field>

            <Field label="Months remaining">
              <input
                type="number"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Funding date" className="sm:col-span-2">
              <input
                type="date"
                value={fundingDate}
                onChange={(e) => setFundingDate(e.target.value)}
                className={inputClass}
              />
            </Field>

            {mortgageType === 'fixed' && (
              <>
                <Field label="Contract rate (%)" className="sm:col-span-2">
                  <input
                    type="number"
                    step="0.01"
                    value={contractRate}
                    onChange={(e) => setContractRate(e.target.value)}
                    className={inputClass}
                  />
                </Field>

                {selectedLender.irdMethod === 'discounted' && (
                  <Field
                    label="Posted rate at origination (%)"
                    action={
                      <button
                        type="button"
                        onClick={handleOriginLookup}
                        className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition whitespace-nowrap"
                      >
                        Look up at funding
                      </button>
                    }
                  >
                    <input
                      type="number"
                      step="0.01"
                      value={postedRate}
                      onChange={(e) => setPostedRate(e.target.value)}
                      className={inputClass}
                    />
                    {originLookupNote && (
                      <p className={`font-body text-xs mt-1 ${noteToneClass(originLookupNote.tone)}`}>
                        {originLookupNote.msg}
                      </p>
                    )}
                  </Field>
                )}

                <Field
                  label="Comparable term posted rate (%)"
                  className={selectedLender.irdMethod === 'discounted' ? '' : 'sm:col-span-2'}
                  action={
                    <button
                      type="button"
                      onClick={handleTodayLookup}
                      className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition whitespace-nowrap"
                    >
                      Look up today
                    </button>
                  }
                >
                  <input
                    type="number"
                    step="0.01"
                    value={comparableRate}
                    onChange={(e) => setComparableRate(e.target.value)}
                    className={inputClass}
                  />
                  {todayLookupNote && (
                    <p className={`font-body text-xs mt-1 ${noteToneClass(todayLookupNote.tone)}`}>
                      {todayLookupNote.msg}
                    </p>
                  )}
                </Field>
              </>
            )}

            {mortgageType === 'variable' && (
              <Field label="Contract rate (%)" className="sm:col-span-2">
                <input
                  type="number"
                  step="0.01"
                  value={contractRate}
                  onChange={(e) => setContractRate(e.target.value)}
                  className={inputClass}
                />
              </Field>
            )}

            {mortgageType === 'adjustable' && (
              <>
                <Field label="Prime rate (%)">
                  <input
                    type="number"
                    step="0.01"
                    value={primeRate}
                    onChange={(e) => setPrimeRate(e.target.value)}
                    className={inputClass}
                  />
                  <p className="font-body text-xs text-gray-500 mt-1">
                    Current Bank of Canada prime: 4.45%
                  </p>
                </Field>

                <Field label="Prime adjustment (%)">
                  <div className="flex gap-2">
                    <select
                      value={primeAdjSign}
                      onChange={(e) => setPrimeAdjSign(e.target.value as '-' | '+')}
                      className="px-2 py-2 border border-gray-300 rounded-md font-body text-sm bg-white"
                    >
                      <option value="-">−</option>
                      <option value="+">+</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      value={primeAdj}
                      onChange={(e) => setPrimeAdj(e.target.value)}
                      className={`${inputClass} flex-1`}
                    />
                  </div>
                </Field>

                <Field label="Client rate (%)" className="sm:col-span-2">
                  <input
                    type="text"
                    value={result ? result.breakdown.contractRate.toFixed(2) : '—'}
                    readOnly
                    className={`${inputClass} bg-gray-50 text-gray-600`}
                  />
                </Field>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 4 — Calculation breakdown */}
      {result && selectedLender && (
        <div className="rounded-2xl border border-gray-200 bg-white p-6">
          <h3 className="font-heading text-base text-[#032133] mb-4">
            Calculation breakdown
          </h3>

          <div className="grid grid-cols-3 gap-3 mb-5">
            {mortgageType === 'fixed' ? (
              <>
                <Stat label="Rate discount" value={fmtPct(result.discount)} />
                <Stat label="IRD differential" value={fmtPct(result.irdRateRaw)} />
                <Stat label="Methodology" value={result.methodLabel} small />
              </>
            ) : (
              <>
                <Stat label="Rate discount" value="—" />
                <Stat label="IRD differential" value="—" />
                <Stat label="Methodology" value={result.methodLabel} small />
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <PenaltyCard
              label="Estimated IRD penalty"
              value={fmtCurrency(result.irdPenalty)}
              highlighted={mortgageType === 'fixed' && irdIsHighlighted}
              note={
                mortgageType !== 'fixed'
                  ? `No IRD applies to ${mortgageType} rate mortgages.`
                  : result.irdRateRaw < 0
                  ? 'Today’s rates exceed the contract rate. No IRD applies.'
                  : result.irdRateRaw === 0
                  ? 'Rates are flat. No IRD applies.'
                  : null
              }
            />
            <PenaltyCard
              label="Estimated 3-month interest"
              value={fmtCurrency(result.threeMonthPenalty)}
              highlighted={mortgageType !== 'fixed' || !irdIsHighlighted}
            />
          </div>
        </div>
      )}

      <div className="font-body text-xs text-gray-500 leading-relaxed space-y-2">
        <p>
          <span className="font-medium text-gray-700">Disclaimer:</span> This calculator is for illustrative purposes only and should not be relied upon for financial planning. Actual penalties depend on lender-specific calculations and rate changes daily. The estimate does not include reinvestment fees, discharge fees, assignment fees, or other administrative costs. The simplified IRD method does not factor in amortization or present value, which means estimated figures may differ from the lender’s final payout statement.
        </p>
      </div>
    </div>
  )
}

function Field({
  label,
  children,
  action,
  disabled,
  className,
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={`${disabled ? 'opacity-50' : ''} ${className ?? ''}`}>
      <label className="font-body text-xs text-gray-600 mb-1.5 flex items-center justify-between gap-2">
        <span>{label}</span>
        {action}
      </label>
      {children}
    </div>
  )
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <div className="font-body text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">
        {label}
      </div>
      <div className={`font-heading text-[#032133] tabular-nums ${small ? 'text-sm' : 'text-lg'}`}>
        {value}
      </div>
    </div>
  )
}

function PenaltyCard({
  label,
  value,
  highlighted,
  note,
}: {
  label: string
  value: string
  highlighted: boolean
  note?: string | null
}) {
  return (
    <div
      className={`rounded-lg p-4 transition ${
        highlighted
          ? 'bg-[#95D600]/15 border-2 border-[#95D600]'
          : 'bg-white border border-gray-200'
      }`}
    >
      <div className="font-body text-xs text-gray-600 mb-1">{label}</div>
      <div className="font-heading text-2xl text-[#032133] tabular-nums">{value}</div>
      {note && (
        <div className="font-body text-[11px] text-gray-500 mt-1.5 leading-snug">{note}</div>
      )}
    </div>
  )
}

const METHODOLOGY_BADGE_STYLE: Record<
  MethodologySource,
  { container: string; dot: string; text: string; label: string; detail: string | null }
> = {
  'Verified from commitment letter': {
    container: 'bg-green-50 border-green-200',
    dot: 'bg-green-700',
    text: 'text-green-800',
    label: 'Verified from commitment letter',
    detail: null,
  },
  'Industry standard': {
    container: 'bg-gray-50 border-gray-200',
    dot: 'bg-gray-500',
    text: 'text-gray-700',
    label: 'Industry standard methodology',
    detail: null,
  },
  Estimated: {
    container: 'bg-amber-50 border-amber-200',
    dot: 'bg-amber-600',
    text: 'text-amber-800',
    label: 'Estimated methodology',
    detail: 'verify with commitment letter',
  },
}

function MethodologyBadge({ source }: { source: MethodologySource }) {
  const cfg = METHODOLOGY_BADGE_STYLE[source]
  return (
    <div className={`flex items-center gap-2 rounded-lg border ${cfg.container} px-3 py-2`}>
      <div className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      <span className={`font-body text-xs ${cfg.text} font-medium`}>{cfg.label}</span>
      {cfg.detail && (
        <span className={`font-body text-xs ${cfg.text} opacity-70`}>— {cfg.detail}</span>
      )}
    </div>
  )
}

function LenderCombobox({
  lenders,
  selectedSlug,
  onSelect,
}: {
  lenders: Lender[]
  selectedSlug: string | null
  onSelect: (slug: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = useMemo(
    () => lenders.find((l) => l.slug === selectedSlug) ?? null,
    [lenders, selectedSlug],
  )

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const filtered = useMemo(() => {
    if (!query) return lenders
    const q = query.toLowerCase()
    return lenders.filter((l) => l.name.toLowerCase().includes(q))
  }, [lenders, query])

  const displayValue = open ? query : selected?.name ?? ''

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={displayValue}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setQuery('')
          setOpen(true)
        }}
        placeholder="Type to search lenders…"
        className={inputClass}
      />
      {open && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <div className="px-3 py-2 font-body text-sm text-gray-500">No matches</div>
          ) : (
            filtered.map((l) => (
              <button
                key={l.slug}
                type="button"
                onClick={() => {
                  onSelect(l.slug)
                  setQuery('')
                  setOpen(false)
                }}
                className={`w-full text-left px-3 py-2 font-body text-sm transition hover:bg-gray-50 ${
                  l.slug === selectedSlug
                    ? 'bg-[#95D600]/10 text-[#032133] font-medium'
                    : 'text-gray-700'
                }`}
              >
                {l.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
