// The Deals (Beta) file page — the pure layer (handoff 42, 2026-08-05).
//
// The board is where the week is scanned; the file page is where forty minutes
// go. This module holds every rule that page renders by: how a rec deal finds
// its workbench room, which mortgage on a file is THE mortgage, how months read
// as words, and what each of the eight tabs is for. No next/*, no Clerk, no
// fetch — so the rules are unit-testable without a database, and both the page
// and its tests read the same source. Same split as lib/phase-model.ts.
//
// THE WRITE GUARANTEE THIS SURFACE NOW CARRIES. The beta board used to be
// provably read-only: a test grepped it for buttons and forms. That guarantee
// ended when writes were approved here, and it is REPLACED, not dropped:
//
//     Nothing under deals-beta writes except through an existing gate proxy,
//     with a human actor.
//
// No direct database write, no new write path invented in this repo, no
// service-role key, and no mutating route that skips the gates pattern every
// deal-room card already uses. tests/beta-file.test.ts enforces it over the
// whole deals-beta tree. The preview panel keeps its ORIGINAL read-only grep
// (tests/phase-model.test.ts) because that panel stays read-only.

import type { DealLike } from '@/lib/phase-model'

// ─── Months as words ────────────────────────────────────────────────────────
// Storage stays an integer number of months everywhere. Only the reading
// changes: below two years a month count is the natural unit ("18 months"),
// at or above it nobody says "sixty months" out loud.
//
// NOTE for whoever wrote the brief: there was no existing `formatMonths()` to
// reuse. The two nearest helpers disagree with this rule and with each other —
// lib/scenario.ts termLabel gives "2yr"/"25mo" (never years AND months), and
// lib/smm.ts comparableTermLabel gives "5-year term". Neither was repointed:
// both are load-bearing on surfaces outside this one.

/** Null for anything unusable (null, zero, negative), so the field renders
 *  NOT_SPECIFIED rather than "0 months" — a zero term is not a term. */
export function formatMonths(months: number | null | undefined): string | null {
  if (months === null || months === undefined) return null
  if (!Number.isFinite(months) || months <= 0) return null
  const whole = Math.round(months)
  if (whole < 24) return `${whole} ${whole === 1 ? 'month' : 'months'}`
  const years = Math.floor(whole / 12)
  const rem = whole % 12
  const y = `${years} ${years === 1 ? 'year' : 'years'}`
  if (rem === 0) return y
  return `${y} ${rem} ${rem === 1 ? 'month' : 'months'}`
}

// ─── The empty convention ───────────────────────────────────────────────────
// An empty field says so in words. Never blank (which reads as a rendering
// bug), never zero (which reads as a measured figure that happens to be none).

export const NOT_SPECIFIED = 'Not specified'

/** Normalise anything into a display string or null. Zero is only kept when a
 *  zero genuinely means something — pass `zeroIsReal` for a down payment that
 *  is actually nil, and leave it off for a rate or a term. */
export function fieldValue(
  v: string | number | null | undefined,
  opts?: { zeroIsReal?: boolean },
): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return null
    if (v === 0 && !opts?.zeroIsReal) return null
    return String(v)
  }
  const s = v.trim()
  return s.length > 0 ? s : null
}

/** Snake-case vocabulary to words, for the columns that carry free enums
 *  (payment_frequency, payment_type, occupancy, rate_type, tenure). The
 *  record layer owns the vocabulary; this only makes it readable, and an
 *  unrecognised value renders as itself rather than as nothing. */
export function humanise(v: string | null | undefined): string | null {
  const s = fieldValue(v ?? null)
  if (!s) return null
  return s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

export function fmtMoneyExact(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n === 0) return null
  return `$${Math.round(n).toLocaleString('en-CA')}`
}

export function fmtRate(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return null
  return `${n}%`
}

/** A stored YYYY-MM-DD read as words. Parsed by hand — no Date construction,
 *  so no timezone can move the day (the same rule the committed-terms card
 *  follows for a maturity). */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
export function fmtDateWords(iso: string | null | undefined): string | null {
  const s = fieldValue(iso ?? null)
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return s
  const [, y, mo, d] = m
  const name = MONTHS[Number(mo) - 1]
  if (!name) return s
  return `${Number(d)} ${name} ${y}`
}

// ─── Finding the workbench room ─────────────────────────────────────────────
// rec.deals carries workbench_deal_id, which nothing in this repo has ever
// selected. It is populated on a small minority of rows, so file_ref is the
// fallback — and where neither resolves, that is a FACT ABOUT THE FILE, not an
// error. A rec deal with no workbench room is the normal case (the record
// layer holds the whole historical book; the workbench holds the live files).

export type ResolutionMethod = 'workbench_deal_id' | 'file_ref'

export interface RoomResolution {
  workbenchDealId: string
  method: ResolutionMethod
}

