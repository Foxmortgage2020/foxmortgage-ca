'use client'

import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'
import {
  buildSchedule,
  comparePrepayment,
  paymentBreakdown,
  type Frequency,
  type MortgageInput,
} from '@/lib/mortgage-engine'
import { balanceAtMaturity, endOfTermAmortMonths, remainingTermMonths } from '@/lib/renewal-engine'

/* ---------- formatting ---------- */

const fmtMoney0 = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')
const fmtMoney2 = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const num = (s: string) => {
  const v = parseFloat(s)
  return isFinite(v) ? v : 0
}
const stripNum = (s: string) => s.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
const fmtThousands = (s: string) => {
  if (s === '' || s === '.') return s
  const [i, d] = s.split('.')
  const c = Number(i || '0').toLocaleString('en-CA')
  return d !== undefined ? `${c}.${d}` : c
}
// Full-word years and months, e.g. "1 Year 6 Months", "23 Years 6 Months", "25 Years".
const ymFull = (months: number) => {
  const m = Math.max(0, Math.round(months))
  const y = Math.floor(m / 12)
  const r = m % 12
  const yp = `${y} ${y === 1 ? 'Year' : 'Years'}`
  const mp = `${r} ${r === 1 ? 'Month' : 'Months'}`
  if (y === 0) return mp
  if (r === 0) return yp
  return `${yp} ${mp}`
}
// Local-date parse so getMonth/getFullYear are not shifted by the time zone.
const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y || 1970, (m || 1) - 1, d || 1)
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]'
const selectClass = `${inputClass} bg-white`

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'semi-monthly', label: 'Semi-Monthly' },
  { value: 'bi-weekly', label: 'Bi-Weekly' },
  { value: 'acc-bi-weekly', label: 'Accelerated Bi-Weekly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'acc-weekly', label: 'Accelerated Weekly' },
]

interface OptionState {
  id: string
  equityTakeout: string
  rate: string
  term: string
  amortYears: string
  amortMonths: string
  frequency: Frequency
  paymentIncrease: string
  oneTimePrepay: string
  annualPrepay: string
  notes: string
}

// Options default their amortization to the current Remaining Amortization, which matches CMA.
// A borrower who wants to keep the original payoff date would instead set it to the End of term
// Amortization shown in the Current Situation block.
function newOption(id: string): OptionState {
  return {
    id, equityTakeout: '0', rate: '6.29', term: '5', amortYears: '25', amortMonths: '0',
    frequency: 'monthly', paymentIncrease: '0', oneTimePrepay: '0', annualPrepay: '0', notes: '',
  }
}

interface OptionResult {
  mortgageAmount: number
  payment: number
  termInterest: number
  termPrincipal: number
  totalTermPayments: number
  balanceEndOfTerm: number
  effectiveAmortMonths: number
}

