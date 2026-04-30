/**
 * Lender Methodologies — hardcoded reference data for the prepayment penalty calculator.
 *
 * This file is the source of truth for lender-specific IRD calculation methodology.
 * Each record describes how a given lender calculates their prepayment penalty so the
 * /penalty calculator can apply the right formula without asking the user to know it.
 *
 * Future migration path: this data is also stored in Zoho Creator (app: bookkeeping,
 * form: Lender_Methodologies) and can be fetched via API once the ZOHO_CREATOR_*
 * OAuth credentials are configured. For now, hardcoded is the source of truth.
 *
 * When updating a lender's methodology:
 *   1. Update the record here
 *   2. Update the matching record in Zoho Creator to keep them in sync
 *   3. Commit and push
 */

export type IRDMethod = 'discounted' | 'standard' | 'hybrid'

export type ThreeMonthRateSource = 'posted' | 'contract' | 'current_prime_plus_adjustment'

export type ComparableTermMethod = 'round_down' | 'round_up' | 'average_3_4' | 'longest'

export type MethodologySource =
  | 'Verified from commitment letter'
  | 'Industry standard'
  | 'Estimated'

export interface Lender {
  name: string
  slug: string
  irdMethod: IRDMethod
  threeMonthRateSource: ThreeMonthRateSource
  comparableTermMethod: ComparableTermMethod
  cashbackClawback: boolean
  active: boolean
  methodologySource: MethodologySource
  notes: string
}

