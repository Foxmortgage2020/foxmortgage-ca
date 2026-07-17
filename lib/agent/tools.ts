// The Ask Fox tool surface: seven enumerated tools (six from the Agent
// session plus get_open_tasks from Session 7), each a thin wrapper over
// code this portal already trusts. The agent never composes SQL or
// arbitrary requests; every workbench read rides the portal_readonly
// role, every rate answer rides the same matching module the Rates page
// uses, and the ONLY writes are propose_* tools that mint confirm cards.
// No gate decisions, no send capability, nothing that executes without
// Michael's tap. This enumeration is architectural: a tool that is not
// here does not exist.
//
// Tool results are bounded and never carry unmasked identifiers beyond
// what the source systems store. Results log with the conversation as
// {name, input, ok, summary}.

import type Anthropic from '@anthropic-ai/sdk'
import {
  getDealAudit,
  getDealConditions,
  getDealDetail,
  getDealFlags,
  getDealIdByFileRef,
  getDealIncomeCalcs,
  getDealRatioCalcs,
  getDealShadowHistory,
  getKnowledgeClaims,
  getKnowledgeDocuments,
  getPendingQuoteTypeCounts,
  getRateQuotesFull,
  isPermissionRefusal,
  searchKnowledgePages,
  type KnowledgeClaimRow,
  type RateQuoteFullRow,
  type UwResult,
} from '@/lib/underwriting'
import { claimCitation } from '@/lib/knowledge-claims'
import {
  getKnowledgeLender,
  getKnowledgeLenders,
  getKnowledgeOffers,
  getRatesReference,
  type KnowledgeOffer,
} from '@/lib/gates'
import {
  DEFAULT_SCENARIO,
  PRODUCT_CLASSES,
  RATE_TYPES,
  fmtDiscount,
  lenderResults,
  mechanismForLender,
  mechanismPending,
  offerScenarioResult,
  quoteRateDisplay,
  scenarioExclusions,
  type OfferShape,
  type RatesReference,
  type Scenario,
} from '@/lib/scenario'
import {
  FIND_CLIENT_NOTE,
  getOpenTasksForRecord,
  getZohoDealsByContactId,
  searchZohoContacts,
  searchZohoDealsByWord,
  isAgentWritableModule,
} from '@/lib/zoho-admin'
import { createCard, type AgentCardRow } from '@/lib/agent/store'

// ─── Context threaded through a turn ────────────────────────────────────────

export interface AgentToolContext {
  /** Workbench agent row id (tenant scope), null when the workbench is
   * not connected. */
  workbenchAgentId: string | null
  /** Browser-minted gates token forwarded with the chat request; the
   * knowledge reads need it and degrade honestly without it. */
  gatesToken: string | null
  conversationId: string
  /** The seq the upcoming assistant message will hold; cards attach here. */
  turnSeq: number
  viewerEmail: string
  emitCard: (card: Pick<AgentCardRow, 'id' | 'kind' | 'payload' | 'reason' | 'status'>) => void
  // Per-turn memos so repeated rate or knowledge calls stay cheap.
  memo: {
    quotes?: RateQuoteFullRow[] | null
    reference?: RatesReference | null
    offers?: KnowledgeOffer[] | null
    lenderNames?: Record<string, string> | null
  }
}

