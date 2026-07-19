'use client'

// The client's "Can I afford it?" section (B9). The one interactive surface on
// the client page: the client moves the price, down payment, taxes, and condo
// fees, and watches the numbers move. Everything is computed in the browser by
// lib/qualification.ts — the SAME engine the site's public calculators use,
// never re-derived here.
//
// THE LAW: this surface never tells a person no. The band is always information
// plus an invitation. The band copy and boundaries live in config/qualification.ts
// so they are swept for never-says-no and edited in one place.
//
// Brand, not admin tokens: no lime here (the page's one lime is the Call button).
// The band cards use the same green / amber / navy swatches as the offer grade.
// Both widths: a single column on the phone, controls beside the result on a
// laptop.

import { useState } from 'react'
import { CONTACT } from '@/lib/contact'
import { computeQualification, type QualificationBaseline } from '@/lib/qualification'
import { QUALIFICATION_COPY, QUALIFICATION_FOOTER, BAND1_GDS_MAX, BAND1_TDS_MAX, BAND2_MAX, BAND3_MAX } from '@/config/qualification'

const CARD = 'rounded-2xl border border-navy/10 bg-white p-6 md:p-7'
const CARD_LABEL = 'font-heading text-xs font-bold uppercase tracking-wider text-navy/50'

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-CA')}`
}
function pct(ratio: number): string {
  // ASCII fallback only (never an em dash on a client surface). Unreachable while
  // income is positive, which a published baseline always is, but kept clean.
  if (!Number.isFinite(ratio)) return '-'
  return `${(ratio * 100).toFixed(1)}%`
}
function yearsWords(months: number): string {
  const y = months / 12
  return Number.isInteger(y) ? `${y} years` : `${months} months`
}

const BAR_MAX = 70 // the bars top out at 70 percent; the number shown is always exact

// The band swatches — the same three the offer grade uses on this page.
const TONE: Record<'green' | 'amber' | 'navy', string> = {
  green: 'bg-[#E6F4D6] text-[#3D5314]',
  amber: 'bg-[#FBEFD6] text-[#7A5A12]',
  navy: 'bg-navy text-white',
}
const FILL: Record<'green' | 'amber' | 'navy', string> = {
  green: 'bg-[#7EA63B]',
  amber: 'bg-[#D9A441]',
  navy: 'bg-navy',
}