export const LENDERS: Lender[] = [
  {
    name: 'Royal Bank of Canada',
    slug: 'royal-bank-of-canada',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: true,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Big 5. Uses posted rate for 3-month interest. IRD uses discounted method with original posted rate at funding minus discount. Pro-rata cashback clawback if applicable.',
  },
  {
    name: 'TD Canada Trust',
    slug: 'td-canada-trust',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: true,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Big 5. Notoriously aggressive IRD calculations. TD specifically uses the posted rate at the time of funding for the IRD comparison which often produces higher penalties than RBC/BMO.',
  },
  {
    name: 'Bank of Montreal',
    slug: 'bank-of-montreal',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: true,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Big 5. Standard discounted IRD methodology. Cashback mortgages have pro-rata clawback.',
  },
  {
    name: 'Scotiabank',
    slug: 'scotiabank',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: true,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Big 5. Discounted IRD method. STEP product has same IRD calculation on the fixed-rate portion.',
  },
  {
    name: 'CIBC',
    slug: 'cibc',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: true,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Big 5. Discounted IRD method. Per Ownwell calculator code: uses posted rate (not contract rate) for 3-month interest.',
  },
  {
    name: 'National Bank',
    slug: 'national-bank',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'average_3_4',
    cashbackClawback: true,
    active: true,
    methodologySource: 'Verified from commitment letter',
    notes:
      'Big 5. Verified from Ownwell calculator code. Uses average of 3-year and 4-year posted rates for comparable term. Posted rate used for 3-month interest calculation.',
  },
  {
    name: 'HSBC Canada',
    slug: 'hsbc-canada',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: true,
    active: false,
    methodologySource: 'Industry standard',
    notes:
      'Acquired by RBC in 2024. Existing HSBC mortgages now serviced by RBC. Set Active=No unless servicing legacy file.',
  },
  {
    name: 'Equitable Bank',
    slug: 'equitable-bank',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Schedule I bank but uses Big-5-style discounted IRD on fixed rate products.',
  },
  {
    name: 'Tangerine',
    slug: 'tangerine',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Owned by Scotiabank but uses standard IRD method (contract rate vs comparable). Generally fair penalty calculations.',
  },
  {
    name: 'ATB Financial',
    slug: 'atb-financial',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Alberta-based. Standard IRD methodology. Generally one of the more borrower-friendly penalty calculations.',
  },
  {
    name: 'First National',
    slug: 'first-national',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Largest non-bank lender in Canada. Standard fair IRD method. No posted-rate trickery.',
  },
  {
    name: 'MCAP',
    slug: 'mcap',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Major monoline lender. Standard IRD methodology. Multiple sub-products (MCAP Eclipse etc.) all use same method.',
  },
  {
    name: 'RFA Mortgage Corporation',
    slug: 'rfa',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Monoline lender. Standard fair IRD calculation.',
  },
  {
    name: 'Strive Capital',
    slug: 'strive-capital',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Monoline. Fair IRD methodology.',
  },
  {
    name: 'Community Trust',
    slug: 'community-trust',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Alternative lender. Standard IRD method on prime products.',
  },
  {
    name: 'Home Trust',
    slug: 'home-trust',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Alternative/B lender. Standard IRD method on prime products. Different rules apply for Equityline products.',
  },
  {
    name: 'ICICI Bank Canada',
    slug: 'icici-bank-canada',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Estimated',
    notes:
      'Schedule II bank. Limited public documentation - assumed standard methodology.',
  },
  {
    name: 'Manulife Bank',
    slug: 'manulife-bank',
    irdMethod: 'hybrid',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Standard IRD on Select fixed mortgages. Manulife One uses different rules (HELOC-style). Verify product type before quoting.',
  },
  {
    name: 'B2B Bank',
    slug: 'b2b-bank',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Verified from commitment letter',
    notes:
      'Verified from Ownwell calculator code. Uses posted rate for 3-month interest like Big 5.',
  },
  {
    name: 'Lendwise Mortgages',
    slug: 'lendwise-mortgages',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Estimated',
    notes:
      'Smaller monoline. Assumed standard methodology - verify with commitment letter for any active file.',
  },
  {
    name: 'MCAN Home',
    slug: 'mcan-home',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Originally XMC. Standard fair IRD method.',
  },
  {
    name: 'Merix Financial',
    slug: 'merix-financial',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Monoline. Owned by Paradigm Quest. Standard IRD methodology.',
  },
  {
    name: 'RMG Mortgages',
    slug: 'rmg-mortgages',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Owned by MCAP. Standard fair IRD method.',
  },
  {
    name: 'CMLS Financial',
    slug: 'cmls-financial',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Major monoline. Standard fair IRD calculation.',
  },
  {
    name: 'Canada Life',
    slug: 'canada-life',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Estimated',
    notes:
      'Insurance-company-backed lender. Limited break activity - assumed standard methodology.',
  },
  {
    name: 'Industrial Alliance',
    slug: 'industrial-alliance',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Estimated',
    notes: 'Quebec-based insurance lender. Assumed standard methodology.',
  },
  {
    name: 'Desjardins',
    slug: 'desjardins',
    irdMethod: 'discounted',
    threeMonthRateSource: 'posted',
    comparableTermMethod: 'round_down',
    cashbackClawback: true,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Quebec credit union but operates more like a Schedule I bank. Uses discounted IRD method similar to Big 5.',
  },
  {
    name: 'Meridian Credit Union',
    slug: 'meridian-credit-union',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'Largest credit union in Ontario. Fair IRD method. Generally borrower-friendly penalty calculations.',
  },
  {
    name: 'DUCA Credit Union',
    slug: 'duca-credit-union',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Ontario credit union. Standard fair IRD method.',
  },
  {
    name: 'Alterna Savings',
    slug: 'alterna-savings',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Ontario credit union. Standard IRD methodology.',
  },
  {
    name: 'Coast Capital Savings',
    slug: 'coast-capital',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes:
      'BC credit union. Federally regulated. Standard fair IRD calculation.',
  },
  {
    name: 'Vancity',
    slug: 'vancity',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'BC credit union. Fair IRD methodology.',
  },
  {
    name: 'Servus Credit Union',
    slug: 'servus-credit-union',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Alberta\u2019s largest credit union. Standard IRD method.',
  },
  {
    name: 'Steinbach Credit Union',
    slug: 'steinbach-credit-union',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Industry standard',
    notes: 'Manitoba credit union. Standard IRD method.',
  },
  {
    name: 'Other',
    slug: 'other',
    irdMethod: 'standard',
    threeMonthRateSource: 'contract',
    comparableTermMethod: 'round_down',
    cashbackClawback: false,
    active: true,
    methodologySource: 'Estimated',
    notes:
      'Catch-all for lenders not in this list. Defaults to standard IRD methodology - manually verify with commitment letter.',
  },
]

/**
 * Returns all active lenders, sorted alphabetically by name, with the "Other" catch-all
 * always appearing last regardless of alphabetical position.
 */
export function getActiveLenders(): Lender[] {
  const active = LENDERS.filter((l) => l.active)
  const named = active.filter((l) => l.slug !== 'other')
  const other = active.filter((l) => l.slug === 'other')
  named.sort((a, b) => a.name.localeCompare(b.name))
  return [...named, ...other]
}

/**
 * Returns a single lender by slug, or null if not found or inactive.
 */
export function getLenderBySlug(slug: string): Lender | null {
  const lender = LENDERS.find((l) => l.slug === slug)
  if (!lender || !lender.active) return null
  return lender
}