export interface ToolExecution {
  /** JSON-serializable result handed back to the model. */
  result: Record<string, unknown>
  ok: boolean
  /** One line for the conversation log. */
  summary: string
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
const FILE_REF_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{3,16}$/i

// ─── Tool definitions (the enumerated surface) ──────────────────────────────

export const AGENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'find_client',
    description:
      'Search Zoho CRM for a client and their deals by name, email, phone, or a deal file reference (like IFMS-F001515). Returns matched contacts and deals with the brief fields (stage, rate, amounts, dates, renewal fields). Null fields are not captured in the CRM; report them as gaps, never fill them.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Client name, email, phone, or deal file reference.' },
        search_by: {
          type: 'string',
          enum: ['auto', 'name', 'email', 'phone', 'file_ref'],
          description: 'How to search. Default auto: file refs and emails are detected, everything else searches by name.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_deal_file',
    description:
      'Read the underwriting workbench file for a deal by file reference (like BRXM-F053724): snapshot, conditions, flags, income and ratio calcs with their provenance, shadow score history, and audit recency. Returns found:false when the client predates the workbench; that is normal, say so.',
    input_schema: {
      type: 'object',
      properties: {
        file_ref: { type: 'string', description: 'The workbench file reference.' },
      },
      required: ['file_ref'],
    },
  },
  {
    name: 'search_rates',
    description:
      'Run the portal rate engine over GATE-APPROVED quotes for a scenario. Returns per-lender best matches (with sheet dates, rate type, discounts and computed effective rates against the served prime), structured promo offers with conditions and expiry, the prime with its as-of, and pending-approval counts by rate type (counts only, never quotable). Quote only what this returns.',
    input_schema: {
      type: 'object',
      properties: {
        purpose: { type: 'string', enum: ['purchase', 'transfer', 'refinance', 'renewal'] },
        occupancy: { type: 'string', enum: ['owner_occupied', 'rental'] },
        product_class: { type: 'string', enum: [...PRODUCT_CLASSES] },
        term_months: { type: 'integer', description: 'Term in months (36 for 3 years). Omit for any term.' },
        rate_type: { type: 'string', enum: [...RATE_TYPES], description: 'Omit for all rate types.' },
        amount: { type: 'number', description: 'Mortgage amount in dollars, when known.' },
        property_value: { type: 'number', description: 'Property value in dollars, when known.' },
        amortization_years: { type: 'integer', enum: [25, 30] },
      },
      required: [],
    },
  },
  {
    name: 'knowledge_lookup',
    description:
      'Read the lender knowledge base: profile figures with as-of dates, the floating payment-mechanism note with its pending-confirmation caveat where flagged, plus APPROVED knowledge claims extracted from lender documents (each with document, page, and as-of citation). Pass a query to match claims; when no approved claim matches, the tool searches the underlying document text and returns UNREVIEWED snippets — always keep the two labels distinct and never present unreviewed text as approved fact. Pass slug "index" to list available lenders.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Lender knowledge slug (fn, scotia, mcap, td) or "index".' },
        query: {
          type: 'string',
          description:
            'Free-text terms to match against approved claims (and, failing that, the document text). Omit to list all approved claims.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'get_open_tasks',
    description:
      'Read the OPEN Zoho tasks linked to a deal or contact. Call this BEFORE proposing any card for a record: where an existing open task already covers the action, reference it in your reply with its due date instead of proposing a duplicate. Completed tasks never appear here.',
    input_schema: {
      type: 'object',
      properties: {
        module: {
          type: 'string',
          enum: ['Potentials', 'Contacts'],
          description: 'Where the record lives. Default Potentials (deals).',
        },
        record_id: { type: 'string', description: 'The Zoho record id.' },
      },
      required: ['record_id'],
    },
  },
  {
    name: 'propose_zoho_update',
    description:
      'Propose a Zoho CRM field update as a confirm card. NOTHING is written until Michael taps confirm; never claim the change happened. Use for record fixes a conversation justifies (Renewal_In_Progress, corrected dates). Scalar field values only.',
    input_schema: {
      type: 'object',
      properties: {
        module: { type: 'string', enum: ['Potentials', 'Contacts'] },
        record_id: { type: 'string', description: 'The Zoho record id.' },
        record_label: { type: 'string', description: 'Human label for the card (deal name or client name).' },
        fields: {
          type: 'object',
          description: 'Field API names to new values. Scalars only (string, number, boolean).',
        },
        reason: { type: 'string', description: 'One sentence: why this change, with its source.' },
      },
      required: ['module', 'record_id', 'record_label', 'fields', 'reason'],
    },
  },
  {
    name: 'propose_task',
    description:
      'Propose a Zoho task as a confirm card. NOTHING is created until Michael taps confirm. Use for every follow-up with an owner and date; link the deal where one applies.',
    input_schema: {
      type: 'object',
      properties: {
        subject: { type: 'string' },
        description: { type: 'string' },
        due_date: { type: 'string', description: 'YYYY-MM-DD.' },
        priority: { type: 'string', enum: ['High', 'Highest', 'Normal', 'Low'] },
        related_deal_id: { type: 'string', description: 'Zoho deal id to link, when known.' },
        related_deal_label: { type: 'string', description: 'Deal name for the card.' },
        reason: { type: 'string', description: 'One sentence: why this task.' },
      },
      required: ['subject', 'reason'],
    },
  },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

const s = (v: unknown, max = 300): string => String(v ?? '').slice(0, max)

