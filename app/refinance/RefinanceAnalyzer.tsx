'use client'

import { useMemo, useRef, useState } from 'react'
import { getActiveLenders } from '@/lib/lenders'
import { fetchBoCRate } from '@/lib/boc-rate'
import {
  analyzeRefinance,
  calculatePenalty,
  monthlyPayment,
  type Debt,
  type RefiRateType,
} from '@/lib/refinance-engine'

/* ---------- formatting helpers ---------- */

const money0 = (n: number) => {
  const sign = n < 0 ? '-' : ''
  return sign + '$' + Math.round(Math.abs(n)).toLocaleString('en-CA')
}
const money2 = (n: number) =>
  '$' + Math.abs(n).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signedMoney0 = (n: number) => (n >= 0 ? '+' : '-') + '$' + Math.round(Math.abs(n)).toLocaleString('en-CA')
const pct = (n: number) => n.toFixed(1) + '%'

const monthsToYM = (months: number) => {
  const m = Math.max(0, Math.round(months))
  const y = Math.floor(m / 12)
  const r = m % 12
  if (y === 0) return `${r} mo`
  if (r === 0) return `${y} yr`
  return `${y} yr ${r} mo`
}

const num = (s: string) => {
  const v = parseFloat(s)
  return isFinite(v) ? v : 0
}

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-md font-body text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#032133]/20 focus:border-[#032133]'

/* ---------- component ---------- */

type PenaltyMode = 'manual' | 'estimate'
type LookupTone = 'success' | 'error' | 'info'
type LookupNote = { msg: string; tone: LookupTone }
type DebtType =
  | 'credit-card'
  | 'line-of-credit'
  | 'other-revolving'
  | 'auto-loan'
  | 'personal-loan'
  | 'other-installment'
type DebtRow = {
  id: string
  label: string
  type: DebtType
  balance: string
  rate: string
  payment: string
  consolidate: boolean
}

// Revolving types carry at the shrinking minimum payment; installment types at a
// level payment. This only drives the long-run baseline, not the cash-flow math.
const DEBT_TYPES: { value: DebtType; label: string; basis: 'minimum' | 'fixed' }[] = [
  { value: 'credit-card', label: 'Credit card', basis: 'minimum' },
  { value: 'line-of-credit', label: 'Line of credit', basis: 'minimum' },
  { value: 'other-revolving', label: 'Other revolving', basis: 'minimum' },
  { value: 'auto-loan', label: 'Auto loan', basis: 'fixed' },
  { value: 'personal-loan', label: 'Personal loan', basis: 'fixed' },
  { value: 'other-installment', label: 'Other installment', basis: 'fixed' },
]
const basisForType = (t: DebtType): 'minimum' | 'fixed' =>
  DEBT_TYPES.find((x) => x.value === t)?.basis ?? 'minimum'

const yearsLabel = (months: number) => {
  const y = Math.round((months / 12) * 10) / 10
  const shown = Number.isInteger(y) ? y.toFixed(0) : y.toFixed(1)
  return `${shown} ${y === 1 ? 'year' : 'years'}`
}

