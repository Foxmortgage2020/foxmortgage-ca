// POST /api/portal/admin/rates/pdf (Session 5; offers added the offers desk
// session). The client PDF for the compare tray. Download only; nothing here
// sends anywhere. The route re-fetches the pinned quotes server-side through
// the read-only role and pinned OFFERS through the approved-offers knowledge
// endpoint, recomputes every payment with the validated calculator core, and
// scrubs compensation out of every offer string; client figures are never
// trusted into a client-facing document. Filename is rates-comparison-[date].pdf,
// never carrying client PII (an optional file ref may appear in the body only).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import { getKnowledgeLenders, getKnowledgeOffers, getRatesReference } from '@/lib/gates'
import type { KnowledgeOffer } from '@/lib/gates'
import { scenarioFromParams, offerScenarioResult, scenarioVerdict, type OfferShape, type RatesReference } from '@/lib/scenario'
import { includedInClientDoc, resolveProvince, type ProvinceFact } from '@/lib/eligibility'
import { offerRatesText } from '@/lib/offers'
import { generateRatesPdf, ratesPdfFilename, type PdfLenderInfo, type PdfOfferInput } from '@/lib/rates-pdf'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const MAX_PINS = 3
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const OFFER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/
const FILE_REF_RE = /^[A-Z0-9-]{4,24}$/