function uwErr<T>(res: UwResult<T>): string {
  if (!res.configured) return 'workbench not connected'
  if (!res.ok) return isPermissionRefusal(res) ? 'not granted to the portal read-only role' : res.error
  return ''
}

async function memoQuotes(ctx: AgentToolContext): Promise<RateQuoteFullRow[] | null> {
  if (ctx.memo.quotes !== undefined) return ctx.memo.quotes
  if (!ctx.workbenchAgentId) {
    ctx.memo.quotes = null
    return null
  }
  const res = await getRateQuotesFull(ctx.workbenchAgentId)
  ctx.memo.quotes = res.configured && res.ok ? res.data : null
  return ctx.memo.quotes
}

async function memoReference(ctx: AgentToolContext): Promise<RatesReference | null> {
  if (ctx.memo.reference !== undefined) return ctx.memo.reference
  if (!ctx.gatesToken) {
    ctx.memo.reference = null
    return null
  }
  const res = await getRatesReference(ctx.gatesToken)
  ctx.memo.reference = res.ok ? (res.data as unknown as RatesReference) : null
  return ctx.memo.reference
}

async function memoOffers(ctx: AgentToolContext): Promise<KnowledgeOffer[] | null> {
  if (ctx.memo.offers !== undefined) return ctx.memo.offers
  if (!ctx.gatesToken) {
    ctx.memo.offers = null
    return null
  }
  const res = await getKnowledgeOffers(ctx.gatesToken)
  ctx.memo.offers = res.ok ? res.data.offers : null
  return ctx.memo.offers
}

async function memoLenderNames(ctx: AgentToolContext): Promise<Record<string, string>> {
  if (ctx.memo.lenderNames != null) return ctx.memo.lenderNames
  const out: Record<string, string> = {}
  if (ctx.gatesToken) {
    const res = await getKnowledgeLenders(ctx.gatesToken)
    if (res.ok) {
      for (const l of res.data.lenders as Array<{ slug: string; name: string; quote_slugs?: string[] }>) {
        out[l.slug] = l.name
        for (const qs of l.quote_slugs ?? []) out[qs] = l.name
      }
    }
  }
  ctx.memo.lenderNames = out
  return out
}

// ─── Executors ──────────────────────────────────────────────────────────────

async function runFindClient(input: any): Promise<ToolExecution> {
  const query = s(input?.query, 120).trim()
  if (query.length < 2) {
    return { ok: false, result: { error: 'query must be at least 2 characters' }, summary: 'rejected: short query' }
  }
  const mode = s(input?.search_by, 20) || 'auto'
  const looksEmail = /\S+@\S+\.\S+/.test(query)
  const looksPhone = /^[\d\s()+.-]{7,}$/.test(query)
  const looksFileRef = FILE_REF_RE.test(query)

  const contacts: Awaited<ReturnType<typeof searchZohoContacts>> = []
  let deals: Awaited<ReturnType<typeof searchZohoDealsByWord>> = []
  try {
    if (mode === 'file_ref' || (mode === 'auto' && looksFileRef)) {
      deals = await searchZohoDealsByWord(query)
    } else if (mode === 'email' || (mode === 'auto' && looksEmail)) {
      contacts.push(...(await searchZohoContacts(query, 'email')))
    } else if (mode === 'phone' || (mode === 'auto' && looksPhone)) {
      contacts.push(...(await searchZohoContacts(query, 'phone')))
    } else {
      contacts.push(...(await searchZohoContacts(query, 'word')))
      // Zoho word search matches whole tokens, so a short-form first name
      // ("Jo Wells") misses a contact stored under the full form ("Jordan
      // Wells"). Retry on the longest token
      // (usually the surname) before giving up.
      if (contacts.length === 0) {
        const tokens = query.split(/\s+/).filter(t => t.length >= 3)
        const longest = tokens.sort((a, b) => b.length - a.length)[0]
        if (longest && longest.toLowerCase() !== query.toLowerCase()) {
          contacts.push(...(await searchZohoContacts(longest, 'word')))
        }
      }
    }
    // Deals for the first few matched contacts.
    for (const c of contacts.slice(0, 3)) {
      const contactDeals = await getZohoDealsByContactId(c.id)
      deals.push(...contactDeals)
    }
  } catch (err) {
    return {
      ok: false,
      result: { error: 'Zoho search failed; the CRM read is unavailable right now.' },
      summary: `zoho search failed: ${err instanceof Error ? err.message.slice(0, 80) : 'error'}`,
    }
  }
  const dedup = new Map(deals.map(d => [d.id, d]))
  return {
    ok: true,
    result: {
      contacts: contacts.slice(0, 5),
      deals: Array.from(dedup.values()).slice(0, 10),
      note: FIND_CLIENT_NOTE,
    },
    summary: `${contacts.length} contact(s), ${dedup.size} deal(s) for "${query}"`,
  }
}

