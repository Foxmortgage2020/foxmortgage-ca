'use client'

// Lenders tab (Rates v3): a browse view over the approved book, no scenario
// required. Cards answer "where does this lender sit today" with honest
// per-class headline rates and the deepest floating discount (adjustable and
// variable kept apart), never one unqualified "lowest rate". The three
// coverage states — Live, Awaiting your approval, Coverage pending — are all
// visible, turning the gap into a to-do list. The lender page groups every
// approved product by rate type and term with superseded history behind a
// toggle. Approved quotes only anywhere a rate is quotable; pending and
// intel-only lenders appear as counts and nudges, never as numbers.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import type { RateQuoteFullRow } from '@/lib/underwriting'
import type { KnowledgeOffer } from '@/lib/gates'
import {
  PRODUCT_CLASSES,
  RATE_TYPES,
  RATE_TYPE_LABEL,
  TEST_LENDER_SLUG,
  productClassLabel,
  quoteRateDisplay,
  termLabel,
  type RateType,
  type RatesReference,
} from '@/lib/scenario'
import {
  LENDER_SORTS,
  sortLenderCards,
  type LenderCard,
  type LenderCoverage,
  type LenderSort,
} from '@/lib/lender-browse'
import { useKnowledgeFetch } from '@/lib/knowledge-client'
import LenderMark from '@/components/admin/LenderMark'
import { OfferWindowBadge } from '@/components/admin/offer-display'
import {
  CashbackChip,
  RATE_TYPE_GROUPS,
  TypeBadge,
  discountLabel,
  rateLineText,
  variantLabel,
} from '@/components/admin/rate-display'
import { lenderDisplayName } from '@/config/lenders'
import { matchKnowledge, type KnowledgeLenderEntry } from '@/lib/rates-shared'
import { fmtShortDate } from '@/lib/dates'

export interface UnattributedSheet {
  fileName: string | null
  receivedAt: string | null
}

