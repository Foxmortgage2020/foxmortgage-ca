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
import { computePurchase, minimumDownPayment, type PurchaseInput } from '@/lib/purchase-engine'
import type { Location } from '@/lib/land-transfer-engine'
import { debtService, requiredIncome, type AffordabilityInputs } from '@/lib/affordability-engine'

/* ---------- formatting ---------- */

const fmtMoney0 = (n: number) => '$' + Math.round(n).toLocaleString('en-CA')
const fmtMoney2 = (n: number) =>
  (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct2 = (frac: number) => (frac * 100).toFixed(2) + '%'
const pctTrim = (n: number) => parseFloat(n.toFixed(3)).toString() + '%'
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
const monthsToYM = (months: number) => {
  const m = Math.max(0, Math.round(months))
  const y = Math.floor(m / 12)
  const r = m % 12
  if (y === 0) return `${r} mo`
  if (r === 0) return `${y} yr`
  return `${y} yr ${r} mo`
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]'
const selectClass = `${inputClass} bg-white`

const LOCATIONS: { value: Location; label: string }[] = [
  { value: 'on-toronto', label: 'Toronto, ON' },
  { value: 'on', label: 'Ontario (outside Toronto)' },
  { value: 'bc', label: 'British Columbia' },
  { value: 'qc-montreal', label: 'Montreal, QC' },
  { value: 'qc', label: 'Quebec (outside Montreal)' },
  { value: 'ab', label: 'Alberta' },
  { value: 'mb', label: 'Manitoba' },
  { value: 'sk', label: 'Saskatchewan' },
  { value: 'ns-halifax', label: 'Nova Scotia (Halifax)' },
  { value: 'nb', label: 'New Brunswick' },
  { value: 'pei', label: 'Prince Edward Island' },
  { value: 'nl', label: 'Newfoundland and Labrador' },
]
const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'semi-monthly', label: 'Semi-Monthly' },
  { value: 'bi-weekly', label: 'Bi-Weekly' },
  { value: 'acc-bi-weekly', label: 'Accelerated Bi-Weekly' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'acc-weekly', label: 'Accelerated Weekly' },
]

type DownPreset = 'min' | '10' | '15' | '20' | 'custom'
type SharedMode = 'single' | 'multiple'
type OutputTab = 'pi' | 'monthly' | 'dsr' | 'income' | 'cash'
type ExpenseTab = 'expenses' | 'liabilities' | 'rental'

interface OptionState {
  id: string
  homePrice: string
  downPreset: DownPreset
  downCustom: string
  rate: string
  term: string
  amortYears: string
  amortMonths: string
  frequency: Frequency
  ftb: boolean
  newBuild: boolean
  paymentIncrease: string
  oneTimePrepay: string
  annualPrepay: string
  notes: string
  propertyTaxAnnual: string
  condoMonthly: string
  heatMonthly: string
  monthlyDebt: string
  rentalMonthly: string
}

function newOption(id: string, downPreset: DownPreset): OptionState {
  return {
    id, homePrice: '800000', downPreset, downCustom: '', rate: '3.99', term: '5', amortYears: '25',
    amortMonths: '0', frequency: 'monthly', ftb: false, newBuild: false, paymentIncrease: '0',
    oneTimePrepay: '0', annualPrepay: '0', notes: '', propertyTaxAnnual: '0', condoMonthly: '0',
    heatMonthly: '0', monthlyDebt: '0', rentalMonthly: '0',
  }
}

function effectiveDown(opt: OptionState, price: number): number {
  switch (opt.downPreset) {
    case 'min': return minimumDownPayment(price)
    case '10': return price * 0.1
    case '15': return price * 0.15
    case '20': return price * 0.2
    default: return num(opt.downCustom)
  }
}

interface OptionResult {
  down: number
  premium: number
  premiumRate: number
  insuredMortgage: number
  payment: number
  termInterest: number
  termPrincipal: number
  totalTermPayments: number
  balanceEndOfTerm: number
  effectiveAmortMonths: number
  totalMonthlyCost: number
  gds: number
  tds: number
  requiredIncome: number
  cashToClose: number
  closing: number
}