export default function RefinanceAnalyzer() {
  const lenders = useMemo(() => getActiveLenders(), [])

  /* Current mortgage. Seeded with the validated reference scenario. */
  const [propertyValue, setPropertyValue] = useState('600000')
  const [currentBalance, setCurrentBalance] = useState('480000')
  const [currentRate, setCurrentRate] = useState('5.25')
  const [currentRateType, setCurrentRateType] = useState<RefiRateType>('fixed')
  const [currentAmortYears, setCurrentAmortYears] = useState('25')
  const [paymentAuto, setPaymentAuto] = useState(true)
  const [manualPayment, setManualPayment] = useState('')

  /* New mortgage. */
  const [newRate, setNewRate] = useState('4.29')
  const [newRateType, setNewRateType] = useState<RefiRateType>('fixed')
  const [newAmortYears, setNewAmortYears] = useState('25')
  const [termYears, setTermYears] = useState('5')
  const [equityTakeout, setEquityTakeout] = useState('0')

  /* Costs. */
  const [legalFee, setLegalFee] = useState('1200')
  const [dischargeFee, setDischargeFee] = useState('350')
  const [appraisalFee, setAppraisalFee] = useState('400')
  const [otherCosts, setOtherCosts] = useState('0')
  const [lenderCredit, setLenderCredit] = useState('0')
  const [rollIntoMortgage, setRollIntoMortgage] = useState(false)

  /* Current debts (optional, additive). */
  const idRef = useRef(0)
  const [debts, setDebts] = useState<DebtRow[]>([])
  const addDebt = () =>
    setDebts((prev) => [
      ...prev,
      {
        id: 'd' + ++idRef.current,
        label: '',
        type: 'credit-card',
        balance: '',
        rate: '',
        payment: '',
        consolidate: true,
      },
    ])
  const removeDebt = (id: string) => setDebts((prev) => prev.filter((d) => d.id !== id))
  const updateDebt = (id: string, patch: Partial<DebtRow>) =>
    setDebts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)))

  /* Penalty. */
  const [penaltyMode, setPenaltyMode] = useState<PenaltyMode>('manual')
  const [manualPenalty, setManualPenalty] = useState('6300')
  const [penLenderSlug, setPenLenderSlug] = useState(lenders[0]?.slug ?? 'other')
  const [penMonthsRemaining, setPenMonthsRemaining] = useState('36')
  const [penPosted, setPenPosted] = useState('')
  const [penComparable, setPenComparable] = useState('4.29')
  const [penPostedNote, setPenPostedNote] = useState<LookupNote | null>(null)
  const [penComparableNote, setPenComparableNote] = useState<LookupNote | null>(null)

  /* ---------- derived ---------- */

  const propertyValueN = num(propertyValue)
  const currentBalanceN = num(currentBalance)
  const currentLtv = propertyValueN > 0 ? (currentBalanceN / propertyValueN) * 100 : 0
  const currentAmortMonths = Math.round(num(currentAmortYears) * 12)
  const newAmortMonths = Math.round(num(newAmortYears) * 12)
  const termMonths = Math.round(num(termYears) * 12)

  const computedCurrentPayment = useMemo(
    () => monthlyPayment(currentBalanceN, num(currentRate), currentAmortMonths),
    [currentBalanceN, currentRate, currentAmortMonths],
  )
  const effectiveCurrentPayment = paymentAuto ? computedCurrentPayment : num(manualPayment)

  const penaltyEstimate = useMemo(() => {
    if (penaltyMode !== 'estimate') return null
    return calculatePenalty({
      lenderSlug: penLenderSlug,
      rateType: currentRateType,
      balance: currentBalanceN,
      monthsRemaining: Math.round(num(penMonthsRemaining)),
      contractRate: num(currentRate),
      postedRate: num(penPosted),
      comparableRate: num(penComparable),
    })
  }, [penaltyMode, penLenderSlug, currentRateType, currentBalanceN, penMonthsRemaining, currentRate, penPosted, penComparable])

  const penaltyValue =
    penaltyMode === 'manual' ? num(manualPenalty) : penaltyEstimate?.totalPenalty ?? 0

  const debtPayload = useMemo<Debt[]>(
    () =>
      debts.map((d) => ({
        id: d.id,
        label: d.label,
        balance: num(d.balance),
        rate: num(d.rate),
        payment: num(d.payment),
        consolidate: d.consolidate,
        basis: basisForType(d.type),
        minPercent: 3,
        minFloor: 10,
      })),
    [debts],
  )

  const result = useMemo(
    () =>
      analyzeRefinance({
        propertyValue: propertyValueN,
        currentBalance: currentBalanceN,
        currentRate: num(currentRate),
        currentRateType,
        currentPayment: effectiveCurrentPayment,
        remainingAmortizationMonths: currentAmortMonths,
        newRate: num(newRate),
        newRateType,
        newAmortizationMonths: newAmortMonths,
        termMonths,
        equityTakeout: num(equityTakeout),
        penalty: penaltyValue,
        legalFee: num(legalFee),
        dischargeFee: num(dischargeFee),
        appraisalFee: num(appraisalFee),
        otherCosts: num(otherCosts),
        lenderCredit: num(lenderCredit),
        rollIntoMortgage,
        debts: debtPayload,
      }),
    [
      propertyValueN, currentBalanceN, currentRate, currentRateType, effectiveCurrentPayment,
      currentAmortMonths, newRate, newRateType, newAmortMonths, termMonths, equityTakeout,
      penaltyValue, legalFee, dischargeFee, appraisalFee, otherCosts, lenderCredit, rollIntoMortgage,
      debtPayload,
    ],
  )

  /* ---------- BoC lookups (estimate mode) ---------- */

  const lookupPosted = async () => {
    setPenPostedNote({ msg: 'Fetching from Bank of Canada…', tone: 'info' })
    try {
      // No funding date field here, so look up the rate near 5 years ago as a
      // sensible starting point. The planner can refine from the commitment letter.
      const d = new Date()
      d.setMonth(d.getMonth() - 60)
      const r = await fetchBoCRate(d.toISOString().slice(0, 10))
      if (!r) {
        setPenPostedNote({ msg: 'No data found. Enter the rate manually.', tone: 'error' })
        return
      }
      setPenPosted(r.rate.toFixed(2))
      setPenPostedNote({ msg: `BoC 5-yr posted, week of ${r.date}`, tone: 'success' })
    } catch {
      setPenPostedNote({ msg: 'Lookup failed. Enter the rate manually.', tone: 'error' })
    }
  }

  const lookupComparable = async () => {
    setPenComparableNote({ msg: 'Fetching from Bank of Canada…', tone: 'info' })
    try {
      const r = await fetchBoCRate(new Date().toISOString().slice(0, 10))
      if (!r) {
        setPenComparableNote({ msg: 'No recent data. Enter the rate manually.', tone: 'error' })
        return
      }
      setPenComparable(r.rate.toFixed(2))
      setPenComparableNote({ msg: `BoC 5-yr posted, week of ${r.date}`, tone: 'success' })
    } catch {
      setPenComparableNote({ msg: 'Lookup failed. Enter the rate manually.', tone: 'error' })
    }
  }

  const noteTone = (t: LookupTone | undefined) =>
    t === 'success' ? 'text-green-700' : t === 'error' ? 'text-red-600' : 'text-gray-500'

  const penaltyMethodNote =
    penaltyEstimate == null
      ? null
      : currentRateType === 'variable'
        ? '3-month interest. Variable mortgages have no IRD.'
        : penaltyEstimate.irdPenalty >= penaltyEstimate.threeMonthPenalty
          ? 'IRD applies. It is greater than 3 months of interest.'
          : '3 months of interest applies. It is greater than the IRD.'

  return (
    <div className="space-y-6">
      {/* Print-only client header. Hidden on screen. */}
      <div className="hidden print:block mb-6">
        <h1 className="font-heading text-2xl text-[#032133]">Your Refinance Snapshot</h1>
        <p className="font-body text-sm text-gray-600 mt-1">
          Prepared by Mike Fox, Mortgage Agent, Level 2 — BRX Mortgage
        </p>
      </div>

      {/* ===== Results summary ===== */}
      <ResultsSummary result={result} />

      {/* ===== Inputs (hidden when printing the client report) ===== */}
      <div className="print:hidden space-y-6">
        {/* Current Mortgage */}
        <Card title="Current mortgage" subtitle="What you owe today.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Money label="Property value" value={propertyValue} onChange={setPropertyValue} />
            <div>
              <Money label="Mortgage balance" value={currentBalance} onChange={setCurrentBalance} />
              <p className="font-body text-xs text-gray-500 mt-1">
                Loan to value: <span className="font-medium text-[#032133]">{pct(currentLtv)}</span>
              </p>
            </div>

            <RateField
              label="Current rate"
              rate={currentRate}
              onRate={setCurrentRate}
              type={currentRateType}
              onType={setCurrentRateType}
            />

            <Field label="Remaining amortization (years)">
              <input
                type="number"
                step="1"
                value={currentAmortYears}
                onChange={(e) => setCurrentAmortYears(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field
              label="Current monthly payment"
              className="sm:col-span-2"
              action={
                paymentAuto ? (
                  <span className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20">
                    Computed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => { setPaymentAuto(true); setManualPayment('') }}
                    className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition"
                  >
                    Use computed
                  </button>
                )
              }
            >
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={paymentAuto ? computedCurrentPayment.toFixed(2) : manualPayment}
                  onChange={(e) => { setPaymentAuto(false); setManualPayment(e.target.value) }}
                  className={`${inputClass} pl-7`}
                />
              </div>
              <p className="font-body text-xs text-gray-500 mt-1">
                We work this out for you. Edit it if your real payment is different.
              </p>
            </Field>
          </div>
        </Card>

        {/* New Mortgage */}
        <Card title="New mortgage" subtitle="The rate and terms you are comparing to.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <RateField
              label="New rate"
              rate={newRate}
              onRate={setNewRate}
              type={newRateType}
              onType={setNewRateType}
            />

            <Field
              label="New amortization (years)"
              action={
                <button
                  type="button"
                  onClick={() => setNewAmortYears(currentAmortYears)}
                  className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition"
                >
                  Match current
                </button>
              }
            >
              <input
                type="number"
                step="1"
                value={newAmortYears}
                onChange={(e) => setNewAmortYears(e.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Term to compare (years)">
              <input
                type="number"
                step="1"
                value={termYears}
                onChange={(e) => setTermYears(e.target.value)}
                className={inputClass}
              />
              <p className="font-body text-xs text-gray-500 mt-1">
                The comparison window. A 5 year term looks at the next 5 years.
              </p>
            </Field>

            <Money label="Equity takeout (optional)" value={equityTakeout} onChange={setEquityTakeout} />

            <Field label="New monthly payment" className="sm:col-span-2">
              <input
                type="text"
                readOnly
                value={money2(result.newPayment)}
                className={`${inputClass} bg-gray-50 text-gray-700`}
              />
              <p className="font-body text-xs text-gray-500 mt-1">
                New balance: <span className="font-medium text-[#032133]">{money0(result.newPrincipal)}</span>
                {' · '}Loan to value: <span className="font-medium text-[#032133]">{pct(result.newLtv)}</span>
              </p>
            </Field>
          </div>
        </Card>

        {/* Penalty */}
        <Card title="Prepayment penalty" subtitle="The cost to break your current mortgage.">
          <div className="flex gap-1 p-1 bg-gray-100 rounded-lg mb-4 max-w-sm">
            {(['manual', 'estimate'] as PenaltyMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPenaltyMode(m)}
                className={`flex-1 px-3 py-2 rounded-md font-body text-sm transition ${
                  penaltyMode === m
                    ? 'bg-white text-[#032133] font-medium shadow-sm'
                    : 'bg-transparent text-gray-600 hover:text-[#032133]'
                }`}
              >
                {m === 'manual' ? 'Enter exact amount' : 'Estimate from lender'}
              </button>
            ))}
          </div>

          {penaltyMode === 'manual' ? (
            <Field label="Penalty from your commitment letter">
              <div className="relative max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={manualPenalty}
                  onChange={(e) => setManualPenalty(e.target.value)}
                  className={`${inputClass} pl-7`}
                />
              </div>
              <p className="font-body text-xs text-gray-500 mt-1">
                Best when your lender gave you an exact figure.
              </p>
            </Field>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Lender" className="sm:col-span-2">
                <select
                  value={penLenderSlug}
                  onChange={(e) => setPenLenderSlug(e.target.value)}
                  className={`${inputClass} bg-white`}
                >
                  {lenders.map((l) => (
                    <option key={l.slug} value={l.slug}>{l.name}</option>
                  ))}
                </select>
                <p className="font-body text-xs text-gray-500 mt-1">
                  Penalty rule follows your current rate type: {currentRateType}.
                </p>
              </Field>

              <Field label="Months left on current term">
                <input
                  type="number"
                  step="1"
                  value={penMonthsRemaining}
                  onChange={(e) => setPenMonthsRemaining(e.target.value)}
                  className={inputClass}
                />
              </Field>

              {currentRateType === 'fixed' && (
                <>
                  <Field
                    label="Posted rate when you signed (%)"
                    action={
                      <button
                        type="button"
                        onClick={lookupPosted}
                        className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition"
                      >
                        Look up
                      </button>
                    }
                  >
                    <input
                      type="number"
                      step="0.01"
                      value={penPosted}
                      onChange={(e) => setPenPosted(e.target.value)}
                      className={inputClass}
                    />
                    {penPostedNote && (
                      <p className={`font-body text-xs mt-1 ${noteTone(penPostedNote.tone)}`}>{penPostedNote.msg}</p>
                    )}
                  </Field>

                  <Field
                    label="Posted rate today (%)"
                    action={
                      <button
                        type="button"
                        onClick={lookupComparable}
                        className="text-[10px] px-2 py-0.5 rounded font-body font-medium text-[#032133] bg-[#95D600]/20 hover:bg-[#95D600]/40 transition"
                      >
                        Look up
                      </button>
                    }
                  >
                    <input
                      type="number"
                      step="0.01"
                      value={penComparable}
                      onChange={(e) => setPenComparable(e.target.value)}
                      className={inputClass}
                    />
                    {penComparableNote && (
                      <p className={`font-body text-xs mt-1 ${noteTone(penComparableNote.tone)}`}>{penComparableNote.msg}</p>
                    )}
                  </Field>
                </>
              )}

              <div className="sm:col-span-2 rounded-lg border-2 border-[#95D600] bg-[#95D600]/10 p-4">
                <div className="font-body text-xs uppercase tracking-wider text-[#032133]/70 font-medium mb-1">
                  Estimated penalty
                </div>
                <div className="font-heading text-2xl text-[#032133] tabular-nums">
                  {money2(penaltyValue)}
                </div>
                {penaltyMethodNote && (
                  <div className="font-body text-xs text-[#032133]/70 mt-1">{penaltyMethodNote}</div>
                )}
              </div>
            </div>
          )}

          {/* Estimate-only disclaimer, carried verbatim from /penalty */}
          <div className="rounded-lg border-l-4 border-[#95D600] bg-[#95D600]/10 px-4 py-3 mt-4">
            <p className="font-body text-xs text-[#032133] leading-relaxed">
              <span className="font-medium">Estimate only.</span> For exact penalty figures, ask the client for their original mortgage commitment letter so we can use the actual posted rate at funding. Lender-specific rounding and amortization adjustments may move the final number by a few hundred dollars.
            </p>
          </div>
        </Card>

        {/* Other costs */}
        <Card title="Refinancing costs" subtitle="What it costs to make the switch.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Money label="Legal fees" value={legalFee} onChange={setLegalFee} />
            <Money label="Discharge fee" value={dischargeFee} onChange={setDischargeFee} />
            <Money label="Appraisal" value={appraisalFee} onChange={setAppraisalFee} />
            <Money label="Other costs" value={otherCosts} onChange={setOtherCosts} />
            <Money label="Lender credit (reduces cost)" value={lenderCredit} onChange={setLenderCredit} />
            <div className="flex items-end">
              <label className="flex items-center gap-2 font-body text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rollIntoMortgage}
                  onChange={(e) => setRollIntoMortgage(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-[#032133] focus:ring-[#032133]/30"
                />
                Roll costs into the new mortgage
              </label>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <MiniStat label="Total costs" value={money0(result.totalCosts)} />
            <MiniStat label="Cash needed at closing" value={money0(result.outOfPocket)} />
            <MiniStat label="Rolled into mortgage" value={money0(result.financedCosts)} />
          </div>
        </Card>

        {/* Current Debts */}
        <Card title="Current debts" subtitle="Add high-interest debts to find what folding them in does.">
          <DebtsPanel debts={debts} addDebt={addDebt} removeDebt={removeDebt} updateDebt={updateDebt} />
        </Card>
      </div>

      {/* ===== Consolidation results + honest caveat (shown in the report too) ===== */}
      {result.consolidation?.hasConsolidation && (
        <ConsolidationResults result={result} />
      )}

      {/* ===== Break-even chart ===== */}
      <Card title="When you break even" subtitle="The month your savings pay back the cost.">
        <BreakEvenChart result={result} />
      </Card>

      {/* ===== Four difference cards ===== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <DiffCard
          label="Interest over the term"
          value={signedMoney0(result.interestSavedOverTerm)}
          good={result.interestSavedOverTerm >= 0}
          note="Less interest paid across the comparison window."
        />
        <DiffCard
          label="Monthly payment"
          value={signedMoney0(-result.monthlyPaymentChange)}
          good={result.monthlySaving >= 0}
          note={result.monthlySaving >= 0 ? 'Lower payment each month.' : 'Higher payment each month.'}
        />
        <DiffCard
          label="Balance at end of term"
          value={signedMoney0(result.balanceDifferenceAtTermEnd)}
          good={result.balanceDifferenceAtTermEnd >= 0}
          note="How much less you owe at the end."
        />
        <DiffCard
          label="Time to mortgage free"
          value={monthsToYM(result.timeToMortgageFreeSavedMonths) + ' sooner'}
          good={result.timeToMortgageFreeSavedMonths >= 0}
          note="If you keep paying your current payment."
        />
      </div>

      {/* ===== Monthly savings schedule ===== */}
      <Card title="Monthly savings schedule" subtitle="Your position month by month.">
        <ScheduleTable result={result} />
      </Card>

      {/* Create report */}
      <div className="flex justify-end print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="px-5 py-2.5 rounded-lg font-body text-sm font-medium text-[#032133] bg-[#95D600] hover:bg-[#aae620] transition"
        >
          Create report
        </button>
      </div>

      {/* Full disclaimer, carried from /penalty */}
      <div className="font-body text-xs text-gray-500 leading-relaxed space-y-2">
        <p>
          <span className="font-medium text-gray-700">Disclaimer:</span> This calculator is for illustrative purposes only and should not be relied upon for financial planning. Actual penalties depend on lender-specific calculations and rate changes daily. The estimate does not include reinvestment fees, discharge fees, assignment fees, or other administrative costs. The simplified IRD method does not factor in amortization or present value, which means estimated figures may differ from the lender’s final payout statement.
        </p>
      </div>
    </div>
  )
}

/* ---------- result blocks ---------- */

function ResultsSummary({ result }: { result: ReturnType<typeof analyzeRefinance> }) {
  const consolidating = !!result.consolidation?.hasConsolidation
  const eff = result.effectiveMonthlySaving
  const isWin = eff > 0
  return (
    <div className="rounded-2xl border-2 border-[#032133] bg-[#032133] p-6">
      <div className="font-body text-xs uppercase tracking-wider text-[#95D600] font-medium mb-4">
        Your results
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <SummaryStat
          label={consolidating ? 'Monthly cash freed up' : isWin ? 'Monthly savings' : 'Monthly increase'}
          value={money0(Math.abs(eff))}
          accent
        />
        <SummaryStat
          label="Break even"
          value={result.breakEvenMonths == null ? 'No break even' : monthsToYM(result.breakEvenMonths)}
        />
        {consolidating && result.consolidation ? (
          <SummaryStat label="Debt eliminated" value={money0(result.consolidation.consolidatedBalance)} />
        ) : (
          <SummaryStat label="Net benefit over term" value={signedMoney0(result.netBenefitOverTerm)} />
        )}
        <SummaryStat label="Balance at end of term" value={money0(result.newBalanceAtTermEnd)} />
      </div>
      {consolidating && (
        <p className="font-body text-xs text-white/70 mt-3">
          That&rsquo;s your mortgage payment change plus the debt payments that go away.
        </p>
      )}
    </div>
  )
}

function SummaryStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div className="font-body text-[11px] uppercase tracking-wider text-white/60 font-medium mb-1">
        {label}
      </div>
      <div className={`font-heading tabular-nums ${accent ? 'text-[#95D600] text-3xl' : 'text-white text-2xl'}`}>
        {value}
      </div>
    </div>
  )
}

function BreakEvenChart({ result }: { result: ReturnType<typeof analyzeRefinance> }) {
  const W = 800
  const H = 300
  const padL = 56
  const padR = 16
  const padT = 16
  const padB = 36
  const rows = result.schedule
  if (rows.length === 0) {
    return <p className="font-body text-sm text-gray-500">Enter a term to see the chart.</p>
  }

  const xs = rows.map((r) => r.month)
  const ys = rows.map((r) => r.netPosition)
  const minY = Math.min(0, ...ys)
  const maxY = Math.max(0, ...ys)
  const maxX = Math.max(...xs)
  const spanY = maxY - minY || 1

  const px = (m: number) => padL + ((m - 0) / (maxX || 1)) * (W - padL - padR)
  const py = (v: number) => padT + (1 - (v - minY) / spanY) * (H - padT - padB)

  const linePath = rows.map((r, i) => `${i === 0 ? 'M' : 'L'}${px(r.month).toFixed(1)},${py(r.netPosition).toFixed(1)}`).join(' ')
  const areaPath =
    `M${px(rows[0].month).toFixed(1)},${py(0).toFixed(1)} ` +
    rows.map((r) => `L${px(r.month).toFixed(1)},${py(r.netPosition).toFixed(1)}`).join(' ') +
    ` L${px(rows[rows.length - 1].month).toFixed(1)},${py(0).toFixed(1)} Z`

  const zeroY = py(0)
  const be = result.breakEvenMonths

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Break-even chart">
        {/* zero line */}
        <line x1={padL} y1={zeroY} x2={W - padR} y2={zeroY} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="4 4" />
        <text x={padL - 8} y={zeroY + 4} textAnchor="end" className="fill-gray-400" fontSize="11">$0</text>
        {/* shaded net position */}
        <path d={areaPath} fill="#95D600" fillOpacity="0.12" />
        {/* line */}
        <path d={linePath} fill="none" stroke="#032133" strokeWidth="2.5" />
        {/* break-even marker */}
        {be != null && (
          <>
            <line x1={px(be)} y1={padT} x2={px(be)} y2={H - padB} stroke="#95D600" strokeWidth="1.5" strokeDasharray="3 3" />
            <circle cx={px(be)} cy={py(0)} r="5" fill="#95D600" stroke="#032133" strokeWidth="1.5" />
            <text
              x={px(be)}
              y={padT + 12}
              textAnchor={be > maxX * 0.7 ? 'end' : 'start'}
              className="fill-[#032133] font-semibold"
              fontSize="12"
              dx={be > maxX * 0.7 ? -6 : 6}
            >
              Break even at {monthsToYM(be)}
            </text>
          </>
        )}
        {/* x ticks (yearly) */}
        {Array.from({ length: Math.floor(maxX / 12) + 1 }, (_, i) => i * 12).filter((m) => m > 0).map((m) => (
          <text key={m} x={px(m)} y={H - padB + 18} textAnchor="middle" className="fill-gray-400" fontSize="11">
            {m / 12}y
          </text>
        ))}
      </svg>
      <p className="font-body text-xs text-gray-500 mt-2">
        The line is your running savings after costs. Once it crosses $0, the refinance has paid for itself.
      </p>
    </div>
  )
}

function ScheduleTable({ result }: { result: ReturnType<typeof analyzeRefinance> }) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200">
      <table className="w-full text-left font-body text-sm tabular-nums">
        <thead className="sticky top-0 bg-gray-50 text-gray-500">
          <tr className="text-[11px] uppercase tracking-wider">
            <th className="px-3 py-2 font-medium">Month</th>
            <th className="px-3 py-2 font-medium text-right">Saving</th>
            <th className="px-3 py-2 font-medium text-right">Running total</th>
            <th className="px-3 py-2 font-medium text-right">After costs</th>
            <th className="px-3 py-2 font-medium text-right hidden sm:table-cell">New balance</th>
          </tr>
        </thead>
        <tbody>
          {result.schedule.map((r) => {
            const isBE = result.breakEvenMonths === r.month
            return (
              <tr
                key={r.month}
                className={`border-t border-gray-100 ${isBE ? 'bg-[#95D600]/15' : ''}`}
              >
                <td className="px-3 py-1.5 text-gray-700">
                  {r.month}
                  {isBE && <span className="ml-1 text-[10px] font-medium text-[#032133]">break even</span>}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-700">{money0(r.monthlySaving)}</td>
                <td className="px-3 py-1.5 text-right text-gray-700">{money0(r.cumulativeSaving)}</td>
                <td className={`px-3 py-1.5 text-right font-medium ${r.netPosition >= 0 ? 'text-green-700' : 'text-gray-500'}`}>
                  {r.netPosition >= 0 ? '+' : '-'}{money0(Math.abs(r.netPosition)).replace('-', '')}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-500 hidden sm:table-cell">{money0(r.newBalance)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/* ---------- small primitives ---------- */

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6">
      <div className="mb-4">
        <h3 className="font-heading text-base text-[#032133]">{title}</h3>
        {subtitle && <p className="font-body text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
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

function Money({ label, value, onChange, className }: { label: string; value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Field label={label} className={className}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${inputClass} pl-7`}
        />
      </div>
    </Field>
  )
}

function RateField({
  label,
  rate,
  onRate,
  type,
  onType,
}: {
  label: string
  rate: string
  onRate: (v: string) => void
  type: RefiRateType
  onType: (t: RefiRateType) => void
}) {
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="number"
            step="0.01"
            value={rate}
            onChange={(e) => onRate(e.target.value)}
            className={`${inputClass} pr-7`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
        </div>
        <select
          value={type}
          onChange={(e) => onType(e.target.value as RefiRateType)}
          className="px-2 py-2 border border-gray-300 rounded-md font-body text-sm bg-white"
        >
          <option value="fixed">Fixed</option>
          <option value="variable">Variable</option>
        </select>
      </div>
    </Field>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <div className="font-body text-[10px] uppercase tracking-wider text-gray-500 font-medium mb-1">{label}</div>
      <div className="font-heading text-base text-[#032133] tabular-nums">{value}</div>
    </div>
  )
}

function DiffCard({ label, value, good, note }: { label: string; value: string; good: boolean; note: string }) {
  return (
    <div className={`rounded-xl p-4 border ${good ? 'border-[#95D600] bg-[#95D600]/10' : 'border-gray-200 bg-white'}`}>
      <div className="font-body text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-1">{label}</div>
      <div className={`font-heading text-xl tabular-nums ${good ? 'text-[#032133]' : 'text-gray-700'}`}>{value}</div>
      <div className="font-body text-[11px] text-gray-500 mt-1.5 leading-snug">{note}</div>
    </div>
  )
}

function DebtLabel({ children }: { children: React.ReactNode }) {
  return <div className="font-body text-[11px] text-gray-500 mb-1">{children}</div>
}

function DebtsPanel({
  debts,
  addDebt,
  removeDebt,
  updateDebt,
}: {
  debts: DebtRow[]
  addDebt: () => void
  removeDebt: (id: string) => void
  updateDebt: (id: string, patch: Partial<DebtRow>) => void
}) {
  return (
    <div>
      {debts.length === 0 ? (
        <p className="font-body text-sm text-gray-500">No debts added.</p>
      ) : (
        <div className="space-y-3">
          {debts.map((d) => (
            <div key={d.id} className="rounded-lg border border-gray-200 p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 items-end">
                <div className="col-span-2 sm:col-span-3">
                  <DebtLabel>Label</DebtLabel>
                  <input
                    type="text"
                    value={d.label}
                    placeholder="Visa"
                    onChange={(e) => updateDebt(d.id, { label: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <DebtLabel>Type</DebtLabel>
                  <select
                    value={d.type}
                    onChange={(e) => updateDebt(d.id, { type: e.target.value as DebtType })}
                    className={`${inputClass} bg-white`}
                  >
                    {DEBT_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <DebtLabel>Balance</DebtLabel>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={d.balance}
                      onChange={(e) => updateDebt(d.id, { balance: e.target.value })}
                      className={`${inputClass} pl-7`}
                    />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <DebtLabel>Rate</DebtLabel>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.01"
                      value={d.rate}
                      onChange={(e) => updateDebt(d.id, { rate: e.target.value })}
                      className={`${inputClass} pr-7`}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <DebtLabel>Payment</DebtLabel>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                    <input
                      type="number"
                      value={d.payment}
                      onChange={(e) => updateDebt(d.id, { payment: e.target.value })}
                      className={`${inputClass} pl-7`}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 font-body text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={d.consolidate}
                    onChange={(e) => updateDebt(d.id, { consolidate: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-[#032133] focus:ring-[#032133]/30"
                  />
                  Fold into the mortgage
                </label>
                <button
                  type="button"
                  onClick={() => removeDebt(d.id)}
                  aria-label="Remove debt"
                  className="font-body text-xs text-gray-400 hover:text-red-600 transition"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={addDebt}
        className="mt-3 px-4 py-2 rounded-lg font-body text-sm font-medium text-[#032133] border border-[#032133]/20 hover:bg-[#032133]/5 transition"
      >
        + Add debt
      </button>
    </div>
  )
}

function ConsolidationResults({ result }: { result: ReturnType<typeof analyzeRefinance> }) {
  const c = result.consolidation
  if (!c || !c.hasConsolidation) return null
  const eff = money0(result.effectiveMonthlySaving)
  const bal = money0(c.consolidatedBalance)
  const rise = money0(c.mortgagePaymentIncreaseFromDebt)
  const saves = money0(Math.abs(c.longRunInterestDelta))
  const adds = money0(c.longRunInterestDelta)
  const standalone = money0(c.standaloneInterestRealistic)
  const intoMortgage = money0(c.consolidatedDebtInterestLifetime)
  const payoff = yearsLabel(c.longestStandalonePayoffMonths)
  return (
    <>
      <Card title="Debt consolidation" subtitle="Fold the debt in, free up cash, and clear it for good.">
        {/* Headline: the cash-flow win and the debt is gone */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <MiniStat label="Monthly cash freed up" value={eff} />
          <MiniStat label="Debt eliminated" value={bal} />
          <MiniStat label="Mortgage payment rises by" value={rise} />
        </div>

        {/* Expected mechanics, stated plainly */}
        <p className="font-body text-sm text-gray-600 leading-relaxed mt-4">
          Folding {bal} of debt into the mortgage is the trade. Your mortgage balance goes up by that
          much, so the payment rises about {rise} a month. In return the debt is gone and you free up
          about {eff} a month.
        </p>

        {/* Long-run interest on a realistic basis */}
        {!c.allDebtsClear ? (
          <div className="rounded-lg border-l-4 border-[#95D600] bg-[#95D600]/10 px-4 py-3 mt-4">
            <p className="font-body text-sm text-[#032133] leading-relaxed">
              At that payment, this debt barely shrinks on its own, so it would take a very long time
              to clear. Folding it into the mortgage clearly comes out ahead on interest too.
            </p>
          </div>
        ) : c.longRunInterestDelta < 0 ? (
          <div className="rounded-lg border-l-4 border-[#95D600] bg-[#95D600]/10 px-4 py-3 mt-4">
            <p className="font-body text-sm text-[#032133] leading-relaxed">
              {c.allRevolving ? 'On the minimum payment, this' : 'Carried on its own, this'} debt would
              take about {payoff} to clear and cost about {standalone} in interest. Folded into the
              mortgage it costs about {intoMortgage}. So consolidating also saves you roughly {saves} in
              interest over time.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border-l-4 border-[#95D600] bg-[#95D600]/10 px-4 py-3 mt-4">
            <p className="font-body text-sm text-[#032133] leading-relaxed">
              Folding this in adds about {adds} in interest over time, unless you keep your payment.
              {result.acceleration?.available && <> See &ldquo;Keep your payment&rdquo; below.</>}
            </p>
          </div>
        )}
      </Card>

      {result.acceleration?.available && <StrategicDirections result={result} />}
    </>
  )
}

function StrategicDirections({ result }: { result: ReturnType<typeof analyzeRefinance> }) {
  const a = result.acceleration
  if (!a || !a.available) return null
  const freed = money0(a.freedCashFlow)
  const keep = money0(a.keepPaymentAmount)
  const sooner = yearsLabel(a.monthsSaved)
  const interestSaved = money0(a.interestSaved)
  return (
    <Card title="Two ways to play it" subtitle="Pick the direction that fits your goals.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="font-body text-[11px] uppercase tracking-wider text-gray-500 font-medium mb-1">
            Free up cash
          </div>
          <div className="font-heading text-2xl text-[#032133] tabular-nums">
            {freed}
            <span className="text-base text-gray-500">/mo</span>
          </div>
          <p className="font-body text-sm text-gray-600 leading-relaxed mt-2">
            Pocket about {freed} a month. Room to breathe now.
          </p>
        </div>
        <div className="rounded-xl border-2 border-[#95D600] bg-[#95D600]/10 p-5">
          <div className="font-body text-[11px] uppercase tracking-wider text-[#032133]/70 font-medium mb-1">
            Keep your payment
          </div>
          <div className="font-heading text-2xl text-[#032133] tabular-nums">
            {keep}
            <span className="text-base text-gray-500">/mo</span>
          </div>
          <p className="font-body text-sm text-[#032133] leading-relaxed mt-2">
            Hold your payment at about {keep} a month on the new mortgage. The debt is gone, and
            you&rsquo;d be mortgage free about {sooner} sooner, saving about {interestSaved} in interest.
          </p>
        </div>
      </div>
    </Card>
  )
}
