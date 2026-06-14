'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  aggregateByYear,
  buildSchedule,
  comparePrepayment,
  FREQUENCY,
  hasPrepayment,
  paymentBreakdown,
  type BreakdownHorizon,
  type Compounding,
  type Frequency,
  type LoanType,
  type MortgageInput,
  type YearRow,
} from '@/lib/mortgage-engine'

/* ---------- formatting helpers ---------- */

const fmtMoney2 = (n: number) =>
  (n < 0 ? '-$' : '$') +
  Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signedMoney2 = (n: number) =>
  (n >= 0 ? '+$' : '-$') +
  Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const money0 = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')
const kLabel = (n: number) => Math.round(n / 1000) + 'K'

const num = (s: string) => {
  const v = parseFloat(s)
  return isFinite(v) ? v : 0
}
const stripNum = (s: string) => s.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
const fmtThousands = (s: string) => {
  if (s === '' || s === '.') return s
  const [intPart, decPart] = s.split('.')
  const withCommas = Number(intPart || '0').toLocaleString('en-CA')
  return decPart !== undefined ? `${withCommas}.${decPart}` : withCommas
}

const formatAmort = (months: number) => {
  const m = Math.round(months)
  const y = Math.floor(m / 12)
  const mo = m % 12
  return mo === 0 ? `${y} Years` : `${y} Years ${mo} Months`
}
const signedAmort = (months: number) => {
  const sign = months < 0 ? '-' : months > 0 ? '+' : ''
  return sign + formatAmort(Math.abs(months))
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]'
const selectClass = `${inputClass} bg-white`

/* ---------- chart colors ---------- */
const C_PRINCIPAL = '#60a5fa'
const C_EXTRA = '#95D600'
const C_INTEREST = '#6366f1'
const C_CUM_PRINCIPAL = '#5cb800'
const C_CUM_INTEREST = '#ef4444'
const C_BALANCE = '#3b82f6'
const C_BALANCE_PREPAY = '#93c5fd'

type FocusMetric = 'payment' | 'totalInterest' | 'totalCost' | 'interestOverTerm' | 'balanceEndOfTerm'

const COMPOUNDING_OPTIONS: { value: Compounding; label: string }[] = [
  { value: 'annually', label: 'Annually' },
  { value: 'semi-annually', label: 'Semi-Annually' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'monthly', label: 'Monthly' },
]
const FREQUENCY_OPTIONS = (Object.keys(FREQUENCY) as Frequency[]).map((k) => ({
  value: k,
  label: FREQUENCY[k].label,
}))
const FOCUS_OPTIONS: { value: FocusMetric; label: string }[] = [
  { value: 'payment', label: 'Mortgage Payment' },
  { value: 'totalInterest', label: 'Total Interest' },
  { value: 'totalCost', label: 'Total Cost' },
  { value: 'interestOverTerm', label: 'Interest Over Term' },
  { value: 'balanceEndOfTerm', label: 'Balance at End of Term' },
]