async function runGetDealFile(input: any, ctx: AgentToolContext): Promise<ToolExecution> {
  const fileRef = s(input?.file_ref, 40).trim()
  if (!ctx.workbenchAgentId) {
    return {
      ok: false,
      result: { found: false, error: 'workbench not connected' },
      summary: 'workbench not connected',
    }
  }
  const idRes = await getDealIdByFileRef(ctx.workbenchAgentId, fileRef)
  if (!idRes.configured || !idRes.ok) {
    return { ok: false, result: { found: false, error: uwErr(idRes) }, summary: `workbench read failed: ${uwErr(idRes)}` }
  }
  if (!idRes.data) {
    return {
      ok: true,
      result: {
        found: false,
        note: `No workbench file for ${fileRef}. Files predating the workbench (before July 2026) are normal; Zoho remains the record for them.`,
      },
      summary: `no workbench file for ${fileRef}`,
    }
  }
  const dealId = idRes.data
  const a = ctx.workbenchAgentId
  const [detailR, condsR, flagsR, incomeR, ratiosR, shadowR, auditR] = await Promise.all([
    getDealDetail(a, dealId),
    getDealConditions(a, dealId),
    getDealFlags(a, dealId),
    getDealIncomeCalcs(a, dealId),
    getDealRatioCalcs(a, dealId),
    getDealShadowHistory(a, dealId),
    getDealAudit(a, dealId, 3),
  ])
  const detail = detailR.configured && detailR.ok ? detailR.data : null
  const conds = condsR.configured && condsR.ok ? condsR.data : []
  const flags = flagsR.configured && flagsR.ok ? flagsR.data : []
  const income = incomeR.configured && incomeR.ok ? incomeR.data : null
  const ratios = ratiosR.configured && ratiosR.ok ? ratiosR.data : null
  const shadow = shadowR.configured && shadowR.ok ? shadowR.data : []
  const audit = auditR.configured && auditR.ok ? auditR.data : []
  return {
    ok: true,
    result: {
      found: true,
      snapshot: detail
        ? {
            file_ref: detail.fileRef,
            deal_type: detail.dealType,
            stage: detail.stage,
            status: detail.status,
            mortgage_amount: detail.mortgageAmount,
            purchase_price: detail.purchasePrice,
            closing_date: detail.closingDate,
            lender: detail.lender,
            product: detail.product,
            updated_at: detail.updatedAt,
          }
        : { error: uwErr(detailR) || 'snapshot unavailable' },
      conditions: conds.slice(0, 25).map(c => ({
        status: c.status,
        category: c.category,
        due: c.dueDate,
        precheck: c.precheckStatus,
        text: s(c.text, 160),
      })),
      open_flags: flags
        .filter(f => f.status === 'open')
        .slice(0, 10)
        .map(f => ({ severity: f.severity, kind: f.kind })),
      income_calcs: income
        ? income.slice(0, 5).map(c => ({
            annual: c.resultAnnual,
            basis: c.basis,
            lender: c.lenderSlug,
            provenance: `calc ${c.calcVersion}, inputs ${c.inputsHash.slice(0, 12)}`,
          }))
        : `not readable (${uwErr(incomeR)})`,
      ratio_calcs: ratios
        ? ratios.slice(0, 5).map(r => ({
            gds: r.gds,
            tds: r.tds,
            ltv: r.ltv,
            qual_rate: r.qualRate,
            lender: r.lenderSlug,
            provenance: `calc ${r.calcVersion}, inputs ${r.inputsHash.slice(0, 12)}`,
          }))
        : `not readable (${uwErr(ratiosR)})`,
      shadow_scores: shadow.slice(0, 6).map(x => ({
        dimension: x.dimension,
        agreement: x.agreement,
        at: x.scoredAt,
      })),
      last_audit_entries: audit.map(e => ({ action: e.action, at: e.createdAt })),
    },
    summary: `workbench file ${fileRef}: ${conds.length} conditions, ${flags.filter(f => f.status === 'open').length} open flags`,
  }
}

