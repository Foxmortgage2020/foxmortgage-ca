'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  debtService,
  maximumMortgage,
  requiredIncome,
  type AffordabilityInputs,
  type Compounding,
  type MaxMortgageResult,
  type RentalRule,
  type RequiredIncomeResult,
  type StressMode,
} from '@/lib/affordability-engine'

export type AffordabilityMode = 'debt-service' | 'maximum-mortgage' | 'required-income'

/* ---------- formatting helpers (match the other tools) ---------- */

const fmtMoney0 = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')
const fmtMoney2 = (n: number) =>
  (n < 0 ? '-$' : '$') +
  Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct2 = (frac: number) => (frac * 100).toFixed(2) + '%'

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

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]'
const selectClass = `${inputClass} bg-white`

const NAVY = '#032133'
const LIME = '#95D600'
const C_MORTGAGE = NAVY
const C_DEBT = '#f59e0b'
const C_HOME = LIME
const C_CASH = '#22c55e'

const TITLES: Record<AffordabilityMode, string> = {
  'debt-service': 'Debt Service Calculator',
  'maximum-mortgage': 'Maximum Mortgage Calculator',
  'required-income': 'Required Income Calculator',
}

const TIERS: { label: string; gds: number; tds: number }[] = [
  { label: '32% / 40%', gds: 0.32, tds: 0.4 },
  { label: '35% / 42%', gds: 0.35, tds: 0.42 },
  { label: '39% / 44%', gds: 0.39, tds: 0.44 },
]

