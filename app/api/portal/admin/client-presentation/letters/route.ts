// Pre-approval letter authoring (B8b Task 3). POST only, one route with an
// action. Purchase files only (the caller gates the control; the terms are
// validated here regardless). The snapshot is built SERVER-SIDE from validated
// terms + the verified session, then frozen; the client download reads the
// frozen snapshot and never composes anything.

import { NextResponse } from 'next/server'
import { apiPermission } from '@/lib/authz'
import { isDemoMode } from '@/lib/demo'
import { validateLetterInputs, buildLetterSnapshot } from '@/lib/client-presentation'
import { mintLetter, supersedeLetter } from '@/lib/client-presentation-store'
import { torontoTodayYMD } from '@/lib/dates'

export const dynamic = 'force-dynamic'

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

  if (action === 'retract') {
    const id = str(body.id)
    if (!id) return NextResponse.json({ ok: false, message: 'Which letter?' }, { status: 422 })
    return storeResponse(await supersedeLetter(id))
  }
  if (action !== 'mint') {
    return NextResponse.json({ ok: false, message: 'Unknown action.' }, { status: 400 })
  }

  const validated = validateLetterInputs(
    {
      maxPurchasePrice: typeof body.maxPurchasePrice === 'number' ? body.maxPurchasePrice : undefined,
      ratePct: typeof body.ratePct === 'number' ? body.ratePct : undefined,
      rateHoldExpiry: body.rateHoldExpiry,
      conditions: body.conditions,
    },
    torontoTodayYMD(),
  )
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, message: `This letter needs ${validated.missing.join(', ')}.` },
      { status: 422 },
    )
  }

  const fileRef = str(body.fileRef) || null
  const clientFirstName = str(body.clientFirstName) || null
  const snapshot = buildLetterSnapshot({
    inputs: validated.inputs,
    clientFirstName,
    fileRef,
    mintedBy: gate.user.email,
    mintedAt: new Date().toISOString(),
  })
  const res = await mintLetter({
    zohoDealId,
    fileRef,
    snapshot,
    rateHoldExpiry: validated.inputs.rateHoldExpiry,
    createdBy: gate.user.email,
  })
  return storeResponse(res)
}

function storeResponse(res: { configured: boolean; ok?: boolean; data?: unknown; error?: string }) {
  if (!res.configured)
    return NextResponse.json({ ok: false, message: 'The store is not configured.' }, { status: 503 })
  if (!res.ok) return NextResponse.json({ ok: false, message: res.error }, { status: 502 })
  return NextResponse.json({ ok: true, id: res.data ?? null })
}