async function runSearchRates(input: any, ctx: AgentToolContext): Promise<ToolExecution> {
  const quotes = await memoQuotes(ctx)
  if (!quotes) {
    return {
      ok: false,
      result: { error: 'The approved quote book is not readable right now (workbench read failed).' },
      summary: 'quote book unavailable',
    }
  }
  const reference = await memoReference(ctx)
  const offers = await memoOffers(ctx)
  const names = await memoLenderNames(ctx)

  const scenario: Scenario = {
    ...DEFAULT_SCENARIO,
    purpose: (['purchase', 'transfer', 'refinance', 'renewal'] as const).find(p => p === input?.purpose) ?? 'renewal',
    occupancy: input?.occupancy === 'rental' ? 'rental' : 'owner_occupied',
    productClass: PRODUCT_CLASSES.find(c => c === input?.product_class) ?? 'conventional',
    termMonths: Number.isInteger(input?.term_months) && input.term_months > 0 ? input.term_months : null,
    rateType: RATE_TYPES.find(t => t === input?.rate_type) ?? null,
    cashback: 'any',
    amount: typeof input?.amount === 'number' && input.amount > 0 ? input.amount : null,
    propertyValue: typeof input?.property_value === 'number' && input.property_value > 0 ? input.property_value : null,
    amortizationYears: input?.amortization_years === 30 ? 30 : 25,
  }

  const results = lenderResults(quotes, scenario, reference)
  const exclusions = scenarioExclusions(quotes, scenario)
  const lenders = results.slice(0, 5).map(r => {
    const prov = r.matches[0]?.verdict?.province
    const provinceConfirmed = prov?.status === 'eligible'
    return {
    lender: names[r.lenderSlug] ?? r.lenderSlug,
    lender_slug: r.lenderSlug,
    matching_products: r.count,
    // Province status: the agent must never quote an unconfirmed lender to a
    // client. Structural-ineligible lenders are already excluded upstream.
    province_confirmed: provinceConfirmed,
    province_note: provinceConfirmed
      ? null
      : 'Provincial availability NOT confirmed for this lender — do not quote it to a client; say availability is being confirmed.',
    top_matches: r.matches.slice(0, 4).map(m => {
      const q = m.quote
      const d = quoteRateDisplay(q, reference)
      const rate =
        d.kind === 'fixed'
          ? `${d.rate.toFixed(2)}% fixed`
          : d.kind === 'floating-printed'
            ? `${d.discount !== null ? `${fmtDiscount(d.discount)}, ` : ''}${d.rate.toFixed(2)}% printed on the sheet (${q.rateType})`
            : d.kind === 'floating-computed'
              ? `${fmtDiscount(d.discount)}, effective ${d.effective.toFixed(2)}% at prime ${d.primeValue.toFixed(2)}% as of ${d.primeAsOf} (${q.rateType})`
              : d.kind === 'floating-no-prime'
                ? `${fmtDiscount(d.discount)} (${q.rateType}; prime reference unavailable, no effective rate)`
                : 'not priced'
      return {
        rate,
        rate_type: q.rateType,
        term_months: q.termMonths,
        product_class: q.productClass,
        variant: q.variant,
        cashback_pct: q.cashbackPct,
        sheet_date: q.asOfDate,
        assumed_notes: m.assumed,
      }
    }),
    }
  })

  // Structured offers that fit the scenario, with the countdown.
  const matchingOffers = (offers ?? [])
    .map(o => {
      const res = offerScenarioResult(o.offer as OfferShape, scenario)
      if (!res) return null
      return {
        lender: o.lender_name,
        rate: `${res.ratePct.toFixed(2)}% (${res.tierLabel} tier)`,
        description: s(res.description, 240),
        conditions: {
          required_product: res.requiredProduct,
          closing_within_days: res.closingWithinDays,
          application_window_start: res.applicationWindowStart,
        },
        started: res.started,
        expiry: o.expiry,
        days_left: o.days_left,
        provenance: 'lender announcement in the knowledge base, never a rate sheet',
      }
    })
    .filter(Boolean)

  let pendingCounts: Record<string, number> | null = null
  if (ctx.workbenchAgentId) {
    const p = await getPendingQuoteTypeCounts(ctx.workbenchAgentId)
    pendingCounts = p.configured && p.ok ? p.data : null
  }

  return {
    ok: true,
    result: {
      scenario_used: {
        purpose: scenario.purpose,
        occupancy: scenario.occupancy,
        product_class: scenario.productClass,
        term_months: scenario.termMonths,
        rate_type: scenario.rateType ?? 'any',
        amount: scenario.amount,
        amortization_years: scenario.amortizationYears,
        subject_province: scenario.subjectProvince,
      },
      // Eligibility exclusions applied (already removed from the matches above).
      // The agent surfaces these honestly and never quotes an excluded lender.
      excluded: {
        not_licensed_in_province: exclusions.provinceIneligible.map(x => `${x.slug} (${x.provinces})`),
        restricted_programs: exclusions.programRestricted.map(x => `${x.slug} (${x.requirements.join(', ')})`),
        channel_not_held: exclusions.channelUnavailable,
        transaction_ineligible: exclusions.transactionMismatch,
        province_unconfirmed: exclusions.provinceUnknown,
      },
      eligibility_note:
        'Kootenay and Coast Capital are BC credit unions, excluded from every Ontario scenario. Lenders whose province is unconfirmed appear with province_confirmed=false — mention them internally but never quote them to a client until confirmed.',
      prime: reference?.prime
        ? { value: reference.prime.value, as_of: reference.prime.as_of }
        : 'unavailable (floating quotes carry their discount only; no effective rates)',
      approved_matches_by_lender: lenders,
      matching_offers: matchingOffers,
      pending_approval_counts:
        pendingCounts && Object.keys(pendingCounts).length > 0
          ? { ...pendingCounts, note: 'counts only, never quotable; decisions happen on the Approvals desk' }
          : null,
      offers_note: 'Offers quote with their conditions and expiry attached.',
    },
    summary: `${lenders.length} lender(s), ${matchingOffers.length} offer(s), prime ${reference?.prime ? reference.prime.value : 'unavailable'}`,
  }
}

