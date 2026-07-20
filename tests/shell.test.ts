// Command Centre shell (2026-07-14 redesign) — the acceptance proofs:
//   1. Route inventory: every admin route the router serves has a nav
//      ancestor (nothing fell off the map), and every nav href points at a
//      real page (no dead links). Group + item = at most two clicks.
//   2. Role scoping is presentation only: agent-only users lose Practice
//      and System from the NAV; the config still carries every item.
//   3. The Desk: pure fragment/badge builders, and the appears-renewed
//      pending walk both surfaces share.
//   4. The lime rule: the decision token appears in shell components only
//      in the enumerated decision roles; the legacy lime token appears in
//      none of them.
//   5. Notification lanes: the bell badge counts the Decide lane only.

import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  ADMIN_NAV,
  ASK_FOX,
  NAV_GROUP_LABELS,
  PORTAL_QUICK_LINKS,
  scopeNavForRoles,
} from '../config/admin-nav'
import {
  DESK_EMPTY_LINE,
  deskBadges,
  deskFragments,
  nextStepForStage,
  type DeskCounts,
} from '../lib/desk'
import { appearsRenewedPending, type RenewalDeal } from '../lib/renewals'
import {
  LANE_LABELS,
  NOTIFICATION_CATEGORIES,
  NOTIFICATION_LANES,
  laneFor,
} from '../lib/notifications'
import { PIPELINE_STAGE_ORDER } from '../config/pipeline'
import { appearsRenewedEvidenceKey } from '../lib/smm-match'
import type { SmmMortgage } from '../lib/smm'

// ─── 1. Route inventory: the "nothing removed" proof ────────────────────────

function walkPages(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) walkPages(p, out)
    else if (entry === 'page.tsx') out.push(p)
  }
  return out
}

function routeOf(pagePath: string): string {
  return pagePath
    .replace(/^app/, '')
    .replace(/\/page\.tsx$/, '')
    .replace(/\/\([^)]+\)/g, '') // route groups
}