export interface PublicDealLike {
  id: string
  file_ref: string | null
}

export interface RecDealRoomFields {
  id: string
  file_ref: string | null
  workbench_deal_id?: string | null
}

/** Direct id first, then an UNAMBIGUOUS file_ref. Two workbench rows sharing a
 *  file_ref resolve to neither: a guess here would put one client's documents
 *  on another client's page, which is the worst failure this surface could
 *  have. Returns null rather than picking. */
export function resolveRoom(
  deal: RecDealRoomFields,
  publicDeals: readonly PublicDealLike[],
): RoomResolution | null {
  const wid = deal.workbench_deal_id
  if (wid && publicDeals.some(p => p.id === wid)) {
    return { workbenchDealId: wid, method: 'workbench_deal_id' }
  }
  const ref = fieldValue(deal.file_ref)
  if (!ref) return null
  const matches = publicDeals.filter(p => p.file_ref === ref)
  if (matches.length === 1) return { workbenchDealId: matches[0].id, method: 'file_ref' }
  return null
}

// ─── Which mortgage is THE mortgage ─────────────────────────────────────────
// A file can touch two: the one being PLACED (rec.mortgages.originating_deal_id
// points back at this deal) and the one being REPLACED (rec.deals
// .existing_mortgage_id, on a renewal or refinance). They are not
// interchangeable. Showing the existing mortgage's rate as "the rate" on a
// renewal would state the client's OLD rate as the new deal's terms, which is
// exactly backwards, so the two are resolved separately and labelled.

export interface MortgageLike {
  id: string
  originating_deal_id: string | null
  lender_name_raw: string | null
  product_name: string | null
  rate: number | null
  rate_type: string | null
  term_months: number | null
  amortization_months: number | null
  payment_amount: number | null
  payment_frequency: string | null
  payment_type: string | null
  maturity_on: string | null
  property_id: string | null
  status: string | null
}

/** The mortgage this deal is placing. */
export function originatingMortgage(
  deal: { id: string },
  mortgages: readonly MortgageLike[],
): MortgageLike | null {
  return mortgages.find(m => m.originating_deal_id === deal.id) ?? null
}

/** The mortgage this deal is replacing, if the file names one. */
export function existingMortgage(
  deal: { existing_mortgage_id?: string | null },
  mortgages: readonly MortgageLike[],
): MortgageLike | null {
  const id = deal.existing_mortgage_id
  if (!id) return null
  return mortgages.find(m => m.id === id) ?? null
}

// ─── When the "mortgage being replaced" block appears at all ────────────────
//
// The page's honesty convention is that an EMPTY thing means "not yet" — so a
// block that structurally cannot be filled must be ABSENT, not empty, or the
// convention starts lying.
//
// The rule keys on PRESENCE first and type only second, because type alone is
// wrong here: BRXM-F053724 is a `purchase` and carries a real existing mortgage
// (Scotiabank, 3.24% fixed, maturing 2027-03-30 — verified live, not assumed).
// A client buying one property while still holding a mortgage on another is
// ordinary. Hiding a real record because its deal_type "should not" have one
// would be a worse lie than the empty block this rule exists to prevent.
//
// So: a record present is always shown. Absent is silent for the types that may
// legitimately have none, and NAMED for the two where one must exist in reality
// and its absence is therefore a gap in the record layer worth seeing.
export type ExistingMortgageDisposition = 'show' | 'silent' | 'gap'

/** Deal types where a previous mortgage must exist in the real world, so its
 *  absence from the record is a gap rather than a structural nil. */
const REPLACES_A_MORTGAGE = new Set(['renewal', 'refinance', 'switch'])

export function existingMortgageDisposition(
  dealType: string | null | undefined,
  existing: MortgageLike | null,
): ExistingMortgageDisposition {
  if (existing) return 'show'
  const t = (dealType ?? '').trim().toLowerCase()
  // Unknown type stays silent: we cannot claim a gap we cannot establish.
  return REPLACES_A_MORTGAGE.has(t) ? 'gap' : 'silent'
}

// ─── The subject property ───────────────────────────────────────────────────

export interface PropertyLike {
  id: string
  address_line1: string | null
  /** rec.properties carries the street TWO ways and both are live: 154 of 161
   *  rows fill address_line1, and 7 fill street_number + street_name instead
   *  (verified live). Reading only the first prints a bare "North Perth, ON"
   *  for a file that does have a street address, so both are read. */
  street_number: string | null
  street_name: string | null
  unit: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  occupancy: string | null
  property_type: string | null
  tenure: string | null
  annual_taxes: number | null
  condo_fees_monthly: number | null
}

export interface DealPropertyLink {
  deal_id: string
  property_id: string
  role: string | null
}