export default function QualificationExplorer({ baseline }: { baseline: QualificationBaseline }) {
  const [price, setPrice] = useState(baseline.defaultPrice)
  const [downPayment, setDownPayment] = useState(baseline.defaultDownPayment)
  const [propertyTaxMonthly, setPropertyTax] = useState(baseline.defaultPropertyTaxMonthly)
  const [condoMonthly, setCondo] = useState(baseline.defaultCondoMonthly)

  const result = computeQualification(baseline, { price, downPayment, propertyTaxMonthly, condoMonthly })
  const tone = result.band.tone

  const reset = () => {
    setPrice(baseline.defaultPrice)
    setDownPayment(baseline.defaultDownPayment)
    setPropertyTax(baseline.defaultPropertyTaxMonthly)
    setCondo(baseline.defaultCondoMonthly)
  }

  return (
    <section className="mt-4">
      <p className={`${CARD_LABEL} px-1`}>{QUALIFICATION_COPY.sectionTitle}</p>
      <p className="mt-1 px-1 font-body text-sm leading-relaxed text-navy/60">{QUALIFICATION_COPY.sectionIntro}</p>

      <div className="mt-3 md:grid md:grid-cols-2 md:gap-5">
        {/* ── Controls + the locked panel ── */}
        <div className={CARD}>
          <SliderField
            label={QUALIFICATION_COPY.controls.price.label}
            helper={QUALIFICATION_COPY.controls.price.helper}
            value={price}
            display={money(price)}
            min={100000}
            max={2000000}
            step={5000}
            onChange={v => {
              // Floor the typed price to the slider minimum so a cleared field
              // never drives a $0 mortgage; keep the down payment within it.
              const p = Math.max(v, 100000)
              setPrice(p)
              if (downPayment > p) setDownPayment(p)
            }}
          />
          <SliderField
            label={QUALIFICATION_COPY.controls.downPayment.label}
            helper={QUALIFICATION_COPY.controls.downPayment.helper}
            value={downPayment}
            display={`${money(downPayment)} · ${price > 0 ? Math.round((downPayment / price) * 100) : 0}%`}
            min={0}
            max={price}
            step={1000}
            // Cap a typed down payment at the price (the slider path is already
            // capped); a down payment above the price is never a real input.
            onChange={v => setDownPayment(Math.min(v, price))}
          />

          {result.belowMinimumDown && (
            <p className="mt-2 rounded-xl bg-[#FBEFD6] p-3 font-body text-sm leading-relaxed text-[#7A5A12]">
              {QUALIFICATION_COPY.minimumDownLead} {money(result.minimumDown)}.
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-4">
            <NumberField
              label={QUALIFICATION_COPY.controls.propertyTax.label}
              value={propertyTaxMonthly}
              onChange={setPropertyTax}
            />
            <NumberField
              label={QUALIFICATION_COPY.controls.condo.label}
              value={condoMonthly}
              onChange={setCondo}
            />
          </div>
          <p className="mt-1.5 font-body text-xs leading-relaxed text-navy/45">
            {QUALIFICATION_COPY.controls.propertyTax.helper}
          </p>
          <p className="mt-1 font-body text-xs leading-relaxed text-navy/45">
            {QUALIFICATION_COPY.controls.condo.helper}
          </p>

          {/* The locked panel, read-only. */}
          <div className="mt-5 rounded-xl bg-[#F4F7F9] p-4">
            <p className={CARD_LABEL}>{QUALIFICATION_COPY.lockedTitle}</p>
            <dl className="mt-2.5 flex flex-col gap-1.5">
              <LockedLine label={QUALIFICATION_COPY.locked.income} value={money(baseline.annualIncome)} />
              <LockedLine label={QUALIFICATION_COPY.locked.debts} value={`${money(baseline.monthlyDebts)} a month`} />
              <LockedLine label={QUALIFICATION_COPY.locked.heat} value={`${money(baseline.heatMonthly)} a month`} />
              <LockedLine label={QUALIFICATION_COPY.locked.contractRate} value={`${baseline.contractRatePct.toFixed(2)}%`} />
              <LockedLine label={QUALIFICATION_COPY.locked.stressRate} value={`${result.qualifyingRatePct.toFixed(2)}%`} />
              <LockedLine label={QUALIFICATION_COPY.locked.amortization} value={yearsWords(baseline.amortizationMonths)} />
            </dl>
          </div>

          <button
            type="button"
            onClick={reset}
            className="mt-3 font-body text-xs font-semibold text-navy/50 underline underline-offset-2 hover:text-navy"
          >
            {QUALIFICATION_COPY.reset}
          </button>
        </div>

        {/* ── The live result ── */}
        <div className={`${CARD} mt-4 md:mt-0`}>
          <div className="flex items-baseline justify-between gap-3">
            <p className={CARD_LABEL}>{QUALIFICATION_COPY.mortgageLabel}</p>
            <p className="font-heading text-lg font-bold tabular-nums text-navy">{money(result.mortgage)}</p>
          </div>
          <p className="mt-0.5 font-body text-sm tabular-nums text-navy/60">
            About {money(result.contractPaymentMonthly)} a month
          </p>
          {result.insured && (
            <p className="mt-1 font-body text-xs leading-relaxed text-navy/45">{QUALIFICATION_COPY.insuredNote}</p>
          )}

          <div className="mt-4 flex flex-col gap-4">
            <RatioBar label={QUALIFICATION_COPY.gdsLabel} ratio={result.gds} boundary={BAND1_GDS_MAX} tone={tone} />
            <RatioBar label={QUALIFICATION_COPY.tdsLabel} ratio={result.tds} boundary={BAND1_TDS_MAX} tone={tone} />
          </div>

          <div className={`mt-4 rounded-xl p-5 ${TONE[tone]}`}>
            <p className="font-heading text-base font-bold md:text-lg">{result.band.headline}</p>
            <p className="mt-1.5 font-body text-sm leading-relaxed">{result.band.blurb}</p>
            {/* Every band carries the booking link. Falls back to a call if the
                booking URL is ever unset (no dead link ever reaches a client). */}
            <a
              href={CONTACT.bookingUrl || CONTACT.phone.href}
              {...(CONTACT.bookingUrl ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className={`mt-3 inline-block rounded-lg px-4 py-2 font-heading text-sm font-bold ${
                tone === 'navy' ? 'bg-white text-navy' : 'bg-navy text-white'
              }`}
            >
              Talk with Michael
            </a>
          </div>

          <p className="mt-3 font-body text-xs leading-relaxed text-navy/45">{QUALIFICATION_FOOTER}</p>
        </div>
      </div>
    </section>
  )
}

function SliderField({
  label,
  helper,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  helper: string
  value: number
  display: string
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <div className="mt-1 first:mt-0 [&:not(:first-child)]:mt-4">
      <div className="flex items-baseline justify-between gap-3">
        <label className="font-heading text-sm font-bold text-navy">{label}</label>
        <span className="font-heading text-sm font-bold tabular-nums text-navy">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(Math.max(value, min), max)}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 w-full accent-navy"
      />
      <div className="mt-1 flex items-center gap-2">
        <span className="font-body text-xs text-navy/40">$</span>
        <input
          type="number"
          value={value}
          min={min}
          onChange={e => onChange(clampNumber(e.target.value))}
          aria-label={`${label} amount`}
          className="w-full rounded-lg border border-navy/15 px-2.5 py-1.5 font-body text-sm tabular-nums text-navy"
        />
      </div>
      <p className="mt-1 font-body text-xs leading-relaxed text-navy/45">{helper}</p>
    </div>
  )
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-heading text-sm font-bold text-navy">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-body text-xs text-navy/40">$</span>
        <input
          type="number"
          value={value}
          min={0}
          onChange={e => onChange(clampNumber(e.target.value))}
          aria-label={label}
          className="w-full rounded-lg border border-navy/15 px-2.5 py-1.5 font-body text-sm tabular-nums text-navy"
        />
      </div>
    </label>
  )
}

function LockedLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="font-body text-sm text-navy/60">{label}</dt>
      <dd className="font-body text-sm font-semibold tabular-nums text-navy">{value}</dd>
    </div>
  )
}

