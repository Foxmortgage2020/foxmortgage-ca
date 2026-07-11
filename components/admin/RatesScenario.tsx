'use client'

// Rates scenario view (Session 5; floating vocabulary Session 6): three
// levels, modeled on the Lender Spotlight hierarchy but grounded in Fox's
// audited data. Level 1 describes the deal and shows which lenders win it.
// Level 2 drills into a lender's matching products, with promo offers as
// first-class badged results beside the sheet quotes. Level 3 shows
// everything the quote row stores plus its approval provenance. Pins feed
// a compare tray and the client PDF.
//
// The whole view state lives in the URL (scenario, level, pins, view), so
// back navigation preserves the scenario, deal rooms prefill by link, and
// every level is reachable without a pointer event (UI test automation
// discipline: automated drivers navigate, they never click live records).
//
// Floating honesty (Session 6): adjustable and variable render as what
// they are and are never conflated; floating quotes lead with their
// printed discount; the effective rate beside it is computed against the
// served prime (per-lender override first) and labeled with the prime
// as-of it used. When the rates-reference is unreachable the discount
// stands alone with a plain prime-unavailable state. Mechanism
// explanations come from the reference payload, never the sheet label.

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
  AMORTIZATIONS,
  CASHBACK_FILTERS,
  PRODUCT_CLASSES,
  OCCUPANCIES,
  PURPOSES,
  RATE_TYPES,
  RATE_TYPE_LABEL,
  conventionText,
  fmtMoneyFull,
  lenderResults,
  ltvPct,
  mechanismForLender,
  mechanismPending,
  offerScenarioResult,
  productClassLabel,
  quoteEffectiveRate,
  quoteRateDisplay,
  scenarioFromParams,
  scenarioMonthlyPayment,
  scenarioToParams,
  summaryLine,
  termLabel,
  type OfferShape,
  type RatesReference,
  type Scenario,
} from '@/lib/scenario'
import type { RateQuoteFullRow, SheetProvenance } from '@/lib/underwriting'
import type { KnowledgeOffer } from '@/lib/gates'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import { GATES_TOKEN_HEADER, useGatesToken } from '@/lib/gates-token'
import LenderMark from '@/components/admin/LenderMark'
import {
  CashbackChip,
  RateHeadline,
  TypeBadge,
  rateHeadlineText,
  rateLineText,
  rateSubline,
  variantLabel,
} from '@/components/admin/rate-display'
import { lenderDisplayName } from '@/config/lenders'
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
  // quote_slugs aliases published by the knowledge index (fox-underwriting
  // micro-session 3). The cross-link uses exact slug equality or a
  // published alias and never invents a mapping.
  quote_slugs?: string[]
}