describe('route inventory: every admin route stays on the map', () => {
  // Phase B1: the Deals LIST moved to Underwriting; B3: the merged pages
  // (Lenders, Beyond funding, Revenue?tab=bookkeeping) absorbed five more.
  // Old routes redirect permanently (next.config.js); SUBROUTES under a
  // redirected prefix (renewals/drip, opportunities/backfill,
  // knowledge/[slug]) stay live and count as covered through it.
  const REDIRECTED: Record<string, string> = {
    '/portal/admin/deals': '/portal/admin/underwriting',
    '/portal/admin/renewals': '/portal/admin/beyond',
    '/portal/admin/opportunities': '/portal/admin/beyond',
    '/portal/admin/rates': '/portal/admin/lenders',
    '/portal/admin/intel': '/portal/admin/lenders',
    '/portal/admin/knowledge': '/portal/admin/lenders',
  }
  const navHrefs = [
    ...ADMIN_NAV.map(i => i.href),
    ASK_FOX.href,
    ...PORTAL_QUICK_LINKS.map(l => l.href),
    ...Object.entries(REDIRECTED)
      .filter(([, target]) => ADMIN_NAV.some(i => i.href === target))
      .map(([source]) => source),
  ]

  it('every retired path redirects permanently in next.config.js', () => {
    const cfg = readFileSync('next.config.js', 'utf8')
    const pairs: [string, string][] = [
      ['/portal/admin/deals', '/portal/admin/underwriting'],
      ['/portal/admin/renewals', '/portal/admin/beyond?tab=renewals'],
      ['/portal/admin/opportunities', '/portal/admin/beyond?tab=opportunities'],
      ['/portal/admin/rates', '/portal/admin/lenders?tab=scenario'],
      ['/portal/admin/intel', '/portal/admin/lenders?tab=intel'],
      ['/portal/admin/knowledge', '/portal/admin/lenders?tab=knowledge'],
      ['/portal/bookkeeping', '/portal/admin/revenue?tab=bookkeeping'],
    ]
    for (const [source, destination] of pairs) {
      expect(cfg).toContain(`source: '${source}'`)
      expect(cfg).toContain(`destination: '${destination}'`)
    }
    expect(cfg).toContain('permanent: true')
  })

  it('every router page under /portal/admin has a nav ancestor', () => {
    const routes = walkPages('app/portal/admin').map(routeOf)
    expect(routes.length).toBeGreaterThanOrEqual(26)
    for (const route of routes) {
      const covered = navHrefs.some(h => route === h || route.startsWith(h + '/'))
      expect(covered, `route ${route} has no nav ancestor — it fell off the map`).toBe(true)
    }
  })

  it('every nav href resolves to a real page (no dead links)', () => {
    for (const href of [...ADMIN_NAV.map(i => i.href), ASK_FOX.href]) {
      const dir = join('app', href)
      const page = join(dir, 'page.tsx')
      let exists = false
      try {
        exists = statSync(page).isFile()
      } catch {
        exists = false
      }
      expect(exists, `nav item ${href} points at no page`).toBe(true)
    }
  })

  it('the B3 groups cover every nav item and carry labels', () => {
    const keys = Array.from(new Set(ADMIN_NAV.map(i => i.group)))
    expect(keys.sort()).toEqual(['book', 'practice', 'system', 'today'])
    for (const key of ['book', 'practice', 'system'] as const) {
      expect(NAV_GROUP_LABELS[key]).toBeTruthy()
    }
  })

  it('the working nav is eight destinations across two honest groups (B3)', () => {
    const working = ADMIN_NAV.filter(i => i.group !== 'system')
    expect(working.map(i => i.label)).toEqual([
      'Today',
      'Deals',
      'Approvals',
      'Beyond funding',
      'Lenders',
      'Revenue',
      'Partners',
      'Compliance',
    ])
    expect(ADMIN_NAV.some(i => i.href === '/portal/bookkeeping')).toBe(false)
  })

  it('Ask Fox is the footer, not a nav-list item', () => {
    expect(ADMIN_NAV.some(i => i.href === ASK_FOX.href)).toBe(false)
  })
})

// ─── 2. Role scoping: presentation only, never widening ─────────────────────

describe('agent-role nav scoping', () => {
  it('agent-only roles see Today, The book, and The practice groups only (B3)', () => {
    const scoped = scopeNavForRoles(ADMIN_NAV, ['agent'])
    expect(scoped.length).toBeGreaterThan(0)
    for (const item of scoped) {
      expect(['today', 'book', 'practice']).toContain(item.group)
    }
    // The can() filter narrows further at render; presentation scoping only
    // removes System. Agents keep their knowledge path (Lenders is keyed on
    // knowledge.view, which agents hold).
    expect(ADMIN_NAV.find(i => i.label === 'Lenders')?.permission).toBe('knowledge.view')
    expect(scoped.some(i => i.group === 'system')).toBe(false)
  })

  it('admin, ops, and mixed role sets are not scoped', () => {
    expect(scopeNavForRoles(ADMIN_NAV, ['admin'])).toEqual(ADMIN_NAV)
    expect(scopeNavForRoles(ADMIN_NAV, ['ops'])).toEqual(ADMIN_NAV)
    expect(scopeNavForRoles(ADMIN_NAV, ['agent', 'ops'])).toEqual(ADMIN_NAV)
  })

  it('scoping filters, never adds', () => {
    const subset = ADMIN_NAV.slice(0, 4)
    const scoped = scopeNavForRoles(subset, ['agent'])
    for (const item of scoped) expect(subset).toContain(item)
  })
})

// ─── 3. The Desk: fragments, badges, reconciliation ──────────────────────────

const ZERO: DeskCounts = {
  sheets: 0,
  statements: 0,
  offers: 0,
  flags: 0,
  shadow: 0,
  renewalsToConfirm: 0,
  reviewFiles: 0,
  manualMatches: null,
}

