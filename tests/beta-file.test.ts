// The Deals (Beta) file page (handoff 42) — the rules, the tab contract, and
// THE REPLACEMENT WRITE GUARANTEE.
//
// The old guarantee was "the beta board is read-only", enforced by grepping the
// preview panel for buttons and forms. Writes are now approved on this surface,
// so that guarantee is replaced rather than dropped:
//
//     Nothing under deals-beta writes except through an existing gate proxy,
//     with a human actor.
//
// The suite below enforces that over the WHOLE deals-beta tree — the page, the
// route segment and every component — not just the preview panel. The preview's
// original grep stays alive in tests/phase-model.test.ts, because that panel
// stays read-only.

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  FILE_TABS,
  FIELDS_WITHOUT_A_COLUMN,
  NOT_SPECIFIED,
  buildTabBadges,
  existingMortgage,
  existingMortgageDisposition,
  fieldGroups,
  fieldValue,
  fmtDateWords,
  fmtMoneyExact,
  fmtRate,
  formatMonths,
  humanise,
  isTabKey,
  originatingMortgage,
  propertyAddress,
  resolveRoom,
  resolveTab,
  subjectProperty,
  type MortgageLike,
  type PropertyLike,
} from '@/lib/beta-file'

const ROOT = join(__dirname, '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/** Every source file on the beta surface — the page tree and the components. */
function betaFiles(): string[] {
  const out: string[] = []
  const walk = (rel: string) => {
    let entries: string[]
    try {
      entries = readdirSync(join(ROOT, rel))
    } catch {
      return
    }
    for (const e of entries) {
      const r = join(rel, e)
      if (statSync(join(ROOT, r)).isDirectory()) walk(r)
      else if (/\.tsx?$/.test(e)) out.push(r)
    }
  }
  walk('app/portal/admin/deals-beta')
  walk('components/admin/deals-beta')
  out.push('components/admin/DealsBetaBoard.tsx')
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
describe('THE WRITE GUARANTEE: only through a gate proxy, with a human actor', () => {
  const files = betaFiles()

  it('covers the whole surface, not one panel', () => {
    // If a future session adds a file here, it is audited automatically.
    expect(files.length).toBeGreaterThanOrEqual(7)
    expect(files).toContain('app/portal/admin/deals-beta/page.tsx')
    expect(files).toContain('app/portal/admin/deals-beta/[dealId]/page.tsx')
  })

  it('every fetch that mutates targets an EXISTING gate proxy', () => {
    for (const f of files) {
      const src = read(f)
      // Any POST/PATCH/PUT/DELETE target must live under the gates proxy tree.
      const targets = Array.from(src.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g), m => m[1])
      const methods = /method:\s*['"](POST|PATCH|PUT|DELETE)['"]/.test(src)
      if (methods) {
        expect(targets.length, `${f} mutates but names no target`).toBeGreaterThan(0)
        for (const t of targets) {
          expect(
            t.startsWith('/api/portal/admin/gates/'),
            `${f} writes to ${t}, which is not an existing gate proxy`,
          ).toBe(true)
        }
      }
    }
  })

  it('no direct database access and no service-role key anywhere on the surface', () => {
    for (const f of files) {
      const src = read(f)
      for (const forbidden of [
        'SERVICE_ROLE',
        'service_role',
        'Content-Profile', // the write-side twin of Accept-Profile
        'createClient(', // a Supabase client minted on the surface
        '.insert(',
        '.update(',
        '.upsert(',
        '.delete(',
        '.rpc(',
      ]) {
        expect(src, `${f} must not contain ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('reads still go through the read-only wrapper, never a bespoke client', () => {
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    expect(page).toContain("from '@/lib/underwriting'")
    expect(page).not.toContain('process.env.UW_SUPABASE')
  })

  // ── The guarantee follows the REUSE (handoff 45) ──────────────────────────
  // The scan above walks files under deals-beta. From handoff 45 this surface
  // also RENDERS components that live elsewhere (ConditionsChecklist,
  // CommitmentTermsCard, CommitmentUploader), so their write targets are now
  // part of what deals-beta writes. This extends the guarantee to cover them
  // rather than leaving a hole the directory walk cannot see.
  it('every component the beta renders from outside writes only to a KNOWN, EXISTING path', () => {
    const shared = [
      'components/admin/ConditionsChecklist.tsx',
      'components/admin/CommitmentTermsCard.tsx',
      'components/admin/CommitmentUploader.tsx',
    ]
    // A CLOSED list. Adding to it is a deliberate act with a reason, which is
    // the point — it must never become "any /api/portal/admin path".
    const ALLOWED = [
      '/api/portal/admin/gates/',
      // NOT under /gates/, and deliberately allowed: the commitment upload is a
      // pre-existing portal route gated on `commitment.upload` with a human
      // Clerk actor, shipped long before this surface existed. It satisfies the
      // guarantee's intent (existing, gated, human) while not matching its path
      // prefix. Recorded here rather than silently widened.
      '/api/portal/admin/commitments/',
    ]
    for (const f of shared) {
      const src = read(f)
      const targets = Array.from(src.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g), m => m[1])
      for (const t of targets) {
        expect(
          ALLOWED.some(a => t.startsWith(a)),
          `${f} writes to ${t}, which is not an existing gated path`,
        ).toBe(true)
      }
      // And none of them reaches a database directly.
      for (const forbidden of ['SERVICE_ROLE', 'Content-Profile', '.insert(', '.rpc(']) {
        expect(src, `${f} must not contain ${forbidden}`).not.toContain(forbidden)
      }
    }
  })

  it('the reused cards are NOT forked — the beta imports the deal room’s own', () => {
    const conds = read('components/admin/deals-beta/FileConditions.tsx')
    const commit = read('components/admin/deals-beta/FileCommitment.tsx')
    expect(conds).toContain("from '@/components/admin/ConditionsChecklist'")
    expect(commit).toContain("from '@/components/admin/CommitmentTermsCard'")
    expect(commit).toContain("from '@/components/admin/CommitmentUploader'")
    // No local reimplementation crept in alongside the import.
    expect(conds).not.toMatch(/<button/)
    expect(commit).not.toMatch(/<button/)
  })

  it('the Conditions tab reads public.conditions, never rec.conditions', () => {
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    // The gated public reads.
    expect(page).toContain('getApprovedConditions(agentId, roomId)')
    expect(page).toContain('getPendingCommitmentConditions(agentId, roomId)')
    // getRecConditions has no gate_status column to filter on (42703), so it
    // must never feed this tab.
    expect(page).not.toContain('getRecConditions')
  })

  it('the file page adds no authority key of its own', () => {
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    const keys = Array.from(page.matchAll(/requirePermission\('([a-z_.]+)'\)/g), m => m[1])
    expect(keys).toEqual(['deals.view'])
  })

  it('stage is read-only on this page — no transition control exists', () => {
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    const overview = read('components/admin/deals-beta/FileOverview.tsx')
    for (const src of [page, overview]) {
      for (const bad of ['<form', 'onSubmit', 'onClick', '<button', '<input', '<select', '<textarea']) {
        expect(src, `no ${bad} while stage stays read-only`).not.toContain(bad)
      }
    }
  })

  it('the decision controls ride the SAME authority keys the deal room uses', () => {
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    for (const key of [
      'approvals.conditions.decide',
      'conditions.decide',
      'conditions.recompute',
      'commitment.upload',
      'approvals.commitment_terms.decide',
    ]) {
      expect(page, `${key} must gate its control here as it does in the room`).toContain(`'${key}'`)
    }
    // ...and every one is additionally hidden in demo, exactly as the room does.
    const gated = page.match(/can\(user, '[a-z_.]+'\) && !isDemoMode\(\)/g) ?? []
    expect(gated.length).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('months as words', () => {
  it('months only below two years', () => {
    expect(formatMonths(1)).toBe('1 month')
    expect(formatMonths(11)).toBe('11 months')
    expect(formatMonths(18)).toBe('18 months')
    expect(formatMonths(23)).toBe('23 months')
  })

  it('years and months at or above two years', () => {
    expect(formatMonths(24)).toBe('2 years')
    expect(formatMonths(25)).toBe('2 years 1 month')
    expect(formatMonths(30)).toBe('2 years 6 months')
    expect(formatMonths(60)).toBe('5 years')
    expect(formatMonths(300)).toBe('25 years')
    expect(formatMonths(360)).toBe('30 years')
    expect(formatMonths(361)).toBe('30 years 1 month')
  })

  it('nothing usable reads as absent, never as zero', () => {
    expect(formatMonths(null)).toBeNull()
    expect(formatMonths(undefined)).toBeNull()
    expect(formatMonths(0)).toBeNull()
    expect(formatMonths(-6)).toBeNull()
    expect(formatMonths(NaN)).toBeNull()
  })
})

describe('the empty convention — never blank, never zero', () => {
  it('null, empty and zero all read as absent', () => {
    expect(fieldValue(null)).toBeNull()
    expect(fieldValue(undefined)).toBeNull()
    expect(fieldValue('')).toBeNull()
    expect(fieldValue('   ')).toBeNull()
    expect(fieldValue(0)).toBeNull()
    expect(fmtMoneyExact(0)).toBeNull()
    expect(fmtRate(0)).toBeNull()
  })

  it('a zero that genuinely means zero survives when asked for', () => {
    expect(fieldValue(0, { zeroIsReal: true })).toBe('0')
  })

  it('real values pass through', () => {
    expect(fmtMoneyExact(685400)).toBe('$685,400')
    expect(fmtRate(3.6)).toBe('3.6%')
    expect(humanise('primary_applicant')).toBe('Primary applicant')
    expect(humanise(null)).toBeNull()
  })

  it('a stored date reads as words with no timezone shift', () => {
    expect(fmtDateWords('2031-10-06')).toBe('6 October 2031')
    expect(fmtDateWords('2026-01-01')).toBe('1 January 2026')
    expect(fmtDateWords(null)).toBeNull()
    expect(fmtDateWords('not-a-date')).toBe('not-a-date')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('finding the workbench room', () => {
  const pub = [
    { id: 'w-1', file_ref: 'BRXM-F060561' },
    { id: 'w-2', file_ref: 'BRXM-F059751' },
    { id: 'w-3', file_ref: 'DUP' },
    { id: 'w-4', file_ref: 'DUP' },
  ]

  it('the direct key wins', () => {
    expect(resolveRoom({ id: 'r1', file_ref: 'BRXM-F060561', workbench_deal_id: 'w-1' }, pub)).toEqual({
      workbenchDealId: 'w-1',
      method: 'workbench_deal_id',
    })
  })

  it('falls back to an unambiguous file_ref', () => {
    expect(resolveRoom({ id: 'r2', file_ref: 'BRXM-F059751', workbench_deal_id: null }, pub)).toEqual({
      workbenchDealId: 'w-2',
      method: 'file_ref',
    })
  })

  it('REFUSES to guess when a file_ref is ambiguous', () => {
    // Two rooms share DUP. Picking one would put a client's documents on
    // another client's page — the worst failure this surface could have.
    expect(resolveRoom({ id: 'r3', file_ref: 'DUP', workbench_deal_id: null }, pub)).toBeNull()
  })

  it('no room is a fact about the file, not an error', () => {
    expect(resolveRoom({ id: 'r4', file_ref: 'IFMS-F000205', workbench_deal_id: null }, pub)).toBeNull()
    expect(resolveRoom({ id: 'r5', file_ref: null, workbench_deal_id: null }, pub)).toBeNull()
  })

  it('a stale workbench_deal_id pointing nowhere falls through to file_ref', () => {
    expect(resolveRoom({ id: 'r6', file_ref: 'BRXM-F060561', workbench_deal_id: 'gone' }, pub)).toEqual({
      workbenchDealId: 'w-1',
      method: 'file_ref',
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('which mortgage is THE mortgage', () => {
  const placing: MortgageLike = {
    id: 'm-new', originating_deal_id: 'd-1', lender_name_raw: 'UnionLink', product_name: null,
    rate: 3.6, rate_type: 'variable', term_months: 60, amortization_months: 240,
    payment_amount: 4010.35, payment_frequency: 'monthly', payment_type: null,
    maturity_on: '2031-10-06', property_id: 'p-1', status: 'active',
  }
  const replacing: MortgageLike = { ...placing, id: 'm-old', originating_deal_id: null, rate: 1.99, lender_name_raw: 'RMG' }

  it('the placed mortgage is the one pointing back at this deal', () => {
    expect(originatingMortgage({ id: 'd-1' }, [placing, replacing])?.id).toBe('m-new')
  })

  it('the replaced mortgage is named by the deal, and never stands in for the new one', () => {
    const deal = { id: 'd-1', existing_mortgage_id: 'm-old' }
    expect(existingMortgage(deal, [placing, replacing])?.id).toBe('m-old')
    // A renewal's OLD rate must never be read as this deal's rate.
    expect(originatingMortgage(deal, [placing, replacing])?.rate).toBe(3.6)
    expect(existingMortgage(deal, [placing, replacing])?.rate).toBe(1.99)
  })

  it('a file with neither reads as absent', () => {
    expect(originatingMortgage({ id: 'nope' }, [placing])).toBeNull()
    expect(existingMortgage({ existing_mortgage_id: null }, [placing])).toBeNull()
  })
})

describe('the subject property', () => {
  const props: PropertyLike[] = [
    {
      id: 'p-1', address_line1: '12 Marentette Ave', street_number: null, street_name: null,
      unit: null, city: 'Windsor', province: 'ON',
      postal_code: 'N8X 4G1', occupancy: 'owner_occupied', property_type: 'detached',
      tenure: 'freehold', annual_taxes: 4200, condo_fees_monthly: null,
    },
    {
      id: 'p-2', address_line1: '9 Other St', street_number: null, street_name: null,
      unit: '4', city: 'Guelph', province: 'ON',
      postal_code: null, occupancy: null, property_type: null, tenure: null,
      annual_taxes: null, condo_fees_monthly: null,
    },
  ]

  it('picks the link whose role is subject', () => {
    const links = [
      { deal_id: 'd', property_id: 'p-2', role: 'other' },
      { deal_id: 'd', property_id: 'p-1', role: 'subject' },
    ]
    expect(subjectProperty({ id: 'd' }, links, props)?.id).toBe('p-1')
  })

  it('falls back to a sole link when no role is recorded', () => {
    expect(subjectProperty({ id: 'd' }, [{ deal_id: 'd', property_id: 'p-2', role: null }], props)?.id).toBe('p-2')
  })

  it('refuses to pick among several unroled links', () => {
    const links = [
      { deal_id: 'd', property_id: 'p-1', role: null },
      { deal_id: 'd', property_id: 'p-2', role: null },
    ]
    expect(subjectProperty({ id: 'd' }, links, props)).toBeNull()
  })

  it('formats an address, unit included, and absent reads as absent', () => {
    expect(propertyAddress(props[0])).toBe('12 Marentette Ave, Windsor, ON')
    // A plain hyphen: the copy gate forbids en dashes in rendered text.
    expect(propertyAddress(props[1])).toBe('4-9 Other St, Guelph, ON')
    expect(propertyAddress(null)).toBeNull()
  })

  it('reads the OTHER street shape too — 7 of 161 rows fill street_number/name', () => {
    // Reading address_line1 alone printed a bare "North Perth, ON" for a file
    // that does carry a street address. Both shapes are live in rec.properties.
    const split: PropertyLike = {
      ...props[0], address_line1: null, street_number: '723', street_name: 'Elma street W',
      city: 'North Perth',
    }
    expect(propertyAddress(split)).toBe('723 Elma street W, North Perth, ON')
  })

  it('city and province alone still read, rather than collapsing to absent', () => {
    const cityOnly: PropertyLike = {
      ...props[0], address_line1: null, street_number: null, street_name: null, city: 'Guelph',
    }
    expect(propertyAddress(cityOnly)).toBe('Guelph, ON')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the four field groups', () => {
  const deal = {
    id: 'd-1', mortgage_amount: 685400, purchase_price: 800000, down_payment: 114600,
    down_payment_not_applicable: false, lender_name_raw: null, closing_date: '2026-10-06',
  }
  const m: MortgageLike = {
    id: 'm', originating_deal_id: 'd-1', lender_name_raw: 'UnionLink', product_name: null,
    rate: 3.6, rate_type: 'variable', term_months: 60, amortization_months: 240,
    payment_amount: 4010.35, payment_frequency: 'monthly', payment_type: 'principal_and_interest',
    maturity_on: '2031-10-06', property_id: 'p-1', status: 'active',
  }
  const p: PropertyLike = {
    id: 'p-1', address_line1: '12 Marentette Ave', street_number: null, street_name: null,
    unit: null, city: 'Windsor', province: 'ON',
    postal_code: null, occupancy: 'owner_occupied', property_type: null, tenure: null,
    annual_taxes: null, condo_fees_monthly: null,
  }

  it('renders the approved order, four groups of four', () => {
    const g = fieldGroups({ deal, mortgage: m, property: p })
    expect(g.map(x => x.key)).toEqual(['money', 'terms', 'structure', 'timing'])
    expect(g.flatMap(x => x.fields).map(f => f.label)).toEqual([
      'Amount', 'Home price', 'Down payment', 'Payment',
      'Lender', 'Rate', 'Rate type', 'Term',
      'Amortization', 'Payment frequency', 'Payment type', 'Subject property',
      'Closing date', 'Subject to financing', 'Rate hold expiry', 'Occupancy',
    ])
  })

  it('term and amortization read through formatMonths', () => {
    const g = fieldGroups({ deal, mortgage: m, property: p })
    const by = (l: string) => g.flatMap(x => x.fields).find(f => f.label === l)!.value
    expect(by('Term')).toBe('5 years')
    expect(by('Amortization')).toBe('20 years')
    expect(by('Rate')).toBe('3.6%')
    expect(by('Occupancy')).toBe('Owner occupied')
    expect(by('Subject property')).toBe('12 Marentette Ave, Windsor, ON')
  })

  it('a refinance says Not applicable, which is not the same as unrecorded', () => {
    const g = fieldGroups({
      deal: { ...deal, down_payment: null, down_payment_not_applicable: true },
      mortgage: m, property: p,
    })
    const dp = g[0].fields.find(f => f.label === 'Down payment')!
    expect(dp.value).toBe('Not applicable')
  })

  it('TWO APPROVED FIELDS HAVE NO COLUMN in the record layer, and are named not dropped', () => {
    const g = fieldGroups({ deal, mortgage: m, property: p })
    const labels = g.flatMap(x => x.fields).map(f => f.label)
    for (const missing of FIELDS_WITHOUT_A_COLUMN) {
      expect(labels, `${missing} must still render`).toContain(missing)
      expect(g.flatMap(x => x.fields).find(f => f.label === missing)!.value).toBeNull()
    }
  })

  it('with no mortgage attached, every mortgage field reads absent rather than zero', () => {
    const g = fieldGroups({ deal, mortgage: null, property: null })
    const vals = g.flatMap(x => x.fields)
    for (const l of ['Lender', 'Rate', 'Rate type', 'Term', 'Amortization', 'Payment', 'Payment frequency', 'Payment type', 'Subject property']) {
      expect(vals.find(f => f.label === l)!.value, `${l} must be null, not "0"`).toBeNull()
    }
    // The deal's own figures still render.
    expect(vals.find(f => f.label === 'Amount')!.value).toBe('$685,400')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
describe('the tab contract', () => {
  it('eight tabs, in the order the file lives, always', () => {
    expect(FILE_TABS.map(t => t.key)).toEqual([
      'overview', 'client', 'documents', 'qualification',
      'submission', 'commitment', 'conditions', 'compliance',
    ])
  })

  it('every tab names what it is for, and every UNBUILT one says where the work is today', () => {
    for (const t of FILE_TABS) {
      expect(t.purpose.length, `${t.key} needs a purpose`).toBeGreaterThan(30)
      if (t.built) {
        // A built tab renders its own content, so the hand-off copy would be a
        // lie — it must be cleared when the tab is wired.
        expect(t.today, `${t.key} is built and must not still point elsewhere`).toBe('')
      } else {
        expect(t.today, `${t.key} must say where the work happens today`).toMatch(/Deals file page/)
      }
    }
  })

  it('the four tabs built so far are exactly the ones wired on the page', () => {
    const built = FILE_TABS.filter(t => t.built).map(t => t.key)
    expect(built).toEqual(['overview', 'client', 'commitment', 'conditions'])
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    for (const c of ['FileOverview', 'FileClient', 'FileCommitment', 'FileConditions']) {
      expect(page, `${c} must be rendered`).toContain(`<${c}`)
    }
    // An unbuilt tab still falls through to the honest empty state.
    expect(page).toContain('{!tabDef.built && <TabEmpty')
  })
})

describe('the tab badge — a queued decision is visible without opening the tab', () => {
  it('no pending conditions means no badge at all', () => {
    // The state of the whole book today: zero pending conditions anywhere.
    expect(buildTabBadges({ pendingConditions: 0 })).toEqual({})
  })

  it('a pending set puts the count on the Conditions tab', () => {
    const b = buildTabBadges({ pendingConditions: 13 })
    expect(b.conditions).toEqual({
      count: 13,
      tone: 'amber',
      label: '13 conditions awaiting your decision',
    })
  })

  it('the singular reads correctly, because 1 conditions is how software sounds', () => {
    expect(buildTabBadges({ pendingConditions: 1 }).conditions?.label).toBe(
      '1 condition awaiting your decision',
    )
  })

  it('only Conditions is wired — a badge on a tab that computes no count would be untrustworthy', () => {
    const b = buildTabBadges({ pendingConditions: 5 })
    expect(Object.keys(b)).toEqual(['conditions'])
  })

  it('the tab row renders the badge with an accessible label, not a bare number', () => {
    const src = read('components/admin/deals-beta/FileTabs.tsx')
    expect(src).toContain('badges[t.key]')
    expect(src).toContain('aria-label={badge.label}')
    expect(src).toContain('{badge.count}')
    // Amber, matching the deal room's pending banner. Lime is not spent here.
    expect(src).toMatch(/bg-amber-100/)
    expect(src).not.toMatch(/bg-decision|text-decision-ink/)
  })
})

describe('the existing mortgage: presence first, type second', () => {
  const m = (over: Partial<MortgageLike> = {}): MortgageLike => ({
    id: 'm-old', originating_deal_id: null, lender_name_raw: 'Scotiabank', product_name: null,
    rate: 3.24, rate_type: 'fixed', term_months: 60, amortization_months: null,
    payment_amount: null, payment_frequency: null, payment_type: null,
    maturity_on: '2027-03-30', property_id: null, status: 'active', ...over,
  })

  it('a record that exists is ALWAYS shown, even on a purchase', () => {
    // BRXM-F053724 is a purchase carrying a real Scotiabank mortgage (verified
    // live). Hiding a real record by deal type would be the worse lie.
    expect(existingMortgageDisposition('purchase', m())).toBe('show')
    expect(existingMortgageDisposition('renewal', m())).toBe('show')
    expect(existingMortgageDisposition(null, m())).toBe('show')
  })

  it('absent on a purchase or preapproval is SILENT — absent, not empty', () => {
    expect(existingMortgageDisposition('purchase', null)).toBe('silent')
    expect(existingMortgageDisposition('preapproval', null)).toBe('silent')
  })

  it('absent on a renewal or refinance is a NAMED GAP — one must exist in reality', () => {
    expect(existingMortgageDisposition('renewal', null)).toBe('gap')
    expect(existingMortgageDisposition('refinance', null)).toBe('gap')
    expect(existingMortgageDisposition('switch', null)).toBe('gap')
  })

  it('an unknown deal type stays silent rather than claiming a gap it cannot establish', () => {
    // 18 rec deals carry a null deal_type.
    expect(existingMortgageDisposition(null, null)).toBe('silent')
    expect(existingMortgageDisposition('', null)).toBe('silent')
    expect(existingMortgageDisposition('something_new', null)).toBe('silent')
  })

  it('case and padding do not change the answer', () => {
    expect(existingMortgageDisposition('  Renewal ', null)).toBe('gap')
  })

  it('Overview labels BOTH mortgages explicitly, so neither can read as the other', () => {
    const src = read('components/admin/deals-beta/FileOverview.tsx')
    expect(src).toContain('This deal’s mortgage')
    expect(src).toContain('The client’s existing mortgage')
    // The block renders only on 'show', and the gap gets its own line.
    expect(src).toContain("disposition === 'show'")
    expect(src).toContain("disposition === 'gap'")
  })

  it('an unknown or absent tab lands on Overview rather than a 404', () => {
    expect(resolveTab(undefined)).toBe('overview')
    expect(resolveTab(null)).toBe('overview')
    expect(resolveTab('nonsense')).toBe('overview')
    expect(resolveTab('conditions')).toBe('conditions')
    expect(isTabKey('compliance')).toBe(true)
    expect(isTabKey('flags')).toBe(false)
  })

  it('the tab row renders every tab unconditionally — none is hidden for being empty', () => {
    const src = read('components/admin/deals-beta/FileTabs.tsx')
    expect(src).toContain('FILE_TABS.map')
    // No filtering by data presence anywhere in the row.
    expect(src).not.toMatch(/FILE_TABS\s*\.\s*filter/)
  })

  it('flags are a strip, never a tab', () => {
    expect(FILE_TABS.map(t => t.key)).not.toContain('flags')
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    expect(page).toContain('FileFlagStrip')
  })
})

describe('the file page states absence honestly', () => {
  it('the empty state links to the deal room only when one exists', () => {
    const src = read('components/admin/deals-beta/TabEmpty.tsx')
    expect(src).toContain('roomHref ?')
    expect(src).toMatch(/no Deals file page/i)
  })

  it('the Overview prints NOT_SPECIFIED for an absent field', () => {
    const src = read('components/admin/deals-beta/FileOverview.tsx')
    expect(src).toContain('NOT_SPECIFIED')
    expect(NOT_SPECIFIED).toBe('Not specified')
  })

  it('no projection green on a file page — one file is an actual, not a forecast', () => {
    const overview = read('components/admin/deals-beta/FileOverview.tsx')
    const page = read('app/portal/admin/deals-beta/[dealId]/page.tsx')
    for (const src of [overview, page]) {
      expect(src).not.toContain('PROJECTION_GREEN')
      expect(src).not.toContain('ProjectionFigure')
    }
  })
})
