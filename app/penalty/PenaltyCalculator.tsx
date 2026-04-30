'use client'

import { useEffect, useMemo, useState } from 'react'

type Preset = 'big5' | 'standard' | 'manual'

const PRESET_NOTES: Record<Preset, string> = {
  big5: 'Big 5 method (TD, RBC, BMO, Scotia, CIBC, NBC). 3-month interest uses posted rate. IRD uses original posted rate at funding minus original discount.',
  standard: 'Standard method (most monolines, credit unions). 3-month interest uses contract rate. IRD compares contract rate to today’s comparable term rate.',
  manual: 'Manual mode. Enter all values directly. The calculator will show both penalty amounts but will not assume a methodology.',
}

const fmtCurrency = (n: number) =>
  '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtPct = (n: number) =>
  (n >= 0 ? '' : '-') + Math.abs(n).toFixed(2) + '%'

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
  const [preset, setPreset] = useState<Preset>('big5')

  const [principal, setPrincipal] = useState('482722')
  const [months, setMonths] = useState('39')
  const [fundingDate, setFundingDate] = useState('2023-07-01')
  const [contract, setContract] = useState('5.50')
  const [posted, setPosted] = useState('6.84')
  const [comparable, setComparable] = useState('6.04')
  const [threeMonthRate, setThreeMonthRate] = useState('6.84')

  const [originLookupNote, setOriginLookupNote] = useState<{ msg: string; tone: 'success' | 'error' | 'info' } | null>(null)
  const [todayLookupNote, setTodayLookupNote] = useState<{ msg: string; tone: 'success' | 'error' | 'info' } | null>(null)

  // Auto-sync the 3-month rate field when preset/source rates change
  useEffect(() => {
    if (preset === 'big5') setThreeMonthRate(posted)
    else if (preset === 'standard') setThreeMonthRate(contract)
  }, [preset, posted, contract])

  const calc = useMemo(() => {
    const p = parseFloat(principal) || 0
    const m = parseFloat(months) || 0
    const c = parseFloat(contract) || 0
    const po = parseFloat(posted) || 0
    const cmp = parseFloat(comparable) || 0
    const tm = parseFloat(threeMonthRate) || 0

    const discount = po - c
    const irdRateRaw = preset === 'big5' ? c - (cmp - discount) : c - cmp
    const irdRate = irdRateRaw < 0 ? 0 : irdRateRaw

    const irdPenalty = p * (irdRate / 100) * (m / 12)
    const threeMonthPenalty = p * (tm / 100) * (3 / 12)
    const total = Math.max(irdPenalty, threeMonthPenalty)

    return { discount, irdRate, irdRateRaw, irdPenalty, threeMonthPenalty, total }
  }, [principal, months, contract, posted, comparable, threeMonthRate, preset])

  const handleOriginLookup = async () => {
    if (!fundingDate) {
      setOriginLookupNote({ msg: 'Enter a funding date first.', tone: 'error' })
      return
    }
    setOriginLookupNote({ msg: 'Fetching from Bank of Canada...', tone: 'info' })
    try {
      const result = await fetchBoCRate(fundingDate)
      if (!result) {
        setOriginLookupNote({ msg: 'No data for that date. Try a different funding date.', tone: 'error' })
        return
      }
      setPosted(result.rate.toFixed(2))
      setOriginLookupNote({ msg: `BoC 5-yr posted, week of ${result.date}`, tone: 'success' })
    } catch {
      setOriginLookupNote({ msg: 'Lookup failed. Enter the rate manually.', tone: 'error' })
    }
  }

  const handleTodayLookup = async () => {
    setTodayLookupNote({ msg: 'Fetching from Bank of Canada...', tone: 'info' })
    try {
      const today = new Date().toISOString().slice(0, 10)
      const result = await fetchBoCRate(today)
      if (!result) {
        setTodayLookupNote({ msg: 'No recent data. Enter the rate manually.', tone: 'error' })
        return
      }
      setComparable(result.rate.toFixed(2))
      setTodayLookupNote({ msg: `BoC 5-yr posted, week of ${result.date}`, tone: 'success' })
    } catch {
      setTodayLookupNote({ msg: 'Lookup failed. Enter the rate manually.', tone: 'error' })
    }
  }

  const noteToneClass = (tone: 'success' | 'error' | 'info' | undefined) =>
    tone === 'success' ? 'text-green-700'
    : tone === 'error' ? 'text-red-600'
    : 'text-gray-500'

  const irdIsHighlighted = calc.irdPenalty >= calc.threeMonthPenalty

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-3xl text-[#032133] mb-2">
          Mortgage prepayment penalty
        </h2>
        <p className="font-body text-sm text-gray-600">
          Estimate the cost to break a fixed-rate mortgage early. Adjust the inputs below to refine your result.
        </p>
      </div>

      {/* Total card — primary result */}
      <div className="rounded-2xl border-2 border-[#032133] bg-[#032133] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-body text-xs uppercase tracking-wider text-[#95D600] font-medium mb-1">
              Total estimated penalty
            </div>
            <div className="font-heading text-4xl text-white tabular-nums">
              {fmtCurrency(calc.total)}
            </div>
            <div className="font-body text-xs text-white/60 mt-2">
              {irdIsHighlighted ? 'IRD applies (greater than 3-month interest)' : '3-month interest applies (greater than IRD)'}
            </div>
          </div>
          <div className="hidden sm:block">
            <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
              <div className="font-body text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Method</div>
              <div className="font-body text-xs text-white font-medium">
                {preset === 'big5' ? 'Discounted IRD' : preset === 'standard' ? 'Fair IRD' : 'Manual'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Disclosure */}
      <div className="rounded-lg border-l-4 border-[#95D600] bg-[#95D600]/10 px-4 py-3">
        <p className="font-body text-xs text-[#032133] leading-relaxed">
          <span className="font-medium">Estimate only.</span> For exact penalty figures, ask the client for their original mortgage commitment letter so we can use the actual posted rate at funding. Lender-specific rounding and amortization adjustments may move the final number by a few hundred dollars.
        </p>
      </div>

      {/* Preset selector */}
      <div>
        <label className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-2 block">
          Lender methodology
        </label>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {(['big5', 'standard', 'manual'] as Preset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`flex-1 px-3 py-2 rounded-md font-body text-sm transition ${
                preset === p
                  ? 'bg-white text-[#032133] font-medium shadow-sm'
                  : 'bg-transparent text-gray-600 font-normal hover:text-[#032133]'
              }`}
            >
              {p === 'big5' ? 'Big 5 / Discounted IRD' : p === 'standard' ? 'Standard / Fair IRD' : 'Manual'}
            </button>
          ))}
        </div>
        <p className="font-body text-xs text-gray-500 mt-2 leading-relaxed">
          {PRESET_NOTES[preset]}
        </p>
      </div>

      {/* Inputs */}
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
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]"
              />
            </div>
          </Field>

          <Field label="Months remaining">
            <input
              type="number"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]"
            />
          </Field>

          <Field label="Funding date">
            <input
              type="date"
              value={fundingDate}
              onChange={(e) => setFundingDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]"
            />
          </Field>

          <Field label="Contract rate (%)">
            <input
              type="number"
              step="0.01"
              value={contract}
              onChange={(e) => setContract(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]"
            />
          </Field>

          <Field
            label="Posted rate at origination (%)"
            disabled={preset === 'standard'}
            action={
              <button
                type="button"
                onClick={handleOriginLookup}
                disabled={preset === 'standard'}
                className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Look up at funding
              </button>
            }
          >
            <input
              type="number"
              step="0.01"
              value={posted}
              onChange={(e) => setPosted(e.target.value)}
              disabled={preset === 'standard'}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133] disabled:bg-gray-50 disabled:text-gray-400"
            />
            {originLookupNote && (
              <p className={`font-body text-xs mt-1 ${noteToneClass(originLookupNote.tone)}`}>
                {originLookupNote.msg}
              </p>
            )}
          </Field>

          <Field
            label="Comparable term posted rate (%)"
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
              value={comparable}
              onChange={(e) => setComparable(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]"
            />
            {todayLookupNote && (
              <p className={`font-body text-xs mt-1 ${noteToneClass(todayLookupNote.tone)}`}>
                {todayLookupNote.msg}
              </p>
            )}
          </Field>

          <Field label="Rate used for 3-month calc (%)" className="sm:col-span-2">
            <input
              type="number"
              step="0.01"
              value={threeMonthRate}
              onChange={(e) => setThreeMonthRate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]"
            />
          </Field>
        </div>
      </div>

      {/* Calculated values */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h3 className="font-heading text-base text-[#032133] mb-4">
          Calculation breakdown
        </h3>

        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stat label="Rate discount" value={fmtPct(calc.discount)} />
          <Stat label="IRD differential" value={fmtPct(calc.irdRateRaw)} />
          <Stat label="Method" value="Greater of" small />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <PenaltyCard
            label="Estimated IRD penalty"
            value={fmtCurrency(calc.irdPenalty)}
            highlighted={irdIsHighlighted}
            note={
              calc.irdRateRaw < 0
                ? 'Today’s rates exceed the contract rate. No IRD applies.'
                : calc.irdRateRaw === 0
                ? 'Rates are flat. No IRD applies.'
                : null
            }
          />
          <PenaltyCard
            label="Estimated 3-month interest"
            value={fmtCurrency(calc.threeMonthPenalty)}
            highlighted={!irdIsHighlighted}
          />
        </div>
      </div>

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