export async function POST(req: Request) {
  const gate = await apiPermission('rates.view')
  if (!gate.ok) {
    return NextResponse.json({ error: gate.message }, { status: gate.status })
  }

  let body: { scenario?: Record<string, string>; pins?: string[]; from?: string } | null = null
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Send JSON with scenario and pins.' }, { status: 422 })
  }
  const rawPins = Array.isArray(body?.pins) ? body!.pins.filter((p): p is string => typeof p === 'string') : []
  const quotePins = rawPins.filter(p => UUID_RE.test(p))
  const offerPins = rawPins
    .filter(p => p.startsWith('o:'))
    .map(p => p.slice(2))
    .filter(id => OFFER_ID_RE.test(id))
  const totalPins = quotePins.length + offerPins.length
  if (totalPins === 0 || totalPins > MAX_PINS) {
    return NextResponse.json({ error: `Pin between 1 and ${MAX_PINS} products first.` }, { status: 422 })
  }
  const scenario = scenarioFromParams(body?.scenario ?? {})
  const sourceFileRef = typeof body?.from === 'string' && FILE_REF_RE.test(body.from) ? body.from : null

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured || !agentRes.ok) {
    return NextResponse.json({ error: 'Workbench not available.' }, { status: 503 })
  }

  const quotesRes = await getRateQuotesFull(agentRes.data)
  if (!quotesRes.configured || !quotesRes.ok) {
    return NextResponse.json({ error: 'Quotes not readable just now.' }, { status: 503 })
  }
  const approvedPins = quotePins
    .map(id => quotesRes.data.find(q => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q) && q!.status === 'approved')

  // Lender display names, the prime reference, and mechanism notes come live
  // from the knowledge endpoints through the browser-minted token the tray
  // forwards. Pinned offers come from the SAME token, from the approved-offers
  // endpoint only, so a pending offer can never reach a client document.
  let reference: RatesReference | null = null
  const offerInputs: PdfOfferInput[] = []
  let liveProvinces: Map<string, ProvinceFact> | null = null
  const withheld: string[] = []
  const token = req.headers.get('x-gates-token')
  const knLenders: { slug: string; name: string; as_of: string | null; quote_slugs?: string[]; provinces?: ProvinceFact['provinces']; provinces_source?: string | null; provinces_as_of?: string | null }[] = []
  if (token) {
    const [kn, refRes, offRes] = await Promise.all([
      getKnowledgeLenders(token),
      getRatesReference(token),
      offerPins.length > 0 ? getKnowledgeOffers(token) : Promise.resolve(null),
    ])
    if (kn.ok) {
      const lenders = (kn.data as { lenders?: typeof knLenders }).lenders ?? []
      knLenders.push(...lenders)
      // Live provinces override the server mirror for the client-doc gate.
      liveProvinces = new Map()
      for (const l of lenders) {
        if (l.provinces !== undefined) {
          liveProvinces.set(l.slug, {
            provinces: l.provinces,
            source: l.provinces_source ?? '',
            asOf: l.provinces_as_of ?? '',
          })
          for (const qs of l.quote_slugs ?? []) {
            liveProvinces.set(qs, { provinces: l.provinces, source: l.provinces_source ?? '', asOf: l.provinces_as_of ?? '' })
          }
        }
      }
    }
    if (refRes.ok && refRes.data && typeof refRes.data === 'object') {
      reference = refRes.data as unknown as RatesReference
    }
    if (offRes && offRes.ok) {
      const served = (offRes.data as { offers?: KnowledgeOffer[] }).offers ?? []
      for (const oid of offerPins) {
        const match = served.find(o => (o.offer as OfferShape).id === oid)
        if (!match) continue
        const shape = match.offer as OfferShape
        // Client-doc fail-closed rule, applied to OFFERS too (not just quotes):
        // an offer whose lender is not province-CONFIRMED eligible must never
        // reach a client document, and an offer the scenario rules out is not
        // included. Same posture as the quote pins above.
        const offerSlug = match.lender ?? ''
        if (resolveProvince(offerSlug, scenario.subjectProvince, liveProvinces).status !== 'eligible') {
          withheld.push(offerSlug || 'offer')
          continue
        }
        const scResult = offerScenarioResult(shape, scenario)
        if (!scResult) {
          // ruled_out or unpriceable for this scenario — not on a client doc.
          continue
        }
        offerInputs.push({
          lenderName: match.lender_name || match.lender,
          description: typeof shape.description === 'string' ? shape.description : 'Promotional offer',
          ratePct: scResult.ratePct,
          ratesText: offerRatesText(shape),
          conditions: Array.isArray(shape.predicates)
            ? (shape.predicates as unknown[]).filter((p): p is string => typeof p === 'string')
            : [],
          started: typeof shape.started === 'string' ? shape.started : null,
          expiry: (match.expiry as string | null) ?? null,
        })
      }
    }
  }

  // Client-doc fail-closed rule: a pinned quote reaches this client PDF only
  // when it is province-CONFIRMED eligible and not a restricted program
  // (includedInClientDoc). A province-unknown or restricted pin is withheld,
  // even though the tray shows it on screen. Live provinces (from the forwarded
  // token) override the server mirror; without a token the mirror applies.
  const pinned = approvedPins.filter(q => {
    const ok = includedInClientDoc(scenarioVerdict(q, scenario, { liveProvinces }))
    if (!ok) withheld.push(q.lenderSlug)
    return ok
  })
  const lenderInfo: Record<string, PdfLenderInfo | null> = {}
  for (const q of pinned) {
    const match = knLenders.find(l => l.slug === q.lenderSlug || l.quote_slugs?.includes(q.lenderSlug))
    lenderInfo[q.lenderSlug] = match ? { name: match.name, asOf: match.as_of ?? null } : null
  }

  if (pinned.length === 0 && offerInputs.length === 0) {
    return NextResponse.json(
      {
        error:
          withheld.length > 0
            ? 'The pinned products cannot go on a client document yet: their provincial availability is not confirmed, or they are restricted programs. Confirm availability, then regenerate.'
            : 'None of the pinned items are approved quotes or offers (a token is needed to include offers).',
      },
      { status: 422 },
    )
  }

  const generatedDate = torontoTodayYMD()
  const bytes = await generateRatesPdf({
    scenario,
    quotes: pinned,
    lenderInfo,
    offers: offerInputs,
    reference,
    generatedDate,
    sourceFileRef,
  })

  const filename = ratesPdfFilename(generatedDate)
  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-filename': filename,
      'cache-control': 'no-store',
    },
  })
}
