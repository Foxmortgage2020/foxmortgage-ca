'use client'

// Rates v2 (Session 5): scenario-driven, three levels, modeled on the
// Lender Spotlight hierarchy but grounded in Fox's audited data. Level 1
// describes the deal and shows which lenders win it (lowest rate first,
// always). Level 2 drills into a lender's matching products. Level 3 shows
// everything the quote row stores plus its approval provenance. Pins feed
// a compare tray and the client PDF.
//
// The whole view state lives in the URL (scenario, level, pins, view), so
// back navigation preserves the scenario, deal rooms prefill by link, and
// every level is reachable without a pointer event (UI test automation
// discipline: automated drivers navigate, they never click live records).
//
// Trust edge: every rate rendered here carries its sheet date; product
// detail links its approval audit entry. Sparse dimensions never silently
// exclude: a quote the data cannot rule out matches with a visible note.

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AMORTIZATIONS,
  INSURANCE_CLASSES,
  OCCUPANCIES,
  PURPOSES,
  TEST_LENDER_SLUG,
  classifyVariant,
  fmtMoneyFull,
  lenderResults,
  ltvPct,
  matchQuote,
  offerFitsScenario,
  scenarioFromParams,
  scenarioMonthlyPayment,
  scenarioToParams,
  summaryLine,
  termLabel,
  type OfferEligibilityShape,
  type Scenario,
} from '@/lib/scenario'
import type { RateQuoteFullRow, SheetProvenance } from '@/lib/underwriting'
import type { KnowledgeOffer } from '@/lib/gates'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import RatesBrowser from '@/components/admin/RatesBrowser'
import { fmtShortDate } from '@/lib/dates'

const MAX_PINS = 3

const PURPOSE_LABEL: Record<string, string> = {
  purchase: 'Purchase',
  transfer: 'Transfer / switch',
  refinance: 'Refinance',
  renewal: 'Renewal',
}
const OCCUPANCY_LABEL: Record<string, string> = {
  owner_occupied: 'Owner occupied',
  rental: 'Rental',
}

interface KnowledgeLenderEntry {
  slug: string
  name: string
  as_of: string | null
  draft?: boolean
  // Published by fox-underwriting micro-session 3 (quote_slugs aliases on
  // the knowledge index). Absent until it ships; the cross-link falls back
  // to exact slug equality and never invents a mapping.
  quote_slugs?: string[]
}

function variantLabel(variant: string | null): string {
  if (!variant) return 'standard'
  return variant.replace(/-/g, ' ').replace('ltv', 'LTV ')
}