/** rec.deal_properties carries a role; 'subject' is the one a file page means
 *  by "the property". Falls back to the sole link when a role is absent. */
export function subjectProperty(
  deal: { id: string },
  links: readonly DealPropertyLink[],
  properties: readonly PropertyLike[],
): PropertyLike | null {
  const mine = links.filter(l => l.deal_id === deal.id)
  const subject = mine.find(l => l.role === 'subject') ?? (mine.length === 1 ? mine[0] : null)
  if (!subject) return null
  return properties.find(p => p.id === subject.property_id) ?? null
}

export function propertyAddress(p: PropertyLike | null): string | null {
  if (!p) return null
  const unit = fieldValue(p.unit)
  const composed = [fieldValue(p.street_number), fieldValue(p.street_name)]
    .filter(Boolean)
    .join(' ')
  const line = fieldValue(p.address_line1) ?? (composed || null)
  const city = fieldValue(p.city)
  const prov = fieldValue(p.province)
  const street = line ? `${unit ? `${unit}–` : ''}${line}` : null
  const parts = [street, city, prov].filter(Boolean)
  return parts.length > 0 ? parts.join(', ') : null
}

// ─── The four field groups ──────────────────────────────────────────────────
// Order and membership are Michael's, from the approved pattern. Each group is
// a band; the fields inside it read left to right.

export interface Field {
  label: string
  /** null renders as NOT_SPECIFIED — the page never prints a blank or a zero. */
  value: string | null
}

export interface FieldGroup {
  key: string
  fields: Field[]
}

export interface OverviewInput {
  deal: {
    id: string
    mortgage_amount: number | null
    purchase_price: number | null
    down_payment: number | null
    down_payment_not_applicable?: boolean | null
    lender_name_raw?: string | null
    closing_date: string | null
  }
  mortgage: MortgageLike | null
  property: PropertyLike | null
}

/** TWO FIELDS IN THE APPROVED SET HAVE NO HOME IN THE RECORD LAYER: "subject to
 *  financing" and "rate hold expiry". No column on rec.deals, rec.mortgages or
 *  rec.properties carries either (verified live against the schema, not
 *  assumed). They render NOT_SPECIFIED and are reported rather than dropped —
 *  removing them would hide a gap in the record layer that Michael should see. */
export function fieldGroups(input: OverviewInput): FieldGroup[] {
  const { deal, mortgage: m, property: p } = input
  const dpNotApplicable = deal.down_payment_not_applicable === true
  return [
    {
      key: 'money',
      fields: [
        { label: 'Amount', value: fmtMoneyExact(deal.mortgage_amount) },
        { label: 'Home price', value: fmtMoneyExact(deal.purchase_price) },
        {
          label: 'Down payment',
          // A refinance has no down payment, and the record layer says so with
          // its own flag. That is a different fact from "nobody recorded it".
          value: dpNotApplicable ? 'Not applicable' : fmtMoneyExact(deal.down_payment),
        },
        { label: 'Payment', value: fmtMoneyExact(m?.payment_amount ?? null) },
      ],
    },
    {
      key: 'terms',
      fields: [
        { label: 'Lender', value: fieldValue(m?.lender_name_raw ?? deal.lender_name_raw ?? null) },
        { label: 'Rate', value: fmtRate(m?.rate ?? null) },
        { label: 'Rate type', value: humanise(m?.rate_type ?? null) },
        { label: 'Term', value: formatMonths(m?.term_months ?? null) },
      ],
    },
    {
      key: 'structure',
      fields: [
        { label: 'Amortization', value: formatMonths(m?.amortization_months ?? null) },
        { label: 'Payment frequency', value: humanise(m?.payment_frequency ?? null) },
        { label: 'Payment type', value: humanise(m?.payment_type ?? null) },
        { label: 'Subject property', value: propertyAddress(p) },
      ],
    },
    {
      key: 'timing',
      fields: [
        { label: 'Closing date', value: fmtDateWords(deal.closing_date) },
        // No column anywhere in rec carries this yet.
        { label: 'Subject to financing', value: null },
        // Nor this.
        { label: 'Rate hold expiry', value: null },
        { label: 'Occupancy', value: humanise(p?.occupancy ?? null) },
      ],
    },
  ]
}

/** The fields the record layer cannot answer at all, named once so the page can
 *  say so and a future session knows what to add rather than rediscovering it. */
export const FIELDS_WITHOUT_A_COLUMN = ['Subject to financing', 'Rate hold expiry'] as const

// ─── The tabs ───────────────────────────────────────────────────────────────
// EIGHT TABS ON EVERY FILE, ALWAYS, IN THIS ORDER. It reads left to right as
// the file's life, so the row itself teaches the process to someone who has
// never run a deal. A tab is never hidden for having no data: a missing tab
// teaches nothing, and a row that changes shape file to file is its own
// confusion. Do not reorder.