describe('desk fragments and badges', () => {
  it('builds the brief’s sentence shape with deep links, zeros omitted', () => {
    const f = deskFragments({
      ...ZERO,
      sheets: 3,
      renewalsToConfirm: 2,
      manualMatches: 1,
      reviewFiles: 15,
    })
    expect(f.map(x => x.label)).toEqual([
      '3 rate sheets to approve',
      '2 renewals to confirm',
      '1 manual match',
      '15 files in review',
    ])
    expect(f[0].href).toBe('/portal/admin/approvals?tab=sheets')
    expect(f[1].href).toBe('/portal/admin/beyond?tab=renewals')
    expect(f[3].href).toBe('/portal/admin/beyond?tab=opportunities')
  })

  it('singular labels read naturally', () => {
    const f = deskFragments({ ...ZERO, sheets: 1, statements: 1 })
    expect(f.map(x => x.label)).toEqual(['1 rate sheet to approve', '1 statement to review'])
  })

  it('an empty desk yields no fragments (the strip states the proud empty line)', () => {
    expect(deskFragments(ZERO)).toEqual([])
    expect(DESK_EMPTY_LINE).toBe('Nothing needs you right now.')
  })

  it('null sections (not permitted or unavailable) never render', () => {
    const f = deskFragments({
      sheets: null,
      statements: null,
      offers: null,
      flags: null,
      shadow: null,
      renewalsToConfirm: null,
      reviewFiles: null,
      manualMatches: null,
    })
    expect(f).toEqual([])
  })

  it('badges aggregate decision counts by nav href', () => {
    const b = deskBadges({
      ...ZERO,
      sheets: 2,
      statements: 1,
      offers: 3,
      flags: 1,
      shadow: 4,
      renewalsToConfirm: 2,
      reviewFiles: 5,
      manualMatches: 1,
    })
    expect(b['/portal/admin/approvals']).toBe(11)
    // B3: Beyond funding is one destination; its badge sums what the two
    // badges showed separately (2 renewals + 5 review + 1 manual match).
    expect(b['/portal/admin/beyond']).toBe(8)
  })

  it('zero-count queues produce no badge at all', () => {
    expect(deskBadges(ZERO)).toEqual({})
  })
})

describe('appears-renewed pending: the shared walk both surfaces run', () => {
  const deal = (over: Partial<RenewalDeal>): RenewalDeal => ({
    id: 'z1',
    dealName: 'TEST-F000001',
    contactName: 'Test Person',
    amount: 500_000,
    maturityDate: '2026-06-01',
    mortgageRate: 4.5,
    rateType: 'Fixed',
    termYears: 60,
    amortizationYears: null,
    paymentAmount: null,
    renewalStatus: null,
    renewalInProgress: false,
    renewalOptedOut: false,
    lenderName: 'Test Lender',
    closingDate: '2021-06-01',
    ...over,
  })
  // A feed row whose start date sits far past the closing date fires the
  // start_after_close signal (fixed-rate feed keeps the rate signal quiet).
  const mortgage = (name: string): SmmMortgage =>
    ({
      primary: {
        householdId: 'h1',
        borrowerName: name,
        lender: 'Test Lender',
        rate: 4.5,
        rateTypeRaw: 'Fixed',
        startDate: '2024-06-01',
        maturityDate: '2029-06-01',
      },
      coBorrowers: [],
    }) as unknown as SmmMortgage

  const idx = new Map<string, SmmMortgage | null>([['test person', mortgage('Test Person')]])

  it('flags a contradicted deal and counts it once', () => {
    const buckets = { action: { deals: [deal({})] }, lapsed: { deals: [] } }
    const flags = appearsRenewedPending(buckets, idx, new Map())
    expect(flags.length).toBe(1)
    expect(flags[0].from).toBe('action')
  })

  it('a persisted decline for the SAME evidence clears the flag', () => {
    const buckets = { action: { deals: [deal({})] }, lapsed: { deals: [] } }
    const first = appearsRenewedPending(buckets, idx, new Map())
    expect(first.length).toBe(1)
    const declined = new Map([['z1', appearsRenewedEvidenceKey(first[0].evidence)]])
    expect(appearsRenewedPending(buckets, idx, declined)).toEqual([])
    // A decline for DIFFERENT evidence does not clear it.
    expect(appearsRenewedPending(buckets, idx, new Map([['z1', 'other']])).length).toBe(1)
  })

  it('no export means no flags (never guessed)', () => {
    const buckets = { action: { deals: [deal({})] }, lapsed: { deals: [] } }
    expect(appearsRenewedPending(buckets, null, new Map())).toEqual([])
  })
})

