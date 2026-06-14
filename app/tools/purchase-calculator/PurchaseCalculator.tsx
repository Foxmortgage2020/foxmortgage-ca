'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { FREQUENCY, type Frequency } from '@/lib/mortgage-engine'
import type { Location } from '@/lib/land-transfer-engine'
import { computePurchase, minimumDownPayment, type PurchaseInput } from '@/lib/purchase-engine'

/* ---------- formatting helpers (match the mortgage calculator) ---------- */

const fmtMoney2 = (n: number) =>
  (n < 0 ? '-$' : '$') +
  Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signedMoney2 = (n: number) =>
  (n >= 0 ? '+$' : '-$') +
  Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct2 = (n: number) => n.toFixed(2) + '%'

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
const FREQUENCY_OPTIONS = (Object.keys(FREQUENCY) as Frequency[]).map((k) => ({
  value: k,
  label: FREQUENCY[k].label,
}))

type SummaryTab = 'mortgage' | 'cost'

export default function PurchaseCalculator() {
  /* Purchase */
  const [price, setPrice] = useState('888000')
  const [location, setLocation] = useState<Location>('on-toronto')
  const [downPayment, setDownPayment] = useState('63800')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [ftb, setFtb] = useState(false)
  const [newBuild, setNewBuild] = useState(false)

  /* Mortgage */
  const [rate, setRate] = useState('6.29')
  const [termYears, setTermYears] = useState('5')
  const [amortYears, setAmortYears] = useState('25')
  const [amortMonthsSel, setAmortMonthsSel] = useState('0')
  const [payFaster, setPayFaster] = useState(false)
  const [paymentIncrease, setPaymentIncrease] = useState('0')

  /* Home expenses */
  const [propertyTax, setPropertyTax] = useState('833.33')
  const [condo, setCondo] = useState('0')
  const [heat, setHeat] = useState('100')
  const [other, setOther] = useState('0')
  const [applyRental, setApplyRental] = useState(false)
  const [rentalIncome, setRentalIncome] = useState('0')

  /* Ancillary */
  const [appraisal, setAppraisal] = useState('0')
  const [inspection, setInspection] = useState('0')
  const [legal, setLegal] = useState('0')
  const [title, setTitle] = useState('0')
  const [moving, setMoving] = useState('0')
  const [adjustments, setAdjustments] = useState('0')
  const [lenderFee, setLenderFee] = useState('0')
  const [brokerageFee, setBrokerageFee] = useState('0')

  const [tab, setTab] = useState<SummaryTab>('mortgage')

  const input: PurchaseInput = useMemo(
    () => ({
      price: num(price),
      downPayment: num(downPayment),
      location,
      rate: num(rate),
      amortYears: num(amortYears),
      amortMonths: num(amortMonthsSel),
      termYears: num(termYears),
      frequency,
      paymentIncrease: payFaster ? num(paymentIncrease) : 0,
      ftb,
      newBuild,
      propertyTaxMonthly: num(propertyTax),
      condoMonthly: num(condo),
      heatMonthly: num(heat),
      otherMonthly: num(other),
      rentalIncomeMonthly: num(rentalIncome),
      applyRental,
      ancillary: {
        appraisal: num(appraisal),
        inspection: num(inspection),
        legal: num(legal),
        title: num(title),
        moving: num(moving),
        adjustments: num(adjustments),
        lenderFee: num(lenderFee),
        brokerageFee: num(brokerageFee),
      },
    }),
    [
      price, downPayment, location, rate, amortYears, amortMonthsSel, termYears, frequency,
      payFaster, paymentIncrease, ftb, newBuild, propertyTax, condo, heat, other, rentalIncome,
      applyRental, appraisal, inspection, legal, title, moving, adjustments, lenderFee, brokerageFee,
    ],
  )

  const result = useMemo(() => computePurchase(input), [input])
  const freqLabel = FREQUENCY[frequency].label

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/tools" className="font-body text-xs text-gray-500 hover:text-[#032133] transition print:hidden">
            &larr; Back to Tools
          </Link>
          <h1 className="font-heading text-2xl sm:text-3xl text-[#032133] leading-tight mt-1">
            Purchase Calculator
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left: input cards */}
        <div className="lg:col-span-2 space-y-6">
          {/* Purchase */}
          <Card title="Purchase" subtitle="The home and how much you put down.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Home price">
                <CurrencyInput value={price} onChange={setPrice} />
              </Field>
              <Field label="Location">
                <select value={location} onChange={(e) => setLocation(e.target.value as Location)} className={selectClass}>
                  {LOCATIONS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Down payment"
                action={
                  <button
                    type="button"
                    onClick={() => setDownPayment(String(Math.round(minimumDownPayment(num(price)) * 100) / 100))}
                    className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition whitespace-nowrap"
                  >
                    Use minimum
                  </button>
                }
              >
                <CurrencyInput value={downPayment} onChange={setDownPayment} />
                <p className="font-body text-xs text-gray-500 mt-1">
                  {pct2(result.downPercent * 100)} of the price. Minimum is {fmtMoney2(result.minimumDown)}.
                </p>
              </Field>
              <Field label="Payment frequency">
                <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} className={selectClass}>
                  {FREQUENCY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
              <Checkbox checked={ftb} onChange={setFtb} label="First time buyer" />
              <Checkbox checked={newBuild} onChange={setNewBuild} label="Newly built home" />
            </div>
          </Card>

          {/* Mortgage */}
          <Card title="Mortgage" subtitle="Your rate, term, and amortization.">
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
                <select value={termYears} onChange={(e) => setTermYears(e.target.value)} className={selectClass}>
                  {[1, 2, 3, 4, 5, 7, 10].map((y) => (
                    <option key={y} value={y}>{y}</option>
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
              <div className="sm:col-span-2">
                <Checkbox checked={payFaster} onChange={setPayFaster} label="Pay faster" />
                {payFaster && (
                  <div className="mt-2">
                    <Field label="Increase each payment by">
                      <CurrencyInput value={paymentIncrease} onChange={setPaymentIncrease} />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Home Expenses */}
          <Card title="Home Expenses" subtitle="Monthly costs of owning the home.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Property tax (monthly)">
                <CurrencyInput value={propertyTax} onChange={setPropertyTax} />
              </Field>
              <Field label="Condo fees (monthly)">
                <CurrencyInput value={condo} onChange={setCondo} />
              </Field>
              <Field label="Heat (monthly)">
                <CurrencyInput value={heat} onChange={setHeat} />
              </Field>
              <Field label="Other (monthly)">
                <CurrencyInput value={other} onChange={setOther} />
              </Field>
              <div className="sm:col-span-2">
                <Checkbox checked={applyRental} onChange={setApplyRental} label="I will collect rental income" />
                {applyRental && (
                  <div className="mt-2">
                    <Field label="Rental income (monthly)">
                      <CurrencyInput value={rentalIncome} onChange={setRentalIncome} />
                    </Field>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Ancillary */}
          <Card title="Ancillary Cost" subtitle="These one-time closing costs are easy to overlook. Add any that apply for a complete estimate.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Appraisal"><CurrencyInput value={appraisal} onChange={setAppraisal} /></Field>
              <Field label="Home inspection"><CurrencyInput value={inspection} onChange={setInspection} /></Field>
              <Field label="Legal fees"><CurrencyInput value={legal} onChange={setLegal} /></Field>
              <Field label="Title insurance"><CurrencyInput value={title} onChange={setTitle} /></Field>
              <Field label="Moving costs"><CurrencyInput value={moving} onChange={setMoving} /></Field>
              <Field label="Final adjustments"><CurrencyInput value={adjustments} onChange={setAdjustments} /></Field>
              <Field label="Lender fee"><CurrencyInput value={lenderFee} onChange={setLenderFee} /></Field>
              <Field label="Brokerage fee"><CurrencyInput value={brokerageFee} onChange={setBrokerageFee} /></Field>
            </div>
          </Card>
        </div>

        {/* Right: sticky summary */}
        <div className="lg:sticky lg:top-6 space-y-4">
          <div className="rounded-2xl border-2 border-[#032133] bg-[#032133] p-6">
            <div className="font-body text-xs uppercase tracking-wider text-[#95D600] font-medium mb-1">
              Total Monthly Cost
            </div>
            <div className="font-heading text-4xl text-white tabular-nums">{fmtMoney2(result.totalMonthlyCost)}</div>
            <div className="font-body text-xs text-white/60 mt-1">payment plus monthly home costs</div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4">
              {(['mortgage', 'cost'] as SummaryTab[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={`flex-1 px-3 py-2 rounded-md font-body text-sm transition ${
                    tab === t
                      ? 'bg-white text-[#032133] font-medium shadow-sm'
                      : 'bg-transparent text-gray-600 hover:text-[#032133]'
                  }`}
                >
                  {t === 'mortgage' ? 'Mortgage Amount' : 'Total Estimated Cost'}
                </button>
              ))}
            </div>

            {tab === 'mortgage' ? (
              <>
                <div className="mb-3">
                  <div className="font-body text-[11px] uppercase tracking-wider text-gray-500 font-medium">Insured mortgage</div>
                  <div className="font-heading text-2xl text-[#032133] tabular-nums">{fmtMoney2(result.insuredMortgage)}</div>
                </div>
                <div className="space-y-1.5">
                  <Row label="Down Payment" value={fmtMoney2(input.downPayment)} sub={pct2(result.downPercent * 100)} />
                  <Row label="Mortgage Before Insurance" value={fmtMoney2(result.loanBeforePremium)} />
                  <Row
                    label="CMHC Insurance"
                    value={fmtMoney2(result.premium)}
                    sub={result.insured ? pct2(result.premiumRate * 100) : 'Not insured'}
                  />
                  <Row label="Insured Mortgage" value={fmtMoney2(result.insuredMortgage)} />
                  <Row label={`Payment (${freqLabel})`} value={fmtMoney2(result.payment)} />
                  <div className="border-t border-gray-100 pt-1.5 mt-1.5" />
                  <Row label="Interest over Term" value={fmtMoney2(result.interestOverTerm)} />
                  <Row label="Balance end of Term" value={fmtMoney2(result.balanceEndOfTerm)} />
                </div>
              </>
            ) : (
              <>
                <div className="mb-3">
                  <div className="font-body text-[11px] uppercase tracking-wider text-gray-500 font-medium">Total estimated cost</div>
                  <div className="font-heading text-2xl text-[#032133] tabular-nums">{fmtMoney2(result.totalEstimatedCost)}</div>
                </div>
                <div className="space-y-1.5">
                  <Row label="Land Transfer" value={fmtMoney2(result.landTransfer.total)} bold />
                  {result.landTransfer.lines.map((line, idx) => (
                    <Row key={idx} label={line.label} value={signedMoney2(line.amount)} indent />
                  ))}
                  {result.pstOnPremium > 0 && (
                    <Row label="PST on Mortgage Insurance" value={fmtMoney2(result.pstOnPremium)} />
                  )}
                  <Row label="Ancillary Cost" value={fmtMoney2(result.ancillaryTotal)} />
                  <div className="border-t border-gray-200 pt-2 mt-1.5">
                    <Row label="Total Estimated Cost" value={fmtMoney2(result.totalEstimatedCost)} bold />
                  </div>
                </div>
              </>
            )}
          </div>

          {result.warnings.length > 0 && (
            <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 px-4 py-3 space-y-1.5">
              {result.warnings.map((w, idx) => (
                <p key={idx} className="font-body text-xs text-amber-800 leading-relaxed">{w}</p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="font-body text-xs text-gray-500 leading-relaxed">
        <p>
          <span className="font-medium text-gray-700">Disclaimer:</span> This calculator is for
          illustrative purposes only and should not be relied upon for financial planning. Land
          transfer tax, rebates, and insurance rules change and vary by province and municipality.
          Confirm the final figures with your lawyer and lender before you close.
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

function Field({
  label,
  children,
  action,
  className,
}: {
  label: string
  children: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={className ?? ''}>
      <label className="font-body text-xs text-gray-600 mb-1.5 flex items-center justify-between gap-2">
        <span>{label}</span>
        {action}
      </label>
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

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 font-body text-sm text-gray-700 cursor-pointer self-end py-2">
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

function Row({
  label,
  value,
  sub,
  bold,
  indent,
}: {
  label: string
  value: string
  sub?: string
  bold?: boolean
  indent?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${indent ? 'pl-3' : ''}`}>
      <span className={`font-body text-sm ${bold ? 'text-[#032133] font-medium' : indent ? 'text-gray-500' : 'text-gray-600'}`}>
        {label}
        {sub && <span className="text-gray-400 font-normal"> ({sub})</span>}
      </span>
      <span className={`font-body text-sm tabular-nums whitespace-nowrap ${bold ? 'text-[#032133] font-semibold' : 'text-[#032133]'}`}>
        {value}
      </span>
    </div>
  )
}