// ─── Main component ─────────────────────────────────────────────────────────

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
  const referenceRes = useKnowledgeFetch<RatesReference>(
    '/api/portal/admin/knowledge/rates-reference',
  )
  const knowledgeLenders = knowledge.data?.lenders ?? []
  const offers = offersRes.data?.offers ?? []
  const offersAsOf = offersRes.data?.as_of ?? null
  const reference = referenceRes.data ?? null
  const referenceUnavailable = !referenceRes.loading && reference === null

  // Exact match or a published alias, never an invented mapping.
  const knowledgeFor = (quoteSlug: string): KnowledgeLenderEntry | null =>
    knowledgeLenders.find(l => l.slug === quoteSlug || l.quote_slugs?.includes(quoteSlug)) ?? null

  const offersFor = (quoteSlug: string) =>
    offers.filter(o => {
      const k = knowledgeFor(quoteSlug)
      if (!k || o.lender !== k.slug) return false
      // Chip logic: anything not ruled out shows a chip. First-class
      // results additionally need structured rate tiers (offerScenarioResult).
      const shape = o.offer as OfferShape
      return offerScenarioResult(shape, scenario) !== null || !shape.eligibility
    })

  const results = useMemo(() => lenderResults(quotes, scenario, reference), [quotes, scenario, reference])
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
    // Drill-ins (push) scroll to the top of the new level so the interaction
    // reads as a clean navigation. Part 0 fix: the previous scroll:false on a
    // push meant clicking a card below the fold swapped in the shorter lender
    // view without moving the viewport, so the drill-in read as "nothing
    // happened". Filter changes (replace) still hold the scroll.
    if (push) router.push(url)
    else router.replace(url, { scroll: false })
  }

  // Recall a saved scenario: apply its params fresh at level 1 (drop any open
  // lender/product/pins), keep the active tab, restore its source file.
  const recallScenario = useCallback(
    (paramsQuery: string, savedFrom: string | null) => {
      const params = new URLSearchParams()
      const tab = sp.get('tab')
      if (tab) params.set('tab', tab)
      new URLSearchParams(paramsQuery).forEach((v, k) => params.set(k, v))
      if (savedFrom) params.set('from', savedFrom)
      router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, sp],
  )

  function setScenario(next: Scenario) {
    const params = new URLSearchParams(sp.toString())
    for (const k of ['purpose', 'occupancy', 'class', 'term', 'rt', 'cb', 'amount', 'value', 'am']) params.delete(k)
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

      {/* Saved scenarios: name and recall the shapes Michael runs often. */}
      <SavedScenariosBar
        currentParams={new URLSearchParams(scenarioToParams(scenario)).toString()}
        currentFrom={fromFile}
        onRecall={recallScenario}
      />

      {/* Prime status: the label every computed effective rate leans on. */}
      <div className="mb-4" data-testid="prime-status">
        {reference?.prime ? (
          <p className="text-xs text-gray-500 font-body">
            Prime {reference.prime.value.toFixed(2)}% as of {reference.prime.as_of}
            {reference.lender_overrides && Object.keys(reference.lender_overrides).length > 0
              ? `, with ${Object.keys(reference.lender_overrides).length} lender override${
                  Object.keys(reference.lender_overrides).length === 1 ? '' : 's'
                }`
              : ''}
            . Effective rates for floating quotes are computed against this prime at display time.
          </p>
        ) : referenceUnavailable ? (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <p className="text-xs text-amber-800 font-body">
              Prime reference unavailable right now. Floating quotes show their discount alone, and no
              effective rate or floating payment renders until it loads.
            </p>
            <button onClick={referenceRes.retry} className="shrink-0 text-xs font-semibold text-amber-800 underline py-1.5">
              Retry
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 font-body">Loading prime reference…</p>
        )}
      </div>

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
                    No approved quotes match this scenario. Widen the term, rate type, or product
                    class; the All quotes tab shows the full approved set.
                  </p>
                )}
                {results.map((r, i) => {
                  const k = knowledgeFor(r.lenderSlug)
                  const lenderOffers = offersFor(r.lenderSlug)
                  return (
                    <button
                      key={r.lenderSlug}
                      onClick={() => navigate({ lender: r.lenderSlug }, true)}
                      className="group text-left bg-white border border-gray-200 rounded-xl p-4 cursor-pointer transition hover:border-navy hover:shadow-md focus:outline-none focus:ring-2 focus:ring-navy/30"
                      data-testid={`rate-lender-${r.lenderSlug}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <LenderMark slug={r.lenderSlug} name={k?.name} size={26} />
                          <span className="font-heading font-bold text-navy truncate">
                            {k?.name ?? lenderDisplayName(r.lenderSlug)}
                          </span>
                        </span>
                        {i === 0 && <span className={`${chip} bg-lime text-navy shrink-0`}>best rate</span>}
                      </div>
                      {r.headline ? (
                        <div className="mt-2 flex items-end justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-heading text-3xl font-bold text-navy">
                              {rateHeadlineText(r.headline)}
                            </p>
                            {rateSubline(r.headline) && (
                              <p className="text-[11px] text-gray-500 font-body mt-0.5">
                                {rateSubline(r.headline)}
                              </p>
                            )}
                          </div>
                          {(r.headline.kind === 'floating-printed' ||
                            r.headline.kind === 'floating-computed' ||
                            r.headline.kind === 'floating-no-prime') && (
                            <TypeBadge
                              rateType={r.headline.rateType}
                              reference={reference}
                              lenderSlug={r.lenderSlug}
                            />
                          )}
                        </div>
                      ) : (
                        <p className="font-body text-sm text-gray-600 mt-2">
                          cash back tiers only; open the lender for the rows
                        </p>
                      )}
                      <p className="text-xs text-gray-500 font-body mt-1">
                        {r.count} matching product{r.count === 1 ? '' : 's'}
                        {r.cashbackCount > 0
                          ? `, ${r.cashbackCount} cash back tier${r.cashbackCount === 1 ? '' : 's'}`
                          : ''}
                      </p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {lenderOffers.map((o, j) => {
                          const res = offerScenarioResult(o.offer as OfferShape, scenario)
                          return (
                            <span key={j} className={`${chip} bg-amber-100 text-amber-900`}>
                              {res ? `promo ${res.ratePct.toFixed(2)}%, ` : 'promo, '}
                              {o.days_left}d left
                            </span>
                          )
                        })}
                        {r.anyAssumed && (
                          <span
                            className={`${chip} bg-gray-100 text-gray-600`}
                            title="Some matches ride sheets that do not state every scenario dimension. Open the lender to see each note."
                          >
                            includes match-all sheets
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex items-center gap-1 text-xs font-body font-semibold text-navy/70 group-hover:text-navy">
                        View products
                        <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                          &rsaquo;
                        </span>
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
                offersAsOf={offersAsOf}
                reference={reference}
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
                reference={reference}
                scenario={scenario}
                pins={pins}
                togglePin={togglePin}
                onBack={() => navigate({ product: null }, true)}
              />
            )}
          </div>
        </div>

      {pinnedQuotes.length > 0 && (
        <CompareTray
          pinned={pinnedQuotes}
          scenario={scenario}
          knowledgeFor={knowledgeFor}
          reference={reference}
          fromFile={fromFile}
          onUnpin={togglePin}
          onClear={() => navigate({ pins: null })}
        />
      )}
    </div>
  )
}

// ─── Saved scenarios ─────────────────────────────────────────────────────────
// Michael runs the same handful of shapes repeatedly. Name one and it lands
// here for one-tap recall. Stored per user in FOXCA through narrow functions;
// nothing deletes (retire). Hidden entirely when the store is not configured.

interface SavedRow {
  id: string
  name: string
  params: string
  fromFile: string | null
}

function SavedScenariosBar({
  currentParams,
  currentFrom,
  onRecall,
}: {
  currentParams: string
  currentFrom: string | null
  onRecall: (params: string, fromFile: string | null) => void
}) {
  const [rows, setRows] = useState<SavedRow[]>([])
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/portal/admin/rates/scenarios', { cache: 'no-store' })
      const json = (await res.json().catch(() => null)) as
        | { ok: boolean; configured?: boolean; scenarios?: SavedRow[] }
        | null
      if (json?.ok) {
        setConfigured(json.configured !== false)
        setRows(Array.isArray(json.scenarios) ? json.scenarios : [])
      } else {
        setConfigured(false)
      }
    } catch {
      setConfigured(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function save() {
    const trimmed = name.trim()
    if (!trimmed) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/admin/rates/scenarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'save', name: trimmed, params: currentParams, from: currentFrom }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Save failed (${res.status})`)
      setName('')
      setNaming(false)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function retire(id: string) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/portal/admin/rates/scenarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'retire', id }),
      })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Could not remove (${res.status})`)
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove')
    } finally {
      setBusy(false)
    }
  }

  // Store not configured (or unreachable): stay silent, this is an optional
  // convenience, not a core surface.
  if (configured === false) return null

  return (
    <div className="mb-4" data-testid="saved-scenarios">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-body font-semibold text-gray-500">Saved scenarios</span>
        {rows.map(r => (
          <span
            key={r.id}
            className="inline-flex items-center gap-1 rounded-full border border-navy/20 bg-white pl-2.5 pr-1 py-1"
          >
            <button
              onClick={() => onRecall(r.params, r.fromFile)}
              className="text-xs font-body font-semibold text-navy hover:text-lime cursor-pointer"
              title={r.fromFile ? `Recall (from file ${r.fromFile})` : 'Recall this scenario'}
              data-testid={`saved-recall-${r.id}`}
            >
              {r.name}
            </button>
            <button
              onClick={() => retire(r.id)}
              disabled={busy}
              aria-label={`Remove ${r.name}`}
              className="text-gray-300 hover:text-red-500 text-sm leading-none px-1 cursor-pointer disabled:opacity-50"
            >
              &times;
            </button>
          </span>
        ))}
        {rows.length === 0 && !naming && (
          <span className="text-xs text-gray-400 font-body">none yet</span>
        )}
        {naming ? (
          <span className="inline-flex items-center gap-1.5">
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') void save()
                if (e.key === 'Escape') {
                  setNaming(false)
                  setName('')
                }
              }}
              placeholder="Name this scenario"
              maxLength={80}
              className="border border-gray-300 rounded-lg px-2 py-1 text-xs font-body w-44 focus:outline-none focus:border-navy"
              data-testid="saved-name-input"
            />
            <button
              onClick={() => void save()}
              disabled={busy || !name.trim()}
              className="text-xs font-semibold bg-navy text-white rounded-lg px-2.5 py-1 cursor-pointer disabled:opacity-50"
              data-testid="saved-confirm"
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setNaming(false)
                setName('')
              }}
              className="text-xs text-gray-500 underline cursor-pointer"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setNaming(true)}
            className="text-xs font-semibold text-navy border border-navy/30 rounded-lg px-2.5 py-1 hover:border-navy cursor-pointer"
            data-testid="saved-open"
          >
            + Save this scenario
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600 font-body mt-1">{error}</p>}
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
        <Field label="Product class">
          <select
            className={selectCls}
            value={scenario.productClass}
            onChange={e => setScenario({ ...scenario, productClass: e.target.value as Scenario['productClass'] })}
          >
            {PRODUCT_CLASSES.map(c => (
              <option key={c} value={c}>
                {productClassLabel(c)}
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
                {termLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Rate type"
          tip="An adjustable payment moves when prime moves and the amortization stays protected. A variable payment holds while rising prime eats amortization. The two are different products and never mix in results."
        >
          <select
            className={selectCls}
            value={scenario.rateType ?? ''}
            onChange={e =>
              setScenario({
                ...scenario,
                rateType: e.target.value ? (e.target.value as Scenario['rateType']) : null,
              })
            }
            data-testid="rate-type-filter"
          >
            <option value="">Any rate type</option>
            {RATE_TYPES.map(t => (
              <option key={t} value={t}>
                {RATE_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Cash back"
          tip="A cash back tier is its own product row with its own rate and printed conditions. It never blends into a lender's headline rate."
        >
          <select
            className={selectCls}
            value={scenario.cashback}
            onChange={e => setScenario({ ...scenario, cashback: e.target.value as Scenario['cashback'] })}
            data-testid="cashback-filter"
          >
            {CASHBACK_FILTERS.map(c => (
              <option key={c} value={c}>
                {c === 'any' ? 'With and without' : c === 'only' ? 'Cash back tiers only' : 'No cash back'}
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
          {pct !== null && pct > 80 && scenario.productClass !== 'insured' && (
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

// ─── Promo offer card (first-class scenario result) ─────────────────────────

function PromoOfferCard({
  offer,
  scenario,
  offersAsOf,
}: {
  offer: KnowledgeOffer
  scenario: Scenario
  offersAsOf: string | null
}) {
  const res = offerScenarioResult(offer.offer as OfferShape, scenario)
  if (!res) return null
  const provenance = (offer.offer as OfferShape).provenance
  const payment =
    scenario.amount !== null ? scenarioMonthlyPayment(scenario, res.ratePct) : null
  return (
    <div
      className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 sm:col-span-2"
      data-testid={`promo-offer-${res.offerId ?? 'offer'}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500 text-white uppercase tracking-wide">
          Promo offer
        </span>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
          {offer.days_left} day{offer.days_left === 1 ? '' : 's'} left, expires {offer.expiry}
        </span>
        {res.started && (
          <span className="text-[11px] text-amber-800 font-body">effective {res.started}</span>
        )}
      </div>
      <div className="mt-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-body font-semibold text-navy">{res.description}</p>
          <p className="text-xs text-gray-600 font-body mt-1">
            Tier for this scenario: <span className="font-semibold">{res.tierLabel}</span>
            {res.compBps !== null ? `, comp ${res.compBps} bps` : ''}
            {res.buydownRatePct !== null
              ? `. Buydown to ${res.buydownRatePct.toFixed(2)}%${
                  res.buydownMaxBps !== null ? ` (max ${res.buydownMaxBps} bps)` : ''
                }.`
              : ''}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-heading text-3xl font-bold text-navy">{res.ratePct.toFixed(2)}%</p>
          {payment !== null && (
            <p className="text-[11px] text-gray-600 font-body">{fmtMoneyFull(payment)}/mo at the scenario amount</p>
          )}
        </div>
      </div>
      {/* Conditions summary: the structured gates a scenario cannot check
          plus the announcement's own predicates, verbatim. */}
      <div className="mt-2 text-xs font-body text-amber-900 space-y-0.5">
        {res.requiredProduct && <p>Requires {res.requiredProduct}.</p>}
        {res.closingWithinDays !== null && (
          <p>Closing must land within {res.closingWithinDays} days of application.</p>
        )}
        {res.applicationWindowStart && (
          <p>Applications from {res.applicationWindowStart} to {offer.expiry}.</p>
        )}
      </div>
      {res.predicates.length > 0 && (
        <details className="mt-2">
          <summary className="text-xs font-semibold text-amber-900 cursor-pointer select-none py-1">
            Full conditions ({res.predicates.length})
          </summary>
          <ul className="mt-1 space-y-1 text-xs text-gray-700 font-body list-disc pl-4">
            {res.predicates.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-gray-500 font-body mt-2">
        From the lender announcement{typeof provenance === 'string' ? ` (${provenance})` : ''}, knowledge
        base{offersAsOf ? ` as of ${offersAsOf}` : ''}. This is an offer, not a rate sheet row; it has
        no sheet approval provenance.
      </p>
    </div>
  )
}

// ─── Level 2 ─────────────────────────────────────────────────────────────────

function LenderLevel({
  lenderSlug,
  results,
  knowledge,
  offers,
  offersAsOf,
  reference,
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
  offersAsOf: string | null
  reference: RatesReference | null
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
          <span className="text-xs text-gray-400 font-body" title="No knowledge page matches this quote slug yet. The knowledge index publishes quote slug aliases; the portal never invents the mapping.">
            no knowledge page for this slug yet
          </span>
        )}
      </div>
      <div className="flex items-center gap-2.5 mt-2">
        <LenderMark slug={lenderSlug} name={knowledge?.name} size={34} />
        <h2 className="font-heading text-navy font-bold text-xl">
          {knowledge?.name ?? lenderDisplayName(lenderSlug)}
        </h2>
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Promo offers with structured terms render as first-class,
            visually distinct results beside the sheet quotes. */}
        {offers.map((o, i) => (
          <PromoOfferCard key={`offer-${i}`} offer={o} scenario={scenario} offersAsOf={offersAsOf} />
        ))}
        {(!r || r.matches.length === 0) && (
          <p className="text-sm text-gray-500 font-body bg-white border border-gray-200 rounded-xl p-5 sm:col-span-2">
            No matching sheet products for the current scenario.
          </p>
        )}
        {r?.matches.map(m => {
          const q = m.quote
          const display = quoteRateDisplay(q, reference)
          const pinned = pins.includes(q.id)
          return (
            <div key={q.id} className="bg-white border border-gray-200 rounded-xl p-4" data-testid={`rate-product-${q.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-body font-semibold text-navy capitalize">
                    {productClassLabel(q.productClass)} &middot; {variantLabel(q.variant)}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-xs text-gray-500 font-body">{termLabel(q.termMonths)}</span>
                    <TypeBadge rateType={q.rateType} reference={reference} lenderSlug={q.lenderSlug} />
                    <CashbackChip pct={q.cashbackPct} />
                  </div>
                </div>
                <RateHeadline display={display} size="md" />
              </div>
              <p className="text-xs text-gray-500 font-body mt-2">
                sheet {q.asOfDate ? fmtShortDate(q.asOfDate) : 'undated'}
                {q.compBps !== null ? ` · comp ${q.compBps} bps` : ''}
              </p>
              {q.programNotes && (
                <details className="mt-2">
                  <summary className="text-xs font-semibold text-navy cursor-pointer select-none py-1">
                    Program conditions, verbatim
                  </summary>
                  <p className="mt-1 text-xs text-gray-600 font-body whitespace-pre-wrap break-words bg-gray-50 rounded-lg p-2">
                    {q.programNotes}
                  </p>
                </details>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2">
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
  reference,
  scenario,
  pins,
  togglePin,
  onBack,
}: {
  quote: RateQuoteFullRow | null
  provenance: SheetProvenance | null
  knowledge: KnowledgeLenderEntry | null
  reference: RatesReference | null
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
  const display = quoteRateDisplay(quote, reference)
  const effective = quoteEffectiveRate(quote, reference)
  const payment = effective !== null ? scenarioMonthlyPayment(scenario, effective) : null
  const pinned = pins.includes(quote.id)
  const decidedDay = provenance?.decidedAt ? provenance.decidedAt.slice(0, 10) : null
  const mechanism = quote.rateType !== 'fixed' ? mechanismForLender(reference, quote.lenderSlug) : null
  const rows: [string, string][] = [
    ['Lender', knowledge?.name ?? lenderDisplayName(quote.lenderSlug)],
    ['Product class', productClassLabel(quote.productClass)],
    ['Variant', variantLabel(quote.variant)],
    ['Term', termLabel(quote.termMonths)],
    ['Rate type', RATE_TYPE_LABEL[quote.rateType]],
    ['Rate', rateLineText(display)],
    ...(quote.cashbackPct !== null ? ([['Cash back', `${quote.cashbackPct}%`]] as [string, string][]) : []),
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
        &larr; Back to {knowledge?.name ?? lenderDisplayName(quote.lenderSlug)}
      </button>
      <div className="mt-3 bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <LenderMark slug={quote.lenderSlug} name={knowledge?.name} size={24} />
              <span className="font-heading font-bold text-navy text-sm">
                {knowledge?.name ?? lenderDisplayName(quote.lenderSlug)}
              </span>
            </div>
            <h2 className="font-heading text-navy font-bold text-xl capitalize">
              {productClassLabel(quote.productClass)} &middot; {variantLabel(quote.variant)} &middot;{' '}
              {termLabel(quote.termMonths)}
            </h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <TypeBadge rateType={quote.rateType} reference={reference} lenderSlug={quote.lenderSlug} size="md" />
              <CashbackChip pct={quote.cashbackPct} />
            </div>
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

        {/* Mechanism explanation: from the reference payload, never the
            sheet label. Pending caveat renders where the note is not yet
            lender-confirmed (Scotia Flex today). */}
        {quote.rateType !== 'fixed' && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5" data-testid="mechanism-note">
            <p className="text-xs font-semibold text-navy font-body">
              How this {RATE_TYPE_LABEL[quote.rateType].toLowerCase()} rate behaves
            </p>
            <p className="text-xs text-gray-600 font-body mt-1">
              {mechanism?.note ??
                conventionText(reference, quote.rateType) ??
                'The mechanism note has not loaded; retry the prime reference above.'}
            </p>
            {mechanism && (
              <p className="text-[11px] text-gray-400 font-body mt-1">
                Note as of {mechanism.as_of}
                {mechanismPending(mechanism)
                  ? '. Pending lender confirmation; treat the payment behaviour as unconfirmed until the desk confirms it.'
                  : ''}
              </p>
            )}
          </div>
        )}

        {quote.programNotes && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5">
            <p className="text-xs font-semibold text-navy font-body">Program conditions, verbatim from the sheet</p>
            <p className="text-xs text-gray-600 font-body mt-1 whitespace-pre-wrap break-words">
              {quote.programNotes}
            </p>
          </div>
        )}

        {payment !== null && effective !== null ? (
          <p className="text-sm font-body text-navy mt-4 bg-lime/15 border border-lime/40 rounded-lg px-3 py-2">
            {fmtMoneyFull(payment)}/mo at the scenario&apos;s {fmtMoneyFull(scenario.amount!)} over{' '}
            {scenario.amortizationYears} years
            {display.kind === 'floating-computed'
              ? `, at the effective rate ${display.effective.toFixed(2)}% (prime ${display.primeValue.toFixed(2)}% as of ${display.primeAsOf})`
              : display.kind === 'floating-printed'
                ? `, at the sheet's printed ${display.rate.toFixed(2)}%`
                : ''}{' '}
            (semi-annual compounding, the same validated math as the public calculators)
          </p>
        ) : display.kind === 'floating-no-prime' && scenario.amount ? (
          <p className="text-sm font-body text-amber-800 mt-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            No payment renders for this floating rate while the prime reference is unavailable; the
            discount alone cannot price a payment.
          </p>
        ) : null}

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
                index publishes quote slug aliases.
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
  reference,
  fromFile,
  onUnpin,
  onClear,
}: {
  pinned: RateQuoteFullRow[]
  scenario: Scenario
  knowledgeFor: (slug: string) => KnowledgeLenderEntry | null
  reference: RatesReference | null
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
      // lender display names and the prime reference; the PDF still
      // renders with stored slugs and the prime-unavailable state when
      // the mint fails.
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

  const mechanismLine = (q: RateQuoteFullRow): string => {
    if (q.rateType === 'fixed') return 'Fixed: the rate and payment hold for the whole term.'
    const note = mechanismForLender(reference, q.lenderSlug)
    const base =
      note?.note ?? conventionText(reference, q.rateType) ?? 'Mechanism note not loaded yet.'
    return mechanismPending(note) ? `${base} Pending lender confirmation.` : base
  }

  const compareRows: [string, (q: RateQuoteFullRow) => string][] = [
    ['Rate', q => rateLineText(quoteRateDisplay(q, reference))],
    ['Rate type', q => RATE_TYPE_LABEL[q.rateType]],
    ['Term', q => termLabel(q.termMonths)],
    ['Class', q => productClassLabel(q.productClass)],
    ['Variant', q => variantLabel(q.variant)],
    ['Cash back', q => (q.cashbackPct !== null ? `${q.cashbackPct}% (see program conditions)` : 'none')],
    [
      'Monthly payment',
      q => {
        const eff = quoteEffectiveRate(q, reference)
        if (eff === null) return 'prime unavailable'
        const p = scenarioMonthlyPayment(scenario, eff)
        return p === null ? 'enter an amount' : fmtMoneyFull(p)
      },
    ],
    ['How the rate behaves', mechanismLine],
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
            <table className="w-full text-sm font-body min-w-[560px]">
              <thead>
                <tr>
                  <th className="text-left text-[11px] uppercase tracking-wide text-white/50 font-medium py-1.5 w-32"></th>
                  {pinned.map(q => {
                    const k = knowledgeFor(q.lenderSlug)
                    return (
                      <th key={q.id} className="text-left py-1.5 pr-3">
                        <span className="flex items-center gap-1.5">
                          <LenderMark slug={q.lenderSlug} name={k?.name} size={20} />
                          <span className="font-bold">{k?.name ?? lenderDisplayName(q.lenderSlug)}</span>
                        </span>
                        <button
                          onClick={() => onUnpin(q.id)}
                          className="mt-1 text-[11px] text-white/60 underline"
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
                      <td key={q.id} className="py-1.5 pr-3 text-xs sm:text-sm">
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
              compounding. Fixed payments use the printed rate; floating payments use the effective
              rate labeled above, computed against the served prime. Rates are from Michael-approved
              sheets on their stated dates.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