export default function PurchaseCompare() {
  const idRef = useRef(3)
  const [mode, setMode] = useState<SharedMode>('single')
  const [homePrice, setHomePrice] = useState('800000')
  const [location, setLocation] = useState<Location>('on-toronto')
  const [income, setIncome] = useState('150000')
  const [foreignBuyer, setForeignBuyer] = useState(false)

  const [baselineId, setBaselineId] = useState('o1')
  const [options, setOptions] = useState<OptionState[]>([
    { ...newOption('o1', 'min'), downCustom: '' },
    newOption('o2', '10'),
    newOption('o3', '15'),
  ])

  const [outputTab, setOutputTab] = useState<OutputTab>('pi')
  const [expenseTab, setExpenseTab] = useState<ExpenseTab>('expenses')
  const [expenseMode, setExpenseMode] = useState<SharedMode>('single')
  const [liabilityMode, setLiabilityMode] = useState<SharedMode>('single')
  const [rentalMode, setRentalMode] = useState<SharedMode>('single')
  const [rentalEnabled, setRentalEnabled] = useState(false)
  const [sharedPropertyTaxAnnual, setSharedPropertyTaxAnnual] = useState('0')
  const [sharedCondo, setSharedCondo] = useState('0')
  const [sharedHeat, setSharedHeat] = useState('0')
  const [sharedMonthlyDebt, setSharedMonthlyDebt] = useState('0')
  const [sharedRentalMonthly, setSharedRentalMonthly] = useState('0')

  const update = (id: string, patch: Partial<OptionState>) =>
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)))

  const addOption = () => {
    if (options.length >= 4) return
    const id = 'o' + ++idRef.current
    setOptions((prev) => [...prev, newOption(id, '20')])
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

  const results = useMemo(() => {
    const map: Record<string, OptionResult> = {}
    for (const opt of options) {
      const price = mode === 'single' ? num(homePrice) : num(opt.homePrice)
      const down = effectiveDown(opt, price)
      const propTaxAnnual = expenseMode === 'single' ? num(sharedPropertyTaxAnnual) : num(opt.propertyTaxAnnual)
      const condo = expenseMode === 'single' ? num(sharedCondo) : num(opt.condoMonthly)
      const heat = expenseMode === 'single' ? num(sharedHeat) : num(opt.heatMonthly)
      const monthlyDebt = liabilityMode === 'single' ? num(sharedMonthlyDebt) : num(opt.monthlyDebt)
      const rentalMonthly = rentalMode === 'single' ? num(sharedRentalMonthly) : num(opt.rentalMonthly)

      const amortYears = num(opt.amortYears)
      const amortMonthsN = num(opt.amortMonths)
      const amortMonths = amortYears * 12 + amortMonthsN
      const termYears = num(opt.term)
      const rate = num(opt.rate)
      const payInc = num(opt.paymentIncrease)

      const purchaseInput: PurchaseInput = {
        price, downPayment: down, location, rate, amortYears, amortMonths: amortMonthsN, termYears,
        frequency: opt.frequency, paymentIncrease: payInc, ftb: opt.ftb, newBuild: opt.newBuild,
        foreignBuyer, propertyTaxMonthly: propTaxAnnual / 12, condoMonthly: condo, heatMonthly: heat,
        otherMonthly: 0, rentalIncomeMonthly: rentalMonthly, applyRental: rentalEnabled,
        ancillary: { appraisal: 0, inspection: 0, legal: 0, title: 0, moving: 0, adjustments: 0, lenderFee: 0, brokerageFee: 0 },
      }
      const purchase = computePurchase(purchaseInput)
      const insuredMortgage = purchase.insuredMortgage

      const mInput: MortgageInput = {
        amount: insuredMortgage, ratePct: rate, compounding: 'semi-annually', termYears, amortMonths,
        frequency: opt.frequency, loanType: 'regular', payIncPct: 0, payIncAmt: payInc,
        oneTimePrepay: num(opt.oneTimePrepay), annualPrepay: num(opt.annualPrepay),
      }
      const schedule = buildSchedule(mInput)
      const perYear = schedule.perYear
      const termPeriods = Math.round(termYears * perYear)
      const termBd = paymentBreakdown(mInput, schedule, 'term')
      const balanceEndOfTerm = schedule.rows.length === 0 ? 0 : schedule.rows[Math.min(termPeriods, schedule.rows.length) - 1]?.balance ?? 0

      const affInputs: AffordabilityInputs = {
        contractRate: rate, amortMonths, compounding: 'semi-annual', stressMode: 'b20', monthlyDebt,
        propertyTaxMonthly: propTaxAnnual / 12, condoMonthly: condo, heatMonthly: heat, condoInclusionRate: 0.5,
        gdsLimit: 0.39, tdsLimit: 0.44, rentalEnabled, rentalMonthly, rentalRule: 'add-back', rentalPortion: 0.5,
      }
      const ds = debtService(affInputs, insuredMortgage, num(income))
      const ri = requiredIncome(affInputs, insuredMortgage)

      map[opt.id] = {
        down, premium: purchase.premium, premiumRate: purchase.premiumRate, insuredMortgage,
        payment: schedule.payment, termInterest: termBd.interest, termPrincipal: termBd.basePrincipal + termBd.extraPrincipal,
        totalTermPayments: termBd.total, balanceEndOfTerm, effectiveAmortMonths: comparePrepayment(mInput).prepayAmortMonths,
        totalMonthlyCost: purchase.totalMonthlyCost,
        gds: ds.gds, tds: ds.tds, requiredIncome: ri.requiredIncome, cashToClose: down + purchase.totalEstimatedCost, closing: purchase.totalEstimatedCost,
      }
    }
    return map
  }, [
    options, mode, homePrice, location, income, foreignBuyer, expenseMode, liabilityMode, rentalMode, rentalEnabled,
    sharedPropertyTaxAnnual, sharedCondo, sharedHeat, sharedMonthlyDebt, sharedRentalMonthly,
  ])

  const baseRes = results[baselineId]

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
            <span className="text-gray-700">Purchase Compare</span>
          </nav>
          <h1 className="font-heading text-2xl sm:text-3xl text-[#032133] leading-tight mt-1">Purchase Compare</h1>
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

      {/* Shared controls */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="font-body text-xs text-gray-600 mb-1.5 block">Price mode</label>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as SharedMode)}
              options={[{ value: 'single', label: 'Single' }, { value: 'multiple', label: 'Multiple' }]}
            />
          </div>
          {mode === 'single' && (
            <div className="min-w-[160px]">
              <label className="font-body text-xs text-gray-600 mb-1.5 block">Home price</label>
              <CurrencyInput value={homePrice} onChange={setHomePrice} />
            </div>
          )}
          <div className="min-w-[200px]">
            <label className="font-body text-xs text-gray-600 mb-1.5 block">Location</label>
            <select value={location} onChange={(e) => setLocation(e.target.value as Location)} className={selectClass}>
              {LOCATIONS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[160px]">
            <label className="font-body text-xs text-gray-600 mb-1.5 block">Gross annual income</label>
            <CurrencyInput value={income} onChange={setIncome} />
          </div>
          <label className="flex items-center gap-2 font-body text-sm text-gray-700 cursor-pointer py-2">
            <input type="checkbox" checked={foreignBuyer} onChange={(e) => setForeignBuyer(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#032133] focus:ring-[#032133]/30" />
            Foreign buyer / non-resident
          </label>
        </div>
      </div>

      {/* Option columns */}
      <div className={`grid grid-cols-1 gap-4 ${options.length === 2 ? 'md:grid-cols-2' : options.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
        {options.map((opt, i) => {
          const price = mode === 'single' ? num(homePrice) : num(opt.homePrice)
          const r = results[opt.id]
          const minPct = price > 0 ? (minimumDownPayment(price) / price) * 100 : 0
          return (
            <div key={opt.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setBaselineId(opt.id)}
                  className="font-body text-sm font-medium inline-flex items-center gap-1.5"
                  aria-label="Mark as baseline"
                >
                  <span className={baselineId === opt.id ? 'text-[#95D600]' : 'text-gray-300'}>{baselineId === opt.id ? '★' : '☆'}</span>
                  <span className="text-[#032133]">Option {i + 1}</span>
                </button>
                {options.length > 2 && (
                  <button type="button" onClick={() => removeOption(opt.id)} className="font-body text-xs text-gray-400 hover:text-red-600">Remove</button>
                )}
              </div>

              {mode === 'multiple' && (
                <Mini label="Home price">
                  <CurrencyInput value={opt.homePrice} onChange={(v) => update(opt.id, { homePrice: v })} />
                </Mini>
              )}

              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 font-body text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={opt.ftb} onChange={(e) => update(opt.id, { ftb: e.target.checked })} className="h-3.5 w-3.5 rounded border-gray-300 text-[#032133]" /> FTB
                </label>
                <label className="flex items-center gap-1.5 font-body text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={opt.newBuild} onChange={(e) => update(opt.id, { newBuild: e.target.checked })} className="h-3.5 w-3.5 rounded border-gray-300 text-[#032133]" /> New build
                </label>
              </div>

              <Mini label="Down payment" action={<ApplyAll onClick={() => applyToAll(['downPreset', 'downCustom'])} />}>
                <select
                  value={opt.downPreset}
                  onChange={(e) => update(opt.id, { downPreset: e.target.value as DownPreset })}
                  className={`${selectClass} mb-1.5`}
                >
                  <option value="min">Min {pctTrim(minPct)}</option>
                  <option value="10">10%</option>
                  <option value="15">15%</option>
                  <option value="20">20%</option>
                  <option value="custom">Custom</option>
                </select>
                <CurrencyInput
                  value={opt.downPreset === 'custom' ? opt.downCustom : String(Math.round(effectiveDown(opt, price) * 100) / 100)}
                  onChange={(v) => update(opt.id, { downPreset: 'custom', downCustom: v })}
                />
              </Mini>

              {r && (
                <div className="rounded-lg bg-gray-50 px-3 py-2 space-y-1">
                  <InlineRow label="Mortgage Insurance" value={fmtMoney2(r.premium)} />
                  <InlineRow label="Mortgage Amount" value={fmtMoney2(r.insuredMortgage)} />
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
                    {Array.from({ length: 26 }, (_, k) => k + 5).map((y) => <option key={y} value={y}>{y}</option>)}
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
                <textarea
                  value={opt.notes}
                  onChange={(e) => update(opt.id, { notes: e.target.value })}
                  rows={2}
                  className={`${inputClass} resize-none`}
                  placeholder="Notes for this option"
                />
              </Mini>
            </div>
          )
        })}
        {options.length < 4 && (
          <button
            type="button"
            onClick={addOption}
            className="rounded-2xl border-2 border-dashed border-gray-200 text-gray-500 hover:border-[#95D600] hover:text-[#032133] transition font-body text-sm font-medium min-h-[120px] print:hidden"
          >
            + Add option
          </button>
        )}
      </div>

      {/* Shared expenses / liabilities / rental */}
      <div className="rounded-2xl border border-gray-200 bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <Segmented
            value={expenseTab}
            onChange={(v) => setExpenseTab(v as ExpenseTab)}
            options={[{ value: 'expenses', label: 'Home Expenses' }, { value: 'liabilities', label: 'Liabilities' }, { value: 'rental', label: 'Rental Income' }]}
          />
          <Segmented
            value={expenseTab === 'expenses' ? expenseMode : expenseTab === 'liabilities' ? liabilityMode : rentalMode}
            onChange={(v) => {
              if (expenseTab === 'expenses') setExpenseMode(v as SharedMode)
              else if (expenseTab === 'liabilities') setLiabilityMode(v as SharedMode)
              else setRentalMode(v as SharedMode)
            }}
            options={[{ value: 'single', label: 'Single' }, { value: 'multiple', label: 'Multiple' }]}
          />
        </div>

        {expenseTab === 'expenses' && (
          expenseMode === 'single' ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Mini label="Property tax (annual)"><CurrencyInput value={sharedPropertyTaxAnnual} onChange={setSharedPropertyTaxAnnual} /></Mini>
              <Mini label="Condo fees (monthly)"><CurrencyInput value={sharedCondo} onChange={setSharedCondo} /></Mini>
              <Mini label="Heat (monthly)"><CurrencyInput value={sharedHeat} onChange={setSharedHeat} /></Mini>
            </div>
          ) : (
            <PerOptionGrid options={options}>
              {(opt) => (
                <div className="grid grid-cols-3 gap-2">
                  <CurrencyInput value={opt.propertyTaxAnnual} onChange={(v) => update(opt.id, { propertyTaxAnnual: v })} />
                  <CurrencyInput value={opt.condoMonthly} onChange={(v) => update(opt.id, { condoMonthly: v })} />
                  <CurrencyInput value={opt.heatMonthly} onChange={(v) => update(opt.id, { heatMonthly: v })} />
                </div>
              )}
            </PerOptionGrid>
          )
        )}
        {expenseTab === 'liabilities' && (
          liabilityMode === 'single' ? (
            <Mini label="Monthly debt payments"><CurrencyInput value={sharedMonthlyDebt} onChange={setSharedMonthlyDebt} /></Mini>
          ) : (
            <PerOptionGrid options={options}>
              {(opt) => <CurrencyInput value={opt.monthlyDebt} onChange={(v) => update(opt.id, { monthlyDebt: v })} />}
            </PerOptionGrid>
          )
        )}
        {expenseTab === 'rental' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 font-body text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={rentalEnabled} onChange={(e) => setRentalEnabled(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#032133]" />
              Apply rental income
            </label>
            {rentalEnabled && (
              rentalMode === 'single' ? (
                <Mini label="Rental income (monthly)"><CurrencyInput value={sharedRentalMonthly} onChange={setSharedRentalMonthly} /></Mini>
              ) : (
                <PerOptionGrid options={options}>
                  {(opt) => <CurrencyInput value={opt.rentalMonthly} onChange={(v) => update(opt.id, { rentalMonthly: v })} />}
                </PerOptionGrid>
              )
            )}
          </div>
        )}
      </div>

      {/* Output tabs */}
      <div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4 overflow-x-auto">
          {([
            ['pi', 'Principal & Interest'],
            ['monthly', 'Total Monthly Cost'],
            ['dsr', 'Debt Service Ratios'],
            ['income', 'Required Income'],
            ['cash', 'Cash to Close'],
          ] as [OutputTab, string][]).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setOutputTab(v)}
              className={`px-3 py-2 rounded-md font-body text-sm whitespace-nowrap transition ${
                outputTab === v ? 'bg-white text-[#032133] font-medium shadow-sm' : 'bg-transparent text-gray-600 hover:text-[#032133]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className={`grid grid-cols-1 gap-4 ${options.length === 2 ? 'md:grid-cols-2' : options.length === 4 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-3'}`}>
          {options.map((opt, i) => {
            const r = results[opt.id]
            if (!r) return null
            const isBase = opt.id === baselineId
            return (
              <div key={opt.id} className={`rounded-2xl border bg-white p-5 ${isBase ? 'border-[#95D600] border-2' : 'border-gray-200'}`}>
                <div className="font-body text-xs uppercase tracking-wider text-gray-500 font-medium mb-3 inline-flex items-center gap-1.5">
                  <span className={isBase ? 'text-[#95D600]' : 'text-gray-300'}>{isBase ? '★' : '☆'}</span>
                  Option {i + 1}
                </div>
                {outputTab === 'pi' && (
                  <div className="space-y-2">
                    <Metric label="Term Interest" value={fmtMoney2(r.termInterest)} delta={isBase ? null : r.termInterest - baseRes.termInterest} fmt={fmtMoney2} />
                    <Metric label="Term Principal" value={fmtMoney2(r.termPrincipal)} delta={isBase ? null : r.termPrincipal - baseRes.termPrincipal} fmt={fmtMoney2} invert />
                    <Metric label="Total Term Payments" value={fmtMoney2(r.totalTermPayments)} delta={isBase ? null : r.totalTermPayments - baseRes.totalTermPayments} fmt={fmtMoney2} />
                    <Metric label="Balance at End of Term" value={fmtMoney2(r.balanceEndOfTerm)} delta={isBase ? null : r.balanceEndOfTerm - baseRes.balanceEndOfTerm} fmt={fmtMoney2} />
                    <Metric label="Effective Amortization" value={monthsToYM(r.effectiveAmortMonths)} delta={isBase ? null : r.effectiveAmortMonths - baseRes.effectiveAmortMonths} fmt={(n) => monthsToYM(n)} />
                  </div>
                )}
                {outputTab === 'monthly' && (
                  <Metric big label="Total Monthly Cost" value={fmtMoney2(r.totalMonthlyCost)} delta={isBase ? null : r.totalMonthlyCost - baseRes.totalMonthlyCost} fmt={fmtMoney2} />
                )}
                {outputTab === 'dsr' && (
                  <div className="space-y-2">
                    <Metric label="GDS" value={pct2(r.gds)} delta={isBase ? null : r.gds - baseRes.gds} fmt={(n) => pct2(n)} />
                    <Metric label="TDS" value={pct2(r.tds)} delta={isBase ? null : r.tds - baseRes.tds} fmt={(n) => pct2(n)} />
                  </div>
                )}
                {outputTab === 'income' && (
                  <Metric big label="Required Income" value={fmtMoney0(r.requiredIncome)} delta={isBase ? null : r.requiredIncome - baseRes.requiredIncome} fmt={fmtMoney0} />
                )}
                {outputTab === 'cash' && (
                  <div className="space-y-2">
                    <Metric label="Down Payment" value={fmtMoney2(r.down)} delta={isBase ? null : r.down - baseRes.down} fmt={fmtMoney2} />
                    <Metric label="Closing Costs" value={fmtMoney2(r.closing)} delta={isBase ? null : r.closing - baseRes.closing} fmt={fmtMoney2} />
                    <Metric big label="Cash to Close" value={fmtMoney2(r.cashToClose)} delta={isBase ? null : r.cashToClose - baseRes.cashToClose} fmt={fmtMoney2} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {outputTab === 'pi' && (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 mt-4">
            <div className="font-heading text-base text-[#032133] mb-4">Interest Comparison</div>
            <InterestChart options={options} results={results} baselineId={baselineId} />
          </div>
        )}
      </div>

      <div className="font-body text-xs text-gray-500 leading-relaxed">
        <p>
          <span className="font-medium text-gray-700">Disclaimer:</span> This calculator is for
          illustrative purposes only and should not be relied upon for financial planning. Insurance,
          tax, and qualifying rules vary and change. Confirm the final numbers with your lawyer and
          lender before you close.
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

function Segmented({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md font-body text-sm whitespace-nowrap transition ${
            value === o.value ? 'bg-white text-[#032133] font-medium shadow-sm' : 'bg-transparent text-gray-600 hover:text-[#032133]'
          }`}
        >
          {o.label}
        </button>
      ))}
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

function PerOptionGrid({ options, children }: { options: OptionState[]; children: (opt: OptionState) => React.ReactNode }) {
  return (
    <div className="space-y-3">
      {options.map((opt, i) => (
        <div key={opt.id} className="flex items-center gap-3">
          <span className="font-body text-xs text-gray-500 w-16 shrink-0">Option {i + 1}</span>
          <div className="flex-1">{children(opt)}</div>
        </div>
      ))}
    </div>
  )
}

function Metric({
  label,
  value,
  delta,
  fmt,
  big,
  invert,
}: {
  label: string
  value: string
  delta: number | null
  fmt: (n: number) => string
  big?: boolean
  invert?: boolean
}) {
  return (
    <div>
      <div className="font-body text-[11px] uppercase tracking-wider text-gray-500 font-medium">{label}</div>
      <div className={`font-heading text-[#032133] tabular-nums ${big ? 'text-3xl' : 'text-lg'}`}>{value}</div>
      <DeltaBadge delta={delta} fmt={fmt} invert={invert} />
    </div>
  )
}

// Lower is better for cost metrics, so a negative delta is good (green down arrow).
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