async function runKnowledgeLookup(input: any, ctx: AgentToolContext): Promise<ToolExecution> {
  const slug = s(input?.slug, 40).trim().toLowerCase()
  if (!ctx.gatesToken) {
    return {
      ok: false,
      result: { error: 'The knowledge base needs the session token this request did not carry; retry the message.' },
      summary: 'knowledge token missing',
    }
  }
  if (slug === 'index' || slug === '') {
    const res = await getKnowledgeLenders(ctx.gatesToken)
    if (!res.ok) {
      return { ok: false, result: { error: `knowledge index unavailable (${res.message})` }, summary: 'index failed' }
    }
    return {
      ok: true,
      result: { lenders: res.data.lenders },
      summary: `knowledge index: ${res.data.lenders.length} lenders`,
    }
  }
  const res = await getKnowledgeLender(slug, ctx.gatesToken)
  if (!res.ok) {
    return {
      ok: false,
      result: {
        error:
          res.kind === 'not-found'
            ? `No knowledge page for "${slug}". Pass "index" to list lenders; quote slugs like first-national may map to a knowledge slug like fn.`
            : `knowledge read unavailable (${res.message})`,
      },
      summary: `knowledge ${slug}: ${res.kind}`,
    }
  }
  const reference = await memoReference(ctx)
  const mech = mechanismForLender(reference, slug)
  const d = res.data

  // Approved knowledge claims first (the human-gated pipeline); when a
  // query matches none, fall back to searching the underlying document
  // text, rendered EXPLICITLY as unreviewed. The two labels never blend.
  const query = s(input?.query, 200).trim()
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length >= 3)
  let approvedKnowledge: string[] = []
  let unreviewedHits: string[] = []
  let approvedPenaltyClaims: string[] = []
  if (ctx.workbenchAgentId) {
    const [claimsR, docsR] = await Promise.all([
      getKnowledgeClaims(ctx.workbenchAgentId, slug),
      getKnowledgeDocuments(ctx.workbenchAgentId, slug),
    ])
    const claims = claimsR.configured && claimsR.ok ? claimsR.data : []
    const docNameById = new Map(
      (docsR.configured && docsR.ok ? docsR.data : []).map(doc => [doc.id, doc.docType]),
    )
    const approved = claims.filter(c => c.status === 'approved')
    const renderClaim = (c: KnowledgeClaimRow): string => {
      const docName = c.sourceDocumentId ? (docNameById.get(c.sourceDocumentId) ?? null) : null
      return `APPROVED KNOWLEDGE [${slug} ${c.claimKey}] ${c.claimText} (source: ${claimCitation(c, docName)})`
    }
    const matches =
      terms.length === 0
        ? approved
        : approved.filter(c =>
            terms.some(
              t =>
                c.claimText.toLowerCase().includes(t) ||
                c.claimKey.toLowerCase().includes(t) ||
                c.topic.toLowerCase().includes(t),
            ),
          )
    approvedKnowledge = matches.slice(0, 12).map(renderClaim)
    approvedPenaltyClaims = approved
      .filter(c => c.topic === 'penalty_methodology')
      .slice(0, 4)
      .map(renderClaim)
    if (query && matches.length === 0) {
      const pagesR = await searchKnowledgePages(ctx.workbenchAgentId, slug, query)
      if (pagesR.configured && pagesR.ok) {
        unreviewedHits = pagesR.data.map(h => {
          const docName = docNameById.get(h.documentId) ?? 'source document'
          return `FROM THE DOCUMENT (UNREVIEWED) [${docName} p.${h.pageNo}]: "${h.snippet}"`
        })
      }
    }
  }

  return {
    ok: true,
    result: {
      slug: d.slug,
      name: d.name,
      as_of: d.as_of,
      draft: d.draft,
      profile: d.profile
        ? JSON.parse(JSON.stringify(d.profile, null, 0).slice(0, 6000))
        : 'withheld by design; never invent figures for this lender',
      mechanism_note: mech
        ? {
            note: mech.note,
            rate_type: mech.rate_type,
            payment_behaviour: mech.payment_behaviour,
            as_of: mech.as_of,
            pending_confirmation: mechanismPending(mech),
          }
        : 'no lender-specific mechanism note; use the convention language with care',
      penalty_methodology:
        approvedPenaltyClaims.length > 0
          ? approvedPenaltyClaims
          : 'not documented in the knowledge base yet; Michael confirms with the lender',
      approved_knowledge: approvedKnowledge,
      document_search_unreviewed: unreviewedHits,
      knowledge_note:
        'APPROVED KNOWLEDGE lines are Michael-approved claims, citable with their document, page, and as-of. FROM THE DOCUMENT (UNREVIEWED) lines are raw source text nobody has approved — present them only as unreviewed document text, never as approved fact, and never blend the two without their labels.',
      markdown_excerpt: s(d.markdown, 2400),
    },
    summary: `knowledge ${slug} as of ${d.as_of ?? 'n/a'}: ${approvedKnowledge.length} approved claim(s), ${unreviewedHits.length} unreviewed hit(s)`,
  }
}

