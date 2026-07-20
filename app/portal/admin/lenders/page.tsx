// Lenders — the lender book in one place, now a SINGLE tab row (2026-07-20
// consolidation): Scenario, Rates, Promos, Intel, Knowledge. The two stacked
// rows (outer rates|intel|knowledge and the inner scenario|lenders|promos|all)
// collapsed; the old inner Lenders and All quotes are the Rates tab's two views
// (?view=lenders|all). Every old URL redirects to its new home — nothing 404s.
// The page name is Lenders, so nothing inside it is also called Lenders (the
// old inner tab is now "By lender"). Each tab still runs its own
// requirePermission as defense in depth; tab state lives in ?tab so tabs are
// shareable. The rate book loads once through a short server cache
// (getRateQuotesFull), so scenario and select changes never re-read it.

import { redirect } from 'next/navigation'
import { can, getSessionUser } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getKnowledgeClaimQueue, getRateQuotesFull } from '@/lib/underwriting'
import {
  LENDERS_TAB_KEYS,
  isRateEngineTab,
  lendersTabPermission,
  resolveLendersTab,
  type LendersTab,
} from '@/lib/lenders-tabs'
import SummaryStrip, { type StripTile } from '@/components/admin/ds/SummaryStrip'
import TabBar from '@/components/admin/ds/TabBar'
import RatesEngine from '@/components/admin/lenders/RatesEngine'
import IntelTab from '@/components/admin/lenders/IntelTab'
import KnowledgeTab from '@/components/admin/lenders/KnowledgeTab'

export const dynamic = 'force-dynamic'

const TAB_LABELS: Record<LendersTab, string> = {
  scenario: 'Scenario',
  rates: 'Rates',
  promos: 'Promos',
  intel: 'Intel',
  knowledge: 'Knowledge',
}

export default async function LendersPage({
  searchParams,
}: {
  searchParams: { tab?: string; view?: string; lender?: string; kind?: string; from?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect('/portal/sign-in')

  // Legacy inner-tab values (lenders / all) canonicalize to the Rates tab's
  // views, preserving every other param — the redirect that keeps old bookmarks
  // and cross-links alive.
  const resolved = resolveLendersTab(searchParams.tab, searchParams.view)
  if (resolved.needsRedirect) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(searchParams)) {
      if (k !== 'tab' && k !== 'view' && typeof v === 'string') params.set(k, v)
    }
    params.set('tab', resolved.tab)
    params.set('view', resolved.view)
    redirect(`/portal/admin/lenders?${params.toString()}`)
  }

  // Per-tab access mirrors the merged pages' own permission keys exactly —
  // composition, never widening. A user lands on the first tab their
  // permissions cover (agents reach Knowledge here, as before).
  const allowed = LENDERS_TAB_KEYS.filter(k => can(user, lendersTabPermission(k)))
  if (allowed.length === 0) redirect('/portal')
  const active: LendersTab = allowed.includes(resolved.tab)
    ? resolved.tab
    : allowed.includes('scenario')
      ? 'scenario'
      : allowed[0]

  // The strip: from the sources the tabs already read. Approved book counts for
  // rates.view holders (the book is cached, so this shares the tab's read); the
  // pending-claims count for knowledge.view. (Lender data stays real in demo by
  // the Session 9 contract; the claims queue resolves from fixtures there.)
  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  const agentId = agentRes.configured && agentRes.ok ? agentRes.data : null
  const tiles: StripTile[] = []
  if (agentId) {
    const [quotesR, claimsR] = await Promise.all([
      can(user, 'rates.view') ? getRateQuotesFull(agentId) : Promise.resolve(null),
      can(user, 'knowledge.view') ? getKnowledgeClaimQueue(agentId) : Promise.resolve(null),
    ])
    if (quotesR && quotesR.configured && quotesR.ok) {
      const approved = quotesR.data.filter(q => q.status === 'approved')
      tiles.push({ key: 'quotes', label: 'approved quotes', value: String(approved.length) })
      tiles.push({
        key: 'lenders',
        label: 'lenders in the book',
        value: String(new Set(approved.map(q => q.lenderSlug)).size),
      })
    }
    if (claimsR && claimsR.configured && claimsR.ok) {
      tiles.push({
        key: 'claims',
        label: 'knowledge claims pending',
        value: String(claimsR.data.length),
        tone: claimsR.data.length > 0 ? 'caution' : undefined,
      })
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <h1 className="font-heading text-navy text-2xl font-bold tracking-tight">Lenders</h1>
        <p className="mt-1 font-ui text-[13px] text-cool-700">
          The lender book in one place: approved rates and scenarios, the intel feed, and the
          knowledge base.
        </p>
      </div>
      {tiles.length > 0 && <SummaryStrip tiles={tiles} />}
      <TabBar
        tabs={allowed.map(k => ({
          key: k,
          label: TAB_LABELS[k],
          href: `/portal/admin/lenders?tab=${k}`,
        }))}
        active={active}
      />
      {isRateEngineTab(active) && <RatesEngine tab={active} />}
      {active === 'intel' && (
        <IntelTab searchParams={{ lender: searchParams.lender, kind: searchParams.kind }} />
      )}
      {active === 'knowledge' && <KnowledgeTab />}
    </div>
  )
}