export type TabKey =
  | 'overview'
  | 'client'
  | 'documents'
  | 'qualification'
  | 'submission'
  | 'commitment'
  | 'conditions'
  | 'compliance'

export interface TabDef {
  key: TabKey
  label: string
  /** What this tab is for, in words a broker who has never seen the file
   *  understands. Rendered as the empty state until the tab is built. */
  purpose: string
  /** Where that work happens today. Empty once the tab is built. */
  today: string
  /** Built tabs render their own content; the rest render TabEmpty. */
  built: boolean
}

export const FILE_TABS: readonly TabDef[] = [
  {
    key: 'overview',
    label: 'Overview',
    purpose: 'The file at a glance: who is on it, what it is for, and the mortgage as it stands.',
    today: '',
    built: true,
  },
  {
    key: 'client',
    label: 'Client',
    purpose:
      'The people on this file and how to reach them, with their own details rather than the deal’s.',
    today: '',
    built: true,
  },
  {
    key: 'documents',
    label: 'Documents',
    purpose:
      'Everything collected for this file, what is still outstanding, and what has been reviewed.',
    today: 'Until this tab is built, documents are on the Deals file page.',
    built: false,
  },
  {
    key: 'qualification',
    label: 'Qualification',
    purpose:
      'What this client can afford and on what assumptions — income, debts, and the stress-tested figure.',
    today: 'Until this tab is built, qualification is on the Deals file page.',
    built: false,
  },
  {
    key: 'submission',
    label: 'Submission',
    purpose:
      'What went to the lender: the target lender, the notes, and what the application said when it was sent.',
    today: 'Until this tab is built, submission is on the Deals file page.',
    built: false,
  },
  {
    key: 'commitment',
    label: 'Commitment',
    purpose:
      'The lender’s offer once it arrives, and the ten committed terms read off it for approval.',
    today: '',
    built: true,
  },
  {
    key: 'conditions',
    label: 'Conditions',
    purpose:
      'What the lender needs before this deal can fund, who owns each one, and what is still open.',
    today: '',
    built: true,
  },
  {
    key: 'compliance',
    label: 'Compliance',
    purpose:
      'What the file needs on record to stand up to a review, and what is missing from it today.',
    today: 'Until this tab is built, compliance is on the Deals file page.',
    built: false,
  },
]

// ─── Tab badges ─────────────────────────────────────────────────────────────
//
// A queued decision must be visible WITHOUT opening the tab it lives on. The
// deal room solves this by force-opening a section; a tab row's equivalent is a
// count on the tab itself, where it cannot be missed from any other tab.
//
// The mechanism is general so Documents, Qualification and the rest can carry
// one later. Only Conditions is wired in this session — a badge on a tab that
// does not yet compute its own count would be a number nobody can trust.

export interface TabBadge {
  count: number
  /** Amber matches the deal room's pending banner off the same upload. Lime is
   *  not spent here; tests/shell.test.ts enumerates every surface that may
   *  carry the decision token and this is not one. */
  tone: 'amber'
  /** Read aloud by screen readers, so the number is never bare. */
  label: string
}

export type TabBadges = Partial<Record<TabKey, TabBadge>>

export function buildTabBadges(input: { pendingConditions: number }): TabBadges {
  const badges: TabBadges = {}
  if (input.pendingConditions > 0) {
    badges.conditions = {
      count: input.pendingConditions,
      tone: 'amber',
      label: `${input.pendingConditions} condition${
        input.pendingConditions === 1 ? '' : 's'
      } awaiting your decision`,
    }
  }
  return badges
}

export function isTabKey(v: string | null | undefined): v is TabKey {
  return typeof v === 'string' && FILE_TABS.some(t => t.key === v)
}

/** Unknown or absent falls back to Overview rather than 404 — a stale link in
 *  a note should land somewhere useful. */
export function resolveTab(raw: string | null | undefined): TabKey {
  return isTabKey(raw) ? raw : 'overview'
}

// ─── Flags ──────────────────────────────────────────────────────────────────
// A flag exists to INTERRUPT, so it renders as a strip under the header and is
// visible from every tab — never as a tab of its own, which would hide it
// behind a click from the seven places it matters.
//
// There is NO flag table in the rec schema today (verified live: rec carries
// deals, deal_clients, deal_stages, phases, conditions, card_tags,
// milestone_types, deal_milestones, phase_returns, attract_sources, consents,
// clients, mortgages, properties, deal_properties, lenders — and no flags).
// The strip is built and renders nothing, rather than being omitted, so the
// day a flag mechanism lands there is a place for it to appear.

export interface FlagLike {
  id: string
  label: string
  severity?: string | null
}

export function flagsForDeal(_deal: DealLike, flags: readonly FlagLike[]): FlagLike[] {
  return flags.slice()
}