async function runGetOpenTasks(input: any): Promise<ToolExecution> {
  const module = input?.module === 'Contacts' ? 'Contacts' : 'Potentials'
  const recordId = s(input?.record_id, 30).trim()
  if (!/^\d{5,25}$/.test(recordId)) {
    return { ok: false, result: { error: 'record_id must be a Zoho record id' }, summary: 'rejected: record id' }
  }
  try {
    const tasks = await getOpenTasksForRecord(module, recordId)
    return {
      ok: true,
      result: {
        open_tasks: tasks.slice(0, 20).map(t => ({
          subject: t.subject,
          due_date: t.dueDate,
          priority: t.priority,
          status: t.status,
        })),
        note:
          tasks.length > 0
            ? 'Where one of these covers an action you were about to propose, reference it with its due date instead of minting a duplicate card.'
            : 'No open tasks on this record; propose cards for the actions the conversation justifies.',
      },
      summary: `${tasks.length} open task(s) on ${module} ${recordId}`,
    }
  } catch (err) {
    return {
      ok: false,
      result: { error: 'The Zoho tasks read failed; say so rather than assuming no tasks exist.' },
      summary: `tasks read failed: ${err instanceof Error ? err.message.slice(0, 80) : 'error'}`,
    }
  }
}

function scalarFields(input: unknown): Record<string, string | number | boolean> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const out: Record<string, string | number | boolean> = {}
  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.length === 0 || entries.length > 8) return null
  for (const [k, v] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9_]{0,50}$/.test(k)) return null
    if (typeof v === 'string') out[k] = v.slice(0, 500)
    else if (typeof v === 'number' && Number.isFinite(v)) out[k] = v
    else if (typeof v === 'boolean') out[k] = v
    else return null
  }
  return out
}

