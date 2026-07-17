// Lenders (B3) — the lender book in one place: the Rates engine, the Intel
// feed, and the Knowledge base as tabs over one summary strip. Every engine
// is REPARENTED unchanged (no fetcher, gate, or logic changes; each tab
// still runs its own requirePermission as defense in depth). Tab state
// lives in the `tab` query param so the redirected old paths land on the
// right tab and tabs are shareable.
//
// The rates engine's own inner tabs (scenario | lenders | promos | all) are
// pathname-relative and value-DISJOINT from this page's tabs, so an
// unrecognized tab value falls through to the Rates tab and the inner
// engine reads it — old deep links keep their inner state.

import { redirect } from 'next/navigation'
import { can, getSessionUser } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getKnowledgeClaimQueue, getRateQuotesFull } from '@/lib/underwriting'
import SummaryStrip, { type StripTile } from '@/components/admin/ds/SummaryStrip'
import TabBar from '@/components/admin/ds/TabBar'
import RatesTab from '@/components/admin/lenders/RatesTab'
import IntelTab from '@/components/admin/lenders/IntelTab'
import KnowledgeTab from '@/components/admin/lenders/KnowledgeTab'

export const dynamic = 'force-dynamic'

const TAB_KEYS = ['rates', 'intel', 'knowledge'] as const
type LendersTabKey = (typeof TAB_KEYS)[number]

const TAB_LABELS: Record<LendersTabKey, string> = {
  rates: 'Rates',
  intel: 'Intel',
  knowledge: 'Knowledge',
}

export default async function LendersPage({
  searchParams,
}: {
  searchParams: { tab?: string; lender?: string; kind?: string }
}) {
  const user = await getSessionUser()
  if (!user) redirect('/portal/sign-in')

  // Per-tab access mirrors the three merged pages' own permission keys
  // exactly — composition, never widening. A user lands on the first tab
  // their permissions cover (agents reach Knowledge here, as before).
  const allowed = TAB_KEYS.filter(k =>
    k === 'rates'
      ? can(user, 'rates.view')
      : k === 'intel'
        ? can(user, 'intel.view')
        : can(user, 'knowledge.view'),
  )
  if (allowed.length === 0) redirect('/portal')

  const requested = searchParams.tab
  const active: LendersTabKey =
    requested && (TAB_KEYS as readonly string[]).includes(requested)
      ? allowed.includes(requested as LendersTabKey)
        ? (requested as LendersTabKey)
        : allowed[0]
      : allowed.includes('rates')
        ? 'rates'
        : allowed[0]

  // The strip: from the sources the tabs already read. Approved book counts
  // for rates.view holders; the pending-claims count for knowledge.view.
  // (Lender data stays real in demo by the Session 9 contract; the claims
  // queue resolves from fixtures there.)
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
      {active === 'rates' && <RatesTab />}
      {active === 'intel' && (
        <IntelTab searchParams={{ lender: searchParams.lender, kind: searchParams.kind }} />
      )}
      {active === 'knowledge' && <KnowledgeTab />}
    </div>
  )
}
