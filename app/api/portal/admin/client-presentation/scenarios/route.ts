// Client scenario authoring (B8b Task 1). POST only, one route with an action.
// House order: gate → demo refusal → validate → act. Figures are computed
// SERVER-SIDE through the mortgage engine (buildScenarioSnapshot); the client
// never sends a figure, so a published figure can never be anything but what
// the engine produced for the inputs Michael typed.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { buildScenarioSnapshot } from '@/lib/client-presentation'
import { upsertScenario, setScenarioPublished, deleteScenario } from '@/lib/client-presentation-store'

export const dynamic = 'force-dynamic'

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : NaN)
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function POST(req: Request) {
  const gate = await apiPermission('client.presentation.manage')
  if (!gate.ok) return NextResponse.json({ ok: false, message: gate.message }, { status: gate.status })
  if (isDemoMode())
    return NextResponse.json({ ok: false, message: 'Demo mode is read-only.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, message: 'Malformed request.' }, { status: 400 })
  }

  const action = str(body.action)
  const zohoDealId = str(body.zohoDealId)
  if (!/^\S+$/.test(zohoDealId)) {
    return NextResponse.json({ ok: false, message: 'A valid deal is required.' }, { status: 422 })
  }
  const id = typeof body.id === 'string' && body.id.trim() ? body.id.trim() : null

  if (action === 'upsert') {
    const label = str(body.label)
    const built = buildScenarioSnapshot(label, {
      mortgageAmount: num(body.mortgageAmount),
      ratePct: num(body.ratePct),
      amortizationYears: num(body.amortizationYears),
    })
    if (!built.ok) {
      return NextResponse.json(
        { ok: false, message: `This scenario needs ${built.missing.join(', ')}.` },
        { status: 422 },
      )
    }
    const s = built.snapshot
    const res = await upsertScenario({
      id,
      zohoDealId,
      fileRef: str(body.fileRef) || null,
      label: s.label,
      inputs: s.inputs,
      figures: s.figures,
      inputsHash: s.inputsHash,
      calcVersion: s.calcVersion,
      createdBy: gate.user.email,
    })
    return storeResponse(res)
  }

  if (action === 'publish') {
    if (!id) return NextResponse.json({ ok: false, message: 'Which scenario?' }, { status: 422 })
    const res = await setScenarioPublished(id, body.published === true)
    return storeResponse(res)
  }

  if (action === 'delete') {
    if (!id) return NextResponse.json({ ok: false, message: 'Which scenario?' }, { status: 422 })
    const res = await deleteScenario(id)
    return storeResponse(res)
  }

  return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 })
}

function storeResponse(res: { configured: boolean; ok?: boolean; data?: unknown; error?: string }) {
  if (!res.configured)
    return NextResponse.json({ ok: false, message: 'The store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, id: res.data ?? null })
}