export default function RenewalCompare() {
  const idRef = useRef(3)

  /* Current situation */
  const [outstandingBalance, setOutstandingBalance] = useState('500000')
  const [maturityDate, setMaturityDate] = useState('2027-12-14')
  const [nextPaymentDate, setNextPaymentDate] = useState('2026-07-14')
  const [currentPaymentRef, setCurrentPaymentRef] = useState('2496.35')
  const [currentRate, setCurrentRate] = useState('3.50')
  const [currentFrequency, setCurrentFrequency] = useState<Frequency>('monthly')
  const [currentTerm, setCurrentTerm] = useState('5')
  const [remainingAmortYears, setRemainingAmortYears] = useState('25')
  const [remainingAmortMonthsSel, setRemainingAmortMonthsSel] = useState('0')

  const [baselineId, setBaselineId] = useState('o1')
  const [options, setOptions] = useState<OptionState[]>([newOption('o1'), newOption('o2'), newOption('o3')])

  const update = (id: string, patch: Partial<OptionState>) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))
  const addOption = () => {
    if (options.length >= 4) return
    setOptions((prev) => [...prev, newOption('o' + ++idRef.current)])
  }
  const removeOption = (id: string) => {
    if (options.length <= 2) return
    setOptions((prev) => prev.filter((o) => o.id !== id))
    if (baselineId === id) setBaselineId(options.find((o) => o.id !== id)!.id)
  }
  const applyToAll = (fields: (keyof OptionState)[]) => {
    const base = options.find((o) => o.id === baselineId)
    if (!base) return
    setOptions((prev) =>
      prev.map((o) => {
        if (o.id === baselineId) return o
        const patch: Partial<OptionState> = {}
        for (const f of fields) (patch as Record<string, unknown>)[f] = base[f]
        return { ...o, ...patch }
      }),
    )
  }

  /* Current situation projection */
  const remainingAmortMonths = num(remainingAmortYears) * 12 + num(remainingAmortMonthsSel)
  const remTermMonths = remainingTermMonths(parseDate(nextPaymentDate), parseDate(maturityDate))
  const endOfTermAmort = endOfTermAmortMonths(remainingAmortMonths, remTermMonths)
  const matBalance = balanceAtMaturity(num(outstandingBalance), num(currentRate), remainingAmortMonths, remTermMonths)

  const results = useMemo(() => {
    const map: Record<string, OptionResult> = {}
    for (const opt of options) {
      const mortgageAmount = matBalance + num(opt.equityTakeout)
      const mInput: MortgageInput = {
        amount: mortgageAmount,
        ratePct: num(opt.rate),
        compounding: 'semi-annually',
        termYears: num(opt.term),
        amortMonths: num(opt.amortYears) * 12 + num(opt.amortMonths),
        frequency: opt.frequency,
        loanType: 'regular',
        payIncPct: 0,
        payIncAmt: num(opt.paymentIncrease),
        oneTimePrepay: num(opt.oneTimePrepay),
        annualPrepay: num(opt.annualPrepay),
      }
      const schedule = buildSchedule(mInput)
      const perYear = schedule.perYear
      const termPeriods = Math.round(num(opt.term) * perYear)
      const termBd = paymentBreakdown(mInput, schedule, 'term')
      const balanceEndOfTerm = schedule.rows.length === 0 ? 0 : schedule.rows[Math.min(termPeriods, schedule.rows.length) - 1]?.balance ?? 0
      map[opt.id] = {
        mortgageAmount,
        payment: schedule.payment,
        termInterest: termBd.interest,
        termPrincipal: termBd.basePrincipal + termBd.extraPrincipal,
        totalTermPayments: termBd.total,
        balanceEndOfTerm,
        effectiveAmortMonths: comparePrepayment(mInput).prepayAmortMonths,
      }
    }
    return map
  }, [options, matBalance])

  const baseRes = results[baselineId]
  const gridCols = options.length === 2 ? 'md:grid-cols-2' : options.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <nav className="font-body text-xs text-gray-500 print:hidden">
            <Link href="/" className="hover:text-[#032133]">Dashboard</Link>
            <span className="px-1">/</span>
            <Link href="/tools" className="hover:text-[#032133]">Tools</Link>
            <span className="px-1">/</span>
            <span className="text-gray-700">Renewal Compare</span>
          </nav>
          <h1 className="font-heading text-2xl sm:text-3xl text-[#032133] leading-tight mt-1">Renewal Compare</h1>
          <p className="font-body text-sm text-gray-600 mt-1">Mike Fox, Mortgage Agent, Level 2 at BRX Mortgage.</p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg font-body text-sm font-medium text-[#032133] bg-[#95D600] hover:bg-[#aae620] transition print:hidden whitespace-nowrap"
        >
          Create report
        </button>
      </div>

      {/* Current Situation */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <h2 className="font-heading text-base text-[#032133] mb-1">Current Situation</h2>
        <p className="font-body text-xs text-gray-500 mb-4">We project your balance forward to maturity. Current Payment and Current Term are for reference and do not change the projection.</p>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Mini label="Outstanding balance"><CurrencyInput value={outstandingBalance} onChange={setOutstandingBalance} /></Mini>
            <Mini label="Current rate">
              <div className="relative">
                <input type="number" step="0.01" value={currentRate} onChange={(e) => setCurrentRate(e.target.value)} className={`${inputClass} pr-7`} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </Mini>
            <Mini label="Next payment date">
              <input type="date" value={nextPaymentDate} onChange={(e) => setNextPaymentDate(e.target.value)} className={inputClass} />
            </Mini>
            <Mini label="Maturity date">
              <input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} className={inputClass} />
            </Mini>
            <Mini label="Current payment (reference)"><CurrencyInput value={currentPaymentRef} onChange={setCurrentPaymentRef} /></Mini>
            <Mini label="Current payment frequency">
              <select value={currentFrequency} onChange={(e) => setCurrentFrequency(e.target.value as Frequency)} className={selectClass}>
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </Mini>
            <Mini label="Current term (years, reference)">
              <select value={currentTerm} onChange={(e) => setCurrentTerm(e.target.value)} className={selectClass}>
                {[1, 2, 3, 4, 5, 7, 10].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Mini>
            <div className="grid grid-cols-2 gap-2">
              <Mini label="Rem. amort. years">
                <select value={remainingAmortYears} onChange={(e) => setRemainingAmortYears(e.target.value)} className={selectClass}>
                  {Array.from({ length: 31 }, (_, k) => k).map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </Mini>
              <Mini label="Rem. amort. months">
                <select value={remainingAmortMonthsSel} onChange={(e) => setRemainingAmortMonthsSel(e.target.value)} className={selectClass}>
                  {Array.from({ length: 12 }, (_, k) => k).map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </Mini>
            </div>
          </div>
          {/* Computed */}
          <div className="rounded-xl bg-[#032133] p-5 space-y-3">
            <Computed label="Remaining Term" value={`${ymFull(remTermMonths)} (${remTermMonths} months)`} />
            <Computed label="End of term Amortization" value={ymFull(endOfTermAmort)} />
            <div>
              <div className="font-body text-[11px] uppercase tracking-wider text-[#95D600] font-medium">Balance at Maturity</div>
              <div className="font-heading text-3xl text-white tabular-nums">{fmtMoney2(matBalance)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Option columns */}
      <div className={`grid grid-cols-1 gap-4 ${gridCols}`}>
        {options.map((opt, i) => {
          const r = results[opt.id]
          return (
            <div key={opt.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setBaselineId(opt.id)} className="font-body text-sm font-medium inline-flex items-center gap-1.5" aria-label="Mark as baseline">
                  <span className={baselineId === opt.id ? 'text-[#95D600]' : 'text-gray-300'}>{baselineId === opt.id ? '★' : '☆'}</span>
                  <span className="text-[#032133]">Option {i + 1}</span>
                </button>
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(opt.id)} className="font-body text-xs text-gray-400 hover:text-red-600">Remove</button>
                )}
              </div>

              <Mini label="Equity takeout" action={<ApplyAll onClick={() => applyToAll(['equityTakeout'])} />}>
                <CurrencyInput value={opt.equityTakeout} onChange={(v) => update(opt.id, { equityTakeout: v })} />
              </Mini>

              {r && (
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <InlineRow label="Mortgage Amount" value={fmtMoney2(r.mortgageAmount)} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Mini label="Rate" action={<ApplyAll onClick={() => applyToAll(['rate'])} />}>
                  <div className="relative">
                    <input type="number" step="0.01" value={opt.rate} onChange={(e) => update(opt.id, { rate: e.target.value })} className={`${inputClass} pr-6`} />
                    <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">%</span>
                  </div>
                </Mini>
                <Mini label="Term (yrs)" action={<ApplyAll onClick={() => applyToAll(['term'])} />}>
                  <select value={opt.term} onChange={(e) => update(opt.id, { term: e.target.value })} className={selectClass}>
                    {[1, 2, 3, 4, 5, 7, 10].map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </Mini>
                <Mini label="Amort. yrs" action={<ApplyAll onClick={() => applyToAll(['amortYears', 'amortMonths'])} />}>
                  <select value={opt.amortYears} onChange={(e) => update(opt.id, { amortYears: e.target.value })} className={selectClass}>
                    {Array.from({ length: 31 }, (_, k) => k).map((y) => <option key={y} value={y}>{y}</option>)}
                  </select>
                </Mini>
                <Mini label="Amort. mo">
                  <select value={opt.amortMonths} onChange={(e) => update(opt.id, { amortMonths: e.target.value })} className={selectClass}>
                    {Array.from({ length: 12 }, (_, k) => k).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </Mini>
              </div>

              <Mini label="Payment frequency" action={<ApplyAll onClick={() => applyToAll(['frequency'])} />}>
                <select value={opt.frequency} onChange={(e) => update(opt.id, { frequency: e.target.value as Frequency })} className={selectClass}>
                  {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </Mini>

              {r && (
                <div className="rounded-lg bg-[#032133]/5 px-3 py-2">
                  <InlineRow label="Mortgage Payment" value={fmtMoney2(r.payment)} strong />
                </div>
              )}

              <details className="font-body text-xs text-gray-600">
                <summary className="cursor-pointer select-none flex items-center justify-between">
                  <span>Pre-Payments</span>
                  <ApplyAll onClick={() => applyToAll(['paymentIncrease', 'oneTimePrepay', 'annualPrepay'])} />
                </summary>
                <div className="space-y-2 mt-2">
                  <Mini label="Payment increase"><CurrencyInput value={opt.paymentIncrease} onChange={(v) => update(opt.id, { paymentIncrease: v })} /></Mini>
                  <Mini label="One-time pre-payment"><CurrencyInput value={opt.oneTimePrepay} onChange={(v) => update(opt.id, { oneTimePrepay: v })} /></Mini>
                  <Mini label="Annual pre-payment"><CurrencyInput value={opt.annualPrepay} onChange={(v) => update(opt.id, { annualPrepay: v })} /></Mini>
                </div>
              </details>

              <Mini label="Notes">
                <textarea value={opt.notes} onChange={(e) => update(opt.id, { notes: e.target.value })} rows={2} className={`${inputClass} resize-none`} placeholder="Notes for this option" />
              </Mini>
            </div>
          )
        })}
        {options.length < 4 && (
          <button type="button" onClick={addOption} className="rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-[#95D600] hover:text-[#032133] transition font-body text-sm font-medium min-h-[120px] print:hidden">
            + Add option
          </button>
        )}
      </div>

      {/* Output: Principal & Interest Comparison */}
      <div>
        <h2 className="font-heading text-xl text-[#032133] mb-4">Principal &amp; Interest Comparison</h2>
        <div className={`grid grid-cols-1 gap-4 ${gridCols}`}>
          {options.map((opt, i) => {
            const r = results[opt.id]
            if (!r || !baseRes) return null
            const isBase = opt.id === baselineId
            return (
              <div key={opt.id} className={`rounded-2xl border bg-white p-5 ${isBase ? 'border-[#95D600] border-2' : 'border-gray-200'}`}>
                <div className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-3 inline-flex items-center gap-1.5">
                  <span className={isBase ? 'text-[#95D600]' : 'text-gray-300'}>{isBase ? '★' : '☆'}</span>
                  Option {i + 1}
                </div>
                <div className="space-y-2">
                  <Metric label="Term Interest" value={fmtMoney2(r.termInterest)} delta={isBase ? null : r.termInterest - baseRes.termInterest} fmt={fmtMoney2} />
                  <Metric label="Term Principal" value={fmtMoney2(r.termPrincipal)} delta={isBase ? null : r.termPrincipal - baseRes.termPrincipal} fmt={fmtMoney2} invert />
                  <Metric label="Total Term Payments" value={fmtMoney2(r.totalTermPayments)} delta={isBase ? null : r.totalTermPayments - baseRes.totalTermPayments} fmt={fmtMoney2} />
                  <Metric label="Balance at End of Term" value={fmtMoney2(r.balanceEndOfTerm)} delta={isBase ? null : r.balanceEndOfTerm - baseRes.balanceEndOfTerm} fmt={fmtMoney2} />
                  <Metric label="Effective Amortization" value={ymFull(r.effectiveAmortMonths)} delta={isBase ? null : r.effectiveAmortMonths - baseRes.effectiveAmortMonths} fmt={(n) => ymFull(n)} />
                </div>
              </div>
            )
          })}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-6 mt-4">
          <div className="font-heading text-base text-[#032133] mb-4">Interest Comparison</div>
          <InterestChart options={options} results={results} baselineId={baselineId} />
        </div>
      </div>

      <div className="font-body text-xs text-gray-500 leading-relaxed">
        <p>
          <span className="font-medium text-gray-700">Disclaimer:</span> This calculator is for
          illustrative purposes only and should not be relied upon for financial planning. Rates and
          renewal terms change. Confirm your renewal options with your lender before you sign.
        </p>
      </div>
    </div>
  )
}

/* ---------- primitives ---------- */

function Mini({ label, children, action }: { label: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div>
      <label className="font-body text-[11px] text-gray-500 mb-1 flex items-center justify-between gap-2">
        <span>{label}</span>
        {action}
      </label>
      {children}
    </div>
  )
}

function Computed({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-body text-[11px] uppercase tracking-wider text-white/60 font-medium">{label}</div>
      <div className="font-heading text-lg text-white tabular-nums">{value}</div>
    </div>
  )
}

function ApplyAll({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[10px] px-1.5 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition print:hidden">
      Apply to all
    </button>
  )
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
      <input type="text" inputMode="decimal" value={fmtThousands(value)} onChange={(e) => onChange(stripNum(e.target.value))} className={`${inputClass} pl-7`} />
    </div>
  )
}

function InlineRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-body text-xs text-gray-500">{label}</span>
      <span className={`font-body text-xs tabular-nums ${strong ? 'text-[#032133] font-semibold' : 'text-[#032133]'}`}>{value}</span>
    </div>
  )
}

function Metric({
  label,
  value,
  delta,
  fmt,
  invert,
}: {
  label: string
  value: string
  delta: number | null
  fmt: (n: number) => string
  invert?: boolean
}) {
  return (
    <div>
      <div className="font-body text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</div>
      <div className="font-heading text-lg text-[#032133] tabular-nums">{value}</div>
      <DeltaBadge delta={delta} fmt={fmt} invert={invert} />
    </div>
  )
}

// Lower is better for these cost metrics, so a negative delta is good (green down arrow).
// For Term Principal, more principal paid is better, so invert flips the colors.
function DeltaBadge({ delta, fmt, invert }: { delta: number | null; fmt: (n: number) => string; invert?: boolean }) {
  if (delta === null) return <div className="font-body text-[11px] text-gray-400 mt-0.5">baseline</div>
  if (Math.abs(delta) < 1e-6) return <div className="font-body text-[11px] text-gray-400 mt-0.5">same as baseline</div>
  const lowerIsBetter = !invert
  const good = lowerIsBetter ? delta < 0 : delta > 0
  const up = delta > 0
  return (
    <div className={`font-body text-[11px] font-medium mt-0.5 ${good ? 'text-green-600' : 'text-red-600'}`}>
      {up ? '▲' : '▼'} {fmt(Math.abs(delta))}
    </div>
  )
}

function InterestChart({ options, results, baselineId }: { options: OptionState[]; results: Record<string, OptionResult>; baselineId: string }) {
  const vals = options.map((o) => ({ id: o.id, v: results[o.id]?.termInterest ?? 0 }))
  const max = Math.max(1, ...vals.map((x) => x.v))
  const W = 720
  const H = 220
  const padB = 28
  const padT = 24
  const n = vals.length
  const slot = W / n
  const bw = Math.min(120, slot * 0.5)
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[420px]" role="img" aria-label="Term interest by option">
        {vals.map((x, i) => {
          const h = (x.v / max) * (H - padT - padB)
          const cx = slot * i + slot / 2
          const y = H - padB - h
          const isBase = x.id === baselineId
          return (
            <g key={x.id}>
              <rect x={cx - bw / 2} y={y} width={bw} height={h} rx="4" fill={isBase ? '#032133' : '#9db4c4'} />
              <text x={cx} y={y - 6} textAnchor="middle" className="fill-[#032133] font-semibold" fontSize="12">{fmtMoney0(x.v)}</text>
              <text x={cx} y={H - 8} textAnchor="middle" className="fill-gray-500" fontSize="11">Option {i + 1}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