export default function MortgageCalculator() {
  /* Inputs (defaults from the brief). */
  const [amount, setAmount] = useState('500000')
  const [ratePct, setRatePct] = useState('5.25')
  const [compounding, setCompounding] = useState<Compounding>('semi-annually')
  const [rateType, setRateType] = useState('Fixed')
  const [termYears, setTermYears] = useState('5')
  const [amortYears, setAmortYears] = useState('25')
  const [amortMonthsSel, setAmortMonthsSel] = useState('0')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [loanType, setLoanType] = useState<LoanType>('regular')
  const [focusMetric, setFocusMetric] = useState<FocusMetric>('payment')
  const [payIncPct, setPayIncPct] = useState('0')
  const [payIncAmt, setPayIncAmt] = useState('0')
  const [oneTimePrepay, setOneTimePrepay] = useState('0')
  const [annualPrepay, setAnnualPrepay] = useState('0')
  const [breakdownTab, setBreakdownTab] = useState<BreakdownHorizon>('payment')

  const input: MortgageInput = useMemo(
    () => ({
      amount: num(amount),
      ratePct: num(ratePct),
      compounding,
      termYears: num(termYears),
      amortMonths: num(amortYears) * 12 + num(amortMonthsSel),
      frequency,
      loanType,
      payIncPct: num(payIncPct),
      payIncAmt: num(payIncAmt),
      oneTimePrepay: num(oneTimePrepay),
      annualPrepay: num(annualPrepay),
    }),
    [
      amount, ratePct, compounding, termYears, amortYears, amortMonthsSel,
      frequency, loanType, payIncPct, payIncAmt, oneTimePrepay, annualPrepay,
    ],
  )

  const schedule = useMemo(() => buildSchedule(input), [input])
  const years = useMemo(() => aggregateByYear(schedule.rows, input.oneTimePrepay), [schedule, input.oneTimePrepay])
  const breakdown = useMemo(() => paymentBreakdown(input, schedule, breakdownTab), [input, schedule, breakdownTab])
  const prepay = hasPrepayment(input)
  const comparison = useMemo(() => (prepay ? comparePrepayment(input) : null), [input, prepay])

  const perYear = schedule.perYear
  const termPeriods = Math.round(input.termYears * perYear)
  const fullTotal = useMemo(() => paymentBreakdown(input, schedule, 'total'), [input, schedule])
  const termTotals = useMemo(() => paymentBreakdown(input, schedule, 'term'), [input, schedule])
  const balanceEndOfTerm =
    schedule.rows.length === 0
      ? 0
      : schedule.rows[Math.min(termPeriods, schedule.rows.length) - 1]?.balance ?? 0

  const focus = focusValue(focusMetric, {
    payment: schedule.payment,
    paymentLabel: FREQUENCY[frequency].label,
    totalInterest: fullTotal.interest,
    totalCost: fullTotal.total,
    interestOverTerm: termTotals.interest,
    balanceEndOfTerm,
    termYears: num(termYears),
    amortMonths: input.amortMonths,
  })

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/tools" className="font-body text-xs text-gray-500 hover:text-[#032133] transition print:hidden">
            &larr; Back to Tools
          </Link>
          <h1 className="font-heading text-2xl sm:text-3xl text-[#032133] leading-tight mt-1">
            Mortgage Calculator
          </h1>
          <p className="font-body text-sm text-gray-600 mt-1">
            Mike Fox, Mortgage Agent, Level 2 at BRX Mortgage.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-4 py-2 rounded-lg font-body text-sm font-medium text-[#032133] bg-[#95D600] hover:bg-[#aae620] transition print:hidden whitespace-nowrap"
        >
          Create report
        </button>
      </div>

      {/* Main two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Analysis Focus */}
        <Card title="Analysis Focus" subtitle="Pick what the headline shows, then set your mortgage.">
          <Field label="Show me">
            <select
              value={focusMetric}
              onChange={(e) => setFocusMetric(e.target.value as FocusMetric)}
              className={selectClass}
            >
              {FOCUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>

          <div className="rounded-2xl border-2 border-[#032133] bg-[#032133] p-5 my-4">
            <div className="font-body text-xs uppercase tracking-wider text-[#95D600] font-medium mb-1">
              {FOCUS_OPTIONS.find((o) => o.value === focusMetric)?.label}
            </div>
            <div className="font-heading text-4xl text-white tabular-nums">{fmtMoney2(focus.value)}</div>
            <div className="font-body text-xs text-white/60 mt-1">{focus.label}</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Mortgage amount">
              <CurrencyInput value={amount} onChange={setAmount} />
            </Field>
            <Field label="Interest rate">
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={ratePct}
                  onChange={(e) => setRatePct(e.target.value)}
                  className={`${inputClass} pr-7`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
              </div>
            </Field>
            <Field label="Rate type">
              <select value={rateType} onChange={(e) => setRateType(e.target.value)} className={selectClass}>
                <option value="Fixed">Fixed</option>
                <option value="Variable">Variable</option>
              </select>
            </Field>
            <Field label="Compounding">
              <select
                value={compounding}
                onChange={(e) => setCompounding(e.target.value as Compounding)}
                className={selectClass}
              >
                {COMPOUNDING_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Term (years)">
              <select value={termYears} onChange={(e) => setTermYears(e.target.value)} className={selectClass}>
                {[1, 2, 3, 4, 5, 7, 10].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </Field>
            <Field label="Payment frequency">
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as Frequency)}
                className={selectClass}
              >
                {FREQUENCY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Amortization (years)">
              <select value={amortYears} onChange={(e) => setAmortYears(e.target.value)} className={selectClass}>
                {Array.from({ length: 26 }, (_, k) => k + 5).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </Field>
            <Field label="Amortization (months)">
              <select value={amortMonthsSel} onChange={(e) => setAmortMonthsSel(e.target.value)} className={selectClass}>
                {Array.from({ length: 12 }, (_, k) => k).map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Loan type" className="sm:col-span-2">
              <select
                value={loanType}
                onChange={(e) => setLoanType(e.target.value as LoanType)}
                className={selectClass}
              >
                <option value="regular">Regular</option>
                <option value="interest-only">Interest Only</option>
              </select>
            </Field>
          </div>
        </Card>

        {/* Right column */}
        <div className="space-y-6">
          {/* Payment Breakdown */}
          <Card title="Payment Breakdown">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
              {(['payment', 'term', 'total'] as BreakdownHorizon[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBreakdownTab(t)}
                  className={`flex-1 px-3 py-2 rounded-md font-body text-sm transition ${
                    breakdownTab === t
                      ? 'bg-white text-[#032133] font-medium shadow-sm'
                      : 'bg-transparent text-gray-600 hover:text-[#032133]'
                  }`}
                >
                  {t === 'payment' ? 'Payment' : t === 'term' ? 'Term' : 'Total'}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <BreakdownRow label="Principal Paid" value={breakdown.basePrincipal} dot={C_PRINCIPAL} />
              {prepay && breakdown.extraPrincipal > 0 && (
                <BreakdownRow label="Extra Principal" value={breakdown.extraPrincipal} dot={C_EXTRA} />
              )}
              <BreakdownRow label="Interest Paid" value={breakdown.interest} dot={C_INTEREST} />
            </div>

            <ProportionBar
              principal={breakdown.basePrincipal}
              extra={prepay && breakdown.extraPrincipal > 0 ? breakdown.extraPrincipal : 0}
              interest={breakdown.interest}
            />

            <div className="border-t border-gray-200 mt-4 pt-3 flex items-center justify-between">
              <span className="font-body text-sm font-medium text-[#032133]">
                {breakdownTab === 'payment' ? 'Total payment' : breakdownTab === 'term' ? 'Total over term' : 'Total cost'}
              </span>
              <span className="font-heading text-lg text-[#032133] tabular-nums">{fmtMoney2(breakdown.total)}</span>
            </div>
          </Card>

          {/* Principal, Interest & Balance chart */}
          <Card title="Principal, Interest & Balance">
            <PIBChart years={years} maxY={input.amount} />
          </Card>
        </div>
      </div>

      {/* Prepayment Analysis */}
      <div>
        <h2 className="font-heading text-xl text-[#032133] mb-1">Prepayment Analysis</h2>
        <p className="font-body text-sm text-gray-600 mb-4">
          Pay a little more and find how much interest and time you save.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: inputs + balance chart */}
          <div className="space-y-6">
            <Card title="Prepayment Options">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Payment increase">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={fmtThousands(payIncAmt)}
                        onChange={(e) => setPayIncAmt(stripNum(e.target.value))}
                        className={`${inputClass} pl-7`}
                      />
                    </div>
                    <select
                      value={payIncPct}
                      onChange={(e) => setPayIncPct(e.target.value)}
                      className="px-2 py-2 border border-gray-300 rounded-md font-body text-sm bg-white"
                    >
                      {[0, 5, 10, 15, 20, 25].map((p) => (
                        <option key={p} value={p}>{p}%</option>
                      ))}
                    </select>
                  </div>
                </Field>
                <Field label="One-time pre-payment">
                  <CurrencyInput value={oneTimePrepay} onChange={setOneTimePrepay} />
                </Field>
                <Field label="Annual prepayment" className="sm:col-span-2">
                  <CurrencyInput value={annualPrepay} onChange={setAnnualPrepay} />
                </Field>
              </div>
            </Card>

            <Card title="Prepayment Balance Chart">
              {prepay && comparison ? (
                <PrepaymentBalanceChart input={input} maxY={input.amount} />
              ) : (
                <p className="font-body text-sm text-gray-500">
                  Add a payment increase or a prepayment to see how much sooner the mortgage is gone.
                </p>
              )}
            </Card>
          </div>

          {/* Right: comparison table */}
          <Card title="Prepayment Comparison Table">
            {prepay && comparison ? (
              <ComparisonTable comparison={comparison} />
            ) : (
              <p className="font-body text-sm text-gray-500">
                Add a payment increase or a prepayment to compare it against your regular schedule.
              </p>
            )}
          </Card>
        </div>
      </div>

      {/* Amortization Table */}
      <div>
        <h2 className="font-heading text-xl text-[#032133] mb-4">Amortization Table</h2>
        <Card>
          <AmortTable years={years} />
          <AmortNote input={input} schedule={schedule} years={years} />
        </Card>
      </div>

      {/* Disclaimer */}
      <div className="font-body text-xs text-gray-500 leading-relaxed">
        <p>
          <span className="font-medium text-gray-700">Disclaimer:</span> This calculator is for
          illustrative purposes only and should not be relied upon for financial planning. Actual
          payments and amortization depend on your lender&rsquo;s terms and rounding. Rates change
          daily.
        </p>
      </div>
    </div>
  )
}

/* ---------- focus headline value ---------- */

function focusValue(
  metric: FocusMetric,
  v: {
    payment: number
    paymentLabel: string
    totalInterest: number
    totalCost: number
    interestOverTerm: number
    balanceEndOfTerm: number
    termYears: number
    amortMonths: number
  },
): { value: number; label: string } {
  const amortYears = Math.round(v.amortMonths / 12)
  switch (metric) {
    case 'payment':
      return { value: v.payment, label: v.paymentLabel }
    case 'totalInterest':
      return { value: v.totalInterest, label: `over the ${amortYears} year amortization` }
    case 'totalCost':
      return { value: v.totalCost, label: 'principal plus interest' }
    case 'interestOverTerm':
      return { value: v.interestOverTerm, label: `over the ${v.termYears} year term` }
    case 'balanceEndOfTerm':
      return { value: v.balanceEndOfTerm, label: `after the ${v.termYears} year term` }
  }
}

/* ---------- primitives ---------- */

function Card({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 print:border-gray-300 print:shadow-none">
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="font-heading text-base text-[#032133]">{title}</h3>}
          {subtitle && <p className="font-body text-xs text-gray-500 mt-0.5">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className ?? ''}>
      <label className="font-body text-xs text-gray-600 mb-1.5 block">{label}</label>
      {children}
    </div>
  )
}

function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={fmtThousands(value)}
        onChange={(e) => onChange(stripNum(e.target.value))}
        className={`${inputClass} pl-7`}
      />
    </div>
  )
}

function BreakdownRow({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-body text-sm text-gray-600 inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
        {label}
      </span>
      <span className="font-body text-sm text-[#032133] tabular-nums">{fmtMoney2(value)}</span>
    </div>
  )
}

function ProportionBar({ principal, extra, interest }: { principal: number; extra: number; interest: number }) {
  const total = Math.max(principal + extra + interest, 1e-9)
  const segs = [
    { w: (principal / total) * 100, c: C_PRINCIPAL, label: 'Principal' },
    ...(extra > 0 ? [{ w: (extra / total) * 100, c: C_EXTRA, label: 'Extra' }] : []),
    { w: (interest / total) * 100, c: C_INTEREST, label: 'Interest' },
  ]
  return (
    <div className="mt-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full">
        {segs.map((s, idx) => (
          <div key={idx} style={{ width: `${s.w}%`, backgroundColor: s.c }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {segs.map((s, idx) => (
          <span key={idx} className="font-body text-[11px] text-gray-500 inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.c }} />
            {s.label} {Math.round(s.w)}%
          </span>
        ))}
      </div>
    </div>
  )
}

/* ---------- charts ---------- */

const CW = 760
const CH = 300
const PADL = 56
const PADR = 16
const PADT = 16
const PADB = 34

function chartScales(yearCount: number, maxY: number) {
  const px = (i: number) => PADL + (yearCount <= 1 ? 0 : (i / (yearCount - 1)) * (CW - PADL - PADR))
  const py = (v: number) => PADT + (1 - (maxY <= 0 ? 0 : v / maxY)) * (CH - PADT - PADB)
  return { px, py }
}
function polyline(values: number[], px: (i: number) => number, py: (v: number) => number) {
  return values.map((v, i) => `${i === 0 ? 'M' : 'L'}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ')
}
function YGrid({ maxY, py }: { maxY: number; py: (v: number) => number }) {
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxY)
  return (
    <>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PADL} y1={py(t)} x2={CW - PADR} y2={py(t)} stroke="#eef2f7" strokeWidth="1" />
          <text x={PADL - 8} y={py(t) + 4} textAnchor="end" className="fill-gray-400" fontSize="10">
            {kLabel(t)}
          </text>
        </g>
      ))}
    </>
  )
}
function XLabels({ years, px }: { years: number[]; px: (i: number) => number }) {
  const n = years.length
  const step = Math.max(1, Math.ceil(n / 8))
  return (
    <>
      {years.map((y, i) =>
        i % step === 0 || i === n - 1 ? (
          <text key={i} x={px(i)} y={CH - PADB + 16} textAnchor="middle" className="fill-gray-400" fontSize="10">
            {y}
          </text>
        ) : null,
      )}
    </>
  )
}

function PIBChart({ years, maxY }: { years: YearRow[]; maxY: number }) {
  if (years.length === 0 || maxY <= 0) {
    return <p className="font-body text-sm text-gray-500">Enter a mortgage to see the chart.</p>
  }
  const { px, py } = chartScales(years.length, maxY)
  const cumP = years.map((y) => y.cumPrincipal)
  const cumI = years.map((y) => y.cumInterest)
  const bal = years.map((y) => y.endBalance)
  const balArea =
    `M${px(0).toFixed(1)},${py(bal[0]).toFixed(1)} ` +
    bal.map((v, i) => `L${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ') +
    ` L${px(years.length - 1).toFixed(1)},${py(0).toFixed(1)} L${px(0).toFixed(1)},${py(0).toFixed(1)} Z`
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full min-w-[520px]" role="img" aria-label="Principal, interest, and balance over time">
        <YGrid maxY={maxY} py={py} />
        <path d={balArea} fill={C_BALANCE} fillOpacity="0.08" />
        <path d={polyline(bal, px, py)} fill="none" stroke={C_BALANCE} strokeWidth="2" />
        <path d={polyline(cumP, px, py)} fill="none" stroke={C_CUM_PRINCIPAL} strokeWidth="2" />
        <path d={polyline(cumI, px, py)} fill="none" stroke={C_CUM_INTEREST} strokeWidth="2" />
        <XLabels years={years.map((y) => y.year)} px={px} />
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <Legend color={C_CUM_PRINCIPAL} label="Cumulative principal" />
        <Legend color={C_CUM_INTEREST} label="Cumulative interest" />
        <Legend color={C_BALANCE} label="Remaining balance" />
      </div>
    </div>
  )
}

function PrepaymentBalanceChart({ input, maxY }: { input: MortgageInput; maxY: number }) {
  const regInput: MortgageInput = { ...input, payIncPct: 0, payIncAmt: 0, oneTimePrepay: 0, annualPrepay: 0 }
  const regYears = aggregateByYear(buildSchedule(regInput).rows, 0)
  const preYears = aggregateByYear(buildSchedule(input).rows, input.oneTimePrepay)
  if (regYears.length === 0 || maxY <= 0) {
    return <p className="font-body text-sm text-gray-500">Enter a mortgage to see the chart.</p>
  }
  // Regular schedule is the longer one. Map prepay balance onto the regular year axis,
  // extending along zero once the mortgage is paid off early.
  const byYearPre = new Map(preYears.map((y) => [y.year, y.endBalance]))
  const lastPreYear = preYears.length ? preYears[preYears.length - 1].year : regYears[0].year
  const axisYears = regYears.map((y) => y.year)
  const regBal = regYears.map((y) => y.endBalance)
  // Map the prepay balance onto the regular year axis. Years run contiguously, so
  // present years use the real balance and years past payoff sit at zero. The
  // carry-forward guards a gap year safely rather than spiking to the top.
  let lastKnownPre = maxY
  const preBal = axisYears.map((y) => {
    if (byYearPre.has(y)) {
      lastKnownPre = byYearPre.get(y) as number
      return lastKnownPre
    }
    return y > lastPreYear ? 0 : lastKnownPre
  })
  const { px, py } = chartScales(axisYears.length, maxY)
  const regArea =
    `M${px(0).toFixed(1)},${py(regBal[0]).toFixed(1)} ` +
    regBal.map((v, i) => `L${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(' ') +
    ` L${px(axisYears.length - 1).toFixed(1)},${py(0).toFixed(1)} L${px(0).toFixed(1)},${py(0).toFixed(1)} Z`
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${CW} ${CH}`} className="w-full min-w-[520px]" role="img" aria-label="Balance with and without prepayment">
        <YGrid maxY={maxY} py={py} />
        <path d={regArea} fill={C_BALANCE} fillOpacity="0.08" />
        <path d={polyline(regBal, px, py)} fill="none" stroke={C_BALANCE} strokeWidth="2" />
        <path d={polyline(preBal, px, py)} fill="none" stroke={C_BALANCE_PREPAY} strokeWidth="2" strokeDasharray="5 4" />
        <XLabels years={axisYears} px={px} />
      </svg>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        <Legend color={C_BALANCE} label="Regular schedule" />
        <Legend color={C_BALANCE_PREPAY} label="With prepayment" dashed />
      </div>
    </div>
  )
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="font-body text-[11px] text-gray-500 inline-flex items-center gap-1.5">
      <span
        className="inline-block h-0.5 w-4"
        style={{ backgroundColor: dashed ? 'transparent' : color, borderTop: dashed ? `2px dashed ${color}` : undefined }}
      />
      {label}
    </span>
  )
}

/* ---------- comparison table ---------- */

function ComparisonTable({ comparison }: { comparison: NonNullable<ReturnType<typeof comparePrepayment>> }) {
  const { regular, withPrepay, regularAmortMonths, prepayAmortMonths } = comparison
  const rows: {
    metric: string
    reg: string
    pre: string
    diff: string
    pct: number
    negativeIsGood: boolean
    regN: number
    preN: number
  }[] = [
    { metric: 'Payment', reg: fmtMoney2(regular.payment), pre: fmtMoney2(withPrepay.payment), diff: signedMoney2(withPrepay.payment - regular.payment), pct: pctOf(regular.payment, withPrepay.payment), negativeIsGood: true, regN: regular.payment, preN: withPrepay.payment },
    { metric: 'Term Principal', reg: fmtMoney2(regular.basePrincipal), pre: fmtMoney2(withPrepay.basePrincipal), diff: signedMoney2(withPrepay.basePrincipal - regular.basePrincipal), pct: pctOf(regular.basePrincipal, withPrepay.basePrincipal), negativeIsGood: false, regN: regular.basePrincipal, preN: withPrepay.basePrincipal },
    { metric: 'Term Interest', reg: fmtMoney2(regular.interest), pre: fmtMoney2(withPrepay.interest), diff: signedMoney2(withPrepay.interest - regular.interest), pct: pctOf(regular.interest, withPrepay.interest), negativeIsGood: true, regN: regular.interest, preN: withPrepay.interest },
    { metric: 'Total Term Payments', reg: fmtMoney2(regular.totalPaid), pre: fmtMoney2(withPrepay.totalPaid), diff: signedMoney2(withPrepay.totalPaid - regular.totalPaid), pct: pctOf(regular.totalPaid, withPrepay.totalPaid), negativeIsGood: true, regN: regular.totalPaid, preN: withPrepay.totalPaid },
    { metric: 'Balance End of Term', reg: fmtMoney2(regular.endBalance), pre: fmtMoney2(withPrepay.endBalance), diff: signedMoney2(withPrepay.endBalance - regular.endBalance), pct: pctOf(regular.endBalance, withPrepay.endBalance), negativeIsGood: true, regN: regular.endBalance, preN: withPrepay.endBalance },
    { metric: 'Effective Amortization', reg: formatAmort(regularAmortMonths), pre: formatAmort(prepayAmortMonths), diff: signedAmort(prepayAmortMonths - regularAmortMonths), pct: pctOf(regularAmortMonths, prepayAmortMonths), negativeIsGood: true, regN: regularAmortMonths, preN: prepayAmortMonths },
  ]
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left font-body text-sm">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-gray-500 border-b border-gray-200">
            <th className="py-2 pr-3 font-medium">Metric</th>
            <th className="py-2 px-3 font-medium text-right">Regular</th>
            <th className="py-2 px-3 font-medium text-right">With Prepayment</th>
            <th className="py-2 pl-3 font-medium text-right">Difference</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const delta = r.preN - r.regN
            const improved = r.negativeIsGood ? delta < 0 : delta > 0
            const badge = improved ? 'bg-[#95D600]/20 text-[#3d6b00]' : 'bg-red-100 text-red-700'
            return (
              <tr key={r.metric} className="border-b border-gray-100">
                <td className="py-2 pr-3 text-gray-700">{r.metric}</td>
                <td className="py-2 px-3 text-right text-gray-600 tabular-nums">{r.reg}</td>
                <td className="py-2 px-3 text-right text-gray-600 tabular-nums">{r.pre}</td>
                <td className="py-2 pl-3 text-right">
                  <span className="text-[#032133] tabular-nums">{r.diff}</span>
                  <span className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${badge}`}>
                    {(r.pct >= 0 ? '+' : '') + r.pct.toFixed(1)}%
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
const pctOf = (regular: number, withPrepay: number) =>
  regular !== 0 ? ((withPrepay - regular) / regular) * 100 : 0

/* ---------- amortization table ---------- */

function AmortTable({ years }: { years: YearRow[] }) {
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full min-w-[760px] text-left font-body text-sm tabular-nums">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-gray-500">
            <th className="py-1.5 px-2" rowSpan={2}>Year</th>
            <th className="py-1.5 px-2 text-right" rowSpan={2}>Balance Remaining</th>
            <th className="py-1.5 px-2 text-center border-l border-gray-200" colSpan={3}>Annual</th>
            <th className="py-1.5 px-2 text-center border-l border-gray-200" colSpan={3}>Total</th>
          </tr>
          <tr className="text-[10px] uppercase tracking-wider text-gray-400">
            <th className="py-1.5 px-2 text-right border-l border-gray-200">Interest Paid</th>
            <th className="py-1.5 px-2 text-right">Principal Paid</th>
            <th className="py-1.5 px-2 text-right">Annual Paid</th>
            <th className="py-1.5 px-2 text-right border-l border-gray-200">Interest Paid</th>
            <th className="py-1.5 px-2 text-right">Principal Paid</th>
            <th className="py-1.5 px-2 text-right">Annual Paid</th>
          </tr>
        </thead>
        <tbody>
          {years.map((y) => (
            <tr key={y.year} className="border-t border-gray-100">
              <td className="py-1.5 px-2 text-gray-700">{y.year}</td>
              <td className="py-1.5 px-2 text-right text-gray-700">{fmtMoney2(y.endBalance)}</td>
              <td className="py-1.5 px-2 text-right text-gray-600 border-l border-gray-100">{fmtMoney2(y.interest)}</td>
              <td className="py-1.5 px-2 text-right text-gray-600">{fmtMoney2(y.principal)}</td>
              <td className="py-1.5 px-2 text-right text-gray-600">{fmtMoney2(y.paid)}</td>
              <td className="py-1.5 px-2 text-right text-gray-500 border-l border-gray-100">{fmtMoney2(y.cumInterest)}</td>
              <td className="py-1.5 px-2 text-right text-gray-500">{fmtMoney2(y.cumPrincipal)}</td>
              <td className="py-1.5 px-2 text-right text-gray-500">{fmtMoney2(y.cumPaid)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AmortNote({ input, schedule, years }: { input: MortgageInput; schedule: ReturnType<typeof buildSchedule>; years: YearRow[] }) {
  const firstYear = years.length ? years[0].year : new Date().getFullYear()
  const firstYearPayments = schedule.rows.filter((r) => r.date.getFullYear() === firstYear).length
  const freqLabel = FREQUENCY[input.frequency].label.toLowerCase()
  const compLabel = input.compounding.replace('-', ' ')
  return (
    <div className="font-body text-xs text-gray-500 leading-relaxed mt-3 space-y-1">
      <p>
        The first calendar year is partial. It has {firstYearPayments} {freqLabel} payment
        {firstYearPayments === 1 ? '' : 's'}, with interest compounded {compLabel}.
      </p>
      {hasPrepayment(input) && (
        <p>Prepayments are applied, so the mortgage clears sooner than the full amortization.</p>
      )}
      {input.loanType === 'interest-only' && (
        <p>This is an interest-only loan, so the balance does not go down from regular payments.</p>
      )}
    </div>
  )
}