export default function RatesScenario({
  quotes,
  provenance,
}: {
  quotes: RateQuoteFullRow[]
  provenance: Record<string, SheetProvenance>
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const scenario = useMemo(() => {
    const raw: Record<string, string | undefined> = {}
    sp.forEach((v, k) => (raw[k] = v))
    return scenarioFromParams(raw)
  }, [sp])

  const view = sp.get('view') === 'table' ? 'table' : 'cards'
  const lenderParam = sp.get('lender')
  const productParam = sp.get('product')
  const fromFile = sp.get('from')
  const pins = useMemo(() => (sp.get('pins') ?? '').split(',').filter(Boolean).slice(0, MAX_PINS), [sp])

  const knowledge = useKnowledgeFetch<{ lenders: KnowledgeLenderEntry[] }>(
    '/api/portal/admin/knowledge/lenders',
  )
  const offersRes = useKnowledgeFetch<{ as_of: string; offers: KnowledgeOffer[] }>(
    '/api/portal/admin/knowledge/offers',
  )
  const knowledgeLenders = knowledge.data?.lenders ?? []
  const offers = offersRes.data?.offers ?? []

  // Exact match or a published alias, never an invented mapping.
  const knowledgeFor = (quoteSlug: string): KnowledgeLenderEntry | null =>
    knowledgeLenders.find(l => l.slug === quoteSlug || l.quote_slugs?.includes(quoteSlug)) ?? null

  const offersFor = (quoteSlug: string) =>
    offers.filter(o => {
      const k = knowledgeFor(quoteSlug)
      if (!k || o.lender !== k.slug) return false
      const eligibility = (o.offer as { eligibility?: OfferEligibilityShape | null })?.eligibility ?? null
      return offerFitsScenario(eligibility, scenario) !== 'ruled_out'
    })

  const results = useMemo(() => lenderResults(quotes, scenario), [quotes, scenario])
  const pinnedQuotes = useMemo(
    () => pins.map(id => quotes.find(q => q.id === id)).filter((q): q is RateQuoteFullRow => Boolean(q)),
    [pins, quotes],
  )

  function navigate(next: Record<string, string | null>, push = false) {
    const params = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k)
      else params.set(k, v)
    }
    const url = `${pathname}?${params.toString()}`
    if (push) router.push(url, { scroll: false })
    else router.replace(url, { scroll: false })
  }

  function setScenario(next: Scenario) {
    const params = new URLSearchParams(sp.toString())
    for (const k of ['purpose', 'occupancy', 'class', 'term', 'amount', 'value', 'am']) params.delete(k)
    for (const [k, v] of Object.entries(scenarioToParams(next))) params.set(k, v)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  function togglePin(id: string) {
    const next = pins.includes(id) ? pins.filter(p => p !== id) : [...pins, id].slice(0, MAX_PINS)
    navigate({ pins: next.length ? next.join(',') : null })
  }

  const pct = ltvPct(scenario)
  const selectCls =
    'w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-body bg-white focus:outline-none focus:border-navy/50'
  const chip = 'text-[11px] font-semibold px-2 py-0.5 rounded-full'

  const level: 'results' | 'lender' | 'product' = productParam ? 'product' : lenderParam ? 'lender' : 'results'
  const detailQuote = productParam ? quotes.find(q => q.id === productParam) ?? null : null

  return (
    <div>
      {fromFile && (
        <div className="mb-4 bg-navy text-white rounded-xl px-4 py-3 text-sm font-body" data-testid="prefill-banner">
          Scenario prefilled from <span className="font-bold">{fromFile}</span>. Prefill only reads
          the file; check every value before relying on results.
        </div>
      )}

      {/* View toggle */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden" role="tablist">
          <button
            onClick={() => navigate({ view: null })}
            className={`px-4 py-2 text-sm font-body font-semibold ${view === 'cards' ? 'bg-navy text-white' : 'bg-white text-navy'}`}
            data-testid="view-cards"
          >
            Scenario
          </button>
          <button
            onClick={() => navigate({ view: 'table' })}
            className={`px-4 py-2 text-sm font-body font-semibold ${view === 'table' ? 'bg-navy text-white' : 'bg-white text-navy'}`}
            data-testid="view-table"
          >
            Table
          </button>
        </div>
        {view === 'cards' && (
          <p className="text-xs text-gray-400 font-body hidden sm:block">
            Every rate shows its sheet date. Lowest rate sorts first, always.
          </p>
        )}
      </div>

      {view === 'table' ? (
        <RatesBrowser quotes={quotes} initialLender={lenderParam ?? undefined} />
      ) : (
        <div className="lg:grid lg:grid-cols-[290px_1fr] lg:gap-5">
          {/* Scenario rail */}
          <ScenarioRail scenario={scenario} setScenario={setScenario} pct={pct} selectCls={selectCls} />

          {/* Results column */}
          <div className="mt-5 lg:mt-0 min-w-0">
            <p className="text-sm font-body font-semibold text-navy bg-lime/20 border border-lime/50 rounded-lg px-3 py-2" data-testid="scenario-summary">
              {summaryLine(scenario)}
            </p>

            {level === 'results' && (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="lender-results">
                {results.length === 0 && (
                  <p className="text-sm text-gray-500 font-body col-span-full bg-white border border-gray-200 rounded-xl p-5">
                    No approved quotes match this scenario. Widen the term or check the insurance
                    class; the table view shows the full approved set.
                  </p>
                )}
                {results.map((r, i) => {
                  const k = knowledgeFor(r.lenderSlug)
                  const lenderOffers = offersFor(r.lenderSlug)
                  return (
                    <button
                      key={r.lenderSlug}
                      onClick={() => navigate({ lender: r.lenderSlug }, true)}
                      className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-navy/40"
                      data-testid={`rate-lender-${r.lenderSlug}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-heading font-bold text-navy">{k?.name ?? r.lenderSlug}</span>
                        {i === 0 && <span className={`${chip} bg-lime text-navy`}>lowest rate</span>}
                      </div>
                      <p className="font-heading text-3xl font-bold text-navy mt-2">
                        {r.lowestRate.toFixed(2)}%
                      </p>
                      <p className="text-xs text-gray-500 font-body mt-1">
                        {r.count} matching product{r.count === 1 ? '' : 's'}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {lenderOffers.map((o, j) => (
                          <span key={j} className={`${chip} bg-amber-100 text-amber-900`}>
                            promo, {o.days_left}d left
                          </span>
                        ))}
                        {r.anyAssumed && (
                          <span
                            className={`${chip} bg-gray-100 text-gray-600`}
                            title="Some matches ride sheets that do not state every scenario dimension. Open the lender to see each note."
                          >
                            includes match-all sheets
                          </span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {level === 'lender' && lenderParam && (
              <LenderLevel
                lenderSlug={lenderParam}
                results={results}
                knowledge={knowledgeFor(lenderParam)}
                offers={offersFor(lenderParam)}
                pins={pins}
                togglePin={togglePin}
                onBack={() => navigate({ lender: null, product: null }, true)}
                onDetail={id => navigate({ product: id }, true)}
                scenario={scenario}
              />
            )}

            {level === 'product' && (
              <ProductLevel
                quote={detailQuote}
                provenance={detailQuote?.approvedVia?.startsWith('sheet:') ? provenance[detailQuote.approvedVia.slice(6)] ?? null : null}
                knowledge={detailQuote ? knowledgeFor(detailQuote.lenderSlug) : null}
                scenario={scenario}
                pins={pins}
                togglePin={togglePin}
                onBack={() => navigate({ product: null }, true)}
              />
            )}
          </div>
        </div>
      )}

      {pinnedQuotes.length > 0 && (
        <CompareTray
          pinned={pinnedQuotes}
          scenario={scenario}
          knowledgeFor={knowledgeFor}
          fromFile={fromFile}
          onUnpin={togglePin}
          onClear={() => navigate({ pins: null })}
        />
      )}
    </div>
  )
}

// ─── Scenario rail ───────────────────────────────────────────────────────────

function ScenarioRail({
  scenario,
  setScenario,
  pct,
  selectCls,
}: {
  scenario: Scenario
  setScenario: (s: Scenario) => void
  pct: number | null
  selectCls: string
}) {
  const [open, setOpen] = useState(true)
  const terms = [12, 24, 36, 48, 60, 84, 120]
  return (
    <div className="bg-white border border-gray-200 rounded-xl lg:self-start" data-testid="scenario-panel">
      <button
        className="w-full flex items-center justify-between px-4 py-3 lg:cursor-default"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <span className="font-heading font-bold text-navy">Describe the deal</span>
        <span className="text-gray-400 text-sm lg:hidden">{open ? 'hide' : 'show'}</span>
      </button>
      <div className={`${open ? 'block' : 'hidden'} lg:block px-4 pb-4 space-y-3`}>
        <Field label="Purpose" tip="Rate sheets do not carry a transaction type; purpose drives promo eligibility and the summary line, never the quote filter.">
          <select
            className={selectCls}
            value={scenario.purpose}
            onChange={e => setScenario({ ...scenario, purpose: e.target.value as Scenario['purpose'] })}
          >
            {PURPOSES.map(p => (
              <option key={p} value={p}>
                {PURPOSE_LABEL[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Occupancy" tip="Only explicitly rental-marked products are excluded from owner-occupied scenarios. Sheets without an occupancy split match every occupancy and say so.">
          <select
            className={selectCls}
            value={scenario.occupancy}
            onChange={e => setScenario({ ...scenario, occupancy: e.target.value as Scenario['occupancy'] })}
          >
            {OCCUPANCIES.map(o => (
              <option key={o} value={o}>
                {OCCUPANCY_LABEL[o]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Insurance class">
          <select
            className={selectCls}
            value={scenario.insuranceClass}
            onChange={e => setScenario({ ...scenario, insuranceClass: e.target.value as Scenario['insuranceClass'] })}
          >
            {INSURANCE_CLASSES.map(c => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Term">
          <select
            className={selectCls}
            value={scenario.termMonths === null ? '' : String(scenario.termMonths)}
            onChange={e =>
              setScenario({ ...scenario, termMonths: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">Any term</option>
            {terms.map(t => (
              <option key={t} value={t}>
                {termLabel(t)} fixed
              </option>
            ))}
          </select>
        </Field>
        <Field label="Mortgage amount">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={selectCls}
            value={scenario.amount ?? ''}
            placeholder="e.g. 928000"
            onChange={e =>
              setScenario({ ...scenario, amount: e.target.value ? Number(e.target.value) : null })
            }
            data-testid="scenario-amount"
          />
        </Field>
        <Field label="Property value">
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={selectCls}
            value={scenario.propertyValue ?? ''}
            placeholder="e.g. 1160000"
            onChange={e =>
              setScenario({ ...scenario, propertyValue: e.target.value ? Number(e.target.value) : null })
            }
            data-testid="scenario-value"
          />
        </Field>
        <div>
          <p className="text-xs font-body font-semibold text-gray-500 mb-1">LTV (computed, locked)</p>
          <div
            className="border border-gray-100 bg-gray-50 rounded-lg px-2.5 py-2 text-sm font-body text-navy font-semibold flex items-center justify-between"
            data-testid="scenario-ltv"
          >
            <span>{pct === null ? 'enter amount and value' : `${pct}%`}</span>
            <span aria-hidden className="text-gray-400">&#128274;</span>
          </div>
          {pct !== null && pct > 80 && scenario.insuranceClass !== 'insured' && (
            <p className="text-[11px] text-amber-700 font-body mt-1">
              LTV above 80 typically means default insured.
            </p>
          )}
        </div>
        <Field label="Amortization">
          <select
            className={selectCls}
            value={String(scenario.amortizationYears)}
            onChange={e =>
              setScenario({ ...scenario, amortizationYears: Number(e.target.value) === 30 ? 30 : 25 })
            }
          >
            {AMORTIZATIONS.map(a => (
              <option key={a} value={a}>
                {a} years
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  )
}

function Field({ label, tip, children }: { label: string; tip?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-body font-semibold text-gray-500 mb-1 flex items-center gap-1">
        {label}
        {tip && (
          <span title={tip} aria-label={tip} className="text-gray-300 cursor-help select-none">
            &#9432;
          </span>
        )}
      </p>
      {children}
    </div>
  )
}

// ─── Level 2 ─────────────────────────────────────────────────────────────────

function LenderLevel({
  lenderSlug,
  results,
  knowledge,
  offers,
  pins,
  togglePin,
  onBack,
  onDetail,
  scenario,
}: {
  lenderSlug: string
  results: ReturnType<typeof lenderResults>
  knowledge: KnowledgeLenderEntry | null
  offers: KnowledgeOffer[]
  pins: string[]
  togglePin: (id: string) => void
  onBack: () => void
  onDetail: (id: string) => void
  scenario: Scenario
}) {
  const r = results.find(x => x.lenderSlug === lenderSlug)
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <button onClick={onBack} className="text-sm font-body font-semibold text-navy underline hover:text-lime">
          &larr; All lenders
        </button>
        {knowledge ? (
          <Link
            href={`/portal/admin/knowledge/${knowledge.slug}`}
            className="text-xs font-body font-semibold text-navy underline hover:text-lime"
          >
            Knowledge page
          </Link>
        ) : (
          <span className="text-xs text-gray-400 font-body" title="No knowledge page matches this quote slug yet. The knowledge index will publish quote slug aliases; the portal never invents the mapping.">
            no knowledge page for this slug yet
          </span>
        )}
      </div>
      <h2 className="font-heading text-navy font-bold text-xl mt-2">{knowledge?.name ?? lenderSlug}</h2>
      {!r || r.matches.length === 0 ? (
        <p className="text-sm text-gray-500 font-body mt-3 bg-white border border-gray-200 rounded-xl p-5">
          No matching products for the current scenario.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {r.matches.map(m => {
            const q = m.quote
            const plusOffer =
              classifyVariant(q.variant).kind === 'mortgage-plus'
                ? offers.find(o => {
                    const req = (o.offer as { eligibility?: { required_product?: string | null } }).eligibility?.required_product
                    return typeof req === 'string' && req.toLowerCase().includes('mortgage plus')
                  })
                : undefined
            const pinned = pins.includes(q.id)
            return (
              <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4" data-testid={`rate-product-${q.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-body font-semibold text-navy capitalize">
                      {q.productClass} &middot; {variantLabel(q.variant)}
                    </p>
                    <p className="text-xs text-gray-500 font-body">{termLabel(q.termMonths)} fixed</p>
                  </div>
                  <p className="font-heading text-2xl font-bold text-navy">{q.rate.toFixed(2)}%</p>
                </div>
                <p className="text-xs text-gray-500 font-body mt-2">
                  sheet {q.asOfDate ? fmtShortDate(q.asOfDate) : 'undated'}
                  {q.compBps !== null ? ` · comp ${q.compBps} bps` : ''}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {plusOffer && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900">
                      promo, {plusOffer.days_left}d left
                    </span>
                  )}
                  {m.assumed.length > 0 && (
                    <span
                      className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 cursor-help"
                      title={m.assumed.join(' ')}
                    >
                      matches all: {m.assumed.length} note{m.assumed.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                {m.assumed.length > 0 && (
                  <p className="text-[11px] text-gray-400 font-body mt-1.5">{m.assumed[0]}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => onDetail(q.id)}
                    className="text-xs font-semibold text-navy underline hover:text-lime py-1.5"
                    data-testid={`detail-${q.id}`}
                  >
                    Details
                  </button>
                  <button
                    onClick={() => togglePin(q.id)}
                    disabled={!pinned && pins.length >= MAX_PINS}
                    className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
                      pinned
                        ? 'bg-navy text-white border-navy'
                        : pins.length >= MAX_PINS
                          ? 'text-gray-300 border-gray-200 cursor-not-allowed'
                          : 'text-navy border-gray-300 hover:border-navy'
                    }`}
                    data-testid={`pin-${q.id}`}
                  >
                    {pinned ? 'Pinned' : pins.length >= MAX_PINS ? 'Pins full' : 'Pin to compare'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <p className="text-[11px] text-gray-400 font-body mt-3">
        Scenario: {summaryLine(scenario)}
      </p>
    </div>
  )
}

// ─── Level 3 ─────────────────────────────────────────────────────────────────

function ProductLevel({
  quote,
  provenance,
  knowledge,
  scenario,
  pins,
  togglePin,
  onBack,
}: {
  quote: RateQuoteFullRow | null
  provenance: SheetProvenance | null
  knowledge: KnowledgeLenderEntry | null
  scenario: Scenario
  pins: string[]
  togglePin: (id: string) => void
  onBack: () => void
}) {
  if (!quote) {
    return (
      <div className="mt-4 bg-white border border-gray-200 rounded-xl p-5">
        <button onClick={onBack} className="text-sm font-body font-semibold text-navy underline">
          &larr; Back
        </button>
        <p className="text-sm text-gray-500 font-body mt-3">This product id is not in the current quote set.</p>
      </div>
    )
  }
  const payment = scenarioMonthlyPayment(scenario, quote.rate)
  const pinned = pins.includes(quote.id)
  const decidedDay = provenance?.decidedAt ? provenance.decidedAt.slice(0, 10) : null
  const rows: [string, string][] = [
    ['Lender', knowledge?.name ?? quote.lenderSlug],
    ['Product class', quote.productClass],
    ['Variant', variantLabel(quote.variant)],
    ['Term', `${termLabel(quote.termMonths)} fixed`],
    ['Rate', `${quote.rate.toFixed(2)}%`],
    ['Compensation', quote.compBps !== null ? `${quote.compBps} bps` : 'not stated on the sheet'],
    ['Sheet date', quote.asOfDate ?? 'undated'],
    ['Sheet expiry', quote.expiryDate ?? 'not stated on the sheet'],
    ['Status', quote.status],
  ]
  const extraction: [string, string][] = [
    ['Source page', String(quote.sourcePage)],
    ['Source snippet', quote.sourceSnippet],
    ['Extraction confidence', String(quote.confidence)],
    ['Extracted by', quote.extractedBy],
    ['Extracted at', fmtShortDate(quote.createdAt)],
  ]
  return (
    <div className="mt-4" data-testid={`product-detail-${quote.id}`}>
      <button onClick={onBack} className="text-sm font-body font-semibold text-navy underline hover:text-lime">
        &larr; Back to {knowledge?.name ?? quote.lenderSlug}
      </button>
      <div className="mt-3 bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-navy font-bold text-xl capitalize">
              {quote.productClass} &middot; {variantLabel(quote.variant)} &middot; {termLabel(quote.termMonths)}
            </h2>
            <p className="text-xs text-gray-500 font-body mt-1">
              from the {quote.asOfDate ? fmtShortDate(quote.asOfDate) : 'undated'} rate sheet
            </p>
          </div>
          <button
            onClick={() => togglePin(quote.id)}
            disabled={!pinned && pins.length >= MAX_PINS}
            className={`shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg border ${
              pinned ? 'bg-navy text-white border-navy' : 'text-navy border-gray-300 hover:border-navy'
            }`}
          >
            {pinned ? 'Pinned' : 'Pin to compare'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 mt-4">
          <Detail rows={rows} title="Rate and dimensions" />
          <Detail rows={extraction} title="Extraction" />
        </div>

        {payment !== null && (
          <p className="text-sm font-body text-navy mt-4 bg-lime/15 border border-lime/40 rounded-lg px-3 py-2">
            {fmtMoneyFull(payment)}/mo at the scenario&apos;s {fmtMoneyFull(scenario.amount!)} over{' '}
            {scenario.amortizationYears} years (semi-annual compounding, the same validated math as
            the public calculators)
          </p>
        )}

        {/* Provenance: the trust edge. */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <h3 className="font-heading text-navy font-bold text-sm">Approval provenance</h3>
          {provenance ? (
            <div className="text-sm font-body text-gray-600 mt-2 space-y-1">
              <p>
                From a rate sheet Michael {provenance.decision === 'approve' ? 'approved' : provenance.decision}{' '}
                through the audited gate on {fmtShortDate(provenance.decidedAt)}
                {provenance.quotesTotal !== null ? ` (${provenance.quotesTotal} quotes on the sheet)` : ''}.
              </p>
              <p className="text-xs text-gray-500">
                Review {provenance.reviewId.slice(0, 8)} &middot; audit entry{' '}
                {provenance.auditEntryId ? (
                  <Link
                    className="underline text-navy hover:text-lime"
                    href={`/portal/admin/audit?action=rates.sheet_approved${decidedDay ? `&from=${decidedDay}&to=${decidedDay}` : ''}`}
                  >
                    {provenance.auditEntryId.slice(0, 8)}
                  </Link>
                ) : (
                  'not found for this sheet'
                )}
              </p>
            </div>
          ) : (
            <p className="text-sm text-gray-500 font-body mt-2">
              {quote.approvedVia
                ? 'The approval review row was not readable just now; the audit log remains the record.'
                : 'This quote predates sheet-level reviews; its approval rides the audit log.'}
            </p>
          )}
          <p className="text-xs font-body mt-2">
            {knowledge ? (
              <Link href={`/portal/admin/knowledge/${knowledge.slug}`} className="underline text-navy hover:text-lime">
                Lender knowledge page{knowledge.as_of ? ` (as of ${knowledge.as_of})` : ''}
              </Link>
            ) : (
              <span className="text-gray-400">
                No knowledge page matches quote slug &quot;{quote.lenderSlug}&quot; yet; the knowledge
                index will publish quote slug aliases.
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

function Detail({ rows, title }: { rows: [string, string][]; title: string }) {
  return (
    <div>
      <h3 className="font-heading text-navy font-bold text-sm mb-2">{title}</h3>
      <dl className="space-y-1.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3">
            <dt className="text-xs text-gray-400 font-body shrink-0">{k}</dt>
            <dd className="text-sm text-navy font-body text-right break-words min-w-0">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

// ─── Compare tray ────────────────────────────────────────────────────────────

function CompareTray({
  pinned,
  scenario,
  knowledgeFor,
  fromFile,
  onUnpin,
  onClear,
}: {
  pinned: RateQuoteFullRow[]
  scenario: Scenario
  knowledgeFor: (slug: string) => KnowledgeLenderEntry | null
  fromFile: string | null
  onUnpin: (id: string) => void
  onClear: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const mintToken = useGatesToken()

  async function downloadPdf() {
    setDownloading(true)
    setPdfError(null)
    try {
      // Browser-minted token (60s, per action) so the route can resolve
      // lender display names from the knowledge index; the PDF still
      // renders with stored slugs when the mint fails.
      const token = await mintToken().catch(() => null)
      const res = await fetch('/api/portal/admin/rates/pdf', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { [GATES_TOKEN_HEADER]: token } : {}),
        },
        body: JSON.stringify({
          scenario: scenarioToParams(scenario),
          pins: pinned.map(q => q.id),
          ...(fromFile ? { from: fromFile } : {}),
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `PDF failed (${res.status})`)
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.headers.get('x-filename') ?? 'rates-comparison.pdf'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setPdfError(e instanceof Error ? e.message : 'PDF failed')
    } finally {
      setDownloading(false)
    }
  }

  const compareRows: [string, (q: RateQuoteFullRow) => string][] = [
    ['Rate', q => `${q.rate.toFixed(2)}%`],
    ['Term', q => `${termLabel(q.termMonths)} fixed`],
    ['Class', q => q.productClass],
    ['Variant', q => variantLabel(q.variant)],
    [
      'Monthly payment',
      q => {
        const p = scenarioMonthlyPayment(scenario, q.rate)
        return p === null ? 'enter an amount' : fmtMoneyFull(p)
      },
    ],
    ['Compensation', q => (q.compBps !== null ? `${q.compBps} bps` : 'not stated')],
    ['Sheet date', q => q.asOfDate ?? 'undated'],
  ]

  return (
    <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3 pointer-events-none">
      <div className="max-w-5xl mx-auto bg-navy text-white rounded-2xl shadow-2xl pointer-events-auto" data-testid="compare-tray">
        <div className="flex items-center justify-between px-4 py-2.5">
          <button onClick={() => setExpanded(e => !e)} className="text-sm font-body font-semibold">
            Compare ({pinned.length}/{MAX_PINS}) {expanded ? '▼' : '▲'}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadPdf}
              disabled={downloading}
              className="text-sm font-bold bg-lime text-navy rounded-lg px-3 py-1.5 disabled:opacity-60"
              data-testid="download-pdf"
            >
              {downloading ? 'Building PDF…' : 'Client PDF'}
            </button>
            <button onClick={onClear} className="text-xs font-body text-white/70 underline py-1.5">
              Clear
            </button>
          </div>
        </div>
        {pdfError && <p className="px-4 pb-2 text-xs text-amber-300 font-body">{pdfError}</p>}
        {expanded && (
          <div className="px-4 pb-4 overflow-x-auto">
            <table className="w-full text-sm font-body min-w-[520px]">
              <thead>
                <tr>
                  <th className="text-left text-[11px] uppercase tracking-wide text-white/50 font-medium py-1.5 w-32"></th>
                  {pinned.map(q => {
                    const k = knowledgeFor(q.lenderSlug)
                    return (
                      <th key={q.id} className="text-left py-1.5 pr-3">
                        <span className="font-bold">{k?.name ?? q.lenderSlug}</span>
                        <button
                          onClick={() => onUnpin(q.id)}
                          className="ml-2 text-[11px] text-white/60 underline"
                          aria-label={`Unpin ${q.lenderSlug}`}
                        >
                          unpin
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {compareRows.map(([label, fn]) => (
                  <tr key={label} className="border-t border-white/10">
                    <td className="py-1.5 text-[11px] uppercase tracking-wide text-white/50">{label}</td>
                    {pinned.map(q => (
                      <td key={q.id} className="py-1.5 pr-3">
                        {fn(q)}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t border-white/10">
                  <td className="py-1.5 text-[11px] uppercase tracking-wide text-white/50">Penalty basis</td>
                  {pinned.map(q => {
                    const k = knowledgeFor(q.lenderSlug)
                    return (
                      <td key={q.id} className="py-1.5 pr-3 text-white/80 text-xs">
                        {k
                          ? `No penalty methodology documented in the knowledge base${k.as_of ? ` (profile as of ${k.as_of})` : ''}.`
                          : 'No knowledge page for this lender yet.'}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-white/50 font-body mt-2">
              Payments use the scenario amount over {scenario.amortizationYears} years, semi-annual
              compounding. Rates are from Michael-approved sheets on their stated dates.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
