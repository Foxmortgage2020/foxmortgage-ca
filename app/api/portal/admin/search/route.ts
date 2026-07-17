// Global command-palette search (cmd-K). Answers fast or says degraded:
// each source is time-boxed so one slow upstream can never hang the whole
// response. Nav is NOT here — the client filters navigation locally for a
// zero-latency "Go to" section. Knowledge is NOT here either — it rides the
// browser-minted gates token, so the palette fetches it client-side.
//
// Gate: deals.view (every internal role). Deals + contacts ride that grant;
// partners require partners.provision and are simply omitted otherwise.

import { NextResponse } from 'next/server'
import { apiPermission, can } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getDealsSummary, type WorkbenchDeal } from '@/lib/underwriting'
import { getAllDealsSlim, searchZohoContacts, type SlimDeal } from '@/lib/zoho-admin'
import { listAllPartners } from '@/lib/zoho'
import { groupResults, normalizeQuery, rankDeals, type GroupInput, type SearchResult } from '@/lib/search'

export const dynamic = 'force-dynamic'

// Per-source time box: a source that overshoots is reported degraded rather
// than allowed to hold the response open.
const TIMEOUT_MS = 1200
const PER_GROUP = 8

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    p.then(
      v => {
        clearTimeout(t)
        resolve(v)
      },
      e => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

// Workbench is best-effort: not configured, no agent row, or a query failure
// all degrade to an empty list (the deals group still serves Zoho matches).
async function loadWorkbenchDeals(): Promise<WorkbenchDeal[]> {
  const idRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!idRes.configured || !idRes.ok) return []
  const dealsRes = await getDealsSummary(idRes.data)
  if (!dealsRes.configured || !dealsRes.ok) return []
  return dealsRes.data
}

async function buildDealsGroup(q: string): Promise<GroupInput> {
  // Zoho is the primary source; its failure degrades the group.
  let zoho: SlimDeal[]
  try {
    zoho = await withTimeout(getAllDealsSlim(), TIMEOUT_MS)
  } catch {
    return { type: 'deal', label: 'Deals', results: [], errored: true }
  }
  // Workbench enrichment is optional; never fails the group.
  let workbench: WorkbenchDeal[] = []
  try {
    workbench = await withTimeout(loadWorkbenchDeals(), TIMEOUT_MS)
  } catch {
    workbench = []
  }
  return { type: 'deal', label: 'Deals', results: rankDeals(workbench, zoho, q).slice(0, PER_GROUP) }
}

async function buildContactsGroup(q: string): Promise<GroupInput> {
  try {
    let contacts = await withTimeout(searchZohoContacts(q, 'word'), TIMEOUT_MS)
    // Zoho word search matches whole tokens, so a short-form first name
    // ("Jo Wells") misses a contact stored under the full form ("Jordan
    // Wells"). Retry on the longest token.
    if (contacts.length === 0) {
      const tokens = q.split(/\s+/).filter(t => t.length >= 3)
      const longest = tokens.sort((a, b) => b.length - a.length)[0]
      if (longest && longest !== q) {
        contacts = await withTimeout(searchZohoContacts(longest, 'word'), TIMEOUT_MS)
      }
    }
    const results: SearchResult[] = contacts.slice(0, PER_GROUP).map(c => ({
      type: 'contact',
      id: c.id,
      title: c.fullName,
      subtitle: c.email ?? c.phone ?? c.mobile ?? undefined,
      // Contacts have no admin deal room; deep-link into Zoho CRM instead.
      href: `https://crm.zoho.com/crm/tab/Contacts/${c.id}`,
    }))
    return { type: 'contact', label: 'Contacts', results }
  } catch {
    return { type: 'contact', label: 'Contacts', results: [], errored: true }
  }
}

async function buildPartnersGroup(q: string): Promise<GroupInput> {
  try {
    const partners = await withTimeout(listAllPartners(), TIMEOUT_MS)
    const results: SearchResult[] = partners
      .filter(p => {
        const hay = [p.name, p.email, p.city, p.province].filter(Boolean).join(' ').toLowerCase()
        return hay.includes(q)
      })
      .slice(0, PER_GROUP)
      .map(p => ({
        type: 'partner',
        id: p.id,
        title: p.name ?? '(unnamed partner)',
        subtitle: [p.partnerType, p.city].filter(Boolean).join(' · ') || undefined,
        href: `/portal/admin/partners/${p.id}`,
      }))
    return { type: 'partner', label: 'Partners', results }
  } catch {
    return { type: 'partner', label: 'Partners', results: [], errored: true }
  }
}

export async function GET(req: Request) {
  const started = Date.now()
  const gate = await apiPermission('deals.view')
  if (!gate.ok) {
    return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  }

  const q = normalizeQuery(new URL(req.url).searchParams.get('q') ?? '')
  if (!q) return NextResponse.json({ ok: true, groups: [] })

  const canPartners = can(gate.user, 'partners.provision')
  const [dealsGroup, contactsGroup, partnersGroup] = await Promise.all([
    buildDealsGroup(q),
    buildContactsGroup(q),
    canPartners ? buildPartnersGroup(q) : Promise.resolve<GroupInput | null>(null),
  ])

  const inputs: GroupInput[] = [dealsGroup, contactsGroup]
  if (partnersGroup) inputs.push(partnersGroup)
  const groups = groupResults(inputs)

  // Counts and duration only — never the query text or any record payload.
  console.log(
    `[search] groups=${groups.length} ms=${Date.now() - started} statuses=${groups
      .map(g => `${g.type}:${g.status}`)
      .join(',')}`,
  )
  return NextResponse.json({ ok: true, groups })
}
