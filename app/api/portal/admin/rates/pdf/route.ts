// POST /api/portal/admin/rates/pdf (Session 5): the client PDF for the
// compare tray. Download only; nothing here sends anywhere. The route
// re-fetches the pinned quotes server-side through the read-only role and
// recomputes every payment with the validated calculator core; client
// figures are never trusted into a client-facing document. Filename is
// rates-comparison-[date].pdf, never carrying client PII (an optional file
// ref may appear in the body only).

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { WORKBENCH_AGENT_EMAIL } from '@/config/targets'
import { getAgentIdByEmail, getRateQuotesFull } from '@/lib/underwriting'
import { getKnowledgeLenders } from '@/lib/gates'
import { scenarioFromParams } from '@/lib/scenario'
import { generateRatesPdf, ratesPdfFilename, type PdfLenderInfo } from '@/lib/rates-pdf'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

const MAX_PINS = 3
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
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
  const pins = Array.isArray(body?.pins) ? body!.pins.filter(p => typeof p === 'string' && UUID_RE.test(p)) : []
  if (pins.length === 0 || pins.length > MAX_PINS) {
    return NextResponse.json({ error: `Pin between 1 and ${MAX_PINS} products first.` }, { status: 422 })
  }
  const scenario = scenarioFromParams(body?.scenario ?? {})
  const sourceFileRef =
    typeof body?.from === 'string' && FILE_REF_RE.test(body.from) ? body.from : null

  const agentRes = await getAgentIdByEmail(WORKBENCH_AGENT_EMAIL)
  if (!agentRes.configured || !agentRes.ok) {
    return NextResponse.json({ error: 'Workbench not available.' }, { status: 503 })
  }

  const quotesRes = await getRateQuotesFull(agentRes.data)
  if (!quotesRes.configured || !quotesRes.ok) {
    return NextResponse.json({ error: 'Quotes not readable just now.' }, { status: 503 })
  }
  const pinned = pins
    .map(id => quotesRes.data.find(q => q.id === id))
    .filter((q): q is NonNullable<typeof q> => Boolean(q) && q!.status === 'approved')
  if (pinned.length === 0) {
    return NextResponse.json({ error: 'None of the pinned products are approved quotes.' }, { status: 422 })
  }

  // Lender display names and profile as-of dates come live from the
  // knowledge index through the browser-minted token the tray forwards
  // (same posture as every knowledge proxy). Exact slug match or a
  // published quote_slugs alias only; the portal never invents a mapping.
  // Token absent or refused: quote slugs render as stored, the honest
  // fallback.
  const lenderInfo: Record<string, PdfLenderInfo | null> = {}
  for (const q of pinned) lenderInfo[q.lenderSlug] = null
  const token = req.headers.get('x-gates-token')
  if (token) {
    const kn = await getKnowledgeLenders(token)
    if (kn.ok) {
      const lenders = (kn.data as { lenders?: { slug: string; name: string; as_of: string | null; quote_slugs?: string[] }[] }).lenders ?? []
      for (const q of pinned) {
        const match = lenders.find(l => l.slug === q.lenderSlug || l.quote_slugs?.includes(q.lenderSlug))
        if (match) lenderInfo[q.lenderSlug] = { name: match.name, asOf: match.as_of ?? null }
      }
    }
  }

  const generatedDate = torontoTodayYMD()
  const bytes = await generateRatesPdf({
    scenario,
    quotes: pinned,
    lenderInfo,
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