// A bar for one ratio, with a tick at its green boundary and lighter ticks at
// the stretch marks (48 and 60), so "against its band boundaries" is visible.
function RatioBar({
  label,
  ratio,
  boundary,
  tone,
}: {
  label: string
  ratio: number
  boundary: number
  tone: 'green' | 'amber' | 'navy'
}) {
  const valuePct = Number.isFinite(ratio) ? ratio * 100 : BAR_MAX
  const fillWidth = Math.min(100, (valuePct / BAR_MAX) * 100)
  const tick = (mark: number) => `${Math.min(100, (mark / BAR_MAX) * 100)}%`
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-heading text-sm font-bold text-navy">{label}</span>
        <span className="font-body text-sm tabular-nums text-navy/70">{pct(ratio)} of your income</span>
      </div>
      <div className="relative mt-1.5 h-2.5 w-full rounded-full bg-navy/10">
        <div className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${fillWidth}%` }} />
        {/* The green boundary (39 or 44), then the two stretch marks. */}
        <span aria-hidden className="absolute top-[-2px] h-[calc(100%+4px)] w-0.5 bg-navy/50" style={{ left: tick(boundary) }} />
        <span aria-hidden className="absolute top-0 h-full w-px bg-navy/25" style={{ left: tick(BAND2_MAX) }} />
        <span aria-hidden className="absolute top-0 h-full w-px bg-navy/25" style={{ left: tick(BAND3_MAX) }} />
      </div>
    </div>
  )
}

function clampNumber(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