// ─── 4. The lime rule: attention currency, audited EXHAUSTIVELY (B4) ─────────

// B4 made the audit total: it walks EVERY source file under the admin tree
// (app/portal/admin/** + components/admin/**). Legacy lime is extinct — zero
// `-lime` utility classes and zero raw lime hex anywhere — and the decision
// token renders ONLY in the eight enumerated decision surfaces, each in its
// documented role. A new decorative lime anywhere fails this suite.

function walkAdminSources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(tsx|ts)$/.test(entry)) out.push(p)
    }
  }
  walk('app/portal/admin')
  walk('components/admin')
  return out
}

// The allowed decision surfaces and the role each may render:
//   - AdminShell: nav group dots, item badges, the dark keyboard focus ring.
//   - DeskStrip: the Waiting-on-you fragment links.
//   - NotificationBell: the decision-count badge and the Decide-lane dot.
//   - Today (page.tsx): the decision cards' top border and link underline.
//   - ConditionsChecklist: the needs-input pill and the Verify tap.
//   - ApprovalsDesk: the armed queue decide buttons.
//   - AgentChat: the confirm-card execute tap.
//   - DealsList: the single-lime action button (list + phone card branches).
const DECISION_ALLOWED: Record<string, RegExp> = {
  'components/admin/AdminShell.tsx':
    /outline-decision|bg-decision\b|text-decision-ink/,
  'components/admin/DeskStrip.tsx':
    /decoration-decision|hover:text-decision|outline-decision/,
  'components/admin/NotificationBell.tsx': /bg-decision\b|text-decision-ink/,
  'app/portal/admin/page.tsx': /border-t-decision|decoration-decision/,
  'components/admin/ConditionsChecklist.tsx':
    /bg-decision\b|text-decision-ink|hover:bg-decision/,
  'components/admin/ApprovalsDesk.tsx': /bg-decision\b|text-decision-ink/,
  'components/admin/AgentChat.tsx': /bg-decision\b|text-decision-ink/,
  'components/admin/deals/DealsList.tsx':
    /bg-decision\b|border-decision|text-decision-ink/,
}

// One brand-mark exception: the Practice History export slide draws the Fox
// mark (navy squircle + lime F) and its masthead rule — a client-facing
// artifact's brand identity, like the PDFs' masthead, not UI attention. It
// may carry the brand HEX in SVG fills only, never a lime utility class.
const BRAND_HEX_ALLOWED = new Set(['components/admin/PracticeHistorySlide.tsx'])