async function runProposeZohoUpdate(input: any, ctx: AgentToolContext): Promise<ToolExecution> {
  const module = s(input?.module, 20)
  const recordId = s(input?.record_id, 30).trim()
  const fields = scalarFields(input?.fields)
  const reason = s(input?.reason, 400).trim()
  if (!isAgentWritableModule(module)) {
    return { ok: false, result: { error: 'module must be Potentials or Contacts' }, summary: 'rejected: module' }
  }
  if (!/^\d{5,25}$/.test(recordId)) {
    return { ok: false, result: { error: 'record_id must be a Zoho record id' }, summary: 'rejected: record id' }
  }
  if (!fields) {
    return {
      ok: false,
      result: { error: 'fields must be 1 to 8 scalar values keyed by field API name' },
      summary: 'rejected: fields shape',
    }
  }
  if (reason.length < 8) {
    return { ok: false, result: { error: 'reason is required (one sourced sentence)' }, summary: 'rejected: reason' }
  }
  const payload = {
    module,
    record_id: recordId,
    record_label: s(input?.record_label, 120) || recordId,
    fields,
  }
  const created = await createCard({
    conversationId: ctx.conversationId,
    turnSeq: ctx.turnSeq,
    kind: 'zoho_update',
    payload,
    reason,
    actor: ctx.viewerEmail,
  })
  if (!created.configured || !created.ok) {
    return {
      ok: false,
      result: { error: 'The conversation store refused the card; nothing was proposed.' },
      summary: 'card store failed',
    }
  }
  ctx.emitCard({ id: created.data, kind: 'zoho_update', payload, reason, status: 'proposed' })
  return {
    ok: true,
    result: {
      card_id: created.data,
      status: 'proposed',
      note: 'Card rendered for Michael. Nothing executes until he taps confirm; refer to it as awaiting his confirm.',
    },
    summary: `card ${created.data.slice(0, 8)}: update ${module} ${payload.record_label}`,
  }
}

async function runProposeTask(input: any, ctx: AgentToolContext): Promise<ToolExecution> {
  const subject = s(input?.subject, 200).trim()
  const reason = s(input?.reason, 400).trim()
  if (subject.length < 4) {
    return { ok: false, result: { error: 'subject is required' }, summary: 'rejected: subject' }
  }
  if (reason.length < 8) {
    return { ok: false, result: { error: 'reason is required (one sourced sentence)' }, summary: 'rejected: reason' }
  }
  const dueDate = typeof input?.due_date === 'string' && YMD_RE.test(input.due_date) ? input.due_date : null
  const priority = (['High', 'Highest', 'Normal', 'Low'] as const).find(p => p === input?.priority) ?? null
  const relatedDealId =
    typeof input?.related_deal_id === 'string' && /^\d{5,25}$/.test(input.related_deal_id)
      ? input.related_deal_id
      : null
  const payload = {
    subject,
    description: s(input?.description, 2000) || null,
    due_date: dueDate,
    priority,
    related_deal_id: relatedDealId,
    related_deal_label: s(input?.related_deal_label, 120) || null,
  }
  const created = await createCard({
    conversationId: ctx.conversationId,
    turnSeq: ctx.turnSeq,
    kind: 'task_create',
    payload,
    reason,
    actor: ctx.viewerEmail,
  })
  if (!created.configured || !created.ok) {
    return {
      ok: false,
      result: { error: 'The conversation store refused the card; nothing was proposed.' },
      summary: 'card store failed',
    }
  }
  ctx.emitCard({ id: created.data, kind: 'task_create', payload, reason, status: 'proposed' })
  return {
    ok: true,
    result: {
      card_id: created.data,
      status: 'proposed',
      note: 'Card rendered for Michael. Nothing executes until he taps confirm.',
    },
    summary: `card ${created.data.slice(0, 8)}: task "${subject.slice(0, 60)}"`,
  }
}

export async function executeAgentTool(
  name: string,
  input: unknown,
  ctx: AgentToolContext,
): Promise<ToolExecution> {
  switch (name) {
    case 'find_client':
      return runFindClient(input)
    case 'get_deal_file':
      return runGetDealFile(input, ctx)
    case 'search_rates':
      return runSearchRates(input, ctx)
    case 'knowledge_lookup':
      return runKnowledgeLookup(input, ctx)
    case 'get_open_tasks':
      return runGetOpenTasks(input)
    case 'propose_zoho_update':
      return runProposeZohoUpdate(input, ctx)
    case 'propose_task':
      return runProposeTask(input, ctx)
    default:
      return { ok: false, result: { error: `unknown tool ${s(name, 40)}` }, summary: 'unknown tool' }
  }
}