export default function RatesLenders({
  quotes,
  coverage,
  todayYMD,
  unattributed = [],
}: {
  quotes: RateQuoteFullRow[]
  coverage: LenderCoverage
  todayYMD: string
  /** Captured rates-class items the ingest could not name a lender for. */
  unattributed?: UnattributedSheet[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const lenderParam = sp.get('lender')

  const knowledge = useKnowledgeFetch<{ lenders: KnowledgeLenderEntry[] }>(
    '/api/portal/admin/knowledge/lenders',
  )
  const offersRes = useKnowledgeFetch<{ as_of: string; offers: KnowledgeOffer[] }>(
    '/api/portal/admin/knowledge/offers',
  )
  const referenceRes = useKnowledgeFetch<RatesReference>('/api/portal/admin/knowledge/rates-reference')
  const knowledgeLenders = knowledge.data?.lenders ?? []
  const offers = offersRes.data?.offers ?? []
  const reference = referenceRes.data ?? null

  const knowledgeFor = (quoteSlug: string) => matchKnowledge(knowledgeLenders, quoteSlug)
  const offersFor = (quoteSlug: string): KnowledgeOffer[] => {
    const k = knowledgeFor(quoteSlug)
    if (!k) return []
    return offers.filter(o => o.lender === k.slug)
  }

  function openLender(slug: string) {
    const params = new URLSearchParams(sp.toString())
    params.set('lender', slug)
    router.push(`${pathname}?${params.toString()}`)
  }
  function closeLender() {
    const params = new URLSearchParams(sp.toString())
    params.delete('lender')
    router.push(`${pathname}?${params.toString()}`)
  }

  // The reserved TEST lender never resolves to a lender page: a hand-crafted
  // ?lender=test-portal URL falls through to the browse grid (where the TEST
  // slug is already excluded), so a TEST rate can never render as a number.
  if (lenderParam && lenderParam !== TEST_LENDER_SLUG) {
    return (
      <LenderPage
        slug={lenderParam}
        quotes={quotes}
        knowledge={knowledgeFor(lenderParam)}
        offers={offersFor(lenderParam)}
        reference={reference}
        onBack={closeLender}
      />
    )
  }

  return (
    <BrowseGrid
      coverage={coverage}
      knowledgeFor={knowledgeFor}
      offersFor={offersFor}
      todayYMD={todayYMD}
      onOpen={openLender}
      unattributed={unattributed}
    />
  )
}

// ─── Browse grid ─────────────────────────────────────────────────────────────

function BrowseGrid({
  coverage,
  knowledgeFor,
  offersFor,
  todayYMD,
  onOpen,
  unattributed,
}: {
  coverage: LenderCoverage
  knowledgeFor: (slug: string) => KnowledgeLenderEntry | null
  offersFor: (slug: string) => KnowledgeOffer[]
  todayYMD: string
  onOpen: (slug: string) => void
  unattributed: UnattributedSheet[]
}) {
  const [sort, setSort] = useState<LenderSort>('name')
  const live = useMemo(() => sortLenderCards(coverage.live, sort), [coverage.live, sort])

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500 font-body">
          Every lender with approved quotes, plus the sheets still waiting and the formats not parsed
          yet. Rates as of {fmtShortDate(todayYMD)}.
        </p>
        <label className="text-xs font-body text-gray-500 flex items-center gap-1.5">
          Sort
          <select
            value={sort}
            onChange={e => setSort(e.target.value as LenderSort)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs font-body bg-white focus:outline-none focus:border-navy"
            data-testid="lenders-sort"
          >
            {LENDER_SORTS.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Live */}
      <SectionHeading title="Live" count={live.length} tone="live" />
      {live.length === 0 ? (
        <EmptyRow>No approved quotes in the book yet.</EmptyRow>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="lender-cards">
          {live.map(card => (
            <LenderBrowseCard
              key={card.slug}
              card={card}
              knowledge={knowledgeFor(card.slug)}
              offers={offersFor(card.slug)}
              onOpen={() => onOpen(card.slug)}
            />
          ))}
        </div>
      )}

      {/* Awaiting your approval */}
      {coverage.awaiting.length > 0 && (
        <>
          <SectionHeading title="Awaiting your approval" count={coverage.awaiting.length} tone="awaiting" />
          <p className="text-xs text-gray-500 font-body mb-3">
            These lenders have sheets extracted and sitting in the approvals queue. They light up as
            live cards the moment you approve them.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="lender-awaiting">
            {coverage.awaiting.map(a => (
              <div
                key={a.slug}
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <LenderMark slug={a.slug} name={knowledgeFor(a.slug)?.name} size={26} />
                  <span className="font-heading font-bold text-navy truncate">
                    {knowledgeFor(a.slug)?.name ?? lenderDisplayName(a.slug)}
                  </span>
                </div>
                <p className="text-xs text-amber-900 font-body">
                  {a.pendingCount} quote{a.pendingCount === 1 ? '' : 's'} extracted, awaiting your
                  approval.
                </p>
                <Link
                  href="/portal/admin/approvals?tab=sheets"
                  className="text-xs font-semibold text-navy underline hover:text-lime"
                  data-testid={`awaiting-link-${a.slug}`}
                >
                  Review sheets &rarr;
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Coverage pending: whose sheets can't we read. A lender with an
          approved book never appears here — that is the live grid's job. */}
      {coverage.coveragePending.length > 0 && (
        <>
          <SectionHeading
            title="Coverage pending"
            count={coverage.coveragePending.length}
            tone="pending"
          />
          <p className="text-xs text-gray-500 font-body mb-3">
            These lenders&apos; newest rates sheet could not be read (no working parser for the
            current format), and guessing a rate is not an option. Each chip names the failing
            sheet; each one is a candidate for the next parser.
          </p>
          <div className="flex flex-wrap gap-2" data-testid="lender-coverage-pending">
            {coverage.coveragePending.map(c => (
              <span
                key={c.slug}
                className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full pl-2 pr-3 py-1.5 opacity-90"
                title={`${c.status.replace(/_/g, ' ')}${c.fileName ? `: ${c.fileName}` : ''}${c.receivedAt ? ` (received ${c.receivedAt.slice(0, 10)})` : ''}`}
              >
                <LenderMark slug={c.slug} name={knowledgeFor(c.slug)?.name} size={22} />
                <span className="text-xs font-body font-semibold text-gray-600">
                  {knowledgeFor(c.slug)?.name ?? lenderDisplayName(c.slug)}
                </span>
                <span className="text-[10px] font-body text-amber-700">
                  {c.status === 'no_pipeline' ? 'no parser' : 'failed to read'}
                  {c.fileName ? ` · ${c.fileName}` : ''}
                </span>
              </span>
            ))}
          </div>
        </>
      )}

      {/* Unattributed rates items: captured sheets the ingest could not name a
          lender for. Visible here so they are never silently unbucketed. */}
      {unattributed.length > 0 && (
        <div className="mt-5 border border-amber-200 bg-amber-50 rounded-xl px-4 py-3" data-testid="lender-unattributed">
          <p className="text-xs font-body font-semibold text-amber-900">
            {unattributed.length} captured rates sheet{unattributed.length === 1 ? '' : 's'} with no
            lender identified
          </p>
          <p className="text-xs font-body text-amber-800 mt-1">
            The ingest could not name a lender for{' '}
            {unattributed
              .map(u => `${u.fileName ?? 'an untitled sheet'}${u.receivedAt ? ` (received ${u.receivedAt.slice(0, 10)})` : ''}`)
              .join(', ')}
            . These never enter any bucket until the workbench assigns a lender.
          </p>
        </div>
      )}
    </div>
  )
}

function SectionHeading({
  title,
  count,
  tone,
}: {
  title: string
  count: number
  tone: 'live' | 'awaiting' | 'pending'
}) {
  const dot =
    tone === 'live' ? 'bg-lime' : tone === 'awaiting' ? 'bg-amber-400' : 'bg-gray-300'
  return (
    <div className="flex items-center gap-2 mt-6 mb-3 first:mt-0">
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden />
      <h2 className="font-heading text-navy font-bold text-base">{title}</h2>
      <span className="text-xs font-body text-gray-400">({count})</span>
    </div>
  )
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-gray-500 font-body bg-white border border-gray-200 rounded-xl p-5">
      {children}
    </p>
  )
}

// ─── Lender browse card ──────────────────────────────────────────────────────

function LenderBrowseCard({
  card,
  knowledge,
  offers,
  onOpen,
}: {
  card: LenderCard
  knowledge: KnowledgeLenderEntry | null
  offers: KnowledgeOffer[]
  onOpen: () => void
}) {
  const chip = 'text-[11px] font-semibold px-2 py-0.5 rounded-full'
  // Prefer the soonest DATED offer; a lender with only no-clock offers still
  // surfaces one (with its loud warning), never a NaN countdown.
  const dated = offers.filter(o => typeof o.days_left === 'number')
  const soonestOffer = dated.length
    ? dated.reduce((a, b) => ((a.days_left as number) <= (b.days_left as number) ? a : b))
    : (offers[0] ?? null)
  return (
    <button
      onClick={onOpen}
      className="group text-left bg-white border border-gray-200 rounded-xl p-4 cursor-pointer transition hover:border-navy hover:shadow-md focus:outline-none focus:ring-2 focus:ring-navy/30"
      data-testid={`lender-card-${card.slug}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex items-center gap-2 min-w-0">
          <LenderMark slug={card.slug} name={knowledge?.name} size={28} />
          <span className="font-heading font-bold text-navy truncate">
            {knowledge?.name ?? lenderDisplayName(card.slug)}
          </span>
        </span>
        {card.stale && (
          <span className={`${chip} bg-amber-100 text-amber-800 shrink-0`} title="Newest approved sheet is over 30 days old.">
            stale
          </span>
        )}
      </div>

      {/* Per-class headline rates: never one unqualified lowest. */}
      {card.classRates.length > 0 ? (
        <div className="mt-2.5 space-y-0.5">
          {card.classRates.map(cr => (
            <div key={cr.productClass} className="flex items-baseline justify-between gap-2">
              <span className="text-xs text-gray-500 font-body capitalize">
                {productClassLabel(cr.productClass)}
              </span>
              <span className="font-body text-navy">
                from <span className="font-heading font-bold">{cr.fromRate.toFixed(2)}%</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2.5 text-xs text-gray-500 font-body">
          No fixed rate in the approved book; see floating below.
        </p>
      )}

      {/* Deepest floating discount, adjustable and variable kept apart. */}
      {card.floatingBest.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {card.floatingBest.map(fb => (
            <span key={fb.rateType} className="inline-flex items-center gap-1 text-xs font-body text-navy">
              best <span className="font-heading font-bold">{discountLabel(fb.discount)}</span>
              <span className={`${chip} ${fb.rateType === 'adjustable' ? 'bg-sky-100 text-sky-900' : 'bg-violet-100 text-violet-900'}`}>
                {RATE_TYPE_LABEL[fb.rateType]}
              </span>
            </span>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 font-body mt-2">
        {card.approvedCount} approved product{card.approvedCount === 1 ? '' : 's'} &middot; newest sheet{' '}
        {card.newestAsOf ? fmtShortDate(card.newestAsOf) : 'undated'}
      </p>

      <div className="flex flex-wrap items-center gap-1.5 mt-2">
        {soonestOffer && (
          <span className="inline-flex items-center gap-1">
            <span className={`${chip} bg-amber-100 text-amber-900`}>promo</span>
            <OfferWindowBadge
              variant="chip"
              started={null}
              expiry={(soonestOffer.expiry as string | null) ?? null}
              daysLeft={typeof soonestOffer.days_left === 'number' ? soonestOffer.days_left : null}
            />
          </span>
        )}
        {card.hasCashback && <span className={`${chip} bg-emerald-100 text-emerald-800`}>cash back</span>}
        {card.pendingCount > 0 && (
          <span className={`${chip} bg-gray-100 text-gray-600`} title="Extracted sheets awaiting your approval.">
            {card.pendingCount} awaiting approval
          </span>
        )}
        {card.newestSheetFailed && (
          <span
            className={`${chip} bg-amber-100 text-amber-900`}
            data-testid={`sheet-attention-${card.slug}`}
            title={`The newest rates sheet did not parse (${card.newestSheetFailed.status.replace(/_/g, ' ')}${card.newestSheetFailed.fileName ? `: ${card.newestSheetFailed.fileName}` : ''}). The approved book stays quotable; the newest sheet needs a parser look.`}
          >
            newer sheet needs attention
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
}

// ─── Lender page ─────────────────────────────────────────────────────────────

function LenderPage({
  slug,
  quotes,
  knowledge,
  offers,
  reference,
  onBack,
}: {
  slug: string
  quotes: RateQuoteFullRow[]
  knowledge: KnowledgeLenderEntry | null
  offers: KnowledgeOffer[]
  reference: RatesReference | null
  onBack: () => void
}) {
  const [term, setTerm] = useState<string>('')
  const [cls, setCls] = useState<string>('')
  const [rateType, setRateType] = useState<string>('')
  const [showSuperseded, setShowSuperseded] = useState(false)

  const mine = useMemo(() => quotes.filter(q => q.lenderSlug === slug), [quotes, slug])
  const approved = mine.filter(q => q.status === 'approved')
  const superseded = mine.filter(q => q.status === 'superseded')

  const passesFilters = (q: RateQuoteFullRow) =>
    (term === '' || q.termMonths === Number(term)) &&
    (cls === '' || q.productClass === cls) &&
    (rateType === '' || q.rateType === rateType)

  const filteredApproved = approved.filter(passesFilters)
  const newestAsOf = approved
    .map(q => q.asOfDate)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1)

  const terms = Array.from(new Set(approved.map(q => q.termMonths))).sort((a, b) => a - b)
  const classes = Array.from(new Set(approved.map(q => q.productClass)))
  const selectCls =
    'border border-gray-200 rounded-lg px-2 py-1.5 text-xs font-body bg-white focus:outline-none focus:border-navy'

  return (
    <div>
      <button onClick={onBack} className="text-sm font-body font-semibold text-navy underline hover:text-lime">
        &larr; All lenders
      </button>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <LenderMark slug={slug} name={knowledge?.name} size={40} />
          <div className="min-w-0">
            <h2 className="font-heading text-navy font-bold text-xl truncate">
              {knowledge?.name ?? lenderDisplayName(slug)}
            </h2>
            <p className="text-xs text-gray-500 font-body">
              {approved.length} approved product{approved.length === 1 ? '' : 's'} &middot; newest sheet{' '}
              {newestAsOf ? fmtShortDate(newestAsOf) : 'undated'}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <Link
            href={`/portal/admin/rates?tab=scenario&lender=${encodeURIComponent(slug)}`}
            className="text-xs font-semibold bg-navy text-white rounded-lg px-3 py-1.5 hover:bg-navy/90"
            data-testid="price-a-deal"
          >
            Price a deal with this lender
          </Link>
          {knowledge ? (
            <Link
              href={`/portal/admin/knowledge/${knowledge.slug}`}
              className="text-xs font-body font-semibold text-navy underline hover:text-lime"
            >
              Knowledge page{knowledge.as_of ? ` (as of ${knowledge.as_of})` : ''}
            </Link>
          ) : (
            <span
              className="text-xs text-gray-400 font-body"
              title="No knowledge page matches this quote slug yet. The knowledge index publishes quote slug aliases; the portal never invents the mapping."
            >
              no knowledge page for this slug yet
            </span>
          )}
        </div>
      </div>

      {/* Active offers */}
      {offers.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5" data-testid="lender-offers">
          {offers.map((o, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900"
                title={typeof o.offer.description === 'string' ? o.offer.description : undefined}
              >
                {o.offer.description ? String(o.offer.description).slice(0, 40) : 'Promo'}
              </span>
              <OfferWindowBadge
                variant="chip"
                started={null}
                expiry={(o.expiry as string | null) ?? null}
                daysLeft={typeof o.days_left === 'number' ? o.days_left : null}
              />
            </span>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2" data-testid="lender-filters">
        <select value={rateType} onChange={e => setRateType(e.target.value)} className={selectCls} aria-label="Rate type">
          <option value="">All rate types</option>
          {RATE_TYPES.map(rt => (
            <option key={rt} value={rt}>
              {RATE_TYPE_LABEL[rt]}
            </option>
          ))}
        </select>
        <select value={cls} onChange={e => setCls(e.target.value)} className={selectCls} aria-label="Product class">
          <option value="">All classes</option>
          {PRODUCT_CLASSES.filter(c => classes.includes(c)).map(c => (
            <option key={c} value={c}>
              {productClassLabel(c)}
            </option>
          ))}
        </select>
        <select value={term} onChange={e => setTerm(e.target.value)} className={selectCls} aria-label="Term">
          <option value="">All terms</option>
          {terms.map(t => (
            <option key={t} value={String(t)}>
              {termLabel(t)}
            </option>
          ))}
        </select>
      </div>

      {/* Approved products, grouped by rate type then term */}
      <div className="mt-4 space-y-5">
        {RATE_TYPE_GROUPS.map(group => {
          const rows = filteredApproved
            .filter(q => q.rateType === group.rateType)
            .sort((a, b) => a.termMonths - b.termMonths)
          if (rows.length === 0) return null
          return (
            <div key={group.rateType} data-testid={`lender-group-${group.rateType}`}>
              <h3 className="font-heading text-navy font-bold text-sm mb-2 flex items-center gap-2">
                {group.label}
                {group.rateType !== 'fixed' && (
                  <TypeBadge rateType={group.rateType} reference={reference} lenderSlug={slug} />
                )}
              </h3>
              <div className="space-y-2">
                {rows.map(q => (
                  <ProductRow key={q.id} quote={q} reference={reference} />
                ))}
              </div>
            </div>
          )
        })}
        {filteredApproved.length === 0 && (
          <EmptyRow>No approved products match these filters.</EmptyRow>
        )}
      </div>

      {/* Superseded history */}
      {superseded.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowSuperseded(s => !s)}
            className="text-xs font-body font-semibold text-navy underline cursor-pointer"
            data-testid="superseded-toggle"
          >
            {showSuperseded ? 'Hide' : 'Show'} superseded quotes ({superseded.length})
          </button>
          {showSuperseded && (
            <div className="mt-3 space-y-2 opacity-80" data-testid="lender-superseded">
              {superseded
                .filter(passesFilters)
                .sort((a, b) => (b.asOfDate ?? '').localeCompare(a.asOfDate ?? ''))
                .map(q => (
                  <ProductRow key={q.id} quote={q} reference={reference} superseded />
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProductRow({
  quote,
  reference,
  superseded = false,
}: {
  quote: RateQuoteFullRow
  reference: RatesReference | null
  superseded?: boolean
}) {
  const display = quoteRateDisplay(quote, reference)
  return (
    <div
      className="bg-white border border-gray-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2"
      data-testid={`lender-product-${quote.id}`}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-body font-semibold text-navy">{termLabel(quote.termMonths)}</span>
          <span className="text-xs text-gray-500 font-body capitalize">{productClassLabel(quote.productClass)}</span>
          <span className="text-xs text-gray-400 font-body">{variantLabel(quote.variant)}</span>
          <CashbackChip pct={quote.cashbackPct} />
        </div>
        <p className="text-[11px] text-gray-400 font-body mt-0.5">
          {rateLineText(display)} &middot; sheet {quote.asOfDate ? fmtShortDate(quote.asOfDate) : 'undated'}
          {superseded ? ' (superseded)' : ''}
        </p>
      </div>
      {!superseded && (
        <Link
          href={`/portal/admin/rates?tab=scenario&lender=${encodeURIComponent(quote.lenderSlug)}&product=${quote.id}`}
          className="text-xs font-semibold text-navy underline hover:text-lime shrink-0"
          data-testid={`lender-detail-${quote.id}`}
        >
          Details
        </Link>
      )}
    </div>
  )
}