// Lime AS A CLASS TOKEN (prose naming the rule is fine; classes render).
const LIME_CLASS =
  /(?:^|[\s'"`:${])(?:bg|text|border|decoration|outline|from|to|ring|fill|stroke)-lime\b/
// The whole brand-lime hex family (base, light, dark) plus the decision hex.
const LIME_HEX = /#95D600|#AAE620|#7AB800|#C6F53F/i

describe('lime is attention currency (the exhaustive B4 audit)', () => {
  const files = walkAdminSources()

  it('walks a real tree (sanity)', () => {
    expect(files.length).toBeGreaterThanOrEqual(80)
    expect(files).toContain('components/admin/AdminShell.tsx')
  })

  it('legacy lime classes are extinct across the entire admin tree', () => {
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const [i, line] of Array.from(src.split('\n').entries())) {
        expect(
          LIME_CLASS.test(line),
          `${file}:${i + 1} renders a legacy lime class: ${line.trim()}`,
        ).toBe(false)
        if (!BRAND_HEX_ALLOWED.has(file)) {
          expect(
            LIME_HEX.test(line),
            `${file}:${i + 1} carries a raw lime hex: ${line.trim()}`,
          ).toBe(false)
        }
      }
    }
  })

  it('the decision token appears only in the eight enumerated surfaces, only in their roles', () => {
    const DECISION_ANY = /(?:bg|text|border|decoration|outline|ring|border-t)-decision/
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      const lines = src.split('\n')
      for (const [i, line] of Array.from(lines.entries())) {
        if (!DECISION_ANY.test(line)) continue
        const allowed = DECISION_ALLOWED[file]
        expect(
          allowed !== undefined,
          `${file}:${i + 1} renders the decision token outside the enumerated surfaces: ${line.trim()}`,
        ).toBe(true)
        expect(
          allowed!.test(line),
          `${file}:${i + 1} uses the decision token outside its documented role: ${line.trim()}`,
        ).toBe(true)
      }
    }
  })

  it('active nav state is navy, never lime (calm machine)', () => {
    const src = readFileSync('components/admin/AdminShell.tsx', 'utf8')
    expect(src).toContain('bg-ink-navy3')
    expect(src.includes('active ? \'bg-decision')).toBe(false)
  })
})

// ─── 5. Notification lanes ───────────────────────────────────────────────────

describe('notification lanes: the badge counts decisions', () => {
  it('every category maps to a lane', () => {
    for (const c of NOTIFICATION_CATEGORIES) {
      expect(['decide', 'watch', 'log']).toContain(NOTIFICATION_LANES[c])
    }
  })

  it('the Decide lane is exactly the queues waiting on a decision', () => {
    const decide = NOTIFICATION_CATEGORIES.filter(c => NOTIFICATION_LANES[c] === 'decide')
    expect(decide.sort()).toEqual(['pending_offers', 'sheet_review'])
  })

  it('off-portal decisions are the Log lane; unknown categories fall to Watch', () => {
    expect(NOTIFICATION_LANES.gate_decision_external).toBe('log')
    expect(laneFor('some_future_category')).toBe('watch')
    expect(LANE_LABELS.decide).toBe('Decide')
  })
})

// ─── 6. Plain-words next step ────────────────────────────────────────────────

describe('nextStepForStage', () => {
  it('every funnel stage has a specific next step, unknown gets the honest generic', () => {
    for (const stage of PIPELINE_STAGE_ORDER) {
      expect(nextStepForStage(stage)).not.toBe('Review the file')
    }
    expect(nextStepForStage('Some Future Stage')).toBe('Review the file')
  })
})

// ─── 7. Shell mechanics: static presence checks ──────────────────────────────

describe('shell mechanics', () => {
  const shell = readFileSync('components/admin/AdminShell.tsx', 'utf8')

  it('rail state persists per user and honors reduced motion', () => {
    expect(shell).toContain('fox_rail_v1:')
    expect(shell).toContain('localStorage')
    expect(shell.includes('motion-safe:transition')).toBe(true)
  })

  it('keyboard focus rings exist on dark and light surfaces', () => {
    expect(shell).toContain('focus-visible:outline-decision')
    expect(shell).toContain('focus-visible:outline-ink-navy')
  })

  it('the desk poll feeds badges and the palette carries the Ask Fox hand-off', () => {
    expect(shell).toContain('/api/portal/admin/desk')
    const palette = readFileSync('components/admin/CommandPalette.tsx', 'utf8')
    expect(palette).toContain('askFoxHref')
    expect(palette).toContain('Ask Fox: ')
  })
})