export default function AffordabilityCalculator({ mode }: { mode: AffordabilityMode }) {
  const showMortgage = mode === 'debt-service' || mode === 'required-income'
  const showIncome = mode === 'debt-service' || mode === 'maximum-mortgage'
  const showLimits = mode === 'maximum-mortgage' || mode === 'required-income'

  /* Mortgage and income */
  const [mortgageAmount, setMortgageAmount] = useState('500000')
  const [annualIncome, setAnnualIncome] = useState('150000')
  const [gdsLimit, setGdsLimit] = useState('39.00')
  const [tdsLimit, setTdsLimit] = useState('44.00')

  /* Obligations */
  const [monthlyDebt, setMonthlyDebt] = useState('0')
  const [propertyTaxMonthly, setPropertyTaxMonthly] = useState('833.33')
  const [propertyTaxYearly, setPropertyTaxYearly] = useState('10000')
  const [condo, setCondo] = useState('0')
  const [heat, setHeat] = useState('100')

  /* Rate and amortization */
  const [rate, setRate] = useState('6.29')
  const [term, setTerm] = useState('5')
  const [rateType, setRateType] = useState('Fixed')
  const [loanType, setLoanType] = useState('Regular')
  const [compounding, setCompounding] = useState<Compounding>('semi-annual')
  const [amortYears, setAmortYears] = useState('25')
  const [amortMonthsSel, setAmortMonthsSel] = useState('0')

  /* Rules and rental */
  const [stressMode, setStressMode] = useState<StressMode>('b20')
  const [condoInclusionRate, setCondoInclusionRate] = useState('0.5')
  const [rentalEnabled, setRentalEnabled] = useState(false)
  const [rentalMonthly, setRentalMonthly] = useState('0')
  const [rentalRule, setRentalRule] = useState<RentalRule>('add-back')
  const [rentalPortion, setRentalPortion] = useState('0.5')

  const setPTMonthly = (v: string) => {
    setPropertyTaxMonthly(v)
    const m = num(v)
    setPropertyTaxYearly(m ? String(Math.round(m * 12 * 100) / 100) : '0')
  }
  const setPTYearly = (v: string) => {
    setPropertyTaxYearly(v)
    const y = num(v)
    setPropertyTaxMonthly(y ? String(Math.round((y / 12) * 100) / 100) : '0')
  }

  const inputs: AffordabilityInputs = useMemo(
    () => ({
      contractRate: num(rate),
      amortMonths: num(amortYears) * 12 + num(amortMonthsSel),
      compounding,
      stressMode,
      monthlyDebt: num(monthlyDebt),
      propertyTaxMonthly: num(propertyTaxMonthly),
      condoMonthly: num(condo),
      heatMonthly: num(heat),
      condoInclusionRate: num(condoInclusionRate),
      gdsLimit: num(gdsLimit) / 100,
      tdsLimit: num(tdsLimit) / 100,
      rentalEnabled,
      rentalMonthly: num(rentalMonthly),
      rentalRule,
      rentalPortion: num(rentalPortion),
    }),
    [
      rate, amortYears, amortMonthsSel, compounding, stressMode, monthlyDebt, propertyTaxMonthly,
      condo, heat, condoInclusionRate, gdsLimit, tdsLimit, rentalEnabled, rentalMonthly, rentalRule, rentalPortion,
    ],
  )

  const result = useMemo(() => {
    if (mode === 'debt-service') return debtService(inputs, num(mortgageAmount), num(annualIncome))
    if (mode === 'maximum-mortgage') return maximumMortgage(inputs, num(annualIncome))
    return requiredIncome(inputs, num(mortgageAmount))
  }, [mode, inputs, mortgageAmount, annualIncome])

  const maxResult = mode === 'maximum-mortgage' ? (result as MaxMortgageResult) : null
  const reqResult = mode === 'required-income' ? (result as RequiredIncomeResult) : null
  const binding = maxResult?.binding ?? reqResult?.binding ?? null

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
            <span className="text-gray-700">{TITLES[mode]}</span>
          </nav>
          <h1 className="font-heading text-2xl sm:text-3xl text-[#032133] leading-tight mt-1">{TITLES[mode]}</h1>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left inputs */}
        <div className="lg:col-span-2 space-y-6">
          <Card title="Mortgage and Income">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {showMortgage && (
                <Field label="Mortgage amount">
                  <CurrencyInput value={mortgageAmount} onChange={setMortgageAmount} />
                </Field>
              )}
              {showIncome && (
                <Field label="Gross annual income">
                  <CurrencyInput value={annualIncome} onChange={setAnnualIncome} />
                </Field>
              )}
              <Field label="Monthly debt payments" className={showMortgage && showIncome ? 'sm:col-span-2' : ''}>
                <CurrencyInput value={monthlyDebt} onChange={setMonthlyDebt} />
              </Field>
            </div>

            {showLimits && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">
                  Affordability Level
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="GDS limit">
                    <PercentInput value={gdsLimit} onChange={setGdsLimit} />
                  </Field>
                  <Field label="TDS limit">
                    <PercentInput value={tdsLimit} onChange={setTdsLimit} />
                  </Field>
                </div>
              </div>
            )}
          </Card>

          <Card title="Home Expenses" subtitle="Monthly carrying costs counted in the ratios.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Property tax (monthly)">
                <CurrencyInput value={propertyTaxMonthly} onChange={setPTMonthly} />
              </Field>
              <Field label="Property tax (yearly)">
                <CurrencyInput value={propertyTaxYearly} onChange={setPTYearly} />
              </Field>
              <Field label="Condo fees (monthly)">
                <CurrencyInput value={condo} onChange={setCondo} />
              </Field>
              <Field label="Heat (monthly)">
                <CurrencyInput value={heat} onChange={setHeat} />
              </Field>
            </div>
          </Card>

          <Card title="Rate Settings">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Interest rate">
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className={`${inputClass} pr-7`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                </div>
              </Field>
              <Field label="Term (years)">
                <select value={term} onChange={(e) => setTerm(e.target.value)} className={selectClass}>
                  {[1, 2, 3, 4, 5, 7, 10].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </Field>
              <Field label="Rate type">
                <select value={rateType} onChange={(e) => setRateType(e.target.value)} className={selectClass}>
                  <option value="Fixed">Fixed</option>
                  <option value="Variable">Variable</option>
                </select>
              </Field>
              <Field label="Loan type">
                <select value={loanType} onChange={(e) => setLoanType(e.target.value)} className={selectClass}>
                  <option value="Regular">Regular</option>
                  <option value="Interest Only">Interest Only</option>
                </select>
              </Field>
              <Field label="Compounding">
                <select
                  value={compounding}
                  onChange={(e) => setCompounding(e.target.value as Compounding)}
                  className={selectClass}
                >
                  <option value="semi-annual">Semi-Annually</option>
                  <option value="monthly">Monthly</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Amort. years">
                  <select value={amortYears} onChange={(e) => setAmortYears(e.target.value)} className={selectClass}>
                    {Array.from({ length: 26 }, (_, k) => k + 5).map((y) => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Amort. months">
                  <select value={amortMonthsSel} onChange={(e) => setAmortMonthsSel(e.target.value)} className={selectClass}>
                    {Array.from({ length: 12 }, (_, k) => k).map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </Card>

          <Card title="Stress Test and Rental">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Stress test rules">
                <Segmented
                  value={stressMode}
                  onChange={(v) => setStressMode(v as StressMode)}
                  options={[{ value: 'contract', label: 'Contract' }, { value: 'b20', label: 'B20' }]}
                />
              </Field>
              <Field label="Condo fee inclusion rate">
                <select value={condoInclusionRate} onChange={(e) => setCondoInclusionRate(e.target.value)} className={selectClass}>
                  <option value="0">0%</option>
                  <option value="0.5">50%</option>
                  <option value="1">100%</option>
                </select>
              </Field>
              <div className="sm:col-span-2">
                <Checkbox checked={rentalEnabled} onChange={setRentalEnabled} label="Add rental income" />
                {rentalEnabled && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                    <Field label="Rental income (monthly)">
                      <CurrencyInput value={rentalMonthly} onChange={setRentalMonthly} />
                    </Field>
                    <Field label="Rental income rule">
                      <Segmented
                        value={rentalRule}
                        onChange={(v) => setRentalRule(v as RentalRule)}
                        options={[{ value: 'add-back', label: 'Add Back' }, { value: 'offset', label: 'Offset' }]}
                      />
                    </Field>
                    <Field label="Rental income portion">
                      <select value={rentalPortion} onChange={(e) => setRentalPortion(e.target.value)} className={selectClass}>
                        <option value="0.5">50%</option>
                        <option value="1">100%</option>
                      </select>
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Right sticky summary */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-6">
            {mode === 'debt-service' ? (
              <>
                <div className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-2">Actual GDS / TDS</div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="font-heading text-3xl text-[#032133] tabular-nums">{pct2(result.gds)}</div>
                    <div className="font-body text-xs text-gray-500 mt-0.5">GDS</div>
                  </div>
                  <div>
                    <div className="font-heading text-3xl text-[#032133] tabular-nums">{pct2(result.tds)}</div>
                    <div className="font-body text-xs text-gray-500 mt-0.5">TDS</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-1">
                  {mode === 'maximum-mortgage' ? 'Maximum Mortgage Amount' : 'Required Income'}
                </div>
                <div className="font-heading text-4xl text-[#032133] tabular-nums">
                  {fmtMoney0(mode === 'maximum-mortgage' ? maxResult!.maxMortgage : reqResult!.requiredIncome)}
                </div>
                {binding && (
                  <div className="font-body text-xs text-gray-500 mt-1">{binding.toUpperCase()} is the binding constraint.</div>
                )}
              </>
            )}

            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
              <span className="font-body text-sm text-gray-600">Stress Test Rate</span>
              <span className="font-heading text-sm text-[#032133] tabular-nums">{result.stressRate.toFixed(2)}%</span>
            </div>

            {mode === 'debt-service' ? (
              <div className="mt-3 space-y-1.5">
                {TIERS.map((t) => {
                  const pass = result.gds <= t.gds && result.tds <= t.tds
                  return (
                    <div key={t.label} className="flex items-center gap-2">
                      <span className="font-body text-xs text-gray-500 w-16">{t.label}</span>
                      <div className="flex-1 h-2.5 rounded-full" style={{ backgroundColor: pass ? '#22c55e' : '#ef4444' }} />
                    </div>
                  )
                })}
                <p className="font-body text-[11px] text-gray-400 mt-1">Green means you are within that tier on both GDS and TDS.</p>
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <MiniLimit label="GDS limit" value={pct2(inputs.gdsLimit)} active={binding === 'gds'} />
                <MiniLimit label="TDS limit" value={pct2(inputs.tdsLimit)} active={binding === 'tds'} />
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-3">
              Where the income goes
            </div>
            <ProportionBar
              mortgage={result.contractPayment}
              debt={result.debtPayments}
              home={result.homeExpenses}
              cash={result.cashLeftGross}
              gross={result.grossMonthly}
            />
            <div className="mt-4 space-y-1.5">
              <SummaryRow label="Monthly Mortgage" value={fmtMoney2(result.contractPayment)} dot={C_MORTGAGE} />
              <SummaryRow label="Debt Payments" value={fmtMoney2(result.debtPayments)} dot={C_DEBT} />
              <SummaryRow label="Home Expenses" value={fmtMoney2(result.homeExpenses)} dot={C_HOME} />
              <SummaryRow label="Cash Left (Gross)" value={fmtMoney2(result.cashLeftGross)} dot={C_CASH} />
            </div>
          </div>
        </div>
      </div>

      <div className="font-body text-xs text-gray-500 leading-relaxed">
        <p>
          <span className="font-medium text-gray-700">Disclaimer:</span> This calculator is for
          illustrative purposes only and should not be relied upon for financial planning. Lender
          rules, the qualifying rate, and ratio limits change. Confirm your approval with your
          lender before you make an offer.
        </p>
      </div>
    </div>
  )
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

function PercentInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(stripNum(e.target.value))}
        className={`${inputClass} pr-7`}
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
    </div>
  )
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 font-body text-sm text-gray-700 cursor-pointer py-1">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-[#032133] focus:ring-[#032133]/30"
      />
      {label}
    </label>
  )
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 py-1.5 rounded-md font-body text-sm transition ${
            value === o.value ? 'bg-white text-[#032133] font-medium shadow-sm' : 'bg-transparent text-gray-600 hover:text-[#032133]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function MiniLimit({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${active ? 'bg-[#95D600]/15 border border-[#95D600]' : 'bg-gray-50 border border-gray-200'}`}>
      <div className="font-body text-[10px] uppercase tracking-wider text-gray-500 font-medium">{label}</div>
      <div className="font-heading text-base text-[#032133] tabular-nums">{value}</div>
    </div>
  )
}

function SummaryRow({ label, value, dot }: { label: string; value: string; dot: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-body text-sm text-gray-600 inline-flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: dot }} />
        {label}
      </span>
      <span className="font-body text-sm text-[#032133] tabular-nums">{value}</span>
    </div>
  )
}

function ProportionBar({
  mortgage,
  debt,
  home,
  cash,
  gross,
}: {
  mortgage: number
  debt: number
  home: number
  cash: number
  gross: number
}) {
  const denom = Math.max(gross, 1e-9)
  const segs = [
    { v: Math.max(0, mortgage), c: C_MORTGAGE },
    { v: Math.max(0, debt), c: C_DEBT },
    { v: Math.max(0, home), c: C_HOME },
    { v: Math.max(0, cash), c: C_CASH },
  ]
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
      {segs.map((s, idx) => (
        <div key={idx} style={{ width: `${Math.min(100, (s.v / denom) * 100)}%`, backgroundColor: s.c }} />
      ))}
    </div>
  )
}
